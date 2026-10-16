/*
 * The studio that draws one archetype's lobby portrait (#126), driven by
 * scripts/portraits/render.ts. Dev only: portraits.html is not an input of
 * the build (Vite builds index.html alone), so none of this ships.
 *
 * The archetype's real body (player/portrait.ts picks the variant), painted
 * like in the game, in its idle pose, lit like the street (game/lighting.ts),
 * seen 3/4 from the front, on a transparent background. Every portrait uses
 * the same camera, so the bodies keep their heights next to each other.
 *
 * Drawn big, then shrunk to the portrait's size on a 2D canvas (smooth edges),
 * and handed to the script as a WebP data URL by `window.portrait()`.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Archetype, archetypeOf } from "@manif/shared";
import { GROUND_BOUNCE, SKY, SKY_FILL, SUN_DIRECTION, SUN_INTENSITY } from "../../features/game/index.ts";
import { MODELS, isGltfSettled } from "../../features/models/index.ts";
import { CgtKitView, PORTRAIT_CGT_KIT, portraitBodyUrl, portraitPaint, useProtesterBody, type KitShow } from "../../features/player/index.ts";
import { PORTRAIT_HEIGHT, PORTRAIT_WIDTH } from "../../features/archetype/index.ts";

/** Drawn this many times bigger than the image, then shrunk. */
const SUPERSAMPLE = 4;
/** The camera: a narrow lens from a few metres, 3/4 front (turned towards +X, the sun's side), a bit above the waist. */
const FOV = 17;
const DISTANCE = 6.5;
const AZIMUTH = (32 * Math.PI) / 180;
const ELEVATION = (9 * Math.PI) / 180;
const LOOK_AT_Y = 0.98;
/** How far into the idle loop the pose is taken, in seconds. */
const IDLE_AT = 0.4;
/** Frames drawn after everything is in, before the shot. */
const SETTLE_FRAMES = 6;
const WEBP_QUALITY = 0.9;

/** The barbecue cold: no smoke puffs in a still picture. */
const GRILL_STILL: KitShow = { megaphoneInHand: false, grill: true, smoke: false };

declare global {
  interface Window {
    /** Resolves to the portrait as a WebP data URL once the body is drawn. */
    portrait?: () => Promise<string>;
  }
}

function Body({ archetype, onReady }: { archetype: Archetype; onReady: () => void }) {
  const paint = useMemo(() => portraitPaint(archetype), [archetype]);
  const body = useProtesterBody(portraitBodyUrl(archetype), paint);
  const kit = archetype === Archetype.Cgt ? PORTRAIT_CGT_KIT : null;
  const posed = useRef(false);
  const frames = useRef(0);

  useEffect(() => {
    if (!body || posed.current) return;
    body.animator.play("idle", { fade: 0 });
    body.animator.update(IDLE_AT);
    posed.current = true;
  }, [body]);

  useFrame(() => {
    if (!posed.current || frames.current < 0) return;
    if (kit && !isGltfSettled(MODELS.accessories.barbecue)) return;
    if (++frames.current >= SETTLE_FRAMES) {
      frames.current = -1;
      onReady();
    }
  });

  if (!body) return null;
  return (
    <>
      <primitive object={body.root} dispose={null} />
      {kit && <CgtKitView root={body.root} kit={kit} show={() => GRILL_STILL} />}
    </>
  );
}

function Rig() {
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    const flat = DISTANCE * Math.cos(ELEVATION);
    camera.position.set(flat * Math.sin(AZIMUTH), LOOK_AT_Y + DISTANCE * Math.sin(ELEVATION), flat * Math.cos(AZIMUTH));
    camera.lookAt(0, LOOK_AT_Y, 0);
  }, [camera]);
  return (
    <>
      <hemisphereLight args={[SKY, GROUND_BOUNCE, SKY_FILL]} />
      <directionalLight position={[...SUN_DIRECTION]} intensity={SUN_INTENSITY} />
    </>
  );
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

  return (
    <div style={{ width: PORTRAIT_WIDTH * SUPERSAMPLE, height: PORTRAIT_HEIGHT * SUPERSAMPLE }}>
      <Canvas
        ref={canvas}
        dpr={1}
        gl={{ preserveDrawingBuffer: true, alpha: true, antialias: true }}
        camera={{ fov: FOV, near: 0.5, far: 30, position: [0, LOOK_AT_Y, DISTANCE] }}
      >
        <Rig />
        <Body archetype={archetype} onReady={ready} />
      </Canvas>
    </div>
  );
}
