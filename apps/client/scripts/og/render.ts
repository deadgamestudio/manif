// The link preview image (1200 × 630), public/og/og.png, that seo/meta.ts
// points at, and the home screen icon, public/apple-touch-icon.png (180 × 180,
// drawn from public/favicon.svg).
//
// The preview is drawn by the game itself: this starts the game server and
// the client (Vite dev), opens a few players in headless Chromium, creates a
// lobby, has the others join it by its invite link, starts the march, walks
// the cortège down the street towards the first CRS shield line, then hides
// the HUD, lays the MANIF banner over the bottom left corner and takes a
// screenshot from the host's page.
//
//   bun run og:render            both images
//   bun run og:render -- og      only og.png
//   bun run og:render -- icon    only apple-touch-icon.png
//
// Math.random is seeded in the pages and they run with reduced motion, so the
// client side draws the same way each run. The server's bots are not seeded,
// so two runs differ a little: look at the result before committing it.
// The PNG is then shrunk to 256 colours with Pillow (`python3` with PIL) to
// stay under 200 KB. Ports 2567 (game server) and 5690 (Vite) must be free.

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { chromium, type Browser, type Page } from "playwright";
import { IMAGE_HEIGHT, IMAGE_WIDTH } from "../../seo/meta.ts";

const CLIENT = join(import.meta.dir, "../..");
const ROOT = join(CLIENT, "../..");
const OUT = join(CLIENT, "public");
const SERVER_PORT = 2567;
const PORT = 5690;
const BASE = `http://localhost:${PORT}`;
const MAX_BYTES = 200 * 1024;
const ICON_SIZE = 180;
/** The full-colour screenshots, before compression: outside public/, which Vite watches. */
const RAW = mkdtempSync(join(tmpdir(), "manif-og-"));
const rawFor = (file: string) => join(RAW, basename(file));

/** The cortège: the host first (the camera follows them), then the friends who join by the invite link. */
const NAMES = ["Jojo la Banderole", "Mimi Mégaphone", "Dédé Merguez", "Lulu Pavé", "Nanard"];

/** The friends' head start, then how long the cortège walks down the street before the shot, in ms. */
const HEAD_START_MS = 600;
const WALK_MS = 4500;
/**
 * The shot is taken at 1.2× pixel ratio: the page is 1000 × 525 CSS pixels,
 * so the camera's fixed zoom frames the cortège a bit closer, drawn sharp at 1200 × 630.
 */
const SCALE = 1.2;

// WebGL in headless Chromium: the real GPU through Metal on a Mac, SwiftShader (CPU) elsewhere.
const GL_ARGS =
  process.platform === "darwin"
    ? ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist"]
    : ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"];

const args = process.argv.slice(2);
for (const a of args) if (a !== "og" && a !== "icon") throw new Error(`unknown image: ${a} (og or icon)`);
const wantOg = args.length === 0 || args.includes("og");
const wantIcon = args.length === 0 || args.includes("icon");

if (spawnSync("python3", ["-c", "import PIL"]).status !== 0) {
  throw new Error("Pillow is needed to compress the PNGs: python3 -m pip install Pillow");
}

// --- Processes -------------------------------------------------------------------

const children: ChildProcess[] = [];
/** Stops the server and Vite with everything they started (bunx -> tsx -> node): each leads its own process group. */
const stopAll = () => {
  for (const c of children.splice(0)) {
    try {
      if (c.pid) process.kill(-c.pid, "SIGTERM");
    } catch {
      // Already gone.
    }
  }
};
process.on("exit", stopAll);
process.on("SIGINT", () => process.exit(130));

async function waitFor(url: string, what: string) {
  for (let i = 0; i < 160; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // Not up yet.
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`${what} didn't start on ${url}`);
}

async function portFree(port: number) {
  try {
    await fetch(`http://localhost:${port}/`);
    return false;
  } catch {
    return true;
  }
}

async function startGame() {
  for (const port of [SERVER_PORT, PORT]) {
    if (!(await portFree(port))) throw new Error(`port ${port} is busy: stop the dev server first`);
  }
  // The server and the client import @manif/shared's compiled dist.
  if (!existsSync(join(ROOT, "packages/shared/dist/index.js"))) {
    const r = spawnSync("bun", ["run", "build"], { cwd: join(ROOT, "packages/shared"), stdio: "inherit" });
    if (r.status !== 0) throw new Error("building @manif/shared failed");
  }
  children.push(
    spawn("bunx", ["tsx", "src/app/index.ts"], {
      cwd: join(ROOT, "apps/server"),
      env: { ...process.env, PORT: String(SERVER_PORT) },
      stdio: ["ignore", "ignore", "inherit"],
      detached: true,
    }),
    spawn("bunx", ["vite", "--port", String(PORT), "--strictPort"], {
      cwd: CLIENT,
      stdio: ["ignore", "ignore", "inherit"],
      detached: true,
    }),
  );
  await waitFor(`http://localhost:${SERVER_PORT}/health`, "The game server");
  await waitFor(BASE, "Vite");
}

// --- Pages -----------------------------------------------------------------------

/** A seeded Math.random (mulberry32), installed before the page's own scripts. */
function seedRandom(seed: number) {
  let s = seed >>> 0;
  Math.random = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One player: its own browser context (its own saved name), seeded, reduced motion. */
async function player(browser: Browser, name: string, seed: number, size: { width: number; height: number }, scale = 1) {
  const context = await browser.newContext({ viewport: size, deviceScaleFactor: scale, reducedMotion: "reduce" });
  const page = await context.newPage();
  page.on("pageerror", (e) => console.error(`${name}: page error:`, e.message));
  await page.addInitScript(seedRandom, seed);
  await page.addInitScript((n) => localStorage.setItem("manif.name", n), name);
  return page;
}

/** A few frames drawn, so the screenshot is a finished frame. */
const settle = (page: Page, frames = 30) =>
  page.evaluate(
    (n) =>
      new Promise<void>((r) => {
        let i = 0;
        const tick = () => (++i >= n ? r() : requestAnimationFrame(tick));
        requestAnimationFrame(tick);
      }),
    frames,
  );

/**
 * The banner over the scene, as the homepage draws it: MANIF in Anton, paint
 * red on a tilted cloth held by two poles, the slogan in Permanent Marker.
 * Bottom left, where the camera shows the near facades: the cortège and the
 * shield line stay in view. CSS pixels: the shot is SCALE times bigger.
 */
function overlay() {
  const layer = document.createElement("div");
  layer.id = "og";
  layer.innerHTML = `
    <style>
      .hud, .gas-overlay { display: none !important; }
      #og { position: fixed; inset: 0; z-index: 99; pointer-events: none;
        background: radial-gradient(ellipse at 0% 100%, rgba(22,22,22,0.55) 0%, rgba(22,22,22,0) 55%); }
      #og .flag { position: absolute; left: 34px; bottom: 30px; width: 400px;
        padding: 8px 22px 12px; background: #f6f1e4; text-align: center; transform: rotate(-3deg);
        border-radius: 6px 14px 8px 18px / 18px 8px 14px 6px; box-shadow: 0 8px 0 -2px rgba(0,0,0,0.45); }
      #og .flag::before, #og .flag::after { content: ""; position: absolute; top: -12px; width: 8px; height: calc(100% + 44px);
        background: linear-gradient(90deg, #7a5530, #a7794a 50%, #7a5530); border-radius: 4px; z-index: -1; }
      #og .flag::before { left: 8px; }
      #og .flag::after { right: 8px; }
      #og h1 { margin: 0; font: 400 104px/0.95 "Anton", Impact, sans-serif; letter-spacing: 0.02em;
        text-transform: uppercase; color: #d42a20; text-shadow: 4px 4px 0 #161616; }
      #og p { margin: 2px 0 0; font: 400 24px/1.15 "Permanent Marker", cursive; color: #161616; }
    </style>
    <div class="flag"><h1>Manif</h1><p>On lâche rien. Sauf les pavés.</p></div>`;
  document.body.append(layer);
  return document.fonts
    .load('400 100px "Anton"')
    .then(() => document.fonts.load('400 24px "Permanent Marker"'))
    .then(() => document.fonts.ready);
}

/** 256 colours, dithered, max zlib (Pillow): a 3D frame's ~1 MB down to well under 200 KB. */
function compress(raw: string, file: string) {
  const py = [
    "import sys",
    "from PIL import Image",
    "im = Image.open(sys.argv[1]).convert('RGB')",
    "im.quantize(256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.FLOYDSTEINBERG).save(sys.argv[2], optimize=True)",
  ].join("\n");
  const r = spawnSync("python3", ["-c", py, raw, file]);
  if (r.status !== 0) throw new Error(`Pillow failed: ${r.stderr}`);
  const size = statSync(file).size;
  console.log(`${file.replace(`${CLIENT}/`, "")}: ${Math.round(size / 1024)} KB`);
  if (size > MAX_BYTES) console.warn(`  over ${MAX_BYTES / 1024} KB`);
}

async function ogShot(browser: Browser) {
  await startGame();
  const shot = { width: IMAGE_WIDTH / SCALE, height: IMAGE_HEIGHT / SCALE };
  const host = await player(browser, NAMES[0]!, 1, shot, SCALE);
  await host.goto(`${BASE}/`);
  await host.getByRole("button", { name: "Créer une manif" }).click();
  const code = (await host.locator(".lobby-code").textContent({ timeout: 20_000 }))?.replace("#", "").trim();
  if (!code) throw new Error("no lobby code");

  // The friends open the invite link: with a saved name, they go straight in.
  const friends: Page[] = [];
  for (const [i, name] of NAMES.slice(1).entries()) {
    const page = await player(browser, name, i + 2, { width: 480, height: 270 });
    await page.goto(`${BASE}/?lobby=${code}`);
    friends.push(page);
  }
  await host.locator(".roster li").nth(NAMES.length - 1).waitFor({ timeout: 20_000 });
  await host.getByRole("button", { name: "C'est parti, on marche !" }).click();
  for (const page of [host, ...friends]) await page.locator("canvas").waitFor({ timeout: 30_000 });
  await settle(host, 60);

  // March: the Préfecture is at -Z, which is screen up + right (W + D).
  // The friends set off first, so the host (whom the camera follows) walks at
  // the back of the cortège and the shot shows it heading for the shield line.
  const walkers = [...friends, host];
  for (const page of friends) {
    await page.keyboard.down("KeyW");
    await page.keyboard.down("KeyD");
  }
  await new Promise((r) => setTimeout(r, HEAD_START_MS));
  await host.keyboard.down("KeyW");
  await host.keyboard.down("KeyD");
  await new Promise((r) => setTimeout(r, WALK_MS));
  for (const page of walkers) {
    await page.keyboard.up("KeyW");
    await page.keyboard.up("KeyD");
  }
  // Swing at whatever is near, for a bit of action.
  for (const page of friends) await page.keyboard.press("Space");
  await settle(host, 40);

  await host.evaluate(overlay);
  await settle(host);
  const file = join(OUT, "og", "og.png");
  await host.screenshot({ path: rawFor(file), type: "png" });
  compress(rawFor(file), file);
  stopAll();
}

/** The home screen icon: favicon.svg, drawn at 180 × 180 on its yellow (iOS rounds the corners itself). */
async function iconShot(browser: Browser) {
  const page = await browser.newPage({ viewport: { width: ICON_SIZE, height: ICON_SIZE }, deviceScaleFactor: 1 });
  const svg = readFileSync(join(OUT, "favicon.svg"), "utf8");
  await page.setContent(
    `<style>html,body{margin:0;background:#ffd400}img{display:block;width:${ICON_SIZE}px;height:${ICON_SIZE}px}</style>` +
      `<img src="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}">`,
  );
  await page.locator("img").evaluate((img: HTMLImageElement) => img.decode());
  const file = join(OUT, "apple-touch-icon.png");
  await page.screenshot({ path: rawFor(file), type: "png" });
  compress(rawFor(file), file);
  await page.close();
}

const browser = await chromium.launch({ args: GL_ARGS });
try {
  if (wantIcon) await iconShot(browser);
  if (wantOg) await ogShot(browser);
} finally {
  await browser.close();
  stopAll();
  rmSync(RAW, { recursive: true, force: true });
}
