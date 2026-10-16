/*
 * The body on an archetype's portrait (#126), drawn by the studio that makes
 * the still pictures (app/portraits/) and by the lobby's live turntable
 * (#128): portrait.ts picks the variant, this loads it, poses it and draws it
 * with the CGT's barbecue.
 */
import { useMemo } from "react";
import { Archetype, archetypeOf } from "@manif/shared";
import { MODELS, isGltfSettled } from "../models/index.ts";
import { CgtKitView } from "./CgtKit.tsx";
import type { KitShow } from "./cgtKit.ts";
import { PORTRAIT_CGT_KIT, PORTRAIT_IDLE_AT, portraitBodyUrl, portraitPaint } from "./portrait.ts";
import { useProtesterBody, type ProtesterBody } from "./protesterBody.ts";

/** The barbecue cold: no smoke puffs on a portrait. */
const GRILL_STILL: KitShow = { megaphoneInHand: false, grill: true, smoke: false };
const showGrill = () => GRILL_STILL;

/** Archetype `id`'s portrait body, or null while it (or its clips) load. */
export function usePortraitBody(id: number): ProtesterBody | null {
  const archetype = archetypeOf(id);
  const paint = useMemo(() => portraitPaint(archetype), [archetype]);
  return useProtesterBody(portraitBodyUrl(archetype), paint);
}

const posed = new WeakSet<ProtesterBody>();

/** Put `body` in the portrait's idle pose, once (later calls do nothing). */
export function posePortrait(body: ProtesterBody): void {
  if (posed.has(body)) return;
  body.animator.play("idle", { fade: 0 });
  body.animator.update(PORTRAIT_IDLE_AT);
  posed.add(body);
}

/** True once everything archetype `id`'s portrait shows besides the body has arrived (or failed): the CGT's barbecue. */
export function portraitPropsSettled(id: number): boolean {
  return archetypeOf(id) !== Archetype.Cgt || isGltfSettled(MODELS.accessories.barbecue);
}

/** Draws `body` (from usePortraitBody) as on archetype `id`'s portrait, feet at the origin. */
export function PortraitFigure({ id, body }: { id: number; body: ProtesterBody }) {
  const kit = archetypeOf(id) === Archetype.Cgt ? PORTRAIT_CGT_KIT : null;
  return (
    <>
      <primitive object={body.root} dispose={null} />
      {kit && <CgtKitView root={body.root} kit={kit} show={showGrill} />}
    </>
  );
}
