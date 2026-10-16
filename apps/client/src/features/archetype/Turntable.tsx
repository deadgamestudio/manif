/*
 * The role picker's live characters (#128): each card's archetype drawn in
 * 3D, turning slowly on the spot, the picked one a bit faster, with a happy
 * hop when it gets picked. Lazy-loaded by ArchetypePicker (React.lazy), so
 * three.js stays out of the first download.
 *
 * One WebGL canvas for the whole picker, never one per card (phones allow few
 * WebGL contexts). It sits out of sight, a strip of eight portrait-sized
 * cells: each frame draws every body in its own cell (scissored viewport,
 * the other bodies hidden), then copies each cell onto the small 2D canvas
 * the picker put in that card's portrait slot. The copies live inside the
 * cards, so they scroll, tilt (the picked card) and stack exactly like the
 * pictures, and never catch a touch.
 *
 * The cells are the pictures' size (portraits.ts) and the body, pose, camera
 * and light are the studio's (player/PortraitFigure.tsx, game/PortraitLights),
 * so the first frame matches the still picture and the swap is invisible.
 * The bodies come through the models' shared cache, so the lobby doubles as
 * a preload for the march.
 */
import { useEffect, useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { PerspectiveCamera, type Group } from "three";
import { ARCHETYPE_IDS } from "@manif/shared";
import { PortraitLights } from "../game/index.ts";
import {
  PORTRAIT_CAMERA,
  PortraitFigure,
  portraitCameraPosition,
  portraitPropsSettled,
  posePortrait,
  usePortraitBody,
  type ProtesterBody,
} from "../player/index.ts";
import { PORTRAIT_HEIGHT, PORTRAIT_WIDTH } from "./portraits.ts";
import { HOP_SECONDS, hopHeight, turnSpeed } from "./turntableMotion.ts";

/** At most this many frames a second: plenty for a slow turn, and half the work on a 60 Hz phone. */
const FPS = 30;
/** A longer gap (the tab came back) is not caught up. */
const MAX_STEP = 0.1;

interface Figure {
  group: Group;
  body: ProtesterBody;
  angle: number;
  /** Not drawn yet: its first frame is the still picture's pose, unturned. */
  fresh: boolean;
}

export interface TurntableProps {
  /** The 2D canvas in each archetype's portrait slot, by archetype id. */
  slots: ReadonlyMap<number, HTMLCanvasElement>;
  /** The archetype the player has picked. */
  picked: number;
  /** Archetype `id`'s character has been drawn on its slot: hide its picture. */
  onShown: (id: number) => void;
  /** The WebGL context was lost: go back to the pictures. */
  onLost: () => void;
}

function FigureSlot({ id, figures }: { id: number; figures: Map<number, Figure> }) {
  const body = usePortraitBody(id);
  const group = useRef<Group>(null);
  useEffect(() => {
    if (!body || !group.current) return;
    figures.set(id, { group: group.current, body, angle: 0, fresh: true });
    return () => void figures.delete(id);
  }, [id, body, figures]);
  return <group ref={group}>{body && <PortraitFigure id={id} body={body} />}</group>;
}

function Director({ slots, picked, onShown, figures }: Omit<TurntableProps, "onLost"> & { figures: Map<number, Figure> }) {
  const camera = useMemo(() => {
    const { fov, near, far, lookAtY } = PORTRAIT_CAMERA;
    const c = new PerspectiveCamera(fov, PORTRAIT_WIDTH / PORTRAIT_HEIGHT, near, far);
    c.position.set(...portraitCameraPosition());
    c.lookAt(0, lookAtY, 0);
    c.updateProjectionMatrix();
    return c;
  }, []);
  const contexts = useRef(new WeakMap<HTMLCanvasElement, CanvasRenderingContext2D | null>());
  const shown = useRef(new Set<number>());
  const wait = useRef(Infinity);
  /** The hop under way: whose, and how far into it. */
  const hop = useRef<{ id: number; t: number } | null>(null);
  const lastPicked = useRef(picked);
  useEffect(() => {
    if (picked === lastPicked.current) return;
    lastPicked.current = picked;
    hop.current = { id: picked, t: 0 };
  }, [picked]);

  // Priority 1: this draws the frame, R3F doesn't.
  useFrame(({ gl, scene }, delta) => {
    wait.current += delta;
    if (wait.current < 1 / FPS) return;
    const dt = Math.min(wait.current, MAX_STEP);
    wait.current = 0;

    const h = hop.current;
    if (h) {
      h.t += dt;
      if (h.t > HOP_SECONDS) hop.current = null;
    }

    gl.setScissorTest(true);
    const drawn: number[] = [];
    ARCHETYPE_IDS.forEach((id, cell) => {
      const figure = figures.get(id);
      if (!figure || !slots.has(id) || !portraitPropsSettled(id)) return;
      posePortrait(figure.body);
      if (figure.fresh) figure.fresh = false;
      else {
        figure.angle = (figure.angle + turnSpeed(id === picked) * dt) % (2 * Math.PI);
        figure.body.animator.update(dt);
      }
      figure.group.rotation.y = figure.angle;
      figure.group.position.y = h?.id === id ? hopHeight(h.t) : 0;
      for (const other of figures.values()) other.group.visible = other === figure;
      const x = cell * PORTRAIT_WIDTH;
      gl.setViewport(x, 0, PORTRAIT_WIDTH, PORTRAIT_HEIGHT);
      gl.setScissor(x, 0, PORTRAIT_WIDTH, PORTRAIT_HEIGHT);
      gl.render(scene, camera);
      drawn.push(cell);
    });
    gl.setScissorTest(false);

    // Copied in the same frame, before the browser clears the drawing buffer. The
    // viewports count from the bottom, the copy from the top: should the canvas
    // ever come out taller than a cell, the cells are at its bottom.
    const top = gl.domElement.height - PORTRAIT_HEIGHT;
    for (const cell of drawn) {
      const id = ARCHETYPE_IDS[cell]!;
      const slot = slots.get(id)!;
      let ctx = contexts.current.get(slot);
      if (ctx === undefined) contexts.current.set(slot, (ctx = slot.getContext("2d")));
      if (!ctx) continue;
      ctx.clearRect(0, 0, PORTRAIT_WIDTH, PORTRAIT_HEIGHT);
      ctx.drawImage(gl.domElement, cell * PORTRAIT_WIDTH, top, PORTRAIT_WIDTH, PORTRAIT_HEIGHT, 0, 0, PORTRAIT_WIDTH, PORTRAIT_HEIGHT);
      if (!shown.current.has(id)) {
        shown.current.add(id);
        onShown(id);
      }
    }
  }, 1);

  return null;
}

/** Calls `onLost` if the browser takes the WebGL context away (too many contexts, GPU reset...). */
function LossWatch({ onLost }: { onLost: () => void }) {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const canvas = gl.domElement;
    canvas.addEventListener("webglcontextlost", onLost);
    return () => canvas.removeEventListener("webglcontextlost", onLost);
  }, [gl, onLost]);
  return null;
}

export default function Turntable({ slots, picked, onShown, onLost }: TurntableProps) {
  const figures = useMemo(() => new Map<number, Figure>(), []);
  // On <body>, not in the picker: the placard is tilted (a CSS transform), which
  // would skew R3F's measure of the canvas and so its size.
  return createPortal(
    <div className="turntable-gl" aria-hidden="true">
      <Canvas
        dpr={1}
        gl={{ alpha: true, antialias: true, powerPreference: "low-power" }}
        style={{ width: PORTRAIT_WIDTH * ARCHETYPE_IDS.length, height: PORTRAIT_HEIGHT, pointerEvents: "none" }}
      >
        <PortraitLights />
        {ARCHETYPE_IDS.map((id) => (
          <FigureSlot key={id} id={id} figures={figures} />
        ))}
        <Director slots={slots} picked={picked} onShown={onShown} figures={figures} />
        <LossWatch onLost={onLost} />
      </Canvas>
    </div>,
    document.body,
  );
}
