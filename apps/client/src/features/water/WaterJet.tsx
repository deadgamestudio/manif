import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { DoubleSide, type Group, type Mesh } from "three";
import { useEffectModel } from "../effects/index.ts";
import { MODELS } from "../models/index.ts";
import { jetModelFit } from "./jetShape.ts";
import { JET_LOOK } from "./waterVisuals.ts";

/** Fixed sideways scatter of each droplet, as a fraction of the cone's width at that point. */
const SCATTER = Array.from({ length: JET_LOOK.drops }, (_, i) => [Math.sin(i * 2.39), Math.cos(i * 1.7)] as const);

/**
 * A water jet (#17), drawn along +Z from its parent's origin (mount it in a
 * body's facing group, at the nozzle). `range` and `halfAngle` are the jet's
 * own numbers (`WaterJetStats`), so what you see is what it reaches. Grows
 * when `isOn()` turns true and shrinks away when it turns false; all in
 * useFrame. The water cannon (#13) mounts the same component, bigger.
 *
 * Jordan's water jet (#28) replaces the stream and the droplets once loaded,
 * stretched over the same range (`jetModelFit`); the faint reach cone stays,
 * since it is what tells you who gets hit.
 */
export function WaterJet({ isOn, range, halfAngle, y = 1 }: { isOn: () => boolean; range: number; halfAngle: number; y?: number }) {
  const group = useRef<Group>(null);
  const water = useRef<Group>(null);
  const drops = useRef<(Mesh | null)[]>([]);
  const grow = useRef(0);
  const clock = useRef(0);
  const spread = Math.tan(halfAngle) * range;
  // Tilted down so the far end sags by JET_LOOK.sag.
  const tilt = Math.atan2(JET_LOOK.sag, range);
  const fit = jetModelFit(range);
  const model = useEffectModel(MODELS.effects.waterJet, {
    timeScale: fit.timeScale,
  });

  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    const target = isOn() ? 1 : 0;
    const step = JET_LOOK.growRate * dt;
    grow.current = target > grow.current ? Math.min(target, grow.current + step) : Math.max(target, grow.current - step);
    g.visible = grow.current > 0.01;
    const jet = water.current;
    if (jet) {
      jet.visible = g.visible;
      jet.scale.set(fit.scale[0], fit.scale[1], fit.scale[2] * grow.current);
    }
    if (!g.visible) return;
    g.scale.set(1, 1, grow.current);
    if (model) {
      model.tick(dt);
      return;
    }
    clock.current += dt;
    for (let i = 0; i < JET_LOOK.drops; i++) {
      const m = drops.current[i];
      const sc = SCATTER[i];
      if (!m || !sc) continue;
      const k = (clock.current * JET_LOOK.dropRate + i / JET_LOOK.drops) % 1;
      const w = spread * k * 0.6;
      m.position.set(sc[0] * w, sc[1] * w * 0.3, k * range);
    }
  });

  return (
    <group position-y={y}>
      {model && (
        // It sags along its own length: not under the tilted group.
        <group ref={water} visible={false}>
          <primitive object={model.copy} dispose={null} />
        </group>
      )}
      <group ref={group} rotation-x={tilt} visible={false}>
        {/* The stream: a thin cone, narrow at the nozzle. */}
        {!model && (
          <mesh position-z={range / 2} rotation-x={-Math.PI / 2}>
            <cylinderGeometry args={[JET_LOOK.streamNear, JET_LOOK.streamFar, range, 10, 1, true]} />
            <meshBasicMaterial color={JET_LOOK.streamColor} transparent opacity={JET_LOOK.streamOpacity} depthWrite={false} />
          </mesh>
        )}
        {/* What the water reaches: the jet's cone, faint. */}
        <mesh position-z={range / 2} rotation-x={-Math.PI / 2}>
          <coneGeometry args={[spread, range, 16, 1, true]} />
          <meshBasicMaterial color={JET_LOOK.coneColor} transparent opacity={JET_LOOK.coneOpacity} depthWrite={false} side={DoubleSide} />
        </mesh>
        {!model &&
          SCATTER.map((_, i) => (
            <mesh
              key={i}
              ref={(m) => {
                drops.current[i] = m;
              }}
            >
              <sphereGeometry args={[JET_LOOK.dropSize, 6, 4]} />
              <meshBasicMaterial color={JET_LOOK.dropColor} transparent opacity={0.9} depthWrite={false} />
            </mesh>
          ))}
      </group>
    </group>
  );
}
