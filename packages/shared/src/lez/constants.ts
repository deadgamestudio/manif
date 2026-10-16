// Le Z (#133): a rare cameo on the police side, the mirror of Jeun-Lac
// Moluchan. A pundit in a suit with a mic and his latest book, who stands
// behind the CRS and fires them up, and while he is around the CRS go for the
// "Mec de cité" first. Every number of the event is here. Times in seconds of
// room time, distances in world units, chances in [0, 1].
//
// Satire aimed at him and at police profiling: only ever called "Le Z", no
// likeness, made-up lines that make him look silly, never his real quotes and
// never a slogan or a slur against anyone.

/** His key in `state.lez`. Never a player id: he is not in `state.players`, and the CRS never see him. */
export const LEZ_ID = "lez";

export const LEZ = {
  // --- When ---
  /** Chance he shows up, rolled once per minute of march until he has come (#132, see CAMEO). On his own: the others have theirs. */
  chance: 0.1,
  /** How long he holds forth before he walks off on his own, unless chased off first. */
  duration: 30,

  // --- The aura (CRS within `auraRadius` of him, centre to centre), Moluchan's mirror ---
  auraRadius: 6,
  /** A CRS walks this many times faster inside the ring (Moluchan's speedFactor for the cortège). */
  speedFactor: 1.15,
  /** A CRS winds up its grab this many times faster inside (Moluchan's struggleFactor for the grabbed). */
  grabFactor: 1.5,

  // --- Profiling ---
  /** While he is on the street (not running off), a "Mec de cité"'s CRS target priority is multiplied by this, on top of the archetype's own. */
  profiling: 3,

  // --- How he walks ---
  /** Body radius (a small man). Nobody collides with him. */
  radius: 0.38,
  /** Walking speed, slow (PLAYER_SPEED is 6): he is in no hurry, the CRS are in front of him. */
  speed: 3.2,
  /** Running off once chased: faster, he wants his studio. */
  fleeSpeed: 6,
  /** He stands this far behind the CRS (down the street, away from the cortège)... */
  behindCrs: 4,
  /** ...of the CRS within this of the front, in progress (the street is about 184 m long)... */
  crsBand: 0.12,
  /** ...and with no CRS there, this far ahead of the front (in progress). */
  aheadOfFront: 0.05,
  /** Close enough to his spot: he stands and holds forth. */
  arriveRadius: 1.2,
  /** He holds forth (an ordinary line) at most this often, from his last line: in between, his silence leaves room for his reactions to hits. */
  talkEvery: 11,
  /** How often he re-picks his spot as the CRS move. */
  regoalInterval: 2,
  /** Leaving takes at most this long (he walks to a side street, then is gone even if he got stuck). */
  leaveTimeout: 12,

  // --- Chased off ---
  /** Hits (a swing, or anything thrown) before he gives up and leaves. */
  hp: 4,
  /** A push when hit, m/s (a shove: he stays up). */
  hurtImpulse: 3,
  /** Chased off, he stands this long with his line before he runs. */
  chasedLinger: 1.2,
} as const;

/** What his speech bubble says, by moment of the event. */
export type LeZLineKind = "arrive" | "talk" | "tomato" | "hit" | "chased" | "leave";

/**
 * His lines, all made up. Synced as an index into this list (`LeZShape.line`),
 * so the order matters: add new lines at the end.
 */
export const LEZ_LINES: readonly { kind: LeZLineKind; text: string }[] = [
  { kind: "arrive", text: "Je suis historien, moi !" },
  { kind: "talk", text: "Ça, c'était mieux avant." },
  { kind: "talk", text: "Mon prochain livre sort mardi." },
  { kind: "talk", text: "On ne peut plus rien dire !" },
  { kind: "talk", text: "Je suis interrompu, c'est la censure !" },
  { kind: "tomato", text: "Ma chemise de plateau !" },
  { kind: "hit", text: "Vous n'avez pas lu mon livre !" },
  { kind: "chased", text: "Je retourne sur mon plateau." },
  { kind: "leave", text: "Bon, j'ai une émission." },
];

/** What the event is doing, synced as a uint8 (`LeZShape.phase`). */
export const LeZPhase = {
  /** Behind the CRS: his ring is on, and the CRS go for the mecs de cité first. */
  Holding: 0,
  /** Hit enough: a line, then he runs off to a side street. No ring, no profiling. */
  Chased: 1,
  /** Time's up: walks off to a side street. No ring; still profiling until he's gone. */
  Leaving: 2,
} as const;
export type LeZPhase = (typeof LeZPhase)[keyof typeof LeZPhase];
