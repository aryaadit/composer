# Compose Simplification — Phase 4 Investigation

**Date:** 2026-06-09
**Branch:** `adit/sandbox-testing`
**Status:** Investigation complete; awaiting greenlight + decisions on 5 open questions
**Phase 1 doc:** [compose-simplification-phase-1-fidelity-fix-implementation-2026-06-09.md](compose-simplification-phase-1-fidelity-fix-implementation-2026-06-09.md)
**Phase 2 doc:** [compose-simplification-phase-2-investigation-2026-06-09.md](compose-simplification-phase-2-investigation-2026-06-09.md)
**Phase 3 doc:** [compose-simplification-phase-3-investigation-2026-06-09.md](compose-simplification-phase-3-investigation-2026-06-09.md)

---

## Scope

Phase 4 adds a **swap-reason modal** that appears AFTER a stop swap completes. Skippable, captures a categorical reason + optional free-text "Other" detail. Three new analytics events: `stop_swap_reason_shown` (impression), `stop_swap_reason_submitted` (engagement), `stop_swap_reason_skipped` (dismissal).

The modal is purely a *signal collector* — the swap itself already completed by the time the modal appears, the new venue is already rendered, the undo toast may or may not still be active. We're capturing the *why* behind the swap, decoupled from the swap mechanics.

---

## 1. Swap flow today

[src/hooks/useSwapStop.ts:28-143](../src/hooks/useSwapStop.ts#L28-L143):

```
handleSwap(index)  →  setState({swappingIndex: index, swapError: null})
                  →  POST /api/swap-stop {itinerary, stopIndex, excludeVenueIds}
                  →  404? error toast "No other good matches" (5s)
                  →  !ok? "Something went wrong" (3s)
                  →  ok? parse {stop, walks, maps_url, estimated_total}
                          ↓
                     replace stops[index] in-place + patch adjacent walks
                          ↓
                     update excludedRef[index] with the OLD venue id
                          ↓
                     onUpdate(next)                ← lifts the new itinerary
                          ↓
                     show Toast "Swapped" + "Undo" action (8s window)
                          ↓
                     setState({swappingIndex: null, swapError: null})
```

**The new venue appears in-place** the moment `onUpdate(next)` fires — page-level `updateItinerary` calls `setItinerary(next)` which re-renders ItineraryView; the StopCard at that index now renders the new venue. The `<SwapSkeleton />` ([StopCard.tsx:145-146](../src/components/ui/StopCard.tsx#L145-L146)) is shown while `isSwapping`, then unmounts.

**Existing analytics for swap:** `stop_swapped` fires **server-side** via `trackServer` in [/api/swap-stop/route.ts:184](../src/app/api/swap-stop/route.ts#L184). Properties: `stop_index, stop_role, from_venue_*, to_venue_*, occasion, vibe`. No client event. Engagement counter increments at client-initiation via `wrappedOnSwapStop` in ItineraryView (Phase 3). **There is no existing event that records the user's *reason* for swapping** — that's exactly what Phase 4 adds.

**Undo path is non-trivial.** Toast has an "Undo" button (8s window) that calls `onUpdate(restored)` to revert. `excludedRef[index]` also rolls back. This means: between swap-complete and undo, the user could see (1) the new venue, (2) the swap-reason modal, AND (3) the undo toast simultaneously. **Open question 2 below addresses this.**

---

## 2. Modal infrastructure

Two patterns in use, both built on `motion`/`AnimatePresence`:

### Pattern A — VenueDetailModal (recommended template)

[VenueDetailModal.tsx:23-73](../src/components/venue/VenueDetailModal.tsx#L23-L73). Mobile bottom-sheet / desktop centered modal.

- Open/close controlled by a nullable prop (`null` = closed).
- Esc dismissal: `useEffect` keydown listener calls `onClose()` on `Escape`.
- Backdrop dismissal: separate `motion.div` backdrop with `onClick={onClose}`.
- Body scroll lock: `useEffect` sets `document.body.style.overflow = "hidden"` on open, `""` on cleanup.
- `role="dialog" aria-modal="true" aria-label={…}` on the sheet.
- Mobile: `fixed inset-x-0 bottom-0 rounded-t-2xl`. Desktop: `md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:max-w-lg md:rounded-2xl`.
- Spring animation: `y: "100%"` slides up from the bottom on enter, slides down on exit.

### Pattern B — ItineraryMap fullscreen overlay

[ItineraryMap.tsx:144-174](../src/components/itinerary/ItineraryMap.tsx#L144-L174). Centered/inset overlay (not a bottom sheet). Same Esc + scroll-lock + `role="dialog"` pattern.

### No shared modal primitive

Both reimplement the keydown/scroll-lock effects locally. Known small inconsistency; not Phase 4's job to fix. SwapReasonModal should follow **Pattern A** for consistency with VenueDetailModal — both are user-action modals.

---

## 3. Engagement provider integration

EngagementProvider exposes three callables (Phase 3 + Phase 2):

```ts
trackEngagement(name, props)        // increments + (if 1st) attaches time_to_first_engagement_ms
incrementEngagement()                // bumps counter only, no event
getTimeSinceViewed(): number | null  // ms since viewedAt, or null pre-mount
```

### Spec mapping confirmed

| Event | Is engagement? | Helper |
|---|---|---|
| `stop_swap_reason_shown` | No (impression — modal appeared, user didn't act) | `track()` |
| `stop_swap_reason_submitted` | **Yes** (user actively selected + confirmed) | `trackEngagement()` |
| `stop_swap_reason_skipped` | No (active dismissal — but spec treats as not-an-engagement) | `track()` |

`skipped` not-an-engagement is consistent with the Phase 3 model: dismissing a survey is "the user opted out" rather than "engaged with the itinerary."

`time_to_decision_ms` (on submitted) is a separate measurement from `time_to_first_engagement_ms`: modal-shown-to-modal-submitted, NOT itinerary-viewed-to-submitted. The provider doesn't track this — the modal owns its own timer (capture `performance.now()` in a ref when the modal opens; subtract on submit).

---

## 4. Where the modal mounts

Spec recommends **ItineraryView level**. Honest analysis below — I'm pushing back gently on this and recommending page-level instead.

### Current ownership chain

- `useSwapStop` instantiated in [page.tsx](../src/app/itinerary/page.tsx) (`ItineraryBody`).
- Returns `handleSwap` → passed to `ItineraryView` as `onSwapStop`.
- `ItineraryView` wraps with `wrappedOnSwapStop` (Phase 3 engagement increment) → forwards to `StopCard` + `StopAvailability` as `onSwap`.
- Swap **completion** (parsing server response, calling `onUpdate(next)`) is owned by `useSwapStop` — at page level, NOT in ItineraryView.

### Option A — ItineraryView-level (per spec): move useSwapStop down

ItineraryView's props change: `itinerary: ItineraryResponse, updateItinerary: (next) => void` replace `stops, walks, onSwapStop, swappingIndex, swapError`. Saved/share pages today pass `stops` + `walks` separately and have no `updateItinerary` — they'd need to pass `{itinerary, updateItinerary: () => {}}` and we'd gate the swap UI by `!isPast && updateItinerary !== noop`. Invasive — 3 surface pages updated, ItineraryView interface broken.

### Option B — ItineraryView-level via ref-callback pattern

ItineraryView owns the modal state; on mount, calls `registerOnSwapComplete(setSwapReasonContext)` which the parent stores in a ref; parent's `useSwapStop` calls `onSwapComplete = (ctx) => onSwapCompleteRef.current?.(ctx)`. Functional but unusual — refs as event bus.

### Option C — Page-level mount (my recommendation)

Extend `useSwapStop` to accept a 3rd param `onSwapComplete?(ctx)`. Page-level state owns `swapReasonContext`. Modal rendered in `ItineraryBody` alongside `ActionBar`. Glue cost: ~5 new lines in `useSwapStop` + ~10 lines in `ItineraryBody`. Saved/share pages get no changes (they have no swap functionality anyway).

### Recommendation: page-level (Option C)

Rationale:

1. **Smaller blast radius** — ~15 lines vs. invasive prop change or unusual ref pattern.
2. **Honors existing ownership** — `useSwapStop` already owns swap completion. Adding `onSwapComplete` as a sibling to `onUpdate` is the natural extension.
3. **Modal is page-shell concern** — structurally a dialog at the top of the document, not a child of the stop list. Same conceptual layer as ActionBar (also page-mounted).
4. **Same user-facing behavior** regardless of mount level.

**Tradeoff I'm giving up:** if you ever enable swap on saved or share surfaces, page-level wouldn't cover those automatically. With ItineraryView-level, adding swap to other surfaces would Just Work. I'd argue YAGNI — saved is intentionally read-only, share is recipient-facing.

**If you want to honor spec exactly**, I'd implement Option A (move useSwapStop into ItineraryView). Open question 1 below.

---

## Other clarifications before implementation

### Rapid sequential swaps — confirmed approach

Spec D recommends: "new modal opens, previous gets implicit skip event fired." Strictly simpler than queueing. Implementation: when `onSwapComplete` fires while a `swapReasonContext` is already set, fire `stop_swap_reason_skipped` for the existing context BEFORE overwriting with the new one.

### Undo interaction with the modal — flagged (open question 2)

If the user clicks Undo (8s toast window) while the modal is open, three options:

- **A** — Modal stays open. User can submit a reason. Reason captures intent ("I wanted to swap because…") and Undo represents "but actually let me keep the original." Both signals captured.
- **B** — Modal auto-closes on Undo, fires skipped.
- **C** — Modal auto-closes on Undo, fires submitted with `reason: "undone"`.

My read: **A** is cleanest. Reason data is decoupled from final venue choice. The user's stated reason for swapping doesn't become wrong just because they changed their mind. PostHog can join `stop_swap_reason_submitted` with `stop_swapped` events and detect undo via session timeline.

### `surface` property

Spec lists `surface` on all three events. Since swap is fresh-only today, this will always be `"fresh_itinerary"` in practice. Including it future-proofs the schema and matches existing conventions (`venue_detail_opened`, `reservation_clicked` already carry `from_surface`).

### Property availability

For the events to carry `original_venue_*`, `new_venue_*`, `stop_index`, `stop_role`, `vibe`, `surface`:

| Property | Source |
|---|---|
| `original_venue_*` | Captured in `useSwapStop` BEFORE calling `onUpdate(next)` (have `prevVenueId`; need to also capture the full venue object — easy) |
| `new_venue_*` | From parsed `payload.stop.venue` |
| `stop_index` | Passed into `handleSwap` |
| `stop_role` | From `itinerary.stops[index].role` (preserved across swap) |
| `vibe` | From `itinerary.inputs.vibe` |
| `surface` | Hardcoded `"fresh_itinerary"` for now (or threaded from a prop to genericize) |

All available in `useSwapStop`'s closure at the success path. The hook builds the full `SwapContext` and passes it to `onSwapComplete`.

---

## Drafted commit message (for Part 2)

```
feat(itinerary): swap-reason modal with categorical reasons + optional other text
```

---

## Open questions awaiting greenlight

1. **Modal mount location** — page-level (my recommendation, smaller blast radius) or ItineraryView-level (your spec, requires moving useSwapStop down)?
2. **Undo while modal open** — modal stays open per option A above (my recommendation), or auto-close on undo? If auto-close, skipped or submitted-with-"undone"?
3. **Rapid swap fires implicit skip on previous** — confirm this matches your spec recommendation (I'm aligned).
4. **`reason_text` field on shown/skipped events** — include the `reason` and `reason_text` fields on `shown` and `skipped` as null for schema uniformity (my preference), or omit them entirely on those events?
5. **Modal visual treatment** — match VenueDetailModal exactly (bottom-sheet on mobile, centered modal on desktop), or use a smaller centered modal even on mobile (less imposing for a quick survey)?

---

## Notes for implementation (Part 2)

- New component: `src/components/itinerary/SwapReasonModal.tsx` (follow VenueDetailModal pattern).
- 6 reason options per spec:
  - `not_interested` → "Not interested in this place"
  - `looking_for_different` → "Looking for something else here"
  - `wrong_vibe` → "Wrong vibe"
  - `out_of_budget` → "Out of budget"
  - `already_been` → "Already been"
  - `other` → "Other"
- "Other" reveals single-line text input; text optional even when chosen.
- Submit enabled once any reason selected. Skip always available (X button, "Skip" link, Esc, backdrop click all count as skip).
- 3 EVENTS additions:
  - `STOP_SWAP_REASON_SHOWN: "stop_swap_reason_shown"`
  - `STOP_SWAP_REASON_SUBMITTED: "stop_swap_reason_submitted"`
  - `STOP_SWAP_REASON_SKIPPED: "stop_swap_reason_skipped"`
- `useSwapStop` gets a new optional `onSwapComplete?(ctx: SwapContext)` parameter.
- `SwapContext = { stopIndex, stopRole, originalVenue, newVenue, vibe, surface }`.
- Timer ref in the modal captures `performance.now()` on open; subtract on submit → `time_to_decision_ms`.
- `track()` for shown/skipped; `trackEngagement()` for submitted (engagement counter increment + `time_to_first_engagement_ms` semantics).
