/**
 * The numbers and lists of the "Comment on joue" help (#71), built from the
 * same constants the game plays with, so the page can't drift after a tuning
 * pass. Plain data, no React: the unit tests load it as is, and fail when an
 * archetype, a score action, a shop kind or a police unit has no line here.
 */
import {
  ACTION_POINTS,
  ARCHETYPES,
  ARCHETYPE_IDS,
  ARRIVED_BONUS,
  CARRY_DURATION,
  CRS_STATS,
  CrsKind,
  DODGE_COOLDOWN,
  DRAG_MIN_TIME,
  FIRE_SPREAD_DELAY,
  GAS_DURATION,
  GRAB_HP_THRESHOLD,
  LEADERBOARD_SIZE,
  LIGHT_TIME,
  LINE_BREAK_DOWNED,
  LINE_FLANK_COUNT,
  MAX_HP,
  MAX_PLAYERS,
  MOLUCHAN,
  DOUANE,
  DOUANE_JET,
  BENANAS,
  ON_FIRE_DURATION,
  PROP_TYPES,
  RESCUE_TIME,
  RESPAWN_DELAY,
  ROUND_DURATION,
  SHOP_KINDS,
  SHOP_TYPES,
  STRUGGLE_TIME,
  THROWABLE_TYPES,
  ThrowableKind,
  WIN_BONUS,
  isPolice,
  type Archetype,
  type ArchetypeStats,
  type ItemKind,
  type RoundPlayerStats,
  type ShopKind,
} from "@manif/shared";

/** "1,5" rather than "1.5": the page is in French. */
export const num = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

/** "8 min" or "90 s". */
export const duration = (seconds: number) => (seconds >= 60 && seconds % 60 === 0 ? `${seconds / 60} min` : `${num(seconds)} s`);

// ---------- The rules, in numbers ----------

/** The handful of numbers the text quotes, each read from its constant. */
export const RULES = {
  roundTime: duration(ROUND_DURATION),
  maxPlayers: MAX_PLAYERS,
  maxHp: MAX_HP,
  crsBaton: CRS_STATS[CrsKind.Crs].batonDamage,
  grabHp: GRAB_HP_THRESHOLD,
  windup: num(CRS_STATS[CrsKind.Crs].grabWindup),
  dragMin: num(DRAG_MIN_TIME),
  struggle: num(STRUGGLE_TIME),
  rescue: num(RESCUE_TIME),
  van: num(RESPAWN_DELAY),
  gas: num(GAS_DURATION),
  dodgeCooldown: num(DODGE_COOLDOWN),
  light: num(LIGHT_TIME),
  onFire: num(ON_FIRE_DURATION),
  spread: num(FIRE_SPREAD_DELAY),
  pompiers: num(CRS_STATS[CrsKind.Pompier].brigade?.arriveDelay ?? 0),
  carry: num(CARRY_DURATION),
  leaderboard: LEADERBOARD_SIZE,
} as const;

// ---------- Les personnages ----------

/** "+12 %", "−15 %". */
const percent = (factor: number) => {
  const p = Math.round((factor - 1) * 100);
  return `${p > 0 ? "+" : "−"}${Math.abs(p)} %`;
};

/**
 * What an archetype changes, one short chip per modifier that differs from
 * the plain protester, from its stats. `good` says whether it helps the
 * player (for the colour).
 */
export function archetypeChips(s: ArchetypeStats): { text: string; good: boolean }[] {
  const chips: { text: string; good: boolean }[] = [];
  if (s.maxHp !== MAX_HP) chips.push({ text: `${s.maxHp} PV`, good: s.maxHp > MAX_HP });
  if (s.speed !== 1) chips.push({ text: `Vitesse ${percent(s.speed)}`, good: s.speed > 1 });
  if (s.grabTime !== 1) chips.push({ text: `Long à embarquer ×${num(s.grabTime)}`, good: s.grabTime > 1 });
  if (s.rescueTime !== 1) chips.push({ text: `Libère en ${num(RESCUE_TIME * s.rescueTime)} s`, good: s.rescueTime < 1 });
  if (s.propDamage !== 1) chips.push({ text: `Casse ×${num(s.propDamage)}`, good: s.propDamage > 1 });
  if (s.throwRange !== 1) chips.push({ text: `Lancer ${percent(s.throwRange)}`, good: s.throwRange > 1 });
  if (s.throwSpread !== 0) chips.push({ text: "Vise de travers", good: false });
  if (s.dodgeCooldown !== 1) chips.push({ text: `Plongeon rechargé en ${num(DODGE_COOLDOWN * s.dodgeCooldown)} s`, good: s.dodgeCooldown < 1 });
  if (s.targetWeight !== 1) chips.push({ text: s.targetWeight > 1 ? "Cible n°1 des CRS" : "Les CRS l'oublient", good: s.targetWeight < 1 });
  if (s.healAura > 0) chips.push({ text: `Soigne ${num(s.healAura)} PV/s autour`, good: true });
  if (s.filmAura !== 1) chips.push({ text: `Filme : prises ×${num(s.filmAura)} plus longues autour`, good: true });
  return chips;
}

export interface ArchetypeCard {
  id: Archetype;
  name: string;
  description: string;
  strength: string;
  weakness: string;
  chips: { text: string; good: boolean }[];
}

/** One card per archetype, in the lobby's order. */
export function archetypeCards(): ArchetypeCard[] {
  return ARCHETYPE_IDS.map((id) => {
    const a = ARCHETYPES[id];
    return { id, name: a.name, description: a.description, strength: a.strength, weakness: a.weakness, chips: archetypeChips(a.stats) };
  });
}

// ---------- Les points ----------

/** What each scored action is called on the page. A stat missing from ACTION_POINTS scores nothing and needs no line. */
export const SCORE_LABELS: Readonly<Partial<Record<keyof RoundPlayerStats, string>>> = {
  crsOut: "Mettre un CRS au tapis (coups ou lancer)",
  rescues: "Libérer un·e camarade",
  splats: "Tomate ou crotte sur un CRS",
  propsBroken: "Casser du mobilier urbain",
  firesLit: "Allumer un feu",
  hpHealed: "Soigner un·e camarade (CGT), par PV rendu",
  arrests: "Se faire embarquer",
  benanasUnmasked: "Démasquer Alexandre Bénanas (avoir tapé dessus)",
};

export interface ScoreRow {
  what: string;
  points: string;
  cap: string;
  bad: boolean;
}

const signed = (n: number) => (n > 0 ? `+${n}` : `−${Math.abs(n)}`);

/** The points table: every action in ACTION_POINTS, the biggest first, then the end-of-round bonuses. */
export function scoreRows(): ScoreRow[] {
  const actions = (Object.entries(ACTION_POINTS) as [keyof RoundPlayerStats, { points: number; cap: number }][])
    .sort((a, b) => b[1].points - a[1].points)
    .map(([stat, { points, cap }]) => ({
      what: SCORE_LABELS[stat] ?? stat,
      points: signed(points),
      cap: Number.isFinite(cap) ? `${cap} max par manche` : "à chaque fois",
      bad: points < 0,
    }));
  return [
    ...actions,
    { what: "Manif gagnée : tout le cortège encore là", points: signed(WIN_BONUS), cap: "une fois", bad: false },
    { what: "En plus, si tu es libre à la Préfecture", points: signed(ARRIVED_BONUS), cap: "une fois", bad: false },
  ];
}

// ---------- Le bazar ----------

/** The things to throw, from THROWABLE_TYPES. */
export const ITEM_NAMES: Readonly<Record<ItemKind, string>> = {
  [ThrowableKind.Pave]: "pavé",
  [ThrowableKind.Tomate]: "tomate",
  [ThrowableKind.Crotte]: "crotte",
  [ThrowableKind.Trottinette]: "trottinette",
  [ThrowableKind.Velib]: "Vélib",
};

const plural = (n: number, word: string) => `${n} ${word}${n > 1 ? "s" : ""}`;

/** What each throwable does, one line each, the numbers from its row. */
export function throwableRows(): { icon: string; name: string; what: string }[] {
  const pave = THROWABLE_TYPES[ThrowableKind.Pave];
  const tomate = THROWABLE_TYPES[ThrowableKind.Tomate];
  const crotte = THROWABLE_TYPES[ThrowableKind.Crotte];
  const trott = THROWABLE_TYPES[ThrowableKind.Trottinette];
  const velib = THROWABLE_TYPES[ThrowableKind.Velib];
  return [
    { icon: "🧱", name: "Pavé", what: `Assomme le CRS touché ${num(pave.stun)} s : il lâche qui il tenait. Retombe par terre, à relancer.` },
    { icon: "🍅", name: "Tomate", what: `Va loin. Visière rouge : le CRS ne voit plus rien pendant ${num(tomate.effectTime)} s.` },
    { icon: "💩", name: "Crotte", what: `Le CRS pue ${num(crotte.effectTime)} s et ses collègues l'évitent. Ratée, elle reste par terre : ça glisse.` },
    { icon: "🛴", name: "Trottinette", what: `Lourde, tu marches moins vite et sans sauter. Lancée, elle renverse jusqu'à ${plural(trott.pierce, "CRS")} d'affilée.` },
    // #121: in the Vélib stations along the kerb.
    { icon: "🚲", name: "Vélib", what: `Dans les stations Vélib. Encore plus lourd : tu avances à ${Math.round(velib.carrySpeed * 100)} % et pas loin. Lancé, il fait tomber jusqu'à ${plural(velib.pierce, "CRS")} et tape plus fort.` },
  ];
}

/** The French name of each shop kind (#68). */
export const SHOP_NAMES: Readonly<Record<ShopKind, string>> = {
  boulangerie: "Boulangerie",
  cafe: "Café",
  sneakers: "Magasin de baskets",
  banque: "Banque",
  kebab: "Kebab",
  toilettage: "Toilettage pour chiens",
  burger: "Fast-food burger",
  poulet: "Poulet frit et tacos",
  sport: "Magasin de sport",
  telephone: "Réparation de téléphones",
  pharmacie: "Pharmacie",
  superette: "Supérette",
  tabac: "Tabac-presse",
};

/** A count of an item, "2 tomates", "1 crotte". */
const items = (n: number, kind: ItemKind) => plural(n, ITEM_NAMES[kind]);

/** The shops dealt each round (#68), from PROP_TYPES: how many hits, what falls out, and the names on their signs (#117). */
export function shopRows(): { name: string; signs: string; hits: number; drops: string }[] {
  return SHOP_KINDS.map((kind) => {
    const t = PROP_TYPES[kind];
    return { name: SHOP_NAMES[kind], signs: SHOP_TYPES[kind].signs.join(", "), hits: t.maxHp, drops: items(t.drops, t.dropKind) };
  });
}

/** The street furniture that is always there, from PROP_TYPES. */
export function furnitureRows(): { name: string; hits: number; drops: string; burns: boolean }[] {
  const row = (name: string, kind: "bin" | "bus_shelter" | "car" | "market_stall") => {
    const t = PROP_TYPES[kind];
    return { name, hits: t.maxHp, drops: t.drops > 0 ? items(t.drops, t.dropKind) : "rien", burns: t.flammable };
  };
  return [row("Poubelle", "bin"), row("Abribus", "bus_shelter"), row("Voiture", "car"), row("Étal du marché", "market_stall")];
}

// ---------- La police ----------

export interface PoliceCard {
  /** The unit it describes, when it is one (a new CrsKind without a card fails the tests). */
  kind?: CrsKind;
  icon: string;
  name: string;
  what: string;
  /** How to deal with it. */
  tip: string;
}

/**
 * One card per police unit. A new unit is one more entry here; the page draws
 * however many there are.
 */
export function policeCards(): PoliceCard[] {
  const crs = CRS_STATS[CrsKind.Crs];
  const bac = CRS_STATS[CrsKind.Bac];
  const bravm = CRS_STATS[CrsKind.BravM];
  const lbd = CRS_STATS[CrsKind.Lbd];
  return [
    {
      kind: CrsKind.Crs,
      icon: "🛡️",
      name: "CRS",
      what: `Plus lent que toi, tape fort (${crs.batonDamage} PV le coup de matraque) et lance des lacrymos sur les groupes.`,
      tip: `Garde tes distances. ${plural(crs.maxHp, "coup")} pour le mettre au tapis, ou un pavé pour l'assommer.`,
    },
    {
      icon: "🧱",
      name: "Ligne de boucliers",
      what: "Un mur de CRS en travers de la rue. Avance doucement, bloque et repousse.",
      tip: `Tapez-la tous ensemble, mettez-en ${LINE_BREAK_DOWNED} au sol en même temps, ou passez à ${LINE_FLANK_COUNT} derrière : elle se disperse.`,
    },
    {
      kind: CrsKind.Bac,
      icon: "🕶️",
      name: "BAC",
      what: "En civil, il se glisse dans le cortège, puis sort son brassard et embarque quelqu'un, même en pleine forme.",
      tip: `Méfie-toi du manifestant que personne ne connaît. Un coup le démasque, ${plural(bac.maxHp, "coup")} et il est au tapis.`,
    },
    {
      kind: CrsKind.BravM,
      icon: "🏍️",
      name: "BRAV-M",
      what: "Des duos à moto qui foncent dans le tas. Le passager descend, frappe, et ils repartent.",
      tip: `Un pavé, un·e camarade lancé·e ou ${bravm.staggerHits} coups d'affilée sur la moto, et les deux tombent.`,
    },
    {
      kind: CrsKind.Lbd,
      icon: "🎯",
      name: "CRS LBD",
      what: `Un gros lanceur en plastique orange. Il reste à distance et ne vise que qui vient de casser, taper ou lancer quelque chose : laser rouge sur tes pieds, puis boing, sur les fesses (${lbd.lbd?.damage ?? 0} PV).`,
      tip: `Plonge quand le laser est sur toi, planque-toi derrière une voiture, ou fonce : ${plural(lbd.maxHp, "coup")} et il est au tapis. Une tomate le fait rater.`,
    },
  ];
}

// ---------- Jeun-Lac Moluchan (#85) ----------

export interface MoluchanCard {
  icon: string;
  name: string;
  what: string;
  /** What his ring does, in numbers. */
  chips: { text: string; good: boolean }[];
  /** What to do with him. */
  tip: string;
}

/** The rare guest on the protesters' side (#85), from MOLUCHAN. A caricature: no real quote. */
export function moluchanCard(): MoluchanCard {
  return {
    icon: "📣",
    name: "Jeun-Lac Moluchan",
    what: `Rare (environ ${Math.round(MOLUCHAN.chance * 100)} % des manches) : il débarque en plein cortège, mégaphone à la main, et reste ${duration(MOLUCHAN.duration)}. Dans son cercle rouge au sol, on marche plus vite, on se débat plus vite quand on est attrapé·e, et on récupère des PV doucement.`,
    chips: [
      { text: `Vitesse ${percent(MOLUCHAN.speedFactor)}`, good: true },
      { text: `Se débat ×${num(MOLUCHAN.struggleFactor)}`, good: true },
      { text: `Soigne ${num(MOLUCHAN.healRate)} PV/s`, good: true },
    ],
    tip: "Protège-le : les CRS le visent en priorité, et s'ils l'attrapent, sa visite est finie. Il ne compte ni pour gagner ni dans les points.",
  };
}

// ---------- La Douane (#120) ----------

/** The rare kid with the water gun (#120), from DOUANE. Only ever called "La Douane". */
export function douaneCard(): MoluchanCard {
  return {
    icon: "💦",
    name: "La Douane",
    what: `Rare (environ ${Math.round(DOUANE.chance * 100)} % des manches) : un gamin débarque d'une rue de côté avec un énorme pistolet à eau et arrose le plus proche, manifestant·e ou CRS, sans choisir son camp. Il reste ${duration(DOUANE.duration)}, puis rentre chez lui.`,
    chips: [
      { text: "Pousse, sans faire tomber", good: false },
      { text: "Éteint les feux", good: true },
      { text: "0 PV de dégâts", good: true },
    ],
    tip: `Personne ne peut le toucher ni l'attraper, et il ne compte pas dans les points. Il tire par rafales à ${num(DOUANE_JET.range)} m : écarte-toi du jet, ou amène-lui un CRS.`,
  };
}

// ---------- Alexandre Bénanas (#123) ----------

/** The rare fake cop (#123), from BENANAS and his row in ACTION_POINTS. Only ever under his mangled name. */
export function benanasCard(): MoluchanCard {
  const bonus = ACTION_POINTS.benanasUnmasked?.points ?? 0;
  return {
    icon: "🪖",
    name: "Alexandre Bénanas",
    what: `Rare (environ ${Math.round(BENANAS.chance * 100)} % des manches) : un type en casque et sweat gris, brassard « POLICE », mais sans uniforme ni bouclier, arrive d'une rue de côté derrière les CRS. Il s'en prend aux manifestant·es isolé·es et les met par terre, puis passe à un·e autre. Il n'arrête personne.`,
    chips: [
      { text: "Renverse, −" + BENANAS.hitDamage + " PV", good: false },
      { text: `${BENANAS.hp} coups et il est démasqué`, good: true },
      { text: `+${bonus} pts à chaque frappeur`, good: true },
    ],
    tip: `Restez groupé·es : à ${BENANAS.crowdCount} autour de lui, il recule. Tapez-le ou lancez-lui ce que vous avez : casque tombé, il s'enfuit pour de bon. Les CRS l'ignorent.`,
  };
}

/** The police units that need a card: every CrsKind but the pompiers. */
export const POLICE_KINDS: readonly CrsKind[] = (Object.values(CrsKind) as CrsKind[]).filter(isPolice);
