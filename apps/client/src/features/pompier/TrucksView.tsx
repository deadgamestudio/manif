import { useRef, useState, useSyncExternalStore } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group, MeshStandardMaterial } from "three";
import { damp } from "../../shared/iso/index.ts";
import { net } from "../../shared/net/index.ts";
import { TRUCK_LOOK, TruckModel } from "./truckVisuals.tsx";

/**
 * Fire trucks (#17): each drives in down its side street, parks behind the
 * barrier with its lights flashing while the crew work, and backs out. Their
 * pompiers are drawn with the bots (CrsAvatar). Re-renders only when a truck
 * arrives, parks, leaves or has gone; the driving is useFrame work.
 */
export function TrucksView() {
  const ids = useSyncExternalStore(net.subscribeTrucks, net.getTruckIds);
  return (
    <>
      {ids.map((id) => (
        <Truck key={id} id={id} />
      ))}
    </>
  );
}

function Truck({ id }: { id: string }) {
  const group = useRef<Group>(null);
  const lights = useRef<(MeshStandardMaterial | null)[]>([]);
  const placed = useRef(false);
  const [parked, setParked] = useState(() => net.getTruck(id)?.parked ?? false);

  useFrame((_, dt) => {
    const g = group.current;
    const t = net.getTruck(id);
    if (!g || !t) return;
    if (!placed.current) {
      g.position.set(t.x, 0, t.z);
      placed.current = true;
    }
    const k = damp(12, dt);
    g.position.x += (t.x - g.position.x) * k;
    g.position.z += (t.z - g.position.z) * k;
    g.rotation.y = t.rotation;
    if (t.parked !== parked) setParked(t.parked);
    const on = t.parked && Math.floor((performance.now() / 1000) * TRUCK_LOOK.flashRate * 2) % 2 === 0;
    lights.current.forEach((m, i) => {
      // The two lights alternate.
      if (m) m.emissiveIntensity = t.parked && on === (i === 0) ? TRUCK_LOOK.lightOn : TRUCK_LOOK.lightOff;
    });
  });

  return (
    <group ref={group}>
      <TruckModel lights={lights} parked={parked} />
    </group>
  );
}
