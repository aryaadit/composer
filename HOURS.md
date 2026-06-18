# Hours and time blocks

Canonical reference for how Composer represents, generates, and consumes venue
operating hours. If you touch anything time-related, this is the source of
truth for the model. Pairs with ALGORITHM.md, which covers filtering and
scoring.

## 1. The `hours` column is the single source of truth

Every piece of time logic derives from one column: `hours` on the venue row.
Blocks, display formatting, and the time-relevance score all descend from it.
Nothing else is a source.

Format:

```json
{
  "mon": [[11, 23]],
  "sat": [[10, 15], [17, 22]],
  "fri": [[18, 25.5]]
}
```

- Keys are lowercase day abbreviations (`mon`..`sun`).
- Each value is a list of `[open, close]` intervals.
- Times are 24-hour decimal floats. `18.75` is 6:45 PM.
- A close past midnight uses the `> 24` convention: a 2 AM close is `26`, not
  `2`. This is the important part: the `> 24` value keeps the close attached to
  the night it belongs to, the day the venue opened, rather than reassigning it
  to the new calendar day. A bar open Friday 6 PM to 2 AM is `fri: [[18, 26]]`,
  one continuous Friday-night interval, not a Friday evening plus a separate
  Saturday midnight-to-2 AM block. This is what lets late-night composition
  treat the close as still part of Friday night instead of Saturday early
  morning, which is exactly the distinction that separates a late-night
  itinerary from an early-morning one.
- Multiple intervals on a day means split hours (brunch plus dinner with a
  mid-day gap). This is the entire reason for the array format.
- An empty array or a missing day means closed that day.

The format is intentional. The array captures split service and the `> 24`
convention captures past-midnight closes. A single open/close pair or a coarse
block label cannot represent either.

## 2. Generation: Google Places to `hours`

Source is the Google Places `regularOpeningHours.periods` array. The mapping
lives in `src/lib/venues/places-to-row.ts` (`extractSchedule`) and is already
faithful:

- Each Places period is one `[open, close]` interval appended to its day. Two
  periods on a day produce a split-day array.
- A past-midnight close arrives from Places as `close.day = open.day + 1`;
  `extractSchedule` folds it into the open day as `close + 24` (a Friday 6 PM
  to 1:30 AM venue becomes `fri: [[18, 25.5]]`).
- A period with no close is treated as 24-hour service: `[open, 24]`.

Places provides full fidelity, split days and past-midnight included, so no
information is lost in the mapping. The only thing to get right is **storing the
mapped schedule as JSON** in the `hours` column (`JSON.stringify(schedule)`),
not Google's verbose weekday-description string.

Rules:

- `hours` is generated, not hand-edited. The single exception is a venue Places
  has no published hours for. There, hand-author the array directly in the same
  format.
- The `open_/close_` grid columns are a lossy projection: first interval per day
  only, with `split_hours` flagging multi-interval days. They are not a
  regeneration source for `hours`. Regenerate from the live Places schedule or
  from `hours` itself, never from the grid, or split-day venues silently lose
  their second interval.

## 3. Block boundaries: one constant, `TIME_BLOCKS`

Blocks (`morning` / `afternoon` / `evening` / `late_night`) are a coarse
projection of hours onto four named windows. The hour ranges that define each
block live in exactly one place:

`TIME_BLOCKS` in `src/lib/itinerary/time-blocks.ts`

| Block | Range |
|---|---|
| morning | 08:00 to 12:00 |
| afternoon | 12:00 to 17:00 |
| evening | 17:00 to 22:00 |
| late_night | 22:00 to 02:00 (wraps midnight) |

To change what hours constitute a block, edit `TIME_BLOCKS` and nothing else.
Everything downstream reads from it: `hours-to-blocks.ts` derives its numeric
boundaries via `TIME_BLOCKS.map(...)` and must not hardcode its own. Do not
redefine these ranges anywhere else.

Block projection rule (`blocksForDayIntervals`): an interval contributes a block
if it overlaps that block's range, open-inclusive and close-exclusive. A venue
open until 22:00 sharp is not `late_night`; open until 22:01 is. Degenerate
intervals (close <= open) contribute nothing.

`time_blocks` (global) is the union of all per-day blocks (`unionTimeBlocks`).

## 4. Consumption: current state vs target

Current:

- Composition's time gate (`venueOpenForWindow`, `src/lib/itinerary/pre-filter.ts`
  step 3) reads the **block columns** (`time_blocks` / `mon_blocks..sun_blocks`)
  via a hybrid rule: per-day blocks override global `time_blocks` when present.
- The `hours` JSON is consumed only by display (`src/lib/format/hours.ts`).
- Blocks and `hours` are generated separately from the same schedule, so they
  can drift.

Target:

- `hours` is the single stored source. Blocks are derived from it (at read time
  via `blocksForDayIntervals`, or kept only as a regenerated cache that is never
  read as a source).
- The gate reads `hours`. This retires the per-day/global hybrid fallback
  (faithful per-day intervals leave nothing to fall back to) and removes the
  drift.

Migration prerequisites, in order:

1. Land the generation fix (store `JSON.stringify(schedule)` in `hours`). Flip
   the gate first and any venue still carrying verbose-text hours fails to parse
   and reads as closed.
2. Backfill the venues with no `hours` (roughly 2 percent today). They currently
   survive on a hand-set global `time_blocks`; once `hours` is the only source
   they vanish unless populated.
3. Keep block-overlap semantics for the cutover so behavior is preserved. Change
   the source, not the meaning, in one move.

## 5. Roadmap: precise-hours logic

Blocks are a deliberately coarse proxy. They finesse a real question: a stop
happens at some point inside the compose window (`startTime` to
`startTime + 5h`), not across all of it, so "overlaps the evening block"
sidesteps exactly-when.

Once `hours` drives the gate, the next step is to drop the block projection for
filtering and check the venue's exact intervals against the window directly.
That unlocks strictness controls the block check cannot express:

- **Overlap** (today's behavior): open at any point in the window.
- **Full coverage**: open continuously across the entire window.
- **Minimum coverage**: open for at least some duration or fraction of the
  window.

The decision to settle at that point is what "open during the window" means per
stop role, since an opener and a closer occupy different parts of the night.
Until then, blocks remain the gate, sourced from `hours`.

## Invariants

- `hours` is the only source of time truth. Blocks, display, and scoring derive
  from it.
- Edit block ranges only in `TIME_BLOCKS`.
- Never hand-edit generated `hours` except as the no-Places-hours fallback.
- A past-midnight close is encoded `> 24` (2 AM is `26`) so it stays attached to
  the opening night. Never rewrite it as a small-hours interval on the next day.
- Never regenerate `hours` from the `open_/close_` grid (lossy for split days).
