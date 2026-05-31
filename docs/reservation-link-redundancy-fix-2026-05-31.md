# Reservation link redundancy fix — applied — 2026-05-31

Follow-up to [reservation-link-redundancy-diagnosis-2026-05-30.md](reservation-link-redundancy-diagnosis-2026-05-30.md). Diagnosis approved with Option A. Implementation applied in working tree as two separate commits, awaiting manual `git commit`.

## COMMIT 1 — Resy slug pattern fix

Single-line URL fix + matching test assertion update.

```diff
diff --git a/src/lib/availability/booking-url.ts b/src/lib/availability/booking-url.ts
@@ -18,7 +18,7 @@ export function buildResyBookingUrl(
   date: string,
   partySize: number
 ): string {
-  return `https://resy.com/cities/ny/venues/${slug}?date=${date}&seats=${partySize}`;
+  return `https://resy.com/cities/new-york-ny/venues/${slug}?date=${date}&seats=${partySize}`;
 }

diff --git a/tests/unit/booking-url.test.ts b/tests/unit/booking-url.test.ts
@@ -53,7 +53,7 @@ describe("buildResyBookingUrl", () => {
   it("builds venue page URL with date and seats", () => {
     const url = buildResyBookingUrl("lelabar", "2026-04-25", 2);
     expect(url).toBe(
-      "https://resy.com/cities/ny/venues/lelabar?date=2026-04-25&seats=2"
+      "https://resy.com/cities/new-york-ny/venues/lelabar?date=2026-04-25&seats=2"
     );
   });
```

The test was pinning the old `cities/ny/` pattern as the correct value — validating the bug. Updated to the canonical pattern. Both `cities/` URL strings in `booking-url.ts` (the builder and the `ref` parameter inside `buildResySlotBookingUrl` at line 103) now match: `cities/new-york-ny`. No drift.

Verification: typecheck silent, lint 0 errors, 138 tests passing, build succeeded.

**Drafted commit message:**
```
fix(resy-url): correct slug pattern in buildResyBookingUrl from cities/ny to cities/new-york-ny
```

**Contains:**
- `src/lib/availability/booking-url.ts`
- `tests/unit/booking-url.test.ts`

## COMMIT 2 — StopCard redundant CTA suppression

Single hunk in StopCard. Adds `hasAvailabilityCta` derived value and swaps it into the `showInlineReserve` gate.

```diff
diff --git a/src/components/ui/StopCard.tsx b/src/components/ui/StopCard.tsx
@@ -77,11 +77,22 @@ export function StopCard({
   // more times" respectively). Otherwise they live in this card's footer.
   const hasSlots = stop.availability?.status === "has_slots";

+  // StopAvailability renders its own contextual CTA for has_slots,
+  // unconfirmed, and no_slots_in_block (e.g., "Check availability →",
+  // "See other times →"). When any of those will fire, suppress the
+  // StopCard footer link to avoid a redundant CTA. The footer link
+  // still renders when availability is undefined (no enrichment data —
+  // old saved itineraries) or walk_in (StopAvailability returns null).
+  const hasAvailabilityCta =
+    stop.availability?.status === "has_slots" ||
+    stop.availability?.status === "unconfirmed" ||
+    stop.availability?.status === "no_slots_in_block";
+
   // Past itineraries hide reservation CTAs entirely — the data behind
   // them (slot availability, party-size links) is no longer accurate.
   const showInlineReserve =
     !isPast &&
-    !hasSlots &&
+    !hasAvailabilityCta &&
     !!bookingPlatform &&
     isValidReservationUrl(v.reservation_url);
```

`hasSlots` is retained — still used by `showInlineSwap` (line 104) and `showWalkInLabel` (line 102). Swap stays in StopCard footer for `unconfirmed` and `no_slots_in_block` states (gated on `!hasSlots`, not `!hasAvailabilityCta`). Only Reserve is suppressed; Swap remains accessible.

Verification: typecheck silent, lint 0 errors, 138 tests passing, build succeeded. No analytics changes — the four `availability_*` `from_surface` values continue firing from their existing StopAvailability sites; `stop_card` just fires less often.

**Drafted commit message:**
```
fix(stop-card): suppress redundant reservation link when StopAvailability renders one
```

**Contains:**
- `src/components/ui/StopCard.tsx`

## 5-status render trace (post-both-commits)

| `availability.status` | StopCard footer | StopAvailability section |
|---|---|---|
| **undefined** | "Reserve on Platform →" link + Swap (right) | not rendered |
| **walk_in** | "Walk-in only" muted text (when URL is the literal string) or empty + Swap (right) | `null` |
| **unconfirmed** | Swap (right) — Reserve **hidden** | "Couldn't load times — check directly on X" + "Check availability →" |
| **no_slots_in_block** | Swap (right) — Reserve **hidden** | "No tables available in your time block" + "See other times →" |
| **has_slots** | entirely hidden (footer collapses; Swap moves into StopAvailability) | times grid + header "Reserve on Platform →" + Swap + slot-specific "Book TIME on Resy" pill |

Each state shows exactly ONE reservation CTA (or zero, for walk_in / undefined-with-no-URL). Redundancy eliminated.

## Smoke test plan (run on `npm run dev` before committing)

1. **Resy `has_slots` stop**
   - Generate a fresh evening itinerary with a popular Resy venue (e.g., a tier-2/3 Italian or wine bar in West Village).
   - **Expected**: ONE "Reserve on Resy →" link in the StopAvailability header. StopCard footer collapsed (no second Reserve link).
   - **Verify**: click → lands on `https://resy.com/cities/new-york-ny/venues/<slug>?date=YYYY-MM-DD&seats=2`. URL has `new-york-ny` (not `ny`). Date matches the itinerary day.

2. **OpenTable `unconfirmed` stop**
   - Generate an itinerary including an OpenTable venue (Nolita / West Village / NoMad have several).
   - **Expected**: ONE "Check availability →" link in StopAvailability with platform-aware copy "OpenTable doesn't share live availability — book directly". StopCard footer shows only Swap, no Reserve link.
   - **Verify**: link goes to `https://www.opentable.com/r/<slug>?dateTime=YYYY-MM-DDTHH:MM&covers=2`. Date+time+party prefilled. The bare-URL (today-defaulting) link is GONE.

3. **Resy `no_slots_in_block` stop**
   - Pick a Resy venue known to be fully booked tonight, or push date to an impossible slot (Thursday at noon).
   - **Expected**: ONE "See other times →" link with copy "No tables available in your time block". StopCard footer has only Swap.
   - **Verify**: link goes to date-aware Resy page with `new-york-ny` slug.

4. **Walk-in venue**
   - Find a venue with `reservation_url = "Walk-in Only"` (e.g., Little Branch).
   - **Expected**: StopCard footer shows muted "Walk-in only" text + Swap. StopAvailability section absent. No reservation link anywhere. Unchanged from today.

5. **Saved itinerary fallback (pre-enrichment)**
   - Open `/itinerary/saved/<id>` for an old saved itinerary whose stops lack `availability`.
   - **Expected**: StopCard renders its footer "Reserve on Platform →" via the original `v.reservation_url` derivation. The "availability undefined" branch — unchanged.

If 1–4 show one CTA per state with correct URLs, and 5 still shows the fallback link, both commits are safe to land.

## Working tree state

```
M src/components/ui/StopCard.tsx                  ← COMMIT 2
M src/lib/availability/booking-url.ts             ← COMMIT 1
M tests/unit/booking-url.test.ts                  ← COMMIT 1
```

Plus this exported doc (untracked, optional to include in either commit or as a follow-up `docs(...)` commit).

## Commit order

Run COMMIT 1 first (smallest, lowest-risk URL fix), then COMMIT 2 (CTA suppression). They're independent — either could roll back without the other breaking.
