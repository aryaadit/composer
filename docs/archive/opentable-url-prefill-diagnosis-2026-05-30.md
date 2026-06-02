# OpenTable URL pre-fill — diagnosis + proposal — 2026-05-30

Pragmatic UX improvement: make OpenTable reservation links open with the user's date + party size pre-filled instead of the bare venue homepage. Investigation found a larger silent-failure issue alongside the pre-fill question. Diagnosis only — no code change yet.

## Part 1 — Investigation

### Three sample OpenTable venues

| Venue | `reservation_platform` | `reservation_url` |
|---|---|---|
| The Butcher's Daughter | (NULL) | `https://www.opentable.com/r/the-butchers-daughter-nolita-new-york` |
| San Marzano | (NULL) | `https://www.opentable.com/r/san-marzano-pasta-fresca-new-york` |
| Funny Bar | (NULL) | `https://www.opentable.com/r/funny-bar-new-york` |

All three returned the canonical `opentable.com/r/<slug>` form. Total OpenTable venues in the DB: **101**.

### URL shape distribution

| Shape | Count |
|---|---:|
| `opentable.com/r/<slug>` | 86 |
| `opentable.com/<slug>` (older form) | 14 |
| `restref` | 1 |

### `reservation_platform` distribution for OpenTable venues

| `reservation_platform` value | Count | Today's enrichment behavior |
|---|---:|---|
| `NULL` | **60** | Returns `walk_in` — **no link shown** (`bookingUrlBase = null`) |
| `"opentable"` | 32 | Returns `unconfirmed` with bare URL |
| `"resy"` (mislabeled) | 9 | Hits Resy path, fails (no `resy_venue_id`), falls to `unconfirmed` with bare URL |

### Two problems surfaced

1. **What the user asked about** (pre-fill the date/party in the URL) — affects the 32 + 9 = ~41 venues that today reach the `unconfirmed` branch
2. **Silent failure for 60 OpenTable venues** — they never even surface the OpenTable link because `reservation_platform IS NULL` routes them to `walk_in` in `enrichWithAvailability` (line 173) where `bookingUrlBase` is hardcoded `null`. This is the path I theorized for Clemente — for OpenTable venues it's actually real.

### URL pre-fill param shape — best guess, not verified

OpenTable's documented public URL parameters are inconsistent across surfaces (consumer site, widget, affiliate links). From training-data knowledge:

| Param shape | Likely behavior | Confidence |
|---|---|---|
| `?dateTime=2026-05-30T19:00&covers=2` | Most likely to pre-fill. `dateTime` (camelCase) + `covers` are OpenTable's longstanding internal field names. | Moderate-high |
| `?datetime=2026-05-30T19:00&partysize=2` | `partysize` (single word) appears in older URLs but `datetime` lowercase is rarer. | Low-moderate |
| `?date=2026-05-30&time=19:00&size=2` | Doesn't match OpenTable conventions. `size` uncommon, split date+time fights `dateTime`. | Low |

**Best guess: `?dateTime=...&covers=...`.** Needs manual verification before shipping.

Also worth trying if first variant fails: format details like `T19:00:00` (with seconds), `T19%3A00` (URL-encoded colon).

### Resy URL builder for reference

[src/lib/availability/booking-url.ts](../src/lib/availability/booking-url.ts) has two functions:
- `buildResyBookingUrl(slug, date, partySize)` — venue page with date + seats fallback
- `buildResySlotBookingUrl(...)` — deep-link to "Complete reservation" widget

The OpenTable equivalent would be a single helper — same idea as `buildResyBookingUrl` (no slot deep-link possible since we don't fetch OpenTable live availability).

## Part 2 — Proposal

### Helper

Add to `src/lib/availability/booking-url.ts`:

```ts
/**
 * Append OpenTable pre-fill query params to a venue's reservation_url.
 * Based on OpenTable's common URL conventions: `dateTime` (combined
 * ISO local without seconds) and `covers` (party size). NOT verified
 * against OpenTable docs — confirm one manually before relying on it.
 * Falls back to the original URL if the input is malformed.
 */
export function buildOpenTableBookingUrl(
  reservationUrl: string,
  date: string,        // "2026-05-30"
  partySize: number,
  startTime: string    // "19:00" (24h, from resolveTimeWindow)
): string {
  try {
    const url = new URL(reservationUrl);
    url.searchParams.set("dateTime", `${date}T${startTime}`);
    url.searchParams.set("covers", String(partySize));
    return url.toString();
  } catch {
    return reservationUrl;
  }
}
```

### Where to call it in enrichment

Three sites in [src/lib/itinerary/availability-enrichment.ts](../src/lib/itinerary/availability-enrichment.ts):

1. **`buildAvailability` lines ~54-63** — the "platform is not Resy" branch in the slot builder
2. **Main loop lines ~185-200** — the platform-not-resy branch in `enrichWithAvailability`
3. **Main loop lines ~211-228** — the Resy-throw catch (unreachable for OpenTable; safe to leave)

Sites 1 and 2 set `bookingUrlBase` from `venue.reservation_url`. Replace with: detect OpenTable via `detectBookingPlatform(venue.reservation_url)`, and if `id === "opentable"`, substitute `buildOpenTableBookingUrl(...)`.

Needs `startTime` plumbed through. Cleanest: compute inside `enrichWithAvailability` via `resolveTimeWindow(timeBlock)`. No signature change at the two callers (`/api/generate` and `/api/swap-stop`).

### Status branch decision — keep `unconfirmed`, don't add `opentable`

Reasoning:
- `unconfirmed` semantically means "reservations are possible, we don't have live slot data" — accurate for OpenTable.
- Adding `opentable` status requires changes to: `StopAvailability` type union, `StopAvailability.tsx` render branches, every consumer that destructures `status`. Big surface area for no user-visible improvement.
- The current `unconfirmed` UI ("Couldn't load times — check directly on OpenTable [Check availability →]") works fine; the only fix needed is making the link land on a pre-filled page.

Follow-up worth noting: the "Couldn't load times" copy is inaccurate for OpenTable (we never tried). Could be tweaked to platform-aware copy in `StopAvailability.tsx` (e.g., `"OpenTable doesn't share live availability — book directly"`). Out of scope for this change.

### Handling the 60 silent-failure venues — three options

**Option X (code only — defense-in-depth):**
In the enrichment's `platform === "none"` branch, before returning `walk_in`, check if `detectBookingPlatform(venue.reservation_url)` returns `opentable`. If yes, route to `unconfirmed` with the pre-filled URL. ~4 line addition. Covers all 60 venues on next deploy. Doesn't fix the underlying data.

**Option Y (sheet/DB backfill — clean canonical fix):**
Run a sheet edit to set `reservation_platform = "opentable"` for all 60 + reconcile the 9 mislabeled. Manual edit + `npm run import-venues -- apply`. Code change is just the URL pre-fill helper integration.

**Option X+Y (both):**
Code defense + data backfill. Code ships today, data backfill follows. Most resilient against future sheet-entry mistakes.

**Recommendation: X+Y.** Code fix is small (~4 lines), makes the system tolerant of sheet inconsistencies, and the data backfill is the proper truth-of-record fix. Option X alone is the pragmatic ship if minimal scope is needed.

### Proposed change set

- `src/lib/availability/booking-url.ts`: add `buildOpenTableBookingUrl` (new function, ~12 lines)
- `src/lib/itinerary/availability-enrichment.ts`:
  - Compute `startTime` from `timeBlock` via `resolveTimeWindow` (one line)
  - Detect OpenTable in the two `unconfirmed` URL assignments → substitute pre-filled URL (~6 lines)
  - **If Option X**: also detect OpenTable in the `walk_in` early-return → route to `unconfirmed` (~4 lines)

No client-side changes. No type changes. No status taxonomy expansion.

### Pre-implementation checklist

Before writing code:

1. **Verify `?dateTime=...&covers=2` is the right param shape.** Test by hand: open `https://www.opentable.com/r/funny-bar-new-york?dateTime=2026-05-30T19:00&covers=2` and confirm date+party prefilled. If not, try `?datetime=...&partysize=2`. Don't ship a guess.
2. **Pick X, Y, or X+Y** for the 60 silent-failure venues.
3. **`?dateTime` value formatting**: `T19:00` is the guess. May also need `T19:00:00` or `T19%3A00`. Once #1 confirms the param name, the format detail usually follows.

## Drafted commit message

```
feat(opentable): pre-fill date + party size in reservation URLs
```

If we go with X+Y, the same message covers both — the data fix is non-code so the commit only contains the code half.

## Status

Awaiting greenlight on:
- URL param shape verification (#1)
- Choice of X / Y / X+Y for silent-failure venues (#2)
