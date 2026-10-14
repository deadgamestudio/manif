// The Vite side of meta.ts: puts the page's <head> tags into the HTML the
// server sends, so link preview bots (which don't run JavaScript) see them.
//
// - Build: index.html keeps its `<!-- seo -->` marker through the bundle; once
//   it is written, one copy per page replaces the marker with that page's
//   tags (dist/index.html for the home page, dist/invite.html for invite
//   links, dist/aide.html for the help, #71), next to robots.txt and
//   sitemap.xml. Every copy comes from the built file, so they load the same
//   hashed bundles. The Caddyfile serves aide.html for /aide, and invite.html
//   for any other page URL with a `lobby` query parameter.
// - `vite dev`: the tags of the requested URL, straight into index.html
//   (transformIndexHtml sees the URL asked for, query included), and
//   robots.txt / sitemap.xml served from memory.
// - `vite preview`: /aide is served aide.html and a page URL with `?lobby=`
//   invite.html, like Caddy does.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Plugin, ResolvedConfig } from "vite";
import { SEO_MARKER, SITE_IMAGE, allPages, pageFor, robotsTxt, sitemapXml, withHeadTags } from "./meta.ts";

/** A navigation to a page: not a Vite module, not a file with an extension (an image, robots.txt...). */
export const isPageRequest = (method: string | undefined, pathname: string) =>
  (method === "GET" || method === "HEAD") && !pathname.startsWith("/@") && !/\.[a-z0-9]+$/i.test(pathname);

export function seo(): Plugin {
  let config: ResolvedConfig;

  return {
    name: "manif:seo",
    configResolved(c) {
      config = c;
    },

    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        // The build fills the marker in writeBundle, once per page.
        if (config.command === "build") return html;
        return withHeadTags(html, pageFor(ctx.originalUrl ?? ctx.path).meta);
      },
    },

    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = (req.url ?? "/").split("?")[0] ?? "/";
        const body = pathname === "/robots.txt" ? robotsTxt() : pathname === "/sitemap.xml" ? sitemapXml() : null;
        if (body === null) return next();
        res.setHeader("Content-Type", pathname.endsWith(".xml") ? "application/xml" : "text/plain; charset=utf-8");
        res.end(body);
      });
    },

    configurePreviewServer(server) {
      // Before the static files: point the help and invite URLs at the HTML file written for them.
      server.middlewares.use((req, _res, next) => {
        const url = req.url ?? "/";
        const [pathname = "/", query] = url.split("?");
        if (isPageRequest(req.method, pathname)) {
          const file = pageFor(url).file;
          if (file !== "index.html") req.url = `/${file}${query ? `?${query}` : ""}`;
        }
        next();
      });
    },

    writeBundle(options) {
      const dir = options.dir ?? config.build.outDir;
      const indexPath = join(dir, "index.html");
      const built = readFileSync(indexPath, "utf8");
      if (!built.includes(SEO_MARKER)) return; // Already filled (a second write of the same bundle).
      if (config.publicDir && !existsSync(join(config.publicDir, SITE_IMAGE))) {
        this.warn(`${SITE_IMAGE} is missing: run \`bun run og:render\` in apps/client`);
      }
      for (const page of allPages()) writeFileSync(join(dir, page.file), withHeadTags(built, page.meta));
      writeFileSync(join(dir, "robots.txt"), robotsTxt());
      writeFileSync(join(dir, "sitemap.xml"), sitemapXml());
    },
  };
}
