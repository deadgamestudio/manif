import { MAX_HP, PlayerStatus, ThrowableKind, type PlayerShape } from "@manif/shared";
import { net } from "../../shared/net/index.ts";

/**
 * A disguised BAC (#13) as the protester avatar reads it. It is a bot
 * (`state.crs`), so this builds the player-shaped view PlayerAvatar and
 * HealthBar draw from: its position, facing, name and fire from the bot, and
 * the rest as a healthy protester with empty hands. It coughs in tear gas
 * like everyone else, so the gas does not give it away either. One reused
 * object per BAC, refreshed on each read (read it from useFrame).
 */
const views = new Map<string, PlayerShape>();

export function disguiseSource(id: string): PlayerShape | undefined {
  const c = net.getCrs(id);
  if (!c) return undefined;
  let v = views.get(id);
  if (!v) {
    v = {
      x: 0,
      z: 0,
      rotation: 0,
      name: "",
      down: false,
      hp: MAX_HP,
      status: PlayerStatus.Free,
      stateLeft: 0,
      dodging: false,
      airborne: false,
      rescue: 0,
      carrying: ThrowableKind.None,
      gassed: false,
      onFire: false,
      fireHold: 0,
      carriedBy: "",
    };
    views.set(id, v);
  }
  v.x = c.x;
  v.z = c.z;
  v.rotation = c.rotation;
  v.name = c.name;
  v.down = c.down;
  v.onFire = c.onFire;
  v.gassed = inGas(c.x, c.z);
  return v;
}

/** Drop the cached view of a BAC that revealed itself or left. */
export function forgetDisguise(id: string): void {
  views.delete(id);
}

/** Whether (x, z) is inside a tear gas cloud (#7), as drawn. Walls are ignored: a cosmetic cough only. */
function inGas(x: number, z: number): boolean {
  for (const gid of net.getGasIds()) {
    const g = net.getGasCloud(gid);
    if (g && (g.x - x) ** 2 + (g.z - z) ** 2 <= g.radius * g.radius) return true;
  }
  return false;
}
