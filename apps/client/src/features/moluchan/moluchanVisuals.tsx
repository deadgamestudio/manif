/*
 * LOOK for Jeun-Lac Moluchan (#85): a big lad in a brown velvet jacket, a
 * red scarf, and a megaphone (a cone) held up to his mouth. Primitives, all
 * in this file, so Jordan's model replaces it here without touching
 * MoluchanView. A caricature: no face, no logo, no party colours beyond the
 * scarf.
 *
 * The revised Moluchan model (#28) replaces the
 * neutral stand-in, with its own scarf and megaphone pose. The megaphone stays in his
 * hand, on the protester idle and walk clips; the primitives show while it
 * loads, and for good if it fails.
 *
 * Drawn like a protester (PlayerAvatar.tsx): feet at y = 0, up +Y, front +Z,
 * but about 1.3 times as big (MOLUCHAN.radius is 0.55 against a protester's 0.4).
 */
import { useMemo, useRef, useState, type RefObject } from "react";
import { createPortal, useFrame } from "@react-three/fiber";
import { CanvasTexture, DoubleSide, LinearFilter, SRGBColorSpace, Vector3, type Group } from "three";
import { MOLUCHAN, MoluchanPhase } from "@manif/shared";
import { SKIN } from "../archetype/index.ts";
import { MODELS, useStaticModel } from "../models/index.ts";
import { BodyMotion, MOVE_FROM, WALK_AUTHORED_SPEED, useProtesterBody } from "../player/index.ts";
import { damp } from "../../shared/iso/index.ts";
import { net } from "../../shared/net/index.ts";

const R = MOLUCHAN.radius;
const CAPSULE_LENGTH = 1.4;
/** His height, feet to the top of the head. */
export const MOLUCHAN_HEIGHT = CAPSULE_LENGTH + R * 2;

const SUIT = "#7b5e3b";
const SHIRT = "#eceff1";
const SCARF = "#d32f2f";
const MEGAPHONE = "#f5f5f5";
const MEGAPHONE_BAND = "#ff7043";

export const MOLUCHAN_LOOK = {
  /** The ring of his aura (#85): warm red-orange, see-through, pulsing. */
  ringColor: "#ff5a2a",
  /** How wide the drawn band is, inside MOLUCHAN.auraRadius. */
  ringWidth: 0.28,
  ringOpacity: 0.7,
  /** The faint disc inside the ring. */
  discOpacity: 0.1,
  /** Pulses this many times a second, its opacity and size swinging by these fractions. */
  pulseRate: 1.2,
  pulseOpacity: 0.3,
  pulseScale: 0.03,
  /** Arm angles around the shoulder, in radians (0 hangs down, −π/2 points forward, −π straight up). */
  armMegaphone: -1.9,
  armFree: -0.15,
  /** Grabbed: both arms up in outrage, the body leaning back. */
  armOutraged: -2.9,
  grabbedLean: -0.3,
  /** Haranguing: a bob of the megaphone arm, in radians and per second. */
  harangueAngle: 0.18,
  harangueSpeed: 7,
} as const;

/** The stand-in body (#28): the neutral protester, this much bigger (his radius against a protester's). */
const MODEL_SCALE = 1.3;
/** Where the megaphone's grip (its `prise-main` node) sits in the model, to put it in the hand. */
const MEGAPHONE_GRIP: readonly [number, number, number] = [0, -0.115, 0.096];
const MEGAPHONE_HAND = "socket_hand_L";

/**
 * The body. `megaphoneArm` and `freeArm` pivot at the shoulders (rotation.x),
 * set by MoluchanView each frame (the primitive arms; the stand-in model
 * plays its clips instead).
 */
export function MoluchanModel({ megaphoneArm, freeArm }: { megaphoneArm: RefObject<Group | null>; freeArm: RefObject<Group | null> }) {
  const model = useProtesterBody(MODELS.characters.moluchan);
  const megaphone = useStaticModel(MODELS.props.megaphone);
  const hand = useMemo(() => model?.root.getObjectByName(MEGAPHONE_HAND) ?? null, [model]);
  const motion = useMemo(() => (model ? new BodyMotion(model.animator) : null), [model]);
  const anchor = useRef<Group>(null);
  const [last] = useState(() => new Vector3(Number.NaN, 0, 0));
  const [here] = useState(() => new Vector3());
  const speed = useRef(0);

  useFrame((_, dt) => {
    const a = anchor.current;
    if (!motion || !a) return;
    a.getWorldPosition(here);
    if (Number.isFinite(last.x) && dt > 0) speed.current += (here.distanceTo(last) / dt - speed.current) * damp(10, dt);
    last.copy(here);
    const grabbed = net.getMoluchanPhase() === MoluchanPhase.Grabbed;
    // His stride is 1.3 times a protester's, so the same speed is a slower walk.
    const pace = speed.current / MODEL_SCALE;
    const clip = grabbed ? "air-flail" : pace >= MOVE_FROM ? "walk" : "idle";
    motion.drive({ name: clip, hold: false, timeScale: clip === "walk" ? Math.min(1.8, Math.max(0.6, pace / WALK_AUTHORED_SPEED)) : 1 }, pace);
    motion.tick(dt, true);
  });

  if (model) {
    return (
      <group ref={anchor} scale={MODEL_SCALE}>
        <primitive object={model.root} dispose={null} />
        {hand &&
          megaphone &&
          createPortal(
            <group position={MEGAPHONE_GRIP}>
              <primitive object={megaphone} dispose={null} />
            </group>,
            hand,
          )}
      </group>
    );
  }
  return <MoluchanPlaceholder megaphoneArm={megaphoneArm} freeArm={freeArm} />;
}

function MoluchanPlaceholder({ megaphoneArm, freeArm }: { megaphoneArm: RefObject<Group | null>; freeArm: RefObject<Group | null> }) {
  const shoulder = MOLUCHAN_HEIGHT * 0.7;
  return (
    <group>
      {/* The suit. */}
      <mesh position-y={MOLUCHAN_HEIGHT / 2} castShadow>
        <capsuleGeometry args={[R, CAPSULE_LENGTH, 4, 14]} />
        <meshStandardMaterial color={SUIT} />
      </mesh>
      {/* The shirt front, a white strip down his chest. */}
      <mesh position={[0, MOLUCHAN_HEIGHT * 0.56, R - 0.03]}>
        <boxGeometry args={[0.24, 0.6, 0.08]} />
        <meshStandardMaterial color={SHIRT} />
      </mesh>
      {/* The red scarf round the neck, one end hanging down the front. */}
      <mesh position-y={MOLUCHAN_HEIGHT * 0.73} rotation-x={Math.PI / 2} castShadow>
        <torusGeometry args={[R * 0.85, 0.13, 8, 22]} />
        <meshStandardMaterial color={SCARF} />
      </mesh>
      <mesh position={[-0.2, MOLUCHAN_HEIGHT * 0.6, R + 0.04]} rotation-z={0.12} castShadow>
        <boxGeometry args={[0.16, 0.5, 0.08]} />
        <meshStandardMaterial color={SCARF} />
      </mesh>
      {/* Facing: a small nose, like the protesters'. */}
      <mesh position={[0, MOLUCHAN_HEIGHT * 0.84, R]} castShadow>
        <boxGeometry args={[0.22, 0.22, 0.3]} />
        <meshStandardMaterial color="#212121" />
      </mesh>
      {/* The megaphone arm (+X), the cone at the hand, its wide end pointing forward. */}
      <group ref={megaphoneArm} position={[R + 0.1, shoulder, 0]} rotation-x={MOLUCHAN_LOOK.armMegaphone}>
        <mesh position-y={-0.38} castShadow>
          <boxGeometry args={[0.2, 0.76, 0.2]} />
          <meshStandardMaterial color={SUIT} />
        </mesh>
        <mesh position-y={-0.82} castShadow>
          <boxGeometry args={[0.16, 0.14, 0.16]} />
          <meshStandardMaterial color={SKIN} />
        </mesh>
        {/* Past the hand, along the arm (forward once it is raised): the narrow end in the hand, the wide end out. */}
        <mesh position-y={-1.17} castShadow>
          <cylinderGeometry args={[0.1, 0.32, 0.62, 16, 1, true]} />
          <meshStandardMaterial color={MEGAPHONE} side={DoubleSide} />
        </mesh>
        <mesh position-y={-1.48} rotation-x={Math.PI / 2}>
          <torusGeometry args={[0.31, 0.04, 6, 18]} />
          <meshStandardMaterial color={MEGAPHONE_BAND} />
        </mesh>
      </group>
      {/* The other arm (-X): down at rest, up in outrage when grabbed. */}
      <group ref={freeArm} position={[-R - 0.1, shoulder, 0]} rotation-x={MOLUCHAN_LOOK.armFree}>
        <mesh position-y={-0.38} castShadow>
          <boxGeometry args={[0.2, 0.76, 0.2]} />
          <meshStandardMaterial color={SUIT} />
        </mesh>
        <mesh position-y={-0.82} castShadow>
          <boxGeometry args={[0.16, 0.14, 0.16]} />
          <meshStandardMaterial color={SKIN} />
        </mesh>
      </group>
    </group>
  );
}

/** World units per canvas pixel of the speech bubble: about the name tags' scale. */
const BUBBLE_UNIT = 0.0105;
const FONT_PX = 40;
const LINE_PX = 46;
const MAX_TEXT_PX = 520;
const PAD_X = 26;
const PAD_Y = 18;
const TAIL_PX = 22;

/** Splits `text` into lines no wider than MAX_TEXT_PX. */
function wrap(ctx: CanvasRenderingContext2D, text: string): string[] {
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(" ")) {
    const next = current ? `${current} ${word}` : word;
    if (current && ctx.measureText(next).width > MAX_TEXT_PX) {
      lines.push(current);
      current = word;
    } else current = next;
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Draws a line of his once into a canvas texture: a white comic bubble with
 * marker lettering and a tail pointing down at him. Only when the line
 * changes (every few seconds), never per frame.
 */
export function drawBubble(text: string): { texture: CanvasTexture; width: number; height: number } {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d canvas unavailable");
  const font = `${FONT_PX}px "Permanent Marker", "Comic Sans MS", "Chalkboard SE", cursive`;
  ctx.font = font;
  const lines = wrap(ctx, text);
  const textW = Math.ceil(Math.max(...lines.map((l) => ctx.measureText(l).width)));
  canvas.width = textW + PAD_X * 2;
  canvas.height = lines.length * LINE_PX + PAD_Y * 2 + TAIL_PX;
  const boxH = canvas.height - TAIL_PX;

  ctx.fillStyle = "#fffaf0";
  ctx.strokeStyle = "#141414";
  ctx.lineWidth = 6;
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.roundRect(3, 3, canvas.width - 6, boxH - 6, 22);
  ctx.fill();
  ctx.stroke();
  // The tail, drawn over the box's bottom edge so the outline opens into it.
  const cx = canvas.width / 2;
  ctx.beginPath();
  ctx.moveTo(cx - 18, boxH - 7);
  ctx.lineTo(cx, canvas.height - 3);
  ctx.lineTo(cx + 18, boxH - 7);
  ctx.fill();
  ctx.stroke();
  ctx.fillRect(cx - 15, boxH - 12, 30, 8);

  ctx.font = font; // resizing the canvas resets the context
  ctx.fillStyle = "#141414";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  lines.forEach((l, i) => ctx.fillText(l, cx, PAD_Y + LINE_PX * (i + 0.5) + 2));

  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  texture.generateMipmaps = false;
  return { texture, width: canvas.width * BUBBLE_UNIT, height: canvas.height * BUBBLE_UNIT };
}
