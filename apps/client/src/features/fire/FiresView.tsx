import { useRef, useSyncExternalStore } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group, Material, Mesh } from "three";
import { net } from "../../shared/net/index.ts";
import { useEffectModel } from "../effects/index.ts";
import { MODELS } from "../models/index.ts";
import { flameSize } from "./flameShape.ts";
import { FLAME_LOOK, FLAME_MODEL, SMOKE_LOOK, SMOKE_MODEL } from "./fireVisuals.tsx";

/**
 * Burning props (#16): flames and smoke on each one. Re-renders only when a
 * prop catches fire or stops burning; the flicker and the smoke are useFrame
 * work from the synced `intensity` and `radius`. The flames spread out with
 * the zone as it grows over its first seconds (#91). Jordan's flames and
 * smoke column (#28) replace the cones and puffs once loaded.
 */
export function FiresView() {
  const ids = useSyncExternalStore(net.subscribeFires, net.getFireIds);
  return (
    <>
      {ids.map((id) => (
        <FireView key={id} id={id} />
      ))}
    </>
  );
}

function FireView({ id }: { id: string }) {
  const flames = useRef<Group>(null);
  const smoke = useRef<Group>(null);
  const cones = useRef<(Mesh | null)[]>([]);
  const puffs = useRef<(Mesh | null)[]>([]);
  const fire = net.getFire(id);
  const flameModel = useEffectModel(MODELS.effects.flameLoop);
  const smokeModel = useEffectModel(MODELS.effects.smokeColumn, { materials: "translucent", opacity: SMOKE_MODEL.opacity });

  useFrame((_, dt) => {
    const live = net.getFire(id);
    const g = flames.current;
    if (!live || !g) return;
    const now = performance.now();
    const t = now / 1000;
    const age = (now - (net.getFireSeenAt(id) ?? now)) / 1000;
    const grow = Math.min(1, age / FLAME_LOOK.growIn);
    // The synced radius is the full zone; a new fire's zone grows from the prop's edge (`zoneGrowth`).
    const { r, height } = flameSize(live.radius, live.intensity, age, FLAME_LOOK);
    if (flameModel) {
      const across = (r * FLAME_MODEL.spread) / FLAME_MODEL.reach;
      g.scale.set(across, Math.max(0.01, (r * FLAME_MODEL.height * height) / FLAME_MODEL.tall), across);
      flameModel.tick(dt);
    } else {
      g.scale.set(r, r * height, r);
    }
    const sm = smoke.current;
    if (smokeModel && sm) {
      sm.position.y = FLAME_LOOK.baseY + r * FLAME_MODEL.height * height * SMOKE_MODEL.from;
      sm.scale.setScalar(Math.max(0.01, SMOKE_MODEL.scale * (0.5 + 0.5 * height) * grow));
      smokeModel.tick(dt);
    }
    // The placeholder's flicker and puffs (their refs are empty once the models replace them).
    FLAME_LOOK.cones.forEach((_cone, i) => {
      const c = cones.current[i];
      if (c) c.scale.y = 1 + Math.sin(t * FLAME_LOOK.flickerSpeed + i * 1.7) * FLAME_LOOK.flicker * Math.sin(t * 5.3 + i);
    });
    for (let i = 0; i < SMOKE_LOOK.puffs; i++) {
      const p = puffs.current[i];
      if (!p) continue;
      const k = ((t / SMOKE_LOOK.period + i / SMOKE_LOOK.puffs) % 1 + 1) % 1;
      const s = SMOKE_LOOK.size * (1 + k * SMOKE_LOOK.grow) * (0.5 + 0.5 * height);
      p.scale.setScalar(s);
      p.position.set(Math.sin(i * 2.1) * SMOKE_LOOK.drift * k, FLAME_LOOK.baseY + r * height + k * SMOKE_LOOK.rise, Math.cos(i * 2.1) * SMOKE_LOOK.drift * k);
      (p.material as Material).opacity = SMOKE_LOOK.opacity * (1 - k) * grow;
    }
  });

  if (!fire) return null;
  return (
    <group position={[fire.x, 0, fire.z]}>
      {/* Drawn at unit radius and scaled to the fire's radius and intensity in useFrame. */}
      <group ref={flames} position-y={FLAME_LOOK.baseY} scale={0.01}>
        {flameModel ? (
          <primitive object={flameModel.copy} dispose={null} />
        ) : (
          FLAME_LOOK.cones.map(([angle, dist, radius, h], i) => (
            <group key={i} position={[Math.sin(angle) * dist, 0, Math.cos(angle) * dist]}>
              <mesh
                ref={(m) => {
                  cones.current[i] = m;
                }}
                position-y={h / 2}
              >
                <coneGeometry args={[radius, h, 8]} />
                <meshBasicMaterial color={FLAME_LOOK.outer} transparent opacity={0.9} depthWrite={false} />
              </mesh>
              <mesh position-y={(h * FLAME_LOOK.core) / 2}>
                <coneGeometry args={[radius * FLAME_LOOK.core, h * FLAME_LOOK.core, 8]} />
                <meshBasicMaterial color={FLAME_LOOK.inner} />
              </mesh>
            </group>
          ))
        )}
      </group>
      {smokeModel ? (
        <group ref={smoke} scale={0.01}>
          <primitive object={smokeModel.copy} dispose={null} />
        </group>
      ) : (
        Array.from({ length: SMOKE_LOOK.puffs }, (_, i) => (
          <mesh
            key={i}
            ref={(m) => {
              puffs.current[i] = m;
            }}
          >
            <sphereGeometry args={[1, 8, 6]} />
            <meshBasicMaterial color={SMOKE_LOOK.color} transparent opacity={0} depthWrite={false} />
          </mesh>
        ))
      )}
    </group>
  );
}
