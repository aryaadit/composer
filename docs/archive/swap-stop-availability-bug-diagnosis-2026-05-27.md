# Swap-stop missing availability + Clemente walk_in diagnosis — 2026-05-27

Diagnosis of two related Resy enrichment bugs reported on a real user itinerary. Diagnosis only — fixes drafted but not applied. Awaiting greenlight.

## Bug 1 (primary) — `/api/swap-stop` never enriches the new stop

After a user swapped the closer, the returned venue (Experimental Cocktail Club) came back with no `availability` object — just `venue + plan_b + walks`. The frontend `StopAvailability` section didn't render; `StopCard` fell back to a bare "Reserve on Resy →" link. Resy actually had slots when the user clicked through.

### Confirmed via code read

**`/api/swap-stop/route.ts`**: builds `newStop` directly from `pickBestForRole`'s output with `role`, `venue`, `curation_note`, `spend_estimate`, `is_fixed`, `plan_b` (lines 133–140). **`enrichWithAvailability` is never imported, never called.** Response:

```ts
return NextResponse.json({
  stop: newStop,                  // ← no `availability` field
  walks: { before, after },
  maps_url,
  estimated_total,
});
```

**`/api/generate/route.ts:380-387`** (for contrast):
```ts
const enriched = await enrichWithAvailability(
  response, inputs.day, 2, body.timeBlock, undefined
);
```

Generate enriches the whole `ItineraryResponse`; swap-stop doesn't. The stops returned to the client from generate all carry `stop.availability`; the stops from swap-stop don't. That asymmetry is the bug.

## Bug 2 (secondary) — Clemente Bar's `walk_in` status with empty slots

User's original itinerary (pre-swap) had Clemente Bar as closer with `resy_slug "clemente-bar"`, `reservation_difficulty: 4`, `resy_venue_id: 84216`. Availability came back as `{ status: "walk_in", slots: [] }` even though Clemente is on Resy.

### Walking the enrichment paths

[src/lib/itinerary/availability-enrichment.ts:41-84](../src/lib/itinerary/availability-enrichment.ts#L41) (`buildAvailability`):

```ts
const platform = venue.reservation_platform ?? "none";

if (platform === "none") {
  return { status: "walk_in", slots: [], bookingUrlBase: null, swapped: false };
}

if (platform !== "resy" || !venue.resy_venue_id || !venue.resy_slug) {
  return { status: "unconfirmed", ... };
}

// fetch + filter → has_slots OR no_slots_in_block
```

And the error path at line 211–228: Resy fetch throws → `unconfirmed`.

**There is exactly ONE path to `walk_in`: `venue.reservation_platform` is null or the literal string `"none"`.**

| Scenario | Resulting status |
|---|---|
| `resy_venue_id` set, Resy API call fails / times out | `unconfirmed` (line 218) — not walk_in |
| `resy_venue_id` set, Resy API returns 0 slots in time block | `no_slots_in_block` (line 78) — not walk_in |
| `resy_venue_id` set, but `reservation_platform !== "resy"` (e.g., "opentable", "tock", "") | `unconfirmed` (line 56) — not walk_in |
| `resy_venue_id` set, but `reservation_platform` is null | **`walk_in`** (line 51) ← Clemente's path |

### Conclusion: data integrity issue

**`composer_venues_v2.reservation_platform` for Clemente is null in the database.** The Resy enrichment NEVER ran because the `?? "none"` fallback short-circuited before any fetch attempt. The empty `slots` array is from the walk_in default, not from a Resy response.

This is correct behavior given the data — code does what it says on the tin. It's masking a venue with Resy plumbing populated but the platform discriminator unset.

### Verification SQL (to be run before fixing)

```sql
select name, reservation_platform, resy_venue_id, resy_slug,
       reservation_url, reservation_difficulty
from composer_venues_v2
where resy_slug = 'clemente-bar' or name ilike 'clemente%';
```

Expected if diagnosis correct: `reservation_platform IS NULL`. If it returns `"resy"`, diagnosis is wrong and the Resy fetcher needs investigation.

To find all affected venues:
```sql
select name, resy_venue_id, resy_slug, reservation_platform
from composer_venues_v2
where resy_venue_id is not null
  and (reservation_platform is null or reservation_platform = '');
```

## Proposed fixes

### Fix 1 — enrich the swapped stop in `/api/swap-stop`

**Location**: [src/app/api/swap-stop/route.ts:140](../src/app/api/swap-stop/route.ts#L140), immediately after `newStop` is constructed.

**Approach: wrap-and-extract.** `enrichWithAvailability` takes an `ItineraryResponse`, not a single stop. Refactoring its signature would touch the generate route. Cheapest:

```ts
const fakeResponse: ItineraryResponse = {
  ...itinerary,
  stops: [newStop],
};
const enrichedFake = await enrichWithAvailability(
  fakeResponse,
  inputs.day,
  2,
  inputs.timeBlock,
  undefined  // candidatePool — no recursive swap-on-empty
);
const enrichedStop = enrichedFake.stops[0];
```

Return `stop: enrichedStop` instead of `stop: newStop`. ~6 lines.

**Why this approach over a single-stop helper refactor**: zero surface area added, behavior matches generate-route exactly, no risk of divergent enrichment paths.

**Performance audit**:
- Adds one Resy round-trip (~200–500ms typical, 5s timeout). Acceptable — swap already shows a spinner.
- Resy API: unbilled, no rate limit concern at launch volume.
- Non-Resy swap targets: enrichment correctly short-circuits to `walk_in` / `unconfirmed` with no fetch. Free.

**Client side**: no change. `StopCard` and `StopAvailability` already handle all four availability states.

### Fix 2 — Clemente data integrity (assuming SQL confirms null `reservation_platform`)

Two fixes — both worth doing:

**2a. Data fix (sheet + sync)**: update Clemente's row in the Google Sheet to set `reservation_platform = "resy"`, then re-run the venue importer. Use the "find all affected" SQL above to surface other broken rows.

**2b. Code fix (defense-in-depth)**: change the `walk_in` discriminator to require BOTH "no platform string set" AND "no Resy fields populated":

```ts
// before
if (platform === "none") return walk_in;

// after
if (platform === "none" && !venue.resy_venue_id) return walk_in;
```

Same change at [availability-enrichment.ts:170-183](../src/lib/itinerary/availability-enrichment.ts#L170) (the main enrichment loop's "platform === 'none'" early-return path).

The follow-on `if (platform !== "resy" || !venue.resy_venue_id || !venue.resy_slug)` branch then catches Clemente-style rows and routes them to `unconfirmed` — which surfaces the booking link instead of silently swallowing it.

## Order of operations recommended

1. Run the Clemente SQL query to confirm `reservation_platform` is null.
2. Apply Fix 1 (swap-stop enrichment wrap-and-extract). Ship.
3. Run the wider "Resy fields set, platform null" query. If rows return:
   - Backfill in the sheet + sync (Fix 2a).
   - Apply the defensive code change (Fix 2b).

## Status

Awaiting greenlight + DB-access authorization for the SQL queries.

## Commit messages (drafted in advance per CLAUDE.md rule)

When Fix 1 is applied:
```
fix(swap-stop): enrich new stop with availability so reservation widget renders
```

When Fix 2b is applied (if SQL confirms):
```
fix(availability): treat platform=null venues with resy data as unconfirmed, not walk-in
```

Fix 2a is a data change (sheet + DB sync), not a code commit.
