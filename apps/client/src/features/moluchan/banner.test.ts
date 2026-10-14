import { describe, expect, test } from "bun:test";
import { MoluchanPhase } from "@manif/shared";
import { bannerFor } from "./banner.ts";

describe("Moluchan's HUD banner (#85)", () => {
  test("he arrives, he leaves untouched, or a CRS gets him", () => {
    expect(bannerFor(null, MoluchanPhase.Rallying)).toBe("arrive");
    // Protected once he is gone after leaving, not when he starts walking off (a CRS may still get him).
    expect(bannerFor(MoluchanPhase.Rallying, MoluchanPhase.Leaving)).toBeNull();
    expect(bannerFor(MoluchanPhase.Leaving, null)).toBe("protected");
    expect(bannerFor(MoluchanPhase.Rallying, MoluchanPhase.Grabbed)).toBe("grabbed");
    // Grabbed on his way out: still embarqué.
    expect(bannerFor(MoluchanPhase.Leaving, MoluchanPhase.Grabbed)).toBe("grabbed");
  });

  test("no banner for nothing new, or for him gone after a grab", () => {
    expect(bannerFor(null, null)).toBeNull();
    expect(bannerFor(MoluchanPhase.Rallying, MoluchanPhase.Rallying)).toBeNull();
    expect(bannerFor(MoluchanPhase.Grabbed, null)).toBeNull();
  });
});
