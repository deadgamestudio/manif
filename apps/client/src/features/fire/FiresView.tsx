import { useRef, useSyncExternalStore } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group, Material, Mesh } from "three";
import { net } from "../../shared/net/index.ts";
import { FLAME_LOOK, SMOKE_LOOK } from "./fireVisuals.tsx";

/**
 * Burning props (#16): flames and smoke on each one. Re-renders only when a
 * prop catches fire or stops burning; the flicker and the smoke are useFrame
 * work from the synced `intensity` and `radius`.
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
  const cones = useRef<(Mesh | null)[]>([]);
  const puffs = useRef<(Mesh | null)[]>([]);
  const fire = net.getFire(id);

  useFrame(() => {
    const live = net.getFire(id);
    const g = flames.current;
    if (!live || !g) return;
    const now = performance.now();
    const t = now / 1000;
    const age = (now - (net.getFireSeenAt(id) ?? now)) / 1000;
    const grow = Math.min(1, age / FLAME_LOOK.growIn);
    const height = (FLAME_LOOK.intensityScale[live.intensity] ?? 1) * grow;
    const r = live.radius;
    g.scale.set(r, r * height, r);
    FLAME_LOOK.cones.forEach((_, i) => {
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
        {FLAME_LOOK.cones.map(([angle, dist, radius, h], i) => (
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
        ))}
      </group>
      {Array.from({ length: SMOKE_LOOK.puffs }, (_, i) => (
        <mesh
          key={i}
          ref={(m) => {
            puffs.current[i] = m;
          }}
        >
          <sphereGeometry args={[1, 8, 6]} />
          <meshBasicMaterial color={SMOKE_LOOK.color} transparent opacity={0} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}
