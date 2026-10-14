// What a page says about itself to search engines and link previews
// (Discord, Slack, WhatsApp, X, iMessage...): the <head> tags, the robots.txt
// and the sitemap. All the text lives here, in French like the game.
//
// Link preview bots don't run JavaScript, so these tags have to be in the
// HTML the server sends. The Vite plugin next to this file (plugin.ts) puts
// them there: at build time as two HTML files (dist/index.html for the home
// page, dist/invite.html for invite links), and per request in `vite dev` and
// `vite preview`. The Caddyfile serves invite.html for invite links. All of
// them go through `pageFor()` below, so dev, preview, tests and production
// send the same tags.
//
// manif has two page paths: `/`, where the app goes Home -> Lobby -> Game by
// state, not by URL, and `/aide`, the "Comment on joue" help (#71), written
// to dist/aide.html. An invite link is `/?lobby=<code>`. Every invite gets the same
// generic page: the lobby code is never written into the HTML (it can't be,
// the files are static), so nothing from the URL is echoed into the page.
//
// Pure: no file system, no DOM.

import { LOBBY_QUERY_PARAM, MAX_PLAYERS } from "@manif/shared";

/** The production site. Every absolute URL (canonical, og:url, og:image, sitemap) starts with it. */
export const SITE_ORIGIN = "https://manif.bazlab.si";

export const SITE_NAME = "Manif";

/** The share image every page uses. `bun run og:render` makes it. */
export const SITE_IMAGE = "/og/og.png";
/** Size of the share image (the size Discord, Slack and X show large). */
export const IMAGE_WIDTH = 1200;
export const IMAGE_HEIGHT = 630;

export interface PageMeta {
  title: string;
  description: string;
  /**
   * Path of the page's own URL (canonical, og:url), from the site root. Null
   * for the invite page: its URL holds a lobby code, which is never echoed.
   */
  path: string | null;
  /** Path of the share image, from the site root. */
  image: string;
  imageAlt: string;
  /** Kept out of search results (invite links). */
  noindex: boolean;
}

/** A page with its tags, and the HTML file the build writes it to (relative to dist). */
export interface Page {
  file: string;
  meta: PageMeta;
}

const IMAGE_ALT = "Des manifestants face à une ligne de CRS et leurs boucliers, dans une rue, sous une banderole MANIF";

const HOME_DESCRIPTION =
  `Un jeu de manif multijoueur, gratuit, dans ton navigateur et sans rien installer. ` +
  `Monte un cortège jusqu'à ${MAX_PLAYERS} potes, casse des poubelles et des abribus, ` +
  `balance des pavés, esquive les lacrymos et marche jusqu'à la Préfecture sans finir dans le fourgon des CRS.`;

const HOME: PageMeta = {
  title: "Manif : pavés, lacrymos et CRS, le jeu de manif en multi",
  description: HOME_DESCRIPTION,
  path: "/",
  image: SITE_IMAGE,
  imageAlt: IMAGE_ALT,
  noindex: false,
};

const INVITE: PageMeta = {
  title: "Tu es invité·e à une manif !",
  description:
    "Des potes montent un cortège et t'attendent. Ouvre le lien, choisis ton blaze et rejoins la manif, " +
    "direct dans ton navigateur : rien à installer, pas de compte.",
  path: null,
  image: SITE_IMAGE,
  imageAlt: IMAGE_ALT,
  noindex: true,
};

/** The help page's path (the client's features/help/route.ts reads the same). */
export const HELP_PATH = "/aide";

const HELP: PageMeta = {
  // Keep in step with the document title HelpPage sets (apps/client/src/features/help/HelpPage.tsx).
  title: "Comment on joue à Manif : règles, commandes et CRS",
  description:
    "Le mode d'emploi de Manif, le jeu de manif multijoueur : le but, les commandes au clavier et au tactile, " +
    "comment échapper aux CRS, casser, lancer des pavés, les personnages et les points.",
  path: HELP_PATH,
  image: SITE_IMAGE,
  imageAlt: IMAGE_ALT,
  noindex: false,
};

/**
 * The page for a request URL (path and query, e.g. `/?lobby=abc`): its tags
 * and the HTML file the build wrote them to. `/aide` is the help, even with
 * a `lobby` parameter (the overlay keeps the invite code on it, so a refresh
 * rejoins). Any other URL with a `lobby` query parameter is an invite;
 * anything else gets the home page (the SPA has no other page).
 */
export function pageFor(url: string): Page {
  const [path = "/", query = ""] = (url.split("#")[0] ?? "").split("?");
  if (path === HELP_PATH || path === `${HELP_PATH}/`) return { file: "aide.html", meta: HELP };
  if (new URLSearchParams(query).has(LOBBY_QUERY_PARAM)) return { file: "invite.html", meta: INVITE };
  return { file: "index.html", meta: HOME };
}

/** Every page the build writes, the home page first. */
export function allPages(): Page[] {
  return [pageFor("/"), pageFor(`/?${LOBBY_QUERY_PARAM}=code`), pageFor(HELP_PATH)];
}

const abs = (path: string) => SITE_ORIGIN + path;

/**
 * Text made safe for HTML, in an element or a double-quoted attribute (every
 * attribute here is double-quoted, so French apostrophes stay as they are).
 */
export const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * JSON safe inside a <script> element: `<`, `>` and `&` escaped as \u
 * sequences, so no string in it can close the tag or open a comment, and the
 * two line separators JavaScript once treated as newlines. Still valid JSON.
 */
export const scriptJson = (data: unknown) =>
  JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");

/** The game, as schema.org structured data (search results can show it as a game). */
export function jsonLd(): object {
  return {
    "@context": "https://schema.org",
    "@type": "VideoGame",
    name: SITE_NAME,
    description: HOME_DESCRIPTION,
    url: abs("/"),
    image: abs(SITE_IMAGE),
    inLanguage: "fr",
    genre: ["Multijoueur", "Action", "Party game"],
    gamePlatform: "Navigateur web",
    applicationCategory: "Game",
    operatingSystem: "Tous (navigateur web)",
    playMode: "MultiPlayer",
    numberOfPlayers: { "@type": "QuantitativeValue", minValue: 1, maxValue: MAX_PLAYERS },
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
  };
}

/** The tags that replace the `<!-- seo -->` marker of index.html, for one page. */
export function headTags(meta: PageMeta): string {
  const t = escapeHtml;
  const url = meta.path === null ? null : abs(meta.path);
  const image = abs(meta.image);
  const lines = [
    `<title>${t(meta.title)}</title>`,
    `<meta name="description" content="${t(meta.description)}" />`,
    ...(meta.noindex ? [`<meta name="robots" content="noindex" />`] : []),
    ...(url && !meta.noindex ? [`<link rel="canonical" href="${t(url)}" />`] : []),
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${t(SITE_NAME)}" />`,
    `<meta property="og:locale" content="fr_FR" />`,
    `<meta property="og:title" content="${t(meta.title)}" />`,
    `<meta property="og:description" content="${t(meta.description)}" />`,
    ...(url ? [`<meta property="og:url" content="${t(url)}" />`] : []),
    `<meta property="og:image" content="${t(image)}" />`,
    `<meta property="og:image:type" content="image/png" />`,
    `<meta property="og:image:width" content="${IMAGE_WIDTH}" />`,
    `<meta property="og:image:height" content="${IMAGE_HEIGHT}" />`,
    `<meta property="og:image:alt" content="${t(meta.imageAlt)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${t(meta.title)}" />`,
    `<meta name="twitter:description" content="${t(meta.description)}" />`,
    `<meta name="twitter:image" content="${t(image)}" />`,
    `<meta name="twitter:image:alt" content="${t(meta.imageAlt)}" />`,
  ];
  if (!meta.noindex) lines.push(`<script type="application/ld+json">${scriptJson(jsonLd())}</script>`);
  return lines.join("\n    ");
}

/** The marker in index.html that the tags replace. */
export const SEO_MARKER = "<!-- seo -->";

/** index.html (source or built) with one page's tags in place of the marker. */
export function withHeadTags(html: string, meta: PageMeta): string {
  if (!html.includes(SEO_MARKER)) throw new Error(`index.html has no ${SEO_MARKER} marker for the SEO tags`);
  return html.replace(SEO_MARKER, () => headTags(meta));
}

/**
 * Everything may be crawled. Invite links (`/?lobby=...`) are not blocked
 * here on purpose: a crawler has to fetch them to see their `noindex`.
 */
export function robotsTxt(): string {
  return ["User-agent: *", "Allow: /", "", `Sitemap: ${abs("/sitemap.xml")}`, ""].join("\n");
}

/** The pages worth indexing: every page with its own URL that isn't noindex (home, then the help). */
export function sitemapXml(): string {
  const urls = allPages()
    .filter((p) => p.meta.path !== null && !p.meta.noindex)
    .map((p) => `  <url><loc>${escapeHtml(abs(p.meta.path ?? "/"))}</loc></url>`);
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
    ...urls,
    `</urlset>`,
    ``,
  ].join("\n");
}
