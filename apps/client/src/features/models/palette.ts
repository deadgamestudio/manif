/**
 * Skin recolouring (#28). Every model is coloured from a 16×1 palette strip
 * and the skin is cell 6; the files ship a placeholder skin, and the game
 * paints its own (archetypeVisuals' SKIN: one colour for every protester).
 *
 * `applySkin(copy, colour)` swaps each palette material of a copy for a
 * recoloured one. Recoloured textures and materials are cached per (source,
 * colour), so a cortège of 30 bodies with one skin shares one texture per
 * palette and one material per source material: nothing per player.
 *
 * `repaintCells(copy, { cell: colour, ... })` is the same for any cells
 * (#109: the police uniform goes navy), one texture per distinct set.
 *
 * Call it on a copy (cloneSkinned / cloneStatic), never on the shared GLTF.
 * If the copy also needs its own materials (fading, flashing), call
 * `applySkin` first and `cloneMaterials` after, so the clones keep the skin.
 */
import { DataTexture, Mesh, NearestFilter, RGBAFormat, SRGBColorSpace, type Material, type Object3D, type Texture } from "three";
import { SKIN_CELL, isPaletteSize, paintCells, paintKey, type CellPaint } from "./palettePixels.ts";

type Sized = { width: number; height: number };

const textures = new WeakMap<object, Map<string, Texture | null>>();
const materials = new WeakMap<Material, Map<string, Material>>();

/** The image behind a texture, if it is a palette strip three.js can draw from. */
function paletteImage(texture: Texture | null | undefined): CanvasImageSource | null {
  const image = texture?.image as (Sized & CanvasImageSource) | undefined;
  if (!image || typeof image.width !== "number" || typeof image.height !== "number") return null;
  return isPaletteSize(image.width, image.height) ? image : null;
}

function readPixels(image: CanvasImageSource & Sized): Uint8ClampedArray | null {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0);
  return ctx.getImageData(0, 0, image.width, image.height).data;
}

/**
 * `texture` (a palette strip) with the cells of `paint` repainted, cached per
 * (image, paint): one texture per distinct set, shared by every copy. Nearest
 * filtering, sRGB, flipY off, like Jordan's originals. Null if the texture
 * isn't a palette or can't be read.
 */
export function paintedPalette(texture: Texture, paint: CellPaint): Texture | null {
  const image = paletteImage(texture) as (CanvasImageSource & Sized) | null;
  if (!image) return null;
  let byPaint = textures.get(image);
  if (!byPaint) {
    byPaint = new Map();
    textures.set(image, byPaint);
  }
  const key = paintKey(paint);
  if (byPaint.has(key)) return byPaint.get(key) ?? null;
  const pixels = readPixels(image);
  let made: Texture | null = null;
  if (pixels) {
    const data = paintCells(pixels, image.width, image.height, paint);
    const t = new DataTexture(data, image.width, image.height, RGBAFormat);
    t.colorSpace = SRGBColorSpace;
    t.magFilter = NearestFilter;
    t.minFilter = NearestFilter;
    t.generateMipmaps = false;
    t.flipY = false;
    t.wrapS = texture.wrapS;
    t.wrapT = texture.wrapT;
    t.needsUpdate = true;
    made = t;
  }
  byPaint.set(key, made);
  return made;
}

/** `material` with its palette map's `paint` cells repainted, cached per (material, paint). The material itself when it has no palette. */
export function paintedMaterial(material: Material, paint: CellPaint): Material {
  const map = (material as Material & { map?: Texture | null }).map;
  if (!map || !paletteImage(map)) return material;
  const key = paintKey(paint);
  let byPaint = materials.get(material);
  if (!byPaint) {
    byPaint = new Map();
    materials.set(material, byPaint);
  }
  let made = byPaint.get(key);
  if (!made) {
    const recoloured = paintedPalette(map, paint);
    if (!recoloured) return material;
    made = material.clone();
    (made as Material & { map: Texture }).map = recoloured;
    byPaint.set(key, made);
  }
  return made;
}

/**
 * Repaints the `paint` cells of every palette material in `copy` (a clone,
 * not the shared GLTF), e.g. `{ 6: skin, 1: navy }`. Pass every cell in one
 * call: a material already repainted is no palette image any more and is
 * left alone. Models with several palettes (the CRS has two) get all of them.
 */
export function repaintCells(copy: Object3D, paint: CellPaint): void {
  copy.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    o.material = Array.isArray(o.material) ? o.material.map((m: Material) => paintedMaterial(m, paint)) : paintedMaterial(o.material as Material, paint);
  });
}

/** `texture` (a palette strip) with its skin cell painted `colour` (#rrggbb). See paintedPalette. */
export function skinPalette(texture: Texture, colour: string): Texture | null {
  return paintedPalette(texture, { [SKIN_CELL]: colour });
}

/** `material` with its palette's skin cell painted `colour`. See paintedMaterial. */
export function skinMaterial(material: Material, colour: string): Material {
  return paintedMaterial(material, { [SKIN_CELL]: colour });
}

/** Paints the skin of every palette material in `copy` (a clone, not the shared GLTF). */
export function applySkin(copy: Object3D, colour: string): void {
  repaintCells(copy, { [SKIN_CELL]: colour });
}
