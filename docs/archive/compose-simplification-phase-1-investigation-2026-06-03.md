# Compose simplification Phase 1 — investigation — 2026-06-03

Investigation findings before implementing Phase 1 of compose flow simplification: replace morning/afternoon/evening/late_night time blocks with a single start-time pill picker (5pm–9pm), and reduce budget options to three. No code change yet — surfacing decisions before implementation.

## 1. Files touching `time_block` / `timeBlock` / `TimeBlock` (24 files)

### Source code (15)
- [src/types/index.ts](../src/types/index.ts) — `QuestionnaireAnswers.timeBlock`, `GenerateRequestBody`, re-exports `TimeBlock`
- [src/lib/itinerary/time-blocks.ts](../src/lib/itinerary/time-blocks.ts) — canonical `TimeBlock` type + `TIME_BLOCKS` table + `resolveTimeWindow`, `isSlotInBlock`, `effectiveBlocksForDay`, `venueOpenForBlock`, `blockCoverageFraction`, `ROLE_CENTERS`, `getTypicalTimeForRole`, `pickRecommendedSlots`, `formatBlockChipLabel`, `DEFAULT_TIME_BLOCK`
- [src/lib/itinerary/availability-enrichment.ts](../src/lib/itinerary/availability-enrichment.ts) — passes `timeBlock` to `isSlotInBlock` for Resy slot filtering
- [src/lib/scoring.ts](../src/lib/scoring.ts) — `timeBlock` param threaded through `scoreVenue` + `pickBestForRole`; calls `blockCoverageFraction`
- [src/lib/composer.ts](../src/lib/composer.ts) — `timeBlock` threaded through `composeItinerary`
- [src/lib/sharing.ts](../src/lib/sharing.ts) — encodes/decodes `timeBlock` in URL params
- [src/lib/itinerary/seed.ts](../src/lib/itinerary/seed.ts) — hashes `timeBlock` into the seed (deterministic generation)
- [src/app/api/generate/route.ts](../src/app/api/generate/route.ts) — reads `body.timeBlock`, resolves to startTime/endTime, filters venues via `venueOpenForBlock`
- [src/app/api/swap-stop/route.ts](../src/app/api/swap-stop/route.ts) — uses `inputs.timeBlock`
- [src/app/api/share/route.ts](../src/app/api/share/route.ts) — reads `itinerary.inputs.timeBlock` to save
- [src/app/api/health/route.ts](../src/app/api/health/route.ts) — hardcodes `timeBlock: "evening"` for the smoke generation
- `src/app/itinerary/page.tsx`, `saved/[id]/page.tsx`, `share/[id]/page.tsx` — pass `inputs.timeBlock` to ItineraryView
- [src/components/itinerary/CompositionHeader.tsx](../src/components/itinerary/CompositionHeader.tsx) — reads `inputs?.timeBlock` to render the time chip label
- [src/components/itinerary/StopAvailability.tsx](../src/components/itinerary/StopAvailability.tsx) — uses `timeBlock` for `pickRecommendedSlots` (Resy slot centering)
- [src/components/itinerary/ItineraryView.tsx](../src/components/itinerary/ItineraryView.tsx) — forwards `timeBlock` prop to children
- [src/components/itinerary/ActionBar.tsx](../src/components/itinerary/ActionBar.tsx) — analytics events include `timeBlock`
- [src/components/questionnaire/WhenStep.tsx](../src/components/questionnaire/WhenStep.tsx) — UI for picking the block
- [src/components/questionnaire/QuestionnaireShell.tsx](../src/components/questionnaire/QuestionnaireShell.tsx) — `handleWhenContinue(day, timeBlock)` callback
- [src/components/questionnaire/StepLoading.tsx](../src/components/questionnaire/StepLoading.tsx) — `timeBlocks?: string[]` prop (unused; can be removed)
- [src/config/options.ts](../src/config/options.ts) — references the "when" step config

### Tests (3)
- [tests/unit/time-blocks.test.ts](../tests/unit/time-blocks.test.ts) — pins canonical block IDs + ranges
- [tests/unit/venue-pool.test.ts](../tests/unit/venue-pool.test.ts) — `venueOpenForBlock` tests
- [tests/unit/scoring.test.ts](../tests/unit/scoring.test.ts) — passes `timeBlock` into scoring tests

### DB schema (3 migrations)
- `supabase/migrations/20260426_add_time_block.sql` — adds `time_block` column to `composer_saved_itineraries`
- `supabase/migrations/20260427_drop_duration_column.sql` — references the column
- `supabase/migrations/20260428_composer_venues_v2.sql` — defines `time_blocks`, `mon_blocks`…`sun_blocks` on the venues table

### "morning" / "afternoon" / "late_night" literal references
Only in: `time-blocks.ts` (canonical), `types/index.ts` (re-export comment), the two tests, and `src/config/generated/vibes.ts` (unrelated — vibe scoring tag).

## 2. Current input/answers types

[src/types/index.ts:91-111](../src/types/index.ts#L91):

```ts
export interface QuestionnaireAnswers {
  occasion: OccasionBucket;
  neighborhoods: Neighborhood[];
  budget: Budget;
  vibe: Vibe;
  day: string;                  // ISO date "2026-04-09"
  timeBlock: TimeBlock;         // "morning" | "afternoon" | "evening" | "late_night"
  startTime: string;            // "17:00" — resolved server-side from timeBlock
  endTime: string;              // "22:00" — resolved server-side from timeBlock
}

export type GenerateRequestBody = Omit<
  QuestionnaireAnswers, "startTime" | "endTime"
> & { excludeVenueIds?: string[] };
```

**Important: `startTime`/`endTime` already exist on `QuestionnaireAnswers`** — populated server-side from `timeBlock` in `/api/generate`. The Gemini prompt at [src/config/prompts.ts:65-66](../src/config/prompts.ts#L65) **already reads `startTime`/`endTime`**, not `timeBlock`. The prompt needs zero changes.

## 3. `resolveTimeWindow` + end_time proposal

Current ([src/lib/itinerary/time-blocks.ts:313-322](../src/lib/itinerary/time-blocks.ts#L313)):

```ts
export function resolveTimeWindow(timeBlock: TimeBlock): {
  startTime: string;
  endTime: string;
} {
  const meta = getBlockMetadata(timeBlock);
  return { startTime: meta.range.start, endTime: meta.range.end };
}
```

**Proposed: `end_time = start_time + 5 hours, capped at 02:00`.** Traced for the five values:

| start_time | naive +5h | capped end | overlaps which blocks |
|---|---|---|---|
| 17:00 | 22:00 | 22:00 | evening (17–22) |
| 18:00 | 23:00 | 23:00 | evening + late_night |
| 19:00 | 00:00 | 00:00 | evening + late_night |
| 20:00 | 01:00 | 01:00 | evening + late_night |
| 21:00 | 02:00 | 02:00 | evening + late_night |

**The 5-hour cap is fine; all 5 starts produce a meaningful evening/late-night window.** One tweak suggestion: phrase as "5-hour window, wrapping past midnight" instead of "capped at 02:00." Numeric output identical (21:00+5h = 02:00 hits the cap exactly), but the wrap-handling code is cleaner — `addHoursWithWrap(start, 5)` matches the existing `start > end` semantics already used by `isSlotInBlock` for late_night.

## 4. Venue filtering today

Two paths use the venue's `*_blocks` columns:

### Path A — hard filter at [src/app/api/generate/route.ts:227-230](../src/app/api/generate/route.ts#L227)
```ts
venues = venues.filter((v) => venueOpenForBlock(v, dayColumn, body.timeBlock));
```
Calls [`venueOpenForBlock`](../src/lib/itinerary/time-blocks.ts#L176) → `effectiveBlocksForDay` (hybrid per-day/global rule) → `blocks.includes(timeBlock)`. Today: "is `evening` in the venue's effective block set for that day?"

### Path B — scoring signal at [src/lib/scoring.ts:118](../src/lib/scoring.ts#L118)
```ts
score += blockCoverageFraction(venue, dayColumn, timeBlock) * W.timeRelevance;
```
Returns 1.0 / 0.5 / 0.0 based on whether the block appears in both/either/neither of `time_blocks` and `<day>_blocks`.

### Proposed new check
Replace `venueOpenForBlock(v, dayColumn, timeBlock)` with `venueOpenForWindow(v, dayColumn, startTime, endTime)`. The new helper:
1. Resolves effective blocks for the day (existing hybrid logic, unchanged)
2. For each effective block, look up its `[blockStart, blockEnd]` range from `TIME_BLOCKS`
3. Return true if ANY block range overlaps the user's `[startTime, endTime]`

Same applies to `blockCoverageFraction` → `windowCoverageFraction`. Same `1.0 / 0.5 / 0.0` scoring tiers but over window overlap rather than single-block match.

For all five Phase 1 start times this is effectively "is the venue open in evening OR late_night?" — venues open in only morning/afternoon will fail the filter (correct behavior; we're an evening planner).

## 5. Copy / prompt references to time blocks

**Gemini prompt** ([src/config/prompts.ts](../src/config/prompts.ts)): already uses `startTime`/`endTime`, NOT `timeBlock`. The prompt mentions "evening" twice in `OCCASION_BUCKET_TO_GEMINI_FRAMING` (lines 84, 86: `"an evening for two…"`, `"a solo evening…"`) — stylistic, not coupled to block IDs. Per user guidance, fine to leave.

**`CompositionHeader.tsx` line 38-39**: renders `getBlockMetadata(inputs.timeBlock).label` as a chip ("Evening · 5p–10p"). If `timeBlock` is removed from the inputs type, this needs to switch to formatting from `startTime`/`endTime` directly — e.g., "5 PM – 10 PM" or just "Starts 7 PM."

**`StopAvailability.tsx`**: uses `timeBlock` for `pickRecommendedSlots`'s role centers (e.g., "evening main = 19:30"). With windowed input, these need to either:
- (a) Stay keyed by a derived "primary block" for Phase 1 (all evening, easy), or
- (b) Become start-time-aware ("for start_time=19:00, opener=19:00, main=20:00, closer=21:30")

Option (b) is the better long-term play but adds scope. Option (a) is one line: hardcode `"evening"` as the recommendation block for now.

**`StepLoading.tsx`**: takes a `timeBlocks?: string[]` prop that's never read. Dead — can be removed.

**`ItineraryView.tsx`, `ActionBar.tsx`, saved/share pages**: all forward `inputs.timeBlock`. If we keep `timeBlock` in the inputs response (computed server-side), no change needed. If we strip it, these all switch to forwarding `startTime`/`endTime` directly.

## Important findings worth flagging before greenlight

### Budget terminology mismatch

User spec says "remove the variety and no_pref pills" for the budget step. The actual budget set (from [src/config/generated/budgets.ts](../src/config/generated/budgets.ts) + [src/config/budgets.ts](../src/config/budgets.ts)) is:

`casual` / `nice_out` / `splurge` / `all_out` / `no_preference`

**There is no `variety` budget. "variety" is a vibe label** (the display label for `mix_it_up` vibe). Reading user intent as **"remove `all_out` and `no_preference` from budget"** so the final set is `casual` / `nice_out` / `splurge`. Confirm.

### The TimeBlock concept is dual-purpose

`TimeBlock` is BOTH:
- A user-facing input (the four-pill picker being removed), AND
- A venue-data representation (the values stored in `time_blocks` / `mon_blocks` / etc.)

`TimeBlock` cannot be fully removed from the codebase — it's how venues advertise their open hours. The realistic refactor is:
- **Remove `timeBlock` from `QuestionnaireAnswers`** (user input narrows to `startTime` + derived `endTime`)
- **Keep `TimeBlock` as the venue-side type** (used inside `time-blocks.ts`, scoring, availability filtering)
- **Translate at the boundary**: the algorithm derives "which TimeBlocks does the user's window overlap?" and uses those for venue filtering.

### Saved itinerary backward compat

`composer_saved_itineraries.time_block` column still has old values (`morning`/`afternoon`/`late_night`/`evening`). [src/app/itinerary/saved/[id]/page.tsx:78-79](../src/app/itinerary/saved/[id]/page.tsx#L78) reads it with `(saved.time_block as TimeBlock) ?? "evening"` and computes startTime/endTime from it.

Per spec H ("don't migrate them"), this code path needs to either:
- (a) Keep deriving `startTime` from the saved `time_block` value (defensive fallback for old data)
- (b) Default the resurrected `startTime` to `"19:00"` (mid-evening) for any saved itinerary, ignoring the saved block

Recommendation: (a) — `morning → 09:00`, `afternoon → 13:00`, `evening → 19:00`, `late_night → 22:00`. Map and move on. Old saved itineraries still render with sensible times.

### Sharing URLs

[src/lib/sharing.ts](../src/lib/sharing.ts) encodes `timeBlock` into URL params and validates against `BLOCK_IDS`. After the refactor, share links need to carry `startTime` instead. Old share URLs (`?timeBlock=evening`) would need a backward-compat decoder.

### Scope estimate

Bigger than the framing suggests. Honest count:
- **15 source files** need changes
- **3 test files** need updates (the `time-blocks.test.ts` and `venue-pool.test.ts` are testing the OLD `venueOpenForBlock` API)
- **1 new schema migration** isn't required (the saved column stays, we just stop writing it from new generations)
- **1 helper rewrite** (`venueOpenForBlock` → `venueOpenForWindow`, plus `blockCoverageFraction` → `windowCoverageFraction`)
- **`pickRecommendedSlots`** in `time-blocks.ts` and its `ROLE_CENTERS` table needs window-aware adjustment OR a "Phase 1 hardcode evening" defer

Doable in one commit but it's not small.

## 5 decisions needed before implementation

1. **Final budget set** = `casual` / `nice_out` / `splurge` (drop `all_out` and `no_preference`)? Or different?
2. **Path**: remove `timeBlock` from `QuestionnaireAnswers`, keep `TimeBlock` as venue-side internal type (recommended)?
3. **Saved itinerary fallback**: derive `startTime` from saved `time_block` (recommended) or hardcode `"19:00"`?
4. **`pickRecommendedSlots` role centers**: Phase 1 hardcode (`"evening"` keyed) OR refactor to be start-time-aware now?
5. **Share-URL backward compat**: accept old `?timeBlock=...` links and translate, or break them (they're rarely shared)?

## Drafted commit message (when implementation lands)

```
feat(compose): start time pills replace time blocks, three-budget set, simplify for evening-only
```

## Status

Awaiting greenlight on the 5 decisions above before any code change.
