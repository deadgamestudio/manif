import { describe, expect, test } from "bun:test";
import { lazyModule } from "./lazyModule.ts";

describe("a module loaded on demand", () => {
  test("downloads once, on the first load, and is then ready", async () => {
    let calls = 0;
    const lazy = lazyModule(async () => {
      calls++;
      return { value: 42 };
    });
    expect(lazy.getSnapshot().status).toBe("idle");
    lazy.load();
    lazy.load();
    expect(lazy.getSnapshot().status).toBe("loading");
    await Promise.resolve();
    expect(calls).toBe(1);
    expect(lazy.getSnapshot()).toEqual({ status: "ready", module: { value: 42 } });
  });

  test("tells its subscribers, and a failed download stays failed", async () => {
    const lazy = lazyModule(() => Promise.reject(new Error("chunk gone")));
    const seen: string[] = [];
    lazy.subscribe(() => seen.push(lazy.getSnapshot().status));
    const warn = console.warn;
    console.warn = () => {};
    lazy.load();
    await new Promise((r) => setTimeout(r, 0));
    console.warn = warn;
    lazy.load();
    expect(seen).toEqual(["loading", "failed"]);
  });
});
