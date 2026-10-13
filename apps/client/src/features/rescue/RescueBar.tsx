import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group, Sprite } from "three";
import { PlayerStatus } from "@manif/shared";
import { net } from "../../shared/net/index.ts";

const WIDTH = 1.1;
const HEIGHT = 0.16;
const BORDER = 0.04;

/**
 * Rescue progress over a grabbed protester (#10): a yellow bar that fills
 * while a teammate holds interact next to them. Shown only while it moves, on
 * everyone's screen (the grabbed player sees help coming too). Placeholder
 * look; updated in useFrame from the synced `rescue` (0..100).
 */
export function RescueBar({ id, y }: { id: string; y: number }) {
  const group = useRef<Group>(null);
  const fill = useRef<Sprite>(null);

  useFrame(() => {
    const p = net.getPlayer(id);
    const g = group.current;
    const f = fill.current;
    if (!g || !f) return;
    const ratio = p && p.status === PlayerStatus.Grabbed ? Math.min(1, p.rescue / 100) : 0;
    g.visible = ratio > 0;
    if (ratio > 0) {
      // Grow from the left edge, as in HealthBar.
      f.scale.x = WIDTH * ratio;
      f.center.set(0.5 / ratio, 0.5);
    }
  });

  return (
    <group ref={group} position-y={y} visible={false}>
      <sprite scale={[WIDTH + BORDER * 2, HEIGHT + BORDER * 2, 1]} renderOrder={12}>
        <spriteMaterial color="#141414" depthTest={false} depthWrite={false} />
      </sprite>
      <sprite ref={fill} scale={[WIDTH, HEIGHT, 1]} renderOrder={13}>
        <spriteMaterial color="#ffd400" depthTest={false} depthWrite={false} />
      </sprite>
    </group>
  );
}
