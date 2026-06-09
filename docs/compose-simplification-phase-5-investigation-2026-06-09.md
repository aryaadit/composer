# Compose Simplification — Phase 5 Investigation

**Date:** 2026-06-09
**Branch:** `adit/sandbox-testing`
**Status:** Investigation complete; awaiting greenlight + decisions on 4 open questions
**Phase 1 doc:** [compose-simplification-phase-1-fidelity-fix-implementation-2026-06-09.md](compose-simplification-phase-1-fidelity-fix-implementation-2026-06-09.md)
**Phase 2 doc:** [compose-simplification-phase-2-investigation-2026-06-09.md](compose-simplification-phase-2-investigation-2026-06-09.md)
**Phase 3 doc:** [compose-simplification-phase-3-investigation-2026-06-09.md](compose-simplification-phase-3-investigation-2026-06-09.md)
**Phase 4 doc:** [compose-simplification-phase-4-investigation-2026-06-09.md](compose-simplification-phase-4-investigation-2026-06-09.md)

---

## Scope

Phase 5 fixes the saved-itineraries list to show high-signal information about **WHEN each plan is for**, instead of when it was saved. Plus splits the list into upcoming + past sections.

**Current row secondary line:** `[First venue name] · X stops · saved [save date]`
**Target row secondary line:** `[Day of itinerary] · [Start time] · [Neighborhood]`

---

## 1. Saved-list location

There's **no `src/app/saved/page.tsx` or `src/app/itinerary/saved/page.tsx` index page**. The saved-plans list is rendered in two places:

- [src/components/home/HomeScreen.tsx:117-127](../src/components/home/HomeScreen.tsx#L117-L127) — limited to 10 most recent via `useSavedPlans({userId, limit: 10})`.
- [src/app/profile/_components/SavedPlansList.tsx:32-44](../src/app/profile/_components/SavedPlansList.tsx#L32-L44) — all plans (no limit).

Both consume the shared `useSavedPlans` hook ([src/hooks/useSavedPlans.ts:30-58](../src/hooks/useSavedPlans.ts#L30-L58)) and render the same `SavedPlanRow` component. The hook queries `composer_saved_itineraries` ordered by `created_at DESC` (save time, not itinerary day).

**Phase 5 affects both consumers** — any change to row rendering touches both surfaces simultaneously via `SavedPlanRow`; grouping/sorting happens in each consumer (or via a shared helper).

## 2. Row component — the line we're replacing

[src/components/shared/SavedPlanRow.tsx:127-129](../src/components/shared/SavedPlanRow.tsx#L127-L129):

```tsx
<div className="font-sans text-xs text-muted mt-1">
  {firstStop?.venue?.name ?? "—"} · {stops.length} stops · saved {date}
</div>
```

Where:
- `firstStop` = `(plan.stops ?? [])[0]`
- `stops.length` from `plan.stops ?? []`
- `date` = `new Date(plan.created_at).toLocaleDateString("en-US", {month: "short", day: "numeric"})` — **save date, not itinerary day** (this is what we're fixing)

Spec replaces this entire line; drops firstStop and stop count.

## 3. Required data — all already on the row

[src/types/index.ts:282-298](../src/types/index.ts#L282-L298) `SavedItinerary`:

```ts
{
  day: string | null,
  start_time?: string | null,   // Phase 1 — populated on new saves, null on legacy
  time_block: string,             // Legacy NOT NULL ("evening" / "afternoon" / etc.)
  neighborhoods: string[] | null,
  custom_name: string | null,
  title: string | null,
  // ...
}
```

The hook already SELECTs `*` so every field is on every row. ✓

## 4. Legacy start_time fallback — helper to import

`startTimeFromLegacyBlock(timeBlock)` lives in [src/lib/itinerary/time-blocks.ts:128-142](../src/lib/itinerary/time-blocks.ts#L128-L142) (already used by Phase 1's `saved-hydration.ts`). Same import path: `@/lib/itinerary/time-blocks`. **Import directly — no duplication.**

For formatting the resolved start time: `formatStartTimeLabel("21:00")` → `"9 PM"` is also in `time-blocks.ts` (Phase 1). Matches spec format exactly.

## 5. Existing date helpers

[src/lib/dateUtils.ts](../src/lib/dateUtils.ts):

| Helper | Returns | Phase 5 use |
|---|---|---|
| `describeDay(dayISO)` | "tonight" / "tomorrow" / "Saturday" | Relative — not the format we want |
| `format12h(time24)` | "7pm" / "7:30pm" (lowercase, no space) | **Wrong format** — spec wants "9 PM" |
| `todayLocalISO()` | Local "YYYY-MM-DD" | Internal to `isPastDate` |
| `isPastDate(dayISO)` | True when **strictly before** today's local date | **Perfect for split** — today counts as upcoming |
| `formatPastDateLabel(dayISO)` | "Sunday, May 11" (long form) | Wrong format — need abbreviated |

### Gaps to fill

1. **No "Wed Jun 10" formatter** — add `formatShortDateLabel(dayISO)` next to `formatPastDateLabel`. Uses `weekday: "short", month: "short", day: "numeric"` plus conditional `year: "numeric"` when `dayYear !== currentYear`. Noon-anchored to dodge DST (same pattern as existing helpers).
2. **No past/upcoming split helper** — add `splitPlansByDate(plans)` returning `{upcoming, past}`. One-liner around `isPastDate`.
3. **`format12h` returns wrong format** — use `formatStartTimeLabel` from `time-blocks.ts` instead.

---

## Cross-cutting observations

### The hook orders by `created_at DESC` — leave it alone

`useSavedPlans` is also referenced indirectly by [src/lib/exclusions.ts](../src/lib/exclusions.ts) for the "venues seen recently" logic, which depends on most-recent-saved-first. **Don't change the hook's sort.** Do the grouping client-side in each consumer.

### Spec's "sort by day ASCENDING" — needs one clarification

Spec says "Sort itineraries by `day` ASCENDING (chronological, soonest first), NOT by save date." Reading literally: ASC for everything. But that means within the Past section, the oldest plan is at the top and the most-recently-past at the bottom — unusual UX (typical pattern: most-recent-past first within Past).

**My read:**
- **Upcoming:** ASC by `day` (soonest first) — matches spec
- **Past:** DESC by `day` (most recently past first) — UX-natural, slight spec interpretation

If you want both ASC literally per spec, flag it. Default to DESC within Past unless overridden.

### Edge cases the spec doesn't address

- **`day` is null/missing on a row.** `isPastDate(null)` returns `false`, so it lands in Upcoming. The new secondary line gracefully omits the missing date segment via the conditional-push approach.
- **`start_time` null AND `time_block` invalid.** `startTimeFromLegacyBlock` defaults to `"19:00"` in its switch's `default` branch ([time-blocks.ts:138-141](../src/lib/itinerary/time-blocks.ts#L138-L141)). `time_block` is NOT NULL in the schema, so this fallback always returns a valid string. **The spec's "omit time when both missing" branch becomes dead code unless we want stricter behavior.** Recommend: skip the branch and trust the helper.

### Where the split helper should live

- **(A)** In `src/lib/dateUtils.ts` next to `isPastDate`. Pros: discoverable, lightweight. Cons: dateUtils takes a `SavedItinerary` type-only import.
- **(B)** New `src/lib/savedPlans.ts` module. Pros: separation of concerns. Cons: extra file for one helper.

Recommend **(A)** — `splitPlansByDate` is conceptually a date-driven split. The `SavedItinerary` import is type-only, no runtime weight.

---

## Implementation plan (for Part 2)

1. **`src/lib/dateUtils.ts`** — add:
   - `formatShortDateLabel(dayISO)` — "Wed Jun 10" / "Wed Jun 10, 2027"
   - `splitPlansByDate(plans)` — `{upcoming, past}` with upcoming ASC, past DESC
2. **`src/components/shared/SavedPlanRow.tsx`** — replace the secondary `<div>` with the new format. Import `startTimeFromLegacyBlock` + `formatStartTimeLabel` from `time-blocks`, `neighborhoodLabel` from `config/neighborhoods`, `formatShortDateLabel` from `dateUtils`. Drop the `firstStop` venue name + stop count + save-date logic.
3. **`src/components/home/HomeScreen.tsx`** — split `savedPlans` via `splitPlansByDate`. Render Upcoming + Past sections with headers (using existing `font-sans text-xs tracking-widest uppercase text-muted` token already used for "Your plans"). Hide each section's header when its array is empty.
4. **`src/app/profile/_components/SavedPlansList.tsx`** — same split logic. Hide section headers when empty.
5. **Tests** — for `formatShortDateLabel` (with + without year change) and `splitPlansByDate` (today=upcoming, yesterday=past, sort order verification).

---

## Drafted commit message (for Part 2)

```
fix(saved): show itinerary date + time + neighborhood instead of save date; split past from upcoming
```

---

## Open questions awaiting greenlight

1. **Past sort direction** — DESC (most-recently-past first, my recommendation, UX-natural) or strict ASC per spec (oldest at top)?
2. **"Omit time when both missing" defensive branch** — dead code given `time_block NOT NULL` + `startTimeFromLegacyBlock`'s default. Skip (my recommendation) or implement?
3. **Split helper location** — `src/lib/dateUtils.ts` (my recommendation) or new module?
4. **Year display rule** — only append year when `itineraryYear !== currentYear` (my read of spec). Confirm or override.
