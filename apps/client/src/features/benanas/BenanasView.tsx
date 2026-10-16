import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group, Sprite } from "three";
import { BenanasPhase, benanasLineText } from "@manif/shared";
import { damp } from "../../shared/iso/index.ts";
import { net } from "../../shared/net/index.ts";
import { NameTag } from "../player/index.ts";
import { drawBubble } from "../moluchan/index.ts";
import { BENANAS_HEIGHT, BenanasModel, DroppedHelmet, type BenanasLive } from "./benanasVisuals.tsx";
import { benanasBubbleShift } from "./bubble.ts";

/** On screen he is "Alexandre Bénanas": a mangled name, never the real one. */
const NAME = "Alexandre Bénanas";
const TAG_Y = BENANAS_HEIGHT + 0.5;
/** The bubble's tail sits this high: a little over Moluchan's, so side by side they don't line up. */
const BUBBLE_Y = TAG_Y + 0.55;

const live: BenanasLive = {
  masked: () => net.getBenanas()?.phase !== BenanasPhase.Unmasked,
  swings: () => net.getBenanas()?.swings ?? 0,
  hurts: () => net.getBenanas()?.hurts ?? 0,
};

/**
 * Alexandre Bénanas (#123), while he is on the street: the guy, smoothed
 * towards the synced spot, his name tag, his speech bubble (stepping aside
 * from Moluchan's and La Douane's), and his helmet once it falls. Re-renders
 * only when he arrives, changes phase, leaves or says a new line; the rest
 * is useFrame work.
 */
export function BenanasView() {
  const phase = useSyncExternalStore(net.subscribeBenanas, net.getBenanasPhase);
  return phase === null ? null : <Benanas />;
}

function Benanas() {
  const root = useRef<Group>(null);
  const body = useRef<Group>(null);
  const bubbleRef = useRef<Sprite>(null);
  const placed = useRef(false);
  const [line, setLine] = useState(() => net.getBenanas()?.line ?? -1);
  const bubble = useMemo(() => (line < 0 ? null : drawBubble(benanasLineText(line))), [line]);
  useEffect(() => () => bubble?.texture.dispose(), [bubble]);

  useFrame((_, dt) => {
    const g = root.current;
    const b = body.current;
    const d = net.getBenanas();
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
    // Moluchan (#85) or La Douane (#120) nearby: his bubble steps aside so none covers another.
    const s = bubbleRef.current;
    if (s) {
      const shift = benanasBubbleShift(g.position.x, g.position.z, [net.getMoluchan(), net.getDouane()]);
      s.position.x += (shift.x - s.position.x) * damp(8, dt);
      s.position.z += (shift.z - s.position.z) * damp(8, dt);
    }
  });

  return (
    <>
      <group ref={root}>
        <group ref={body}>
          <BenanasModel live={live} />
        </group>
        <NameTag name={NAME} isLocal={false} y={TAG_Y} />
        {bubble && (
          <sprite ref={bubbleRef} position-y={BUBBLE_Y} center={[0.5, 0]} scale={[bubble.width, bubble.height, 1]} renderOrder={11}>
            <spriteMaterial map={bubble.texture} depthTest={false} depthWrite={false} transparent />
          </sprite>
        )}
      </group>
      <DroppedHelmet masked={live.masked} from={root} />
    </>
  );
}
