import { useEffect, useMemo, type RefObject } from "react";
import { useThree } from "@react-three/fiber";
import { CanvasTexture, LinearFilter, SRGBColorSpace, type Group } from "three";
import { viewMarkerScale } from "../../shared/iso/index.ts";

/** Size of the mark in world units (about 36 px wide at the desktop zoom; grown on a zoomed-out phone, #107). */
const MARK_W = 0.9;
const MARK_H = 1.1;

/** A comic-book "!" on a hi-vis burst: drawn once into a small canvas texture. */
function drawMark(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 90;
  canvas.height = 110;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d canvas unavailable");
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  // A spiky burst.
  ctx.beginPath();
  const spikes = 10;
  for (let i = 0; i < spikes * 2; i++) {
    const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? 50 : 34;
    const x = cx + Math.cos(a) * r * 0.85;
    const y = cy + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = "#ffd400";
  ctx.strokeStyle = "#141414";
  ctx.lineWidth = 5;
  ctx.fill();
  ctx.stroke();
  ctx.font = `64px "Anton", Impact, "Arial Black", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#d42a20";
  ctx.fillText("!", cx, cy + 3);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  return texture;
}

/**
 * The grab's tell (#70): a "!" popping over a CRS winding up a grab, drawn on
 * top of everything. The body shows it and pops it from useFrame through
 * `group` (visible only during the wind-up). Placeholder look.
 */
export function WindupMark({ group, y }: { group: RefObject<Group | null>; y: number }) {
  const texture = useMemo(() => drawMark(), []);
  useEffect(() => () => texture.dispose(), [texture]);
  const grow = useThree((s) => viewMarkerScale(s.size.width, s.size.height));
  return (
    <group ref={group} position-y={y} visible={false}>
      <sprite scale={[MARK_W * grow, MARK_H * grow, 1]} renderOrder={14}>
        <spriteMaterial map={texture} transparent depthTest={false} depthWrite={false} />
      </sprite>
    </group>
  );
}
