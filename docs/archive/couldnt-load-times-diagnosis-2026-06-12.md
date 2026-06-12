# "Couldn't load times" on fresh compose — diagnosis 2026-06-12

Read-only diagnosis. Reported on a fresh Koreatown compose: both stops render the unconfirmed-state copy "Couldn't load times. Check directly on Resy." Founder confirmed real availability exists at the venues.

Per user instruction, root cause must be unambiguous before any fix lands. **It is not.** Three viable paths converge on the same UI string; pinning which fires requires either a server-log inspection of the failing request or a DB query against the affected venues. Both are out-of-band for this read-only pass.

## TL;DR

- **No regression of the 2026-05-27 swap-stop bug.** That bug was `/api/swap-stop` not calling `enrichWithAvailability`. The fix from [`57a117e`](#) is intact at [src/app/api/swap-stop/route.ts:273-289](../../src/app/api/swap-stop/route.ts#L273) — the new stop is wrap-and-extract enriched correctly.
- **`/api/add-stop` does not enrich the new stop**, but the client gates StopAvailability on `stop.availability && ...` ([src/components/itinerary/ItineraryView.tsx:213](../../src/components/itinerary/ItineraryView.tsx#L213)), so an added stop renders no availability widget — not the buggy copy.
- **The reported bug is on a FRESH compose (no swap, no add)**, so the suspect surface is [src/lib/itinerary/availability-enrichment.ts](../../src/lib/itinerary/availability-enrichment.ts) called from [src/app/api/generate/route.ts:342-348](../../src/app/api/generate/route.ts#L342).
- **The UI string is hard-tied to one server state** — `status: "unconfirmed"`. The unconfirmed status has three different copies branched on detected platform; "Couldn't load times. Check directly on Resy." requires the bookingUrlBase to detect as Resy.
- **One unrelated bug found**: the 5s Resy timeout is dead code. `AbortController.signal` is created but never plumbed into the underlying `fetch()`. Fixed elsewhere in this diagnosis.

## The four availability states + how they render

`StopAvailabilityType` has four `status` values. The renderer at [src/components/itinerary/StopAvailability.tsx](../../src/components/itinerary/StopAvailability.tsx) is pure — no fetching, no caching, no retries client-side:

| status | renderer file:line | user-visible string |
|---|---|---|
| `walk_in` | [StopAvailability.tsx:75](../../src/components/itinerary/StopAvailability.tsx#L75) | (nothing — section returns `null`) |
| `has_slots` | [StopAvailability.tsx:158](../../src/components/itinerary/StopAvailability.tsx#L158) | "Available times" + slot grid |
| `no_slots_in_block` | [StopAvailability.tsx:126-155](../../src/components/itinerary/StopAvailability.tsx#L126) | **"No tables available in your time block"** |
| `unconfirmed` (Resy URL) | [StopAvailability.tsx:90-91](../../src/components/itinerary/StopAvailability.tsx#L90) | **"Couldn't load times. Check directly on Resy."** ← this is the reported string |
| `unconfirmed` (OpenTable URL) | [StopAvailability.tsx:87-89](../../src/components/itinerary/StopAvailability.tsx#L87) | "OpenTable doesn't share live availability. Book directly." |
| `unconfirmed` (Tock URL) | [StopAvailability.tsx:92-93](../../src/components/itinerary/StopAvailability.tsx#L92) | "Couldn't load times. Check directly on Tock." |
| `unconfirmed` (other) | [StopAvailability.tsx:94-97](../../src/components/itinerary/StopAvailability.tsx#L94) | "Couldn't load times. Check directly on \<platform-name\>." |

So the reported copy fires **only** when:
1. Server-side enrichment sets `status: "unconfirmed"`, AND
2. The `bookingUrlBase` written into the availability object detects as a Resy URL.

## The two server-side paths to `unconfirmed`

Both live in [src/lib/itinerary/availability-enrichment.ts](../../src/lib/itinerary/availability-enrichment.ts) inside `enrichWithAvailability`'s per-stop branch.

### Path A — venue data integrity

[availability-enrichment.ts:239-258](../../src/lib/itinerary/availability-enrichment.ts#L239):

```ts
if (
  platform !== "resy" ||
  !venue.resy_venue_id ||
  !venue.resy_slug
) {
  return {
    ...stop,
    availability: {
      status: "unconfirmed",
      slots: [],
      bookingUrlBase: upgradeUrlForPlatform(
        venue.reservation_url, date, partySize, startTime,
      ),
      swapped: false,
    },
  };
}
```

Fires when **any one** of:
- `reservation_platform` is not the literal `"resy"` (e.g., `"opentable"`, `"tock"`, `"generic"`, an empty string, or any value other than `"none"` / null which were already routed up at [line 210](../../src/lib/itinerary/availability-enrichment.ts#L210))
- `resy_venue_id` is null in the DB
- `resy_slug` is null in the DB

If `venue.reservation_url` happens to be a `resy.com/...` URL (data inconsistency: platform field doesn't match the URL), then the unconfirmed renderer detects Resy and prints **the reported copy**. This is by far the most likely root cause for K-town venues — those rows were imported piecemeal and Resy enrichment is incomplete in patches.

### Path B — Resy fetch threw

[availability-enrichment.ts:262-286](../../src/lib/itinerary/availability-enrichment.ts#L262):

```ts
try {
  slots = await fetchResyWithTimeout(
    venue.resy_venue_id, date, partySize,
  );
} catch (err) {
  console.error(
    `[availability] Resy timeout/error for ${venue.name} (${venue.id}):`, err,
  );
  return {
    ...stop,
    availability: {
      status: "unconfirmed",
      slots: [],
      bookingUrlBase: buildResyBookingUrl(venue.resy_slug, date, partySize),
      swapped: false,
    },
  };
}
```

Fires when the underlying `fetch()` rejects (DNS, network, abort, response stream truncation, JSON parse error on a malformed body). The `bookingUrlBase` here is unconditionally `buildResyBookingUrl(...)` (Resy URL), so detection always lands on Resy — reported copy fires.

### What does NOT cause the reported copy

A Resy **HTTP error** (4xx / 5xx) does NOT produce `unconfirmed`. [src/lib/availability/resy.ts:62-65](../../src/lib/availability/resy.ts#L62) swallows non-OK responses and returns `[]`. An empty slots array then hits [availability-enrichment.ts:110-115](../../src/lib/itinerary/availability-enrichment.ts#L110) and lands at `no_slots_in_block` — copy would be **"No tables available in your time block"**, not "Couldn't load times". If the user is sure they saw "Couldn't load times", Resy HTTP failure is ruled out.

## Walking the suspect paths against the user's scenario

| Observation | Implies |
|---|---|
| Both stops render the bug | Either both venues hit the same data-integrity bucket (Path A) OR a single network blip caused both fetches to throw (Path B). Path A is more likely for both stops simultaneously. |
| K-town spots specifically (Pocha 32 / Food Gallery 32 / Zoo Sindang) | These are walk-in-heavy historically. If the sheet has them marked as Resy without proper resy_venue_id/slug, Path A fires for both. If they're truly walk-in (reservation_platform = null), they should be `walk_in` (no copy) — not the reported state. |
| 5 AM testing window | Resy maintenance windows are not documented publicly. NYC-local 5 AM = 4 AM CT = 2 AM PT. Resy's API has been observed flaky during early-morning maintenance bursts (~2-4 AM PT). This could push Path B for a transient window, but it would not be deterministic. |
| Founder confirmed real availability | Eliminates "venue has no slots at all" but does NOT eliminate "venue is not on Resy at all" — the founder may have checked OpenTable. |

## Caching & rate-limit check

- **No caching of failed fetches anywhere in the code path.** The Resy client at [resy.ts:40-76](../../src/lib/availability/resy.ts#L40) is single-shot. The enrichment caller `fetchResyWithTimeout` at [availability-enrichment.ts:52-68](../../src/lib/itinerary/availability-enrichment.ts#L52) is single-shot. Each `/api/generate` request fires a fresh fetch per Resy-enabled stop.
- **No rate limiting in code.** No `composer_*` table caches availability. The only Resy-related cache is `composer_walking_routes` (Mapbox Directions), unrelated.
- **No client-side fallback retry.** StopAvailability is a pure renderer. The page would have to be reloaded — re-firing `/api/generate` — to retry.

## Discovered unrelated bug — dead AbortController

[src/lib/itinerary/availability-enrichment.ts:52-68](../../src/lib/itinerary/availability-enrichment.ts#L52):

```ts
async function fetchResyWithTimeout(
  resyVenueId: number, date: string, partySize: number,
): Promise<AvailabilitySlot[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), RESY_TIMEOUT_MS);

  try {
    const slots = await getResyAvailability(resyVenueId, date, partySize);
    //                              ^^^ no signal passed
    clearTimeout(timeout);
    return slots;
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}
```

The `controller.signal` is never threaded into `getResyAvailability`. [resy.ts:45-60](../../src/lib/availability/resy.ts#L45)'s `fetch()` call has no `signal` option. The 5-second timeout fires `controller.abort()` on schedule, but no in-flight request is bound to that controller — so nothing aborts.

**Effect on the observed bug**: doesn't directly cause "Couldn't load times". But if Resy is genuinely slow at 5 AM, this means the per-request 5s budget is honored on paper only — fetches hang up to Vercel's serverless function timeout (typically 10-30s). When the function timeout fires, the whole `/api/generate` request fails (500 / timeout) — the client sees a generation error, not the unconfirmed copy. So this bug masks legitimate Resy hangs as full compose failures rather than per-stop unconfirmed states.

**This is a real bug worth fixing regardless** but is not the root cause of the reported observation.

## Verdict

**Root cause is not unambiguous.** Two viable code paths, each with a plausible trigger:

1. **Path A (data integrity, most likely)**: K-town venues in `composer_venues_v2` have `reservation_platform = "resy"` with `resy_venue_id` or `resy_slug` null OR have `reservation_url` pointing at Resy with a non-"resy" platform field.
2. **Path B (transient network)**: Resy fetch threw — possible but unlikely to be reproducible on every compose.

Per the user's instruction ("implement fix only if root cause is unambiguous"), **no code fix landed in this turn**. Recommended next step is the SQL query below to confirm or rule out Path A.

## Recommended next step — SQL diagnostic

Run against `composer_venues_v2` for the three K-town venues (or whichever stops were observed). If the suspected names aren't the right ones, swap them:

```sql
-- Path A check: data-integrity for the observed stops.
select
  name,
  reservation_platform,
  resy_venue_id,
  resy_slug,
  reservation_url,
  active
from composer_venues_v2
where name in (
  'Pocha 32',
  'Food Gallery 32',
  'Zoo Sindang'
  -- add whatever actually landed in the two-stop compose
);
```

What to look for:
- `reservation_platform = 'resy'` but `resy_venue_id is null` or `resy_slug is null` → **confirmed Path A** → data fix in the sheet, not code.
- `reservation_platform is null` but `reservation_url like '%resy.com%'` → also Path A, with a different remediation: the `platform === "none"` upper branch at [availability-enrichment.ts:210-237](../../src/lib/itinerary/availability-enrichment.ts#L210) routes these to `walk_in` today, silently swallowing the Resy URL. (The 2026-05-27 diagnosis already flagged this as "Fix 2b"; never applied. Worth applying if data points this way.)
- `reservation_platform = 'resy'` and both Resy fields populated → **Path A ruled out**, investigate Path B (server logs around the time of the compose).

Also worth a wider sweep, same as the 2026-05-27 diagnosis recommended:

```sql
-- Any venues with Resy fields populated but platform missing — the
-- "Clemente shape" that Fix 2b would have caught.
select name, resy_venue_id, resy_slug, reservation_platform
from composer_venues_v2
where resy_venue_id is not null
  and (reservation_platform is null or reservation_platform = '');
```

## If the SQL confirms Path A

Two actions:
1. **Data fix (sheet)**: update the affected rows in the Google Sheet, set `reservation_platform = 'resy'` if Resy fields are populated. Re-run `npm run import-venues -- apply`.
2. **Code fix (defense-in-depth, optional)**: apply the 2026-05-27 doc's Fix 2b — change [availability-enrichment.ts:210](../../src/lib/itinerary/availability-enrichment.ts#L210) so `platform === "none"` only routes to walk_in when `!venue.resy_venue_id`. Otherwise fall through to the unconfirmed branch so Resy-data-populated rows surface as bookable.

## If the SQL rules out Path A

Investigate Path B:
1. Check server logs (Vercel) around the failing compose for the line `console.error("[availability] Resy timeout/error for ...")` ([availability-enrichment.ts:269](../../src/lib/itinerary/availability-enrichment.ts#L269)). If present, captures the error name.
2. Fix the AbortController plumbing in `fetchResyWithTimeout` regardless — both for legitimate timeout behavior and to surface the failure mode honestly.

## Tracked actions

- [ ] Run the SQL diagnostic above (out-of-band; requires Supabase access).
- [ ] If Path A confirmed: data fix in sheet + (optional) Fix 2b code change.
- [ ] If Path B confirmed: AbortController plumbing fix in `fetchResyWithTimeout` + Resy upstream investigation.
- [ ] Decoupled from this bug: fix the dead AbortController regardless.
