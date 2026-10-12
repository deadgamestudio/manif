import { useEffect, useMemo } from "react";
import { CanvasTexture, LinearFilter, SRGBColorSpace } from "three";

/** Height of the tag in world units (40 px at the default zoom). */
const TAG_HEIGHT = 0.55;
const FONT_PX = 44;
const PAD_X = 18;
const PAD_Y = 10;

/**
 * Draws the name once into a small canvas texture: a cardboard placard with
 * marker lettering. Redrawn only if the name changes, never per frame.
 */
function drawTag(name: string, isLocal: boolean): { texture: CanvasTexture; aspect: number } {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d canvas unavailable");
  const font = `${FONT_PX}px "Anton", Impact, "Arial Black", sans-serif`;
  ctx.font = font;
  const textW = Math.ceil(ctx.measureText(name).width);
  canvas.width = textW + PAD_X * 2;
  canvas.height = FONT_PX + PAD_Y * 2;

  ctx.fillStyle = isLocal ? "#ffd400" : "#f3e6c8";
  ctx.strokeStyle = "#141414";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.roundRect(3, 3, canvas.width - 6, canvas.height - 6, 6);
  ctx.fill();
  ctx.stroke();

  ctx.font = font; // resizing the canvas resets the context
  ctx.fillStyle = "#141414";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(name, canvas.width / 2, canvas.height / 2 + 2);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;
  return { texture, aspect: canvas.width / canvas.height };
}

/** A name placard that always faces the camera and draws over the scenery. */
export function NameTag({ name, isLocal, y }: { name: string; isLocal: boolean; y: number }) {
  const tag = useMemo(() => drawTag(name, isLocal), [name, isLocal]);
  useEffect(() => () => tag.texture.dispose(), [tag]);

  return (
    <sprite position-y={y} scale={[TAG_HEIGHT * tag.aspect, TAG_HEIGHT, 1]} renderOrder={10}>
      <spriteMaterial map={tag.texture} depthTest={false} depthWrite={false} transparent />
    </sprite>
  );
}
