import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, Mesh, Object3D, type BufferGeometry, type InstancedMesh, type Material } from "three";
import { MODELS, useGltf, type GLTF } from "../models/index.ts";
import { MAX_DEBRIS, clearDebris, debrisModelScale, debrisScale, pieces, stepDebris, type DebrisShape } from "./debris.ts";

const dummy = new Object3D();
const tint = new Color();

/** Jordan's debris pieces (#28), by shape. */
const SHAPE_URLS: Readonly<Record<DebrisShape, string>> = {
  glass: MODELS.props.debrisGlass,
  plastic: MODELS.props.debrisPlastic,
  metal: MODELS.props.debrisMetalPanel,
  lid: MODELS.props.debrisBinLid,
  door: MODELS.props.debrisCarDoor,
};
const SHAPES = Object.keys(SHAPE_URLS) as DebrisShape[];

interface Piece {
  geometry: BufferGeometry;
  material: Material;
}

const pieceCache = new WeakMap<GLTF, Piece | null>();

/** A debris model as one geometry (its node transforms baked in) and its material, made once per model. */
function pieceOf(gltf: GLTF): Piece | null {
  if (pieceCache.has(gltf)) return pieceCache.get(gltf) ?? null;
  gltf.scene.updateMatrixWorld(true);
  let piece: Piece | null = null;
  gltf.scene.traverse((o) => {
    if (piece || !(o instanceof Mesh)) return;
    const geometry = (o.geometry as BufferGeometry).clone();
    geometry.applyMatrix4(o.matrixWorld);
    piece = { geometry, material: Array.isArray(o.material) ? (o.material[0] as Material) : (o.material as Material) };
  });
  pieceCache.set(gltf, piece);
  return piece;
}

/**
 * Draws the debris pool: each piece as Jordan's model of its shape (#28), one
 * instanced mesh per shape, or as a little cube in its colour when it has no
 * shape or that model hasn't loaded.
 */
export function Debris() {
  const cubes = useRef<InstancedMesh>(null);
  const models = useRef<Partial<Record<DebrisShape, InstancedMesh | null>>>({});
  const glass = useGltf(SHAPE_URLS.glass);
  const plastic = useGltf(SHAPE_URLS.plastic);
  const metal = useGltf(SHAPE_URLS.metal);
  const lid = useGltf(SHAPE_URLS.lid);
  const door = useGltf(SHAPE_URLS.door);
  const loaded = useMemo(() => {
    const out: Partial<Record<DebrisShape, Piece>> = {};
    const all: Record<DebrisShape, GLTF | null> = { glass, plastic, metal, lid, door };
    for (const s of SHAPES) {
      const gltf = all[s];
      const piece = gltf ? pieceOf(gltf) : null;
      if (piece) out[s] = piece;
    }
    return out;
  }, [glass, plastic, metal, lid, door]);

  useEffect(() => clearDebris, []);

  const counts = useRef<Record<DebrisShape | "cube", number>>({ glass: 0, plastic: 0, metal: 0, lid: 0, door: 0, cube: 0 });

  useFrame((_, dt) => {
    const cube = cubes.current;
    if (!cube) return;
    stepDebris(Math.min(dt, 0.05));
    const n = counts.current;
    for (const k in n) n[k as keyof typeof n] = 0;
    for (let i = 0; i < MAX_DEBRIS; i++) {
      const p = pieces[i]!;
      if (p.life <= 0) continue;
      const model = p.shape ? models.current[p.shape] : null;
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(p.rx, p.ry, p.rz);
      if (model && p.shape) {
        dummy.scale.setScalar(debrisModelScale(p));
        dummy.updateMatrix();
        model.setMatrixAt(n[p.shape]++, dummy.matrix);
      } else {
        dummy.scale.setScalar(debrisScale(p));
        dummy.updateMatrix();
        cube.setMatrixAt(n.cube, dummy.matrix);
        cube.setColorAt(n.cube++, tint.set(p.color));
      }
    }
    cube.count = n.cube;
    cube.instanceMatrix.needsUpdate = true;
    if (cube.instanceColor) cube.instanceColor.needsUpdate = true;
    for (const s of SHAPES) {
      const m = models.current[s];
      if (!m) continue;
      m.count = n[s];
      m.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <>
      <instancedMesh ref={cubes} args={[undefined, undefined, MAX_DEBRIS]} castShadow frustumCulled={false}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial />
      </instancedMesh>
      {SHAPES.map((s) => {
        const piece = loaded[s];
        if (!piece) return null;
        return (
          <instancedMesh
            key={s}
            ref={(el) => {
              models.current[s] = el;
            }}
            args={[piece.geometry, piece.material, MAX_DEBRIS]}
            castShadow
            frustumCulled={false}
            dispose={null}
          />
        );
      })}
    </>
  );
}
