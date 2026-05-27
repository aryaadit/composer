# Analytics fixes verification — 2026-05-27

Verification pass confirming four earlier fixes landed in the working tree. Part of the file-by-file review series. See [analytics-review-03-analytics-server-ts-2026-05-27.md](analytics-review-03-analytics-server-ts-2026-05-27.md) for the original fix specs.

## ✅ VERIFICATION 1 — `posthog.flush()` replaces `posthog.shutdown()` — LANDED

`grep -n "posthog\.\(flush\|shutdown\)" src/lib/analytics-server.ts`:
```
67:      await posthog.flush();
```

One match for `flush()`, zero for `shutdown()`. Surrounding context (lines 56–71):

```ts
// PostHog server-side capture. flushAt:1 + await flush() ensures the
// event drains before the serverless function terminates without shutting
// down the singleton client on warm Vercel instances.
const posthog = getPostHogServer();
if (posthog) {
  try {
    posthog.capture({
      distinctId,
      event: eventName,
      properties,
    });
    await posthog.flush();
  } catch (err) {
    console.error("PostHog server capture failed:", err);
  }
}
```

Await present, comment updated, no stray `shutdown` anywhere.

## ✅ VERIFICATION 2 — `time_to_generate_ms` split into three properties — LANDED

`grep -n "time_to_compose_ms\|time_to_enrich_ms\|time_total_ms\|time_to_generate_ms" src/app/api/generate/route.ts`:
```
326:    const time_to_compose_ms = Math.round(performance.now() - composeStartMs);
387:    const time_to_enrich_ms = Math.round(performance.now() - enrichStartMs);
409:        time_total_ms: Math.round(performance.now() - generationStartMs),
410:        time_to_compose_ms,
411:        time_to_enrich_ms,
```

At least one match each for all three new properties. **Zero** matches for the old `time_to_generate_ms`. (Note: `time_to_fail_ms` still exists in the failure-path catch block but is unrelated.)

**Compose bracket** (line 275) — set just before `composeItinerary` and the related seed/walk/buffer code:
```ts
const composeStartMs = performance.now();

// Seed jitter from request hash for deterministic itineraries.
const seed = computeRequestSeed(body);
```

Closes at line 326, right after `buildGoogleMapsUrl`:
```ts
const maps_url = buildGoogleMapsUrl(stops.map((s) => s.venue));
// ...
const time_to_compose_ms = Math.round(performance.now() - composeStartMs);
const enrichStartMs = performance.now();
```

Scope = `composeItinerary` → walk build → `applyEndTimeBuffer` → `buildGoogleMapsUrl`. ✓

**Enrich bracket** (line 327) — set immediately after compose ends, through `enrichWithAvailability`:
```ts
const time_to_enrich_ms = Math.round(performance.now() - enrichStartMs);
```

Scope = Gemini copy + Mapbox URLs + response build + Resy availability. ✓

**trackServer call** (lines 409–411):
```ts
time_total_ms: Math.round(performance.now() - generationStartMs),
time_to_compose_ms,
time_to_enrich_ms,
```

All three properties passed. ✓

## ✅ VERIFICATION 3 — `??` replaces `||` for distinctId resolution — LANDED

`grep -n "context\.userId" src/lib/analytics-server.ts`:
```
49:  const distinctId = context.userId ?? context.distinctId;
77:      user_id: context.userId ?? null,
```

Line 49 uses `??` (nullish coalescing). No `||` for distinctId resolution anywhere. Surrounding 3 lines:

```ts
): Promise<void> {
  const distinctId = context.userId ?? context.distinctId;

  if (!distinctId) {
```

## ✅ VERIFICATION 4 — distinct_id documentation comment — LANDED

Comment block at lines 29–43, immediately above `export async function trackServer(`:

```ts
/**
 * Identity resolution:
 *   - When userId is present, distinctId = userId. This matches PostHog's
 *     client-side identify() behavior: after identify, get_distinct_id()
 *     returns the user id, not the original device id.
 *   - For anonymous events (no userId), distinctId = the client-passed
 *     device id.
 *   - The original device id from BEFORE identify is NOT preserved at the
 *     Supabase mirror once a user has signed in. PostHog handles anon→identified
 *     merging via $identify events client-side; the Supabase mirror tracks
 *     the merged identity.
 *   - If we ever need to preserve the original device id post-signin, add an
 *     anonymous_id column to analytics_events and forward posthog.get_property('$device_id')
 *     separately from the headers.
 */
```

## Summary

| # | Fix | Status |
|---|---|---|
| 1 | `posthog.flush()` replaces `posthog.shutdown()` | ✅ LANDED |
| 2 | `time_to_generate_ms` split into `time_total_ms` / `time_to_compose_ms` / `time_to_enrich_ms` | ✅ LANDED |
| 3 | `??` replaces `||` for distinctId resolution | ✅ LANDED |
| 4 | Identity-resolution doc comment above `trackServer` | ✅ LANDED |

All four fixes present and correctly applied. No follow-up needed.
