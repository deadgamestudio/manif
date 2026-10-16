import { useRef, useSyncExternalStore } from "react";
import { useFrame } from "@react-three/fiber";
import { STREET_LEVEL, THROWABLE_TYPES, ThrowableKind, allVelibDocks, dockAt, isItemKind } from "@manif/shared";
import type { Group } from "three";
import { damp } from "../../shared/iso/index.ts";
import { net } from "../../shared/net/index.ts";
import { lookOf } from "./throwableVisuals.tsx";

/**
 * Items on the ground and in flight (#8). Re-renders only when one appears or
 * goes; positions are read live in useFrame.
 */
export function ThrowablesView() {
  const items = useSyncExternalStore(net.subscribeItems, net.getItemIds);
  const projectiles = useSyncExternalStore(net.subscribeItems, net.getProjectileIds);
  return (
    <>
      {items.map((id) => (
        <GroundItemView key={id} id={id} />
      ))}
      {projectiles.map((id) => (
        <ProjectileView key={id} id={id} />
      ))}
    </>
  );
}

/** The street's Vélib docks (#121): a bike parked in one is drawn lined up with it. */
const VELIB_DOCKS = allVelibDocks(STREET_LEVEL);

/** One item lying on the ground. Items never move, so this is placed once. */
function GroundItemView({ id }: { id: string }) {
  const item = net.getItem(id);
  const look = item ? lookOf(item.kind) : null;
  if (!item || !look) return null;
  // A little random-looking turn from the id, so a pile doesn't look gridded.
  const docked = item.kind === ThrowableKind.Velib ? dockAt(VELIB_DOCKS, item.x, item.z) : null;
  const turn = docked ? docked.yaw : (id.length * 1.7 + id.charCodeAt(id.length - 1)) % Math.PI;
  return (
    <group position={[item.x, 0, item.z]} rotation-y={turn}>
      {look.model()}
    </group>
  );
}

/**
 * One thrown item. Follows the server position; the arc and the tumble are
 * cosmetic (the server flies it flat on the ground plane), timed from when we
 * first saw it over the kind's full flight time.
 */
function ProjectileView({ id }: { id: string }) {
  const group = useRef<Group>(null);
  const spin = useRef<Group>(null);
  const age = useRef(-1);
  const p = net.getProjectile(id);
  const kind = p?.kind ?? 0;
  const look = lookOf(kind);

  useFrame((_, dt) => {
    const g = group.current;
    const live = net.getProjectile(id);
    if (!g || !live || !look || !isItemKind(live.kind)) return;
    const type = THROWABLE_TYPES[live.kind];
    if (age.current < 0) {
      age.current = 0;
      g.position.set(live.x, look.flightY, live.z);
    } else {
      age.current += dt;
      const k = damp(30, dt);
      g.position.x += (live.x - g.position.x) * k;
      g.position.z += (live.z - g.position.z) * k;
    }
    const t = Math.min(1, age.current / (type.range / type.speed));
    g.position.y = look.flightY * (1 - t * 0.85) + Math.sin(Math.PI * t) * look.arcHeight;
    if (spin.current) spin.current.rotation.x += look.spin * dt;
  });

  if (!look) return null;
  return (
    <group ref={group} position={p ? [p.x, look.flightY, p.z] : undefined}>
      <group ref={spin}>{look.model()}</group>
    </group>
  );
}
