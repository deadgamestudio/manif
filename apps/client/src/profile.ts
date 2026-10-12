import { randomDefaultName, sanitizeName } from "@manif/shared";

const NAME_KEY = "manif.name";

// localStorage can throw (private mode, blocked storage): the name then just isn't remembered.

/** The name saved on this browser, or "" if none. */
export function loadSavedName(): string {
  try {
    return sanitizeName(localStorage.getItem(NAME_KEY) ?? "");
  } catch {
    return "";
  }
}

export function saveName(name: string) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // not remembered, that's all
  }
}

/** What the name field starts with: the saved name, or a random funny one. */
export function initialName(): string {
  return loadSavedName() || randomDefaultName();
}
