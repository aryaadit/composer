# Analytics audit — 2026-06-11

Read-only inventory across nine lenses. No code changes proposed outside item 7 (gaps) and item 9's rename map. Every claim carries `file:line`.

---

## Executive summary

- **53 capture sites** across client and server. **Zero raw `posthog.capture`** violations bypassing the wrappers.
- **2 registry orphans** (`ERROR_ENCOUNTERED`, `FEATURE_BLOCKED`) with zero call sites.
- **`compose_failed` is the dominant free-floating event**: 9 call sites across the three generation endpoints, none registered in `EVENTS` ([src/lib/analytics.ts:26-72](src/lib/analytics.ts#L26-L72)).
- **Both suspected bugs confirmed.** `compose_started` refires on every `QuestionnaireShell` mount (no once-guard). `user_signed_in` overfires on tab refocus (not token refresh); `INITIAL_SESSION` guard does not cover this in supabase-js `2.102.1`.
- **All 4 client → server fetches spread `getAnalyticsHeaders()`** correctly. But **13 server emission sites silently drop events** when the request reaches them without `x-ph-distinct-id` (anonymous + missing header → no event).
- **Zero env gating.** Vercel previews, branch deploys, and localhost all write to the same PostHog project AND the same Supabase mirror.
- **PostHog ↔ Supabase mirror parity is asymmetric in 11 known ways.** Mirror is a parallel write (no webhook, no trigger).
- **`itinerary_generation_failed` vs `compose_failed` are mutually exclusive by design** — one is "system broke" (500), the other is "input shape can't be satisfied" (422). Both should survive; the boundary needs to stay explicit.

---

## 1. Inventory

### Stats
- 53 capture sites total.
- 0 raw `posthog.capture` / `posthog-node` calls bypassing the wrappers.
- 2 registry orphans (zero call sites): `ERROR_ENCOUNTERED`, `FEATURE_BLOCKED`.
- 9 call-site event names absent from `EVENTS`: every `compose_failed` site.

### Capture sites by surface

#### Auth (3 sites)
| event | side | wrapper | file:line | fire condition |
| --- | --- | --- | --- | --- |
| `user_signed_up` / `user_signed_in` | client | `track` | [AuthProvider.tsx:133](src/components/providers/AuthProvider.tsx#L133) | onAuthStateChange `SIGNED_IN`, ternary on `isFreshUser(created_at)` |
| `user_signed_out` | client | `track` | [AuthProvider.tsx:184](src/components/providers/AuthProvider.tsx#L184) | click → `signOut()`; fires BEFORE `libSignOut()` and `posthog.reset()` |
| `compose_abandoned` (indirect, via `track` EmitFn) | client | `track` | [AuthProvider.tsx:145](src/components/providers/AuthProvider.tsx#L145) | mount; `checkAndEmitIfStale(track)` |

#### Compose flow (8 sites)
| event | side | wrapper | file:line | fire condition |
| --- | --- | --- | --- | --- |
| `compose_abandoned` (indirect) | client | `track` | [QuestionnaireShell.tsx:101](src/components/questionnaire/QuestionnaireShell.tsx#L101) | mount; drain stale flag |
| `compose_started` | client | `track` | [QuestionnaireShell.tsx:104](src/components/questionnaire/QuestionnaireShell.tsx#L104) | mount; **refires on every mount — see bug 2A** |
| `compose_step_completed` | client | `track` | [QuestionnaireShell.tsx:113](src/components/questionnaire/QuestionnaireShell.tsx#L113) | click → `trackStepCompleted()` |
| `compose_submitted` | client | `track` | [QuestionnaireShell.tsx:137](src/components/questionnaire/QuestionnaireShell.tsx#L137) | click → `submitAnswers()`, before `/api/generate` fetch |
| `compose_start_time_selected` | client | `track` | [WhenStep.tsx:81](src/components/questionnaire/WhenStep.tsx#L81) | click → time-pill handler. The **only `EVENTS.*` constant consumer in a `track()` call** outside ItineraryMap. |
| `onboarding_completed` | client | `track` | [OnboardingFlow.tsx:102](src/components/onboarding/OnboardingFlow.tsx#L102) | response → after `upsertProfile()` succeeds |
| `itinerary_viewed` | client | `track` | [itinerary/page.tsx:148](src/app/itinerary/page.tsx#L148) | mount; `viewedFiredRef.current` ref-guarded. `source: "fresh"` hardcoded. |

#### Itinerary engagement (12 sites)
| event | side | wrapper | file:line | notes |
| --- | --- | --- | --- | --- |
| `itinerary_viewed` (saved) | client | `track` | [saved/[id]/page.tsx:67](src/app/itinerary/saved/[id]/page.tsx#L67) | source="saved" — see gap 7d (revisit) |
| `itinerary_viewed` (share) | client | `track` | [share/[id]/page.tsx:61](src/app/itinerary/share/[id]/page.tsx#L61) | source="share" |
| `share_link_visited` | client | `track` | [share/[id]/page.tsx:48](src/app/itinerary/share/[id]/page.tsx#L48) | mount |
| `itinerary_dwell_time` | client | `track` | [EngagementProvider.tsx:85](src/components/itinerary/EngagementProvider.tsx#L85) | unmount |
| `itinerary_zero_engagement` | client | `track` | [EngagementProvider.tsx:92](src/components/itinerary/EngagementProvider.tsx#L92) | unmount, when engagement counter is 0 |
| `<dynamic — caller-passed>` | client | `track` | [EngagementProvider.tsx:134](src/components/itinerary/EngagementProvider.tsx#L134) | passthrough emit point used by `trackEngagement` callers |
| `itinerary_map_pin_tapped` | client | `trackEngagement` | [ItineraryMap.tsx:133](src/components/itinerary/ItineraryMap.tsx#L133) | click on a pin |
| `itinerary_map_expanded` | client | `trackEngagement` | [ItineraryMap.tsx:158](src/components/itinerary/ItineraryMap.tsx#L158) | click → modal open |
| `venue_detail_opened` | client | `trackEngagement` | [ItineraryView.tsx:124](src/components/itinerary/ItineraryView.tsx#L124) | click on stop card body |
| `maps_opened` | client | `trackEngagement` | [ActionBar.tsx:21](src/components/itinerary/ActionBar.tsx#L21) | click → Google Maps deep-link |
| `maps_opened` (share surface) | client | `trackEngagement` | [share/[id]/page.tsx:159](src/app/itinerary/share/[id]/page.tsx#L159) | same |
| `maps_opened` (venue detail) | client | `trackEngagement` | [VenueDetailModal.tsx:205](src/components/venue/VenueDetailModal.tsx#L205) | same |

#### Reservations (7 sites)
| event | side | wrapper | file:line |
| --- | --- | --- | --- |
| `reservation_clicked` | client | `trackEngagement` | [StopCard.tsx:221](src/components/ui/StopCard.tsx#L221) |
| `reservation_clicked` | client | `trackEngagement` | [StopAvailability.tsx:105](src/components/itinerary/StopAvailability.tsx#L105) |
| `reservation_clicked` | client | `trackEngagement` | [StopAvailability.tsx:134](src/components/itinerary/StopAvailability.tsx#L134) |
| `reservation_clicked` | client | `trackEngagement` | [StopAvailability.tsx:281](src/components/itinerary/StopAvailability.tsx#L281) |
| `reservation_clicked` | client | `trackEngagement` | [StopAvailability.tsx:338](src/components/itinerary/StopAvailability.tsx#L338) |
| `reservation_clicked` | client | `trackEngagement` | [VenueDetailModal.tsx:229](src/components/venue/VenueDetailModal.tsx#L229) |
| `time_slot_selected` | client | `trackEngagement` | [StopAvailability.tsx:232](src/components/itinerary/StopAvailability.tsx#L232) |

#### Swap reason flow (4 sites)
| event | side | wrapper | file:line |
| --- | --- | --- | --- |
| `stop_swap_reason_shown` / `stop_swap_reason_skipped` (indirect via `swap-reason.ts`) | client | `track` | [itinerary/page.tsx:212](src/app/itinerary/page.tsx#L212) |
| `stop_swap_reason_skipped` | client | `track` | [itinerary/page.tsx:243](src/app/itinerary/page.tsx#L243) |
| `stop_swap_reason_submitted` | client | `trackEngagement` | [itinerary/page.tsx:227](src/app/itinerary/page.tsx#L227) |
| `stop_swap_reason_shown` / `_skipped` (the EmitFn invocation point) | client | `track` | [swap-reason.ts:111,113](src/lib/itinerary/swap-reason.ts#L111) |

#### Stop add / extension (2 sites)
| event | side | wrapper | file:line |
| --- | --- | --- | --- |
| `stop_added` | client | `track` | [itinerary/page.tsx:296](src/app/itinerary/page.tsx#L296) |
| `itinerary_extended_to_three` | client | `track` | [itinerary/page.tsx:308](src/app/itinerary/page.tsx#L308) |

#### Save / share / calendar (4 sites)
| event | side | wrapper | file:line |
| --- | --- | --- | --- |
| `itinerary_saved` | client | `track` | [LooksGoodCTA.tsx:117](src/components/itinerary/LooksGoodCTA.tsx#L117) |
| `itinerary_calendar_added` | client | `track` | [ConfirmModal.tsx:149,181](src/components/itinerary/ConfirmModal.tsx#L149) (2 surfaces) |
| `share_link_copied` | client | `track` | [ConfirmModal.tsx:195](src/components/itinerary/ConfirmModal.tsx#L195) |

#### Server emissions (13 sites — all in api routes)
| event | side | wrapper | file:line |
| --- | --- | --- | --- |
| `itinerary_generated` | server | `trackServer` | [generate/route.ts:362](src/app/api/generate/route.ts#L362) |
| `itinerary_generation_failed` | server | `trackServer` | [generate/route.ts:409](src/app/api/generate/route.ts#L409) |
| `compose_failed` (pre-filter zero) | server | `trackServer` | [generate/route.ts:212](src/app/api/generate/route.ts#L212) |
| `compose_failed` (composer zero) | server | `trackServer` | [generate/route.ts:243](src/app/api/generate/route.ts#L243) |
| `compose_failed` (×4: pre-filter, no best, swap-Main proximity, fit) | server | `trackServer` | [swap-stop/route.ts:145,204,241,264](src/app/api/swap-stop/route.ts#L145) |
| `stop_swapped` | server | `trackServer` | [swap-stop/route.ts:322](src/app/api/swap-stop/route.ts#L322) |
| `compose_failed` (×4: pre-filter, no best, proximity, fit) | server | `trackServer` | [add-stop/route.ts:110,151,184,209](src/app/api/add-stop/route.ts#L110) |

### Raw posthog imports outside the wrappers
- [instrumentation-client.ts:1](instrumentation-client.ts#L1) — top-level `posthog.init(...)` at line 3. Expected: the init module is allowed to import `posthog-js` directly.
- [src/components/providers/AuthProvider.tsx:35](src/components/providers/AuthProvider.tsx#L35) — `import posthog from "posthog-js"` consumed at line 122 (`posthog.identify`) and 186 (`posthog.reset`). Identify/reset are session-management calls, not capture calls, so they technically don't violate the "no raw capture" rule, but they DO bypass the mirror — see Mirror parity below.

### Registry orphans (zero callers)
| key (string) | declared at |
| --- | --- |
| `ERROR_ENCOUNTERED` (`"error_encountered"`) | [analytics.ts:70](src/lib/analytics.ts#L70) |
| `FEATURE_BLOCKED` (`"feature_blocked"`) | [analytics.ts:71](src/lib/analytics.ts#L71) |

### Free-floating event names (call site uses string literal, not in registry)
| event | sites |
| --- | --- |
| `compose_failed` | 9 — all server emissions across the 3 endpoints |

47 of the other event names (every single string literal across `track`/`trackServer` calls) are also written as bare strings — see item 9's "string literals outside registry" for the full enumeration. The registry exists but is essentially unused by call sites; only [WhenStep.tsx:81](src/components/questionnaire/WhenStep.tsx#L81) imports `EVENTS.COMPOSE_START_TIME_SELECTED`.

---

## 2. Known bugs

### 2A. `compose_started` refires on every QuestionnaireShell mount

**Confirmed.** Guard at [QuestionnaireShell.tsx:105](src/components/questionnaire/QuestionnaireShell.tsx#L105) — there is **no once-guard**.

```ts
// QuestionnaireShell.tsx:91-105 (the relevant effect)
useEffect(() => {
  checkAndEmitIfStale(track);
  setComposeAbandonedFlag();
  track("compose_started", { entry_source: deriveEntrySource() });
}, []);
```

- Empty deps `[]` → effect runs once per mount.
- No module-level boolean, no `useRef` once-guard, no sessionStorage "has fired" key.
- `setComposeAbandonedFlag()` happily overwrites any existing flag with a fresh `compose_started_at`.

**Scenario that misfires:** user completes questionnaire → `clearComposeAbandonedFlag()` runs → `router.push("/itinerary")` unmounts the shell. User then navigates back to /compose (Back button, HomeScreen CTA, in-flow "start over"). QuestionnaireShell remounts → effect fires again → `compose_started` fires a second time in the same session.

**React Strict Mode in dev** double-invokes the effect, so the first mount alone yields **two** `compose_started` events.

The user's framing of "doesn't refire on subsequent entries" is the inverse of the actual behavior. The actual bug is **over-fires**, not under-fires.

### 2B. `user_signed_in` overfires on tab refocus

**Confirmed.** supabase-js version **`2.102.1`** (resolves auth-js `2.102.1`, both pinned in `package-lock.json`).

| event | does auth-js emit `SIGNED_IN`? | source |
| --- | --- | --- |
| silent token refresh | **no** — emits `TOKEN_REFRESHED` (`GoTrueClient.js:3888`) | INITIAL_SESSION guard correctly drops these |
| **tab refocus / visibilitychange="visible"** | **yes** — `_recoverAndRefresh` emits `SIGNED_IN` at `GoTrueClient.js:3857` whenever it recovers a still-valid session from storage on visibility | **the overfire path** |

Guard at [AuthProvider.tsx:131-134](src/components/providers/AuthProvider.tsx#L131-L134):
```ts
if (event === "SIGNED_IN") {
  applySession(s, "SIGNED_IN");
}
```

The guard only excludes the bootstrap `INITIAL_SESSION` event — it does **not** distinguish a real user-initiated sign-in from `_recoverAndRefresh`'s reemit on tab refocus. Every tab background→focus cycle, even with no auth action, re-runs `applySession(s, "SIGNED_IN")`. The `isFreshUser` check returns `false` (the user's `auth.users.created_at` is older than 60s), so it routes to `user_signed_in` rather than `user_signed_up`.

**Dominant overfire vector:** tab refocus, not token refresh.

---

## 3. Identity threading

### Client fetches → server (all good)

| endpoint | fetch site | spreads `getAnalyticsHeaders()` |
| --- | --- | --- |
| `/api/generate` | [itinerary/page.tsx:85-89](src/app/itinerary/page.tsx#L85-L89) | ✅ |
| `/api/generate` | [QuestionnaireShell.tsx:148-152](src/components/questionnaire/QuestionnaireShell.tsx#L148-L152) | ✅ |
| `/api/swap-stop` | [useSwapStop.ts:58-66](src/hooks/useSwapStop.ts#L58-L66) | ✅ |
| `/api/add-stop` | [itinerary/page.tsx:261-265](src/app/itinerary/page.tsx#L261-L265) | ✅ |

### Server emission sites reachable without `distinctId` (13 sites)

Every server `trackServer` call reads `distinctId` and `sessionId` from request headers. When the headers are absent AND the user is unauthenticated, the event **silently drops to PostHog** (the wrapper still writes the mirror row with `distinct_id = null`).

| event | file:line | path that drops |
| --- | --- | --- |
| `compose_failed` (pre-filter) | [generate/route.ts:212](src/app/api/generate/route.ts#L212) | anonymous + missing header |
| `compose_failed` (composer zero) | [generate/route.ts:243](src/app/api/generate/route.ts#L243) | anonymous + missing header |
| `itinerary_generated` | [generate/route.ts:362](src/app/api/generate/route.ts#L362) | anonymous + missing header |
| `itinerary_generation_failed` | [generate/route.ts:409](src/app/api/generate/route.ts#L409) | anonymous + missing header. **Highest-cost loss** — failed generations for anonymous browsers. |
| `compose_failed` (×4) | [swap-stop/route.ts:145,204,241,264](src/app/api/swap-stop/route.ts#L145) | anonymous + missing header |
| `stop_swapped` | [swap-stop/route.ts:322](src/app/api/swap-stop/route.ts#L322) | anonymous + missing header — the only successful-swap event lost |
| `compose_failed` (×4) | [add-stop/route.ts:110,151,184,209](src/app/api/add-stop/route.ts#L110) | anonymous + missing header |

**Note:** the four client fetches above all spread `getAnalyticsHeaders()`, so the only realistic missing-header path is a non-browser caller (curl, integration tests, server-to-server). For real product traffic, the risk is concentrated on **anonymous browser sessions** that haven't yet posthog-identified, which can happen before `posthog-js` finishes init.

---

## 4. Property standard

### Canonical compose-context property set
```
occasion, vibe, budget (tier), neighborhoods (groups),
day, start_time / end_time (window), itinerary_id (where applicable)
```

### Event coverage table

Legend: `full` = all canonical context present; `partial` = some but not all; `missing` = none of the compose context.

| event | coverage | missing properties |
| --- | --- | --- |
| `user_signed_up` | missing | full set |
| `user_signed_in` | missing | full set |
| `user_signed_out` | missing | full set |
| `compose_started` | missing | full set (only `entry_source`) |
| `compose_step_completed` | partial | occasion, vibe, budget, neighborhoods, day, window |
| `compose_start_time_selected` | missing | full set |
| `compose_submitted` | partial | end_time, itinerary_id |
| `compose_abandoned` | missing | full set |
| **`itinerary_generated`** | **full** | — |
| `itinerary_generation_failed` | partial | end_time |
| `compose_failed` | partial | occasion, vibe, itinerary_id |
| `itinerary_viewed` | partial | occasion, vibe, budget, neighborhoods, day, window |
| `itinerary_dwell_time` | partial | occasion, vibe, budget, neighborhoods, day, window |
| `itinerary_zero_engagement` | partial | same as dwell |
| `itinerary_extended_to_three` | partial | occasion, budget, neighborhoods, day, window, itinerary_id |
| `stop_swapped` | partial | budget, neighborhoods, day, window, itinerary_id |
| `stop_swap_reason_*` (3 events) | partial | occasion, budget, neighborhoods, day, window, itinerary_id |
| `stop_added` | partial | day, window, itinerary_id |
| `time_slot_selected` | missing | full set |
| `reservation_clicked` | missing | full set |
| `maps_opened` | missing | full set |
| `venue_detail_opened` | missing | full set |
| `itinerary_map_pin_tapped` | missing | full set |
| `itinerary_map_expanded` | missing | full set |
| `itinerary_saved` | partial | day, window |
| `itinerary_calendar_added` | partial | — (event-specific) |
| `share_link_visited` | partial | — |
| `share_link_copied` | partial | — |

Only **`itinerary_generated`** carries the full canonical set. Every engagement event on the itinerary page (`reservation_clicked`, `time_slot_selected`, `maps_opened`, `venue_detail_opened`, the two map events) carries *zero* compose-context properties — making cohort segmentation by tier / vibe / neighborhood impossible without a join.

### PII risks

| property | event(s) | file:line | risk |
| --- | --- | --- | --- |
| `reason_text` | `stop_swap_reason_submitted` | [swap-reason.ts:74-86](src/lib/itinerary/swap-reason.ts#L74-L86), [itinerary/page.tsx:226-234](src/app/itinerary/page.tsx#L226-L234) | **Free-text from the "Other" swap-reason field.** Flows raw into PostHog AND the Supabase mirror. Users can type anything — names, slurs, third-party complaints. |
| `venue_name` (with `venue_id`) | many engagement + server events | multiple sites | Denormalized redundant data. Combined with `distinct_id` history this becomes a personal venue-visit log. |
| `slot_time` / `time` | `time_slot_selected`, `reservation_clicked` | [StopAvailability.tsx:232](src/components/itinerary/StopAvailability.tsx#L232) | Reservation slot times. Combined with venue + day + distinct_id = "where this person dined and when." Calendar-export-class sensitivity. |
| `neighborhoods` (slugs) | `compose_submitted`, `itinerary_generated`, etc. | [QuestionnaireShell.tsx:139](src/components/questionnaire/QuestionnaireShell.tsx#L139), [generate/route.ts:372,378](src/app/api/generate/route.ts#L372) | Per-user neighborhood history builds a home/work geographic profile. |
| `venue_ids[]`, `categories[]`, `neighborhoods_used[]` | `itinerary_generated` | [generate/route.ts:375-378](src/app/api/generate/route.ts#L375-L378) | Server-side event echoes the full composed itinerary. Largest single PII surface. |
| `error_message` (200-char slice) | `itinerary_generation_failed` | [generate/route.ts:420](src/app/api/generate/route.ts#L420) | `Error.message` serialized into the event. Not enforced PII-clean — any future thrown error embedding a user value would leak. |
| `entry_source` / `signup_source` | `compose_started`, `$identify` `$set_once` | [QuestionnaireShell.tsx:104](src/components/questionnaire/QuestionnaireShell.tsx#L104), [AuthProvider.tsx:122-125](src/components/providers/AuthProvider.tsx#L122-L125) | Referrer-derived; sanitized to pathname-prefix tokens (low risk). The `ref_${ref}` branch passes raw querystring value — slight escalation. |
| `name` | (not currently set) | [AuthProvider.tsx:17-22](src/components/providers/AuthProvider.tsx#L17-L22) | Comment explicitly says we do NOT push name/email/phone to PostHog. `profile.name` is in scope at line 113 — flagged as a future regression risk. |

---

## 5. Failure event reconciliation

| event | sites | who fires when |
| --- | --- | --- |
| `compose_failed` | 9 sites (3 in generate, 4 in swap-stop, 4 in add-stop, sometimes split for clarity) | **Expected** zero-pool failures from the strict-filters change. Keyed by `zeroing_stage` ∈ `{exclusions, hours, neighborhood, budget, proximity, drinks, fit}`. Returns HTTP 422 with typed `ComposeFailure` body. |
| `itinerary_generation_failed` | 1 site | [generate/route.ts:409](src/app/api/generate/route.ts#L409) — outer try/catch. **Unexpected** exception (`fetchActiveVenues` throws, Mapbox/Resy outage during enrichment, Gemini timeout). Returns HTTP 500. **No analogue in swap-stop / add-stop** (their outer catches return generic 500 without an event). |

**Mutually exclusive by design.** The 422 path emits `compose_failed` and the 500 path emits `itinerary_generation_failed`. The two events answer different funnel questions: "what user-input combos are unsatisfiable" vs "what's broken in our stack."

**Which should survive: both.** The boundary needs to stay explicit. Conflating them erases the distinction between "user picked a thin neighborhood combo" (acceptable, surface a typed failure) and "Mapbox died" (page engineering). Item 7 also flags the missing 500-path analogues for swap-stop (`stop_swap_failed`) and add-stop (`add_stop_failed`).

---

## 6. Env leakage + mirror parity

### Env gating today: **none**

[instrumentation-client.ts:3](instrumentation-client.ts#L3) calls `posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, …)` unconditionally on every browser load. The only env-conditional behavior is `debug: process.env.NODE_ENV === "development"` ([line 14](instrumentation-client.ts#L14)), which toggles console verbosity — not destination.

[src/lib/posthog-server.ts:11-22](src/lib/posthog-server.ts#L11-L22) `getPostHogServer` initializes whenever `POSTHOG_KEY` is set. Sole gate: "is the key present." No `VERCEL_ENV` or `NEXT_PUBLIC_VERCEL_ENV` reference anywhere in the repo (`grep -rn VERCEL_ENV` returns zero).

### Where env gating belongs

| file:line | suggested gate |
| --- | --- |
| [instrumentation-client.ts:3](instrumentation-client.ts#L3) | wrap `posthog.init` to run only when `process.env.NEXT_PUBLIC_VERCEL_ENV === "production"`, or swap to per-env keys (`NEXT_PUBLIC_POSTHOG_KEY_PROD` / `_PREVIEW`) |
| [instrumentation-client.ts:10-13](instrumentation-client.ts#L10-L13) | session recording should be prod-only; preview/dev recordings are noise in the recording quota |
| [src/lib/posthog-server.ts:12-13](src/lib/posthog-server.ts#L12-L13) | extend early-return: `if (!key || process.env.VERCEL_ENV !== "production") return null;` |
| [src/lib/analytics-server.ts:74-85](src/lib/analytics-server.ts#L74-L85) | Supabase mirror write should also be env-gated (or pointed at a dev project) |
| [src/app/api/analytics/track/route.ts:49-55](src/app/api/analytics/track/route.ts#L49-L55) | mirror endpoint accepts inserts from any environment; needs same `VERCEL_ENV` gate |

### Leakage scenarios

1. Every Vercel preview deploy fires every client event (`compose_started`, `itinerary_viewed`, `pageview`, `pageleave`) into the prod PostHog project.
2. Preview server routes fire every server event (`itinerary_generated`, `compose_failed`, `stop_swapped`, `itinerary_generation_failed`) into prod PostHog AND into the prod `composer_analytics_events` Supabase mirror via the unconditional `insert` at [analytics-server.ts:76-82](src/lib/analytics-server.ts#L76-L82).
3. localhost dev with `.env.local` keys set: every developer interaction ships to prod.
4. Session recordings ship on every env with the key set → prod recording quota.
5. `/api/analytics/track` writes via service-role Supabase regardless of env.
6. `posthog.identify` calls from [AuthProvider.tsx:122](src/components/providers/AuthProvider.tsx#L122) fire on every env — preview testers signing in as themselves merge dev/test sessions into their prod identity timeline.

### Mirror parity

**The mirror is a parallel write, not a webhook.** No Supabase trigger. Two write paths:
- **Client**: [analytics.ts:82](src/lib/analytics.ts#L82) calls `posthog.capture(...)`, then [lines 99-108](src/lib/analytics.ts#L99-L108) fire-and-forget POST to `/api/analytics/track`; route at [analytics/track/route.ts:49-55](src/app/api/analytics/track/route.ts#L49-L55) writes via service-role Supabase.
- **Server**: [analytics-server.ts:62-67](src/lib/analytics-server.ts#L62-L67) calls `posthog.capture(...)` then `flush()`, then [lines 75-82](src/lib/analytics-server.ts#L75-L82) does its own `supabase.from("analytics_events").insert(...)` via the service-role client.

Each write is independently try/caught — either side can succeed while the other fails.

#### PostHog-only (mirror cannot reach)
1. `$pageview` (autocaptured by posthog-js via `capture_pageview: true` at [instrumentation-client.ts:8](instrumentation-client.ts#L8)) — bypasses `track()`.
2. `$pageleave` ([instrumentation-client.ts:9](instrumentation-client.ts#L9)) — same.
3. Session recording events ([instrumentation-client.ts:10-13](instrumentation-client.ts#L10-L13)) — direct to PostHog ingest.
4. `$identify` ([AuthProvider.tsx:122](src/components/providers/AuthProvider.tsx#L122)) `posthog.identify(s.user.id, undefined, { signup_at, signup_source })` — direct posthog-js call.
5. Person properties via `setPersonProperties{,Once}` / `incrementPersonProperty` ([analytics.ts:142-173](src/lib/analytics.ts#L142-L173)) — comment at [line 140](src/lib/analytics.ts#L140) acknowledges "No Supabase mirror — person properties live on PostHog only."
6. `$reset` on signout ([AuthProvider.tsx:186](src/components/providers/AuthProvider.tsx#L186)) — direct call.
7. Any client `track()` fired BEFORE PostHog finishes init: `get_distinct_id()` is undefined ([analytics.ts:89-95](src/lib/analytics.ts#L89-L95)) → function returns early before calling `/api/analytics/track`. PostHog buffers internally and delivers; the mirror row is silently dropped.
8. Any client `track()` whose fire-and-forget fetch fails — caught at [analytics.ts:114-116](src/lib/analytics.ts#L114-L116) with comment "PostHog still has the data."

#### Mirror-only (PostHog cannot reach)
1. When `POSTHOG_KEY` is unset on a server env, `getPostHogServer()` returns null at [posthog-server.ts:12-13](src/lib/posthog-server.ts#L12-L13) and `trackServer` skips the PostHog capture at [analytics-server.ts:60](src/lib/analytics-server.ts#L60) — but proceeds to the Supabase insert. Every server event lands in `composer_analytics_events` but never reaches PostHog.
2. When the PostHog server capture throws — caught at [analytics-server.ts:68-70](src/lib/analytics-server.ts#L68-L70) — control falls through to the Supabase insert. PostHog drops; Supabase keeps.
3. The `/api/analytics/track` endpoint has no PostHog side — a malicious or buggy client that POSTs directly to it would land a row in the mirror with no PostHog counterpart. Today the only caller is the wrapper which always captures first, but the endpoint allows mirror-only writes.

---

## 7. Gaps (recommendations)

These are the only event additions proposed in this audit, per the spec's scope.

| gap area | proposed event | properties | fire condition | rationale |
| --- | --- | --- | --- | --- |
| disabled-tier interaction | `budget_tier_disabled_tap` | `tier`, `group_ids`, `groups_selected_count`, `step_index`, `time_on_step_ms` | User taps a budget card in `disabledBudgetTiers` ([QuestionnaireShell.tsx:248-259](src/components/questionnaire/QuestionnaireShell.tsx#L248-L259)) | The strict-filters change removed budget upward widening. This is the only way to measure suppressed demand and decide whether to revisit widening. |
| hidden-group absence | `neighborhood_step_hidden_groups_observed` | `hidden_group_ids`, `visible_group_ids`, `hidden_count`, `visible_count`, `step_index` | Once when NeighborhoodPicker mounts inside the questionnaire ([NeighborhoodPicker.tsx:90](src/components/shared/NeighborhoodPicker.tsx#L90) — the `filtered` computation) | The set of hidden groups IS the sourcing backlog. Without this we can't correlate hidden geographies to abandonment. |
| share funnel | `share_link_generated` | `itinerary_id`, `share_id`, `surface`, `saved_itinerary_id`, `time_to_generate_ms` | Client-side from `LooksGoodCTA.ensureShareUrl` ([LooksGoodCTA.tsx:68-92](src/components/itinerary/LooksGoodCTA.tsx#L68-L92)) when `/api/share` resolves | We have Share intent (copy) and Share landing (visit) but no Share *generated*. Failures and pre-copy dropoff are invisible today. |
| share funnel | `share_recipient_composed` | `share_id`, `entry_source`, `is_authenticated`, `time_since_visit_ms` | From QuestionnaireShell mount effect ([QuestionnaireShell.tsx:101-105](src/components/questionnaire/QuestionnaireShell.tsx#L101-L105)) when `deriveEntrySource()` returns `share_link` | Share-to-compose is the core viral loop. PostHog should answer `share_link_visited` → `share_recipient_composed` directly. |
| share funnel | `share_to_save_converted` | `share_id`, `saved_itinerary_id`, `time_since_visit_ms` | When a user lands on `/itinerary/share/[id]`, composes, and saves — emit from `LooksGoodCTA` save path | Conversion that drives retention. Today only the bookends exist (`share_link_visited`, `itinerary_saved`); nothing connects them. |
| saved-itinerary revisit | `saved_itinerary_revisited` | `itinerary_id`, `is_past`, `entry_source`, `days_since_saved` | From [saved/[id]/page.tsx:64-72](src/app/itinerary/saved/[id]/page.tsx#L64-L72) — distinguish first view from revisits | `itinerary_viewed` with `source="saved"` conflates post-save bounce with real revisits. Revisit rate is a separate north-star metric. |
| strict-filters orphan | `compose_failed_visible_state` | `zeroing_stage`, `endpoint`, `tier`, `group`, `day`, `window` | Client-side from [itinerary/page.tsx:131-132](src/app/itinerary/page.tsx#L131-L132) (`setComposeFailureState(err.failure)`) | Without it we can't compute server-`compose_failed` → visible-422 conversion to know if our error UI is rendering. |
| other | `stop_swap_failed` | `stop_index`, `stop_role`, `zeroing_stage`, `reason`, `time_to_fail_ms` | Server-side from swap-stop catch ([swap-stop/route.ts:349-354](src/app/api/swap-stop/route.ts#L349-L354)) | Swap is the most-used post-generation engagement; we capture successes (`stop_swapped`) but not 500-class failures. |
| other | `add_stop_failed` | `zeroing_stage`, `reason`, `current_stop_count`, `time_to_fail_ms` | Server-side from add-stop catch ([add-stop/route.ts:278-283](src/app/api/add-stop/route.ts#L278-L283)) | Same gap as swap; the structured 422 path emits `compose_failed` but the 500 catch is silent. |
| registration debt | `compose_abandoned` (registry) | already fired at [compose-abandoned.ts:130-133](src/lib/analytics/compose-abandoned.ts#L130) | n/a | Not a missing event but a mismatch — the registry has the symbol; the emitter uses a literal. Symptom of the use-client problem in item 9. |

---

## 8. Mirror parity (cross-ref to §6)

Covered fully in §6 under "Mirror parity." Summary count:
- **8 PostHog-only** event/property classes (pageview, pageleave, recordings, identify, person props, reset, pre-init events, fetch-failure mode).
- **3 mirror-only** classes (POSTHOG_KEY-unset server, capture-throws server, direct `/api/analytics/track` writes).

---

## 9. Shared-model readiness (rename map + consolidation prep)

### Event-name string literals outside the EVENTS registry (47 sites)

Every single `track`/`trackServer` call uses a bare string literal except [WhenStep.tsx:81](src/components/questionnaire/WhenStep.tsx#L81) which is the lone `EVENTS.COMPOSE_START_TIME_SELECTED` consumer. Highlights (full enumeration in §1 by surface):

| event (literal) | sites |
| --- | --- |
| `compose_failed` | 9 (all server) |
| `compose_started` / `compose_step_completed` / `compose_submitted` | 3 (QuestionnaireShell) |
| `user_signed_*` | 2 (AuthProvider) |
| `itinerary_viewed` | 3 (fresh, saved, share pages) |
| `reservation_clicked` | 6 (StopCard, StopAvailability ×4, VenueDetailModal) |
| `maps_opened` | 3 (ActionBar, share page, VenueDetailModal) |
| `itinerary_calendar_added` | 2 (ConfirmModal — Google + iCal surfaces) |
| `share_link_*` | 2 (ConfirmModal, share page) |

### Raw posthog imports outside the wrappers

| site | usage |
| --- | --- |
| [instrumentation-client.ts:1](instrumentation-client.ts#L1) | `posthog.init(...)` — expected (init module) |
| [AuthProvider.tsx:35](src/components/providers/AuthProvider.tsx#L35) | `posthog.identify` at line 122, `posthog.reset()` at line 186 — session management, bypasses mirror |

### use-client directive consequence

[src/lib/analytics.ts:1](src/lib/analytics.ts#L1) declares `"use client";`. The module exports both `EVENTS` (registry) and `track()`. Because the registry ships from a client module, **importing it from a server route handler would Next.js-compile as a Client Component**, which doesn't make sense in route handlers. So every server-side `trackServer` caller writes the event name as a bare string literal — this is the proximate cause of the 9 free-floating `compose_failed` sites and the unregistered server `itinerary_generated` / `itinerary_generation_failed` / `stop_swapped`.

### Hand-assembled compose-context payloads (16 sites)

Every server event payload reassembles `{occasion, vibe, budget, day, neighborhoods, …}` inline rather than reading from a canonical builder. Highlights:

| site | what's reassembled |
| --- | --- |
| [generate/route.ts:54-61](src/app/api/generate/route.ts#L54-L61) | `trackComposeFailed` helper inlines `{endpoint, zeroing_stage, group, tier, day, window}` |
| [generate/route.ts:365-384](src/app/api/generate/route.ts#L365-L384) | `itinerary_generated` payload |
| [generate/route.ts:413-422](src/app/api/generate/route.ts#L413-L422) | `itinerary_generation_failed` payload |
| [swap-stop/route.ts:148-274](src/app/api/swap-stop/route.ts#L148) | 4 duplicate `compose_failed` payloads (one per zeroing branch) |
| [swap-stop/route.ts:325-338](src/app/api/swap-stop/route.ts#L325-L338) | `stop_swapped` payload |
| [add-stop/route.ts:113-219](src/app/api/add-stop/route.ts#L113) | 4 duplicate `compose_failed` payloads |
| [QuestionnaireShell.tsx:138-145](src/components/questionnaire/QuestionnaireShell.tsx#L138) | `compose_submitted` payload |
| [itinerary/page.tsx:297-316](src/app/itinerary/page.tsx#L297) | `stop_added` and `itinerary_extended_to_three` payloads |
| [LooksGoodCTA.tsx:118-125](src/components/itinerary/LooksGoodCTA.tsx#L118) | `itinerary_saved` payload |

### Rename map (snake_case `object_action`)

Fresh PostHog project incoming → renames are free. Every current event name + proposed name; events that already conform are listed for completeness.

| current | proposed | object.action | notes |
| --- | --- | --- | --- |
| `user_signed_up` | `user_signed_up` | user.signed_up | conforms |
| `user_signed_in` | `user_signed_in` | user.signed_in | conforms |
| `user_signed_out` | `user_signed_out` | user.signed_out | conforms |
| `compose_started` | `compose_started` | compose.started | conforms |
| `compose_step_completed` | `compose_step_completed` | compose_step.completed | conforms (compound object) |
| `compose_start_time_selected` | `compose_start_time_selected` | compose_start_time.selected | conforms |
| `compose_submitted` | `compose_submitted` | compose.submitted | conforms |
| `compose_abandoned` | `compose_abandoned` | compose.abandoned | conforms; **register me** |
| `compose_failed` | `compose_failed` | compose.failed | conforms; **register me** |
| `itinerary_generated` | **`itinerary_composed`** | itinerary.composed | rename — "composed" is the product verb (Composer); "generated" is generic |
| `itinerary_generation_failed` | **`itinerary_compose_failed`** | itinerary.compose_failed | rename for symmetry; distinct from `compose.failed` because it represents system failure during composition |
| `itinerary_viewed` | `itinerary_viewed` | itinerary.viewed | conforms |
| `itinerary_dwell_time` | **`itinerary_dwelled`** | itinerary.dwelled | rename: noun→verb; `_dwell_time` reads like a property |
| `itinerary_zero_engagement` | **`itinerary_abandoned`** | itinerary.abandoned | rename: aligns with compose_abandoned |
| `itinerary_extended_to_three` | **`itinerary_extended`** | itinerary.extended | rename: drop magic number; move to `final_stop_count` prop |
| `stop_swapped` | `stop_swapped` | stop.swapped | conforms |
| `stop_swap_reason_shown` | **`swap_reason_shown`** | swap_reason.shown | rename: collapse redundant `stop_` prefix |
| `stop_swap_reason_submitted` | **`swap_reason_submitted`** | swap_reason.submitted | rename: same |
| `stop_swap_reason_skipped` | **`swap_reason_skipped`** | swap_reason.skipped | rename: same |
| `stop_added` | `stop_added` | stop.added | conforms |
| `time_slot_selected` | `time_slot_selected` | time_slot.selected | conforms |
| `reservation_clicked` | `reservation_clicked` | reservation.clicked | conforms |
| `maps_opened` | `maps_opened` | maps.opened | conforms |
| `venue_detail_opened` | `venue_detail_opened` | venue_detail.opened | conforms |
| `itinerary_map_pin_tapped` | **`map_pin_tapped`** | map_pin.tapped | rename: drop redundant `itinerary_` prefix |
| `itinerary_map_expanded` | **`map_expanded`** | map.expanded | rename: same |
| `itinerary_saved` | `itinerary_saved` | itinerary.saved | conforms |
| `itinerary_calendar_added` | **`calendar_added`** | calendar.added | rename: drop `itinerary_` prefix; `provider` prop already discriminates google vs ical |
| `share_link_copied` | `share_link_copied` | share_link.copied | conforms |
| `share_link_visited` | `share_link_visited` | share_link.visited | conforms |
| `onboarding_completed` | `onboarding_completed` | onboarding.completed | conforms |
| `error_encountered` | `error_encountered` | error.encountered | conforms; **orphan — zero callers** |
| `feature_blocked` | `feature_blocked` | feature.blocked | conforms; **orphan — zero callers** |

**Summary of renames:** 8 events change name; 2 already-conforming events should be added to the registry (`compose_abandoned`, `compose_failed`); 2 orphans should be evaluated for use or deletion.

---

## What's NOT in this report

- Threshold or sampling recommendations.
- Code edits beyond items 7 and 9.
- Recommendations on engagement-counter calibration or session-stitching strategy.
- Any change to the auth identify flow.
- Recommendations on whether to keep PostHog session recordings.
- Anything in the runtime catch-all error tracking (Sentry-class) layer — that's adjacent to but distinct from this analytics audit.
