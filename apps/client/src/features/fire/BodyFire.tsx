import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group, Mesh } from "three";
import { BODY_FLAME_LOOK } from "./fireVisuals.tsx";

/**
 * The bum on fire (#16): small flickering flames behind a body while
 * `isOnFire()` says so. Goes inside the avatar's own frame (it turns and tips
 * with it). The avatar does the flailing.
 */
export function BodyFire({ isOnFire }: { isOnFire: () => boolean }) {
  const group = useRef<Group>(null);
  const cones = useRef<(Mesh | null)[]>([]);

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    g.visible = isOnFire();
    if (!g.visible) return;
    const t = performance.now() / 1000;
    BODY_FLAME_LOOK.cones.forEach((_, i) => {
      const c = cones.current[i];
      if (c) c.scale.set(1, 0.7 + 0.5 * Math.abs(Math.sin(t * BODY_FLAME_LOOK.flickerSpeed + i * 2.3)), 1);
    });
  });

  return (
    <group ref={group} visible={false}>
      {BODY_FLAME_LOOK.cones.map(([x, y, z, h], i) => (
        <group key={i} position={[x, y, z]}>
          <mesh
            ref={(m) => {
              cones.current[i] = m;
            }}
            position-y={h / 2}
          >
            <coneGeometry args={[BODY_FLAME_LOOK.radius, h, 7]} />
            <meshBasicMaterial color={i === 0 ? BODY_FLAME_LOOK.core : BODY_FLAME_LOOK.color} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
