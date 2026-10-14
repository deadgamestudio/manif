// What the build wrote (dist/), read as raw HTML with no JavaScript, the way
// Discord, Slack or X's bots read it: the home page's tags, the invite page,
// the share image, robots.txt and sitemap.xml. Then the same through
// `vite preview`, whose routing (seo/plugin.ts) mirrors the Caddyfile's.
//
// Needs a build first: `turbo run test` builds the client before testing it.

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { preview, type PreviewServer } from "vite";
import { IMAGE_HEIGHT, IMAGE_WIDTH, SITE_ORIGIN } from "./meta.ts";

const CLIENT = join(import.meta.dir, "..");
const DIST = join(CLIENT, "dist");

if (!existsSync(join(DIST, "index.html"))) {
  throw new Error("apps/client/dist is missing: run `bun run build` first (`bun run test` at the root does it)");
}

const read = (file: string) => readFileSync(join(DIST, file), "utf8");

const unescape = (s: string) => s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

/** The `content` of `<meta property|name="key">`, or null. */
function meta(page: string, key: string): string | null {
  const tag = page.match(new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)"`));
  return tag ? unescape(tag[1]!) : null;
}

const title = (page: string) => unescape(page.match(/<title>([^<]*)<\/title>/)?.[1] ?? "");
const canonical = (page: string) => page.match(/<link rel="canonical" href="([^"]*)"/)?.[1] ?? null;
const entryScript = (page: string) => page.match(/<script type="module" crossorigin src="\/assets\/[^"]+\.js"><\/script>/)?.[0];

/** Width and height of a PNG, from its IHDR chunk. */
function pngSize(png: Uint8Array): [number, number] {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  expect(new TextDecoder().decode(png.subarray(1, 4))).toBe("PNG");
  return [view.getUint32(16), view.getUint32(20)];
}

describe("the built HTML", () => {
  const home = read("index.html");
  const invite = read("invite.html");

  test("the home page has its title, description, canonical URL, Open Graph, Twitter and JSON-LD tags", () => {
    expect(title(home)).toContain("Manif");
    const description = meta(home, "description");
    expect(description).toContain("Préfecture");
    expect(canonical(home)).toBe(`${SITE_ORIGIN}/`);
    expect(meta(home, "og:type")).toBe("website");
    expect(meta(home, "og:title")).toBe(title(home));
    expect(meta(home, "og:description")).toBe(description);
    expect(meta(home, "og:url")).toBe(`${SITE_ORIGIN}/`);
    expect(meta(home, "og:image")).toBe(`${SITE_ORIGIN}/og/og.png`);
    expect(meta(home, "og:image:width")).toBe(String(IMAGE_WIDTH));
    expect(meta(home, "og:image:height")).toBe(String(IMAGE_HEIGHT));
    expect(meta(home, "twitter:card")).toBe("summary_large_image");
    expect(meta(home, "twitter:image")).toBe(meta(home, "og:image"));
    expect(meta(home, "robots")).toBeNull();
    // One title, one description: the marker was replaced, not added to.
    expect(home.match(/<title>/g)).toHaveLength(1);
    expect(home.match(/<meta name="description"/g)).toHaveLength(1);
    expect(home).not.toContain("<!-- seo -->");

    const ld = JSON.parse(home.match(/<script type="application\/ld\+json">([^<]*)<\/script>/)?.[1] ?? "null");
    expect(ld).toMatchObject({
      "@type": "VideoGame",
      name: "Manif",
      url: `${SITE_ORIGIN}/`,
      inLanguage: "fr",
      playMode: "MultiPlayer",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0" },
    });
  });

  test("the share image exists and is 1200 × 630", () => {
    const image = meta(home, "og:image")!;
    const file = join(DIST, image.slice(SITE_ORIGIN.length));
    expect(existsSync(file)).toBe(true);
    expect(pngSize(readFileSync(file))).toEqual([IMAGE_WIDTH, IMAGE_HEIGHT]);
  });

  test("the invite page is noindex, has its own title, and boots the same bundle", () => {
    expect(title(invite)).toBe("Tu es invité·e à une manif !");
    expect(meta(invite, "og:title")).toBe(title(invite));
    expect(meta(invite, "robots")).toBe("noindex");
    expect(canonical(invite)).toBeNull();
    expect(meta(invite, "og:url")).toBeNull();
    expect(meta(invite, "og:image")).toBe(`${SITE_ORIGIN}/og/og.png`);
    expect(entryScript(home)).toBeDefined();
    expect(entryScript(invite)).toBe(entryScript(home));
  });

  test("the help page (#71) is indexable, has its own title and canonical URL, and boots the same bundle", () => {
    const help = read("aide.html");
    expect(title(help)).toStartWith("Comment on joue");
    expect(meta(help, "og:title")).toBe(title(help));
    expect(meta(help, "robots")).toBeNull();
    expect(canonical(help)).toBe(`${SITE_ORIGIN}/aide`);
    expect(meta(help, "og:url")).toBe(`${SITE_ORIGIN}/aide`);
    expect(entryScript(help)).toBe(entryScript(home));
  });

  test("robots.txt and sitemap.xml are there", () => {
    expect(read("robots.txt")).toContain(`Sitemap: ${SITE_ORIGIN}/sitemap.xml`);
    expect(read("sitemap.xml")).toContain(`<loc>${SITE_ORIGIN}/</loc>`);
    expect(read("sitemap.xml")).toContain(`<loc>${SITE_ORIGIN}/aide</loc>`);
  });
});

describe("vite preview", () => {
  let server: PreviewServer;
  let base: string;

  beforeAll(async () => {
    server = await preview({ root: CLIENT, configFile: join(CLIENT, "vite.config.ts"), logLevel: "silent", preview: { port: 0 } });
    base = server.resolvedUrls?.local[0]?.replace(/\/$/, "") ?? "";
    expect(base).toStartWith("http");
  });
  afterAll(async () => {
    await server?.close();
  });

  const get = async (path: string) => {
    const res = await fetch(base + path, { headers: { Accept: "text/html" } });
    expect(res.status, path).toBe(200);
    return res;
  };

  test("serves the home page at /, and at unknown paths", async () => {
    expect(await (await get("/")).text()).toBe(read("index.html"));
    expect(await (await get("/nimporte/quoi")).text()).toBe(read("index.html"));
  });

  test("serves the invite page for ?lobby=, without the code in it", async () => {
    const page = await (await get("/?lobby=abc123")).text();
    expect(page).toBe(read("invite.html"));
    expect(page).not.toContain("abc123");
  });

  test("serves the help page at /aide, with or without an invite code", async () => {
    expect(await (await get("/aide")).text()).toBe(read("aide.html"));
    expect(await (await get("/aide?lobby=abc123")).text()).toBe(read("aide.html"));
  });

  test("serves robots.txt, sitemap.xml and the share image as files", async () => {
    expect(await (await get("/robots.txt")).text()).toBe(read("robots.txt"));
    expect(await (await get("/sitemap.xml")).text()).toBe(read("sitemap.xml"));
    const png = new Uint8Array(await (await get("/og/og.png?lobby=abc123")).arrayBuffer());
    expect(pngSize(png)).toEqual([IMAGE_WIDTH, IMAGE_HEIGHT]);
  });
});
