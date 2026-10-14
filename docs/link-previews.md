# Link previews and search

A link pasted in Discord, Slack, WhatsApp or X shows a card with a title, a
line of text and an image. Their bots don't run JavaScript, so those tags have
to be in the HTML the server sends, not set by the app once it runs.

- `apps/client/seo/meta.ts` holds all that text, in French, and the site's
  address (`SITE_ORIGIN`, https://manif.bazlab.si, the only place the domain
  is written). There are two pages: the home page, and one generic invite
  ("Tu es invité·e à une manif !") for every `/?lobby=<code>` link. The invite
  is `noindex` and never contains the code. The home page also describes the
  game as schema.org `VideoGame` data (JSON-LD) for search engines.
- `apps/client/seo/plugin.ts` (a Vite plugin) puts those tags in place of the
  `<!-- seo -->` marker in `index.html`. `vite build` writes
  `dist/index.html` and a copy, `dist/invite.html`, with the invite's tags
  and the same hashed bundles, plus `robots.txt` and `sitemap.xml` (the home
  page only). The Caddyfile sends any page URL with a `lobby` query parameter
  to `invite.html`; `vite dev` and `vite preview` do the same, so they send
  what production sends.
- The share image is `apps/client/public/og/og.png` (1200 × 630, under 200
  KB), a shot of the real game. To redraw it, stop `bun run dev` and run
  `bun run og:render` in `apps/client`: it starts the game server and the
  client, opens five players in headless Chromium (Playwright), creates a
  lobby, has the others join by the invite link, walks the cortège up to the
  first shield line, lays the MANIF banner over it and shrinks the PNG to 256
  colours with Pillow (`python3 -m pip install Pillow`). The bots move a bit
  differently each run, so look at the image before committing it. The same
  script draws `public/apple-touch-icon.png` from `public/favicon.svg`
  (`bun run og:render -- icon` for that one only).

`apps/client/seo/plugin.test.ts` checks the built HTML (the tags, the image
size, the invite page) and the `vite preview` routing; `bun run test` builds
the client first.
