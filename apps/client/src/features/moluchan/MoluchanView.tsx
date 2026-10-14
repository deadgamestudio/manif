import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group, MeshBasicMaterial } from "three";
import { MOLUCHAN, MoluchanPhase, moluchanLineText } from "@manif/shared";
import { damp } from "../../shared/iso/index.ts";
import { net } from "../../shared/net/index.ts";
import { NameTag } from "../player/index.ts";
import { MOLUCHAN_HEIGHT, MOLUCHAN_LOOK as LOOK, MoluchanModel, drawBubble } from "./moluchanVisuals.tsx";

const NAME = "Jeun-Lac Moluchan";
const TAG_Y = MOLUCHAN_HEIGHT + 0.55;
/** The bubble's tail sits this high, just over his name tag. */
const BUBBLE_Y = TAG_Y + 0.4;
const RING_INNER = MOLUCHAN.auraRadius - LOOK.ringWidth;

/**
 * Jeun-Lac Moluchan (#85), while he is on the street: his placeholder body,
 * smoothed towards the synced spot, his speech bubble, and the ring of his
 * aura on the ground while he rallies. Re-renders only when he arrives,
 * changes phase or says a new line; the walking is useFrame work.
 */
export function MoluchanView() {
  const phase = useSyncExternalStore(net.subscribeMoluchan, net.getMoluchanPhase);
  return phase === null ? null : <Moluchan phase={phase} />;
}

function Moluchan({ phase }: { phase: MoluchanPhase }) {
  const root = useRef<Group>(null);
  const body = useRef<Group>(null);
  const megaphoneArm = useRef<Group>(null);
  const freeArm = useRef<Group>(null);
  const ring = useRef<Group>(null);
  const ringMat = useRef<MeshBasicMaterial>(null);
  const discMat = useRef<MeshBasicMaterial>(null);
  const placed = useRef(false);
  const harangue = useRef(0);
  /** The line on his bubble (an index into MOLUCHAN_LINES, -1 none): changes every few seconds, so React state is fine. */
  const [line, setLine] = useState(() => net.getMoluchan()?.line ?? -1);
  const bubble = useMemo(() => (line < 0 ? null : drawBubble(moluchanLineText(line))), [line]);
  useEffect(() => () => bubble?.texture.dispose(), [bubble]);

  const rallying = phase === MoluchanPhase.Rallying;
  const grabbed = phase === MoluchanPhase.Grabbed;

  useFrame((_, dt) => {
    const g = root.current;
    const b = body.current;
    const m = net.getMoluchan();
    if (!g || !b || !m) return;
    if (m.line !== line) setLine(m.line);
    if (!placed.current) {
      g.position.set(m.x, 0, m.z);
      b.rotation.y = m.rotation;
      placed.current = true;
    }
    const k = damp(12, dt);
    g.position.x += (m.x - g.position.x) * k;
    g.position.z += (m.z - g.position.z) * k;
    let dr = m.rotation - b.rotation.y;
    dr = Math.atan2(Math.sin(dr), Math.cos(dr));
    b.rotation.y += dr * k;

    // Grabbed: leans back with both arms up. Otherwise the megaphone bobs as he harangues.
    if (b.rotation.order !== "YXZ") b.rotation.order = "YXZ";
    b.rotation.x += ((grabbed ? LOOK.grabbedLean : 0) - b.rotation.x) * damp(8, dt);
    harangue.current += dt * LOOK.harangueSpeed;
    const bob = grabbed ? 0 : Math.sin(harangue.current) * LOOK.harangueAngle;
    const ma = megaphoneArm.current;
    const fa = freeArm.current;
    if (ma) ma.rotation.x += ((grabbed ? LOOK.armOutraged : LOOK.armMegaphone + bob) - ma.rotation.x) * damp(10, dt);
    if (fa) fa.rotation.x += ((grabbed ? LOOK.armOutraged : LOOK.armFree) - fa.rotation.x) * damp(10, dt);

    // The ring pulses: a little wider and brighter, then back.
    const pulse = 0.5 + 0.5 * Math.sin((performance.now() / 1000) * LOOK.pulseRate * Math.PI * 2);
    ring.current?.scale.setScalar(1 + LOOK.pulseScale * pulse);
    if (ringMat.current) ringMat.current.opacity = LOOK.ringOpacity * (1 - LOOK.pulseOpacity + LOOK.pulseOpacity * pulse);
    if (discMat.current) discMat.current.opacity = LOOK.discOpacity * (1 - LOOK.pulseOpacity + LOOK.pulseOpacity * pulse);
  });

  return (
    <group ref={root}>
      <group ref={body}>
        <MoluchanModel megaphoneArm={megaphoneArm} freeArm={freeArm} />
      </group>
      {/* His aura (#85): only while he rallies. Flat on the ground, see-through, no shadow. */}
      <group ref={ring} visible={rallying}>
        <mesh position-y={0.04} rotation-x={-Math.PI / 2} renderOrder={1}>
          <ringGeometry args={[RING_INNER, MOLUCHAN.auraRadius, 64]} />
          <meshBasicMaterial ref={ringMat} color={LOOK.ringColor} transparent opacity={LOOK.ringOpacity} depthWrite={false} />
        </mesh>
        <mesh position-y={0.035} rotation-x={-Math.PI / 2}>
          <circleGeometry args={[RING_INNER, 64]} />
          <meshBasicMaterial ref={discMat} color={LOOK.ringColor} transparent opacity={LOOK.discOpacity} depthWrite={false} />
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
