import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, Object3D, type InstancedMesh } from "three";
import { MAX_DEBRIS, clearDebris, debrisScale, pieces, stepDebris } from "./debris.ts";

const dummy = new Object3D();
const tint = new Color();

/** Draws the debris pool as one instanced mesh of little cubes. Placeholder look. */
export function Debris() {
  const mesh = useRef<InstancedMesh>(null);

  useEffect(() => clearDebris, []);

  useFrame((_, dt) => {
    const m = mesh.current;
    if (!m) return;
    stepDebris(Math.min(dt, 0.05));
    for (let i = 0; i < MAX_DEBRIS; i++) {
      const p = pieces[i]!;
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(p.rx, p.ry, p.rz);
      dummy.scale.setScalar(debrisScale(p));
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
      m.setColorAt(i, tint.set(p.color));
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, MAX_DEBRIS]} castShadow frustumCulled={false}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial />
    </instancedMesh>
  );
}
