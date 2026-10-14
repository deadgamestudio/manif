import { MoluchanPhase } from "@manif/shared";

/** Jeun-Lac Moluchan's three moments on the HUD (#85). */
export type MoluchanBanner = "arrive" | "protected" | "grabbed";

export const MOLUCHAN_BANNERS: Readonly<Record<MoluchanBanner, { icon: string; text: string }>> = {
  arrive: { icon: "📣", text: "Jeun-Lac Moluchan rejoint le cortège !" },
  protected: { icon: "🎉", text: "Moluchan protégé !" },
  grabbed: { icon: "🚐", text: "Moluchan embarqué !" },
};

/**
 * Which banner a change of his phase shows (`null`: he isn't there), or null
 * for none. Gone after leaving (his time was up and no CRS got him on the way
 * out) means the cortège kept him safe; a grab while leaving is still "grabbed".
 */
export function bannerFor(prev: MoluchanPhase | null, next: MoluchanPhase | null): MoluchanBanner | null {
  if (prev === next) return null;
  if (next === MoluchanPhase.Grabbed) return "grabbed";
  if (next === null && prev === MoluchanPhase.Leaving) return "protected";
  if (next === MoluchanPhase.Rallying && prev === null) return "arrive";
  return null;
}
