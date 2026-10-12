import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import { PLAYER_RADIUS } from "@manif/shared";
import { damp } from "../../shared/iso/index.ts";
import { net } from "../../shared/net/index.ts";
import { NameTag } from "./NameTag.tsx";

const CAPSULE_LENGTH = 1;
const HEIGHT = CAPSULE_LENGTH + PLAYER_RADIUS * 2;

/** One player. Its position is interpolated towards the server state each frame. */
export function PlayerAvatar({ id, name, isLocal }: { id: string; name: string; isLocal: boolean }) {
  const group = useRef<Group>(null);
  const placed = useRef(false);

  useFrame((_, dt) => {
    const g = group.current;
    const p = net.getPlayer(id);
    if (!g || !p) return;

    if (!placed.current) {
      g.position.set(p.x, 0, p.z);
      g.rotation.y = p.rotation;
      placed.current = true;
      return;
    }

    const k = damp(15, dt);
    g.position.x += (p.x - g.position.x) * k;
    g.position.z += (p.z - g.position.z) * k;

    // Rotate along the shortest arc.
    let dr = p.rotation - g.rotation.y;
    dr = Math.atan2(Math.sin(dr), Math.cos(dr));
    g.rotation.y += dr * k;
  });

  return (
    <group ref={group}>
      <mesh position-y={HEIGHT / 2} castShadow>
        <capsuleGeometry args={[PLAYER_RADIUS, CAPSULE_LENGTH, 4, 12]} />
        <meshStandardMaterial color={isLocal ? "#ffca28" : "#42a5f5"} />
      </mesh>
      {/* Small nose so facing direction is visible. */}
      <mesh position={[0, HEIGHT * 0.7, PLAYER_RADIUS]} castShadow>
        <boxGeometry args={[0.2, 0.2, 0.3]} />
        <meshStandardMaterial color="#212121" />
      </mesh>
      <NameTag name={name} isLocal={isLocal} y={HEIGHT + 0.55} />
    </group>
  );
}
