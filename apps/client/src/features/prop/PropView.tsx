import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { BoxGeometry, Color, Mesh, MeshStandardMaterial, Vector3, type Group } from "three";
import { PROP_TYPES, STREET_LEVEL, type Level, type PropSlot } from "@manif/shared";
import { net } from "../../shared/net/index.ts";
import { modelBounds, useGltf, useOwnMaterials, useStaticModel } from "../models/index.ts";
import { Debris } from "./Debris.tsx";
import { spawnDebris } from "./debris.ts";
import { propLookState, propModelFit, propModelUrl, type PropLookState } from "./propModels.ts";
import { PROP_LOOKS, type LevelPropKind, type PropLook } from "./propVisuals.tsx";
import { ShopsView } from "./ShopView.tsx";
import { CHARRED_COLOR } from "../fire/index.ts";

/** How long a hit flashes and wobbles the prop, ms. */
const FLASH_MS = 160;
/** How long a broken car's alarm blinks, ms. */
const ALARM_MS = 6000;
const FLASH_COLOR = new Color("#ffffff");
const BLACK = new Color("#000000");

/**
 * Every breakable prop of the level (#4), the round's shops (#83) and the
 * debris pool. A level prop's position and type come from the shared level;
 * `hp`, `broken` and `charred` are synced. A shop is synced whole.
 */
export function PropsView({ level = STREET_LEVEL }: { level?: Level }) {
  return (
    <group>
      {level.propSlots.map((slot) => (
        <PropView key={slot.id} slot={slot} />
      ))}
      <ShopsView />
      <Debris />
    </group>
  );
}

/** The synced look of a prop: broken, burning, burnt out. */
function lookStateOf(id: string): PropLookState {
  const state = net.getProp(id);
  return propLookState({ broken: state?.broken ?? false, charred: state?.charred === true, burning: net.getFire(id) !== undefined });
}

/**
 * One prop: the model of its state (intact, broken, burning, burnt out) from
 * the synced flags, a white flash and a wobble on each hit, a debris burst
 * when we see it break. All per-frame work is in useFrame; React re-renders
 * only when the model swaps.
 */
function PropView({ slot }: { slot: PropSlot }) {
  // The level holds no shop (#83: ShopsView draws them).
  const look = PROP_LOOKS[slot.kind as LevelPropKind];
  const group = useRef<Group>(null);
  const [broken, setBroken] = useState(() => net.getProp(slot.id)?.broken ?? false);
  const [lookState, setLookState] = useState(() => lookStateOf(slot.id));
  const sprayedAt = useRef<number | undefined>(undefined);

  useFrame(() => {
    const g = group.current;
    if (!g) return;
    const state = net.getProp(slot.id);
    const isBroken = state?.broken ?? false;
    if (isBroken !== broken) setBroken(isBroken);
    const nowLook = lookStateOf(slot.id);
    if (nowLook !== lookState) setLookState(nowLook);

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
    // Burnt out (#16): everything goes charcoal (the original colours are kept to come back on a reset),
    // unless it is drawn with its own burnt-out model.
    const charred = state?.charred === true && g.children[0]?.userData.ownCharred !== true;
    const alarmOn = look.alarm === true && brokeAt !== undefined && now - brokeAt < ALARM_MS && Math.floor(now / 250) % 2 === 0;
    g.traverse((o) => {
      const mesh = o as Mesh;
      if (!mesh.isMesh) return;
      const mat = mesh.material as MeshStandardMaterial;
      if (!("emissive" in mat)) return;
      const base = (mesh.userData.baseColor ??= mat.color.clone()) as Color;
      if (!mat.color.equals(charred ? CHARRED_COLOR : base)) mat.color.copy(charred ? CHARRED_COLOR : base);
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
      <group ref={group}>
        <PropBody slot={slot} look={look} state={lookState} broken={broken} />
      </group>
    </group>
  );
}

/** The car's alarm light, on the model's `alarm-light` node: one shared shape, a material per car (it blinks on its own). */
const ALARM_BOX = new BoxGeometry(0.3, 0.12, 0.2);

/**
 * Jordan's model of the prop's state (#28), turned and shrunk onto its
 * collision footprint, with its own materials (the hit flash changes them per
 * prop); until it has loaded, or if it failed, the placeholder.
 */
function PropBody({ slot, look, state, broken }: { slot: PropSlot; look: PropLook; state: PropLookState; broken: boolean }) {
  const url = propModelUrl(look.models, state, broken);
  const gltf = useGltf(url);
  const copy = useStaticModel(url);
  useOwnMaterials(copy);
  const alarm = useMemo(() => {
    const node = copy?.getObjectByName("alarm-light");
    if (!node || node instanceof Mesh) return null;
    // Once per copy, even if React runs this twice.
    const made = node.children.find((c) => c.name === "alarm-light");
    if (made instanceof Mesh) return made;
    const light = new Mesh(ALARM_BOX, new MeshStandardMaterial({ color: "#ffb300", emissive: "#ffb300", emissiveIntensity: 0 }));
    light.name = "alarm-light";
    node.add(light);
    return light;
  }, [copy]);
  useEffect(() => () => (alarm?.material as MeshStandardMaterial | undefined)?.dispose(), [alarm]);
  // Its own burnt-out model is already charcoal: PropView leaves it untinted.
  const ownCharred = state === "charred" && url === look.models.charred;

  if (!copy || !gltf) return broken ? look.broken() : look.intact();
  const shape = PROP_TYPES[slot.kind].intact;
  const footprint: [number, number] = shape.type === "box" ? [shape.halfX * 2, shape.halfZ * 2] : [shape.r * 2, shape.r * 2];
  const b = modelBounds(gltf);
  const size = b.getSize(new Vector3());
  const centre = b.getCenter(new Vector3());
  const fit = propModelFit([size.x, size.y, size.z], footprint, slot.x);
  return (
    <group rotation-y={fit.yaw} scale={fit.scale} userData={{ ownCharred }}>
      <primitive object={copy} position={[-centre.x, -b.min.y, -centre.z]} dispose={null} />
    </group>
  );
}
