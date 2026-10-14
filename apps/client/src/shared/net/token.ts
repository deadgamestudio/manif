import { isDeviceToken } from "@manif/shared";

/**
 * This browser's device token (#41): the anonymous secret the server issued
 * on a first visit, kept beside the saved name and sent on every join. The
 * lasting total belongs to it, so clearing site data starts a new player at 0.
 * Never shown, never put in a link.
 */
const TOKEN_KEY = "manif.token";

// localStorage can throw (private mode, blocked storage), like the saved name
// (features/home/profile.ts): the token then just isn't remembered, and every
// visit starts at 0.

/** The token saved on this browser, or undefined if none (or not a token). */
export function loadToken(): string | undefined {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    return isDeviceToken(token) ? token : undefined;
  } catch {
    return undefined;
  }
}

/** Keep the token the server just issued. Anything that isn't one is ignored. */
export function saveToken(token: unknown) {
  if (!isDeviceToken(token)) return;
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // not remembered, that's all
  }
}
