/*
 * Every GLB the game uses (#28), so nobody hand-types a path. Jordan's files
 * live in apps/client/public/models/manif/<batch>/...; assets/manif/catalog.json
 * lists them all, and assets.test.ts checks every URL here exists in both.
 *
 * Conventions of these files (assets/manif/README.md): meters, Y up, +Z
 * forward (the game's yaw 0 too), pivots at the feet, so no extra rotation or
 * scale is needed. Characters share one 19-bone rig, so a clip from any
 * clip library drives any body.
 *
 * Not listed on purpose: the "later concept" batches (vehicule-canon-eau-v01,
 * decors-complements-v01, animations-embarquement-v01, fourgon-v02,
 * personnages-complements-v01), the superseded production-v1 police,
 * firefighter and lyceen drafts, and the optional extras. Add a URL here when
 * a feature starts using it.
 *
 * Plain strings, no three.js: this file is safe to import anywhere, but only
 * 3D code has a reason to.
 */
import { Archetype } from "@manif/shared";

const M = "/models/manif";

export const MODELS = {
  /**
   * Protester bodies, one per look. The production-v1 ones also carry draft
   * clips (`<asset>__repos`...): ignore those, drive them with `clipLibraries`.
   * The four lyceen files are full v03 bodies with all 19 core clips inside.
   */
  characters: {
    neutral: `${M}/production-v1/personnages/protester-neutral/protester-neutral.glb`,
    bobo: `${M}/production-v1/personnages/protester-bobo/protester-bobo.glb`,
    tracksuit: `${M}/production-v1/personnages/protester-tracksuit/protester-tracksuit.glb`,
    giletJaune: `${M}/production-v1/personnages/protester-gilet-jaune/protester-gilet-jaune.glb`,
    blackBloc: `${M}/production-v1/personnages/protester-black-bloc/protester-black-bloc.glb`,
    cgt: `${M}/production-v1/personnages/protester-cgt/protester-cgt.glb`,
    retraite: `${M}/production-v1/personnages/protester-retraite/protester-retraite.glb`,
    lyceenHoodie: `${M}/animations-manifestants-v03/lyceen-hoodie/lyceen-hoodie.glb`,
    lyceenMaillot: `${M}/animations-manifestants-v03/lyceen-maillot/lyceen-maillot.glb`,
    lyceenneSweat: `${M}/animations-manifestants-v03/lyceenne-sweat/lyceenne-sweat.glb`,
    lyceenneCoupeVent: `${M}/animations-manifestants-v03/lyceenne-coupe-vent/lyceenne-coupe-vent.glb`,
    /** Pompier, with hose-ready, hose-walk, hose-spray, hose-sweep. Water comes out of the `water-outlet` node. */
    firefighter: `${M}/animations-pompier-v01/firefighter/firefighter.glb`,
  },

  /**
   * Files loaded for their clips (they hold a body too, unused). Bare clip
   * names, e.g. `idle`, `walk`, `ko-collapse`, `seize`. All at 24 fps.
   */
  clipLibraries: {
    /** The 19 core protester motions: idle, walk, panic-run, throw, pick-up, carry-light/heavy/overhead, carried-overhead, air-flail, melee-swing, clumsy-dive, gas-cough, on-fire-run, pat-out, rescue-pull, knockdown, get-up, celebrate. */
    protesterCore: `${M}/animations-manifestants-v03/lyceen-hoodie/lyceen-hoodie.glb`,
    /** Five more (v04 does not repeat v03): gas-stagger, ko-collapse, light-fire, overhead-toss, tomato-stumble. */
    protesterExtra: `${M}/animations-manifestants-v04/lyceen-hoodie/lyceen-hoodie.glb`,
    /** armband-reveal (the armband shows at 1.375 s). */
    bacReveal: `${M}/animations-bac-v01/lyceen-hoodie/lyceen-hoodie.glb`,
    /** Standing grab by the collar, CRS side: seize, then hold-loop. Offsets in assets/manif/reports/animations-saisies-v02/pairs.json (gltf_* fields). */
    grabCollarCrs: `${M}/animations-saisies-v02/crs-lyceen-hoodie-collar/crs-lyceen-hoodie-collar.glb`,
    /** Standing grab by the collar, victim side: seized, then held-loop. */
    grabCollarVictim: `${M}/animations-saisies-v02/lyceen-hoodie-collar/lyceen-hoodie-collar.glb`,
    /** Dragging on the ground by the collar, CRS side: ground-grab, then ground-drag (walks backward). */
    dragCollarCrs: `${M}/animations-trainage-v02/crs-lyceen-hoodie-collar/crs-lyceen-hoodie-collar.glb`,
    /** Dragging on the ground by the collar, victim side: ground-grabbed, then ground-dragged. */
    dragCollarVictim: `${M}/animations-trainage-v02/lyceen-hoodie-collar/lyceen-hoodie-collar.glb`,
  },

  /** Police units and their vehicles. Each body file holds its own clips. */
  police: {
    /** guard-idle, formation-walk, shield-raise, shield-shove, baton-swing. Two palette images (both get the skin recolour). Visor is a BLEND material. */
    crs: `${M}/animations-police-v01/crs/crs.glb`,
    /** canister-throw, formation-walk, guard-idle. */
    crsGrenadier: `${M}/animations-police-v01/crs-grenadier/crs-grenadier.glb`,
    /** Baton on the hip, splat on the visor: visor-wipe, formation-walk, guard-idle. */
    crsSplatted: `${M}/animations-police-v01/crs-splatted/crs-splatted.glb`,
    /** The BAC armband, attached to upper_arm_L (see the plan's trap about its offset). */
    bacArmband: `${M}/animations-bac-v01/bac-armband/bac-armband.glb`,
    /**
     * The LBD's launcher (#100). Not Jordan's: made by Claude in Blender, in his
     * style (same palette strip). Pivot at the pistol grip, +Z forward: it sits in
     * the body's `socket_hand_L` as is. Node `muzzle` at the front of the barrel.
     */
    lbdLauncher: `${M}/accessoires-v01/lbd-launcher/lbd-launcher.glb`,
    bravMotorbike: `${M}/production-v1/brav-m-motorbike/brav-m-motorbike.glb`,
    /** riding, fall-off. Shares its origin with the bike. */
    bravRider: `${M}/animations-brav-v01/brav-m-rider/brav-m-rider.glb`,
    /** riding, dismount, fall-off. */
    bravPassenger: `${M}/animations-brav-v01/brav-m-passenger/brav-m-passenger.glb`,
    /** The bike tipping over. Its one clip is named `Scene`. */
    bikeTip: `${M}/animations-moto-v01/bike-tip/bike-tip.glb`,
    /** The bike sliding along the ground. Its one clip is named `Scene`. */
    bikeSlide: `${M}/animations-moto-v01/bike-slide/bike-slide.glb`,
    /** The bike lying on its side, still. */
    bikeTipped: `${M}/animations-moto-v01/bike-tipped/bike-tipped.glb`,
    /** The "panier à salade": 2.4 × 2.4 × 5 m, front +Z, closed. Nodes `driver` and `rear-entry`. */
    policeVan: `${M}/production-v1/police-van/police-van.glb`,
  },

  /** Breakable and movable street objects. */
  props: {
    binIntact: `${M}/production-v1/bin-intact/bin-intact.glb`,
    binBroken: `${M}/production-v1/bin-broken/bin-broken.glb`,
    binBurning: `${M}/production-v1/bin-burning/bin-burning.glb`,
    binCharred: `${M}/production-v1/bin-charred/bin-charred.glb`,
    carIntact: `${M}/production-v1/car-intact/car-intact.glb`,
    carBroken: `${M}/production-v1/car-broken/car-broken.glb`,
    carBurning: `${M}/production-v1/car-burning/car-burning.glb`,
    carCharred: `${M}/production-v1/car-charred/car-charred.glb`,
    busShelterIntact: `${M}/production-v1/bus-shelter-intact/bus-shelter-intact.glb`,
    busShelterBroken: `${M}/production-v1/bus-shelter-broken/bus-shelter-broken.glb`,
    marketStallIntact: `${M}/production-v1/market-stall-intact/market-stall-intact.glb`,
    marketStallBroken: `${M}/production-v1/market-stall-broken/market-stall-broken.glb`,
    debrisGlass: `${M}/production-v1/debris-glass/debris-glass.glb`,
    debrisPlastic: `${M}/production-v1/debris-plastic/debris-plastic.glb`,
    debrisMetalPanel: `${M}/production-v1/debris-metal-panel/debris-metal-panel.glb`,
    debrisBinLid: `${M}/production-v1/debris-bin-lid/debris-bin-lid.glb`,
    debrisCarDoor: `${M}/production-v1/debris-car-door/debris-car-door.glb`,
    /** A 2 m shopfront module, tiled across a shop's width. */
    facadeShop: `${M}/production-v1/reprises/facade-shop-2m/facade-shop-2m.glb`,
    shopWindowIntact: `${M}/production-v1/shop-window-intact/shop-window-intact.glb`,
    shopWindowBroken: `${M}/production-v1/shop-window-broken/shop-window-broken.glb`,
    fireTruck: `${M}/production-v1/fire-truck/fire-truck.glb`,
    fireTruckOpen: `${M}/production-v1/fire-truck-open/fire-truck-open.glb`,
    /** Moluchan's megaphone (stand-in until his own model). */
    megaphone: `${M}/production-v1/reprises/megaphone/megaphone.glb`,
    /**
     * La Douane's oversized water gun (#120). Not Jordan's: made by Claude in
     * Blender, in his style (its own palette strip, cell 15 the bright blue).
     * Pivot at the pistol grip, +Z forward. Node `muzzle` at the nozzle (0.595 m ahead, 0.06 up).
     */
    waterGun: `${M}/accessoires-v01/water-gun/water-gun.glb`,
    /**
     * Alexandre Bénanas's riot helmet, visor down (#123). Not Jordan's: made by
     * Claude in Blender, in his style (same palette strip). Pivot at the `head`
     * bone's origin, like the hats: added to that bone as is. Cell 1 the shell,
     * 3 the visor, 8 the hinges and the ridge.
     */
    riotHelmet: `${M}/accessoires-v01/riot-helmet/riot-helmet.glb`,
  },

  /** Fixed level pieces. */
  scenery: {
    newspaperKiosk: `${M}/production-v1/newspaper-kiosk/newspaper-kiosk.glb`,
    sideStreetBarrier: `${M}/production-v1/side-street-barrier/side-street-barrier.glb`,
    prefecture: `${M}/production-v1/prefecture/prefecture.glb`,
    prefectureForecourt: `${M}/production-v1/prefecture-forecourt/prefecture-forecourt.glb`,
    /** For works-1 (7 m long). */
    constructionWall7: `${M}/production-v1/construction-wall-7/construction-wall-7.glb`,
    /** For works-2 (6.5 m long). */
    constructionWall6_5: `${M}/production-v1/construction-wall-6-5/construction-wall-6-5.glb`,
    startWall: `${M}/production-v1/start-wall/start-wall.glb`,
    startZone: `${M}/production-v1/start-zone/start-zone.glb`,
    tree: `${M}/production-v1/tree-level/tree-level.glb`,
    lampPost: `${M}/production-v1/lamp-post-level/lamp-post-level.glb`,
    bollard: `${M}/production-v1/bollard-level/bollard-level.glb`,
    crosswalk: `${M}/production-v1/crosswalk/crosswalk.glb`,
    roadDash: `${M}/production-v1/road-dash/road-dash.glb`,
    pavementKit: `${M}/production-v1/pavement-kit/pavement-kit.glb`,
    facadeCorner: `${M}/production-v1/facade-corner-2m/facade-corner-2m.glb`,
    floorBalcony: `${M}/production-v1/reprises/etage-balcon-2m/etage-balcon-2m.glb`,
    floorBrick: `${M}/production-v1/reprises/etage-brique-2m/etage-brique-2m.glb`,
    floorStone: `${M}/production-v1/reprises/etage-pierre-2m/etage-pierre-2m.glb`,
    buildingDoor: `${M}/production-v1/reprises/porte-immeuble-2m/porte-immeuble-2m.glb`,
  },

  /** What gets carried and thrown. */
  throwables: {
    pave: `${M}/production-v1/reprises/pave/pave.glb`,
    tomato: `${M}/production-v1/reprises/tomato/tomato.glb`,
    dogPoo: `${M}/production-v1/reprises/dog-poo/dog-poo.glb`,
    trottinette: `${M}/production-v1/reprises/trottinette/trottinette.glb`,
    tearGasCanister: `${M}/production-v1/reprises/tear-gas-canister/tear-gas-canister.glb`,
    /** #121: the Vélib, made by Claude in Blender in Jordan's style (its own palette strip, cell 15 the Vélib green). Life-size, front along +Z, wheels on y = 0. */
    velib: `${M}/accessoires-v01/velib/velib.glb`,
    /** #121: one dock of a Vélib station. The bike in it stands 0.98 along -Z, facing it (see `velibDocks`). */
    velibDock: `${M}/accessoires-v01/velib/velib-dock.glb`,
  },

  /**
   * Effects. Most are opaque puffs animated by object transforms (their clip
   * has the asset's name): give each its own Animator, and clone the material
   * (cloneMaterials) to fade it.
   */
  effects: {
    teargasCloud: `${M}/effets-v01/teargas-cloud/teargas-cloud.glb`,
    flameLoop: `${M}/effets-v01/flame-loop/flame-loop.glb`,
    smokeColumn: `${M}/effets-v01/smoke-column/smoke-column.glb`,
    bumFlames: `${M}/effets-v01/bum-flames/bum-flames.glb`,
    waterJet: `${M}/effets-v01/water-jet/water-jet.glb`,
    stinkCloud: `${M}/effets-v01/stink-cloud/stink-cloud.glb`,
    /** On a visor or a body. No clip. */
    tomatoSplat: `${M}/effets-v01/tomato-splat/tomato-splat.glb`,
    /** On the ground. No clip. */
    tomatoSplatGround: `${M}/production-v1/tomato-splat-ground/tomato-splat-ground.glb`,
    hitFlash: `${M}/effets-v01/hit-flash/hit-flash.glb`,
    impactPuff: `${M}/effets-v01/impact-puff/impact-puff.glb`,
    bonkStars: `${M}/effets-v01/bonk-stars/bonk-stars.glb`,
  },

  /**
   * What protesters wear on top of their body (#113), picked per player in
   * player/accessories.ts. Not Jordan's: made by Claude in Blender, in his
   * style (same palette strip). Each one's pivot is the origin of the bone it
   * goes on (`head` or `spine`, both unrotated in the shared rig), so it is
   * added to that bone as is. The placard has a `grip` node mid-stick.
   */
  accessories: {
    beanie: `${M}/accessoires-v01/beanie/beanie.glb`,
    cap: `${M}/accessoires-v01/cap/cap.glb`,
    cgtCap: `${M}/accessoires-v01/cgt-cap/cgt-cap.glb`,
    beret: `${M}/accessoires-v01/beret/beret.glb`,
    bandana: `${M}/accessoires-v01/bandana/bandana.glb`,
    scarf: `${M}/accessoires-v01/scarf/scarf.glb`,
    backpack: `${M}/accessoires-v01/backpack/backpack.glb`,
    toteBag: `${M}/accessoires-v01/tote-bag/tote-bag.glb`,
    flag: `${M}/accessoires-v01/flag/flag.glb`,
    placard: `${M}/accessoires-v01/placard/placard.glb`,
    /** The CGT's merguez barbecue (#116, player/cgtKit.ts): a grill tray on a neck strap, on `spine`. Its own palette strip (cell 15 the merguez). Node `smoke` above the grill. */
    barbecue: `${M}/accessoires-v01/barbecue/barbecue.glb`,
  },

  /** 3D markers above and under characters. Fixed shapes, not live bars. */
  ui: {
    playerFootRing: `${M}/interface-3d-v02/player-foot-ring/player-foot-ring.glb`,
    statusKo: `${M}/interface-3d-v02/status-ko/status-ko.glb`,
    statusGrabbed: `${M}/interface-3d-v02/status-grabbed/status-grabbed.glb`,
    statusArrested: `${M}/interface-3d-v02/status-arrested/status-arrested.glb`,
    statusStunned: `${M}/interface-3d-v01/status-stunned/status-stunned.glb`,
    statusGas: `${M}/interface-3d-v01/status-gas/status-gas.glb`,
    statusFire: `${M}/interface-3d-v01/status-fire/status-fire.glb`,
    heldItemMarker: `${M}/interface-3d-v01/held-item-marker/held-item-marker.glb`,
  },
} as const;

export type ModelGroup = keyof typeof MODELS;

/** Every URL of one group, e.g. `modelUrls("props")`. */
export function modelUrls(group: ModelGroup): string[] {
  return Object.values(MODELS[group]);
}

const C = MODELS.characters;

/**
 * The body files of each archetype. Several means "pick one per player" with
 * `bodyUrlFor`, so a cortège of étudiants isn't four clones.
 */
export const ARCHETYPE_BODIES: Record<Archetype, readonly string[]> = {
  [Archetype.Lambda]: [C.neutral],
  [Archetype.Bobo]: [C.bobo],
  [Archetype.Cite]: [C.tracksuit],
  [Archetype.GiletJaune]: [C.giletJaune],
  [Archetype.BlackBloc]: [C.blackBloc],
  [Archetype.Cgt]: [C.cgt],
  [Archetype.Etudiant]: [C.lyceenHoodie, C.lyceenMaillot, C.lyceenneSweat, C.lyceenneCoupeVent],
  [Archetype.Retraite]: [C.retraite],
};

/**
 * The body of a player (or a disguised BAC): the archetype's body, and among
 * several the same one for the same id, every time and on every client.
 * An unknown archetype gets the neutral body.
 */
export function bodyUrlFor(archetype: number, id: string): string {
  const bodies = ARCHETYPE_BODIES[archetype as Archetype] ?? ARCHETYPE_BODIES[Archetype.Lambda];
  return bodies[stableIndex(id, bodies.length)] ?? C.neutral;
}

/** A small string hash (FNV-1a), reduced to [0, n). */
export function stableIndex(id: string, n: number): number {
  if (n <= 1) return 0;
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % n;
}
