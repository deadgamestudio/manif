import { RoundResult } from "@manif/shared";

/** 125 -> "2:05". */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** The end-screen headline and its subtitle, per result. */
export function resultText(result: RoundResult): { title: string; line: string } {
  switch (result) {
    case RoundResult.Won:
      return { title: "Victoire !", line: "Le cortège danse sur les marches de la Préfecture." };
    case RoundResult.LostArrested:
      return { title: "Tous au panier !", line: "Le cortège entier tient dans un seul fourgon. Record battu." };
    case RoundResult.LostTime:
      return { title: "Trop tard…", line: "La manif s'est dispersée avant la Préfecture. On remet ça ?" };
    default:
      return { title: "", line: "" };
  }
}

/**
 * What the end screen says about the lasting totals (#41), or null when the
 * round was banked (the new totals show next to each player then).
 */
export function bankText(bank: "saved" | "debug" | "off" | undefined): string | null {
  if (bank === "debug") return "Manif de test (triche de dev) : ces points ne comptent pas au classement.";
  if (bank === "off") return "Classement indisponible pour l'instant : seuls les points de cette manif comptent.";
  return null;
}
