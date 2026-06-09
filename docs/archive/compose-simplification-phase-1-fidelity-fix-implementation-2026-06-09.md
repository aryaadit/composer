# Phase 1 — Fidelity Fix Implementation (Option 1)

**Date:** 2026-06-09
**Branch:** `adit/sandbox-testing`
**Status:** Code complete; tests green; migration not yet applied to DB; live round-trip not yet verified
**Diagnosis doc:** [compose-simplification-phase-1-fidelity-bug-2026-06-09.md](compose-simplification-phase-1-fidelity-bug-2026-06-09.md)
**Phase 1 main doc:** [compose-simplification-phase-1-implementation-2026-06-09.md](compose-simplification-phase-1-implementation-2026-06-09.md)

---

## What this delivers

Option 1 from the fidelity-bug doc: add a `start_time TEXT` column to `composer_saved_itineraries` and `composer_shared_itineraries`, wire the save path to write it, prefer it on hydrate, keep the legacy `time_block` mapping as the fallback for pre-migration rows. Split into two logical commits.

---

## Corrections to the diagnosis doc

While implementing I found one thing the diagnosis got wrong:

- **The shared path was never broken.** [src/app/api/share/route.ts](../src/app/api/share/route.ts) inserts the entire `ItineraryResponse` into a JSONB column called `itinerary`, and [src/app/itinerary/share/[id]/page.tsx](../src/app/itinerary/share/%5Bid%5D/page.tsx) reads `data.itinerary as ItineraryResponse` directly — so `inputs.startTime` already survives the round-trip via the JSON blob. The `start_time` column on `composer_shared_itineraries` added here is purely for parity with `composer_saved_itineraries` and any future denormalized-column reporting. It's not load-bearing.

The save path (`composer_saved_itineraries`) **is** broken — decomposed columns with no slot for `startTime`. That's the path the fix is actually fixing.

[compose-simplification-phase-1-fidelity-bug-2026-06-09.md](compose-simplification-phase-1-fidelity-bug-2026-06-09.md) needs a one-line correction noting the shared path round-trips correctly via the JSON column. Not done yet — flagged for follow-up.

---

## Commit 1 — Schema

[supabase/migrations/20260609_add_start_time_to_saved_itineraries.sql](../supabase/migrations/20260609_add_start_time_to_saved_itineraries.sql):

```sql
BEGIN;

ALTER TABLE composer_saved_itineraries  ADD COLUMN IF NOT EXISTS start_time TEXT;
ALTER TABLE composer_shared_itineraries ADD COLUMN IF NOT EXISTS start_time TEXT;

COMMENT ON COLUMN composer_saved_itineraries.start_time IS
  'User-chosen start time (e.g. "17:00"). Nullable for legacy rows that predate the column. New rows always populated.';
COMMENT ON COLUMN composer_shared_itineraries.start_time IS
  'User-chosen start time (e.g. "17:00"). Nullable for legacy rows that predate the column. New rows always populated.';

COMMIT;
```

- Nullable: no backfill required. Pre-migration rows hydrate via the `startTimeFromLegacyBlock(time_block)` fallback.
- `time_block` NOT NULL preserved. Save path still writes `"evening"` literal to satisfy the constraint. Drop-NOT-NULL and drop-column belong in a future migration once `time_block` reads disappear.

**Drafted commit:**
```
chore(db): add start_time column to saved + shared itineraries (Phase 1 fidelity)
```

### Migration application — not done in this session

No Supabase MCP is available; only Gmail / Calendar / Drive MCPs are connected. The migration file is written but **not applied**. You apply via one of:

- Supabase SQL Editor (paste + run)
- `supabase db push` if linked
- `psql` against the connection string

Then verify:

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'composer_saved_itineraries' and column_name = 'start_time';

select column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'composer_shared_itineraries' and column_name = 'start_time';
```

Both should return `text | YES`.

---

## Commit 2 — Wire start_time through save + hydrate

### Files changed

| File | Change |
|---|---|
| [src/types/index.ts](../src/types/index.ts) | `SavedItinerary` adds `start_time?: string \| null` |
| [src/components/itinerary/ActionBar.tsx](../src/components/itinerary/ActionBar.tsx) | `handleSave` insert payload adds `start_time: inputs.startTime`; keeps legacy `time_block: "evening"` with one-line comment |
| [src/app/api/share/route.ts](../src/app/api/share/route.ts) | Share insert adds `start_time: itinerary.inputs?.startTime ?? null`; keeps legacy `time_block: "evening"` |
| [src/lib/itinerary/saved-hydration.ts](../src/lib/itinerary/saved-hydration.ts) | **NEW** — extracts `hydrateSavedItinerary(saved): ItineraryResponse` from the saved page so it's unit-testable |
| [src/app/itinerary/saved/[id]/page.tsx](../src/app/itinerary/saved/%5Bid%5D/page.tsx) | Imports `hydrateSavedItinerary`; deletes the inline copy |
| [src/app/itinerary/share/[id]/page.tsx](../src/app/itinerary/share/%5Bid%5D/page.tsx) | **No change** — already reads from JSON blob, already preserves startTime |
| [tests/unit/saved-hydration.test.ts](../tests/unit/saved-hydration.test.ts) | **NEW** — 15 cases covering all 5 start times + legacy fallback + defensive edge cases |

### Hydration coalesce — the load-bearing line

[src/lib/itinerary/saved-hydration.ts:46](../src/lib/itinerary/saved-hydration.ts#L46):

```ts
// Prefer the explicitly persisted start_time. Fall back to the legacy
// time_block bucket mapping for rows that predate the start_time column.
const startTime = saved.start_time ?? startTimeFromLegacyBlock(saved.time_block);
```

`??` not `||` — empty string is **not** treated as "fall back" (deliberately surfaced in the test suite so a future change to `||` is a conscious decision).

### Why extract the hydrator

The original `toItineraryResponse` lived inline in [src/app/itinerary/saved/[id]/page.tsx](../src/app/itinerary/saved/%5Bid%5D/page.tsx). Testing the round-trip against an inlined helper means the test has to re-construct the hydration logic — and someone could change the page hydration without the test noticing. Extracting it to [src/lib/itinerary/saved-hydration.ts](../src/lib/itinerary/saved-hydration.ts) makes the test a real contract test: it imports the same function the page imports.

### Drafted commit

```
feat(compose): start time pills replace time blocks, three-budget set, persist start_time
```

Replaces the previously-drafted Phase 1 commit. Same intent, plus the persistence fix.

---

## Verification — actual outputs

```
$ npx tsc --noEmit
(clean)

$ npm run lint
✖ 4 problems (0 errors, 4 warnings)   # identical to pre-fix baseline

$ npm test
Test Files  9 passed (9)
     Tests  160 passed (160)
  ✓ tests/unit/saved-hydration.test.ts (15 tests)
  + 8 other suites unchanged
# was 145, +15 from the new round-trip suite

$ npm run build
(clean — all 16 routes compiled)
```

### The new test suite shape

[tests/unit/saved-hydration.test.ts](../tests/unit/saved-hydration.test.ts):

```
saved itinerary start_time round-trip (Phase 1 fidelity)
  fresh saves — start_time column populated
    ✓ preserves startTime=17:00 through save+hydrate
    ✓ preserves startTime=18:00 through save+hydrate
    ✓ preserves startTime=19:00 through save+hydrate
    ✓ preserves startTime=20:00 through save+hydrate
    ✓ preserves startTime=21:00 through save+hydrate
    ✓ 21:00 hydrates with the wrap-aware end of 02:00 (the bug case)
    ✓ 17:00 hydrates with the non-wrap end of 22:00
    ✓ ignores time_block when start_time is present (the whole point of the fix)
  legacy rows — start_time null, fallback to time_block
    ✓ legacy time_block=morning hydrates as 09:00–14:00
    ✓ legacy time_block=afternoon hydrates as 13:00–18:00
    ✓ legacy time_block=evening hydrates as 19:00–00:00
    ✓ legacy time_block=late_night hydrates as 22:00–03:00
    ✓ legacy row with unknown time_block defaults to 19:00
  intermediate cases
    ✓ undefined start_time (older fetch shape) falls back to time_block
    ✓ empty-string start_time still falls back (defensive)
```

This test would have failed catastrophically against pre-fix code: every `startTime=XX:XX` case in the first block would have returned `"19:00"`.

---

## What's NOT verified yet — user actions required

The unit tests verify the *code-path contract* — that what `ActionBar` writes is what `hydrateSavedItinerary` reads. They don't verify the live DB column receives the value at insert time or returns it at select time. That requires:

### Required before merging

1. **Apply the migration** (see Commit 1 section above).
2. **Live end-to-end trace** (run yourself; no MCP access from this session):
   - Dev server up. Sign in. Compose with `startTime: "21:00"`. Tap Save.
   - In SQL editor: `select id, start_time, time_block from composer_saved_itineraries order by created_at desc limit 1;` → expect `start_time = '21:00'`, `time_block = 'evening'`.
   - Visit `/itinerary/saved/<id>` → header chip should read **"9 PM – 2 AM"**. If it reads "7 PM – Midnight", the fix did not land.
   - Repeat for `startTime: "17:00"` → expect on-disk `start_time = '17:00'`, header reads **"5 PM – 10 PM"**.

3. **Backward-compat trace** (run yourself):
   - SQL editor:
     ```sql
     insert into composer_saved_itineraries
       (user_id, title, neighborhoods, budget, vibe, day, time_block, stops)
     values
       (<your uuid>, 'legacy test', '{west_village}', 'nice_out', 'food_forward', '2026-06-09', 'afternoon', '[]'::jsonb)
     returning id;
     ```
     (Leave `start_time` unset.)
   - Open `/itinerary/saved/<id>` → header chip should read **"1 PM – 6 PM"**.

---

## Follow-ups not in this PR

- **Update [compose-simplification-phase-1-fidelity-bug-2026-06-09.md](compose-simplification-phase-1-fidelity-bug-2026-06-09.md)**: correct the claim that the shared path also has the bug. It doesn't.
- **Update [compose-simplification-phase-1-implementation-2026-06-09.md](compose-simplification-phase-1-implementation-2026-06-09.md)**: remove "low-priority cleanup" language around `time_block` and revise Open consideration #2 — the column is now backed up by `start_time`. Best done after the live round-trip is verified.
- **Future schema cleanup migration**: drop NOT NULL on `time_block`; later drop the column entirely. Track 90 days from the last save that writes `"evening"`.
