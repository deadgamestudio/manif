import { useEffect, useMemo } from "react";
import { useThree } from "@react-three/fiber";
import { CanvasTexture, LinearFilter, SRGBColorSpace } from "three";
import { viewMarkerScale } from "../../shared/iso/index.ts";

/** Height of the tag in world units at the desktop zoom (22 px); grown on a zoomed-out phone (#107). */
const TAG_HEIGHT = 0.55;
const FONT_PX = 44;
const PAD_X = 18;
const PAD_Y = 10;

/** The bot marker (#59): a small dark chip before the name. */
const BOT_LABEL = "BOT";
const BOT_FONT_PX = 30;
const BOT_PAD = 8;
const BOT_GAP = 12;

/**
 * Draws the name once into a small canvas texture: a cardboard placard with
 * marker lettering. Redrawn only if the name changes, never per frame. A bot
 * protester (#59) gets a greyer placard and a "BOT" chip before its name, so
 * nobody takes it for a friend.
 */
function drawTag(name: string, isLocal: boolean, bot: boolean): { texture: CanvasTexture; aspect: number } {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d canvas unavailable");
  const font = `${FONT_PX}px "Anton", Impact, "Arial Black", sans-serif`;
  ctx.font = font;
  const textW = Math.ceil(ctx.measureText(name).width);
  const chipFont = `${BOT_FONT_PX}px "Anton", Impact, "Arial Black", sans-serif`;
  ctx.font = chipFont;
  const chipW = bot ? Math.ceil(ctx.measureText(BOT_LABEL).width) + BOT_PAD * 2 : 0;
  const lead = bot ? chipW + BOT_GAP : 0;
  canvas.width = textW + PAD_X * 2 + lead;
  canvas.height = FONT_PX + PAD_Y * 2;

  ctx.fillStyle = isLocal ? "#ffd400" : bot ? "#cfd3d8" : "#f3e6c8";
  ctx.strokeStyle = "#141414";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.roundRect(3, 3, canvas.width - 6, canvas.height - 6, 6);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (bot) {
    const chipH = BOT_FONT_PX + 8;
    const chipX = PAD_X - 6;
    ctx.fillStyle = "#141414";
    ctx.beginPath();
    ctx.roundRect(chipX, (canvas.height - chipH) / 2, chipW, chipH, 4);
    ctx.fill();
    ctx.font = chipFont;
    ctx.fillStyle = "#cfd3d8";
    ctx.fillText(BOT_LABEL, chipX + chipW / 2, canvas.height / 2 + 2);
  }

  ctx.font = font; // resizing the canvas resets the context
  ctx.fillStyle = "#141414";
  ctx.fillText(name, lead + (canvas.width - lead) / 2, canvas.height / 2 + 2);

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;
  return { texture, aspect: canvas.width / canvas.height };
}

/**
 * A name placard that always faces the camera and draws over the scenery. `bot`: a bot protester's (#59), marked.
 * `y` is where its middle sits at the desktop zoom. On a zoomed-out phone it
 * grows to stay readable (#107), from its top edge down towards the head, so
 * it never runs into the bars stacked above it.
 */
export function NameTag({ name, isLocal, y, bot = false }: { name: string; isLocal: boolean; y: number; bot?: boolean }) {
  const tag = useMemo(() => drawTag(name, isLocal, bot), [name, isLocal, bot]);
  useEffect(() => () => tag.texture.dispose(), [tag]);
  const grow = useThree((s) => viewMarkerScale(s.size.width, s.size.height));
  const h = TAG_HEIGHT * grow;

  return (
    <sprite position-y={y + TAG_HEIGHT / 2} center={[0.5, 1]} scale={[h * tag.aspect, h, 1]} renderOrder={10}>
      <spriteMaterial map={tag.texture} depthTest={false} depthWrite={false} transparent />
    </sprite>
  );
}
