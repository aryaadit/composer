# Code review — `src/lib/analytics.ts` (file 2 of 21, 2026-05-27)

Walkthrough of the client-side analytics wrapper. Part of the file-by-file review series of the analytics-instrumentation commit. See [analytics-instrumentation-2026-05-26.md](analytics-instrumentation-2026-05-26.md) for the full change inventory.

## Full file contents

103 lines. See [src/lib/analytics.ts](../src/lib/analytics.ts).

```ts
"use client";

// Client-side analytics wrapper. ALL client event captures go through
// this — never call `posthog.capture` directly. Two reasons:
//   1. PostHog and Supabase analytics_events stay in lockstep.
//   2. The trust boundary (which client may insert what) is enforced
//      by /api/analytics/track + RLS, not the browser.
//
// Failures are swallowed (fire-and-forget). Analytics must never break
// the app. PostHog client capture is best-effort; the Supabase mirror
// is best-effort. If one succeeds and the other fails, that's fine.

import posthog from "posthog-js";

type EventProps = Record<string, unknown>;

interface PosthogWithDistinct {
  get_distinct_id?: () => string | undefined;
  get_session_id?: () => string | undefined;
}

export function track(eventName: string, properties: EventProps = {}) {
  if (typeof window === "undefined") {
    console.warn(`track() called server-side for ${eventName} — use trackServer instead`);
    return;
  }

  // 1. PostHog
  try {
    posthog.capture(eventName, properties);
  } catch (err) {
    console.error("PostHog capture failed:", err);
  }

  // 2. Supabase mirror (via internal API route to use the service role server-side)
  const ph = posthog as PosthogWithDistinct;
  void fetch("/api/analytics/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      event_name: eventName,
      properties,
      distinct_id: ph.get_distinct_id?.() ?? null,
      session_id: ph.get_session_id?.() ?? null,
    }),
  }).catch(() => {
    // Swallow — PostHog still has the data
  });
}

export function getAnalyticsHeaders(): Record<string, string> {
  if (typeof window === "undefined") return {};
  const ph = posthog as PosthogWithDistinct;
  const headers: Record<string, string> = {};
  const distinctId = ph.get_distinct_id?.();
  const sessionId = ph.get_session_id?.();
  if (distinctId) headers["x-ph-distinct-id"] = distinctId;
  if (sessionId) headers["x-ph-session-id"] = sessionId;
  return headers;
}

export function setPersonProperties(props: EventProps) {
  try {
    posthog.setPersonProperties(props);
  } catch (err) {
    console.error("PostHog setPersonProperties failed:", err);
  }
}

export function setPersonPropertiesOnce(props: EventProps) {
  try {
    posthog.setPersonProperties(undefined, props);
  } catch (err) {
    console.error("PostHog setPersonPropertiesOnce failed:", err);
  }
}

export function incrementPersonProperty(name: string, amount = 1) {
  try {
    const people = (posthog as { people?: { increment?: (p: Record<string, number>) => void } }).people;
    people?.increment?.({ [name]: amount });
  } catch (err) {
    console.error("PostHog increment failed:", err);
  }
}
```

## 1. Public API surface

| Export | Signature | Purpose |
|---|---|---|
| `track(eventName, properties?)` | `(string, Record<string, unknown>) => void` | Fire one event. Sends to PostHog AND `/api/analytics/track`. Fire-and-forget. |
| `getAnalyticsHeaders()` | `() => Record<string, string>` | Returns `{ "x-ph-distinct-id": ..., "x-ph-session-id": ... }` for spreading into fetch options on requests to API routes that capture events server-side. |
| `setPersonProperties(props)` | `(Record<string, unknown>) => void` | PostHog `$set` — overwrites latest values on the identified person. |
| `setPersonPropertiesOnce(props)` | `(Record<string, unknown>) => void` | PostHog `$set_once` — only writes if the property isn't set yet. |
| `incrementPersonProperty(name, amount=1)` | `(string, number) => void` | PostHog `$increment` for counters like `total_itineraries_generated`. |

No default export. No types exported.

## 2. Internal helpers

- `EventProps` (alias): `Record<string, unknown>`. The property-bag type used throughout.
- `PosthogWithDistinct` (interface): structural cast type for the `get_distinct_id` / `get_session_id` methods that exist at runtime but aren't in the published types. Cast is local — not exported.

No real "private functions" — every function in this file is exported.

## 3. `track()` line-by-line

### SSR guard (lines 23–26)
```ts
if (typeof window === "undefined") {
  console.warn(`track() called server-side for ${eventName} — use trackServer instead`);
  return;
}
```
Canonical SSR detection. Defensive log — the file is `"use client"`-marked so it shouldn't ever load in a Server Component, but a developer importing into shared code discovers misuse here, not via a cryptic ReferenceError on `posthog`.

### PostHog capture (lines 28–33)
```ts
try {
  posthog.capture(eventName, properties);
} catch (err) {
  console.error("PostHog capture failed:", err);
}
```
`posthog.capture` is synchronous (enqueues to the SDK's internal queue, flushed async). Try/catch swallows. If posthog isn't initialized (env var missing), `posthog` is still the SDK object — pre-init it's a no-op that buffers events. Rarely throws.

### Supabase mirror (lines 35–48)
```ts
const ph = posthog as PosthogWithDistinct;
void fetch("/api/analytics/track", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    event_name: eventName,
    properties,
    distinct_id: ph.get_distinct_id?.() ?? null,
    session_id: ph.get_session_id?.() ?? null,
  }),
}).catch(() => {
  // Swallow — PostHog still has the data
});
```
- `void fetch(...)` explicitly discards the Promise. No `await`. Fire-and-forget.
- `.catch(() => {})` swallows network errors silently.
- `distinct_id`/`session_id` use optional chaining: `ph.get_distinct_id?.()`. If undefined → `?? null` → `null`. The API route requires `distinct_id` truthy, so a null one gets rejected with 400 — silently, because we never inspect the response.

## 4. Person-property helpers

### `setPersonProperties` — direct call
```ts
posthog.setPersonProperties(props);
```
SDK typed signature accepts `Record<string, any>`. Wrapped in try/catch.

### `setPersonPropertiesOnce` — second-arg trick
```ts
posthog.setPersonProperties(undefined, props);  // first arg=set, second=set_once
```
posthog-js's `setPersonProperties` takes `(set?, setOnce?)`. Passing `undefined` for the first arg means "don't touch existing values" and the second-slot `props` becomes the `$set_once` payload. Unusual API — noted inline.

### `incrementPersonProperty` — defensive structural cast
```ts
const people = (posthog as { people?: { increment?: (p: Record<string, number>) => void } }).people;
people?.increment?.({ [name]: amount });
```
Most defensive function in the file. `posthog.people` is documented but has shifted across posthog-js minor versions — sometimes plain object, sometimes lazy proxy, sometimes typed as `optional`. Inline cast keeps TS happy without pulling the full `PostHog` type. Optional chaining on both `people` and `increment` so if either is missing at runtime it no-ops.

## 5. `getAnalyticsHeaders`

Returns an object you spread into fetch headers:
```ts
fetch("/api/generate", {
  headers: { "Content-Type": "application/json", ...getAnalyticsHeaders() },
  ...
})
```
- Sets `x-ph-distinct-id` only if a distinct_id is available.
- Sets `x-ph-session-id` only if a session_id is available.
- Returns `{}` server-side (SSR safe).

Consumed in: `src/components/questionnaire/QuestionnaireShell.tsx`, `src/app/itinerary/page.tsx` (regenerate + add-stop), `src/hooks/useSwapStop.ts`. The corresponding API routes (`/api/generate`, `/api/swap-stop`) read these headers and pass them to `trackServer`.

## 6. Type safety

- `EventProps = Record<string, unknown>` is the loosest reasonable shape. Callers can pass anything JSON-serializable.
- No per-event property schema. Could be tightened with a discriminated union (one event-property shape per event name) but the cost (every track call site needs a typed shape) outweighs the benefit (catching typos in event/property names) for a launch-stage product. PostHog dedupes/normalizes property names in their UI anyway.
- No exported types.
- `posthog` import is the default export of `posthog-js`. Its types declare most methods but not all (notably the older `people` accessor).

## Specific concerns answered

### a. If `posthog.capture()` throws synchronously, does the error propagate?

**No.** Wrapped in try/catch (lines 29–33), `console.error`'d. Caller never sees it.

Real-world behavior: if PostHog wasn't init'd (env var missing in dev), `posthog.capture` is a no-op stub that buffers calls — doesn't throw. The catch is purely defensive.

### b. If the Supabase mirror fetch returns 500, does the user see anything?

**Nothing visible.** No latency impact, no error banner, no toast. The fetch is fire-and-forget — the surrounding caller already returned by the time the network request completes.

What the user CAN see:
- A failed POST to `/api/analytics/track` shows in DevTools Network tab (red, 500). Users don't typically have DevTools open.
- The `.catch(() => {})` swallows **network errors** silently. A **non-network** 5xx (i.e., the fetch resolves with a non-2xx response) does NOT trigger `.catch` — fetch only rejects on network failure, not on HTTP error status. So a 500 response is silently ignored, no console entry. Minor visibility gap — see issue 2 below.

No latency impact on the user-visible action.

### c. 50 rapid events — rate-limit / debounce concerns?

**No debounce or batching** in this wrapper. Each `track()` call fires one PostHog enqueue + one `/api/analytics/track` POST.

- **PostHog side**: posthog-js batches internally before sending to PostHog's ingestion. 50 captures → maybe 1–2 actual network requests. No issue.
- **Supabase mirror side**: each `track()` makes its own POST. So 50 events → 50 POSTs to `/api/analytics/track` → 50 inserts into `analytics_events`. No rate limit configured anywhere — neither in the API route nor in Vercel. Supabase Postgres can absorb 50 inserts no problem. But this scales linearly — if a feature ever fires events in a tight loop (e.g., on scroll), this becomes a real cost.
- **Risk surface**: a buggy call site could fire `track()` in a render loop and run up Vercel function invocations + DB inserts. The wrapper has no guardrail.

Realistic worst case in current code: `compose_step_completed` × 5 steps; `time_slot_selected` on hot tap — well under practical rate limits.

### d. Could this block a user interaction or page render?

**No.** Every external call is either:
- Synchronous and wrapped in try/catch (PostHog SDK calls — they don't await network)
- Or `void`-ed (the Supabase fetch — discarded promise)

No `await` anywhere. No path where `track()` blocks its caller.

Indirect risk: if `posthog.capture` re-entered the React reconciler (e.g., called inside `setState`), the try/catch handles it.

### e. SSR safety

**Two layers of defense, both intact:**
1. **`"use client"` directive** (line 1). Next.js's bundler refuses to import this into a Server Component or RSC build — build error before runtime.
2. **`typeof window === "undefined"` runtime guard** in `track()` and `getAnalyticsHeaders()`. Even if loaded server-side (Next.js pre-renders `"use client"` for hydration), the runtime check bails before touching `posthog`.

**Asymmetry**: `setPersonProperties` / `setPersonPropertiesOnce` / `incrementPersonProperty` do NOT have the `typeof window` guard. They rely on:
- The `"use client"` directive preventing server-side use, AND
- The try/catch swallowing any error if `posthog` does something weird server-side.

In practice they're never called server-side — every call site is in a client component. But the asymmetry with `track()` is worth flagging.

## Issues flagged for decision

1. **`distinct_id: null` POSTs get silently rejected.** If `track()` is called before posthog has issued a distinct_id (very early init), the body sends `distinct_id: null`, the API route returns 400, the `.catch` doesn't fire (4xx is not a fetch rejection). Event lost to Supabase, PostHog still has it. Options: log the 400, or skip the fetch entirely when distinctId is null.

2. **HTTP error responses (4xx / 5xx) aren't logged.** `fetch().catch()` only catches network failures. A 500 from `/api/analytics/track` is silently absorbed. Could add `.then(res => !res.ok && console.error(...))` before the `.catch`.

3. **No batching.** If event volume grows (scroll-tracking later), every event = one Supabase POST. Not a problem today; would become one if instrumentation gets denser.

4. **`setPersonProperties` etc. lack SSR guards** while `track()` has one. Minor asymmetry. Currently fine because every call site is in a client component.

5. **`EventProps` is `Record<string, unknown>`.** No per-event property validation. Typos in property names reach production silently. Could tighten with a discriminated union but it's heavy bookkeeping.

6. **`incrementPersonProperty` uses a structural cast** because the SDK's `people` accessor isn't consistently typed across posthog-js versions. If the SDK ever renames or removes `people.increment`, this becomes a silent no-op. Pinned to `^1.376.2` in package.json so stable for now.
