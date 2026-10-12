import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group, Sprite, SpriteMaterial } from "three";
import { MAX_HP, PlayerStatus } from "@manif/shared";
import { net } from "../../shared/net/index.ts";

const WIDTH = 0.9;
const HEIGHT = 0.1;
const BORDER = 0.03;

/**
 * A small HP bar floating above another player (#3), facing the camera.
 * Updated in useFrame from the live state, so no React re-render per hit.
 * Hidden while the player is arrested (the avatar is hidden too).
 */
export function HealthBar({ id, y }: { id: string; y: number }) {
  const group = useRef<Group>(null);
  const fill = useRef<Sprite>(null);
  const fillMat = useRef<SpriteMaterial>(null);

  useFrame(() => {
    const p = net.getPlayer(id);
    const g = group.current;
    const f = fill.current;
    if (!p || !g || !f) return;
    g.visible = p.status !== PlayerStatus.Arrested;
    const ratio = Math.max(0, Math.min(1, p.hp / MAX_HP));
    f.visible = ratio > 0;
    if (ratio > 0) {
      // Sprites face the camera, so shift the fill in screen space through its
      // centre: its left edge then stays on the bar's left edge as it shrinks.
      f.scale.x = WIDTH * ratio;
      f.center.set(0.5 / ratio, 0.5);
    }
    fillMat.current?.color.set(ratio > 0.3 ? "#7cd36b" : "#ff5a4f");
  });

  return (
    <group ref={group} position-y={y}>
      <sprite scale={[WIDTH + BORDER * 2, HEIGHT + BORDER * 2, 1]} renderOrder={10}>
        <spriteMaterial color="#141414" depthTest={false} depthWrite={false} />
      </sprite>
      <sprite ref={fill} scale={[WIDTH, HEIGHT, 1]} renderOrder={11}>
        <spriteMaterial ref={fillMat} color="#7cd36b" depthTest={false} depthWrite={false} />
      </sprite>
    </group>
  );
}
