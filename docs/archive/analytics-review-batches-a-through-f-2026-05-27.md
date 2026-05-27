# Code review — batches A–F (files 4–21 of 21, 2026-05-27)

Batched audit covering infrastructure, auth/identity, compose funnel, itinerary views, interactions, and onboarding. Follow-up to the file-by-file walkthroughs of files 1–3 ([analytics.ts](analytics-review-02-analytics-ts-2026-05-27.md), [analytics-server.ts](analytics-review-03-analytics-server-ts-2026-05-27.md)) and the initial inventory ([analytics-instrumentation-2026-05-26.md](analytics-instrumentation-2026-05-26.md)).

Status legend:
- 🟢 GREEN — implementation matches spec, no issues
- 🟡 YELLOW — minor concern or deviation, backlog
- 🔴 RED — real bug or spec violation, fix before push

---

## BATCH A — INFRASTRUCTURE (files 4, 5, 6, 21)

### 🟢 `/api/analytics/track/route.ts`
- ✓ Validates `event_name` (string + truthy) → 400
- ✓ Validates `distinct_id` (string + truthy) → 400
- ✓ Uses `getServerSupabase()` to read auth cookie → `user.id` (optional)
- ✓ Uses `getServiceSupabase()` to insert (bypasses RLS)
- ✓ Returns `{ ok: true }` or `{ ok: false }` — no error details leaked on response body
- ✓ Outer try/catch wraps everything

### 🟢 `instrumentation-client.ts`
- ✓ `person_profiles: "identified_only"` — exact match
- ✓ `capture_pageview: true`
- ✓ `capture_pageleave: true`
- ✓ `session_recording: { maskAllInputs: true, maskTextSelector: "*" }`
- ✓ `capture_exceptions` — fully removed (not just `false`)
- ✓ Reads `NEXT_PUBLIC_POSTHOG_KEY`

### 🟢 `src/lib/posthog-server.ts`
- ✓ Reads `POSTHOG_KEY` (no `NEXT_PUBLIC_` prefix)
- ✓ Returns `null` if key missing
- ✓ `flushAt: 1, flushInterval: 0`

### 🟢 `.gitignore`
- ✓ `.claude/skills/` added (line 51)
- ✓ `posthog-setup-report.md` added (line 52)
- ✓ Redundant `.env.local` line removed (line 49 deleted)

### 🟡 Yellows for batch A

- **`/api/analytics/track`: `properties` type-check accepts arrays.** Line 54: `(properties && typeof properties === "object") ? properties : {}`. Arrays pass `typeof === "object"`. JSONB column accepts arrays so no crash, but a malicious client could send `properties: [...]` and pollute the column shape. Low risk. Backlog: add `Array.isArray(properties) ? {} : properties`.
- **No body size limit.** A 10MB `properties` blob would bloat the insert. Vercel's default body limit (~4.5MB) caps this practically, but no defense-in-depth.

---

## BATCH B — AUTH + IDENTITY (file 7)

### 🟢 `AuthProvider.tsx`
- ✓ `identify()` gated by `identifiedUserRef`. Fires once per user-id per lifecycle. Token refresh / USER_UPDATED don't re-identify (same user.id, ref already matches).
- ✓ Uses BOTH signals for signup vs sign-in:
  - **Supabase's `AuthChangeEvent`** (the `event` arg from `onAuthStateChange`): we only fire `user_signed_up`/`user_signed_in` when `event === "SIGNED_IN"`. INITIAL_SESSION (cookie hydration) gets silent identify, no lifecycle event.
  - **60s `created_at` freshness** then disambiguates new vs returning, because Supabase has no native `SIGNED_UP` event. This is the strongest signal available without server-side coordination.
- ✓ `user_signed_out` fires BEFORE `posthog.reset()` and BEFORE `libSignOut()` — line 161: `track("user_signed_out", {});` is the first statement in `signOut`.
- ✓ `posthog.identify(s.user.id, undefined, { signup_at, signup_source })` — third arg is `$set_once`.
- ✓ No email, phone, or name.
- ✓ `track` import + use for the three lifecycle events. `posthog.identify` and `posthog.reset` are SDK-direct calls (intentional — those are identity ops, not events; the wrapper doesn't cover them).

---

## BATCH C — COMPOSE FUNNEL (files 8, 9-partial)

### 🟢 `QuestionnaireShell.tsx` event firing
- ✓ `compose_started` once on mount (useEffect `[]` deps)
- ✓ `compose_step_completed` with all four properties: `step`, `step_value`, `step_index` (1-based), `time_on_step_ms`. Uses `stepStartMsRef = useRef<number>(0)` — no re-render loop.
- ✓ `compose_submitted` in `submitAnswers` with full input snapshot + `day_of_week`

### 🟢 `/api/generate` analytics parts
- ✓ `itinerary_generated` on success path
- ✓ All venue arrays preserve stop order (`enriched.stops.map(...)`)
- ✓ `neighborhoods_used` reflects ACTUAL `venue.neighborhood` (spillover-aware)
- ✓ `itinerary_generation_failed` in catch
- ✓ `reason` is categorical via the keyword classifier

### 🔴 RED in batch C

**`QuestionnaireShell.tsx:67-71` — `getAnalyticsHeaders()` is NOT threaded through the `/api/generate` fetch on the compose flow.**

Current code in `submitAnswers`:
```ts
const res = await fetch("/api/generate", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ ...body, excludeVenueIds }),
});
```

The compose flow is the **primary entry to itinerary generation**. For anonymous users (no `userId`), `/api/generate`'s `trackServer("itinerary_generated", ...)` call will skip entirely because `x-ph-distinct-id` is missing → no fallback → the event is dropped. Authenticated users are fine because the route reads `userId` from the auth cookie, but the anonymous funnel — main acquisition signal — is broken.

**Fix**:
```ts
import { track, getAnalyticsHeaders } from "@/lib/analytics";
// ...
headers: { "Content-Type": "application/json", ...getAnalyticsHeaders() },
```

This is the only RED in the audit. Needs to land before push.

### 🟡 Yellows for batch C

- **`compose_submitted` fires BEFORE the `/api/generate` fetch**, even if generation fails. Intentional per earlier review, but worth re-confirming you want compose_submitted as the "intent" event vs "successful submission". If you want the latter, move it after `res.ok`.
- **Error classification in `/api/generate` catch is keyword-heuristic** — `message.toLowerCase().includes("venue")` etc. Misclassifies novel errors as `"unknown"`. Acceptable for launch; could be replaced with explicit thrown error types later.

---

## BATCH D — ITINERARY VIEWS (files 11, 12, 13)

### 🟢 All three view pages
- ✓ `itinerary_viewed` fires ONCE per mount on each surface, guarded by `viewedFiredRef`
- ✓ `source` correctly set: `"fresh" | "saved" | "share"`
- ✓ `is_past` via `isPastDate()` on saved + share
- ✓ `share_link_visited` on share page: `is_authenticated`, `is_owner: false` (intentional — schema gap documented inline), `itinerary_id`, bonus `found` property
- ✓ `itinerary_regenerated` and `stop_added` on `/itinerary` with full property bag
- ✓ `incrementPersonProperty("total_itineraries_generated", 1)` fires inside `fetchItinerary` on every success — covers both initial fetch (URL-param path) and regenerate
- ✓ `/itinerary/page.tsx` + `useSwapStop` + add-stop fetch all use `getAnalyticsHeaders()`

### 🟡 Yellows for batch D

- **`/itinerary/saved/[id]/page.tsx` and `/itinerary/share/[id]/page.tsx` don't increment a `total_saved_itineraries_viewed` or similar.** Spec didn't ask for one. Just noting these surfaces could be useful for retention metrics later.
- **Share page `share_link_visited.is_owner` always `false`.** Documented at lines 37–40. Requires schema change to fix. Tracked.

---

## BATCH E — INTERACTIONS (files 14–19)

### 🟢 `ActionBar.tsx`
- ✓ Save uses `.select("id").single()` chained on `.insert()` — returns the new row's `id`
- ✓ `itinerary_saved` properties include `itinerary_id` from that return
- ✓ `incrementPersonProperty("total_itineraries_saved", 1)` after successful save
- ✓ `share_link_copied` with `itinerary_id` (from /api/share response) + `share_method: "button_click"`
- ✓ `maps_opened` with `surface: "multi_stop_cta", stop_count`

### 🟢 `ItineraryView.tsx`
- ✓ `venue_detail_opened` on tap, with `venue_id`, `venue_name`, `stop_role`, `from_surface` (`"fresh_itinerary" | "saved" | "share"`)

### 🟢 `StopAvailability.tsx`
- ✓ `time_slot_selected` with `venue_id`, `venue_name`, `time`, `slot_position`
- ✓ Four reservation_clicked entry points all fire:
  - Unconfirmed-state Reserve link
  - No_slots_in_block Reserve link
  - HasSlotsView header Reserve link
  - Slot-specific Book TIME on Resy pill (with extra `slot_time` prop)

### 🟢 `StopCard.tsx`
- ✓ `reservation_clicked` with `from_surface: "stop_card"`, full venue + role + platform

### 🟢 `VenueDetailModal.tsx`
- ✓ `reservation_clicked` with `from_surface: "venue_detail_modal"`
- ✓ `maps_opened` with `surface: "single_venue_modal"`, `venue_id`, `venue_name`

### 🟢 `useSwapStop.ts`
- ✓ Threads `getAnalyticsHeaders()` into `/api/swap-stop` fetch

### 🟡 Yellows for batch E

- **All four `reservation_clicked` sources in StopAvailability collapse to `from_surface: "availability_section"`.** No sub-distinction between unconfirmed / no_slots / has_slots_header / slot_specific_book. The slot-specific case is partially disambiguated by carrying a `slot_time` property, but the other three are indistinguishable in the data. Backlog: either add a sub-property `availability_state: "unconfirmed" | "no_slots" | "has_slots" | "slot_specific"`, or split `from_surface` into four distinct values.
- **Share page `/itinerary/share/[id]` also fires `maps_opened` (multi_stop_cta)** beyond what the spec called out. This is correct coverage but worth knowing — three sources total (ActionBar, share page footer, venue modal), not two.

---

## BATCH F — ONBOARDING (file 20)

### 🟢 `OnboardingFlow.tsx`
- ✓ `track("onboarding_completed")` once on save success
- ✓ `startMsRef = useRef<number>(0)`; set in mount-effect; computed in `handleFinish` via `Math.round(performance.now() - startMsRef.current)`
- ✓ Properties: `has_drinks_pref`, `has_dietary_pref`, `time_to_complete_ms`

### 🟡 Yellow for batch F

- **`startMsRef` defaults to `0` and is set inside `useEffect`.** If `handleFinish` somehow ran in the same render before the effect committed (theoretically impossible — user must tap a button, which requires a paint cycle), `time_to_complete_ms` would equal `performance.now()` ≈ time-since-page-load. Practically never happens. Backlog: initialize with `useRef(performance.now())` and skip the useEffect.

---

## OVERALL SUMMARY

| Status | Count | Items |
|---|---|---|
| 🔴 RED | **1** | `QuestionnaireShell` missing `getAnalyticsHeaders()` on `/api/generate` fetch → anonymous compose funnel loses `itinerary_generated` events server-side |
| 🟡 YELLOW | 7 | A: array passes object check, no body-size guard. C: compose_submitted before fetch, brittle error classifier. D: no view-counters for save/share, share is_owner gap (already known). E: reservation_clicked sub-surfaces collapse, maps_opened triple-source. F: `useRef(0)` instead of `useRef(performance.now())`. |
| 🟢 GREEN | All remaining checkpoints across 20 files | — |

**Must fix before push**: the one RED. Quick — two lines: import `getAnalyticsHeaders` and spread it into the headers.

**Backlog candidates**: the seven yellows. None block launch; all are sharpenings rather than corrections.
