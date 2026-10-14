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
 * Call it on a copy (cloneSkinned / cloneStatic), never on the shared GLTF.
 * If the copy also needs its own materials (fading, flashing), call
 * `applySkin` first and `cloneMaterials` after, so the clones keep the skin.
 */
import { DataTexture, Mesh, NearestFilter, RGBAFormat, SRGBColorSpace, type Material, type Object3D, type Texture } from "three";
import { SKIN_CELL, isPaletteSize, paintCell, parseHexColour } from "./palettePixels.ts";

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
 * `texture` (a palette strip) with its skin cell painted `colour` (#rrggbb),
 * cached per (image, colour). Nearest filtering, sRGB, flipY off, like
 * Jordan's originals. Null if the texture isn't a palette or can't be read.
 */
export function skinPalette(texture: Texture, colour: string): Texture | null {
  const image = paletteImage(texture) as (CanvasImageSource & Sized) | null;
  if (!image) return null;
  let byColour = textures.get(image);
  if (!byColour) {
    byColour = new Map();
    textures.set(image, byColour);
  }
  const key = colour.toLowerCase();
  if (byColour.has(key)) return byColour.get(key) ?? null;
  const pixels = readPixels(image);
  let made: Texture | null = null;
  if (pixels) {
    const data = paintCell(pixels, image.width, image.height, SKIN_CELL, parseHexColour(colour));
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
  byColour.set(key, made);
  return made;
}

/** `material` with its palette map recoloured, cached per (material, colour). The material itself when it has no palette. */
export function skinMaterial(material: Material, colour: string): Material {
  const map = (material as Material & { map?: Texture | null }).map;
  if (!map || !paletteImage(map)) return material;
  const key = colour.toLowerCase();
  let byColour = materials.get(material);
  if (!byColour) {
    byColour = new Map();
    materials.set(material, byColour);
  }
  let made = byColour.get(key);
  if (!made) {
    const recoloured = skinPalette(map, key);
    if (!recoloured) return material;
    made = material.clone();
    (made as Material & { map: Texture }).map = recoloured;
    byColour.set(key, made);
  }
  return made;
}

/** Paints the skin of every palette material in `copy` (a clone, not the shared GLTF). Models with several palettes (the CRS has two) get all of them. */
export function applySkin(copy: Object3D, colour: string): void {
  copy.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    o.material = Array.isArray(o.material) ? o.material.map((m: Material) => skinMaterial(m, colour)) : skinMaterial(o.material as Material, colour);
  });
}
