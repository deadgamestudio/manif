import { useEffect, useState } from "react";
import {
  MAX_FIRES,
  PLAYER_RADIUS,
  PROP_TYPES,
  PlayerStatus,
  STREET_LEVEL,
  pickFireAction,
  pickRescueTarget,
  propShape,
  type BurningView,
  type LightableView,
  type RescueSubject,
} from "@manif/shared";
import { net, type LobbyPlayer } from "../../shared/net/index.ts";
import { FIRE_TEXT } from "./fireVisuals.tsx";

/** How often the prompt looks around, in ms (like the rescue prompt). */
const POLL_MS = 100;

const FLAMMABLE: readonly (LightableView & { kind: string })[] = STREET_LEVEL.propSlots.flatMap((slot) => {
  const shape = PROP_TYPES[slot.kind].flammable ? propShape(slot, false) : null;
  return shape ? [{ id: slot.id, kind: slot.kind, shape }] : [];
});

/** The line to show, from the live state, with the server's own rules. Empty when there is nothing to say. */
function prompt(localId: string, players: readonly LobbyPlayer[]): string {
  const me = net.getPlayer(localId);
  if (!me) return "";
  if (me.onFire) return FIRE_TEXT.onFire;
  if (me.status !== PlayerStatus.Free || me.down) return "";
  const subjects: RescueSubject[] = [];
  const burning: BurningView[] = [];
  for (const p of players) {
    const s = net.getPlayer(p.id);
    if (!s) continue;
    subjects.push({ id: p.id, x: s.x, z: s.z, status: s.status });
    if (s.onFire) burning.push({ id: p.id, x: s.x, z: s.z, onFire: true });
  }
  // A rescue comes first; its prompt is the rescue HUD's.
  if (pickRescueTarget({ id: localId, x: me.x, z: me.z, status: me.status }, subjects) !== null) return "";
  const fires = net.getFireIds();
  const lightable = fires.length >= MAX_FIRES
    ? []
    : FLAMMABLE.filter((p) => {
        const prop = net.getProp(p.id);
        return prop !== undefined && prop.hp > 0 && !prop.charred && !fires.includes(p.id);
      });
  const action = pickFireAction({ id: localId, x: me.x, z: me.z }, PLAYER_RADIUS, burning, lightable);
  if (!action) return "";
  if (action.kind === "putOut") return FIRE_TEXT.putOut(players.find((p) => p.id === action.target)?.name ?? "ton·ta camarade");
  const kind = FLAMMABLE.find((p) => p.id === action.target)?.kind ?? "bin";
  return FIRE_TEXT.light(FIRE_TEXT.kinds[kind] ?? "");
}

/**
 * The fire prompts in the HUD (#16): "your bum is on fire", "hold E to pat X
 * out", "hold E to set the bin on fire". Polls a few times a second and
 * re-renders only when the text changes.
 */
export function FireHud({ localId, players }: { localId: string | null; players: readonly LobbyPlayer[] }) {
  const [text, setText] = useState("");
  useEffect(() => {
    if (!localId) return undefined;
    const update = () => setText(prompt(localId, players));
    update();
    const timer = window.setInterval(update, POLL_MS);
    return () => window.clearInterval(timer);
  }, [localId, players]);
  if (!text) return null;
  return <div className="hud-status">{text}</div>;
}
