/*
 * Draws the CGT's kit (#116, cgtKit.ts) on his skinned body:
 * - the barbecue on the `spine` bone (its pivot is that bone's origin, like
 *   the accessories, #113) with a wisp of smoke: three soft sprites rising
 *   from its `smoke` node, sharing one texture and one material across every
 *   grill in the street;
 * - Jordan's megaphone twice (shared geometry and materials, one shown):
 *   in the right hand's socket, gripped where Moluchan grips it, and slung
 *   at the right hip on the `hips` bone, bell down, while the hand is busy.
 *
 * Both ride the bones, so they follow every clip, the ragdoll, a fall, a
 * grab and a carry. The body's own merguez is hidden for the megaphone
 * (KIT_HIDES) and shown again when the kit goes. Per frame: a few
 * visibility flags and three sprite placements, nothing allocated.
 */
import { useLayoutEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { CanvasTexture, Group, LinearFilter, SRGBColorSpace, Sprite, SpriteMaterial, type Object3D } from "three";
import { MODELS, cloneStatic, useGltf } from "../models/index.ts";
import { KIT_HIDES, type CgtKit, type KitShow } from "./cgtKit.ts";

/** Where the megaphone's grip (its `prise-main` node) sits in the model, so the grip lands in the hand (as Moluchan holds it). */
const MEGAPHONE_GRIP: readonly [number, number, number] = [0, -0.115, 0.096];
const MEGAPHONE_HAND = "socket_hand_R";
/** Jordan's megaphone is sized for Moluchan, 1.3 times as big as a protester. */
const MEGAPHONE_SCALE = 0.8;
/** At the hip: on the `hips` bone (unrotated at rest, Y up, +Z front), behind the right hip, bell down. */
const MEGAPHONE_HIP_BONE = "hips";
const MEGAPHONE_HIP_AT: readonly [number, number, number] = [-0.22, -0.06, -0.22];
const MEGAPHONE_HIP_TURN: readonly [number, number, number] = [Math.PI / 2, 0, -0.35];

const GRILL_BONE = "spine";

/** The smoke: puffs per grill, how high they rise (m), how big they get, and how long one takes (s). */
const PUFFS = 3;
const SMOKE_RISE = 0.7;
const SMOKE_SIZE = 0.42;
const SMOKE_PERIOD = 2.4;
const SMOKE_SWAY = 0.05;

let smokeMaterial: SpriteMaterial | null = null;
/** One soft round puff for every grill: a radial gradient, light grey, see-through. Made on first use. */
function sharedSmokeMaterial(): SpriteMaterial {
  if (smokeMaterial) return smokeMaterial;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, "rgba(236,232,226,0.9)");
    g.addColorStop(0.5, "rgba(220,216,210,0.45)");
    g.addColorStop(1, "rgba(210,206,200,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.minFilter = LinearFilter;
  smokeMaterial = new SpriteMaterial({ map: texture, transparent: true, opacity: 0.7, depthWrite: false });
  return smokeMaterial;
}

export function CgtKitView({ root, kit, show }: { root: Object3D; kit: CgtKit; show: () => KitShow }) {
  const grillGltf = useGltf(kit === "merguez" ? MODELS.accessories.barbecue : null);
  const megaphoneGltf = useGltf(kit === "megaphone" ? MODELS.props.megaphone : null);
  const grill = useRef<Object3D | null>(null);
  const smoke = useRef<Group | null>(null);
  const inHand = useRef<Object3D | null>(null);
  const atHip = useRef<Object3D | null>(null);
  /** A different start per body, so the street's grills don't puff in step. */
  const offset = ((root.id * 0.618) % 1) * SMOKE_PERIOD;

  // The body's own pieces this kit replaces.
  useLayoutEffect(() => {
    const hidden: Object3D[] = [];
    for (const name of KIT_HIDES[kit]) {
      const node = root.getObjectByName(name);
      if (node?.visible) {
        node.visible = false;
        hidden.push(node);
      }
    }
    return () => {
      for (const node of hidden) node.visible = true;
    };
  }, [root, kit]);

  useLayoutEffect(() => {
    const bone = root.getObjectByName(GRILL_BONE);
    if (!grillGltf || !bone) return;
    const copy = cloneStatic(grillGltf);
    const puffs = new Group();
    const material = sharedSmokeMaterial();
    for (let i = 0; i < PUFFS; i++) puffs.add(new Sprite(material));
    (copy.getObjectByName("smoke") ?? copy).add(puffs);
    bone.add(copy);
    grill.current = copy;
    smoke.current = puffs;
    return () => {
      copy.removeFromParent();
      grill.current = null;
      smoke.current = null;
    };
  }, [root, grillGltf]);

  useLayoutEffect(() => {
    const hand = root.getObjectByName(MEGAPHONE_HAND);
    const hips = root.getObjectByName(MEGAPHONE_HIP_BONE);
    if (!megaphoneGltf || !hand || !hips) return;
    const held = new Group();
    held.scale.setScalar(MEGAPHONE_SCALE);
    const grip = new Group();
    grip.position.set(...MEGAPHONE_GRIP);
    grip.add(cloneStatic(megaphoneGltf));
    held.add(grip);
    hand.add(held);
    const slung = new Group();
    slung.position.set(...MEGAPHONE_HIP_AT);
    slung.rotation.set(...MEGAPHONE_HIP_TURN);
    slung.scale.setScalar(MEGAPHONE_SCALE);
    slung.add(cloneStatic(megaphoneGltf));
    hips.add(slung);
    inHand.current = held;
    atHip.current = slung;
    return () => {
      held.removeFromParent();
      slung.removeFromParent();
      inHand.current = null;
      atHip.current = null;
    };
  }, [root, megaphoneGltf]);

  useFrame((state) => {
    const s = show();
    if (inHand.current && atHip.current) {
      inHand.current.visible = s.megaphoneInHand;
      atHip.current.visible = !s.megaphoneInHand;
    }
    if (grill.current) grill.current.visible = s.grill;
    const puffs = smoke.current;
    if (!puffs) return;
    puffs.visible = s.smoke;
    if (!s.smoke) return;
    const t = (state.clock.elapsedTime + offset) / SMOKE_PERIOD;
    for (let i = 0; i < puffs.children.length; i++) {
      const puff = puffs.children[i]!;
      // Each puff loops from the grill up, growing then thinning out to nothing.
      const life = (t + i / PUFFS) % 1;
      puff.position.set(Math.sin((t + i) * 5.3) * SMOKE_SWAY * life, life * SMOKE_RISE, 0);
      puff.scale.setScalar(SMOKE_SIZE * (0.35 + life) * Math.sin(Math.PI * life));
    }
  });

  return null;
}
