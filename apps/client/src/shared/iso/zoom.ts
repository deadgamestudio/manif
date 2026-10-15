/**
 * How zoomed in the orthographic camera is (#107), from the size of the game
 * view in CSS pixels. The zoom is screen pixels per metre. Desktop keeps the
 * old fixed 40; a smaller view zooms out until it shows at least
 * `MIN_VIEW_WIDTH` × `MIN_VIEW_HEIGHT` metres, so a phone sees about as much
 * street around the player as a laptop. Pure numbers, no three.js: this
 * module may load before the 3D scene does (#88).
 */

/** The zoom a desktop window gets, and the most any screen gets: 960×540 shows 24 × 13.5 m. */
export const BASE_ZOOM = 40;
/** Every view shows at least this many metres across... */
export const MIN_VIEW_WIDTH = 18;
/** ...and this many metres from top to bottom (what 540 px tall showed at the base zoom). */
export const MIN_VIEW_HEIGHT = 13.5;
/** Never zoomed out further than this, even in a tiny window: the street would turn to crumbs. */
export const MIN_ZOOM = 16;
/** Markers sized in metres grow by at most this much to keep their size on screen. */
export const MAX_MARKER_SCALE = 1.5;

/** The camera zoom for a `width` × `height` view (CSS pixels). */
export function cameraZoom(width: number, height: number): number {
  if (!(width > 0 && height > 0)) return BASE_ZOOM;
  const fit = Math.min(width / MIN_VIEW_WIDTH, height / MIN_VIEW_HEIGHT);
  return Math.max(MIN_ZOOM, Math.min(BASE_ZOOM, fit));
}

/**
 * How much to grow something sized in metres (name tags, the grab "!", the
 * "BOING !") at `zoom`, so it keeps about its desktop size on screen and stays
 * readable on a phone. 1 at the base zoom, capped so a tag never swallows the
 * crowd it floats over.
 */
export function markerScale(zoom: number): number {
  if (!(zoom > 0)) return 1;
  return Math.max(1, Math.min(MAX_MARKER_SCALE, BASE_ZOOM / zoom));
}

/** `markerScale` for a `width` × `height` view: what the markers read from R3F's `size`. */
export function viewMarkerScale(width: number, height: number): number {
  return markerScale(cameraZoom(width, height));
}
