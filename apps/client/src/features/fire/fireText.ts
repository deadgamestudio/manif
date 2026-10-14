// The fire HUD wording, apart from fireVisuals so the HUD (in the entry bundle
// through help and touch) doesn't pull three.js in (#88).

/** HUD lines. */
export const FIRE_TEXT = {
  /** `key` is "E", or "Action" on touch (#42). */
  onFire: (key: string) => `Au feu ! Ton derrière brûle : cours, ou fais-toi éteindre (${key} maintenu par un·e camarade)`,
  putOut: (key: string, name: string) => `Maintiens ${key} pour éteindre ${name} !`,
  light: (key: string, what: string) => `Maintiens ${key} pour mettre le feu ${what}`,
  /** What a prop kind is called in the prompt. */
  kinds: { bin: "à la poubelle", car: "à la voiture", bus_shelter: "à l'abribus", market_stall: "à l'étal" } as Record<string, string>,
} as const;
