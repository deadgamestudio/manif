import { useEffect, useMemo } from "react";
import { CanvasTexture, LinearFilter, SRGBColorSpace } from "three";

const FONT_PX = 48;
const PAD_X = 22;
const PAD_Y = 12;

/** Paints the shop's name once into a small canvas texture: a painted board with a border. */
function drawSign(text: string, bg: string, fg: string): { texture: CanvasTexture; aspect: number } {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d canvas unavailable");
  const font = `${FONT_PX}px "Anton", Impact, "Arial Black", sans-serif`;
  ctx.font = font;
  canvas.width = Math.ceil(ctx.measureText(text).width) + PAD_X * 2;
  canvas.height = FONT_PX + PAD_Y * 2;
  ctx.fillStyle = bg;
  ctx.strokeStyle = fg;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.roundRect(4, 4, canvas.width - 8, canvas.height - 8, 8);
  ctx.fill();
  ctx.stroke();
  ctx.font = font; // resizing the canvas resets the context
  ctx.fillStyle = fg;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 2);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;
  return { texture, aspect: canvas.width / canvas.height };
}

/**
 * A shop's sign painted flat on its sign band (#83), like a real shopfront:
 * a board facing the street (+X locally), at most `maxWidth` wide and
 * `maxHeight` high, keeping the lettering's proportions. Unlit, so it reads
 * in the shade. Redrawn only when the round lays out a new shop.
 */
export function ShopSignBoard({ text, bg, fg, at, maxWidth, maxHeight }: { text: string; bg: string; fg: string; at: [number, number, number]; maxWidth: number; maxHeight: number }) {
  const sign = useMemo(() => drawSign(text, bg, fg), [text, bg, fg]);
  useEffect(() => () => sign.texture.dispose(), [sign]);
  const h = Math.min(maxHeight, maxWidth / sign.aspect);
  return (
    <mesh position={at} rotation-y={Math.PI / 2}>
      <planeGeometry args={[h * sign.aspect, h]} />
      <meshBasicMaterial map={sign.texture} />
    </mesh>
  );
}
