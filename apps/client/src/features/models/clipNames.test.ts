import { describe, expect, test } from "bun:test";
import { bareClipName, findClip, indexClips } from "./clipNames.ts";

describe("clip names", () => {
  test("drops the production-v1 asset prefix, keeps bare names", () => {
    expect(bareClipName("crs__repos")).toBe("repos");
    expect(bareClipName("protester-cgt__revendication")).toBe("revendication");
    expect(bareClipName("crs__shield-raised")).toBe("shield-raised");
    expect(bareClipName("idle")).toBe("idle");
    expect(bareClipName("ko-collapse")).toBe("ko-collapse");
    expect(bareClipName("Scene")).toBe("Scene");
  });

  test("indexes several libraries by bare name, the first one winning", () => {
    const core = [{ name: "idle", from: "v03" }, { name: "walk", from: "v03" }];
    const extra = [{ name: "ko-collapse", from: "v04" }, { name: "idle", from: "v04" }];
    const drafts = [{ name: "crs__repos", from: "p1" }];
    const clips = indexClips([core, extra, drafts]);
    expect([...clips.keys()].sort()).toEqual(["idle", "ko-collapse", "repos", "walk"]);
    expect(clips.get("idle")?.from).toBe("v03");
    expect(findClip(clips, "repos")?.from).toBe("p1");
    expect(findClip(clips, "crs__repos")?.from).toBe("p1");
    expect(findClip(clips, "ko-collapse")?.from).toBe("v04");
    expect(findClip(clips, "fly")).toBeUndefined();
  });
});
