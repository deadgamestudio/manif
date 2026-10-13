/**
 * The live Tab scoreboard (#63), as plain data: one row per protester in the
 * room, with the counts from the last ServerMessage.RoundBoard (zeros until
 * the server has counted anything for them) and the status from Schema.
 */
import { PlayerStatus, emptyStats, type RoundBoardEvent, type RoundPlayerStats } from "@manif/shared";

/** The four counts the board shows, in column order, with their headings (and a short one for a phone held upright). */
export const BOARD_COLUMNS: readonly {
  stat: keyof RoundPlayerStats;
  label: string;
  short: string;
}[] = [
  { stat: "crsOut", label: "CRS au tapis", short: "CRS" },
  { stat: "rescues", label: "Camarades libérés", short: "Sauvés" },
  { stat: "propsBroken", label: "Trucs cassés", short: "Casse" },
  { stat: "arrests", label: "Fois embarqué", short: "Panier" },
];

/** What the status pill says, and a key for its colour. */
export function statusLabel(status: number): {
  text: string;
  tone: "free" | "grabbed" | "ko" | "arrested";
} {
  switch (status) {
    case PlayerStatus.Grabbed:
      return { text: "Chopé·e", tone: "grabbed" };
    case PlayerStatus.Ko:
      return { text: "KO", tone: "ko" };
    case PlayerStatus.Arrested:
      return { text: "Embarqué·e", tone: "arrested" };
    default:
      return { text: "Libre", tone: "free" };
  }
}

export interface BoardRow {
  id: string;
  name: string;
  archetype: number;
  isMe: boolean;
  stats: RoundPlayerStats;
}

/**
 * The rows, in the room's join order. Built from the room's players (never
 * the CRS map, so a BAC never shows up), keyed by id since two players can
 * share a name (#61). Someone the last board doesn't know yet (they just
 * joined) gets zeros.
 */
export function boardRows(
  players: readonly { id: string; name: string; archetype: number }[],
  board: RoundBoardEvent | null,
  localId: string | null,
): BoardRow[] {
  const counted = new Map(board?.players.map((p) => [p.id, p]));
  return players.map((p) => {
    const row = counted.get(p.id);
    const stats = emptyStats();
    if (row) for (const k of Object.keys(stats) as (keyof RoundPlayerStats)[]) stats[k] = row[k];
    return {
      id: p.id,
      name: p.name,
      archetype: p.archetype,
      isMe: p.id === localId,
      stats,
    };
  });
}
