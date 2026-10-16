// The rare cameos together (#132): Jeun-Lac Moluchan (#85), La Douane (#120)
// and Alexandre Bénanas (#123). When they show up and how they share the
// speech bubbles. Each cameo keeps its own chance (`MOLUCHAN.chance`...);
// what is common is here. Times in seconds of room time.

export const CAMEO = {
  // --- When they come ---
  /** Each cameo rolls once this often, in seconds of march (the round's own clock, not per tick)... */
  rollEvery: 60,
  /** ...the first roll this far into the march, so nobody shows up on the start line. */
  firstRoll: 20,

  // --- Their bubbles ---
  /** A bubble stays up this long... */
  bubble: 2.5,
  /** ...then that cameo keeps quiet at least this long... */
  silenceMin: 6,
  /** ...and at most this long (rolled each time). */
  silenceMax: 8,
  /** After any cameo's bubble, another one waits this long before an ordinary line, so bubbles don't run into each other. */
  gap: 1,
} as const;
