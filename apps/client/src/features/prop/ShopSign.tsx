import { useEffect, useMemo } from "react";
import { CanvasTexture, LinearFilter, SRGBColorSpace } from "three";

/** Height of the sign in world units. */
const SIGN_HEIGHT = 0.6;
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
 * A shop's sign (#68): the invented name over the front, always facing the
 * camera so it reads from any angle. Hidden by whatever stands in front of
 * it (unlike the name tags), so it hangs out over the pavement, clear of the
 * facade behind. Redrawn only when the round deals a new shop.
 */
export function ShopSign({ text, bg, fg, at }: { text: string; bg: string; fg: string; at: [number, number, number] }) {
  const sign = useMemo(() => drawSign(text, bg, fg), [text, bg, fg]);
  useEffect(() => () => sign.texture.dispose(), [sign]);
  return (
    <sprite position={at} scale={[SIGN_HEIGHT * sign.aspect, SIGN_HEIGHT, 1]}>
      <spriteMaterial map={sign.texture} transparent />
    </sprite>
  );
}
