// Alexandre Bénanas (#123): a rare cameo, a guy in a riot helmet and a plain
// grey hoodie with a POLICE armband, but no uniform and no shield, who picks
// on lone protesters. Every number of the event is here. Times in seconds of
// room time, distances in world units, progress as a fraction of the street
// (see `progressAt`), chances in [0, 1].
//
// A parody: a mangled name, made-up lines, no real quotes and no likeness.

/** His key in `state.benanas`. Never a player id: he is not in `state.players`, and the CRS never see him. */
export const BENANAS_ID = "benanas";

export const BENANAS = {
  // --- When ---
  /** Chance he shows up in a round, rolled once at the start of the march (on its own: Moluchan and La Douane have theirs). */
  chance: 0.15,
  /** He arrives the first time the cortège's front passes a point rolled in this range... */
  earliest: 0.2,
  /** ...and never past this one. */
  latest: 0.8,
  /** How long he prowls before he walks off on his own, unless unmasked first. */
  duration: 50,

  // --- How he walks ---
  /** Body radius (a grown man, a protester's). Nobody collides with him. */
  radius: 0.4,
  /** Walking speed, under a protester's (PLAYER_SPEED is 6): a lone protester who sees him coming can run. */
  speed: 5,
  /** Running off once unmasked: faster than anyone, he wants out. */
  fleeSpeed: 7,
  /** How often he re-picks his target (and re-plans his walk). */
  regoalInterval: 0.6,
  /** Leaving takes at most this long (he walks to a side street, then is gone even if he got stuck). */
  leaveTimeout: 12,
  /** His way in: a side street this far ahead of the front at least (in progress), behind the CRS line... */
  entryAheadMin: 0.03,
  /** ...and at most this far ahead. */
  entryAheadMax: 0.2,

  // --- Whom he picks ---
  /** Others (free protesters) within this of a protester (centre to centre) make a group. */
  loneRadius: 4,
  /** A target has at most this many others within `loneRadius`: he only picks on the lonely. */
  loneMax: 1,
  /** He doesn't go for anyone further than this: he waits for a better chance. */
  sight: 30,
  /** Each other protester near a candidate counts as this many metres further, so the loneliest wins over the closest. */
  crowdPenalty: 6,
  /** Someone he just hit is left alone this long: he switches target after each hit, never chain-floors. */
  spare: 10,

  // --- The hit ---
  /** He hits when the gap between his body and the target's is this small (a punch). */
  hitReach: 0.5,
  /** Time between two of his hits, whoever the target. */
  hitCooldown: 3.5,
  /** HP a hit takes off (MAX_HP is 100; a plain CRS baton takes 20). */
  hitDamage: 15,
  /** Knockback of his hit, m/s, always flooring (KNOCKDOWN_THRESHOLD is 10). */
  hitImpulse: 11,

  // --- When the cortège closes in ---
  /** Protesters within this of him (centre to centre)... */
  crowdRadius: 3.5,
  /** ...this many or more and he backs off. */
  crowdCount: 3,
  /** Backing off lasts this long (away from them), then he picks someone else. */
  backOff: 2.5,

  // --- Fighting back ---
  /** Hits he takes (a swing, or anything thrown) before his helmet comes off. */
  hp: 4,
  /** A push when hit, m/s (a shove, below KNOCKDOWN_THRESHOLD: he stays up). */
  hurtImpulse: 3,
  /** Unmasked, he stands this long (helmet off, shouting) before he runs. */
  unmaskedLinger: 1.2,

  // --- His bubble ---
  /** A new line no more often than this (one comes with a hit, a back-off, the unmasking). */
  lineInterval: 3.5,
} as const;

/** What his speech bubble says, by moment of the event. */
export type BenanasLineKind = "arrive" | "hit" | "backOff" | "unmasked" | "leave";

/**
 * His lines, all made up. Synced as an index into this list (`BenanasShape.line`),
 * so the order matters: add new lines at the end.
 */
export const BENANAS_LINES: readonly { kind: BenanasLineKind; text: string }[] = [
  { kind: "arrive", text: "Je suis là en observateur !" },
  { kind: "arrive", text: "Chargé de mission, circulez !" },
  { kind: "hit", text: "Chargé de mission, circulez !" },
  { kind: "hit", text: "J'ai un badge, enfin presque" },
  { kind: "hit", text: "J'observe, j'observe !" },
  { kind: "backOff", text: "C'est un malentendu !" },
  { kind: "backOff", text: "Je suis là en observateur !" },
  { kind: "unmasked", text: "C'était pas moi !" },
  { kind: "unmasked", text: "C'est un malentendu !" },
  { kind: "leave", text: "Mission d'observation terminée !" },
];

/** What the event is doing, synced as a uint8 (`BenanasShape.phase`). */
export const BenanasPhase = {
  /** Helmet on, picking on lone protesters. */
  Prowling: 0,
  /** Helmet off: shouts a line, then runs off to a side street, for good. Hits nobody. */
  Unmasked: 1,
  /** Time's up, helmet still on: walks off to a side street. Hits nobody. */
  Leaving: 2,
} as const;
export type BenanasPhase = (typeof BenanasPhase)[keyof typeof BenanasPhase];
