import { describe, expect, test } from "bun:test";
import { existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { ARCHETYPE_IDS } from "@manif/shared";
import { PORTRAIT_FILES, portraitUrl } from "./portraits.ts";

const PUBLIC = join(import.meta.dir, "../../../public");

describe("archetype portraits (#126)", () => {
  test("every archetype has its own image, committed and small", () => {
    const urls = ARCHETYPE_IDS.map((id) => portraitUrl(id));
    expect(new Set(urls).size).toBe(ARCHETYPE_IDS.length);
    for (const url of urls) {
      const file = join(PUBLIC, url);
      expect(existsSync(file)).toBe(true);
      expect(statSync(file).size).toBeLessThan(20 * 1024);
    }
  });

  test("an unknown id gets the default archetype's portrait", () => {
    expect(portraitUrl(99)).toBe(`/portraits/${PORTRAIT_FILES[ARCHETYPE_IDS[0]!]}.webp`);
  });
});
