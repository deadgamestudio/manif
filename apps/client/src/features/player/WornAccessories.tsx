/*
 * Puts what a protester wears (#113, accessories.ts) on its skinned body:
 * each item is a static copy (geometry and materials shared with every other
 * copy, colours from the palette cache) added to its bone, `head` or
 * `spine`. The models' pivots are those bones' origins and the bones are
 * unrotated at rest, so no offset: they follow the bones through every clip,
 * the ragdoll, a fall, a grab or a carry, with nothing to do per frame.
 *
 * The flag and the placard stand on a pole behind the head: `stowTall` puts
 * them away (hidden) while it says so, e.g. grabbed or carried, where they
 * would poke through the other body.
 */
import { useLayoutEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Object3D } from "three";
import { MODELS, cloneStatic, repaintCells, useGltf } from "../models/index.ts";
import { ACCESSORY_BONE, TALL_ACCESSORIES, type Accessory } from "./accessories.ts";

export function WornAccessories({ root, wear, stowTall }: { root: Object3D; wear: readonly Accessory[]; stowTall?: () => boolean }) {
  // accessoriesFor gives two at most: one hook per slot, so the hook count never changes.
  const first = wear[0];
  const second = wear[1];
  const firstGltf = useGltf(first ? MODELS.accessories[first.name] : null);
  const secondGltf = useGltf(second ? MODELS.accessories[second.name] : null);
  const tall = useRef<Object3D[]>([]);

  useLayoutEffect(() => {
    const added: Object3D[] = [];
    tall.current = [];
    for (const [item, gltf] of [
      [first, firstGltf],
      [second, secondGltf],
    ] as const) {
      if (!item || !gltf) continue;
      const bone = root.getObjectByName(ACCESSORY_BONE[item.name]);
      if (!bone) continue;
      const copy = cloneStatic(gltf);
      if (item.paint) repaintCells(copy, item.paint);
      bone.add(copy);
      added.push(copy);
      if (TALL_ACCESSORIES.has(item.name)) tall.current.push(copy);
    }
    return () => {
      for (const copy of added) copy.removeFromParent();
      tall.current = [];
    };
  }, [root, first, second, firstGltf, secondGltf]);

  useFrame(() => {
    if (!stowTall || tall.current.length === 0) return;
    showAll(tall.current, !stowTall());
  });

  return null;
}

function showAll(copies: readonly Object3D[], visible: boolean): void {
  for (const copy of copies) copy.visible = visible;
}
