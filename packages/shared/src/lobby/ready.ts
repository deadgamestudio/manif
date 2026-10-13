/**
 * The ready check before a march (#62) as plain functions. The server uses
 * them to accept or refuse Start; the client uses the same ones to draw the
 * buttons and the count. Nothing here knows about Schema or the room.
 */
import { Phase } from "../round/constants.js";

/**
 * Id prefix of a computer-controlled player (#59, not built yet). Bots are
 * never asked to be ready: they only exist during the march, and this keeps a
 * later change there from ever making the lobby wait on one.
 */
export const BOT_ID_PREFIX = "bot:";

export function isBotId(id: string): boolean {
  return id.startsWith(BOT_ID_PREFIX);
}

/** What the rule reads from a player. */
export interface ReadyView {
  id: string;
  ready: boolean;
}

/**
 * The ids that must be ready before a plain Start: everyone but the host
 * (pressing Start is their "ready") and bots. Keeps the input order.
 */
export function readyRequired(ids: Iterable<string>, hostId: string): string[] {
  const out: string[] = [];
  for (const id of ids) if (id !== hostId && !isBotId(id)) out.push(id);
  return out;
}

export interface StartCheck {
  /** The march may start now. */
  ok: boolean;
  /** Who must be ready and isn't, in the input order. Filled even when `force` lets the start through. */
  notReady: string[];
  /** How many must be ready (not counting the host or bots), and how many are. */
  required: number;
  ready: number;
}

/**
 * Whether the host may start the march: when everyone who must be ready is,
 * or anyway with `force` (the host's "Lancer quand même"). A host alone starts
 * at once. Who is host and whether the sender is the host is the caller's check.
 */
export function canStart(players: Iterable<ReadyView>, hostId: string, force = false): StartCheck {
  const list = Array.from(players);
  const byId = new Map(list.map((p) => [p.id, p.ready]));
  const required = readyRequired(list.map((p) => p.id), hostId);
  const notReady = required.filter((id) => !byId.get(id));
  return { ok: force || notReady.length === 0, notReady, required: required.length, ready: required.length - notReady.length };
}

/** A ready toggle is taken only in the lobby (`waiting`), like the archetype pick. */
export function canSetReady(phase: number): boolean {
  return phase === Phase.Waiting;
}
