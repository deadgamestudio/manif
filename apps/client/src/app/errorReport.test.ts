import { describe, expect, test } from "bun:test";
import type { ErrorEvent } from "@sentry/react";
import { redactUrl, scrubBreadcrumb, scrubEvent } from "./errorReport.ts";

describe("error reports carry no lobby code", () => {
  test("invite links and matchmaking paths lose the code", () => {
    expect(redactUrl("https://manif.bazlab.si/?lobby=Ab3_xYz9Q")).toBe("https://manif.bazlab.si/?lobby=[code]");
    expect(redactUrl("https://manif.bazlab.si/?x=1&lobby=Ab3&y=2#top")).toBe("https://manif.bazlab.si/?x=1&lobby=[code]&y=2#top");
    expect(redactUrl("/colyseus/matchmake/joinById/Ab3_xYz9Q")).toBe("/colyseus/matchmake/joinById/[code]");
    expect(redactUrl("https://h/colyseus/matchmake/reconnect/Ab3?x")).toBe("https://h/colyseus/matchmake/reconnect/[code]?x");
    expect(redactUrl("/colyseus/matchmake/create/street")).toBe("/colyseus/matchmake/create/street");
  });

  test("console breadcrumbs are dropped, others are kept with codes cut", () => {
    expect(scrubBreadcrumb({ category: "console", message: '[net] join "Basile"' })).toBeNull();
    const fetch = scrubBreadcrumb({ category: "fetch", data: { url: "/colyseus/matchmake/joinById/Ab3", status_code: 200 } });
    expect(fetch?.data).toEqual({ url: "/colyseus/matchmake/joinById/[code]", status_code: 200 });
    const nav = scrubBreadcrumb({ category: "navigation", data: { from: "/?lobby=Ab3", to: "/" } });
    expect(nav?.data).toEqual({ from: "/?lobby=[code]", to: "/" });
    const click = scrubBreadcrumb({ category: "ui.click", message: "button.btn" });
    expect(click).toEqual({ category: "ui.click", message: "button.btn" });
  });

  test("the page URL, query and referrer of an event lose the code", () => {
    const event = {
      type: undefined,
      request: {
        url: "https://manif.bazlab.si/?lobby=Ab3",
        query_string: "lobby=Ab3",
        headers: { Referer: "https://manif.bazlab.si/?lobby=Ab3", "User-Agent": "x" },
      },
    } as ErrorEvent;
    const out = scrubEvent(event);
    expect(out.request?.url).toBe("https://manif.bazlab.si/?lobby=[code]");
    expect(out.request?.query_string).toBeUndefined();
    expect(out.request?.headers).toEqual({ Referer: "https://manif.bazlab.si/?lobby=[code]", "User-Agent": "x" });
    const bare = { type: undefined, message: "boom" } as ErrorEvent;
    expect(scrubEvent(bare)).toBe(bare);
  });
});
