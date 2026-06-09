# Compose Simplification — Phase 1 Implementation Report

**Date:** 2026-06-09
**Branch:** `adit/sandbox-testing`
**Status:** Implementation complete; verification green; awaiting review/commit
**Investigation doc:** [docs/archive/compose-simplification-phase-1-investigation-2026-06-03.md](archive/compose-simplification-phase-1-investigation-2026-06-03.md)

---

## Scope

Phase 1 of compose simplification: collapse the questionnaire's time-block picker into a single start-time pill, narrow the budget set to three tiers, and route everything through a unified `TimeWindow` primitive while keeping `TimeBlock` alive as the venue-side internal type.

The premise (from the investigation doc): users were being asked to think in vague "morning / afternoon / evening / late night" buckets when what they actually wanted to specify was a start time. The bucket abstraction also leaked everywhere — into scoring, availability, analytics, share URLs, and persistence — which made the algorithm rigid (a 9 PM start that wanted late-night spots was scored against the same block as a 5 PM start). Phase 1 fixes the input model without touching the venue-side block tagging.

---

## Locked decisions (recap)

1. **Budgets:** `casual` / `nice_out` / `splurge` only. `all_out` and `no_preference` removed from the picker. The wider `BudgetSlug` taxonomy stays intact in generated config so saved itineraries from older runs still parse.
2. **Boundary discipline:** `TimeBlock` is internal to the venue layer. It must not appear in `QuestionnaireAnswers` or `GenerateRequestBody`. The algorithm translates user `TimeWindow` ↔ venue `TimeBlock` via overlap.
3. **Saved itinerary back-compat:** Old rows carry `composer_saved_itineraries.time_block` (NOT NULL). Mapping: `morning → 09:00`, `afternoon → 13:00`, `evening → 19:00`, `late_night → 22:00`. Unknown/null → `19:00`.
4. **Slot recommendations:** `pickRecommendedSlots` hard-codes the `"evening"` role center in Phase 1. Phase 2 backlog: make the center start-time-aware.
5. **Share-URL back-compat:** Decoder accepts both `?startTime=…` (new) and `?timeBlock=…` (legacy), translating the latter via the same mapping as decision 3.

---

## Architecture changes

### New canonical primitives (`src/lib/itinerary/time-blocks.ts`)

```ts
export const COMPOSE_START_TIMES = ["17:00", "18:00", "19:00", "20:00", "21:00"] as const;
export type ComposeStartTime = (typeof COMPOSE_START_TIMES)[number];

export interface TimeWindow { startTime: string; endTime: string; }

export function resolveTimeWindow(startTime: string): TimeWindow;     // adds 5h, wraps past midnight
export function startTimeFromLegacyBlock(block: string | null): ComposeStartTime;
export function isComposeStartTime(value: unknown): value is ComposeStartTime;
export function venueOpenForWindow(venue, dayColumn, window): boolean;
export function windowCoverageFraction(venue, dayColumn, window): 1 | 0.5 | 0;
export function isSlotInWindow(slotTime: string, window): boolean;
export function formatStartTimeLabel(startTime: string): string;       // "5 PM"
export function formatWindowLabel(window: TimeWindow): string;         // "5 PM – 10 PM", "7 PM – Midnight"
```

Removed: `DEFAULT_TIME_BLOCK`, `isSlotInBlock`, `venueOpenForBlock`, `blockCoverageFraction`, `formatBlockChipLabel`. Kept (still used venue-side): `TimeBlock`, `TIME_BLOCKS`, `getBlockMetadata`, `effectiveBlocksForDay`, `dateToDayColumn`, `ROLE_CENTERS`, `pickRecommendedSlots`, `getTypicalTimeForRole`, `formatSlotTimeForDisplay`.

### Wrap-aware overlap

`doRangesOverlap` (internal helper inside `time-blocks.ts`) handles the midnight-wrap case by expanding both ranges onto a 48-hour timeline when `end ≤ start`, then doing standard interval overlap. The 48-hour expansion is symmetric — it also re-tests with one range shifted +24h to catch edges where only one range wraps relative to the other. This is what lets a 21:00 → 02:00 user window match a 22:00 → 02:00 `late_night` venue block correctly.

### Type-system boundary

```ts
// Before
QuestionnaireAnswers = { …, timeBlock: TimeBlock, startTime?: string, endTime?: string }

// After
ComposeStartTime = "17:00" | "18:00" | "19:00" | "20:00" | "21:00";
ComposeBudget = "casual" | "nice_out" | "splurge";

QuestionnaireAnswers = { …, budget: ComposeBudget, startTime: string, endTime?: string };
// (no timeBlock)

GenerateRequestBody = Omit<QuestionnaireAnswers, "endTime"> & { excludeVenueIds?: string[] };
// endTime is derived server-side from startTime via resolveTimeWindow
```

### API contract (`/api/generate`)

- Rejects legacy shape: `if ("timeBlock" in rawBody && !("startTime" in rawBody))` → `400` with explanatory message naming the five accepted start times.
- Validates new shape: `isComposeStartTime(rawBody.startTime)` → `400` if missing/invalid.
- Server resolves the window: `const window = resolveTimeWindow(body.startTime)`, then synthesizes `inputs: QuestionnaireAnswers` with the resolved `endTime`.

### Persistence

- `composer_saved_itineraries.time_block` (NOT NULL legacy column) is written as the **hard-coded string `"evening"`** by both `ActionBar.tsx` and `/api/share/route.ts`. The actual start/end are stored in `stops` and `walking` JSON blobs already; the legacy column is preserved only because dropping NOT NULL hasn't shipped yet.
- Saved-page hydration reads `saved.time_block`, runs it through `startTimeFromLegacyBlock`, then resolves the window. So a row written today (`"evening"`) round-trips to a 19:00 start; rows from old generations with `"afternoon"` round-trip to 13:00.

### Share URLs

- **Encode** writes `?startTime=…` only.
- **Decode** prefers `startTime`; falls back to `timeBlock` translated via `startTimeFromLegacyBlock`. Validation gate: a *fresh* `startTime` value must satisfy `isComposeStartTime`; a value derived from a legacy `timeBlock` skips that gate (since the legacy mapping can yield `09:00` or `13:00` which aren't in `COMPOSE_START_TIMES`).

---

## Scenarios verified

| # | Trigger | Resolved window | Venue admissions |
|---|---|---|---|
| 1 | Fresh compose, startTime=17:00 | 17:00 → 22:00 | Evening block (full overlap); morning/late_night drop |
| 2 | Fresh compose, startTime=21:00 | 21:00 → 02:00 (wrap) | Evening (21–22 slice) + late_night (full overlap) |
| 3 | Saved row, time_block=afternoon | 13:00 → 18:00 | Afternoon-leaning; renders without crash |
| 4 | `?timeBlock=evening` share URL | 19:00 → 00:00 (wrap) | Evening + late_night |
| 5 | POST `/api/generate` w/ legacy timeBlock | n/a — 400 | Reject with explicit message |

---

## Verification — actual outputs

```
$ npx tsc --noEmit
(clean)

$ npm run lint
✖ 4 problems (0 errors, 4 warnings)   # all pre-existing
  src/components/onboarding/OnboardingFlow.tsx — NeighborhoodPicker unused, setFavoriteHoods unused
  src/components/ui/StopCard.tsx — <img> instead of <Image>
  src/components/venue/VenueDetailModal.tsx — <img> instead of <Image>

$ npm test
Test Files  8 passed (8)
     Tests  145 passed (145)         # was 138 — net +7 from window primitives
  ✓ tests/unit/time-blocks.test.ts (55 tests)    # rewritten
  ✓ tests/unit/venue-pool.test.ts (20 tests)     # rewritten
  ✓ tests/unit/scoring.test.ts (18 tests)        # one-line edit to BASE_ANSWERS

$ npm run build
(success — all 16 routes compiled; no errors)
```

---

## Files changed (26)

### Types & canonical helpers
- `src/types/index.ts` — `ComposeBudget` added; `timeBlock` removed from `QuestionnaireAnswers`; `GenerateRequestBody` redefined
- `src/lib/itinerary/time-blocks.ts` — window primitives added; block-side helpers retained but no longer exported for input use
- `src/lib/itinerary/seed.ts` — FNV-1a hash inputs swap `timeBlock → startTime`
- `src/lib/itinerary/availability-enrichment.ts` — `TimeBlock → TimeWindow` throughout

### Algorithm
- `src/lib/scoring.ts` — `window: TimeWindow | null` replaces `timeBlock`
- `src/lib/composer.ts` — window threaded through `pickBestForRole`

### Persistence & share
- `src/lib/sharing.ts` — encode `startTime`; decode either
- `src/lib/analytics.ts` — `COMPOSE_START_TIME_SELECTED` event added

### Config
- `src/config/budgets.ts` — `COMPOSE_BUDGET_SLUGS` constant; `BUDGETS` filtered to the three tiers

### API routes
- `src/app/api/generate/route.ts` — legacy-shape 400; `resolveTimeWindow`; `venueOpenForWindow`; analytics emit `start_time`/`end_time`
- `src/app/api/swap-stop/route.ts` — pass window through
- `src/app/api/share/route.ts` — hard-coded `time_block: "evening"` on insert
- `src/app/api/health/route.ts` — `SCORING_TEST_INPUT` uses start/end

### Pages
- `src/app/itinerary/page.tsx` — analytics `start_time`; no `timeBlock` prop
- `src/app/itinerary/saved/[id]/page.tsx` — `startTimeFromLegacyBlock` → `resolveTimeWindow`
- `src/app/itinerary/share/[id]/page.tsx` — drop `timeBlock` prop

### Components
- `src/components/itinerary/CompositionHeader.tsx` — `formatWindowLabel` chip
- `src/components/itinerary/ItineraryView.tsx` — drop `timeBlock` prop
- `src/components/itinerary/StopAvailability.tsx` — hardcode `RECOMMENDATION_BLOCK = "evening"`
- `src/components/itinerary/ActionBar.tsx` — hard-coded `time_block: "evening"`; analytics `start_time`
- `src/components/questionnaire/WhenStep.tsx` — five start-time pills; `ComposeStartTime`
- `src/components/questionnaire/QuestionnaireShell.tsx` — `handleWhenContinue(day, startTime)`; analytics `start_time`
- `src/components/questionnaire/StepLoading.tsx` — drop unused `timeBlocks?: string[]` prop

### Tests
- `tests/unit/time-blocks.test.ts` — rewritten for window primitives (55 cases)
- `tests/unit/venue-pool.test.ts` — `venueOpenForBlock → venueOpenForWindow` (20 cases)
- `tests/unit/scoring.test.ts` — one-line edit removing `timeBlock` from `BASE_ANSWERS`

---

## Drafted commit message

```
feat(compose): start time pills replace time blocks, three-budget set, simplify for evening-only
```

One unified commit — typecheck would break mid-history if split. The boundary moves atomically across UI, types, algorithm, persistence, and tests.

---

## Phase 2 backlog (not in this change)

- `pickRecommendedSlots` should accept a `TimeWindow` directly instead of hard-coding the `"evening"` role center. Today this means a 21:00-start late-night plan gets the same suggested slot times as a 17:00-start dinner plan, which understates the lateness.
- Drop `composer_saved_itineraries.time_block` NOT NULL once enough time has passed since the column was effectively frozen at `"evening"`. Tracker: same 90-day cadence as the `composer_users.context` drop noted in CLAUDE.md.
- Reconsider the `"evening"` write to legacy `time_block` on insert — it's noise. Could instead derive the column from `startTime` via the inverse of `startTimeFromLegacyBlock` (17:00→evening, 21:00→late_night, etc.). Low-priority cleanup.

---

## Open considerations for review

1. **Window length is hard-coded at 5 hours.** This came from the investigation doc. If founders want shorter windows for tighter scoring, it's a one-line change in `resolveTimeWindow`. The 5-hour wrap is what makes 21:00 starts pick up `late_night` venues (which begin at 22:00).
2. **End-exclusive overlap means 17:00 windows don't admit `afternoon`-tagged-only spots** (afternoon ends at 17:00). That's deliberate — the inverse would mean a 5 PM dinner reservation matches a venue that closes for the day at 5 PM. Worth confirming the venue-data side is tagged accordingly; the investigation doc's spot-check said yes.
3. **No `endTime` user override.** Phase 1 always derives end from start. If a user wants a 3-hour night out, they can't say so. Phase 2 territory if it comes up.
