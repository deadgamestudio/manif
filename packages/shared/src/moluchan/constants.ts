// Jeun-Lac Moluchan (#85): a rare cameo on the protesters' side, megaphone in
// hand, who boosts the cortège around him for a while. Every number of the
// event is here. Times in seconds of room time, distances in world units,
// progress as a fraction of the street (see `progressAt`), chances in [0, 1].
//
// A caricature: a mangled name, made-up lines, no real quotes and no logos.

/** His id among what the CRS see (`ProtesterView.id`). Never a player id: he is not in `state.players`. */
export const MOLUCHAN_ID = "moluchan";

export const MOLUCHAN = {
  // --- When ---
  /** Chance he shows up in a round, rolled once at the start of the march. */
  chance: 0.15,
  /** He arrives the first time the cortège's front passes a point rolled in this range... */
  earliest: 0.25,
  /** ...and never past this one (a 45 s aura by the Préfecture would decide the round). */
  latest: 0.75,
  /** How long he stays, from his arrival to his last line. */
  duration: 45,

  // --- The aura (free protesters within `auraRadius` of him, centre to centre) ---
  auraRadius: 6,
  /** Walking speed factor inside the ring, on top of everything else (the archetype, gas, a bot's...). */
  speedFactor: 1.15,
  /** Each counted press of a grabbed protester's struggle (#70) fills this many times more meter. */
  struggleFactor: 1.5,
  /** HP a second given back inside the ring, added to a CGT's heal aura (#14) if one is in reach too. */
  healRate: 1,

  // --- How he walks ---
  /** Body radius (a big lad), for collisions with the street. */
  radius: 0.55,
  /** Walking speed, a little under a protester's (PLAYER_SPEED is 6). */
  speed: 4.6,
  /** He keeps at least this far behind the cortège's front (in progress, the street is about 184 m long). */
  behindFront: 0.02,
  /** Close enough to where he is heading (a protester of the group): he stands and harangues, beside them rather than on them. */
  arriveRadius: 2.5,
  /** How often he re-picks the thickest group to head for. */
  regoalInterval: 1.5,
  /** Leaving takes at most this long (he walks to a side street, then is gone even if he got stuck). */
  leaveTimeout: 12,
  /** Grabbed, he stays this long on the spot (with his last line) before he is gone. */
  grabbedLinger: 2,
  /** A new line on his speech bubble this often. */
  lineInterval: 4.5,
  /** A side street this far behind the front at most (in progress) may be his way in. */
  entryBehindMax: 0.2,

  // --- What the CRS think of him ---
  /** CRS target priority (#14's `targetWeight`): chased as if three times closer than a plain protester. */
  targetWeight: 3,
} as const;

/** What his speech bubble says, by moment of the event. */
export type MoluchanLineKind = "arrive" | "rally" | "leave" | "grabbed";

/**
 * His lines, all made up. Synced as an index into this list (`MoluchanShape.line`),
 * so the order matters: add new lines at the end.
 */
export const MOLUCHAN_LINES: readonly { kind: MoluchanLineKind; text: string }[] = [
  { kind: "arrive", text: "Je suis la manif !" },
  { kind: "arrive", text: "Place, place ! Le cortège, c'est par ici !" },
  { kind: "rally", text: "La Préfecture, c'est nous !" },
  { kind: "rally", text: "Le bruit et la fureur !" },
  { kind: "rally", text: "Plus fort ! Ils ne nous entendent pas au fond !" },
  { kind: "rally", text: "Un pas de plus, et l'Histoire bégaie !" },
  { kind: "rally", text: "Le mégaphone est à moi, la rue est à vous !" },
  { kind: "rally", text: "Qui recule ? Personne ne recule !" },
  { kind: "rally", text: "Je vous le dis solennellement : avancez !" },
  { kind: "leave", text: "Mes amis, le devoir m'appelle ailleurs !" },
  { kind: "leave", text: "On se retrouve au prochain cortège !" },
  { kind: "grabbed", text: "Mais lâchez-moi, je suis le cortège !" },
  { kind: "grabbed", text: "Vous ne savez pas qui je suis ?!" },
];

/** What the event is doing, synced as a uint8 (`MoluchanShape.phase`). */
export const MoluchanPhase = {
  /** With the cortège: the aura is on, and the CRS go for him. */
  Rallying: 0,
  /** Time's up: walking off to a side street. No aura; still fair game for the CRS. */
  Leaving: 1,
  /** A CRS got him: the event is over, he stands there protesting for a moment. */
  Grabbed: 2,
} as const;
export type MoluchanPhase = (typeof MoluchanPhase)[keyof typeof MoluchanPhase];
