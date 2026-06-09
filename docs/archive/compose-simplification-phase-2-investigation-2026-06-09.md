# Compose Simplification — Phase 2 Investigation

**Date:** 2026-06-09
**Branch:** `adit/sandbox-testing`
**Status:** Investigation complete; awaiting greenlight + decisions on 7 open questions
**Phase 1 docs:** [compose-simplification-phase-1-fidelity-fix-implementation-2026-06-09.md](compose-simplification-phase-1-fidelity-fix-implementation-2026-06-09.md), [archive/compose-simplification-phase-1-implementation-2026-06-09.md](archive/compose-simplification-phase-1-implementation-2026-06-09.md)
**Phase 3 docs:** [compose-simplification-phase-3-investigation-2026-06-09.md](compose-simplification-phase-3-investigation-2026-06-09.md)

---

## Scope

Phase 2 of compose simplification: shift the composition algorithm to a **2-stop default** with a new role structure.

- **Stop 1:** opener OR closer tagged venue (interchangeable pool, both eligible)
- **Stop 2:** always main
- **Stop 3 (when user taps + Add another stop):** opener OR closer tagged venue, excluding stop 1's venue

No vibe-conditional branching. Same shape for every itinerary regardless of vibe. Vibe still influences scoring (venue selection), but not the structural shape.

Plus three Phase-1 deferred items get cleared:
- Start-time-aware role centers (replaces the `RECOMMENDATION_BLOCK = "evening"` hardcode in StopAvailability)
- Single-stop fallback as the new recovery state (was 3 → 2 → 1; now 2 → 1)
- Two new analytics events for fallback + add-stop extension

---

## 1. Composition algorithm — how role assignment works today

Template-driven, **not** role-first iteration. See [src/lib/composer.ts:94-172](../src/lib/composer.ts#L94-L172):

1. `planStopMix(answers, random)` ([composer.ts:53-69](../src/lib/composer.ts#L53-L69)) picks a vibe-specific template from [src/config/templates.ts](../src/config/templates.ts). Patterns are ordered largest→smallest; first whose time budget fits wins.
2. Pick **Main first** (no anchor — scored freely) via `pickBestForRole(venues, "main", …)`.
3. Walk the template in order; for each non-Main slot, pick the best venue **anchored to Main** for proximity.
4. Each template slot can carry a `venueRoleHint` — biases toward specific venue types (e.g., `drinks` for a `drinks_led` opener) but falls back if hinted pool is empty.

**"3 stops" is NOT a hardcoded literal anywhere structural.** It emerges from the templates. Each vibe has 3 patterns (4-stop, 3-stop, 2-stop) ordered largest first. The pathological fallback is already a 2-stop `[{role: "opener"}, {role: "main"}]`.

Role-pool filtering uses `venue.stop_roles` (TEXT[] column on `composer_venues_v2`). `venueMatchesRole(venue, role)` in [scoring.ts:54-58](../src/lib/scoring.ts#L54-L58) maps raw venue roles through `ROLE_EXPANSION`:

```ts
opener:   ["opener"]
main:     ["main"]
closer:   ["closer"]
drinks:   ["opener", "closer"]   // ← already serves both canonical roles
activity: ["opener"]
coffee:   ["opener"]
```

## 2. Venue role tagging — live DB counts

`composer_venues_v2.stop_roles` is a TEXT[]. **Non-exclusive** — a venue can carry multiple roles. 48 venues do today.

Queried just now via the service-role client, `active=true`:

| Raw role | Count |
|---|---|
| main | 439 |
| drinks | 197 |
| coffee | 161 |
| activity | 141 |
| closer | 61 |
| opener | 49 |

Venues serving **BOTH** opener AND closer canonically (after `ROLE_EXPANSION`): **202**

**STOP_1_POOL feasibility:** after dedup, ~600 distinct venues are eligible for the new stop 1 pool (canonical opener OR closer). Pool is comfortably populated — no scarcity risk.

## 3. Plan_b logic

[composer.ts:160](../src/lib/composer.ts#L160):

```ts
const planB = scored.find((v) => v.id !== best.id) ?? null;
```

Plan_b is the next-best from the **same role-filtered candidate set** that was scored for `best`. So today's "closer's plan_b" is already "another closer-eligible venue" by construction.

**Implication for the new structure:** if stop 1's scored list comes from a UNION pool (opener OR closer), then `scored.find(v => v.id !== best.id)` automatically yields "another opener-or-closer venue." No special logic needed beyond passing the union role set into `pickBestForRole`.

**One catch:** Main's plan_b is hardcoded `null` ([composer.ts:135](../src/lib/composer.ts#L135)) because Main is `is_fixed: true`. New spec wants stop 2 (main) to carry plan_b. One-line composer change.

## 4. Role centers & `pickRecommendedSlots`

[src/lib/itinerary/time-blocks.ts:379-450](../src/lib/itinerary/time-blocks.ts#L379-L450):

```ts
const ROLE_CENTERS: Partial<Record<TimeBlock, Partial<Record<StopRole, string>>>> = {
  evening:    { opener: "18:00", main: "19:30", closer: "21:00" },
  afternoon:  { opener: "13:00", main: "14:00", closer: "15:30" },
  morning:    { opener: "09:00", main: "10:00", closer: "11:00" },
  late_night: { opener: "22:30", main: "23:00", closer: "23:30" },
};

export function pickRecommendedSlots(
  slots: AvailabilitySlot[],
  role: StopRole,
  block: TimeBlock,  // ← Phase 1 callers hardcode "evening"
  count = 4,
): AvailabilitySlot[] { … }
```

Keyed by `(TimeBlock, StopRole)` — categorical × role. Phase 1 callers pass `block = "evening"` literally.

**Proposed refactor — drop `ROLE_CENTERS` entirely, replace with stop-index-based helper:**

```ts
export function getStopCenterTime(stopIndex: number, startTime: string): string {
  // Stop 0 (UI stop 1):  center at startTime
  // Stop 1 (UI stop 2/main): center at startTime + 1.5h
  // Stop 2+ (added stops):   center at startTime + 3h
  const offsetMin = stopIndex === 0 ? 0 : stopIndex === 1 ? 90 : 180;
  return addMinutesWithWrap(startTime, offsetMin);
}

export function pickRecommendedSlots(
  slots: AvailabilitySlot[],
  stopIndex: number,
  startTime: string,
  count = 4,
): AvailabilitySlot[] { … }
```

Signature changes: `pickRecommendedSlots(slots, role, block)` → `pickRecommendedSlots(slots, stopIndex, startTime)`. Removes `ROLE_CENTERS`, `getTypicalTimeForRole`, the `block` param, and the `role` param. All callers update — primarily [StopAvailability.tsx](../src/components/itinerary/StopAvailability.tsx).

## 5. Walking constraints

[generate/route.ts:85-102](../src/app/api/generate/route.ts#L85-L102):

```ts
function computeWalkingMeta(walks: WalkSegment[], weather: WeatherInfo | null): WalkingMeta {
  const cap = weather?.is_bad_weather ? walkSoftCapMinBadWeather : walkSoftCapMin;
  if (walks.length === 0) {
    return { longest_walk_min: 0, total_walk_min: 0, any_over_cap: false, cap_min: cap };
  }
  const minutes = walks.map((w) => w.walk_minutes);
  return {
    longest_walk_min: Math.max(...minutes),
    total_walk_min:   minutes.reduce((s, m) => s + m, 0),
    any_over_cap:     minutes.some((m) => m > cap),
    cap_min:          cap,
  };
}
```

Already safe for any walk count. With 1 walk: `longest === total === that one segment`. With 0 walks (single-stop fallback): hardcoded zeros. **No division-by-(n-1). No edge cases for 2-stop or 1-stop.**

`maxWalkKmNormal = 1.5km` / `maxWalkKmBadWeather = 0.4km` ([algorithm.ts:310,318](../src/config/algorithm.ts#L310)) — same Main-anchored proximity rules apply.

## 6. Budget total ranges

[generate/route.ts:386](../src/app/api/generate/route.ts#L386):

```ts
const totalRange = calculateTotalSpend(stops.map((s) => s.venue.price_tier ?? 2));
```

Derives from `stops.length`. **Already correct — no hardcoded 3.** Same in [saved-hydration.ts:36](../src/lib/itinerary/saved-hydration.ts#L36) and CompositionHeader consumes `header.estimated_total` (a precomputed string). `calculateTotalSpend` is already stop-count-agnostic.

## 7. Gemini prompts

[src/config/prompts.ts](../src/config/prompts.ts):

- Body uses `Venues (${venues.length} stops):` — dynamic, no hardcoded 3.
- System prompt has anti-pattern blacklist including `"kick things off"`, `"cap off the night"`, `"round out the evening"` — **already discourages 3-stop framing.**
- Title examples mix 2-stop and 3-stop:
  - `"Pasta and a nightcap"` ← 2-stop ✓
  - `"West Village, slow"` ← neutral ✓
  - `"Drinks, dinner, drinks"` ← implies 3 ✗ (should swap)
- Subtitle example: `"Cocktails at Attaboy, then cacio e pepe at Via Carota."` — already 2-stop ✓

`CompositionHeader.tsx` ([line 27-105](../src/components/itinerary/CompositionHeader.tsx#L27-L105)) — no stop-count references. Header derives weather/occasion/vibe/budget purely from the response.

## 8. Add-stop affordance

**Button:** [ItineraryView.tsx:199-213](../src/components/itinerary/ItineraryView.tsx#L199-L213). Copy: `"+ Add another stop"` / `"Finding another spot…"`. Triggered via `onAddStop` prop.

**Handler:** `/api/add-stop` route ([app/api/add-stop/route.ts](../src/app/api/add-stop/route.ts)). Current behavior:
- **Always picks role `"closer"`** ([line 87](../src/app/api/add-stop/route.ts#L87))
- Anchors proximity to the **last stop** ([line 91](../src/app/api/add-stop/route.ts#L91))
- Excludes every venue + plan_b from current stops
- Returns the new stop + walk segment

**New-model changes:**
- "Always closer" → pick from STOP_1_POOL (opener OR closer canonical)
- "Anchor to last stop" → anchor to Main (with 2 existing stops the last IS Main, so the practical result is the same — but the logic must explicitly anchor to Main for clarity and stop-ordering safety)
- Exclude-list already includes stop 1 (current code adds all current stops to `usedIds`) ✓
- `stop_role` on the new stop currently hardcoded to `"closer"` → must derive from the picked venue's canonical role (opener or closer)

**No client-side change needed** — `onAddStop` payload is unchanged. Logic change is contained in `/api/add-stop`.

## 9. Stop count constants

**No `STOP_COUNT` constant exists.** Stop count emerges from `planStopMix` returning a variable-length `StopPattern`. Only `"3 stops"` literal:

- [algorithm.ts:284](../src/config/algorithm.ts#L284) — a comment ("a 3-stop plan that budgets…"). Documentation only.

Plumbing: composer returns `stops: ItineraryStop[]`; API serializes; client reads `itinerary.stops`. Analytics events use `stops.length` (no hardcoded 3).

**Add `STOP_DEFAULT_COUNT = 2`** in `algorithm.ts` or `composer.ts` to document the new default. Useful as `requested_stop_count` in the new analytics events.

## 10. RECOMMENDATION_BLOCK hardcode

[src/components/itinerary/StopAvailability.tsx:24](../src/components/itinerary/StopAvailability.tsx#L24):

```ts
const RECOMMENDATION_BLOCK = "evening" as const;
// …
const recommended = pickRecommendedSlots(deduped, role, RECOMMENDATION_BLOCK);
```

After refactor: `StopAvailabilitySection` (and `HasSlotsView`) need `stopIndex` and `startTime` props. Pass-down chain: `ItineraryView` already has `date={inputs.day}` — easy to add `startTime={inputs.startTime}` and pass `stopIndex={i}` from the map iteration.

---

## Cross-cutting collisions

These are the places where the new structure runs into existing assumptions:

### A — Vibe templates become near-vestigial

[src/config/templates.ts](../src/config/templates.ts) defines vibe-specific patterns (lists of 4/3/2-stop alternatives). After Phase 2, every vibe collapses to a single 2-stop pattern. Vibes still need to carry `venueRoleHint` for stop 1 (e.g. `drinks_led` hints `drinks`, `activity_food` hints `activity`). Proposed replacement:

```ts
const VIBE_STOP_1_HINTS: Record<VibeSlug, VenueRole | null> = {
  food_forward:  null,         // no specific hint
  drinks_led:    "drinks",     // bias toward drinks-tagged venues
  activity_food: "activity",   // bias toward activity-tagged venues
  mix_it_up:     null,         // random concrete vibe at runtime
};
```

`planStopMix` collapses to a one-liner. `getTemplatesForVibe` can be deleted.

### B — `pickBestForRole` accepts a single `StopRole`

The new STOP_1_POOL is a union (`["opener", "closer"]`). Cleanest path: widen `role` param to `StopRole | readonly StopRole[]` and adapt `venueMatchesRole(v, role)` accordingly. Most call sites pass a single role and need no change; only the new stop-1 composer call passes an array.

Alternative: add a separate `pickBestForStop1Pool(…)` helper. More code; less elegant.

### C — Stop 1's `role` field on the persisted stop

`ItineraryStop.role: StopRole` must end up as `"opener"` or `"closer"` after stop 1 is picked. Proposed disambiguation:
- If picked venue's `stop_roles` (post-expansion) includes `"opener"`, assign `"opener"`
- Else assign `"closer"`

A `drinks`-tagged venue → `"opener"` (chronologically natural for stop 1). A pure `closer`-tagged venue → `"closer"`. Display label (`ROLE_LABELS`) renders "Start here" or "Nightcap" accordingly.

### D — Add-stop derives role from the picked venue

Same disambiguation logic as C. The new `itinerary_extended_to_three` event takes `added_role` as a property — that's the disambiguated canonical role.

### E — Main's plan_b is null

Today main has no plan_b. Spec wants it. One-line composer change — pass `scored.find(v => v.id !== best.id) ?? null` instead of literal `null` when constructing the main stop.

### F — `applyEndTimeBuffer` truncation behavior

The end-time buffer ([generate/route.ts:45-83](../src/app/api/generate/route.ts#L45-L83)) drops trailing stops that would start within `lastStartBufferMin` (30 min) of `endTime`. With a 2-stop layout in a 5-hour window, stop 2 starts at ~1.5h after start, well before the buffer — virtually never trips. With a 3-stop add-stop, it might trip on the added stop. That's semantically fine (user added it; if it doesn't fit, drop it).

**Important:** fire `itinerary_fallback_single_stop` ONLY on the generate path, not on add-stop truncation. The add-stop user-initiated extension has its own failure event (`add-stop returns 404`).

---

## Open design questions awaiting greenlight

1. **`pickBestForRole` signature** — widen `role` to `StopRole | readonly StopRole[]` (recommended), or add a new `pickBestForStop1Pool` helper?
2. **Stop 1 canonical role disambiguation** — if picked venue serves both opener and closer, default to `"opener"` (chronologically natural, recommended) or `"closer"`?
3. **`VIBE_TEMPLATES`** — fully delete and replace with the simpler `VIBE_STOP_1_HINTS` (recommended), or keep templates as a thin shim?
4. **`ROLE_CENTERS` / `getTypicalTimeForRole`** — fully delete (recommended, no non-itinerary callers exist), or keep one or both?
5. **Add-stop anchor** — Main (recommended for clarity) or last-stop-in-array (current behavior; identical result for 2-stop case)?
6. **Gemini title example** — replace `"Drinks, dinner, drinks"` with a 2-stop example like `"Cocktails, then dinner"` to nudge the model away from 3-stop coding?
7. **`itinerary_fallback_single_stop` reason taxonomy** — reuse `no_venues_match`/`timeout`/`api_error`/`unknown` from `itinerary_generation_failed`, or add fallback-specific reasons like `no_pairs_walkable`, `main_only_in_neighborhood`?

---

## Drafted commit message (for Part 2)

```
feat(compose): shift to 2-stop default; stop 1 opener-or-closer, stop 2 main; start-time-aware slots
```

---

## Notes for implementation

- Add `STOP_DEFAULT_COUNT = 2` to algorithm config or composer.ts. Use as `requested_stop_count` in analytics events.
- `STOP_1_POOL = ["opener", "closer"] as const` lives in `src/lib/composer.ts` (or `src/config/composition.ts` if we want a new module).
- New events to add in `src/lib/analytics.ts` EVENTS const:
  - `ITINERARY_FALLBACK_SINGLE_STOP: "itinerary_fallback_single_stop"`
  - `ITINERARY_EXTENDED_TO_THREE: "itinerary_extended_to_three"`
- `itinerary_generated` already carries `stop_count`, `start_time`, `end_time`, `vibe`, `neighborhoods` — add `requested_stop_count` for the new structure.
- The Phase 3 `EngagementProvider` already provides `viewedAt` semantics via `time_to_first_engagement_ms` on engagement events. For `itinerary_extended_to_three`, we can compute `time_since_viewed_ms` by tapping the same provider (or by sending null if not in the engagement context — though add-stop runs inside ItineraryView which IS inside the provider).
