/*
 * The police look (#109). Jordan's police were near-black, like many
 * protesters (black bloc, dark outfits), so from the isometric camera both
 * read as dark blobs. The police uniform is repainted French-police navy
 * (palette cells, see POLICE_PAINT) and wears a white "POLICE" band across
 * the upper back, tilted a little towards the sky so the camera above sees
 * it. The disguised BAC gets neither: it must blend in until revealed.
 */
import { CanvasTexture, Mesh, MeshStandardMaterial, PlaneGeometry, SRGBColorSpace, type Object3D } from "three";
import { SKIN_CELL, type CellPaint } from "../models/index.ts";

/** Skin colour of every face (palette cell 6), the protesters' too (archetypeVisuals). */
export const SKIN = "#8d6e63";

/** A protester's body (the disguised BAC, the pompier): only the skin is painted. */
export const PLAIN_PAINT: CellPaint = { [SKIN_CELL]: SKIN };

/**
 * The police palette. In Jordan's police files cell 1 is the helmet, the
 * trousers and the sleeves; cell 8 the body armour, boots, gloves, baton and
 * shield frame (and the BRAV-M's helmet); cell 9 the knee, elbow and shoulder
 * pads. The protesters' bodies have their own materials: never painted here.
 */
export const POLICE_PAINT: CellPaint = {
  [SKIN_CELL]: SKIN,
  1: "#1f3460",
  8: "#121a2c",
  9: "#364562",
};

/** The band, in the spine bone's frame (the bone sits at 1.07 m, the back of the armour about 0.15 behind it), m and radians. */
const BAND_AT: readonly [number, number, number] = [0, 0.3, -0.175];
const BAND_SIZE: readonly [number, number] = [0.34, 0.1];
/** Tilted up from vertical so the band faces the camera above a little. */
const BAND_TILT = 0.55;

let band: { geometry: PlaneGeometry; material: MeshStandardMaterial } | null = null;

/** The band's geometry and material, made once and shared by every police body (never disposed). */
function bandParts(): { geometry: PlaneGeometry; material: MeshStandardMaterial } {
  if (band) return band;
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 76;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#f4f4f0";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#14254a";
    ctx.font = "bold 58px Arial, Helvetica, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("POLICE", canvas.width / 2, canvas.height / 2 + 3);
  }
  const map = new CanvasTexture(canvas);
  map.colorSpace = SRGBColorSpace;
  map.anisotropy = 4;
  band = {
    geometry: new PlaneGeometry(BAND_SIZE[0], BAND_SIZE[1]),
    material: new MeshStandardMaterial({ map, roughness: 0.7, metalness: 0 }),
  };
  return band;
}

/** Puts a "POLICE" band on the upper back of a police body (on its spine bone, so it follows every clip). Null if the rig has no spine. */
export function wearPoliceBand(root: Object3D): Object3D | null {
  const spine = root.getObjectByName("spine");
  if (!spine) return null;
  const { geometry, material } = bandParts();
  const mesh = new Mesh(geometry, material);
  mesh.name = "police-band";
  mesh.position.set(...BAND_AT);
  // Facing backwards (-z), then tipped up towards the sky.
  mesh.rotation.set(BAND_TILT, Math.PI, 0);
  mesh.castShadow = false;
  spine.add(mesh);
  return mesh;
}
