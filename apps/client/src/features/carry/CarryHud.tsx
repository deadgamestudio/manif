import { useEffect, useState } from "react";
import { net, type LobbyPlayer } from "../../shared/net/index.ts";
import { useKeyLabels, type KeyLabels } from "../controls/index.ts";
import { carryTargetFor } from "./carryTarget.ts";

/** How often the prompt looks around, in ms (like the rescue prompt). */
const POLL_MS = 100;

const nameOf = (players: readonly LobbyPlayer[], id: string) => players.find((p) => p.id === id)?.name ?? "ton·ta camarade";

/** The line to show, from the live state. Empty when there is nothing to say. */
function prompt(localId: string, players: readonly LobbyPlayer[], touch: boolean, keys: KeyLabels): string {
  const me = net.getPlayer(localId);
  if (!me) return "";
  if (me.carriedBy) return `${nameOf(players, me.carriedBy)} te porte à bout de bras… prépare-toi à voler !`;
  const carried = net.getCarried(localId);
  if (carried !== null) {
    const name = nameOf(players, carried);
    return touch
      ? `Taper pour lancer ${name} · Action pour le·la poser`
      : `${keys.attack} pour lancer ${name} vers la souris · ${keys.interact} pour le·la poser`;
  }
  const target = carryTargetFor(localId, players);
  if (target === null) return "";
  return `${touch ? "Action" : keys.interact} pour soulever ${nameOf(players, target)} !`;
}

/**
 * The carry prompts in the HUD (#11): "E to lift X" next to a free teammate,
 * "click to throw X" while carrying, and a warning for whoever is carried.
 * On touch (#42) it names the Action and Taper buttons. Polls a few times a
 * second and re-renders only when the text changes.
 */
export function CarryHud({ localId, players, touch = false }: { localId: string | null; players: readonly LobbyPlayer[]; touch?: boolean }) {
  const [text, setText] = useState("");
  // The player's own keys (#72).
  const keys = useKeyLabels();
  useEffect(() => {
    if (!localId) return undefined;
    const update = () => setText(prompt(localId, players, touch, keys));
    update();
    const timer = window.setInterval(update, POLL_MS);
    return () => window.clearInterval(timer);
  }, [localId, players, touch, keys]);
  if (!text) return null;
  return <div className="hud-status">{text}</div>;
}
