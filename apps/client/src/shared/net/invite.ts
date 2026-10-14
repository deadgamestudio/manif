import { LOBBY_QUERY_PARAM, parseLobbyCode } from "@manif/shared";

/** The lobby code from the page URL (`?lobby=<code>`), or "" when there is none. */
export function readInviteCode(): string {
  return parseLobbyCode(new URLSearchParams(location.search).get(LOBBY_QUERY_PARAM) ?? "");
}

/**
 * The shareable link for a lobby, on the home page (`/`) whatever page this
 * is (the help, #71, can be open at `/aide`). A query parameter, so static
 * hosting needs no rewrite rule.
 */
export function inviteLink(code: string): string {
  const url = new URL("/", location.href);
  url.searchParams.set(LOBBY_QUERY_PARAM, code);
  return url.toString();
}

/**
 * Puts the current lobby's code in the address bar (or removes it with
 * null), without adding a history entry. A copy from the address bar then
 * works too, and a refresh rejoins the same lobby. The path stays: the help
 * overlay (#71) may have it at `/aide`.
 */
export function setInviteUrl(code: string | null) {
  const url = new URL(location.href);
  url.search = "";
  if (code) url.searchParams.set(LOBBY_QUERY_PARAM, code);
  const next = url.toString();
  if (next !== location.href) history.replaceState(history.state, "", next);
}
