import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { CanvasTexture, LinearFilter, SRGBColorSpace, type Mesh, type MeshBasicMaterial, type Sprite, type SpriteMaterial } from "three";
import { CRS_STATS, CrsKind } from "@manif/shared";
import { net, type LbdBall } from "../../shared/net/index.ts";

const LBD = CRS_STATS[CrsKind.Lbd].lbd;
const SPEED = LBD?.ballSpeed ?? 30;
const RANGE = LBD?.ballRange ?? 22;
/** A bit bigger than the server's ball, so it reads at the default zoom and on a phone. */
const BALL_RADIUS = Math.max(0.24, LBD?.ballRadius ?? 0);
/** It flies at about waist height. */
const BALL_Y = 0.9;
const BALL_COLOR = "#ff3d9a";
/** At most this many balls drawn at once (at most two LBD on the street, a shot every few seconds each). */
const POOL = 4;
/** The "pop" where a ball stops: the ball bounces off and fades, a ring spreads on the ground. */
const PUFF_MS = 420;
const BOUNCE_BACK = 0.9;
const BOUNCE_UP = 0.8;
/** On a protester, a comic "BOING !" pops over them for this long. */
const BOING_MS = 750;
const BOING_W = 1.7;
const BOING_H = 0.85;
const BOING_Y = 2.3;

/** A comic-book "BOING !" on a white burst: drawn once into a small canvas texture. */
function drawBoing(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 200;
  canvas.height = 100;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d canvas unavailable");
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  ctx.beginPath();
  const spikes = 14;
  for (let i = 0; i < spikes * 2; i++) {
    const a = (i / (spikes * 2)) * Math.PI * 2;
    const r = i % 2 === 0 ? 1 : 0.78;
    const x = cx + Math.cos(a) * r * 96;
    const y = cy + Math.sin(a) * r * 46;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fillStyle = "#fffbe6";
  ctx.strokeStyle = "#141414";
  ctx.lineWidth = 5;
  ctx.fill();
  ctx.stroke();
  ctx.font = `44px "Anton", Impact, "Arial Black", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = BALL_COLOR;
  ctx.strokeStyle = "#141414";
  ctx.lineWidth = 3;
  ctx.strokeText("BOING !", cx, cy + 2);
  ctx.fillText("BOING !", cx, cy + 2);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  return texture;
}

/** Where a ball is at `now`: flying (`flight` ≥ 0, along its line), popping where it stopped (`puff` 0..1), or neither. */
interface BallPose {
  x: number;
  z: number;
  /** -1 when not flying. */
  flight: number;
  /** -1 when not popping; else how far through the pop, 0..1. */
  puff: number;
  /** How far through the "BOING !", 0..1, or -1: only on a protester. */
  boing: number;
}

function poseOf(ball: LbdBall, now: number, out: BallPose): BallPose {
  const { shot, impact } = ball;
  const travelled = ((now - ball.firedAt) / 1000) * SPEED;
  // Where it stops: its impact projected on its line, or its range while the impact is not here yet.
  const stopAt = impact ? Math.max(0, (impact.x - shot.x) * shot.dirX + (impact.z - shot.z) * shot.dirZ) : RANGE;
  out.flight = -1;
  out.puff = -1;
  out.boing = -1;
  if (travelled < stopAt) {
    out.flight = travelled;
    out.x = shot.x + shot.dirX * travelled;
    out.z = shot.z + shot.dirZ * travelled;
    return out;
  }
  if (!impact) return out;
  const endAt = Math.max(ball.firedAt + (stopAt / SPEED) * 1000, ball.impactAt);
  const age = now - endAt;
  out.x = impact.x;
  out.z = impact.z;
  if (age < PUFF_MS) out.puff = Math.max(0, age / PUFF_MS);
  if (impact.hit !== "" && age < BOING_MS) out.boing = Math.max(0, age / BOING_MS);
  return out;
}

/** The `index`-th ball (in arrival order) that is still flying or popping at `now`, posed into `out`; null past the last one. */
function nthBall(index: number, now: number, out: BallPose): LbdBall | null {
  let seen = 0;
  for (const ball of net.getLbdBalls().values()) {
    poseOf(ball, now, out);
    if (out.flight < 0 && out.puff < 0 && out.boing < 0) continue;
    if (seen++ === index) return ball;
  }
  return null;
}

/**
 * The LBD's rubber balls (#73): each flies from its shot along its line at
 * the unit's ball speed, about waist high, until its impact arrives (or its
 * range runs out), then pops: the ball bounces back up and fades, a ring
 * spreads on the ground, and on a protester a comic "BOING !" pops over
 * them. All from the shots and impacts kept by the net store, in useFrame,
 * with a small fixed pool of meshes: no React state per ball.
 */
export function LbdBalls() {
  const texture = useMemo(() => drawBoing(), []);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <>
      {Array.from({ length: POOL }, (_, i) => (
        <BallSlot key={i} index={i} boingTexture={texture} />
      ))}
    </>
  );
}

/** One of the pool's slots: draws the `index`-th live ball, if any. */
function BallSlot({ index, boingTexture }: { index: number; boingTexture: CanvasTexture }) {
  const ballRef = useRef<Mesh>(null);
  const shadowRef = useRef<Mesh>(null);
  const ringRef = useRef<Mesh>(null);
  const ringMat = useRef<MeshBasicMaterial>(null);
  const boingRef = useRef<Sprite>(null);
  const boingMat = useRef<SpriteMaterial>(null);
  const pose = useRef<BallPose>({ x: 0, z: 0, flight: -1, puff: -1, boing: -1 });

  useFrame(() => {
    const ball = ballRef.current;
    const shadow = shadowRef.current;
    const ring = ringRef.current;
    const boing = boingRef.current;
    if (!ball || !shadow || !ring || !boing) return;
    const p = pose.current;
    const live = nthBall(index, performance.now(), p);
    ball.visible = live !== null && (p.flight >= 0 || p.puff >= 0);
    shadow.visible = ball.visible;
    ring.visible = live !== null && p.puff >= 0;
    boing.visible = live !== null && p.boing >= 0;
    if (!live) return;
    const { dirX, dirZ } = live.shot;
    if (p.flight >= 0) {
      ball.position.set(p.x, BALL_Y, p.z);
      ball.scale.setScalar(1);
      shadow.position.set(p.x, 0.03, p.z);
      shadow.scale.setScalar(1);
    } else if (p.puff >= 0) {
      // Bounces back off what it hit, up and down, shrinking away.
      const t = p.puff;
      ball.position.set(p.x - dirX * BOUNCE_BACK * t, BALL_Y + Math.sin(t * Math.PI) * BOUNCE_UP - t * 0.4, p.z - dirZ * BOUNCE_BACK * t);
      ball.scale.setScalar(t < 0.12 ? 1.25 : 1 - 0.8 * t);
      shadow.position.set(ball.position.x, 0.03, ball.position.z);
      shadow.scale.setScalar(1 - 0.8 * t);
      ring.position.set(p.x, 0.05, p.z);
      ring.scale.setScalar(0.4 + 1.4 * t);
      if (ringMat.current) ringMat.current.opacity = 1 - t;
    }
    if (p.boing >= 0) {
      const t = p.boing;
      const pop = t < 0.2 ? 0.6 + 0.6 * (t / 0.2) : 1.2 - 0.2 * Math.min(1, (t - 0.2) / 0.2);
      boing.position.set(p.x, BOING_Y + t * 0.4, p.z);
      boing.scale.set(BOING_W * pop, BOING_H * pop, 1);
      if (boingMat.current) boingMat.current.opacity = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
    }
  });

  return (
    <>
      <mesh ref={ballRef} visible={false} castShadow>
        <sphereGeometry args={[BALL_RADIUS, 16, 12]} />
        <meshStandardMaterial color={BALL_COLOR} emissive={BALL_COLOR} emissiveIntensity={0.35} roughness={0.35} />
      </mesh>
      <mesh ref={shadowRef} rotation-x={-Math.PI / 2} visible={false}>
        <circleGeometry args={[BALL_RADIUS * 0.9, 14]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.3} depthWrite={false} />
      </mesh>
      <mesh ref={ringRef} rotation-x={-Math.PI / 2} visible={false}>
        <ringGeometry args={[0.35, 0.5, 24]} />
        <meshBasicMaterial ref={ringMat} color="#fff3c4" transparent depthWrite={false} />
      </mesh>
      <sprite ref={boingRef} visible={false} renderOrder={14}>
        <spriteMaterial ref={boingMat} map={boingTexture} transparent depthTest={false} depthWrite={false} />
      </sprite>
    </>
  );
}
