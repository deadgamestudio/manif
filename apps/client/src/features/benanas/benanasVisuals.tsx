/*
 * LOOK for Alexandre Bénanas (#123): a guy in a plain grey hoodie and dark
 * jeans, a dark riot helmet with the visor down, a white-and-red POLICE
 * armband, and no uniform or shield. A parody: nothing like anyone real.
 *
 * The body is the lycéen hoodie protester (the shared rig and clips),
 * repainted (look.ts), so no new body file. The helmet (made in Blender for
 * #123, `props.riotHelmet`) rides the `head` bone like the hats do;
 * the armband is the BAC's model on `upper_arm_L`, at Jordan's placement.
 * Unmasked, the helmet leaves his head and tumbles to the street
 * (`DroppedHelmet`, drawn in the world so it stays where it fell).
 * Primitives show while the models load, and for good if they fail.
 *
 * Drawn like a protester: feet at y = 0, up +Y, front +Z.
 */
import { useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { Vector3, type Group, type Object3D } from "three";
import { BENANAS } from "@manif/shared";
import { MODELS, repaintCells, useStaticModel } from "../models/index.ts";
import { BodyMotion, chooseStateClip, useProtesterBody, type BodyState } from "../player/index.ts";
import { damp } from "../../shared/iso/index.ts";
import { ARMBAND_PAINT, BENANAS_PAINT, HELMET_PAINT, HOODIE_GREY, JEANS } from "./look.ts";

/** Feet to the top of the helmet. */
export const BENANAS_HEIGHT = 1.85;

/** How the helmet falls once off: from his head to the street, in this long. */
const DROP_TIME = 0.55;
const HEAD_Y = 1.6;
/** The helmet model's pivot is the head bone; its rim sits about this far above it. */
const HELMET_RIM = 0.14;

const PUNCH = { name: "melee-swing", hold: false, timeScale: 2.2 } as const;
const STAGGER = { name: "tomato-stumble", hold: false, timeScale: 1.6 } as const;

/** What the model reads each frame. */
export interface BenanasLive {
  /** Helmet on (prowling or leaving), or off (unmasked). */
  masked(): boolean;
  /** His punch count, as synced: a change plays a punch. */
  swings(): number;
  /** The hits he took, as synced: a change plays a stagger. */
  hurts(): number;
}

export function BenanasModel({ live }: { live: BenanasLive }) {
  const model = useProtesterBody(MODELS.characters.lyceenHoodie, BENANAS_PAINT);
  const helmet = useStaticModel(MODELS.props.riotHelmet);
  const armband = useStaticModel(MODELS.police.bacArmband);
  const motion = useMemo(() => (model ? new BodyMotion(model.animator) : null), [model]);
  const anchor = useRef<Group>(null);
  const [last] = useState(() => new Vector3(Number.NaN, 0, 0));
  const [here] = useState(() => new Vector3());
  const state = useRef<BodyState>({
    speed: 0,
    ko: false,
    lyingFallback: false,
    carried: false,
    grabbed: false,
    onFire: false,
    carryingPlayer: false,
    fireHold: false,
    gassed: false,
    carrying: 0,
    celebrating: false,
  });
  /** The helmet copy once it is on his head (hidden when unmasked). */
  const worn = useRef<Object3D | null>(null);
  const speed = useRef(0);
  const swings = useRef<number | null>(null);
  const hurts = useRef<number | null>(null);

  // The helmet on the head bone and the armband on the left arm, painted once per copy.
  useLayoutEffect(() => {
    if (!model) return;
    const added: Object3D[] = [];
    const head = model.root.getObjectByName("head");
    if (head && helmet) {
      repaintCells(helmet, HELMET_PAINT);
      head.add(helmet);
      added.push(helmet);
      worn.current = helmet;
    }
    const arm = model.root.getObjectByName("upper_arm_L");
    if (arm && armband) {
      repaintCells(armband, ARMBAND_PAINT);
      // Jordan's placement (crs/policeModels' wearArmband): in the rig's frame, then kept where it is on the bone.
      let rig: Object3D = arm;
      while (rig.parent && rig.parent !== model.root) rig = rig.parent;
      armband.position.set(0.23, 1.26, 0);
      armband.rotation.set(0, 0, 0);
      armband.scale.setScalar(1.4);
      rig.add(armband);
      model.root.updateMatrixWorld(true);
      arm.attach(armband);
      added.push(armband);
    }
    return () => {
      for (const o of added) o.removeFromParent();
      worn.current = null;
    };
  }, [model, helmet, armband]);

  useFrame((_, dt) => {
    if (worn.current) worn.current.visible = live.masked();
    const a = anchor.current;
    if (!motion || !a) return;
    a.getWorldPosition(here);
    if (Number.isFinite(last.x) && dt > 0) speed.current += (here.distanceTo(last) / dt - speed.current) * damp(10, dt);
    last.copy(here);
    const s = live.swings();
    const h = live.hurts();
    if (swings.current !== null && s !== swings.current) motion.act(PUNCH);
    else if (hurts.current !== null && h !== hurts.current) motion.act(STAGGER);
    swings.current = s;
    hurts.current = h;
    state.current.speed = speed.current;
    motion.drive(chooseStateClip(state.current), speed.current);
    motion.tick(dt, true);
  });

  return <group ref={anchor}>{model ? <primitive object={model.root} dispose={null} /> : <BenanasPlaceholder masked={live.masked} />}</group>;
}

/**
 * His helmet once it is off (#123): shown from the unmasking on, at the spot
 * he stood (read from `from`, his moving group), tumbling down to the street
 * and lying there while he runs.
 */
export function DroppedHelmet({ masked, from }: { masked: () => boolean; from: RefObject<Group | null> }) {
  const copy = useStaticModel(MODELS.props.riotHelmet);
  const group = useRef<Group>(null);
  const t = useRef(-1);
  const [at] = useState(() => new Vector3());
  useLayoutEffect(() => {
    if (copy) repaintCells(copy, HELMET_PAINT);
  }, [copy]);

  useFrame((_, dt) => {
    const g = group.current;
    if (!g) return;
    if (masked()) {
      g.visible = false;
      t.current = -1;
      return;
    }
    if (t.current < 0) {
      t.current = 0;
      from.current?.getWorldPosition(at);
      g.position.set(at.x + 0.15, HEAD_Y, at.z);
    }
    g.visible = true;
    t.current = Math.min(DROP_TIME, t.current + dt);
    const k = t.current / DROP_TIME;
    // Falls (accelerating) and rolls onto its side.
    g.position.y = (HEAD_Y - HELMET_RIM) * (1 - k * k);
    g.rotation.z = k * 1.7;
    g.rotation.x = k * 0.5;
  });

  return (
    <group ref={group} visible={false}>
      {copy ? (
        <primitive object={copy} dispose={null} position-y={-HELMET_RIM} />
      ) : (
        <mesh>
          <sphereGeometry args={[0.17, 10, 8]} />
          <meshStandardMaterial color={HELMET_PAINT[1]} />
        </mesh>
      )}
    </group>
  );
}

function BenanasPlaceholder({ masked }: { masked: () => boolean }) {
  const r = BENANAS.radius;
  const head = useRef<Group>(null);
  useFrame(() => {
    if (head.current) head.current.visible = masked();
  });
  return (
    <group>
      <mesh position-y={1.05} castShadow>
        <capsuleGeometry args={[r * 0.8, 0.55, 4, 10]} />
        <meshStandardMaterial color={HOODIE_GREY} />
      </mesh>
      <mesh position-y={0.4} castShadow>
        <boxGeometry args={[r * 1.5, 0.8, r]} />
        <meshStandardMaterial color={JEANS} />
      </mesh>
      <mesh position-y={1.55}>
        <sphereGeometry args={[0.14, 10, 8]} />
        <meshStandardMaterial color={BENANAS_PAINT[6]} />
      </mesh>
      <group ref={head} position-y={1.6}>
        <mesh>
          <sphereGeometry args={[0.18, 10, 8]} />
          <meshStandardMaterial color={HELMET_PAINT[1]} />
        </mesh>
      </group>
      {/* The armband, on the left arm. */}
      <mesh position={[r * 0.85, 1.25, 0]}>
        <cylinderGeometry args={[0.09, 0.09, 0.1, 10]} />
        <meshStandardMaterial color={ARMBAND_PAINT[0]} />
      </mesh>
    </group>
  );
}
