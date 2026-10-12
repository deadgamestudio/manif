import { useEffect, useState } from "react";
import { PlayerStatus, pickRescueTarget, type RescueSubject } from "@manif/shared";
import { net, type LobbyPlayer } from "../../shared/net/index.ts";

/** How often the prompt looks around, in ms. Positions change every frame; the prompt doesn't need to. */
const POLL_MS = 100;

/** The line to show, from the live state. Empty when there is nothing to say. */
function prompt(localId: string, players: readonly LobbyPlayer[]): string {
  const me = net.getPlayer(localId);
  if (!me) return "";
  if (me.status === PlayerStatus.Grabbed) return me.rescue > 0 ? "Un·e camarade te tire de là, tiens bon !" : "";
  if (me.status !== PlayerStatus.Free || me.down) return "";
  const subjects: RescueSubject[] = [];
  for (const p of players) {
    const s = net.getPlayer(p.id);
    if (s) subjects.push({ id: p.id, x: s.x, z: s.z, status: s.status });
  }
  // The same rule as the server, so the name shown is the one E will pull.
  const target = pickRescueTarget({ id: localId, x: me.x, z: me.z, status: me.status }, subjects);
  if (target === null) return "";
  const name = players.find((p) => p.id === target)?.name ?? "ton·ta camarade";
  return `Maintiens E pour libérer ${name} !`;
}

/**
 * The rescue prompt in the HUD (#10): "hold E to free X" next to a grabbed
 * teammate, and a word of hope for the grabbed player while someone pulls.
 * Polls a few times a second and re-renders only when the text changes.
 */
export function RescueHud({ localId, players }: { localId: string | null; players: readonly LobbyPlayer[] }) {
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
