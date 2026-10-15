import { describe, expect, test } from "bun:test";
import { createCache } from "./cache.ts";

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("the model cache", () => {
  test("downloads each URL once and hands the value to everyone", async () => {
    let calls = 0;
    const cache = createCache(async (url) => {
      calls++;
      return { url };
    });
    let notified = 0;
    cache.subscribe(() => notified++);
    const a = cache.load("/a.glb");
    const b = cache.load("/a.glb");
    expect(a).toBe(b);
    expect(cache.get("/a.glb")).toBeNull();
    expect(cache.settled("/a.glb")).toBe(false);
    await tick();
    expect(calls).toBe(1);
    expect(cache.get("/a.glb")).toEqual({ url: "/a.glb" });
    expect(cache.get("/a.glb")).toBe(cache.get("/a.glb"));
    expect(cache.settled("/a.glb")).toBe(true);
    expect(notified).toBe(1);
  });

  test("a failed download is logged once, stays failed and is not retried", async () => {
    let calls = 0;
    const cache = createCache(async () => {
      calls++;
      throw new Error("404");
    });
    const warn = console.warn;
    let warnings = 0;
    console.warn = () => warnings++;
    cache.load("/missing.glb").catch(() => {});
    await tick();
    cache.load("/missing.glb").catch(() => {});
    await tick();
    console.warn = warn;
    expect(calls).toBe(1);
    expect(warnings).toBe(1);
    expect(cache.get("/missing.glb")).toBeNull();
    expect(cache.settled("/missing.glb")).toBe(true);
  });
});
