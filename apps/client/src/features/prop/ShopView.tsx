import { useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group, Mesh, MeshBasicMaterial } from "three";
import { shopSign, type ShopLot } from "@manif/shared";
import { net } from "../../shared/net/index.ts";
import { spawnDebris } from "./debris.ts";
import { ShopSign } from "./ShopSign.tsx";
import { FRAME, SHOP_STYLES, Storefront, UNIT_BOX, shopFront } from "./shopVisuals.tsx";

/** How long a hit flashes and wobbles the shop, ms. */
const FLASH_MS = 160;

/**
 * The round's shops (#83), built into the facades. Each is its own group,
 * apart from the building boxes (so a building can fade on its own later).
 * Re-rendered only when a new layout arrives, once a round.
 */
export function ShopsView() {
  const shops = useSyncExternalStore(net.subscribeShops, net.getShops);
  return (
    <group>
      {shops.map((lot) => (
        <ShopView key={lot.id} lot={lot} />
      ))}
    </group>
  );
}

/**
 * One shop: its storefront, intact or smashed from the synced flag, a white
 * flash and a squash on each hit, and a burst of glass when we see it break.
 * The meshes are made once per shop (per round) and swapped once when it
 * breaks; all per-frame work is in useFrame.
 */
function ShopView({ lot }: { lot: ShopLot }) {
  const group = useRef<Group>(null);
  const [broken, setBroken] = useState(() => net.getProp(lot.id)?.broken ?? false);
  const sprayedAt = useRef<number | undefined>(undefined);
  const front = shopFront(lot);
  const style = SHOP_STYLES[lot.kind];
  const look = useMemo(() => <Storefront lot={lot} broken={broken} />, [lot, broken]);
  // The flash is the shop's own (the other materials are shared by its kind).
  const flash = useRef<Mesh>(null);
  // World position of the front's middle, for the debris.
  const fx = lot.side * (lot.face - front);

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const isBroken = net.getProp(lot.id)?.broken ?? false;
    if (isBroken !== broken) setBroken(isBroken);
    const brokeAt = net.getPropBrokenAt(lot.id);
    if (brokeAt !== undefined && brokeAt !== sprayedAt.current) {
      sprayedAt.current = brokeAt;
      spawnDebris({ x: fx - lot.side * 0.3, z: lot.z, y: lot.height * 0.5, count: Math.round(14 + lot.width * 3), colors: style.debris, size: 0.16, speed: 6 });
    }
    const hitAt = net.getLastPropHit(lot.id);
    const k = hitAt === undefined ? 0 : Math.max(0, 1 - (performance.now() - hitAt) / FLASH_MS);
    g.scale.set(1 + 0.08 * k, 1 - 0.05 * k, 1);
    const f = flash.current;
    if (f) (f.material as MeshBasicMaterial).opacity = 0.55 * k;
  });

  return (
    // On the facade, the front (+X locally) facing the street: the right-hand shops turned half round.
    <group position={[lot.side * lot.face, 0, lot.z]} rotation-y={lot.side < 0 ? 0 : Math.PI}>
      <group ref={group}>
        {look}
        <mesh ref={flash} geometry={UNIT_BOX} position={[front + 0.06, lot.height / 2, 0]} scale={[0.02, lot.height, lot.width]}>
          <meshBasicMaterial color="#ffffff" transparent opacity={0} depthWrite={false} />
        </mesh>
      </group>
      <ShopSign text={shopSign(lot.kind, lot.style)} bg={style.sign[0]} fg={style.sign[1]} at={[front + 0.25, lot.height - FRAME.band / 2, 0]} />
    </group>
  );
}
