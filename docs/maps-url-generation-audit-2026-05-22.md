# Maps URL generation — full picture

**Date:** 2026-05-22
**Trigger:** Decide whether to upgrade the "Open in Maps" links now that 100% of active venues have `google_place_id`.

The codebase has **two distinct surfaces** with **two distinct URL formats**. Neither uses `google_place_id`.

## 1. Multi-stop "Open in Maps" URL (the full itinerary route)

**Builder:** `src/lib/geo.ts:40-57` — `buildGoogleMapsUrl(stops)`

**URL format:** Google Maps **Directions API** (`/maps/dir/?api=1`):

```
https://www.google.com/maps/dir/?api=1
  &origin={lat},{lng}
  &destination={lat},{lng}
  &travelmode=walking
  &waypoints={lat},{lng}|{lat},{lng}      ← intermediate stops, pipe-separated
```

**Data used:** coordinates only. `stops[i].latitude` and `stops[i].longitude`. **No place_id, no address, no venue name.**

**Where it's built:**

- `src/app/api/generate/route.ts:300` — initial generation
- `src/app/api/add-stop/route.ts:134` — after adding a stop
- `src/app/api/swap-stop/route.ts:156` — after swapping a stop
- `src/app/itinerary/saved/[id]/page.tsx:71` — client-side rebuild (saved rows don't persist `maps_url`)

**Where it's consumed:**

- `src/components/itinerary/ActionBar.tsx:114` — the "Open in Maps →" CTA on the itinerary page
- `src/app/itinerary/share/[id]/page.tsx:90` — same CTA on the public share page

Stored on `ItineraryResponse.maps_url: string` (`src/types/index.ts:261`). **One combined URL per itinerary**, not per venue.

## 2. Per-venue "Open in Maps" link (venue detail modal)

**No dedicated builder — inline ternary in JSX:**

`src/components/venue/VenueDetailModal.tsx:184-188`:

```tsx
href={
  venue.maps_url ??
  `https://maps.google.com/?q=${venue.latitude},${venue.longitude}`
}
```

**Two possible URL formats:**

| Branch | Format | Effect |
|---|---|---|
| `venue.maps_url` is present | Whatever opaque URL the curator pasted into the sheet's `maps_url` column | Trusted as-is. Could be a permalink, short URL, place_id URL, anything |
| Fallback (column is null) | `https://maps.google.com/?q={lat},{lng}` | Opens Maps **Search** centered on the coordinates — drops a pin, no venue listing |

**Data used:** either the curator-supplied URL or coordinates. **Never `google_place_id`.**

`maps_url` is a `text` column on `composer_venues_v2` (`src/types/index.ts:144`) — `string | null`. Nothing in the codebase populates it; it's curator-only.

## Combined vs per-venue

- **Combined URL** (one route for the whole night): built once in `geo.ts`, stored at `itinerary.maps_url`, used by the bottom-of-page CTA.
- **Per-venue URLs** (one pin per spot): only used in the `VenueDetailModal` when a user taps a stop card to see venue details.

## Why no `google_place_id`?

The code doesn't explain itself, but the most likely reasons (in order of plausibility):

1. **`google_place_id` data wasn't reliably populated** when these URL builders were written. As of yesterday's K-town backfill, 100% of active venues have it — but historically it was patchy. Coordinates were always present (`latitude`/`longitude` are `NOT NULL` in the schema), so using coords was the always-works choice.
2. **For the multi-stop Directions URL, coords work fine** — Google routes between coords identically to routing between place_ids. The route itself doesn't gain anything from place_id.
3. **For the per-venue fallback URL, place_id was simply never wired in.** This is the actual UX leak: the fallback `?q=lat,lng` opens a generic pin in Google Maps Search. The same coordinates with `google_place_id` could instead open the venue's actual Google Maps listing (reviews, photos, hours, "save to favorites", etc.).

## Improvement opportunities

Now that 100% of active venues have `google_place_id`, two upgrades are unlocked:

### A) Multi-stop URL — render with venue names instead of bare pins

Google Maps Directions API accepts these alongside the existing params:

- `destination_place_id={place_id}`
- `origin_place_id={place_id}`
- `waypoint_place_ids={place_id}|{place_id}|...`

With these, the user's Maps app shows actual venue names + listing previews instead of "coordinate" pins. Same route, dramatically better-feeling output. Small change in `buildGoogleMapsUrl`.

### B) Per-venue link — open the venue's actual Google Maps listing

Replace the coordinate fallback with the place-id form:

```ts
href={
  venue.google_place_id
    ? `https://www.google.com/maps/place/?q=place_id:${venue.google_place_id}`
    : venue.maps_url ?? `https://maps.google.com/?q=${venue.latitude},${venue.longitude}`
}
```

This opens the venue's full Google Maps listing — reviews, hours, photos, the "save" star, the Google business profile, the works. The current coord-only fallback opens a barebones pin with no context.

Worth doing both as a single small follow-up commit.

## Source dataset

| Field | Population | Source |
|---|---|---|
| `latitude` / `longitude` | 100% (NOT NULL schema constraint) | Sheet → importer |
| `google_place_id` | 100% of active venues (as of 2026-05-21 backfill) | Sheet → importer; backfilled where missing |
| `maps_url` | curator-only, mostly null | Sheet column, hand-entered |
| `address` | 100% | Sheet → importer |
