// The archetype portraits of the lobby's role picker (#126):
// public/portraits/<archetype>.webp, one small image per archetype.
//
// Drawn by the game's own code: this starts Vite's dev server, opens the
// studio page (portraits.html, src/app/portraits/) once per archetype in
// headless Chrome, and saves the WebP it hands back. Run it again after a
// model, a wardrobe colour or the street's lighting changes, and look at the
// images before committing them.
//
//   bun run portraits
//
// Needs Google Chrome installed (Playwright's `chrome` channel). Port 5691 must be free.

import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { ARCHETYPE_IDS, ARCHETYPES } from "@manif/shared";
import { PORTRAIT_FILES } from "../../src/features/archetype/portraits.ts";

const CLIENT = join(import.meta.dir, "../..");
const ROOT = join(CLIENT, "../..");
const OUT = join(CLIENT, "public/portraits");
const PORT = 5691;
const BASE = `http://localhost:${PORT}`;

/** What the studio page (src/app/portraits/Studio.tsx) puts on its window. */
type StudioWindow = Window & { portrait?: () => Promise<string> };

// --- Vite ------------------------------------------------------------------------

let vite: ChildProcess | null = null;
/** Stops Vite with everything it started: it leads its own process group. */
const stop = () => {
  try {
    if (vite?.pid) process.kill(-vite.pid, "SIGTERM");
  } catch {
    // Already gone.
  }
  vite = null;
};
process.on("exit", stop);
process.on("SIGINT", () => process.exit(130));

async function waitFor(url: string) {
  for (let i = 0; i < 160; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // Not up yet.
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Vite didn't start on ${url}`);
}

try {
  await fetch(BASE);
  throw new Error(`port ${PORT} is busy`);
} catch (e) {
  if (e instanceof Error && e.message.startsWith("port")) throw e;
}
// The client imports @manif/shared's compiled dist.
if (!existsSync(join(ROOT, "packages/shared/dist/index.js"))) {
  const r = spawnSync("bun", ["run", "build"], { cwd: join(ROOT, "packages/shared"), stdio: "inherit" });
  if (r.status !== 0) throw new Error("building @manif/shared failed");
}
vite = spawn("bunx", ["vite", "--port", String(PORT), "--strictPort"], { cwd: CLIENT, stdio: ["ignore", "ignore", "inherit"], detached: true });
await waitFor(`${BASE}/portraits.html`);

// --- The shots -------------------------------------------------------------------

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--use-gl=angle", "--enable-unsafe-swiftshader"] });
try {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const id of ARCHETYPE_IDS) {
    await page.goto(`${BASE}/portraits.html?archetype=${id}`);
    await page.waitForFunction(() => typeof (window as StudioWindow).portrait === "function");
    const url = await page.evaluate(() => (window as StudioWindow).portrait!());
    const prefix = "data:image/webp;base64,";
    if (!url.startsWith(prefix)) throw new Error(`${ARCHETYPES[id].name}: not a WebP (${url.slice(0, 30)}...)`);
    const bytes = Buffer.from(url.slice(prefix.length), "base64");
    const file = join(OUT, `${PORTRAIT_FILES[id]}.webp`);
    writeFileSync(file, bytes);
    console.log(`${ARCHETYPES[id].name}: ${file} (${(bytes.length / 1024).toFixed(1)} KB)`);
  }
  if (errors.length > 0) throw new Error(`page errors:\n${errors.join("\n")}`);
} finally {
  await browser.close();
  stop();
}
