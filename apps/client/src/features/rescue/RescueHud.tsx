import { useEffect, useState } from "react";
import { PlayerStatus, pickRescueTarget, type RescueSubject } from "@manif/shared";
import { net, type LobbyPlayer } from "../../shared/net/index.ts";

/** How often the prompt looks around, in ms. Positions change every frame; the prompt doesn't need to. */
const POLL_MS = 100;

/**
 * The grabbed teammate the local player would pull free right now, or null:
 * the same rule as the server, so the name shown is the one a hold will pull.
 * Also lights up the touch Action button (#42).
 */
export function rescueTarget(localId: string, players: readonly LobbyPlayer[]): string | null {
  const me = net.getPlayer(localId);
  // Carried overhead, or hands full of a teammate (#11): no rescue.
  if (!me || me.status !== PlayerStatus.Free || me.down || me.carriedBy || net.getCarried(localId) !== null) return null;
  const subjects: RescueSubject[] = [];
  for (const p of players) {
    const s = net.getPlayer(p.id);
    if (s) subjects.push({ id: p.id, x: s.x, z: s.z, status: s.status });
  }
  return pickRescueTarget({ id: localId, x: me.x, z: me.z, status: me.status }, subjects);
}

/** The line to show, from the live state. Empty when there is nothing to say. */
function prompt(localId: string, players: readonly LobbyPlayer[], key: string): string {
  const me = net.getPlayer(localId);
  if (!me) return "";
  if (me.status === PlayerStatus.Grabbed) return me.rescue > 0 ? "Un·e camarade te tire de là, tiens bon !" : "";
  const target = rescueTarget(localId, players);
  if (target === null) return "";
  const name = players.find((p) => p.id === target)?.name ?? "ton·ta camarade";
  return `Maintiens ${key} pour libérer ${name} !`;
}

/** The local player's struggle meter (#70), 0..100, or -1 when not grabbed. */
function struggleMeter(localId: string): number {
  const me = net.getPlayer(localId);
  return me && me.status === PlayerStatus.Grabbed ? Math.max(0, Math.min(100, me.struggle ?? 0)) : -1;
}

/**
 * The rescue prompt in the HUD (#10): "hold E to free X" next to a grabbed
 * teammate, and a word of hope for the grabbed player while someone pulls.
 * On touch (#42) it names the Action button instead of E. While grabbed, the
 * local player's struggle meter too (#70): it fills as they mash.
 * Polls a few times a second and re-renders only when something shown changes.
 */
export function RescueHud({
  localId,
  players,
  touch = false,
}: {
  localId: string | null;
  players: readonly LobbyPlayer[];
  touch?: boolean;
}) {
  const [text, setText] = useState("");
  const [meter, setMeter] = useState(-1);
  useEffect(() => {
    if (!localId) return undefined;
    const key = touch ? "Action" : "E";
    const update = () => {
      setText(prompt(localId, players, key));
      setMeter(struggleMeter(localId));
    };
    update();
    const timer = window.setInterval(update, POLL_MS);
    return () => window.clearInterval(timer);
  }, [localId, players, touch]);
  if (!text && meter < 0) return null;
  return (
    <>
      {meter >= 0 && (
        <div className="hud-struggle" role="meter" aria-label="Te débattre" aria-valuemin={0} aria-valuemax={100} aria-valuenow={meter}>
          <span className="hud-struggle-label">Débats-toi</span>
          <span className="hud-struggle-bar">
            <span className="hud-struggle-fill" style={{ transform: `scaleX(${meter / 100})` }} />
          </span>
        </div>
      )}
      {text && <div className="hud-status">{text}</div>}
    </>
  );
}
