import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group, Sprite } from "three";
import { net } from "../../shared/net/index.ts";
import { HOLD_BAR_COLOR } from "./fireVisuals.tsx";

const WIDTH = 1.1;
const HEIGHT = 0.16;
const BORDER = 0.04;

/**
 * Over a protester holding interact to light a prop or pat someone out
 * (#16): an orange bar that fills, from the synced `fireHold` (0..100).
 * Shown only while it moves. Same look as the rescue bar.
 */
export function FireHoldBar({ id, y }: { id: string; y: number }) {
  const group = useRef<Group>(null);
  const fill = useRef<Sprite>(null);

  useFrame(() => {
    const g = group.current;
    const f = fill.current;
    if (!g || !f) return;
    const ratio = Math.min(1, (net.getPlayer(id)?.fireHold ?? 0) / 100);
    g.visible = ratio > 0;
    if (ratio > 0) {
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
        <spriteMaterial color={HOLD_BAR_COLOR} depthTest={false} depthWrite={false} />
      </sprite>
    </group>
  );
}
