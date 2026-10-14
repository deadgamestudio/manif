/** A room message handler, as in a Colyseus `messages` map. */
type Handler<C> = (client: C, message: unknown) => unknown;

/**
 * Wraps every handler of a `messages` map so `allow(client, type)` runs
 * first; the handler only runs when it says yes.
 */
export function gateMessages<C, T extends Record<string, Handler<C>>>(handlers: T, allow: (client: C, type: string) => boolean): T {
  const gated: Record<string, Handler<C>> = {};
  for (const [type, handler] of Object.entries(handlers)) {
    gated[type] = (client, message) => (allow(client, type) ? handler(client, message) : undefined);
  }
  return gated as T;
}
