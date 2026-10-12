import { useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Color, type Group, type Mesh, type MeshStandardMaterial } from "three";
import { STREET_LEVEL, type Level, type PropSlot } from "@manif/shared";
import { net } from "../../shared/net/index.ts";
import { Debris } from "./Debris.tsx";
import { spawnDebris } from "./debris.ts";
import { PROP_LOOKS } from "./propVisuals.tsx";

/** How long a hit flashes and wobbles the prop, ms. */
const FLASH_MS = 160;
/** How long a broken car's alarm blinks, ms. */
const ALARM_MS = 6000;
const FLASH_COLOR = new Color("#ffffff");
const BLACK = new Color("#000000");

/**
 * Every breakable prop of the level (#4) plus the debris pool. Positions and
 * types come from the shared level; only `hp` and `broken` are synced.
 */
export function PropsView({ level = STREET_LEVEL }: { level?: Level }) {
  return (
    <group>
      {level.propSlots.map((slot) => (
        <PropView key={slot.id} slot={slot} />
      ))}
      <Debris />
    </group>
  );
}

/**
 * One prop: intact or broken model from the synced flag, a white flash and a
 * wobble on each hit, a debris burst when we see it break. All per-frame work
 * is in useFrame; React re-renders only when the model swaps.
 */
function PropView({ slot }: { slot: PropSlot }) {
  const look = PROP_LOOKS[slot.kind];
  const group = useRef<Group>(null);
  const [broken, setBroken] = useState(() => net.getProp(slot.id)?.broken ?? false);
  const sprayedAt = useRef<number | undefined>(undefined);

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const state = net.getProp(slot.id);
    const isBroken = state?.broken ?? false;
    if (isBroken !== broken) setBroken(isBroken);

    const now = performance.now();
    const brokeAt = net.getPropBrokenAt(slot.id);
    if (brokeAt !== undefined && brokeAt !== sprayedAt.current) {
      sprayedAt.current = brokeAt;
      spawnDebris({ ...look.debris, x: slot.x, z: slot.z });
    }

    // Hit: flash white and squash a little.
    const hitAt = net.getLastPropHit(slot.id);
    const k = hitAt === undefined ? 0 : Math.max(0, 1 - (now - hitAt) / FLASH_MS);
    g.scale.set(1 + 0.12 * k, 1 - 0.1 * k, 1 + 0.12 * k);
    const alarmOn = look.alarm === true && brokeAt !== undefined && now - brokeAt < ALARM_MS && Math.floor(now / 250) % 2 === 0;
    g.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      const mat = mesh.material as MeshStandardMaterial;
      if (!("emissive" in mat)) return;
      if (mesh.name === "alarm-light") {
        mat.emissiveIntensity = alarmOn ? 2 : 0;
        return;
      }
      mat.emissive.copy(k > 0 ? FLASH_COLOR : BLACK);
      mat.emissiveIntensity = k;
    });
  });

  return (
    <group position={[slot.x, 0, slot.z]} rotation-y={slot.rotation}>
      <group ref={group}>{broken ? look.broken() : look.intact()}</group>
    </group>
  );
}
