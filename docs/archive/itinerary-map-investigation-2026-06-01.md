# Inline Mapbox map — pre-implementation investigation — 2026-06-01

Investigation findings before building `ItineraryMap.tsx`. No code change yet — surfacing decisions that affect the diff before any work happens.

## Findings

### 1. Mapbox is NOT a JS dependency

Grep for `mapbox`/`react-map` in `package.json`: **no matches.** No `mapbox-gl`, no `react-map-gl`.

What Composer DOES have today:
- [src/lib/mapbox.ts](../src/lib/mapbox.ts) — server-side helper that hits Mapbox's **Static Images REST API** by constructing URLs. Renders to `<img>` tags in `WalkConnector`. No client-side map library, no interactivity.
- `MAPBOX_TOKEN` env var (no `NEXT_PUBLIC_` prefix) — used by the server-side URL builder.

**To build an interactive inline map, we need new dependencies and one env-var change.**

Proposed new deps:
- `mapbox-gl ^3.10.0`
- `react-map-gl ^7.1.7` (thin React wrapper around mapbox-gl; handles imperative lifecycle, fit-to-bounds, marker mounting, source/layer management)

Both ship as ES modules with proper TS types. `react-map-gl@^7` supports React 19.

### 2. Token visibility (env var)

Today's `MAPBOX_TOKEN` is server-only. Client-side Mapbox needs the token exposed via `NEXT_PUBLIC_MAPBOX_TOKEN`. Two options:

- **Option A: Add `NEXT_PUBLIC_MAPBOX_TOKEN`** with the same value alongside the existing `MAPBOX_TOKEN`. Existing code unchanged. Slight env duplication.
- **Option B: Rename `MAPBOX_TOKEN` → `NEXT_PUBLIC_MAPBOX_TOKEN`** and update `src/lib/mapbox.ts` + `.env.local` + Vercel. Net cleaner.

The token is **already de facto public** today (it's embedded in every static-images URL as a query param, which renders in `<img src>` HTML sent to the client). Making it `NEXT_PUBLIC_` is just labeling reality.

**Recommend Option B.**

### 3. Shared component for all three surfaces

[src/components/itinerary/ItineraryView.tsx](../src/components/itinerary/ItineraryView.tsx) is the shared component. All three surfaces render through it:
- `src/app/itinerary/page.tsx` → `surface="fresh_itinerary"` (default)
- `src/app/itinerary/saved/[id]/page.tsx` → `surface="saved"`
- `src/app/itinerary/share/[id]/page.tsx` → `surface="share"`

Place `<ItineraryMap />` inside `ItineraryView`. All three surfaces get it for free.

### 4. Top-of-itinerary layout

Per-page structure (parent → child):

```
CompositionHeader         ← title, subtitle, weather pill, occasion/vibe chips
  (rendered by the parent page, NOT ItineraryView)
PastItineraryBanner       ← saved/share pages only, when isPast
ItineraryView
  ├─ OrderingConflictBanner   ← when there's a slot ordering conflict
  └─ <stops list (border-y div)>
       StopCard #1
       WalkConnector
       StopCard #2
       ...
       (+ Add another stop) OR ("Plan another →" for past)
```

Map slot, per spec ("between subtitle/weather pill and the first stop card"): **inside `ItineraryView`, as the first child, ABOVE `OrderingConflictBanner` and the stops list**. CompositionHeader stays in the parent page (above ItineraryView).

For past itineraries (saved/share with isPast=true): the past-banner is in the parent page above ItineraryView. Map appears below the past banner, above stops. Per spec: "Past itinerary: same rendering, no special handling." ✓

### 5. Stop data — lat/lng availability

Each `ItineraryStop.venue` has `latitude: number` and `longitude: number` (both **non-null** per the venue type and the DB schema). So for fresh and recent saved/share itineraries, the data is guaranteed present.

Defensive logic: filter `stops.map(s => s.venue).filter(v => v.latitude != null && v.longitude != null)` for pins, use the same filtered array for route segments (missing-coord stops skipped entirely, segments interpolate around them). If zero pins after filtering → don't render the map (return `null`). If one pin → render with the single pin centered, no polyline.

### 6. Env variable status

Confirmed via `.env.local`:
- `MAPBOX_TOKEN` exists (server-only, no `NEXT_PUBLIC_`).
- `NEXT_PUBLIC_MAPBOX_TOKEN` does NOT exist.

Per Option B: rename the existing var. One-time `.env.local` edit + matching update to `src/lib/mapbox.ts` (changes `process.env.MAPBOX_TOKEN` → `process.env.NEXT_PUBLIC_MAPBOX_TOKEN`) + Vercel env var rename (manual).

If avoiding the rename: fall back to Option A (add a second var with the same value).

## Pre-implementation decisions to confirm

Seven decisions, none block the work, all affect the diff:

1. **`react-map-gl` + `mapbox-gl` as new deps.** Yes / no? Without `react-map-gl`, hand-rolling the imperative lifecycle is ~3x the code for the same UX. **Recommend: yes.**

2. **Env var: rename `MAPBOX_TOKEN` → `NEXT_PUBLIC_MAPBOX_TOKEN`** (Option B), or add `NEXT_PUBLIC_MAPBOX_TOKEN` alongside (Option A)? **Recommend: rename.**
   - If rename: also update `src/lib/mapbox.ts` in the same commit and list the Vercel env var change manually.

3. **mapbox-gl CSS import location**: with `next/dynamic({ ssr: false })`, cleanest pattern is to import `mapbox-gl/dist/mapbox-gl.css` inside the `ItineraryMap.tsx` component file (above the component, scoped to the dynamic chunk). Or in `globals.css`? **Recommend: in the component file** so the CSS only loads alongside the map chunk.

4. **Fullscreen overlay behavior**: tap-outside-to-close + explicit close button. Should the overlay also close on `Esc` keypress (desktop)? **Recommend: yes** — matches `VenueDetailModal`'s existing pattern.

5. **Pin tap behavior**: smooth-scroll to corresponding StopCard + brief highlight. No existing focus/highlight pattern in StopCard. Proposed:
   - Add `data-stop-index={i}` attribute to each StopCard's outer motion.div
   - From the map handler: `document.querySelector('[data-stop-index="N"]')` + `.scrollIntoView({behavior: "smooth", block: "center"})`
   - Highlight: transient `ring-2 ring-burgundy/40` class for ~1.5s
   - State management: parent-level `highlightedIndex` in ItineraryView, passed as prop to StopCard
   - **Recommend: parent-level state** — keeps StopCard presentational.

6. **Analytics**: spec proposes `itinerary_map_pin_tapped` and `itinerary_map_expanded`. Add to `EVENTS` const in `src/lib/analytics.ts`. Confirming `from_surface` values match the existing `ItinerarySurface` type (`"fresh_itinerary" | "saved" | "share"`) rather than the spec's `"fresh"` (which drops the `_itinerary` suffix). **Use existing taxonomy** for cross-event consistency in PostHog.

7. **Past-itinerary surface**: existing `ItinerarySurface` enum is `"fresh_itinerary" | "saved" | "share"`. **Use existing values** — alias to spec's shorter names would create taxonomy drift.

## Drafted commit messages (when implementation lands)

If env rename happens in the same commit as the feature:
```
feat(itinerary): inline Mapbox map with numbered pins, route lines, tap-to-expand
```

If isolated for cleaner rollback of the env rename:
```
chore(env): rename MAPBOX_TOKEN to NEXT_PUBLIC_MAPBOX_TOKEN
feat(itinerary): inline Mapbox map with numbered pins, route lines, tap-to-expand
```

## Status

Awaiting greenlight (or override) on the seven decisions above before writing any code. No new files created yet, no edits to existing files.
