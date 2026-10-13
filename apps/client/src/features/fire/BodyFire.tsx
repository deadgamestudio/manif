import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Vector3, type Group, type Mesh } from "three";
import { BODY_FLAME_LOOK } from "./fireVisuals.tsx";

/**
 * The bum on fire (#16): small flickering flames behind a body while
 * `isOnFire()` says so. Goes inside the avatar's own frame (it turns and tips
 * with it). The avatar does the flailing.
 *
 * With `anchor`, the flames ride a ragdoll instead (#26): put it under the
 * avatar's root group; `anchor` writes the ragdoll's pelvis (relative to the
 * root) and returns false while no ragdoll is drawn, which hides them.
 */
export function BodyFire({ isOnFire, anchor }: { isOnFire: () => boolean; anchor?: (out: Vector3) => boolean }) {
  const group = useRef<Group>(null);
  const cones = useRef<(Mesh | null)[]>([]);
  const [at] = useState(() => new Vector3());

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    let on = isOnFire();
    if (anchor) {
      on = on && anchor(at);
      // The cones are laid out from the feet (the bum is 0.55 up and 0.35 back): shift them onto the pelvis.
      if (on) g.position.set(at.x, at.y - BODY_FLAME_LOOK.cones[0]![1], at.z);
    }
    g.visible = on;
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
