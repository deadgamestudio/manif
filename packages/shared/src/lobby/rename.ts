/**
 * Renaming yourself in the lobby (#61) as a plain function. The server
 * applies it; the client only sends the raw text and waits for the state.
 */
import { Phase } from "../round/constants.js";
import { sanitizeName } from "./lobby.js";

/** Why a rename was refused. `locked`: not in the lobby. `empty`: nothing left after cleaning. `taken`: another player has it. */
export type RenameRefusal = "locked" | "empty" | "taken";

export type RenameCheck =
  /** Take `name` (already cleaned). */
  | { ok: true; name: string }
  /** Same as your current name: nothing to do, and not an error. */
  | { ok: false; reason: "unchanged" }
  | { ok: false; reason: RenameRefusal };

/** The key two names are compared by: cleaned and lower-cased, so "Gérard du 93" and "gérard  du 93 " are one placard. */
export function nameKey(raw: unknown): string {
  return sanitizeName(raw).toLocaleLowerCase("fr");
}

/**
 * Whether `selfId` may take the name `raw`. `players` is everyone in the room
 * (self included; the check skips it by id). Renames happen only in the lobby
 * (`waiting`), like the archetype pick.
 */
export function checkRename(
  raw: unknown,
  phase: number,
  selfId: string,
  players: Iterable<{ id: string; name: string }>,
): RenameCheck {
  if (phase !== Phase.Waiting) return { ok: false, reason: "locked" };
  const name = sanitizeName(raw);
  if (!name) return { ok: false, reason: "empty" };
  const key = nameKey(name);
  let current: string | null = null;
  for (const p of players) {
    if (p.id === selfId) current = p.name;
    else if (nameKey(p.name) === key) return { ok: false, reason: "taken" };
  }
  if (current === name) return { ok: false, reason: "unchanged" };
  return { ok: true, name };
}

/**
 * The per-player rate limit (#61): a rename at `now` (ms) is processed only
 * when the last processed one was at least RENAME_COOLDOWN_MS ago. `last` is
 * undefined for a first rename.
 */
export function renameAllowedAt(now: number, last: number | undefined, cooldownMs: number): boolean {
  return last === undefined || now - last >= cooldownMs;
}
