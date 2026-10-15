/*
 * The CGT syndicalist's kit (#116): he turns up either with a merguez
 * barbecue on his belly or with a megaphone. Picked from the player's id with
 * protesterLook's hash, about half and half, so every client draws the same
 * CGT the same way without anything synced. The disguised BAC drawing the
 * CGT gets one too, through the same call.
 *
 * - "merguez": a grill tray (made by Claude in Blender, models/assets.ts
 *   `accessories.barbecue`) hung from the neck on a strap, on the `spine`
 *   bone, with a wisp of smoke. The hands stay free: his body's own merguez
 *   stays in his right hand.
 * - "megaphone": Jordan's megaphone (`props.megaphone`, as Moluchan holds
 *   it) in the right hand while the hand is free, slung at the hip while it
 *   is busy (an item, a throw or a hit, a dodge, a teammate overhead, a
 *   grab...). The body's merguez is hidden: that hand holds the megaphone.
 *
 * Pure: `kitShow` says what to draw from the state the avatar already reads
 * (CgtKit.tsx draws it), so it is unit-tested on its own.
 */
import { Archetype } from "@manif/shared";
import { pick } from "./protesterLook.ts";

export type CgtKit = "merguez" | "megaphone";

/** The kit of player (or disguised BAC) `id` drawn as `archetype`: only the CGT has one. */
export function cgtKitFor(archetype: number, id: string): CgtKit | null {
  if (archetype !== Archetype.Cgt) return null;
  return pick(id, "cgt-kit", 2) === 0 ? "merguez" : "megaphone";
}

/** Nodes of the CGT body file not to draw with each kit: its merguez in the right hand goes when the megaphone takes that hand. */
export const KIT_HIDES: Readonly<Record<CgtKit, readonly string[]>> = {
  merguez: [],
  megaphone: ["merguez"],
};

/** What the avatar knows this frame, filled in place (no allocation per frame). */
export interface KitState {
  /** Held by a CRS (#5). */
  grabbed: boolean;
  /** Carried overhead by a teammate (#11). */
  carried: boolean;
  /** Holding a teammate overhead (#11), or a revealed BAC holding someone. */
  carryingPlayer: boolean;
  /** A pair animation owns the body (#28: grab, drag). */
  posed: boolean;
  /** Down or KO, ragdolling or lying. */
  lying: boolean;
  /** An item in hand (#8). */
  holdingItem: boolean;
  /** A swing or a throw is playing (#4, #8). */
  swinging: boolean;
  /** Diving (#9). */
  dodging: boolean;
  /** Lighting a prop or patting someone out (#16), or on fire. */
  fireBusy: boolean;
}

export function freshKitState(): KitState {
  return { grabbed: false, carried: false, carryingPlayer: false, posed: false, lying: false, holdingItem: false, swinging: false, dodging: false, fireBusy: false };
}

/** How long (ms) after a swing event the hand counts as busy: the swing and throw clips, sped up, last about this long. */
export const SWING_BUSY_MS = 650;

/** What to draw. One shared answer per case, so nothing is made per frame. */
export interface KitShow {
  /** The megaphone in the hand (else at the hip). */
  megaphoneInHand: boolean;
  /** The barbecue on the belly. */
  grill: boolean;
  /** Its smoke. */
  smoke: boolean;
}

const MEGAPHONE_IN_HAND: KitShow = Object.freeze({ megaphoneInHand: true, grill: false, smoke: false });
const MEGAPHONE_AT_HIP: KitShow = Object.freeze({ megaphoneInHand: false, grill: false, smoke: false });
const GRILL_SMOKING: KitShow = Object.freeze({ megaphoneInHand: false, grill: true, smoke: true });
const GRILL_COLD: KitShow = Object.freeze({ megaphoneInHand: false, grill: true, smoke: false });
const GRILL_AWAY: KitShow = Object.freeze({ megaphoneInHand: false, grill: false, smoke: false });

/**
 * What `kit` shows in state `s`:
 * - the megaphone is in the hand only while that hand has nothing to do,
 *   at the hip otherwise (never hidden: it stays with him, like the strap);
 * - the barbecue goes away while carried, grabbed or posed (it would go
 *   through the other body) and smokes only while he is up.
 */
export function kitShow(kit: CgtKit, s: KitState): KitShow {
  if (kit === "megaphone") {
    const busy = s.grabbed || s.carried || s.carryingPlayer || s.posed || s.lying || s.holdingItem || s.swinging || s.dodging || s.fireBusy;
    return busy ? MEGAPHONE_AT_HIP : MEGAPHONE_IN_HAND;
  }
  if (s.carried || s.grabbed || s.posed) return GRILL_AWAY;
  return s.lying ? GRILL_COLD : GRILL_SMOKING;
}
