# Reservation link redundancy + Resy URL bug diagnosis — 2026-05-30

Three related issues in reservation link rendering. Diagnosis only — no code change yet. Awaiting greenlight.

## Issue 1 — Redundant CTAs in unconfirmed / no_slots_in_block states

On a Resy venue in `unconfirmed` state and an OpenTable venue in `unconfirmed` state, the user sees TWO link CTAs:
- "Reserve on <Platform> →" — from StopCard, uses bare `venue.reservation_url` (or appended Resy params)
- "Check availability →" — from StopAvailability, uses `availability.bookingUrlBase` (the enriched URL)

For OpenTable specifically: the two URLs point to different effective dates because StopCard's bare-URL path doesn't pre-fill, while StopAvailability's enriched URL does.

### StopCard's "Reserve on Platform →" link

[src/components/ui/StopCard.tsx](../src/components/ui/StopCard.tsx) lines 188–224:

```tsx
{showActionsRow && (
  <div className="flex items-center justify-between gap-4 font-sans">
    <div className="text-sm">
      {showInlineReserve && reserveHref && (
        <a
          href={reserveHref}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => track("reservation_clicked", { ..., from_surface: "stop_card" })}
          className="..."
        >
          {bookingPlatform!.label} →
        </a>
      )}
      {!showInlineReserve && showWalkInLabel && (
        <span className="text-muted">Walk-in only</span>
      )}
    </div>
    {showInlineSwap && <button onClick={onSwap}>Swap</button>}
  </div>
)}
```

`reserveHref` construction (lines 99–112):

```ts
const reserveHref = (() => {
  if (!isValidReservationUrl(v.reservation_url)) return null;
  if (bookingPlatform?.id === "resy" && date) {
    if (v.resy_slug) {
      return buildResyBookingUrl(v.resy_slug, date, partySize);
    }
    const url = new URL(v.reservation_url);
    url.searchParams.set("date", date);
    url.searchParams.set("seats", String(partySize));
    return url.toString();
  }
  return v.reservation_url;  // ← OpenTable + other platforms get BARE URL, no pre-fill
})();
```

**Source: `v.reservation_url`.** For Resy: appends date+seats. For OpenTable/Tock/other: returns bare. Gated visibility: `showInlineReserve = !isPast && !hasSlots && !!bookingPlatform && isValidReservationUrl(v.reservation_url)`. Only `has_slots` suppresses it.

### StopAvailability's "Check availability →" link (unconfirmed branch)

[src/components/itinerary/StopAvailability.tsx](../src/components/itinerary/StopAvailability.tsx) lines 68–105:

```tsx
if (status === "unconfirmed") {
  const detected = bookingUrlBase ? detectBookingPlatform(bookingUrlBase) : null;
  const detectedId = detected?.id;
  // ... copy assembly ...
  return (
    <div className="mt-3 space-y-2">
      <p className="font-sans text-xs text-muted italic">{copy}</p>
      {bookingUrlBase && (
        <a
          href={bookingUrlBase}        // ← availability.bookingUrlBase, NOT venue.reservation_url
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => track("reservation_clicked", { ..., from_surface: "availability_unconfirmed" })}
          className="..."
        >
          Check availability →
        </a>
      )}
    </div>
  );
}
```

**Source: `availability.bookingUrlBase`.** The enriched URL from `availability-enrichment.ts` — for Resy: `buildResyBookingUrl(slug, date, party)` (date-aware, but with the `cities/ny/` slug bug). For OpenTable: `buildOpenTableBookingUrl(url, date, party, startTime)` (date+covers prefilled).

### Two URLs confirmed different per platform

| Platform | StopCard `reserveHref` | StopAvailability `bookingUrlBase` |
|---|---|---|
| Resy (with `resy_slug`) | `cities/ny/venues/<slug>?date=...&seats=...` (date-aware, wrong slug) | `cities/ny/venues/<slug>?date=...&seats=...` — same URL, same bug |
| Resy (no `resy_slug`, edge) | bare URL + `?date=...&seats=...` appended | typically `cities/ny/...` from `buildResyBookingUrl` |
| **OpenTable** | **bare URL, no params** | `?dateTime=...&covers=...` (correctly prefilled) |
| Other / generic | bare URL | bare URL |

The user-visible pain is sharpest for **OpenTable**: clicking StopCard's link lands on a page defaulting to today; clicking StopAvailability's link lands on the right date.

### Full inventory of reservation CTAs

```
1. src/components/ui/StopCard.tsx                  → footer "Reserve on <Platform> →" link
                                                     Source: v.reservation_url (+ Resy params)
                                                     Gated: !hasSlots && valid URL
                                                     Also: "Walk-in only" muted text fallback

2. src/components/itinerary/StopAvailability.tsx   → 4 render branches:
                                                     (a) unconfirmed:        "Check availability →"
                                                     (b) no_slots_in_block:  "See other times →"
                                                     (c) has_slots header:   "Reserve on <Platform> →"
                                                     (d) has_slots slot pill: "Book TIME on Resy"
                                                     Source for (a)(b)(c): availability.bookingUrlBase
                                                     Source for (d): buildResySlotBookingUrl(...) (slot deep-link)

3. src/components/venue/VenueDetailModal.tsx       → "Reserve" pill in detail modal
                                                     Source: venue.reservation_url (bare, no pre-fill)
                                                     Gated: isValidReservationUrl(venue.reservation_url)
```

Three components, 6 link-rendering sites total. ItineraryView, ActionBar, CompositionHeader, WalkConnector — none render their own reservation link.

## Issue 2 — Resy unconfirmed-fallback URL bug

### The catch block

[src/lib/itinerary/availability-enrichment.ts](../src/lib/itinerary/availability-enrichment.ts) lines 234–254:

```ts
try {
  slots = await fetchResyWithTimeout(venue.resy_venue_id, date, partySize);
} catch (err) {
  console.error(`[availability] Resy timeout/error for ${venue.name} (${venue.id}):`, err);
  return {
    ...stop,
    availability: {
      status: "unconfirmed",
      slots: [],
      bookingUrlBase: buildResyBookingUrl(
        venue.resy_slug,
        date,            // ← itinerary day, passed from /api/generate or /api/swap-stop
        partySize
      ),
      swapped: false,
    },
  };
}
```

### `buildResyBookingUrl` definition

[src/lib/availability/booking-url.ts](../src/lib/availability/booking-url.ts) lines 13–19:

```ts
export function buildResyBookingUrl(
  slug: string,
  date: string,
  partySize: number
): string {
  return `https://resy.com/cities/ny/venues/${slug}?date=${date}&seats=${partySize}`;
}
```

### Reconciling the user's claim

**Two separate observations, only one is the catch's fault:**

1. **"Uses today's date instead of the itinerary day"** — NOT a bug in this catch. `date` is `inputs.day` threaded all the way from the request body. The catch passes it correctly into `buildResyBookingUrl`. The resulting URL has `?date=<itinerary_day>`.

   Where the "today" observation almost certainly comes from: **StopCard's bare-URL fallback path** when the venue isn't Resy OR when `date` is empty/falsy. For OpenTable venues, StopCard returns `v.reservation_url` with no params → the platform's page defaults to today. Two CTAs side-by-side, one links to today, one links to the right date → user concludes "the URL builder uses today's date."

2. **"Uses `cities/ny/` instead of `cities/new-york-ny/`"** — **REAL BUG.** `buildResyBookingUrl` ships the non-canonical pattern. The canonical pattern (which appears as the `ref` parameter inside `buildResySlotBookingUrl` at line 79) is `cities/new-york-ny/venues/<slug>`. Resy currently 301-redirects `cities/ny/` to `cities/new-york-ny/` so the URL still works, but every click costs a redirect, and if Resy ever drops that redirect, every fallback link breaks silently.

### Why does the catch build its own URL instead of using `venue.reservation_url`?

Intentional. `venue.reservation_url` is bare (no date/seats params). To preserve date-awareness for the unconfirmed fallback (so the user lands on Resy with the itinerary day pre-selected), the catch builds a date-aware URL via `buildResyBookingUrl`. That's the right call — it just relies on a helper with a slug-pattern bug.

### Git history of `buildResyBookingUrl`

`git log --oneline -p -- src/lib/availability/booking-url.ts` shows the `cities/ny/venues/<slug>` pattern has been there **since the file was first added**. Never changed. Always broken-ish. Resy's redirect is the only reason it still works.

Single-line fix: change `cities/ny/` → `cities/new-york-ny/`. Same args, same call sites, no breakage anywhere.

## Issue 3 — Consolidation strategy

### Per-status render matrix (current behavior)

| `availability.status` | StopCard footer | StopAvailability section | Redundancy? |
|---|---|---|---|
| **undefined** (no enrichment) | "Reserve on Platform →" via v.reservation_url derived | not rendered at all (`!isPast && stop.availability` gate in ItineraryView) | none — only StopCard |
| **walk_in** | hidden; OR "Walk-in only" muted text when `reservation_url === "Walk-in Only"` | returns `null` at line 66 | none |
| **unconfirmed** | "Reserve on Platform →" via `v.reservation_url` derived | "Couldn't load…" copy + "Check availability →" via `bookingUrlBase` | **YES — both visible, different URLs for OpenTable** |
| **no_slots_in_block** | "Reserve on Platform →" via `v.reservation_url` derived | "No tables…" copy + "See other times →" via `bookingUrlBase` | **YES — both visible, different URLs for OpenTable** |
| **has_slots** | hidden (`hasSlots` gate) | times grid + header "Reserve on Platform →" via `bookingUrlBase` + slot-specific "Book TIME on Resy" pill | none — StopCard suppresses for has_slots |

Redundancy lives in exactly **two states: `unconfirmed` and `no_slots_in_block`.** For OpenTable venues in those states, the two CTAs point to different URLs (bare vs pre-filled). For Resy venues in those states, both CTAs use `buildResyBookingUrl` so the URLs match (modulo the StopCard inline-append path) — but both hit the slug bug.

### Recommendation: Option A (refined)

**Why Option A over B**, after walking it through:
- StopAvailability already owns the contextually-correct copy for each status ("Couldn't load times…", "No tables available…", "Available times"). The CTA *belongs* under that copy — moving it to StopCard's footer divorces the explanatory text from the action.
- StopAvailability's CTA text is already status-aware: "Check availability →" for unconfirmed, "See other times →" for no_slots_in_block, "Reserve on Platform →" for has_slots. Option B would either lose that semantic differentiation or push contextual switching logic into StopCard.
- Option B requires StopCard to start reading from `availability.bookingUrlBase`, which means the link source is now ambiguous (sometimes one, sometimes the other). Option A keeps clean ownership: `availability` exists → StopAvailability owns the link; `availability` is undefined → StopCard owns the link.
- StopCard already reads `stop.availability?.status` for the `hasSlots` gate. Extending that gate to also suppress for `unconfirmed` and `no_slots_in_block` is a 3-line change.

### Concrete shape of Option A

In StopCard:
```ts
const hasAvailabilityCta =
  stop.availability?.status === "has_slots" ||
  stop.availability?.status === "unconfirmed" ||
  stop.availability?.status === "no_slots_in_block";

// existing line — change `!hasSlots` to `!hasAvailabilityCta`:
const showInlineReserve =
  !isPast &&
  !hasAvailabilityCta &&        // was: !hasSlots
  !!bookingPlatform &&
  isValidReservationUrl(v.reservation_url);
```

That's it for the consolidation. StopAvailability is unchanged. StopCard's footer suppresses whenever StopAvailability will render a link, falls back to its own derived link when there's no enrichment data (old saved itineraries, or any path where availability is undefined).

### Edge cases flagged

1. **VenueDetailModal still uses bare `venue.reservation_url`.** Not part of the StopCard / StopAvailability dance, but it's the third CTA and it pre-fills nothing. Probably should also prefer `stop.availability?.bookingUrlBase` if we plumb that through, but it's a separate concern. Modal opens on user tap — single intentional action — less urgent than the inline-redundancy bug.

2. **"Walk-in only" muted text in StopCard.** Stays. That branch is gated on `showWalkInLabel = !isPast && !hasSlots && v.reservation_url === "Walk-in Only"`. Independent from the link suppression. Muted text still belongs in StopCard's footer because StopAvailability returns null for walk_in.

3. **Old/saved itineraries with no `availability` field.** StopCard falls back to its own derived link via `v.reservation_url`. Same behavior as today — preserved.

4. **Analytics `from_surface` values.** Today:
   - `stop_card` — fires from StopCard
   - `availability_unconfirmed` / `availability_no_slots` / `availability_has_slots_header` / `availability_slot_specific` — from StopAvailability

   Under Option A, StopCard fires `stop_card` only when StopAvailability didn't render. So the four `availability_*` values still fire from their respective StopAvailability branches. No analytics rework needed. The user's effective behavior is "only ever clicks one link per stop" — which is true today too, just the wrong one sometimes.

5. **`cities/ny/` → `cities/new-york-ny/` fix.** Independent of the consolidation. Single-line change to `buildResyBookingUrl`. Should be in the same commit if rolled together since they're both about "the reservation URL points to the right place."

### Proposed change set (when greenlit)

- `src/components/ui/StopCard.tsx`: 3-line change — add `hasAvailabilityCta`, use it in `showInlineReserve` gate
- `src/lib/availability/booking-url.ts`: 1-line change — `cities/ny/` → `cities/new-york-ny/`

Total: 2 files, ~4 lines. No test changes. No analytics rework.

### Drafted commit messages (per CLAUDE.md rule)

If bundled:
```
fix(reservation-links): suppress redundant StopCard CTA when availability renders one, correct Resy slug to cities/new-york-ny
```

If split (cleaner for rollback of the URL change if Resy ever shifts canonical patterns):
```
fix(resy-url): correct slug pattern in buildResyBookingUrl from cities/ny to cities/new-york-ny
fix(stop-card): suppress redundant reservation link when StopAvailability renders one
```

## Status

Awaiting greenlight on:
- Option A vs B confirmation
- Single commit vs split commits for the slug fix
