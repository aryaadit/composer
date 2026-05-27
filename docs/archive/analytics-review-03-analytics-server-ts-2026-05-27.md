# Code review — `src/lib/analytics-server.ts` (file 3 of 21, 2026-05-27)

Walkthrough of the server-side analytics wrapper. Part of the file-by-file review series of the analytics-instrumentation commit. See [analytics-instrumentation-2026-05-26.md](analytics-instrumentation-2026-05-26.md) for the full change inventory.

## Full file contents

71 lines. See [src/lib/analytics-server.ts](../src/lib/analytics-server.ts).

```ts
// Server-side analytics wrapper. ALL server-side event captures (API
// routes) go through this — never call posthog.capture from posthog-node
// directly. Mirrors the client wrapper:
//   1. PostHog (posthog-node) capture
//   2. Supabase analytics_events insert via the existing service-role
//      client (getServiceSupabase)
//
// CRITICAL: skip when no stable identifier. Don't fall back to a literal
// "anonymous" string — that collapses every unauthenticated request into
// a single PostHog person and a single Supabase distinct_id, which dilutes
// every funnel and breaks per-user attribution.

import { getPostHogServer } from "./posthog-server";
import { getServiceSupabase } from "./supabase";

type EventProps = Record<string, unknown>;

export interface TrackServerContext {
  /** Authenticated Supabase user id. Preferred. Used to populate
   *  analytics_events.user_id and as the PostHog distinctId. */
  userId?: string | null;
  /** Anonymous PostHog distinct_id passed through from the client.
   *  Used as the distinctId only when userId is absent. */
  distinctId?: string | null;
  /** PostHog session_id from the client, if available. */
  sessionId?: string | null;
}

export async function trackServer(
  eventName: string,
  context: TrackServerContext,
  properties: EventProps = {}
): Promise<void> {
  const distinctId = context.userId || context.distinctId;

  if (!distinctId) {
    console.warn(`trackServer skipped — no distinctId for ${eventName}`);
    return;
  }

  // 1. PostHog (await shutdown so the event drains before the
  // serverless function terminates; flushAt:1 + shutdown() is the
  // documented serverless pattern).
  const posthog = getPostHogServer();
  if (posthog) {
    try {
      posthog.capture({
        distinctId,
        event: eventName,
        properties,
      });
      await posthog.shutdown();
    } catch (err) {
      console.error("PostHog server capture failed:", err);
    }
  }

  // 2. Supabase mirror via service-role client (bypasses RLS).
  try {
    const supabase = getServiceSupabase();
    await supabase.from("analytics_events").insert({
      user_id: context.userId ?? null,
      distinct_id: distinctId,
      session_id: context.sessionId ?? null,
      event_name: eventName,
      properties,
    });
  } catch (err) {
    console.error("Supabase analytics mirror failed:", err);
  }
}
```

### Supporting files

**`src/lib/posthog-server.ts`** (22 lines, module-scoped singleton):

```ts
import { PostHog } from "posthog-node";

let posthogClient: PostHog | null = null;

export function getPostHogServer(): PostHog | null {
  const key = process.env.POSTHOG_KEY;
  if (!key) return null;
  if (!posthogClient) {
    posthogClient = new PostHog(key, {
      host: process.env.POSTHOG_HOST ?? "https://us.i.posthog.com",
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return posthogClient;
}
```

**`src/lib/supabase.ts`** (relevant portion — pre-existing, not new):

```ts
let _serviceSupabase: SupabaseClient | null = null;

/** Service-role client — bypasses RLS. Use only in admin/server contexts. */
export function getServiceSupabase(): SupabaseClient {
  if (!_serviceSupabase) {
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    if (!supabaseUrl || !serviceKey) {
      throw new Error("Service role key not configured. Set SUPABASE_SERVICE_ROLE_KEY in .env.local");
    }
    _serviceSupabase = createClient(supabaseUrl, serviceKey);
  }
  return _serviceSupabase;
}
```

I did NOT create a new `src/lib/supabase/service-role.ts`. The spec asked me to "create if doesn't exist". It does exist — `getServiceSupabase()` in `src/lib/supabase.ts`. I reused it.

## 1. Public API surface

| Export | Signature | Purpose |
|---|---|---|
| `TrackServerContext` (interface) | `{ userId?, distinctId?, sessionId? }` | Shape of the identity bundle to pass per-call. |
| `trackServer(eventName, context, properties?)` | `(string, TrackServerContext, EventProps) => Promise<void>` | Fire one server event. PostHog (posthog-node) + Supabase. Returns Promise so caller can `await` (we use `void` everywhere — see file 9). |

No default export.

## 2. `trackServer()` line-by-line

### The "no distinctId = skip" rule (lines 34–39)
```ts
const distinctId = context.userId || context.distinctId;

if (!distinctId) {
  console.warn(`trackServer skipped — no distinctId for ${eventName}`);
  return;
}
```
`||` (not `??`) means empty string also skips. Falsy short-circuit. Logs a warning so misses are visible in Vercel function logs. **No `"anonymous"` fallback** — per spec. If neither id is present, the event is dropped silently (not even sent to PostHog).

### PostHog server capture (lines 41–56)
```ts
const posthog = getPostHogServer();
if (posthog) {
  try {
    posthog.capture({
      distinctId,
      event: eventName,
      properties,
    });
    await posthog.shutdown();
  } catch (err) {
    console.error("PostHog server capture failed:", err);
  }
}
```
- `getPostHogServer()` returns the singleton or `null` if `POSTHOG_KEY` isn't set. Graceful degradation — capture is skipped, Supabase mirror still happens.
- `capture()` is synchronous (enqueues). `await shutdown()` waits for the network flush.
- Whole block in try/catch. Errors logged and swallowed; Supabase mirror still runs after.

### Supabase mirror (lines 58–70)
```ts
try {
  const supabase = getServiceSupabase();
  await supabase.from("analytics_events").insert({
    user_id: context.userId ?? null,
    distinct_id: distinctId,
    session_id: context.sessionId ?? null,
    event_name: eventName,
    properties,
  });
} catch (err) {
  console.error("Supabase analytics mirror failed:", err);
}
```
- Service-role client (bypasses RLS).
- `user_id` is the **raw** `context.userId` — null when unauthenticated. Distinct from `distinct_id`.
- `properties` passed straight through. Supabase serializes to JSONB.
- `.insert` returns a result but it's not chained `.select()` — row not read back.

## 3. Service-role client provenance

Already existed at `src/lib/supabase.ts:20`. Singleton at module scope (`let _serviceSupabase: SupabaseClient | null`). Created lazily on first call. **Throws** if `SUPABASE_SERVICE_ROLE_KEY` env var is missing OR `NEXT_PUBLIC_SUPABASE_URL` is missing — but that throw is INSIDE `trackServer`'s try/catch so it never propagates.

## 4. `SUPABASE_SERVICE_ROLE_KEY` lifecycle

- Read at `src/lib/supabase.ts:22` inside `getServiceSupabase()`. Not at module load.
- Required for the Supabase mirror to work. If missing: `getServiceSupabase()` throws → caught at line 68 → mirror skipped → only PostHog gets the event.
- Already present in `.env.local` (every existing admin route uses it).
- Server-only (no `NEXT_PUBLIC_` prefix) — Next.js inlines `undefined` for `process.env.SUPABASE_SERVICE_ROLE_KEY` in client bundles, so even if a client component accidentally imported `getServiceSupabase`, the key wouldn't leak; the function would just throw.

## Specific concerns answered

### a. Vercel serverless flush — does `shutdown()` guarantee delivery?

**Least-confident part of the implementation.**

Current pattern:
```ts
posthog.capture({ distinctId, event, properties });
await posthog.shutdown();
```

Intent: `flushAt: 1` means every capture triggers a flush. `await shutdown()` awaits any pending flush before returning.

**The risk**: posthog-node v5's `shutdown()` is documented as the cleanup hook, not a per-request flush primitive. After `shutdown()`:
- Internal flush timer cleared.
- `pendingPromises` pool awaited.
- No documented "restart" path.

**On a warm Vercel instance (singleton reused)**:
- Request 1: `capture` → `flushAt: 1` enqueues flush → `shutdown` awaits it → client's internal state is "shut down".
- Request 2: reuses singleton. `capture` may add to queue OR throw OR no-op (undefined contract). `shutdown` awaits whatever's pending.

In practice posthog-node v5 keeps working after shutdown on warm instances because the flush in `capture` is independent and `flushAt: 1` re-triggers — but this isn't a guaranteed contract.

**Safer pattern**:
```ts
posthog.capture({ ... });
await posthog.flush();   // not shutdown
```
`flush()` is the documented "drain pending now and keep going" primitive. `shutdown()` is for `process.on('SIGTERM')` style cleanup.

I followed the spec as written (and the comment in `posthog-server.ts` says shutdown is the documented serverless pattern), but flagging this as the highest-risk piece of this file.

### b. `time_to_generate_ms` — where are the brackets?

[src/app/api/generate/route.ts:146](../src/app/api/generate/route.ts#L146): `const generationStartMs = performance.now();` is set **before** the `try` block — **before** `request.json()` parsing, auth lookup, weather fetch, venue fetch, composition, AI copy, AND Resy enrichment.

End at [line 395](../src/app/api/generate/route.ts#L395): `time_to_generate_ms: Math.round(performance.now() - generationStartMs)`.

**This conflates everything**: request-body parse, parallel Supabase auth read + OpenWeatherMap + venue query, scoring + composition, Gemini copy generation, Mapbox URL generation, and live Resy availability calls. The name `time_to_generate` suggests algorithm-only timing; in reality it's "time to respond to /api/generate", dominated by external API calls (Gemini, Resy).

To measure the actual algorithm: bracket only around `composeItinerary(...)` through `applyEndTimeBuffer(...)` (lines ~265–301). Or split into multiple properties: `time_to_compose_ms` (algorithm), `time_to_enrich_ms` (Resy + Gemini), `time_total_ms` (current value).

Flagging for file 9's discussion.

### c. `context` parameter contract

```ts
const distinctId = context.userId || context.distinctId;
```

- **Both present** → `distinctId` is `userId`. `context.distinctId` is **ignored** for the PostHog `distinctId` field.
- **Only `userId`** → that's the distinctId.
- **Only `distinctId`** → device id is the distinctId.
- **Neither** → skip event entirely.

For the Supabase row:
- `user_id` is always `context.userId` (whether or not distinctId came from it).
- `distinct_id` is the resolved value (userId if both present, distinctId otherwise).
- `session_id` is always `context.sessionId`.

If both are present, the resolution is correct but the original anonymous `distinctId` from the client is **lost** at the server. See concern (g).

### d. Race condition on the singleton

The PostHog client singleton (`let posthogClient: PostHog | null` at module scope in `posthog-server.ts`) is **per Vercel function instance**. Concurrent invocations on the same warm instance share the client. Cold-started instances each have their own.

- **`capture()` is thread-safe** by design in posthog-node — internal queue is mutex-guarded.
- **`shutdown()` is NOT designed to be called concurrently** with itself or with `capture` on a shared instance. In practice v5 handles concurrent calls without crashing, but the documented contract is "call once at process exit." See concern (a).
- **No data corruption** — concurrent captures don't cross-contaminate. Risk is purely about events being silently dropped after a `shutdown` cycle.

### e. Could `trackServer` throw and break the API route?

Invariants:
- Both side-effect blocks (PostHog, Supabase) are inside try/catch.
- The `if (!distinctId) return` short-circuit happens before any side effects.
- No `throw` statements anywhere in the file.

**Possible leak paths**:
- `console.error` itself throwing (theoretical; doesn't happen in practice).
- `getPostHogServer()` is called outside a try at line 44 — but just returns `null` if no key, no throw. ✓
- `getServiceSupabase()` IS inside its try at line 60. ✓

**Caller pattern is `void trackServer(...)`** which discards the Promise. If the wrapper rejected (which it shouldn't), the unhandled rejection would surface in Vercel logs as a warning but **wouldn't** break the response (already sent). Node's `unhandledRejection` doesn't crash the process in Vercel's runtime.

**Verdict**: safe. The actual API route's response is never blocked by analytics.

### f. Service-role key isolation

- `getServiceSupabase()` is called **inside** `trackServer` (line 60), not at module top-level. The key isn't read until first call.
- The supabase singleton is at module scope (`_serviceSupabase`) so the second request reuses the existing client without re-reading env.
- **`getServiceSupabase` lives in `src/lib/supabase.ts`** — the same module as the anon `getSupabase`. A client component importing `getSupabase` will tree-shake `getServiceSupabase` OUT if it doesn't reference it. Even if it didn't, `process.env.SUPABASE_SERVICE_ROLE_KEY` is **not** `NEXT_PUBLIC_`-prefixed, so it's replaced with `undefined` in the client bundle at build time. No key leak.
- `analytics-server.ts` itself is **never** imported by a client component (only by API routes — verified). It has no `"use client"`. If anyone added a client import, Next.js wouldn't bundle the service-role function meaningfully (key undefined → throw on use) but the import boundary isn't separately enforced.

**Verdict**: keys safe by env-prefix convention, but no hard architectural wall preventing a misuse import.

### g. Distinct_id vs user_id — anonymous-then-identified preservation

**Current behavior** (per the `userId || distinctId` resolution):

```
Anonymous user visits site → PostHog assigns device_abc123 → distinct_id = device_abc123
User signs in → PostHog calls identify(user.id) → PostHog's get_distinct_id() now returns user.id
Server captures event → context = { userId: 'user-uuid', distinctId: 'user-uuid' } (both post-identify)
analytics_events.distinct_id = 'user-uuid'
analytics_events.user_id = 'user-uuid'
```

**The original device_abc123 is gone** by the time the server captures, because the client's `get_distinct_id()` has been swapped by `identify()`.

This matches PostHog's behavior — they handle merging at the `$identify` event on the client side. But it does NOT match the spec wording: "distinct_id should remain the device identifier even after user_id is known."

To preserve the original anonymous device id, we'd need:
1. A new `anonymous_id` column on `analytics_events`, AND
2. The client to read `$device_id` (PostHog cookie) separately from `distinct_id` and forward both as headers, AND
3. The server wrapper to insert `anonymous_id: context.anonymousId` alongside `distinct_id: distinctId`.

PostHog provides `posthog.get_property('$device_id')` for this. Currently not used.

**Flagging this as a real spec divergence.** Current implementation gives PostHog-consistent distinct_ids (merge-aware) but loses the pre-identify device id at the Supabase mirror.

## Issues flagged for decision

1. **`shutdown()` vs `flush()`** — `await posthog.flush()` is the safer per-request primitive; `shutdown()` is for cleanup. Current code may work on warm Vercel instances by accident. Highest-risk concern in this file. (Concern a + d.)

2. **`time_to_generate_ms` measures everything, not just generation** — currently includes Resy + Gemini + auth + venue queries. Either rename or move brackets. (Concern b; properly belongs to file 9.)

3. **`||` vs `??` for distinctId resolution** — `userId || distinctId` treats an empty string `userId` as falsy and falls through. In practice userId is either a UUID or undefined. Not a bug today, but `??` would be more explicit about "use distinctId only when userId is null/undefined".

4. **Distinct_id mutates mid-timeline for anon→identified users** — PostHog-consistent but spec-divergent. Resolution: add `anonymous_id` column + forward `$device_id`, OR explicitly document that distinct_id intentionally tracks the merged PostHog identity. (Concern g.)

5. **No assertion that `eventName` is a known event** — `trackServer("typo_event", ...)` happily writes to both PostHog and Supabase. The new `EVENTS` constant in `analytics.ts` (from file 2's fix 4) isn't shared with the server wrapper. Could import / re-export from a neutral location.

6. **Soft coupling to `src/lib/supabase.ts`'s `getServiceSupabase`** — if someone deletes or renames it, this breaks. The dependency isn't doc'd at the import site.
