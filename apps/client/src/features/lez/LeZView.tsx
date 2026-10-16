import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group, MeshBasicMaterial } from "three";
import { LEZ, LeZPhase, leZLineText } from "@manif/shared";
import { damp } from "../../shared/iso/index.ts";
import { net } from "../../shared/net/index.ts";
import { NameTag } from "../player/index.ts";
import { drawBubble } from "../moluchan/index.ts";
import { LEZ_HEIGHT, LeZModel, type LeZLive } from "./leZVisuals.tsx";
import { LEZ_RING as RING } from "./look.ts";

/** On screen he is only ever "Le Z". */
const NAME = "Le Z";
const TAG_Y = LEZ_HEIGHT + 0.45;
const BUBBLE_Y = TAG_Y + 0.45;
const RING_INNER = LEZ.auraRadius - RING.width;

const live: LeZLive = {
  hurts: () => net.getLeZ()?.hurts ?? 0,
};

/**
 * Le Z (#133), while he is on the street: his body, smoothed towards the
 * synced spot, his name tag, his speech bubble (one cameo bubble at a time,
 * the server decides), and the blue ring of his aura on the ground while he
 * holds forth. Re-renders only when he arrives, changes phase, leaves or says
 * a new line; the rest is useFrame work.
 */
export function LeZView() {
  const phase = useSyncExternalStore(net.subscribeLeZ, net.getLeZPhase);
  return phase === null ? null : <LeZ phase={phase} />;
}

function LeZ({ phase }: { phase: LeZPhase }) {
  const root = useRef<Group>(null);
  const body = useRef<Group>(null);
  const ring = useRef<Group>(null);
  const ringMat = useRef<MeshBasicMaterial>(null);
  const discMat = useRef<MeshBasicMaterial>(null);
  const placed = useRef(false);
  const [line, setLine] = useState(() => net.getLeZ()?.line ?? -1);
  const bubble = useMemo(() => (line < 0 ? null : drawBubble(leZLineText(line))), [line]);
  useEffect(() => () => bubble?.texture.dispose(), [bubble]);
  const holding = phase === LeZPhase.Holding;

  useFrame((_, dt) => {
    const g = root.current;
    const b = body.current;
    const z = net.getLeZ();
    if (!g || !b || !z) return;
    if (z.line !== line) setLine(z.line);
    if (!placed.current) {
      g.position.set(z.x, 0, z.z);
      b.rotation.y = z.rotation;
      placed.current = true;
    }
    const k = damp(12, dt);
    g.position.x += (z.x - g.position.x) * k;
    g.position.z += (z.z - g.position.z) * k;
    let dr = z.rotation - b.rotation.y;
    dr = Math.atan2(Math.sin(dr), Math.cos(dr));
    b.rotation.y += dr * k;

    // The ring pulses like Moluchan's: a little wider and brighter, then back.
    const pulse = 0.5 + 0.5 * Math.sin((performance.now() / 1000) * RING.pulseRate * Math.PI * 2);
    ring.current?.scale.setScalar(1 + RING.pulseScale * pulse);
    if (ringMat.current) ringMat.current.opacity = RING.opacity * (1 - RING.pulseOpacity + RING.pulseOpacity * pulse);
    if (discMat.current) discMat.current.opacity = RING.discOpacity * (1 - RING.pulseOpacity + RING.pulseOpacity * pulse);
  });

  return (
    <group ref={root}>
      <group ref={body}>
        <LeZModel live={live} />
      </group>
      {/* His aura (#133): only while he holds forth. Flat on the ground, see-through, no shadow. */}
      <group ref={ring} visible={holding}>
        <mesh position-y={0.045} rotation-x={-Math.PI / 2} renderOrder={1}>
          <ringGeometry args={[RING_INNER, LEZ.auraRadius, 64]} />
          <meshBasicMaterial ref={ringMat} color={RING.color} transparent opacity={RING.opacity} depthWrite={false} />
        </mesh>
        <mesh position-y={0.04} rotation-x={-Math.PI / 2}>
          <circleGeometry args={[RING_INNER, 64]} />
          <meshBasicMaterial ref={discMat} color={RING.color} transparent opacity={RING.discOpacity} depthWrite={false} />
        </mesh>
      </group>
      <NameTag name={NAME} isLocal={false} y={TAG_Y} />
      {bubble && (
        <sprite position-y={BUBBLE_Y} center={[0.5, 0]} scale={[bubble.width, bubble.height, 1]} renderOrder={11}>
          <spriteMaterial map={bubble.texture} depthTest={false} depthWrite={false} transparent />
        </sprite>
      )}
    </group>
  );
}
