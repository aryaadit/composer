# Compose Simplification — Phase 3 Investigation

**Date:** 2026-06-09
**Branch:** `adit/sandbox-testing`
**Status:** Investigation complete; awaiting greenlight for implementation
**Phase 1 doc:** [archive/compose-simplification-phase-1-implementation-2026-06-09.md](archive/compose-simplification-phase-1-implementation-2026-06-09.md)
**Phase 1 fidelity fix:** [compose-simplification-phase-1-fidelity-fix-implementation-2026-06-09.md](compose-simplification-phase-1-fidelity-fix-implementation-2026-06-09.md)

---

## Scope

Phase 3 of compose simplification, bundled into one change:

1. **Remove Regenerate and New plan buttons** from the ActionBar across the three itinerary surfaces (fresh / saved / share).
2. **Add four analytics signals** to characterize abandonment and engagement:
   - `compose_abandoned` — new event
   - `itinerary_dwell_time` — new event
   - `itinerary_zero_engagement` — new event
   - `time_to_first_engagement_ms` — new property on existing engagement events (not a new event)

Phase 1 fixed the *input model*. Phase 3 fixes the *output surface*: less to fidget with, plus telemetry to see whether removing those affordances changed user behavior.

---

## 1. ActionBar across the three surfaces

One ActionBar component, but only 2 of 3 surfaces mount it. The share surface has its own inline footer.

| Surface | Mounts ActionBar? | Buttons rendered |
|---|---|---|
| **Fresh** ([src/app/itinerary/page.tsx:260-264](../src/app/itinerary/page.tsx#L260-L264)) | Yes | Maps · Save · **Regenerate (functional)** · **New plan** · Share |
| **Saved** ([src/app/itinerary/saved/[id]/page.tsx:187-192](../src/app/itinerary/saved/%5Bid%5D/page.tsx#L187-L192)) | Yes (with `noopRegenerate = () => {}`) | Maps · Save (preset "Saved") · **Regenerate (DEAD — silent no-op)** · **New plan** · Share |
| **Share** ([src/app/itinerary/share/[id]/page.tsx:124-148](../src/app/itinerary/share/%5Bid%5D/page.tsx#L124-L148)) | **No** — has its own inline footer | Maps · "Compose your own →" |

### Functional definitions

- **Regenerate** ([src/app/itinerary/page.tsx:124-153](../src/app/itinerary/page.tsx#L124-L153)): POSTs `/api/generate` again with the same inputs plus `excludeVenueIds = [...recentSavedVenues, ...currentPlanVenues]` so the same plan can't come back. On success: updates state, bumps `regenerationCountRef`, fires `itinerary_regenerated` with `{occasion, neighborhoods, budget, vibe, start_time, day, regeneration_count}`. On the **saved** surface, the prop is `noopRegenerate = () => {}` — click does literally nothing, no event fires. Existing UX bug.
- **New plan** ([ActionBar.tsx:168-173](../src/components/itinerary/ActionBar.tsx#L168-L173)): hardcoded `<a href="/compose">`. Pure navigation. **No event fires on click.** (Landing on `/compose` fires `compose_started`.)

### Question flagged for product

Share page footer's `<Link href="/compose">Compose your own →</Link>` ([share/[id]/page.tsx:141-146](../src/app/itinerary/share/%5Bid%5D/page.tsx#L141-L146)) is the moral equivalent of "New plan" but it serves a different actor — the share recipient, often not the itinerary owner. It's a marketing CTA. Recommendation: **leave intact**. Pending confirmation.

---

## 2. PostHog event taxonomy

**26 events in EVENTS const** at [src/lib/analytics.ts:26-62](../src/lib/analytics.ts#L26-L62):

```
Identity:       USER_SIGNED_UP, USER_SIGNED_IN, USER_SIGNED_OUT
Compose:        COMPOSE_STARTED, COMPOSE_STEP_COMPLETED, COMPOSE_START_TIME_SELECTED,
                COMPOSE_SUBMITTED, ITINERARY_GENERATED, ITINERARY_GENERATION_FAILED
Engagement:     ITINERARY_VIEWED, STOP_SWAPPED, STOP_ADDED, ITINERARY_REGENERATED,
                TIME_SLOT_SELECTED, RESERVATION_CLICKED, MAPS_OPENED,
                VENUE_DETAIL_OPENED, ITINERARY_MAP_PIN_TAPPED, ITINERARY_MAP_EXPANDED
Save/share:     ITINERARY_SAVED, ITINERARY_UNSAVED, SHARE_LINK_COPIED, SHARE_LINK_VISITED,
                ONBOARDING_COMPLETED
Errors:         ERROR_ENCOUNTERED, FEATURE_BLOCKED
```

### Discrepancy worth flagging

EVENTS const exists, but only **3 of 26 events** use the constant at call sites (`ITINERARY_MAP_PIN_TAPPED`, `ITINERARY_MAP_EXPANDED`, `COMPOSE_START_TIME_SELECTED`). The other 23 are fired via raw string literals (`track("itinerary_saved", …)`). Pre-existing inconsistency — not Phase 3 scope, but I'll follow the dominant pattern (string literals at call sites, register names in EVENTS so they're greppable).

`ITINERARY_UNSAVED` exists in the const but has **zero call sites** — dead entry.

### Phase 3 deltas

| Op | Event |
|---|---|
| Remove | `ITINERARY_REGENERATED` (const + the single fire site in `itinerary/page.tsx:139`) |
| Add | `COMPOSE_ABANDONED: "compose_abandoned"` |
| Add | `ITINERARY_DWELL_TIME: "itinerary_dwell_time"` |
| Add | `ITINERARY_ZERO_ENGAGEMENT: "itinerary_zero_engagement"` |
| Property | `time_to_first_engagement_ms` on existing engagement events (no new event) |

No naming collisions with existing taxonomy.

---

## 3. Compose flow entry point

[src/components/questionnaire/QuestionnaireShell.tsx:79-83](../src/components/questionnaire/QuestionnaireShell.tsx#L79-L83):

```tsx
useEffect(() => {
  // First mount: fire compose_started + initialize timer for step 1.
  stepStartMsRef.current = performance.now();
  track("compose_started", { entry_source: deriveEntrySource() });
}, []);
```

Fires once on QuestionnaireShell mount. `entry_source` is derived from referrer/route. Subsequent events:

- `compose_step_completed` ([line 91-96](../src/components/questionnaire/QuestionnaireShell.tsx#L91-L96)) — fires per step advance with `{step, step_value, step_index, time_on_step_ms}`. `step` is the human label, `step_index` is 1-indexed.
- `compose_start_time_selected` ([WhenStep.tsx:81](../src/components/questionnaire/WhenStep.tsx#L81)) — fires per start-time pill tap (sub-step interaction).
- `compose_submitted` ([line 114](../src/components/questionnaire/QuestionnaireShell.tsx#L114)) — fires when the user taps "Build my plan" on WhenStep, immediately before POSTing `/api/generate`.
- `itinerary_generated` / `itinerary_generation_failed` — **fired server-side via `trackServer`** in [src/app/api/generate/route.ts:421, 463](../src/app/api/generate/route.ts#L421). These count as compose-funnel success/failure.

### Implication for `compose_abandoned`

The abandonment flag should be set on `compose_started` and **cleared on a successful `/api/generate` response client-side** (since the success event is server-side, the client signal is the fetch resolving with `res.ok`). The natural cleanup point is `submitAnswers` in QuestionnaireShell ([line 124-139](../src/components/questionnaire/QuestionnaireShell.tsx#L124-L139)). If the fetch throws or returns non-OK, the flag stays — that compose flow is abandoned, fires `compose_abandoned` later.

---

## 4. Itinerary view mount points

All three surfaces fire `itinerary_viewed` exactly once on mount, guarded by a `viewedFiredRef`:

| Surface | File | Properties |
|---|---|---|
| Fresh | [page.tsx:113-121](../src/app/itinerary/page.tsx#L113-L121) | `source: "fresh", itinerary_id: null, is_past` |
| Saved | [saved/[id]/page.tsx:65](../src/app/itinerary/saved/%5Bid%5D/page.tsx#L65) | `source: "saved", itinerary_id: id, is_past` |
| Share | [share/[id]/page.tsx:57](../src/app/itinerary/share/%5Bid%5D/page.tsx#L57) | `source: "share", itinerary_id: id, is_past` |

These are the natural anchor points for `itinerary_dwell_time` and `itinerary_zero_engagement`. The same effect that fires `itinerary_viewed` can capture `viewedAt = performance.now()`, and a cleanup function can fire `itinerary_dwell_time` (and zero-engagement) on unmount. A `beforeunload` listener inside the same effect handles full-page-close cases that don't trigger React cleanup.

Share page note: also fires `share_link_visited` ([line 44](../src/app/itinerary/share/%5Bid%5D/page.tsx#L44)) — that's the recipient-side landing event, fires before `itinerary_viewed`. Doesn't compete for the dwell anchor; `itinerary_viewed` is still the right anchor.

---

## 5. Engagement events — confirmed full list

From `grep 'track(' src/`:

| Event | Fire sites | Client/server | Counts as engagement? |
|---|---|---|---|
| `reservation_clicked` | StopAvailability ×4, StopCard ×1, VenueDetailModal ×1 | client | yes |
| `time_slot_selected` | StopAvailability:220 | client | **yes (spec didn't list — flagging)** |
| `maps_opened` | ActionBar (top CTA), share/[id]/page.tsx (share footer), VenueDetailModal | client | yes |
| `stop_swapped` | api/swap-stop/route.ts:184 | **server (`trackServer`)** | yes — but client must increment |
| `stop_added` | itinerary/page.tsx:190 | client | yes (fresh surface only) |
| `itinerary_saved` | ActionBar:66 | client | yes |
| `share_link_copied` | ActionBar:93 | client | yes (spec said "itinerary_shared" — same thing) |
| `venue_detail_opened` | ItineraryView:98 | client | yes |
| `itinerary_map_pin_tapped` | ItineraryMap:96 | client | yes |
| `itinerary_map_expanded` | ItineraryMap:121 | client | yes |

### Three subtleties

1. **`stop_swapped` is server-side only.** The engagement counter can't piggyback on the event firing — it's a `trackServer` call inside `/api/swap-stop`. I need to increment at the **client-side initiation point** ([useSwapStop.ts:30-99](../src/hooks/useSwapStop.ts#L30-L99)) — when the user calls `handleSwap`, not when the server acks. Same answer for `stop_added` (`handleAddStop` in [itinerary/page.tsx:159](../src/app/itinerary/page.tsx#L159)).

2. **`time_slot_selected` not in spec's engagement list.** It's active interaction (user picking a reservation time). Recommendation: include it. Easy to exclude if disagreement.

3. **`share_link_visited`** is the **viewer landing** event — fires *before* engagement starts. Should NOT count as engagement on the share surface. Easy to skip.

### Add-stop surface limit

`stop_added` only fires on fresh — saved & share surfaces don't expose the add-stop affordance. Doesn't change the implementation; just means saved/share engagement count tops out at: map / reservation / save / share / venue-detail / map-pin / map-expand.

---

## 6. Dashboard dependencies

**Cannot tell from the codebase alone.** No PostHog dashboard configs are checked in. `itinerary_regenerated` has been firing in production since at least the recent commits — if there are insights or funnels referencing it, deleting the event will silently break them. Same caveat for any `ITINERARY_UNSAVED` queries (no fire sites in code, but a dashboard could be polling for it).

**Action item for user:** check PostHog for any saved insight, dashboard, or funnel using `itinerary_regenerated` before merging. Update or delete them as needed.

---

## Implementation approach — design choices

These are the calls I'd make absent direction. Each is a yes/no question to confirm or override.

### a. Engagement counter via React Context, not prop-drilling

A `<ItineraryEngagementProvider source itineraryId>` wraps each surface. Engagement-firing children call `useEngagement()` to get `{ trackEngagement }`. The wrapper internally:

1. Increments a local count ref (not state — no re-render).
2. If count goes 0→1, adds `time_to_first_engagement_ms = performance.now() - viewedAt` to the event properties.
3. Calls the underlying `track()`.

Drops prop-drilling through `ItineraryView → StopCard → StopAvailability → ReservationButton`. Spec mentions both options ("at the ItineraryView level … pass an incrementEngagement callback down to children") — Context is cleaner for the existing tree.

### b. Dwell-time fires from useEffect cleanup AND beforeunload

useEffect cleanup catches SPA navigation (route change) and React unmount. `beforeunload` catches hard close / refresh / cross-origin nav. Both call the same `emitDwell()` helper. A ref guards against double-fire.

### c. `compose_abandoned` cleanup point

- Set flag on `compose_started` (with `compose_started_at: performance.timeOrigin + performance.now()` and `last_step_completed: null`).
- Update `last_step_completed` on each `compose_step_completed`.
- Clear flag when `/api/generate` returns successful response client-side (inside `submitAnswers` in QuestionnaireShell, **before** `router.push("/itinerary")`).
- Check for stale flag on **app boot** (AuthProvider mount or root layout effect) — catches users who abandoned days ago.
- Plus a fallback check inside `compose_started`'s own effect so a same-tab abandon → retry sequence fires correctly.

Cap `time_in_flow_ms` at `60 * 60 * 1000` per spec.

### d. Test for the cap-at-1-hour case

Pure helper extracted to `src/lib/analytics/compose-abandoned.ts`. Test seeds the flag with `compose_started_at = now - 6h`, calls `checkAndEmitIfStale()`, asserts `track` called once with `time_in_flow_ms: 3_600_000`, flag cleared.

### e. Removing `ITINERARY_REGENERATED` from EVENTS

Spec is explicit ("delete those entries too"). I'd also delete the unused `ITINERARY_UNSAVED` since I'm touching the file — flag if you'd rather leave it.

### f. New plan vs. share-page "Compose your own"

Per the question in §1: share-page footer is separate from ActionBar. Recommendation: leave "Compose your own" intact (recipient-facing CTA, different audience from itinerary owner). Confirm or override.

---

## Drafted commit message (for Part 2 implementation)

```
feat(itinerary): remove Regenerate + New plan, bundle abandonment + dwell + engagement instrumentation
```

---

## Open questions awaiting greenlight

1. **Confirm or override §6.a** — Context vs prop-drilling for engagement counter.
2. **Confirm or override §6.c** — abandonment flag set/clear/check sequence.
3. **Confirm or override §6.e** — delete `ITINERARY_UNSAVED` too?
4. **Confirm or override §6.f** — leave share-page "Compose your own"?
5. **Include `time_slot_selected` in engagement counter?** Recommendation: yes.
6. **PostHog dashboard check before merge** — user action item, not code.
