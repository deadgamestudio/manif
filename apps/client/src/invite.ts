import { LOBBY_QUERY_PARAM, parseLobbyCode } from "@manif/shared";

/** The lobby code from the page URL (`?lobby=<code>`), or "" when there is none. */
export function readInviteCode(): string {
  return parseLobbyCode(new URLSearchParams(location.search).get(LOBBY_QUERY_PARAM) ?? "");
}

/** The shareable link for a lobby. A query parameter, so static hosting needs no rewrite rule. */
export function inviteLink(code: string): string {
  const url = new URL(location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set(LOBBY_QUERY_PARAM, code);
  return url.toString();
}

/**
 * Puts the current lobby's invite link in the address bar (or removes it with
 * null), without adding a history entry. A copy from the address bar then
 * works too, and a refresh rejoins the same lobby.
 */
export function setInviteUrl(code: string | null) {
  const next = code ? inviteLink(code) : `${location.pathname}${location.hash}`;
  if (next !== location.href) history.replaceState(history.state, "", next);
}
