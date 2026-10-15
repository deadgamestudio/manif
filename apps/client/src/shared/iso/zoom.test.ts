import { describe, expect, test } from "bun:test";
import { BASE_ZOOM, MAX_MARKER_SCALE, MIN_VIEW_HEIGHT, MIN_VIEW_WIDTH, MIN_ZOOM, cameraZoom, markerScale, viewMarkerScale } from "./zoom.ts";

/** Metres the view shows across and down at its zoom. */
const extent = (w: number, h: number) => ({ across: w / cameraZoom(w, h), down: h / cameraZoom(w, h) });

describe("cameraZoom", () => {
  test("desktop windows keep the old zoom", () => {
    expect(cameraZoom(960, 540)).toBe(BASE_ZOOM);
    expect(cameraZoom(1280, 720)).toBe(BASE_ZOOM);
    expect(cameraZoom(1920, 1080)).toBe(BASE_ZOOM);
    expect(cameraZoom(2560, 1440)).toBe(BASE_ZOOM);
  });

  test("a portrait phone zooms out to show the minimum street", () => {
    const zoom = cameraZoom(390, 844);
    expect(zoom).toBeLessThan(BASE_ZOOM);
    const { across, down } = extent(390, 844);
    expect(across).toBeCloseTo(MIN_VIEW_WIDTH);
    expect(down).toBeGreaterThan(MIN_VIEW_HEIGHT);
  });

  test("a landscape phone zooms out too", () => {
    expect(cameraZoom(844, 390)).toBeLessThan(BASE_ZOOM);
    const { across, down } = extent(844, 390);
    expect(down).toBeCloseTo(MIN_VIEW_HEIGHT);
    expect(across).toBeGreaterThan(MIN_VIEW_WIDTH);
  });

  test("every view shows at least the minimum, down to a small phone", () => {
    for (const [w, h] of [
      [320, 568],
      [360, 640],
      [390, 844],
      [430, 932],
      [844, 390],
      [768, 1024],
      [1024, 768],
      [960, 540],
    ] as const) {
      const { across, down } = extent(w, h);
      expect(across).toBeGreaterThanOrEqual(MIN_VIEW_WIDTH - 1e-9);
      expect(down).toBeGreaterThanOrEqual(MIN_VIEW_HEIGHT - 1e-9);
    }
  });

  test("rotating the phone changes the zoom", () => {
    expect(cameraZoom(390, 844)).not.toBe(cameraZoom(844, 390));
  });

  test("never zooms out past the floor", () => {
    expect(cameraZoom(100, 80)).toBe(MIN_ZOOM);
  });

  test("an unmeasured view gets the base zoom", () => {
    expect(cameraZoom(0, 0)).toBe(BASE_ZOOM);
    expect(cameraZoom(Number.NaN, 500)).toBe(BASE_ZOOM);
  });
});

describe("markerScale", () => {
  test("is 1 at the base zoom", () => {
    expect(markerScale(BASE_ZOOM)).toBe(1);
    expect(viewMarkerScale(1920, 1080)).toBe(1);
  });

  test("keeps a marker's size on screen when zooming out a little", () => {
    expect(markerScale(32) * 32).toBeCloseTo(BASE_ZOOM);
  });

  test("is capped, and never shrinks markers", () => {
    expect(markerScale(MIN_ZOOM)).toBe(MAX_MARKER_SCALE);
    expect(markerScale(80)).toBe(1);
    expect(markerScale(0)).toBe(1);
  });

  test("grows markers on a phone", () => {
    expect(viewMarkerScale(390, 844)).toBeGreaterThan(1);
  });
});
