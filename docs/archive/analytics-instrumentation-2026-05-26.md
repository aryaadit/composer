# Analytics instrumentation — 2026-05-26

Single-commit implementation of the hybrid PostHog + Supabase analytics layer. All event captures across Composer now go through one wrapper that mirrors to both PostHog AND a Supabase `analytics_events` table. Replaces the wizard's 8 inline `posthog.capture` calls, adds the full event taxonomy, locks down the PostHog config, and renames env vars.

Follow-up to [docs/posthog-wizard-audit-2026-05-26.md](posthog-wizard-audit-2026-05-26.md).

## 1. Diff summary

| File | Status | Notes |
|---|---|---|
| [supabase/migrations/20260526_create_analytics_events.sql](supabase/migrations/20260526_create_analytics_events.sql) | new | `analytics_events` table + indexes + RLS-on-no-policies |
| [src/lib/analytics.ts](src/lib/analytics.ts) | new | Client wrapper: `track`, `getAnalyticsHeaders`, `setPersonProperties`, `incrementPersonProperty` |
| [src/lib/analytics-server.ts](src/lib/analytics-server.ts) | new | Server wrapper: `trackServer({userId, distinctId, sessionId}, props)`; skips when no distinct id (no `"anonymous"` collapse) |
| [src/app/api/analytics/track/route.ts](src/app/api/analytics/track/route.ts) | new | Internal endpoint; reads auth cookie for `user_id` FK; service-role insert |
| [instrumentation-client.ts](instrumentation-client.ts) | edit | Added `person_profiles: "identified_only"`, explicit `capture_pageview/pageleave`, `session_recording: { maskAllInputs: true, maskTextSelector: "*" }`; removed `capture_exceptions`; switched to `NEXT_PUBLIC_POSTHOG_KEY` |
| [src/lib/posthog-server.ts](src/lib/posthog-server.ts) | edit | Reads `POSTHOG_KEY` + `POSTHOG_HOST` (server-only); returns null if key missing; `getPostHogServer()` |
| [src/components/providers/AuthProvider.tsx](src/components/providers/AuthProvider.tsx) | edit | identify with `$set_once: { signup_at, signup_source }` only (no email/phone/name); ref-gated; fires `user_signed_up`/`user_signed_in` only on actual `SIGNED_IN`; `user_signed_out` before reset |
| [src/components/questionnaire/QuestionnaireShell.tsx](src/components/questionnaire/QuestionnaireShell.tsx) | edit | `compose_started` on mount; `compose_step_completed` on each advance (step/value/index/timing); `compose_submitted` (renamed) with day/day_of_week |
| [src/app/api/generate/route.ts](src/app/api/generate/route.ts) | edit | `itinerary_generated` via `trackServer` with venue arrays, walks, `time_to_generate_ms`; `itinerary_generation_failed` in catch with categorical `reason` |
| [src/app/api/swap-stop/route.ts](src/app/api/swap-stop/route.ts) | edit | `stop_swapped` via `trackServer` with from/to venue triples + stop_index |
| [src/app/itinerary/page.tsx](src/app/itinerary/page.tsx) | edit | `itinerary_viewed` (source=fresh) once per mount; enriched `itinerary_regenerated` + `stop_added`; `incrementPersonProperty("total_itineraries_generated", 1)` per fetch success; threads `x-ph-*` headers |
| [src/app/itinerary/saved/[id]/page.tsx](src/app/itinerary/saved/[id]/page.tsx) | edit | `itinerary_viewed` (source=saved); `surface="saved"` passed to ItineraryView |
| [src/app/itinerary/share/[id]/page.tsx](src/app/itinerary/share/[id]/page.tsx) | edit | `share_link_visited` + `itinerary_viewed` (source=share); `maps_opened`; `surface="share"` |
| [src/components/itinerary/ActionBar.tsx](src/components/itinerary/ActionBar.tsx) | edit | `itinerary_saved` with `itinerary_id` (from `.select("id").single()`) + `incrementPersonProperty("total_itineraries_saved")`; `share_link_copied`; `maps_opened` (multi_stop_cta) |
| [src/components/itinerary/ItineraryView.tsx](src/components/itinerary/ItineraryView.tsx) | edit | New `surface` prop; `venue_detail_opened` on card tap; passes `venueId` + `stopRole` to children |
| [src/components/itinerary/StopAvailability.tsx](src/components/itinerary/StopAvailability.tsx) | edit | `time_slot_selected` (with `slot_position`); `reservation_clicked` from 4 entry points (unconfirmed link, no_slots link, has_slots Reserve, slot-specific Book) |
| [src/components/ui/StopCard.tsx](src/components/ui/StopCard.tsx) | edit | `reservation_clicked` (from_surface="stop_card") |
| [src/components/venue/VenueDetailModal.tsx](src/components/venue/VenueDetailModal.tsx) | edit | New `stopRole` prop; `reservation_clicked` (from_surface="venue_detail_modal"); `maps_opened` (single_venue_modal) |
| [src/hooks/useSwapStop.ts](src/hooks/useSwapStop.ts) | edit | Threads `getAnalyticsHeaders()` into `/api/swap-stop` fetch |
| [src/components/onboarding/OnboardingFlow.tsx](src/components/onboarding/OnboardingFlow.tsx) | edit | Switched to `track`; added `time_to_complete_ms` |
| [.gitignore](.gitignore) | edit | Removed redundant `.env.local`; added `.claude/skills/` + `posthog-setup-report.md` |
| `.env.local` | edit (gitignored) | `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` → `NEXT_PUBLIC_POSTHOG_KEY`; added `POSTHOG_KEY` + `POSTHOG_HOST` (same project token value, server-only) |

**Pre-existing wizard captures**: all 8 removed. `rg posthog\.capture src/ -g '*.ts' -g '*.tsx'` returns only the two wrapper files.

## 2. New files created

- `supabase/migrations/20260526_create_analytics_events.sql`
- `src/lib/analytics.ts`
- `src/lib/analytics-server.ts`
- `src/app/api/analytics/track/route.ts`

## 3. Vercel env var changes to apply manually

In the Vercel project settings (Production / Preview / Development as appropriate):

- **Rename** `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` → `NEXT_PUBLIC_POSTHOG_KEY` (same value, the public project token)
- **Add** `POSTHOG_KEY` with the same value (server-only; do NOT prefix with `NEXT_PUBLIC_`)
- **Add** `POSTHOG_HOST` = `https://us.i.posthog.com` (server-only; optional — code falls back to this default)
- **Remove** `NEXT_PUBLIC_POSTHOG_HOST` (no longer read anywhere — client uses the `/ingest` rewrite proxy)

`SUPABASE_SERVICE_ROLE_KEY` is already present and reused by `/api/analytics/track` via `getServiceSupabase()`.

## 4. Skipped events (call site doesn't exist)

- **`itinerary_unsaved`** — there's no unsave UI today. ActionBar's Save button transitions `idle → saving → saved` and stops; no path back. Nothing instrumented. When an unsave control is added, fire from the same handler with `{ itinerary_id }`.

## 5. Things to know / unresolved

1. **Wizard cruft is already STAGED.** `.claude/skills/integration-nextjs-app-router/` (10 files) and `posthog-setup-report.md` appear in `git status` under "Changes to be committed". The new gitignore rules don't unstage already-tracked paths. Before committing, run:
   ```bash
   git rm --cached -r .claude/skills/integration-nextjs-app-router
   git rm --cached posthog-setup-report.md
   ```
   The disk copies stay, the index entries go.

2. **`share_link_visited.is_owner` is always `false`.** The `composer_shared_itineraries` table has no `user_id` column (see migration `20260420_shared_itineraries.sql`) — there's no way to compare ownership today. Documented in the page's code. Add a `created_by uuid` column to the share table if you want real ownership attribution; then update the page.

3. **Anonymous server-side captures still skip.** Per `trackServer`, when there's no `userId` AND no `x-ph-distinct-id` header, the event is dropped. Every client fetch path touched (`fetchItinerary`, `useSwapStop`, `handleAddStop`) now passes the headers via `getAnalyticsHeaders()`, so anonymous compose flows DO get attributed via the PostHog device id.

4. **`user_signed_up` vs `user_signed_in`** decided by `created_at < 60s old`. Fragile but defensible. If clocks drift or the auth callback takes more than 60s to land, a new signup would mis-classify as a returning sign-in. PostHog will still see both events as a `SIGNED_IN`-class lifecycle, just with the wrong name. Acceptable for now.

5. **PostHog person properties** — `signup_at` / `signup_source` are written via the third arg of `posthog.identify` (the `$set_once` slot). `last_active_at` is set via `posthog.setPersonProperties`. Increments via `posthog.people.increment` (typed defensively because the SDK exposes this via a sub-object).

6. **Wizard's `getPostHogClient` removed.** The two import sites in `/api/generate` and `/api/swap-stop` now use `trackServer`. The wrapper internally calls `getPostHogServer` (renamed). Grep confirms no other callers existed.

7. **Migration must be applied manually**:
   ```bash
   supabase migration up
   ```
   (or apply `supabase/migrations/20260526_create_analytics_events.sql` via the Supabase SQL editor.) The route hits the table immediately on first event — if the table doesn't exist, the insert fails silently (swallowed in the wrapper) and only PostHog gets the data.

8. **Verification**:
   - `npx tsc --noEmit` clean.
   - `npm run lint` clean (5 warnings, all pre-existing/unrelated — `<img>` warnings and two unused-vars in `OnboardingFlow.tsx` from the commented-out neighborhood step).
   - `npm run build` succeeds; new `/api/analytics/track` route shows up in the route table.
   - `rg posthog\.capture src/` returns only `src/lib/analytics.ts` and `src/lib/analytics-server.ts`.

## 6. Event taxonomy reference

For future reference, the full set of events emitted by the wrappers:

### Identity / lifecycle
- `user_signed_up` — fresh signup (created_at < 60s)
- `user_signed_in` — returning sign-in
- `user_signed_out` — fired before `posthog.reset()`

### Compose funnel
- `compose_started` (`entry_source`)
- `compose_step_completed` (`step`, `step_value`, `step_index`, `time_on_step_ms`)
- `compose_submitted` (`occasion`, `neighborhoods`, `budget`, `vibe`, `time_block`, `day`, `day_of_week`)
- `itinerary_generated` — server (`venue_ids`, `venue_names`, `categories`, `neighborhoods_used`, `total_walk_min`, `longest_walk_min`, `time_to_generate_ms`, `truncated_for_end_time`, …)
- `itinerary_generation_failed` — server (`reason`, `error_message`, `time_to_fail_ms`, …)

### Itinerary engagement
- `itinerary_viewed` (`source` = "fresh"/"saved"/"share", `itinerary_id`, `is_past`)
- `stop_swapped` — server (from/to venue triples, `stop_index`)
- `stop_added` (`new_stop_count`, full inputs)
- `itinerary_regenerated` (full inputs + `regeneration_count`)
- `time_slot_selected` (`venue_id`, `time`, `slot_position`)
- `reservation_clicked` (`venue_id`, `platform`, `stop_role`, `from_surface` = "stop_card"/"venue_detail_modal"/"availability_section")
- `maps_opened` (`surface` = "multi_stop_cta"/"single_venue_modal", + venue id/name or stop_count)
- `venue_detail_opened` (`venue_id`, `stop_role`, `from_surface`)

### Save / share
- `itinerary_saved` (`itinerary_id`, full inputs, `stop_count`)
- `share_link_copied` (`itinerary_id`, `share_method`)
- `share_link_visited` (`itinerary_id`, `is_authenticated`, `is_owner`, `found`)
- `onboarding_completed` (`has_drinks_pref`, `has_dietary_pref`, `time_to_complete_ms`)

### Person properties
- `$set_once`: `signup_at`, `signup_source`
- `$set`: `last_active_at`
- `$increment`: `total_itineraries_generated`, `total_itineraries_saved`

## 7. Commit message

```
feat(analytics): hybrid PostHog + Supabase analytics layer with full event taxonomy
```
