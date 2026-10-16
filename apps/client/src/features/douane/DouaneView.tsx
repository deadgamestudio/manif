import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group, Sprite } from "three";
import { DOUANE_JET, douaneLineText } from "@manif/shared";
import { damp } from "../../shared/iso/index.ts";
import { net } from "../../shared/net/index.ts";
import { NameTag } from "../player/index.ts";
import { WaterJet } from "../water/index.ts";
import { drawBubble } from "../moluchan/index.ts";
import { DOUANE_HEIGHT, DOUANE_MUZZLE, DouaneModel } from "./douaneVisuals.tsx";
import { bubbleShift } from "./bubble.ts";

/** On screen he is only "La Douane": no real name, ever. */
const NAME = "La Douane";
const TAG_Y = DOUANE_HEIGHT + 0.5;
/** The bubble's tail sits this high, just over his name tag. */
const BUBBLE_Y = TAG_Y + 0.4;

const spraying = () => {
  const d = net.getDouane();
  return d?.spraying === true;
};

/**
 * La Douane (#120), while he is on the street: the kid, smoothed towards
 * the synced spot, his water jet while he fires, his name tag and his speech
 * bubble. Re-renders only when he arrives, leaves or says a new line; the
 * walking and the jet are useFrame work.
 */
export function DouaneView() {
  const phase = useSyncExternalStore(net.subscribeDouane, net.getDouanePhase);
  return phase === null ? null : <Douane />;
}

function Douane() {
  const root = useRef<Group>(null);
  const body = useRef<Group>(null);
  const bubbleRef = useRef<Sprite>(null);
  const placed = useRef(false);
  const [skin] = useState(() => net.getDouane()?.skin ?? 0);
  const [line, setLine] = useState(() => net.getDouane()?.line ?? -1);
  const bubble = useMemo(() => (line < 0 ? null : drawBubble(douaneLineText(line))), [line]);
  useEffect(() => () => bubble?.texture.dispose(), [bubble]);

  useFrame((_, dt) => {
    const g = root.current;
    const b = body.current;
    const d = net.getDouane();
    if (!g || !b || !d) return;
    if (d.line !== line) setLine(d.line);
    if (!placed.current) {
      g.position.set(d.x, 0, d.z);
      b.rotation.y = d.rotation;
      placed.current = true;
    }
    const k = damp(12, dt);
    g.position.x += (d.x - g.position.x) * k;
    g.position.z += (d.z - g.position.z) * k;
    let dr = d.rotation - b.rotation.y;
    dr = Math.atan2(Math.sin(dr), Math.cos(dr));
    b.rotation.y += dr * k;
    // Moluchan nearby (#85): the kid's bubble steps aside so the two never cover each other.
    const s = bubbleRef.current;
    if (s) {
      const m = net.getMoluchan();
      const shift = bubbleShift(g.position.x, g.position.z, m ? m.x : null, m ? m.z : null);
      s.position.x += (shift.x - s.position.x) * damp(8, dt);
      s.position.z += (shift.z - s.position.z) * damp(8, dt);
    }
  });

  return (
    <group ref={root}>
      <group ref={body}>
        <DouaneModel skin={skin} spraying={spraying} />
        {/* The jet from the gun's nozzle, at its true reach (DOUANE_JET), so what you see is what gets wet. */}
        <group position-z={DOUANE_MUZZLE.z}>
          <WaterJet isOn={spraying} range={DOUANE_JET.range} halfAngle={DOUANE_JET.halfAngle} y={DOUANE_MUZZLE.y} />
        </group>
      </group>
      <NameTag name={NAME} isLocal={false} y={TAG_Y} />
      {bubble && (
        <sprite ref={bubbleRef} position-y={BUBBLE_Y} center={[0.5, 0]} scale={[bubble.width, bubble.height, 1]} renderOrder={11}>
          <spriteMaterial map={bubble.texture} depthTest={false} depthWrite={false} transparent />
        </sprite>
      )}
    </group>
  );
}
