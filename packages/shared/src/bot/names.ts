/**
 * Who the bots are (#59): how many fill the cortège, their names and their
 * archetypes. Plain functions; the room applies them at the start of a march.
 */
import { ARCHETYPE_IDS, type Archetype } from "../archetype/index.js";
import { DEFAULT_NAMES, MAX_PLAYERS, NAME_MAX_LENGTH, nameKey } from "../lobby/index.js";

/** How many bots join at the start of a march: up to MAX_PLAYERS protesters with the toggle on, none with it off. */
export function botsToFill(humans: number, on: boolean): number {
  return on ? Math.max(0, MAX_PLAYERS - Math.max(0, humans)) : 0;
}

/**
 * A funny default name (`DEFAULT_NAMES`) nobody in `used` goes by, compared
 * like renames compare (`nameKey`: case and spaces don't matter). With every
 * name taken, the first free numbered one ("Dédé Merguez 2"). Never the same
 * as anything in `used`, so a bot never doubles up a human, another bot or a
 * BAC's disguise.
 */
export function pickBotName(used: Iterable<string>, random: () => number = Math.random): string {
  const taken = new Set<string>();
  for (const n of used) taken.add(nameKey(n));
  const free = DEFAULT_NAMES.filter((n) => !taken.has(nameKey(n)));
  if (free.length > 0) return free[Math.min(free.length - 1, Math.floor(Math.max(0, random()) * free.length))]!;
  for (let k = 2; ; k++) {
    for (const base of DEFAULT_NAMES) {
      const suffix = ` ${k}`;
      const name = base.slice(0, NAME_MAX_LENGTH - suffix.length).trimEnd() + suffix;
      if (!taken.has(nameKey(name))) return name;
    }
  }
}

/** A random archetype for a bot (#14), any of the roster. */
export function pickBotArchetype(random: () => number = Math.random): Archetype {
  return ARCHETYPE_IDS[Math.min(ARCHETYPE_IDS.length - 1, Math.floor(Math.max(0, random()) * ARCHETYPE_IDS.length))]!;
}
