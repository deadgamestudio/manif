import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Vector3, type Group, type Mesh } from "three";
import { useEffectModel } from "../effects/index.ts";
import { MODELS } from "../models/index.ts";
import { BODY_FLAME_LOOK, BODY_FLAME_MODEL } from "./fireVisuals.tsx";

/**
 * The bum on fire (#16): small flickering flames behind a body while
 * `isOnFire()` says so. Goes inside the avatar's own frame (it turns and tips
 * with it). The avatar does the flailing.
 *
 * With `anchor`, the flames ride a ragdoll instead (#26): put it under the
 * avatar's root group; `anchor` writes the ragdoll's pelvis (relative to the
 * root) and returns false while no ragdoll is drawn, which hides them.
 *
 * Jordan's bum flames (#28) replace the cones once loaded. Every body mounts
 * one of these, so the model's copy is only made the first time this body
 * catches fire.
 */
export function BodyFire({ isOnFire, anchor }: { isOnFire: () => boolean; anchor?: (out: Vector3) => boolean }) {
  const group = useRef<Group>(null);
  const cones = useRef<(Mesh | null)[]>([]);
  const [at] = useState(() => new Vector3());
  const [lit, setLit] = useState(false);
  // The tongues are flat cards: two copies crossed, so they still show when the body is side-on.
  const model = useEffectModel(lit ? MODELS.effects.bumFlames : null);
  const cross = useEffectModel(lit ? MODELS.effects.bumFlames : null);
  const [bumX, bumY, bumZ] = BODY_FLAME_LOOK.cones[0]!;

  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    let on = isOnFire();
    if (anchor) {
      on = on && anchor(at);
      // The cones are laid out from the feet (the bum is 0.55 up and 0.35 back): shift them onto the pelvis.
      if (on) g.position.set(at.x, at.y - bumY, at.z);
    }
    g.visible = on;
    if (!g.visible) return;
    if (!lit) setLit(true);
    if (model) {
      model.tick(dt);
      cross?.tick(dt);
      return;
    }
    const t = performance.now() / 1000;
    BODY_FLAME_LOOK.cones.forEach((_cone, i) => {
      const c = cones.current[i];
      if (c) c.scale.set(1, 0.7 + 0.5 * Math.abs(Math.sin(t * BODY_FLAME_LOOK.flickerSpeed + i * 2.3)), 1);
    });
  });

  return (
    <group ref={group} visible={false}>
      {model ? (
        <group position={[bumX, bumY - BODY_FLAME_MODEL.baseY, bumZ]} scale={BODY_FLAME_MODEL.scale}>
          <primitive object={model.copy} dispose={null} />
          {cross && <primitive object={cross.copy} rotation-y={Math.PI / 2} dispose={null} />}
        </group>
      ) : (
        BODY_FLAME_LOOK.cones.map(([x, y, z, h], i) => (
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
        ))
      )}
    </group>
  );
}
