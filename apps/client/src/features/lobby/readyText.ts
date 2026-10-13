/** "Gérard n'est pas prêt·e.", "Gérard et Manon ne sont pas prêt·es.", "A, B et C ne sont pas prêt·es." (#62) */
export function notReadyLine(names: readonly string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return `${names[0]} n'est pas prêt·e.`;
  const list = `${names.slice(0, -1).join(", ")} et ${names[names.length - 1]}`;
  return `${list} ne sont pas prêt·es.`;
}

/** The roster heading's count (#62): "2 prêt·es sur 3". Empty when nobody has to be ready (a host alone). */
export function readyCount(ready: number, required: number): string {
  if (required === 0) return "";
  return `${ready} ${ready > 1 ? "prêt·es" : "prêt·e"} sur ${required}`;
}
