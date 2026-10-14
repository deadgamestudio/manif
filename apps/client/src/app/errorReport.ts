// What error reports (Rustrak, Sentry protocol) may carry. A lobby code is
// all it takes to join a private lobby, so it never leaves in a report: it is
// cut from every URL (invite links, matchmaking requests). Console lines (they
// name players) are not kept as breadcrumbs at all.

import type { Breadcrumb, ErrorEvent } from "@sentry/react";

const HIDDEN = "[code]";

/** A URL with its lobby code cut: `?lobby=...` and the room id in matchmaking paths. */
export function redactUrl(url: string): string {
  return url
    .replace(/([?&]lobby=)[^&#]*/gi, `$1${HIDDEN}`)
    .replace(/(\/matchmake\/(?:joinById|reconnect)\/)[^/?#]+/gi, `$1${HIDDEN}`);
}

const redactValue = (v: unknown) => (typeof v === "string" ? redactUrl(v) : v);

/** Drops console breadcrumbs and cuts lobby codes from the rest (fetch, xhr, navigation). */
export function scrubBreadcrumb(crumb: Breadcrumb): Breadcrumb | null {
  if (crumb.category === "console") return null;
  const data = crumb.data ? Object.fromEntries(Object.entries(crumb.data).map(([k, v]) => [k, redactValue(v)])) : undefined;
  return { ...crumb, ...(crumb.message !== undefined && { message: redactUrl(crumb.message) }), ...(data && { data }) };
}

/** Cuts lobby codes from the page URL and referrer a report carries. */
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  const request = event.request;
  if (!request) return event;
  const headers = request.headers
    ? Object.fromEntries(Object.entries(request.headers).map(([k, v]) => [k, redactUrl(v)]))
    : undefined;
  // The query string goes whole: the only one the page has is the invite code.
  const { query_string: _query, ...rest } = request;
  return {
    ...event,
    request: {
      ...rest,
      ...(request.url !== undefined && { url: redactUrl(request.url) }),
      ...(headers && { headers }),
    },
  };
}
