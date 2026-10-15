/*
 * The shop fronts as React meshes (#68, #83, #117): what `buildFront`
 * (shopLooks.ts, where the looks and the reasons live) collects, baked into a
 * few meshes per front, plus Jordan's shop window (#28) in the intact glass.
 */
import { useEffect, useMemo, type ReactNode } from "react";
import { Vector3, type BufferGeometry, type Material } from "three";
import type { ShopLot } from "@manif/shared";
import { MODELS, cloneStatic, modelBounds, useGltf } from "../models/index.ts";
import { mergeBoxes } from "../../shared/boxes/index.ts";
import { COMMON, FRAME, UNIT_BOX, buildFront, shopFront, styleRandom } from "./shopLooks.ts";

export { FRAME, UNIT_BOX, shopFront, shopSignText, shopStyle } from "./shopLooks.ts";

/** The baked meshes of a front: built in `useMemo`, freed when the front changes. */
function useFrontMeshes(lot: ShopLot, broken: boolean) {
  const geos = useMemo(() => {
    const kit = buildFront(lot, broken);
    return { solid: mergeBoxes(kit.solid.pieces), lit: mergeBoxes(kit.lit.pieces), shard: mergeBoxes(kit.shard.pieces) };
  }, [lot, broken]);
  useEffect(
    () => () => {
      for (const g of Object.values(geos)) g?.dispose();
    },
    [geos],
  );
  return geos;
}

function Baked({ geometry, material, shadow = false }: { geometry: BufferGeometry | null; material: Material; shadow?: boolean }) {
  return geometry ? <mesh geometry={geometry} material={material} castShadow={shadow} /> : null;
}

/**
 * The storefront of one shop, intact or smashed (`buildFront`): a few baked
 * meshes, and Jordan's window in the intact glass.
 */
export function Storefront({ lot, broken }: { lot: ShopLot; broken: boolean }): ReactNode {
  const g = useFrontMeshes(lot, broken);
  const F = shopFront(lot);
  const winW = lot.width - 2 * FRAME.pilaster;
  const winBottom = FRAME.riser;
  const winH = lot.height - FRAME.band - winBottom;
  const glassX = Math.max(0.03, F - 0.08);
  return (
    <group>
      <Baked geometry={g.solid} material={COMMON.solid} shadow />
      <Baked geometry={g.lit} material={COMMON.lit} />
      <Baked geometry={g.shard} material={COMMON.shard} />
      {!broken && <ShopWindow x={glassX} bottom={winBottom} width={winW} height={winH} fallback={<WindowBoxes lot={lot} x={glassX} bottom={winBottom} width={winW} height={winH} />} />}
    </group>
  );
}

/** Glass and mullions from boxes, until Jordan's window has loaded (or if it failed). */
function WindowBoxes({ lot, x, bottom, width, height }: { lot: ShopLot; x: number; bottom: number; width: number; height: number }) {
  const panes = 1 + Math.floor(styleRandom(lot.style ^ 0x5bd1)() * 3);
  const y = bottom + height / 2;
  return (
    <>
      <mesh geometry={UNIT_BOX} material={COMMON.glass} position={[x, y, 0]} scale={[0.04, height, width]} />
      {Array.from({ length: panes - 1 }, (_, i) => (
        <mesh key={i} geometry={UNIT_BOX} material={COMMON.mullion} position={[x + 0.02, y, -width / 2 + (width * (i + 1)) / panes]} scale={[0.06, height, 0.08]} />
      ))}
    </>
  );
}

/** Depth of the window model in the frame's reveal, so it never stands out past the front. */
const WINDOW_DEPTH = 0.12;

/**
 * Jordan's shop window (#28) filling the window opening (`width` along Z,
 * from `bottom` up `height`, its glass at `x`): one 4 m model per 4 m or so,
 * stretched to share the width. `fallback` until it has loaded, or if it failed.
 */
function ShopWindow({ x, bottom, width, height, fallback }: { x: number; bottom: number; width: number; height: number; fallback: ReactNode }) {
  const gltf = useGltf(MODELS.props.shopWindowIntact);
  const n = Math.max(1, Math.round(width / 4));
  const copies = useMemo(() => (gltf ? Array.from({ length: n }, () => cloneStatic(gltf)) : null), [gltf, n]);
  if (!gltf || !copies) return <>{fallback}</>;
  const b = modelBounds(gltf);
  const size = b.getSize(new Vector3());
  const centre = b.getCenter(new Vector3());
  const each = width / n;
  return (
    <>
      {copies.map((copy, i) => (
        // The model's front (+Z) turned to face the street (+X), its width along the facade.
        <group key={i} position={[x, bottom, -width / 2 + each * (i + 0.5)]} rotation-y={Math.PI / 2} scale={[each / size.x, height / size.y, WINDOW_DEPTH / size.z]}>
          <primitive object={copy} position={[-centre.x, -b.min.y, -centre.z]} dispose={null} />
        </group>
      ))}
    </>
  );
}
