# Phase 1 — Save/Hydrate Fidelity Bug

**Date:** 2026-06-09
**Severity:** Blocker — must fix before merging Phase 1
**Branch:** `adit/sandbox-testing`
**Related:** [compose-simplification-phase-1-implementation-2026-06-09.md](compose-simplification-phase-1-implementation-2026-06-09.md)

---

## TL;DR

Phase 1 widened the user-facing start-time space from 4 categorical buckets (`morning / afternoon / evening / late_night`) to 5 specific clock times (`17:00 / 18:00 / 19:00 / 20:00 / 21:00`). The persistence schema was not widened to match. On save, the chosen `startTime` is silently dropped and `time_block` is force-written to the string `"evening"`. On hydrate, every saved itinerary — regardless of what the user actually picked — resolves to `startTime = "19:00"`.

This is a real fidelity bug, not a low-priority cleanup. The implementation report (commit message: `feat(compose): start time pills replace time blocks, three-budget set, simplify for evening-only`) mis-labeled it. Shipping Phase 1 without fixing this means every user who saves a 5 PM, 6 PM, 8 PM, or 9 PM plan will reopen it as a 7 PM plan.

---

## How it was found

Verification request explicitly asked: "Does saved-itinerary hydration read `inputs.startTime` from a JSON column, or only the `time_block` column?" The answer turned out to be neither preferable nor a fallback — the schema has no JSON column for inputs, and no column other than `time_block` for time info.

---

## Schema (authoritative)

`composer_saved_itineraries` columns, assembled from migrations:

- [20260415_auth_and_accounts.sql:40-54](../supabase/migrations/20260415_auth_and_accounts.sql#L40-L54) — base table
- [20260423_add_custom_name.sql](../supabase/migrations/20260423_add_custom_name.sql) — `custom_name TEXT`
- [20260426_add_time_block.sql](../supabase/migrations/20260426_add_time_block.sql) — `time_block TEXT`
- [20260427_drop_duration_column.sql](../supabase/migrations/20260427_drop_duration_column.sql) — drops `duration`, sets `time_block NOT NULL`

Final shape:

```
id              uuid primary key
user_id         uuid not null
custom_name     text
title           text
subtitle        text
occasion        text
neighborhoods   text[]
budget          text
vibe            text
day             text
time_block      text NOT NULL          -- the ONLY time-related column
stops           jsonb not null         -- ItineraryStop[] (venues only, no inputs)
walking         jsonb
weather         jsonb
created_at      timestamptz
```

`composer_shared_itineraries` has the same shape (per the 20260427 migration that adds `time_block NOT NULL` to it as well).

`ItineraryStop` ([src/types/index.ts:226-234](../src/types/index.ts#L226-L234)) is:

```ts
{ role, venue, curation_note, spend_estimate, is_fixed, plan_b, availability? }
```

No `startTime` field anywhere in the stops blob. There is no `inputs JSONB` column either.

**Conclusion:** `time_block` is the sole persistence site for any time-related user input.

---

## What gets written on save

[src/components/itinerary/ActionBar.tsx:39-61](../src/components/itinerary/ActionBar.tsx#L39-L61):

```ts
const { data, error } = await getBrowserSupabase()
  .from("composer_saved_itineraries")
  .insert({
    user_id: user.id,
    title: header.title,
    subtitle: header.subtitle,
    occasion: inputs.occasion,
    neighborhoods: inputs.neighborhoods,
    budget: inputs.budget,
    vibe: inputs.vibe,
    day: inputs.day,
    time_block: "evening",        // ← HARDCODED — `inputs.startTime` is dropped
    stops,
    walking,
    weather: header.weather,
  })
  .select("id")
  .single();
```

`inputs.startTime` (e.g. `"21:00"`) is **not written to any column**. The only time-related column on the table receives the literal string `"evening"` regardless of what the user picked.

The shared API does the same thing in [src/app/api/share/route.ts](../src/app/api/share/route.ts) — same shape, same hardcode, same data loss.

---

## What gets read on hydrate

[src/app/itinerary/saved/[id]/page.tsx:85-97](../src/app/itinerary/saved/%5Bid%5D/page.tsx#L85-L97):

```ts
inputs: (() => {
  const startTime = startTimeFromLegacyBlock(saved.time_block);
  const { endTime } = resolveTimeWindow(startTime);
  return {
    occasion: (saved.occasion ?? "") as ItineraryResponse["inputs"]["occasion"],
    neighborhoods: (saved.neighborhoods ?? []) as ItineraryResponse["inputs"]["neighborhoods"],
    budget: (saved.budget ?? "") as ItineraryResponse["inputs"]["budget"],
    vibe: (saved.vibe ?? "") as ItineraryResponse["inputs"]["vibe"],
    day: saved.day ?? "",
    startTime,
    endTime,
  };
})(),
```

`startTimeFromLegacyBlock("evening")` returns `"19:00"`. Since every fresh save writes `"evening"`, **every fresh save hydrates as 19:00**. There is no JSON-column fallback because there is no JSON column with the value.

---

## Round-trip table

| User picks | Written to DB | Hydrated as | Fidelity |
|---|---|---|---|
| 17:00 | `time_block: "evening"` | 19:00 | ❌ off by 2h |
| 18:00 | `time_block: "evening"` | 19:00 | ❌ off by 1h |
| 19:00 | `time_block: "evening"` | 19:00 | ✓ (only by coincidence) |
| 20:00 | `time_block: "evening"` | 19:00 | ❌ off by 1h |
| 21:00 | `time_block: "evening"` | 19:00 | ❌ off by 2h, also loses wrap (02:00 → 00:00) |

---

## Why this didn't exist before Phase 1

Pre-Phase 1, the user picked a `timeBlock` slug directly from a finite set of 4 values. The schema stored exactly that. Input space == storage space, so the round-trip was lossless.

Phase 1 widened the input space (4 → 5) without widening the storage space (stayed at 4). The mismatch shows up only on the persistence boundary. Generation, scoring, share-via-URL, and analytics all preserve `startTime` correctly — they pass the value through in-memory or in querystrings. The DB write is the only place the value gets squashed.

---

## Fix options

### Option 1 (recommended): Add `start_time TEXT` columns

```sql
ALTER TABLE composer_saved_itineraries  ADD COLUMN IF NOT EXISTS start_time TEXT;
ALTER TABLE composer_shared_itineraries ADD COLUMN IF NOT EXISTS start_time TEXT;
```

- `start_time` stays nullable so legacy rows don't need backfill.
- `ActionBar.handleSave` and `/api/share` write `start_time: inputs.startTime`.
- Hydration prefers `start_time` when present; falls back to `startTimeFromLegacyBlock(time_block)` for old rows.
- `time_block` becomes purely legacy — keep populating it with the inverse mapping (17/18→evening, 19/20→evening, 21→late_night) so the NOT NULL constraint holds. Or relax NOT NULL in a second migration after the column is fully unused.
- Optionally also add `end_time TEXT`. Derivable from `start_time` via `resolveTimeWindow`, so storing it is redundant; recommend not storing.

**Touch points:**
- New migration `2026XXXX_add_start_time_to_saved_itineraries.sql`
- `ActionBar.handleSave` — add `start_time: inputs.startTime`
- `/api/share/route.ts` — add `start_time: itinerary.inputs.startTime`
- `SavedItinerary` type in `src/types/index.ts` — add `start_time: string | null`
- `/itinerary/saved/[id]/page.tsx` — hydration prefers `saved.start_time ?? startTimeFromLegacyBlock(saved.time_block)`
- `/itinerary/share/[id]/page.tsx` — same change

Smallest, cleanest. Touches exactly the boundary that's broken.

### Option 2: Inverse-map `time_block` from `startTime` on insert

Write `time_block = "evening"` for 17/18/19/20 and `"late_night"` for 21. Doesn't fix the bug — still loses 17 vs 18 vs 19 vs 20 distinction on hydrate. Rejected.

### Option 3: Add `inputs JSONB` column

Stores the whole `QuestionnaireAnswers` blob. Most flexible, but duplicates data already in decomposed columns and invites drift. Heavier than the bug warrants.

---

## Recommendation

Stop the Phase 1 commit. Implement Option 1 — one migration plus four small file edits — and fold it into the same commit before merging. The unified commit message stays accurate: it still describes Phase 1's intent; it just also persists the user's pick faithfully.

Updated drafted commit (if option 1 is applied):

```
feat(compose): start time pills replace time blocks, three-budget set, persist start_time
```

Or split into two if you want history clarity:

```
chore(db): add start_time column to saved + shared itineraries (Phase 1 fidelity)
feat(compose): start time pills replace time blocks, three-budget set
```

---

## Open question for review

Do we backfill `start_time` on existing rows? Pre-Phase 1 saves carry a categorical `time_block`. Running `UPDATE … SET start_time = startTimeFromLegacyBlock(time_block)` once would convert them to specific clock times. Worth doing? Or leave legacy rows with null `start_time` and let the hydration fallback handle them indefinitely?

Argument for backfill: simpler hydration code long-term; one source of truth.
Argument against: the legacy rows were imprecise on purpose (user picked a bucket); upgrading them to a specific clock time invents data the user didn't pick.

My read: skip the backfill. Keep the fallback path. Drop NOT NULL on `time_block` only when *every* row has a `start_time` — i.e., never, unless we backfill.
