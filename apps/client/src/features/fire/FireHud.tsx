import { useEffect, useState } from "react";
import {
  MAX_FIRES,
  PLAYER_RADIUS,
  PlayerStatus,
  STREET_LEVEL,
  flammableProps,
  hasFuel,
  pickFireAction,
  pickRescueTarget,
  type BurningView,
  type FireAction,
  type LightableView,
  type RescueSubject,
} from "@manif/shared";
import { net, type LobbyPlayer } from "../../shared/net/index.ts";
import { inSentence, useKeyLabels } from "../controls/index.ts";
import { carryTargetFor } from "../carry/index.ts";
import { FIRE_TEXT } from "./fireVisuals.tsx";

/** How often the prompt looks around, in ms (like the rescue prompt). */
const POLL_MS = 100;

const FLAMMABLE = flammableProps(STREET_LEVEL.propSlots);

/**
 * What holding interact would do for the local player right now (pat out a
 * burning teammate, or light a prop), with the server's own rules, or null.
 * Also lights up the touch Action button (#42).
 */
export function fireActionFor(localId: string, players: readonly LobbyPlayer[]): FireAction | null {
  const me = net.getPlayer(localId);
  // Carried, or carrying a teammate (#11): hands busy.
  if (!me || me.status !== PlayerStatus.Free || me.down || me.carriedBy || net.getCarried(localId) !== null) return null;
  const subjects: RescueSubject[] = [];
  const burning: BurningView[] = [];
  for (const p of players) {
    const s = net.getPlayer(p.id);
    if (!s) continue;
    subjects.push({ id: p.id, x: s.x, z: s.z, status: s.status });
    if (s.onFire) burning.push({ id: p.id, x: s.x, z: s.z, onFire: true });
  }
  // A rescue comes first; its prompt is the rescue HUD's.
  if (pickRescueTarget({ id: localId, x: me.x, z: me.z, status: me.status }, subjects) !== null) return null;
  const fires = net.getFireIds();
  const lightable: LightableView[] = [];
  if (fires.length < MAX_FIRES) {
    for (const p of FLAMMABLE) {
      const prop = net.getProp(p.id);
      if (!prop || prop.charred || fires.includes(p.id) || !hasFuel(p.kind, prop.hp, prop.broken)) continue;
      // A smashed car still burns, around its wreck (#91).
      const view = prop.broken ? p.wreck : p.intact;
      if (view) lightable.push(view);
    }
  }
  const action = pickFireAction({ id: localId, x: me.x, z: me.z }, PLAYER_RADIUS, burning, lightable);
  // A teammate in reach comes before lighting (#11): the press picks them up.
  if (action?.kind === "light" && carryTargetFor(localId, players) !== null) return null;
  return action;
}

/** The line to show, from the live state. Empty when there is nothing to say. `key` is "E" or "Action". */
function prompt(localId: string, players: readonly LobbyPlayer[], key: string): string {
  if (net.getPlayer(localId)?.onFire) return FIRE_TEXT.onFire(key);
  const action = fireActionFor(localId, players);
  if (!action) return "";
  if (action.kind === "putOut") return FIRE_TEXT.putOut(key, players.find((p) => p.id === action.target)?.name ?? "ton·ta camarade");
  const kind = FLAMMABLE.find((p) => p.id === action.target)?.kind ?? "bin";
  return FIRE_TEXT.light(key, FIRE_TEXT.kinds[kind] ?? "");
}

/**
 * The fire prompts in the HUD (#16): "your bum is on fire", "hold E to pat X
 * out", "hold E to set the bin on fire". Polls a few times a second and
 * re-renders only when the text changes. On touch (#42) it names the Action
 * button instead of E.
 */
export function FireHud({
  localId,
  players,
  touch = false,
}: {
  localId: string | null;
  players: readonly LobbyPlayer[];
  touch?: boolean;
}) {
  const [text, setText] = useState("");
  // The player's own interact key (#72).
  const keys = useKeyLabels();
  useEffect(() => {
    if (!localId) return undefined;
    const key = touch ? "Action" : inSentence(keys.interact);
    const update = () => setText(prompt(localId, players, key));
    update();
    const timer = window.setInterval(update, POLL_MS);
    return () => window.clearInterval(timer);
  }, [localId, players, touch, keys]);
  if (!text) return null;
  return <div className="hud-status">{text}</div>;
}
