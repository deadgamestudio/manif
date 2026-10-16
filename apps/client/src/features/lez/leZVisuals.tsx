/*
 * Le Z's body (#133): the neutral protester body in a dark suit, thinned, with
 * the Blender pieces of the asset pass on its bones (head with glasses, suit
 * shoulders and tie, the red book under the right arm, a TV mic in the right
 * hand, a raised index on the left, city shoes). The clips play as for any
 * protester (walking legs, a stagger when hit); his stiff upper body is posed
 * on top every frame. Primitives show while the models load.
 *
 * The look is fixed with the owner: never a hooked nose or a hunched back.
 *
 * Drawn like a protester: feet at y = 0, up +Y, front +Z.
 */
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import { Quaternion, Vector3, type Bone, type Group, type Object3D, type SkinnedMesh } from "three";
import { LEZ } from "@manif/shared";
import { MODELS, repaintCells, useStaticModel } from "../models/index.ts";
import { BodyMotion, chooseStateClip, useProtesterBody, type BodyState } from "../player/index.ts";
import { damp } from "../../shared/iso/index.ts";
import {
  LEZ_BODY_PAINT,
  LEZ_BOOK_PAINT,
  LEZ_FINGER_PAINT,
  LEZ_HEAD_PAINT,
  LEZ_HEAD_SCALE,
  LEZ_MIC_PAINT,
  LEZ_POSE,
  LEZ_SHOES_PAINT,
  LEZ_SKIN,
  LEZ_SUIT,
  LEZ_SUIT_PAINT,
  LEZ_THIN,
} from "./look.ts";

/** Feet to the top of his (big) head. */
export const LEZ_HEIGHT = 1.95;

const STAGGER = { name: "tomato-stumble", hold: false, timeScale: 1.6 } as const;

/** What the model reads each frame. */
export interface LeZLive {
  /** The hits he took, as synced: a change plays a stagger. */
  hurts(): number;
}

// Scratch for the pose, shared by every copy (one Le Z at most, and all of it per-frame work on the render thread).
const X_AXIS = new Vector3(1, 0, 0);
const Y_AXIS = new Vector3(0, 1, 0);
const AIMS = LEZ_POSE.aims.map(([bone, d]) => [bone, new Vector3(d[0], d[1], d[2]).normalize()] as const);
const qBone = new Quaternion();
const qParent = new Quaternion();
const qBody = new Quaternion();
const qDelta = new Quaternion();
const vCur = new Vector3();
const vDir = new Vector3();

/** Turn `bone` so its local +Y points along `dir`, given in the body's frame (`body` its world rotation). */
function aim(bone: Object3D, dir: Vector3, body: Quaternion) {
  const parent = bone.parent;
  if (!parent) return;
  bone.updateWorldMatrix(true, false);
  bone.getWorldQuaternion(qBone);
  vCur.copy(Y_AXIS).applyQuaternion(qBone).normalize();
  vDir.copy(dir).applyQuaternion(body);
  qDelta.setFromUnitVectors(vCur, vDir);
  qBone.premultiply(qDelta);
  parent.getWorldQuaternion(qParent);
  bone.quaternion.copy(qParent.invert().multiply(qBone));
}

/** Add `piece`, modelled in the body's rest pose, to `boneName` through the bone's inverse bind matrix. */
function atBind(root: Object3D, skeletonOf: SkinnedMesh | null, boneName: string, piece: Object3D): boolean {
  const bone = root.getObjectByName(boneName);
  const sk = skeletonOf?.skeleton;
  const i = bone && sk ? sk.bones.indexOf(bone as Bone) : -1;
  const inverse = i >= 0 ? sk?.boneInverses[i] : undefined;
  if (!bone || !inverse) return false;
  piece.matrix.copy(inverse);
  piece.matrix.decompose(piece.position, piece.quaternion, piece.scale);
  bone.add(piece);
  return true;
}

export function LeZModel({ live }: { live: LeZLive }) {
  const model = useProtesterBody(MODELS.characters.neutral, LEZ_BODY_PAINT);
  const head = useStaticModel(MODELS.props.leZHead);
  const suit = useStaticModel(MODELS.props.leZSuit);
  const book = useStaticModel(MODELS.props.leZBook);
  const mic = useStaticModel(MODELS.props.leZMic);
  const finger = useStaticModel(MODELS.props.leZFinger);
  const shoes = useStaticModel(MODELS.props.leZShoes);
  const motion = useMemo(() => (model ? new BodyMotion(model.animator) : null), [model]);
  const anchor = useRef<Group>(null);
  const bones = useRef<{ spine: Object3D | null; head: Object3D | null; aims: (Object3D | null)[] }>({ spine: null, head: null, aims: [] });
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
  const speed = useRef(0);
  const hurts = useRef<number | null>(null);

  // The pieces on their bones, painted once per copy.
  useLayoutEffect(() => {
    if (!model || !head || !suit || !book || !mic || !finger || !shoes) return;
    const r = model.root;
    const added: Object3D[] = [];
    const onBone = (name: string, piece: Object3D) => {
      const bone = r.getObjectByName(name);
      if (!bone) return;
      bone.add(piece);
      added.push(piece);
    };
    repaintCells(head, LEZ_HEAD_PAINT);
    repaintCells(suit, LEZ_SUIT_PAINT);
    repaintCells(mic, LEZ_MIC_PAINT);
    repaintCells(finger, LEZ_FINGER_PAINT);
    repaintCells(book, LEZ_BOOK_PAINT);
    repaintCells(shoes, LEZ_SHOES_PAINT);
    onBone("head", head);
    onBone("spine", suit);
    onBone("socket_hand_R", mic);
    onBone("socket_hand_L", finger);
    let skinned: SkinnedMesh | null = null;
    r.traverse((o) => {
      if (!skinned && (o as SkinnedMesh).isSkinnedMesh) skinned = o as SkinnedMesh;
    });
    if (atBind(r, skinned, "upper_arm_R", book)) added.push(book);
    const shoeL = shoes.getObjectByName("le-z-shoe-L-root");
    const shoeR = shoes.getObjectByName("le-z-shoe-R-root");
    if (shoeL && atBind(r, skinned, "foot_L", shoeL)) added.push(shoeL);
    if (shoeR && atBind(r, skinned, "foot_R", shoeR)) added.push(shoeR);
    bones.current = {
      spine: r.getObjectByName("spine") ?? null,
      head: r.getObjectByName("head") ?? null,
      aims: AIMS.map(([name]) => r.getObjectByName(name) ?? null),
    };
    return () => {
      for (const o of added) o.removeFromParent();
      bones.current = { spine: null, head: null, aims: [] };
    };
  }, [model, head, suit, book, mic, finger, shoes]);

  useFrame((_, dt) => {
    const a = anchor.current;
    if (!motion || !model || !a) return;
    a.getWorldPosition(here);
    if (Number.isFinite(last.x) && dt > 0) speed.current += (here.distanceTo(last) / dt - speed.current) * damp(10, dt);
    last.copy(here);
    const h = live.hurts();
    if (hurts.current !== null && h !== hurts.current) motion.act(STAGGER);
    hurts.current = h;
    state.current.speed = speed.current;
    motion.drive(chooseStateClip(state.current), speed.current);
    // Restore, update, capture (BonePose, #103): the clips' pose, then his own on top.
    motion.tick(dt, true);

    // The clips write scale: thin him and grow his head after them, every frame.
    model.root.scale.set(LEZ_THIN, 1, LEZ_THIN);
    const b = bones.current;
    b.head?.scale.set(LEZ_HEAD_SCALE / LEZ_THIN, LEZ_HEAD_SCALE, LEZ_HEAD_SCALE / LEZ_THIN);
    // Stiff and upright, chin up.
    b.spine?.quaternion.setFromAxisAngle(X_AXIS, LEZ_POSE.spine);
    b.head?.quaternion.setFromAxisAngle(X_AXIS, LEZ_POSE.head);
    model.root.getWorldQuaternion(qBody);
    for (let i = 0; i < AIMS.length; i++) {
      const bone = b.aims[i];
      const dir = AIMS[i]?.[1];
      if (bone && dir) aim(bone, dir, qBody);
    }
  });

  const ready = model && head && suit && book && mic && finger && shoes;
  return <group ref={anchor}>{ready ? <primitive object={model.root} dispose={null} /> : <LeZPlaceholder />}</group>;
}

function LeZPlaceholder() {
  const r = LEZ.radius;
  return (
    <group>
      <mesh position-y={1.0} castShadow>
        <capsuleGeometry args={[r * 0.8, 0.55, 4, 10]} />
        <meshStandardMaterial color={LEZ_SUIT} />
      </mesh>
      <mesh position-y={1.6}>
        <sphereGeometry args={[0.2, 10, 8]} />
        <meshStandardMaterial color={LEZ_SKIN} />
      </mesh>
    </group>
  );
}
