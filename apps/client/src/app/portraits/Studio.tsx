/*
 * The studio that draws one archetype's lobby portrait (#126), driven by
 * scripts/portraits/render.ts. Dev only: portraits.html is not an input of
 * the build (Vite builds index.html alone), so none of this ships.
 *
 * The archetype's real body (player/portrait.ts picks the variant), painted
 * like in the game, in its idle pose, lit like the street (game/lighting.ts),
 * seen 3/4 from the front, on a transparent background. The body, the camera
 * and the light are the ones the lobby's live turntable (#128) draws, so the
 * pictures and the 3D match.
 *
 * Drawn big, then shrunk to the portrait's size on a 2D canvas (smooth edges),
 * and handed to the script as a WebP data URL by `window.portrait()`.
 */
import { useEffect, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { archetypeOf } from "@manif/shared";
import { PortraitLights } from "../../features/game/index.ts";
import { PORTRAIT_CAMERA, PortraitFigure, portraitCameraPosition, portraitPropsSettled, posePortrait, usePortraitBody } from "../../features/player/index.ts";
import { PORTRAIT_HEIGHT, PORTRAIT_WIDTH } from "../../features/archetype/index.ts";

/** Drawn this many times bigger than the image, then shrunk. */
const SUPERSAMPLE = 4;
/** Frames drawn after everything is in, before the shot. */
const SETTLE_FRAMES = 6;
const WEBP_QUALITY = 0.9;

declare global {
  interface Window {
    /** Resolves to the portrait as a WebP data URL once the body is drawn. */
    portrait?: () => Promise<string>;
  }
}

function Body({ archetype, onReady }: { archetype: number; onReady: () => void }) {
  const body = usePortraitBody(archetype);
  const frames = useRef(0);

  useFrame(() => {
    if (!body || frames.current < 0) return;
    posePortrait(body);
    if (!portraitPropsSettled(archetype)) return;
    if (++frames.current >= SETTLE_FRAMES) {
      frames.current = -1;
      onReady();
    }
  });

  return body && <PortraitFigure id={archetype} body={body} />;
}

function Rig() {
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    camera.position.set(...portraitCameraPosition());
    camera.lookAt(0, PORTRAIT_CAMERA.lookAtY, 0);
  }, [camera]);
  return <PortraitLights />;
}

/** The drawn canvas, shrunk to the portrait's size and encoded. */
function shrink(gl: HTMLCanvasElement): string {
  const out = document.createElement("canvas");
  out.width = PORTRAIT_WIDTH;
  out.height = PORTRAIT_HEIGHT;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("no 2D canvas");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  // Halve step by step: one big jump would skip pixels.
  let src: CanvasImageSource = gl;
  let w = gl.width;
  let h = gl.height;
  while (w / 2 >= PORTRAIT_WIDTH) {
    const step = document.createElement("canvas");
    step.width = w = Math.round(w / 2);
    step.height = h = Math.round(h / 2);
    step.getContext("2d")?.drawImage(src, 0, 0, w, h);
    src = step;
  }
  ctx.drawImage(src, 0, 0, PORTRAIT_WIDTH, PORTRAIT_HEIGHT);
  return out.toDataURL("image/webp", WEBP_QUALITY);
}

export function Studio() {
  const archetype = archetypeOf(Number(new URLSearchParams(location.search).get("archetype") ?? 0));
  const canvas = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState<() => void>(() => () => {});

  useEffect(() => {
    const done = new Promise<void>((resolve) => setReady(() => resolve));
    window.portrait = async () => {
      await done;
      if (!canvas.current) throw new Error("no canvas");
      return shrink(canvas.current);
    };
  }, []);

  const { fov, near, far, distance, lookAtY } = PORTRAIT_CAMERA;
  return (
    <div style={{ width: PORTRAIT_WIDTH * SUPERSAMPLE, height: PORTRAIT_HEIGHT * SUPERSAMPLE }}>
      <Canvas ref={canvas} dpr={1} gl={{ preserveDrawingBuffer: true, alpha: true, antialias: true }} camera={{ fov, near, far, position: [0, lookAtY, distance] }}>
        <Rig />
        <Body archetype={archetype} onReady={ready} />
      </Canvas>
    </div>
  );
}
