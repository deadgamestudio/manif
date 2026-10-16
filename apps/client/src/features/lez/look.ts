/*
 * Le Z's colours (#133), from the asset pass's assembly notes: a dark suit
 * and tie on the neutral body, the head, the suit's shoulders and lapels, his
 * red book, the mic and the shoes, each a Blender piece with its own palette
 * cells. Pure, so it is tested without a scene.
 *
 * The look is settled with the owner: glasses, suit, book, mic, a raised
 * index. No likeness, and never a hooked nose or a hunched back.
 */
import { SKIN_CELL, type CellPaint } from "../models/index.ts";

export const LEZ_SKIN = "#e3b48f";
export const LEZ_SUIT = "#34363d";
export const LEZ_HAIR = "#3a3430";

/** The neutral body: 9 jacket, 1 trousers, 4 chest band and soles, 13 zip all in the suit; 5 hair and brows; 7 shoes and eye whites. */
export const LEZ_BODY_PAINT: CellPaint = { [SKIN_CELL]: LEZ_SKIN, 9: LEZ_SUIT, 1: LEZ_SUIT, 4: LEZ_SUIT, 13: LEZ_SUIT, 5: LEZ_HAIR, 7: "#f2efe8" };
/** The head (`props.leZHead`, on the `head` bone): skin, hair, the glasses, the lips. */
export const LEZ_HEAD_PAINT: CellPaint = { 2: LEZ_SKIN, 5: LEZ_HAIR, 8: "#141414", 15: "#a87a78" };
/** The suit's shoulders and lapels (`props.leZSuit`, on `spine`): the cloth, the darker lapels, the shirt, the tie. */
export const LEZ_SUIT_PAINT: CellPaint = { 9: LEZ_SUIT, 1: "#202126", 7: "#f4f2ee", 0: "#2c4a8c" };
/** His book, under the right arm (`props.leZBook`, on `upper_arm_R`). */
export const LEZ_BOOK_PAINT: CellPaint = { 0: "#c8312b", 7: "#f4efe2" };
/** The TV mic in his right hand (`props.leZMic`, on `socket_hand_R`). */
export const LEZ_MIC_PAINT: CellPaint = { 8: "#1a1a1c", 11: "#8d9196", 12: "#2a62c9", 7: "#f4f4f0" };
/** The raised index (`props.leZFinger`, on `socket_hand_L`). */
export const LEZ_FINGER_PAINT: CellPaint = { 2: LEZ_SKIN };
/** His city shoes (`props.leZShoes`, on the feet). */
export const LEZ_SHOES_PAINT: CellPaint = { 8: "#151516", 1: "#2a2420" };

/** A small man: the body thinned this much across (x and z)... */
export const LEZ_THIN = 0.82;
/** ...and the head this much bigger (a caricature's big head, glasses and all). */
export const LEZ_HEAD_SCALE = 1.55;

/** His ring on the ground (#133): a police blue, Moluchan's (#85) shape. */
export const LEZ_RING = {
  color: "#2f6bff",
  /** How wide the drawn band is, inside LEZ.auraRadius. */
  width: 0.28,
  opacity: 0.7,
  /** The faint disc inside the ring. */
  discOpacity: 0.1,
  /** Pulses this many times a second, its opacity and size swinging by these fractions. */
  pulseRate: 1.2,
  pulseOpacity: 0.3,
  pulseScale: 0.03,
} as const;

/**
 * His pose on top of the clips, as the asset pass set it: stiff and upright,
 * chin up (never hunched). Each arm bone's local +Y aimed along a direction in
 * body space (Y up, +Z forward, +X his left): left index raised, right arm
 * clamping the book with the mic up at the chest.
 */
export const LEZ_POSE = {
  /** Rotation about X, radians: the spine a touch forward, the head tipped back (chin up). */
  spine: 0.16,
  head: -0.2,
  aims: [
    ["upper_arm_L", [0.35, -0.35, 0.6]],
    ["forearm_L", [0.05, 1, 0.12]],
    ["hand_L", [0, 1, 0.05]],
    ["upper_arm_R", [-0.12, -1, 0.08]],
    ["forearm_R", [0.12, 0.25, 1]],
    ["socket_hand_R", [0, 1, -0.1]],
  ] as const,
} as const;
