// Playable archetypes (#14): one table, archetype id -> modifiers. The server
// derives every stat from the id a player picked and this table; systems read
// the numbers, never the id, so there is no archetype-specific branch anywhere
// else. Every modifier is a factor on the base value (1: unchanged), except
// `maxHp` (absolute, synced as a uint8) and the auras.
//
// Tone (PRODUCT.md): affectionate satire of every camp. The joke is on
// clothing, props, attitude and political cliché, never on who wears them.
// The looks live in the client (features/archetype/archetypeVisuals.tsx).

import { MAX_HP } from "../health/constants.js";

/** Synced as a uint8 (`Player.archetype`). 0 is the neutral default. */
export const Archetype = {
  /** No pick yet (or an unknown id): plain stats, plain clothes. */
  Lambda: 0,
  Bobo: 1,
  Cite: 2,
  GiletJaune: 3,
  BlackBloc: 4,
  Cgt: 5,
  Etudiant: 6,
  Retraite: 7,
} as const;
export type Archetype = (typeof Archetype)[keyof typeof Archetype];

/** What an unknown or missing id falls back to. */
export const DEFAULT_ARCHETYPE: Archetype = Archetype.Lambda;

/** Auras (#14, CGT heal and bobo filming) reach protesters whose centre is at most this far. */
export const AURA_RADIUS = 4;

export interface ArchetypeStats {
  /** Walking speed factor. The dodge burst is a multiple of the walk, so it follows. */
  speed: number;
  /** HP at the start of the round and on every respawn (base MAX_HP, 100). <= 255. */
  maxHp: number;
  /** Factor on the drag time from a CRS grab to the arrest: more time for a rescue. */
  grabTime: number;
  /** Factor on the time this protester needs to pull a teammate free (#10). */
  rescueTime: number;
  /** Factor on the damage this protester's swings and throws do to props (#4). Rounded, at least 1. */
  propDamage: number;
  /** Factor on how far this protester's thrown items fly (#8). */
  throwRange: number;
  /** Throws leave up to this far off the aim, either side, in radians (0: dead straight). */
  throwSpread: number;
  /** Factor on the dodge cooldown (#9). */
  dodgeCooldown: number;
  /**
   * CRS target priority (#5): a weight on distance, not an absolute rule. A
   * protester at distance d counts as d / weight when a bot picks whom to
   * chase; sight still uses the real distance.
   */
  targetWeight: number;
  /** Heal aura: HP per second given to every other free protester within AURA_RADIUS. 0: none. */
  healAura: number;
  /**
   * Filming aura: a CRS grabbing a protester within AURA_RADIUS of this one
   * (this one included) drags them this many times longer. 1: none.
   */
  filmAura: number;
}

export interface ArchetypeInfo {
  /** French display name. */
  name: string;
  /** One line about the look and attitude, for the pick menu. */
  description: string;
  /** Strength and weakness, in plain words, for the pick menu. */
  strength: string;
  weakness: string;
  stats: ArchetypeStats;
}

const BASE: ArchetypeStats = {
  speed: 1,
  maxHp: MAX_HP,
  grabTime: 1,
  rescueTime: 1,
  propDamage: 1,
  throwRange: 1,
  throwSpread: 0,
  dodgeCooldown: 1,
  targetWeight: 1,
  healAura: 0,
  filmAura: 1,
};

/**
 * The roster. Small modifiers (about ±15 to 30%) so nobody is broken.
 * Two exceptions, both because the base unit is whole hits: prop HP counts
 * hits (2 to 6), so a black bloc's swing counts double rather than 1.3 times;
 * and the retraité·e's longer drag is the archetype's whole point.
 */
export const ARCHETYPES: Readonly<Record<Archetype, ArchetypeInfo>> = {
  [Archetype.Lambda]: {
    name: "Manifestant·e lambda",
    description: "Baskets, k-way, un slogan. Le cortège dans toute sa splendeur.",
    strength: "Rien de spécial, rien de cassé.",
    weakness: "Aucune.",
    stats: BASE,
  },
  [Archetype.Bobo]: {
    name: "Bobo gaucho",
    description: "Écharpe en lin, trottinette, téléphone toujours levé.",
    strength: "Plongeon vite rechargé. Les CRS près de lui traînent pour embarquer : ça filme.",
    weakness: "Lance court et de travers.",
    stats: { ...BASE, dodgeCooldown: 0.7, throwRange: 0.75, throwSpread: 0.18, filmAura: 1.25 },
  },
  [Archetype.Cite]: {
    name: "Mec de cité",
    description: "Survêt', casquette, banane en bandoulière.",
    strength: "Rapide, plongeon nerveux, lance loin.",
    weakness: "Moins de points de vie.",
    stats: { ...BASE, speed: 1.12, throwRange: 1.25, maxHp: 80 },
  },
  [Archetype.GiletJaune]: {
    name: "Gilet jaune",
    description: "Le gilet fluo, tous les samedis depuis le premier.",
    strength: "Costaud, et dur à embarquer.",
    weakness: "Lent.",
    stats: { ...BASE, speed: 0.85, maxHp: 130, grabTime: 1.25 },
  },
  [Archetype.BlackBloc]: {
    name: "Black bloc",
    description: "Tout en noir, capuche, lunettes de piscine.",
    strength: "Casse le mobilier urbain deux fois plus vite.",
    weakness: "Les CRS le visent en priorité.",
    stats: { ...BASE, propDamage: 2, targetWeight: 1.4 },
  },
  [Archetype.Cgt]: {
    name: "Syndicaliste CGT",
    description: "Chasuble rouge, drapeau, odeur de merguez.",
    strength: "Soigne doucement les camarades autour (merguez et sono).",
    weakness: "Lent.",
    stats: { ...BASE, speed: 0.85, healAura: 2 },
  },
  [Archetype.Etudiant]: {
    name: "Étudiant·e",
    description: "Sac à dos, pancarte faite main la veille.",
    strength: "Libère les camarades plus vite.",
    weakness: "Fragile.",
    stats: { ...BASE, rescueTime: 0.6, maxHp: 75 },
  },
  [Archetype.Retraite]: {
    name: "Retraité·e",
    description: "Béret, canne et cabas à roulettes.",
    strength: "Les CRS mettent une éternité à l'embarquer.",
    weakness: "Très lent.",
    stats: { ...BASE, speed: 0.75, grabTime: 1.75 },
  },
};

/** Every archetype id, in menu order (the default first). */
export const ARCHETYPE_IDS: readonly Archetype[] = [
  Archetype.Lambda,
  Archetype.Bobo,
  Archetype.Cite,
  Archetype.GiletJaune,
  Archetype.BlackBloc,
  Archetype.Cgt,
  Archetype.Etudiant,
  Archetype.Retraite,
];
