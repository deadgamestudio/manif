// DEBUG ONLY (#2, #3). There are no hitters until melee (#4) and CRS (#5), so
// in dev builds a few keys knock bodies over, hurt you or grab you. Mounted only when
// import.meta.env.DEV, and the server refuses the message in production.

import { useEffect } from "react";
import {
  DEBUG_DAMAGE,
  LIGHT_IMPULSE,
  type DebugHealthPayload,
  type DebugKnockbackPayload,
  type DebugRoundPayload,
} from "@manif/shared";
import { net } from "../../shared/net/index.ts";
import { actionFor, controls } from "../controls/index.ts";

const KEYS: Record<string, DebugKnockbackPayload> = {
  /** Heavy hit on yourself: you fly forward and fall. */
  KeyK: { target: "self" },
  /** Light hit on yourself: a push, no fall. */
  KeyJ: { target: "self", strength: LIGHT_IMPULSE },
  /** Heavy hit on the nearest other player, away from you. */
  KeyL: { target: "nearest" },
};

const HEALTH_KEYS: Record<string, DebugHealthPayload> = {
  /** Lose DEBUG_DAMAGE HP; four of them and you are KO, then arrested. */
  KeyH: { action: "damage" },
  /** Get grabbed: dragged, then arrested. */
  KeyG: { action: "grab" },
};

const ROUND_KEYS: Record<string, DebugRoundPayload> = {
  /** Jump into the Préfecture zone (#12): with enough of the cortège there, the round is won. */
  KeyP: { action: "teleport", progress: 1 },
  /** Cut the round timer to 10 s (#12), to see the timeout. */
  KeyT: { action: "time", seconds: 10 },
  /** Throw water around you (#16), standing in for the pompiers' hose (#17): fires and burning bodies within 4 go out. */
  KeyY: { action: "water", radius: 4 },
  /** Jeun-Lac Moluchan (#85) turns up 3 m in front of you, whatever the roll. */
  KeyO: { action: "moluchan", distance: 3 },
  /** La Douane (#120) turns up 4 m in front of you, whatever the roll. */
  KeyI: { action: "douane", distance: 4 },
  /** Alexandre Bénanas (#123) turns up 5 m in front of you, whatever the roll. */
  KeyN: { action: "benanas", distance: 5 },
  /** His helmet comes off now (#123), to see him run (brings him first if he isn't there). */
  KeyV: { action: "benanas", distance: 5, unmask: true },
  /** Le Z (#133) turns up 5 m in front of you, whatever the roll, then walks to his spot behind the CRS. */
  KeyZ: { action: "lez", distance: 5 },
  /** He is chased off now (#133), to see him go (brings him first if he isn't there). */
  KeyX: { action: "lez", distance: 5, chase: true },
  /** The street turns hot now (#98): the CRS stop escorting and chase anyone. */
  KeyU: { action: "hot" },
};

/** Break the nearest shop and step into its room (#84, #117), to see the loot and the room's dressing. */
const SHOP_KEY = "KeyB";

const DEBUG_CODES = [...Object.keys(KEYS), ...Object.keys(HEALTH_KEYS), ...Object.keys(ROUND_KEYS), SHOP_KEY];

/** A debug key the player bound to an action (#72) is theirs: say so in the console, once per keymap. */
let warnedFor: unknown = null;
function warnCollisions() {
  const km = controls.get();
  if (km === warnedFor) return;
  warnedFor = km;
  for (const code of DEBUG_CODES) {
    const action = actionFor(km, code);
    if (action) console.warn(`[debug] ${code} est lié à « ${action} » dans les touches : la touche de debug est ignorée.`);
  }
}

export function DebugKnockbackKeys() {
  useEffect(() => {
    warnCollisions();
    return controls.subscribe(warnCollisions);
  }, []);

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.repeat || controls.isCapturing() || actionFor(controls.get(), e.code)) return;
      const knock = KEYS[e.code];
      const health = HEALTH_KEYS[e.code];
      const round = ROUND_KEYS[e.code];
      const shop = e.code === SHOP_KEY;
      if (!knock && !health && !round && !shop) return;
      e.preventDefault();
      if (shop) net.debugShop({});
      if (knock) net.debugKnockback(knock);
      if (health) net.debugHealth(health);
      if (round) net.debugRound(round);
    };
    window.addEventListener("keydown", onDown);
    return () => window.removeEventListener("keydown", onDown);
  }, []);

  return (
    <div className="hud-debug">
      debug : K te renverse · J te pousse · L renverse le plus proche · H te blesse (−{DEBUG_DAMAGE}) · G te fait
      attraper · P saute à la Préfecture · T coupe le chrono à 10 s · Y éteint les feux autour · O fait venir Moluchan · I fait venir La Douane · N fait venir Bénanas · V le démasque · Z fait venir Le Z · X le chasse · B casse la boutique la plus proche et y entre
    </div>
  );
}
