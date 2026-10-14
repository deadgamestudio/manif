/**
 * Where the "Comment on joue" help (#71) is open: its URL, `/aide`. The app
 * has no router; this is the one path besides `/`.
 *
 * - Out of a room, `/aide` is the help page itself (from the home screen, or
 *   a link from outside, prerendered for link previews: seo/meta.ts).
 * - In a room (lobby or march), `/aide` is the same help as an overlay on top
 *   of it. Opening it never loads a page, so the player stays in the room:
 *   `openHelp` pushes `/aide` onto the history, closing goes back to the URL
 *   before (the invite link `/?lobby=<code>` included). The query is kept on
 *   `/aide`, so a refresh with the overlay open rejoins the lobby (main.tsx)
 *   and shows the overlay again.
 */
import { useSyncExternalStore } from "react";

export const HELP_PATH = "/aide";

/** Marks the history entries `openHelp` pushed, so closing can go back to the one before. */
const OURS = "manifHelp";

export const isHelpPath = (pathname: string) => pathname === HELP_PATH || pathname === `${HELP_PATH}/`;

const listeners = new Set<() => void>();
let installed = false;
/** A history.back() is on its way (it lands later, as a popstate): a second close must not go back twice. */
let goingBack = false;

function notify() {
  goingBack = false;
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  if (!installed && typeof window !== "undefined") {
    installed = true;
    // The browser's back and forward buttons open and close it too.
    window.addEventListener("popstate", notify);
  }
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const isOpen = () => typeof location !== "undefined" && isHelpPath(location.pathname);

/** Whether the URL is `/aide`: the help page out of a room, the overlay in one. */
export function useHelpOpen(): boolean {
  return useSyncExternalStore(subscribe, isOpen, () => false);
}

const ours = () => (history.state as Record<string, unknown> | null)?.[OURS] === true;

/** Opens the help without loading a page. */
export function openHelp() {
  if (isOpen()) return;
  history.pushState({ [OURS]: true }, "", `${HELP_PATH}${location.search}${location.hash}`);
  notify();
}

/**
 * Closes it: back to the URL it was opened from, or `/` (with the same query)
 * when it was loaded as `/aide`. `replace` stays on this history entry
 * instead (the room went away: the entry before still has its invite code).
 */
export function closeHelp(how: "back" | "replace" = "back") {
  if (!isOpen()) return;
  if (goingBack) return;
  if (how === "back" && ours()) {
    // popstate notifies.
    goingBack = true;
    history.back();
    return;
  }
  history.replaceState(null, "", `/${location.search}${location.hash}`);
  notify();
}

/**
 * For a link to `/aide`: a plain click opens the help in place. A click with
 * a modifier (new tab, new window) or another button is left to the browser,
 * which loads `/aide` elsewhere and never touches this page.
 */
export function onHelpLinkClick(e: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; preventDefault(): void }) {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  openHelp();
}
