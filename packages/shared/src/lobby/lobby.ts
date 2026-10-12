import { LOBBY_QUERY_PARAM, NAME_MAX_LENGTH } from "./constants.js";

/**
 * Default names, picked at random until the player types their own.
 * First names cover all of France, like a real cortège. The joke is on the
 * protest cliché attached to them (union, student, retiree, placard, bobo...).
 * Dark humour is welcome when it punches up: at the State, the police, bosses,
 * reforms, poverty, and racism itself (racial profiling, paperwork). Never an
 * ethnic stereotype as the punchline (see #14).
 * Each name must fit NAME_MAX_LENGTH (tested).
 */
export const DEFAULT_NAMES: readonly string[] = [
  "Gérard du 93",
  "Manon la Bobo",
  "Jean-Mi de la CGT",
  "Josiane Gilet Jaune",
  "Bernard le Retraité",
  "Chloé Trottinette",
  "Kévin Bloc Noir",
  "Dédé Merguez",
  "Mireille au Caddie",
  "Hugo de l'AG",
  "Sandrine Pancarte",
  "Michel Mégaphone",
  "Titouan en Licence 3",
  "Jacqueline la Teigne",
  "Patrick Sound System",
  "Capucine Quinoa",
  "Karim de Sud Rail",
  "Fatou Mégaphone",
  "Mamadou l'Étudiant",
  "Nadia de FO",
  "Yasmine en Master 2",
  "Moussa Gilet Jaune",
  "Aïcha la Prof",
  "Rachid le Retraité",
  "Kenza Pancarte",
  "Ibrahim au Caddie",
  "Linh la Bobo",
  "Thierno de l'AG",
  "Mehdi Sound System",
  "Aminata Banderole",
  "João du Bâtiment",
  "Conceição CGT",
  "Jordan de Roubaix",
  "Gwenaël de Brest",
  "Ginette de Marseille",
  "Wei la Militante",
  "Bakary Trottinette",
  "Océane Infirmière",
  "Pierre-Yves d'Attac",
  "Fanny la Zadiste",
  "Abdel le Délégué",
  "Inès Fumigène",
  "Samir Banderole",
  "Sylvie de la Poste",
  // Dark humour, punching up.
  "Bernard 64 ans (67)",
  "Josiane 49.3",
  "Jean-Mi en GAV",
  "Titouan Gazé",
  "Michel Matraqué",
  "Kévin Éborgné",
  "Dédé Plus de Dents",
  "Karim Contrôlé 12x",
  "Moussa Faciès",
  "Aminata Sans-Papiers",
  "Hugo Fiché S",
  "Sandrine au RSA",
  "Patrick Surendetté",
  "Mireille Sans Mutu",
  "Jacqueline Ehpad",
  "Pierre-Yves Burn-Out",
  "Linh Stage à 0€",
  "Capucine Héritière",
  "Ginette Expulsée",
];

/** A random default name. `rand` returns a number in [0, 1), like Math.random. */
export function randomDefaultName(rand: () => number = Math.random): string {
  const i = Math.min(DEFAULT_NAMES.length - 1, Math.floor(rand() * DEFAULT_NAMES.length));
  return DEFAULT_NAMES[i] ?? DEFAULT_NAMES[0]!;
}

/** Control characters and invisible formatting characters (zero-width, bidi overrides, BOM). */
// oxlint-disable-next-line no-control-regex
const INVISIBLE_CHARS = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g;

/**
 * Cleans a player name: drops control characters, collapses runs of
 * whitespace, trims, and caps it at NAME_MAX_LENGTH characters (code points,
 * so an emoji is never cut in half). Returns "" when nothing is left; callers
 * then fall back to a random default.
 */
export function sanitizeName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  // Whitespace first (tabs and newlines become spaces), then strip what is left.
  const collapsed = raw.replace(/\s+/g, " ").replace(INVISIBLE_CHARS, "").replace(/ {2,}/g, " ").trim();
  return Array.from(collapsed).slice(0, NAME_MAX_LENGTH).join("").trim();
}

/** A sanitised name, or a random default when it comes out empty. */
export function nameOrDefault(raw: unknown, rand: () => number = Math.random): string {
  return sanitizeName(raw) || randomDefaultName(rand);
}

export interface HostCandidate {
  id: string;
  /** Order of arrival in the room: lower joined earlier. */
  joinedAt: number;
}

/**
 * Who should be host: the player who has been in the room the longest. Used
 * when the host leaves. Ties (should not happen) break on id so every caller
 * agrees. Returns "" when nobody is left.
 */
export function pickHost(candidates: Iterable<HostCandidate>): string {
  let best: HostCandidate | null = null;
  for (const c of candidates) {
    if (!best || c.joinedAt < best.joinedAt || (c.joinedAt === best.joinedAt && c.id < best.id)) {
      best = c;
    }
  }
  return best ? best.id : "";
}

/**
 * Pulls a lobby code out of what the player pasted: either a bare code or a
 * whole invite link (`…?lobby=<code>`). Returns "" when nothing usable is found.
 */
export function parseLobbyCode(input: string): string {
  const text = input.trim();
  if (!text) return "";
  const match = new RegExp(`[?&]${LOBBY_QUERY_PARAM}=([^&#\\s]+)`).exec(text);
  const code = match ? decodeURIComponent(match[1] ?? "") : text;
  // Colyseus room ids are short alphanumeric strings (plus - and _).
  return /^[\w-]{1,64}$/.test(code) ? code : "";
}
