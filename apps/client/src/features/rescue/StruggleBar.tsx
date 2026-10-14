import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group, Sprite } from "three";
import { PlayerStatus } from "@manif/shared";
import { net } from "../../shared/net/index.ts";

const WIDTH = 1.1;
const HEIGHT = 0.16;
const BORDER = 0.04;
/** The bar shakes sideways while it fills, like the protester squirming. */
const SHAKE = 0.04;
const SHAKE_SPEED = 40;

/**
 * A grabbed protester's struggle meter (#70): an orange bar that fills while
 * they mash to break free, over their head on everyone's screen (teammates
 * see who is about to get out). Shown only while it has something in it.
 * Placeholder look, like RescueBar; updated in useFrame from the synced
 * `struggle` (0..100).
 */
export function StruggleBar({ id, y }: { id: string; y: number }) {
  const group = useRef<Group>(null);
  const fill = useRef<Sprite>(null);

  useFrame(() => {
    const p = net.getPlayer(id);
    const g = group.current;
    const f = fill.current;
    if (!g || !f) return;
    const ratio = p && p.status === PlayerStatus.Grabbed ? Math.min(1, (p.struggle ?? 0) / 100) : 0;
    g.visible = ratio > 0;
    if (ratio > 0) {
      f.scale.x = WIDTH * ratio;
      f.center.set(0.5 / ratio, 0.5);
      g.position.x = Math.sin((performance.now() / 1000) * SHAKE_SPEED) * SHAKE;
    }
  });

  return (
    <group ref={group} position-y={y} visible={false}>
      <sprite scale={[WIDTH + BORDER * 2, HEIGHT + BORDER * 2, 1]} renderOrder={12}>
        <spriteMaterial color="#141414" depthTest={false} depthWrite={false} />
      </sprite>
      <sprite ref={fill} scale={[WIDTH, HEIGHT, 1]} renderOrder={13}>
        <spriteMaterial color="#ff8a1f" depthTest={false} depthWrite={false} />
      </sprite>
    </group>
  );
}
