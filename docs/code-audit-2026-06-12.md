# Code audit — 2026-06-12

## Summary

### Counts by dimension

| Dimension | Confirmed |
|---|---|
| duplication | 13 |
| sst | 1 |
| dead_code | 11 |
| abstraction | 7 |
| architecture | 5 |
| efficiency | 0 |
| tests | 4 |
| doc_drift | 13 |
| known_target | 3 |
| **Total confirmed** | **57** |
| **Refuted** | **6** |

### Counts by tier

| Tier | Confirmed |
|---|---|
| safe-now | 33 |
| post-launch | 19 |
| not-worth-it | 5 |

### Highest-leverage recommendations

1. [Extract `<BottomSheetModal>` primitive](#bottom-sheet-modal-shell-duplicated-across-3-sites-deferred-audit-item-29-still-open--post-launch--duplication) — three modals (VenueDetailModal, SwapReasonModal, ConfirmModal) reimplement the same backdrop + sheet + Esc + scroll-lock + sticky-header recipe with subtle correctness drift on each (some hand-roll the prev-overflow capture, some don't; some use stable-ref for Esc, some re-bind). One primitive collapses ~250 lines and resolves the drift.
2. [Extract `readComposeUserPrefs(fields)` server helper](#readdrinkspref--readauthedprefs-re-implemented-three-times-in-stop-mutation-routes--safe-now--duplication) — three compose routes duplicate the `composer_users` SELECT and silently disagree on error handling (generate logs, swap-stop/add-stop swallow). Single helper unblocks future profile-field-driven scoring (dietary, etc.) becoming a one-site edit.
3. [Centralize `price_tier ?? 2` policy in `src/config/budgets.ts`](#price_tier--2-policy-fallback-inlined-at-10-sites-instead-of-a-single-helper--post-launch--duplication) — 10-site duplication of the documented "null treated as tier 2" policy. The cleanest fix folds the fallback into existing `spendEstimate()` / `calculateTotalSpend()` formatters (collapses 7 of 10 sites) plus a `resolvedPriceTier()` helper for the remaining 3.
4. [Extract `buildWalk(from, to)` to `src/lib/walking-routes.ts`](#buildwalkfrom-to-walk-segment-construction-duplicated-across-three-routes--safe-now--duplication) — swap-stop has the helper, add-stop and generate inline byte-identical sequences. Lift-and-shift, zero behavioral risk.
5. [Move `encodeGeoJsonLineToPolyline` out of `walking-routes.ts` into a pure `polyline.ts` module](#server-only-walking-routes-module-leaks-into-the-client-bundle-via-mapboxts--savedplanrowexpanded--post-launch--architecture) — client component `SavedPlanRowExpanded` transitively pulls server-only code (Supabase service-role import, `MAPBOX_SERVER_TOKEN` reference) into the browser bundle via the `mapbox.ts` → `walking-routes.ts` import chain. Boundary-hygiene + bundle-bloat win in one move.
6. [Refresh CLAUDE.md's Project Structure block](#project-structure-is-significantly-incomplete-missing-routes-dirs-files--safe-now--doc_drift) — the frozen snapshot omits `src/hooks/`, 4 API routes, 3 app pages, the entire `components/venue/` dir, `lib/format/`, `lib/analytics/`, and ~30 individual files including the entire lucky stack. New contributors cannot rely on it as a map.
7. [Fix CLAUDE.md questionnaire taxonomy docs](#questionnaire-occasion-documented-as-5-options-code-has-3-buckets-datefriendssolo--safe-now--doc_drift) — occasion, vibe, and budget step descriptions are all pre-bucket-rename stale. Document says 5 occasions / 4 vibes / 5 budgets; code ships 3 / 3 / 3.
8. [Extract `parseComposeFailureResponse(res, fallbackStage)` to `compose-failure.ts`](#client-side-422--parse-composefailure-body--fall-back-to-proximity-pattern-repeats-four-times--post-launch--abstraction) — four client sites duplicate the 422 parse-and-fall-back pattern with a hardcoded `"proximity"` fallback that's actually wrong for the questionnaire generate path (budget/neighborhood is the more common zeroing stage). Centralizing makes the per-endpoint default visible.
9. [Add `tests/fixtures/venue.ts` and remove `as unknown as Venue` casts](#six-near-identical-venue-factories-scattered-across-unit-tests--post-launch--duplication) — 6 test files re-implement the Venue factory with 60-line default blocks; 4 of them use the double-cast escape hatch which has already let `reservation_lead_days` drift go undetected. Single typed factory force-syncs fixtures with Venue evolution.
10. [Delete `setPersonPropertiesOnce` + `reidss_claude/` cleanup confirmations](#dead-analytics-helper-setpersonpropertiesonce-has-zero-call-sites--safe-now--known_target) — closes the known-target ledger from the analytics rename wave. The doc-comment still claims the helper owns `signup_at`/`signup_source` writes; AuthProvider bypasses it directly.

---

## Confirmed findings

### duplication

#### `Die SVG markup duplicated across three components` — `safe-now` — `duplication`

- **Location**: `src/components/itinerary/CompositionHeader.tsx:155-174`
  - Additional sites: `src/components/itinerary/LuckyBanner.tsx:53-71`, `src/components/home/LuckyDieButton.tsx:116-135`
- **Rule violated**: CODING_STANDARDS.md §2 "Components and patterns get extracted aggressively" (used in 3 places) + §7 smell-test "Copy-pasting a function or JSX block"
- **Evidence**: All three sites render the same 5-pip die SVG verbatim: `<rect x="3" y="3" width="18" height="18" rx="4" />` followed by five identical `<circle cx="8.5" cy="8.5" ...>` ... `<circle cx="15.5" cy="15.5" ...>` calls. Only the wrapper size, container color class, and `data-testid` differ. CompositionHeader's TitleDie (22px, variant burgundy/crown), LuckyBanner's BannerDie (18px, variant burgundy/crown), and LuckyDieButton's DieGlyph (size prop, currentColor) are three near-identical copies of the same glyph.
- **Verify**: All three cited sites confirmed verbatim. CompositionHeader.tsx:155-174 (TitleDie, 22px), LuckyBanner.tsx:53-71 (BannerDie, 18px), and LuckyDieButton.tsx:116-135 (DieGlyph, prop size) all render identical SVG geometry: `<rect x="3" y="3" width="18" height="18" rx="4" />` + 5 pips at identical `cx`/`cy`/`r="1.1"` coords. Stroke attrs (width 1.8, linejoin round), viewBox (0 0 24 24), fill/stroke setup are all identical. Only wrapper variance is size, color class, and optional data-testid/className — trivially parameterizable. A single `<DieGlyph size colorClass testId? extraClass? />` consumed from three sites is a net win. grep for `cx="8.5" cy="8.5" r="1.1"` returns exactly the three cited files; grep for `rect x="3" y="3" width="18" height="18" rx="4"` returns the same three. No additional duplicates elsewhere.
- **Recommendation**: Extract one `<DieGlyph size colorClass />` (or a static `assets/die.svg` imported as a React component) and consume from the three sites.

#### `Itinerary long-date formatter duplicated between dateUtils and CompositionHeader` — `safe-now` — `duplication`

- **Location**: `src/components/itinerary/CompositionHeader.tsx:11-20`
  - Additional sites: `src/lib/dateUtils.ts:91-100`
- **Rule violated**: CODING_STANDARDS.md §6 "Display formatting helpers belong in the canonical module"
- **Evidence**: CompositionHeader defines a local `formatItineraryDate(isoDate)`: splits YYYY-MM-DD, constructs `new Date(year, month-1, day)`, returns `toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })`. `dateUtils.formatPastDateLabel` does the same (noon-anchored variant) with the identical `{ weekday: "long", month: "long", day: "numeric" }` format. Two formatters that produce the same shape ("Sunday, May 11"), living in two places, with neighboring code in CompositionHeader already importing `formatWindowLabel` from `time-blocks`.
- **Verify**: Both functions exist as described with identical formatter options producing identical output shapes. The pattern violates the explicit "Display formatting lives with the data" principle in CLAUDE.md's Coding Standards. CompositionHeader.tsx:11-20 declares `formatItineraryDate(isoDate)` which constructs `new Date(year, month-1, day)` (midnight-anchored, not DST-safe). dateUtils.ts:91-100 declares `formatPastDateLabel(dayISO)` doing the same — validates shape, splits ISO, constructs `new Date(y, m-1, d, 12, 0, 0)` (noon-anchored, DST-safe), and calls the identical `toLocaleDateString` with the same options. Consolidating onto the dateUtils version would fix a latent DST drift bug in CompositionHeader.
- **Recommendation**: Move/rename the formatter into `src/lib/dateUtils.ts` (e.g. `formatLongDateLabel`) and have `formatPastDateLabel` + `CompositionHeader` consume the one helper.

#### `PostHog x-ph-* header extraction inlined in every mutation route` — `safe-now` — `duplication`

- **Location**: `src/app/api/generate/route.ts:99-100`
  - Additional sites: `src/app/api/add-stop/route.ts:54-55`, `src/app/api/swap-stop/route.ts:94-95`
- **Rule violated**: CODING_STANDARDS.md §7 "Typing a string literal that exists elsewhere in the codebase" + §1 SoT
- **Evidence**: Each route opens with `const distinctId = request.headers.get("x-ph-distinct-id"); const sessionId = request.headers.get("x-ph-session-id");`. The matching client-side builder already lives in `src/lib/analytics.ts:135-146` (`getAnalyticsHeaders()`) — the symmetric server reader does not, so the literal header strings live in three call sites. Risk: renaming a header (or adding a new one like a request_id) means editing three files in lockstep.
- **Verify**: All three cited file:line references match verbatim. The client-side writer in `src/lib/analytics.ts:137-146` is the asymmetric pair. CLAUDE.md's analytics section emphasizes wrappers-only and typed schemas as single-source-of-truth for PostHog plumbing; the header strings fit the same logic. grep across the whole tree confirms exactly four files reference these header strings: the writer and the three readers cited.
- **Recommendation**: Add `readAnalyticsHeaders(request: Request): { distinctId: string|null; sessionId: string|null }` in `src/lib/analytics-server.ts` next to the client writer and consume from all three routes.

#### `buildWalk(from, to) walk-segment construction duplicated across three routes` — `safe-now` — `duplication`

- **Location**: `src/app/api/swap-stop/route.ts:67-91`
  - Additional sites: `src/app/api/add-stop/route.ts:212-240`, `src/app/api/generate/route.ts:286-312`
- **Rule violated**: CODING_STANDARDS.md §2 "Components and patterns get extracted aggressively"
- **Evidence**: swap-stop ships an explicit `async function buildWalk(from: Venue, to: Venue): Promise<WalkSegment>` that computes `walkTimeMinutes`+`walkDistanceKm`, calls `fetchOrCacheWalkingRoute(from.id,to.id,[from.lng,from.lat],[to.lng,to.lat],fallbackMinutes,Math.round(fallbackKm*1000))`, then assembles `{from:from.name,to:to.name,distance_km:route.routeGeometry?route.walkDistanceMeters/1000:fallbackKm,walk_minutes:route.walkMinutes,route_geometry:route.routeGeometry ?? undefined}`. add-stop/route.ts:212-240 inlines the identical sequence for the new last-stop walk, and generate/route.ts:286-312 inlines the same call-shape inside a `walks.map(...)`.
- **Verify**: swap-stop/route.ts:67-91 defines buildWalk(from,to) exactly as described. add-stop/route.ts:212-240 inlines the byte-identical sequence (same fallback computation, same fetchOrCacheWalkingRoute argument order, same WalkSegment field shape). generate/route.ts:286-312 is structurally similar but operates on pre-built walks — the shared primitive there is `enrichWalkWithRoute(walk, fromVenue, toVenue)`, or have generate use buildWalk(from,to) and skip the pre-population. lib/walking-routes.ts already houses fetchOrCacheWalkingRoute — natural home for buildWalk. Swap-stop+add-stop dedup alone is a clear win even if generate stays as-is.
- **Recommendation**: Lift `buildWalk(from, to)` into `src/lib/walking-routes.ts` (or `src/lib/itinerary/walk-segment.ts`) and call from all three routes.

#### `readDrinksPref / readAuthedPrefs re-implemented three times in stop-mutation routes` — `safe-now` — `duplication`

- **Location**: `src/app/api/add-stop/route.ts:35-51`
  - Additional sites: `src/app/api/swap-stop/route.ts:49-65`, `src/app/api/generate/route.ts:70-93`
- **Rule violated**: CODING_STANDARDS.md §1 "Single source of truth for shared values" + §2 "used in 2+ places — extract"
- **Evidence**: add-stop and swap-stop ship byte-identical `readDrinksPref` helpers (`try { getServerSupabase → getUser → .from("composer_users").select("drinks").eq("id", user.id).maybeSingle() } catch { return defaults }`) — same return shape `{ userId, drinks }`. generate/route.ts has the same skeleton as `readAuthedPrefs` returning the same fields plus `name`. Three near-identical Supabase queries against composer_users for the personalization/hard-filter inputs.
- **Verify**: All three cited helpers exist verbatim. The three queries hit the same `composer_users` row for the same purpose (personalization + drinks hard-filter). No `src/lib/auth-prefs.ts` or equivalent exists. The recommended extraction (`loadAuthedPrefs({ includeName?: boolean })`) is mechanical, pure refactor, no contract change. Other `composer_users` queries elsewhere serve genuinely different purposes (admin `is_admin` checks, the `/api/profile` write path, client-side onboarding read in `AuthScreen.tsx`) and are NOT additional sites.
- **Recommendation**: Extract `loadAuthedPrefs({ includeName?: boolean })` into a shared lib helper (e.g. `src/lib/auth-prefs.ts`) and consume from all three routes.

#### `Two implementations of Date → local YYYY-MM-DD (toLocalISODate) plus a third in dateUtils` — `safe-now` — `duplication`

- **Location**: `src/components/ui/DatePicker.tsx:62-67`
  - Additional sites: `src/components/questionnaire/WhenStep.tsx:44-49`, `src/lib/dateUtils.ts:45-51`, `src/lib/lucky.ts:54-59` (isoDateToday — same body, different name)
- **Rule violated**: CODING_STANDARDS.md §1 (Single source of truth for shared values) + §3 (Audit before adding)
- **Evidence**: DatePicker.tsx:62-67 and WhenStep.tsx:44-49 each define a private `function toLocalISODate(d: Date): string` with identical bodies: `const y = d.getFullYear(); const m = String(d.getMonth() + 1).padStart(2, '0'); const day = String(d.getDate()).padStart(2, '0'); return ${y}-${m}-${day};`. dateUtils.ts:45-51 has `todayLocalISO()` which is the `new Date()` case. tomorrowLocalISO at dateUtils.ts:57-64 is the same body again with a `setDate(getDate()+1)` prefix.
- **Verify**: All three cited sites confirmed verbatim. A fourth duplicate site exists at src/lib/lucky.ts:54-59 — `isoDateToday(now: Date)` is literally `toLocalISODate(now)` under a different name. Refactor should also collapse this. The dateUtils.ts file header comment is already slightly broken ("`config/prompts.ts` ... and `config/prompts.ts` ... and share views both need") which is a separate doc-string bug worth a one-line fix when this lands.
- **Recommendation**: Promote `toLocalISODate(d: Date)` to dateUtils.ts; redefine `todayLocalISO() => toLocalISODate(new Date())` and `tomorrowLocalISO()` likewise; import in DatePicker + WhenStep; deprecate `isoDateToday` in lucky.ts.

#### `Walking-meta computation duplicated across generate route and saved-hydration with a hardcoded cap_min: 15` — `safe-now` — `duplication`

- **Location**: `src/app/api/generate/route.ts:39-56`
  - Additional sites: `src/lib/itinerary/saved-hydration.ts:70-76`
- **Rule violated**: CLAUDE.md §What NOT To Do (`Don't sprinkle scoring magic numbers across files. Every weight/threshold/penalty lives in src/config/algorithm.ts.`) + CODING_STANDARDS.md §1
- **Evidence**: route.ts:39-56 has `computeWalkingMeta(walks, weather)` that returns `{ longest_walk_min, total_walk_min, any_over_cap, cap_min: cap }` with `cap` from `ALGORITHM.distance.walkSoftCapMin` (=15) or `walkSoftCapMinBadWeather` (=5). saved-hydration.ts:70-76 reimplements the same shape inline with `cap_min: 15` (also wrong in bad weather where the real cap is 5) and `any_over_cap: false` (wrong-by-default). This violates CLAUDE.md's "Every threshold lives in src/config/algorithm.ts" rule.
- **Verify**: Both citations match verbatim. Note this is a fallback (`saved.walking ?? {...}`) for legacy rows where `saved.walking` is null, but the assertion still stands — the hardcode is real and the behavior is incorrect for bad-weather saves and for any rows whose walks actually exceed the cap. grep across `src/` shows only the two sites in question construct `WalkingMeta` shapes. `algorithm.ts:313` confirms `walkSoftCapMin: 15`; `:316` confirms `walkSoftCapMinBadWeather: 5`.
- **Recommendation**: Export `computeWalkingMeta` from a shared module (e.g. `src/lib/itinerary/walking-meta.ts`); have saved-hydration call it with `weather: saved.weather` so cap + any_over_cap stay consistent.

#### `Bottom-sheet modal shell duplicated across 3 sites (deferred audit item 29 still open)` — `post-launch` — `duplication`

- **Location**: `src/components/venue/VenueDetailModal.tsx:54-89`
  - Additional sites: `src/components/itinerary/SwapReasonModal.tsx:79-117`, `src/components/itinerary/ConfirmModal.tsx:81-119`, `src/components/questionnaire/CitySwitcher.tsx:38-127` (partial overlap)
- **Rule violated**: CODING_STANDARDS.md §2 (Components and patterns get extracted aggressively) + §7 (Copy-pasting a function or JSX block)
- **Evidence**: Three modals reproduce the same wrapper byte-for-byte: AnimatePresence + motion backdrop (`fixed inset-0 z-40 bg-charcoal/40` + `initial/animate/exit 0→1→0 opacity 0.2s`) + motion sheet (`fixed inset-x-0 bottom-0 z-50 bg-cream rounded-t-2xl shadow-xl max-h-[90vh] overflow-y-auto md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:max-w-{md|lg} md:w-full md:rounded-2xl md:max-h-[85vh]` + `y: '100%' → 0 → '100%'` spring damping 30 stiffness 280). Each also re-implements its own Esc handler and body scroll lock with the same shape, plus the same sticky-header recipe with grabber and 44x44 close-X. This is the modal shell cluster the visual audit item 29 deliberately deferred; it is still pending.
- **Verify**: All three cited line ranges verified verbatim. The sticky-header recipe with grabber (`mx-auto h-1 w-10 rounded-full bg-border md:hidden`) and 44x44 close-X is identical across all three. The in-source comments at SwapReasonModal:12 and ConfirmModal:7 explicitly call out "Following VenueDetailModal's visual pattern" / "Visual pattern follows VenueDetailModal + SwapReasonModal" — they self-document the copy-paste. Two refinements worth noting: (1) SwapReasonModal and ConfirmModal capture the prior `document.body.style.overflow` value before overwriting and restore to it on cleanup — VenueDetailModal restores to `""` unconditionally. The primitive should pick the prev-capture form (correct under nested modals). (2) SwapReasonModal and ConfirmModal use a stable `useRef` for the latest dismiss callback so the Esc handler depends only on `isOpen` — VenueDetailModal re-binds whenever `onClose` identity changes. The drift between these three implementations (some hand-rolled the right scroll-lock, one didn't; some hand-rolled the stable-ref pattern, one didn't) is itself the strongest argument for extraction.
- **Recommendation**: Extract `<BottomSheetModal>` primitive (backdrop + sheet + Esc + scroll-lock + sticky-header-with-grabber-and-close); have all three modals consume it. CitySwitcher would consume it with a `withGrabberInBody` variant or stay opted-out.

#### `price_tier ?? 2 policy fallback inlined at 10+ sites instead of a single helper` — `post-launch` — `duplication`

- **Location**: `src/lib/itinerary/pre-filter.ts:172`
  - Additional sites: `src/lib/scoring.ts:109`, `src/lib/composer.ts:342`, `src/lib/itinerary/saved-hydration.ts:65`, `src/app/api/generate/route.ts:319`, `src/app/api/add-stop/route.ts:207`, `src/app/api/add-stop/route.ts:245`, `src/app/api/swap-stop/route.ts:268`, `src/app/api/swap-stop/route.ts:333`, `src/app/api/health/route.ts:129`
- **Rule violated**: CLAUDE.md "What NOT To Do" → "Don't sprinkle scoring magic numbers across files. Every weight/threshold/penalty lives in src/config/algorithm.ts" (analogous policy default) + CODING_STANDARDS.md §1 SoT
- **Evidence**: CLAUDE.md states the policy: "Null `price_tier` treated as tier 2 in scoring + filter." The literal `venue.price_tier ?? 2` (or `v.price_tier ?? 2`) appears in 10 different call sites across scoring, composer, pre-filter, saved-hydration, three API routes, and health. If the policy ever changes to (say) 3 or to a per-budget default, every site has to be updated in lockstep.
- **Verify**: grep -rn "price_tier ?? 2" src/ returns exactly the 10 sites listed. `src/config/budgets.ts` already exports `PRICE_TIER_RANGES`, `BUDGET_PRIMARY_TIER`, `spendEstimate()`, `calculateTotalSpend()` — the helper would slot in naturally without new architectural surface. Several call sites combine the fallback with `spendEstimate()` or `calculateTotalSpend()` (composer.ts:342, saved-hydration.ts:65, generate:319, add-stop:207, add-stop:245, swap-stop:268, swap-stop:333), so the cleanest refactor is to push the `?? 2` INTO those formatters and have them accept `number | null` — eliminating ~7 of the 10 sites at once, with the remaining 3 (scoring, pre-filter, health) consuming a small `resolvedPriceTier()` helper.
- **Recommendation**: Add `resolvedPriceTier(venue: Pick<Venue, "price_tier">): number` (or a `PRICE_TIER_NULL_DEFAULT` constant) next to `BUDGET_TIER_MAP` in `src/config/budgets.ts` and consume everywhere.

#### `SavedPlanRow and SavedPlanRowExpanded duplicate inline-rename + confirm-delete + secondary-line + displayName + icon defs` — `post-launch` — `duplication`

- **Location**: `src/components/shared/SavedPlanRow.tsx:31-100`
  - Additional sites: `src/components/shared/SavedPlanRowExpanded.tsx:81-179`, `src/components/shared/SavedPlanRow.tsx:39-49`, `src/components/shared/SavedPlanRowExpanded.tsx:90-100`, `src/components/shared/SavedPlanRow.tsx:193-232`, `src/components/shared/SavedPlanRowExpanded.tsx:383-422`, `src/lib/itinerary/saved-hydration.ts:61` (third copy of fallback), `src/app/profile/_components/FieldPrimitives.tsx:25` (fourth `PencilIcon`)
- **Rule violated**: CODING_STANDARDS.md §2 (extract aggressively) + §6 (display formatting lives with data) + §7 (copy-pasting a function or JSX block with small modifications)
- **Evidence**: Both files independently implement the same logic blocks. (1) `displayName` fallback `plan.custom_name || plan.title || 'Saved plan'` matches byte-for-byte. (2) `secondaryLine` derivation (dayLabel + startLabel + neighborhoodSegment, `.filter(...).join(' · ')`) reproduced byte-for-byte. (3) Inline-rename state machine (`startEditing/cancelEditing/saveRename/handleKeyDown` PATCH-on-blur logic to `/api/itineraries/${plan.id}`) duplicated. (4) `[confirming, setConfirming]` + Yes/No prompt logic. (5) Inline `PencilIcon` / `TrashIcon` SVG components defined identically.
- **Verify**: All five duplication claims verified against current source. SavedPlanRow.tsx is 232 lines, SavedPlanRowExpanded.tsx is 423 lines — both within or over the 250-line guideline. The `PATCH /api/itineraries/${plan.id}` URL is also duplicated; if the endpoint ever changes, both files have to update. Both files import the same five modules (formatShortDateLabel from dateUtils; formatStartTimeLabel + startTimeFromLegacyBlock from time-blocks; neighborhoodLabel from neighborhoods) — strong signal these are the right deps for a `getPlanSecondaryLine` helper. A fourth PencilIcon definition exists at src/app/profile/_components/FieldPrimitives.tsx:25 — same name, similar SVG conventions, but different d= paths. A shared icon module would absorb it too.
- **Recommendation**: Extract `useInlineRename(plan)` + `useConfirmDelete(plan, onDelete)` hooks, hoist `getPlanSecondaryLine(plan)` to dateUtils or a new `lib/itinerary/saved-display.ts`, move `PencilIcon`/`TrashIcon` to a shared icon module.

#### `Three near-identical "Header + CompositionHeader" rendering branches across itinerary surfaces` — `post-launch` — `duplication`

- **Location**: `src/app/itinerary/page.tsx:421-440`
  - Additional sites: `src/app/itinerary/saved/[id]/page.tsx:123-142`, `src/app/itinerary/share/[id]/page.tsx:130-140`
- **Rule violated**: CODING_STANDARDS.md §2 "used in 2+ places — extract"
- **Evidence**: All three itinerary pages contain the same ternary `{isLuckyItinerary(itinerary.inputs) ? <LuckyCrown ... /> : (<><Header rightSlot={Back link or undefined}/><div className="w-full px-6 mt-6 flex flex-col items-center"><CompositionHeader header inputs/></div></>)}`. The only diffs are whether a Back link is present and whether `inputs` may be undefined (share). Test `tests/unit/lucky-render.test.ts:163-180,288-297` pins the ternary structure across all three files so refactors must be coordinated with the test rewrite.
- **Verify**: The cited evidence holds verbatim. The `LuckyCrown` extraction already exists for the lucky branch — extracting an analogous `ItineraryStandardCrown` (taking `header`, `inputs`, optional `backHref`/`backLabel`) is the obvious parallel and would reduce the three sites to single-line usages. LuckyCrown.tsx (lines 35-72) already demonstrates the extraction pattern. A standard-crown extraction would take the exact same props shape, which means callers could swap between them cleanly via a single `ItineraryCrownOrHeader` wrapper that internally branches on `isLuckyItinerary(inputs)`.
- **Recommendation**: Extract `ItineraryCrownOrHeader` (renders either LuckyCrown or Header+CompositionHeader given inputs + optional backHref/backLabel) and update the lucky-render contract test to assert against the extracted component once.

#### `Two requireAdmin helpers with the same composer_users query, different return shapes` — `post-launch` — `duplication`

- **Location**: `src/app/api/admin/venue/route.ts:8-23`
  - Additional sites: `src/app/api/admin/sync-venues/route.ts:50-67`
- **Rule violated**: CODING_STANDARDS.md §2 "used in 2+ places"
- **Evidence**: Admin surfaces — admin/venue/route.ts ships `requireAdmin(): true | Response` returning `NextResponse.json({error:"Forbidden"},{status:403})` on failure. admin/sync-venues/route.ts ships `requireAdmin(): AuthOk | AdminAuthFailedResponse` returning `{ok:false,kind:"auth_failed",reason:"not_admin"}` on failure. The underlying Supabase query is byte-identical: `.from("composer_users").select("is_admin").eq("id", user.id).maybeSingle()` followed by `!data?.is_admin`. The divergent return shape is the response contract — the auth check itself is one function.
- **Verify**: Verified at both locations. Both define `async function requireAdmin()` with the byte-identical Supabase query. The only divergence is the return contract. Grep across `src/` for `requireAdmin` and `composer_users.*is_admin` confirms these are the ONLY two server-side admin gates — AuthProvider.tsx and AdminSection.tsx read `is_admin` via the client-side auth context, which is a separate (legitimate) path.
- **Recommendation**: Extract `checkAdmin(): Promise<{ ok: true; userId: string } | { ok: false; reason: "unauthenticated" | "not_admin" }>` into a shared admin helper (e.g. `src/lib/auth-admin.ts`); each route maps the discriminated result to its own response shape at the call site.

#### `Six near-identical Venue factories scattered across unit tests` — `post-launch` — `duplication`

- **Location**: `tests/unit/composer.test.ts:10-74`
  - Additional sites: `tests/unit/scoring.test.ts:7-71`, `tests/unit/pre-filter.test.ts:18-83`, `tests/unit/fit-gate.test.ts:27-91`, `tests/unit/availability-honest-copy.test.ts:39-71`, `tests/unit/saved-hydration.test.ts:7-57`, `tests/unit/calendar.test.ts:23-36` (minimal), `tests/unit/stop-eyebrow.test.ts:13-50` (minimal), `tests/unit/swap-reason.test.ts:18` (one-liner), `tests/unit/venue-pool.test.ts:14` (related but different shape — not in scope)
- **Rule violated**: CODING_STANDARDS.md §2 (extract patterns used in 2+ places) and §7 (copy-paste smell test)
- **Evidence**: composer.test.ts:10 `function makeVenue(overrides: Partial<Venue> = {}): Venue {` followed by ~60 lines of literal defaults that are byte-for-byte identical to scoring.test.ts:7. pre-filter.test.ts:18 and fit-gate.test.ts:27 are also near-byte-identical to each other. availability-honest-copy.test.ts:39 and saved-hydration.test.ts:7 use a shorter `as unknown as Venue` cast pattern. Six callsites total. None of `tests/` ships a shared fixtures module. When `Venue` grows a field is multiplied by 6: when `reservation_lead_days` was added, three of these factories needed to be touched (composer, pre-filter, fit-gate all include it; the others use `as unknown as Venue` to dodge it — which itself hides drift).
- **Verify**: composer.test.ts:10 and scoring.test.ts:7 differ only in the id prefix and a trailing `as unknown as Venue` cast — every other field matches (neighborhood: "west_village", vibe_tags: ["food_forward","dinner"], latitude: 40.7336, business_status: "OPERATIONAL", and all 50+ other fields). The reservation_lead_days drift example is concretely visible: present in all three typed fixtures (scoring.test.ts:29, pre-filter.test.ts:41, fit-gate.test.ts:50) but absent from at least four of the cast-based fixtures — confirming the cast pattern is silently dodging Venue evolution.
- **Recommendation**: Extract `tests/fixtures/venue.ts` exporting `makeVenue(overrides)` returning a properly-typed `Venue` (no `as unknown` casts), and `makeStop(role, overrides)`; update the six callsites to import.

### sst

#### `displayName = plan.custom_name || plan.title || 'Saved plan' repeated in 3 sites` — `safe-now` — `sst`

- **Location**: `src/components/shared/SavedPlanRow.tsx:31`
  - Additional sites: `src/components/shared/SavedPlanRowExpanded.tsx:81`, `src/lib/itinerary/saved-hydration.ts:61`
- **Rule violated**: CODING_STANDARDS.md §1 (Single source of truth) + §7 smell test (typing a string literal that exists elsewhere)
- **Evidence**: All three lines are `plan.custom_name || plan.title || 'Saved plan'` (saved-hydration uses `saved.custom_name || saved.title || 'Saved plan'`). The string literal `'Saved plan'` is the same in all three — typical drift-prone copy. If product wants to change the empty-state label to e.g. 'Untitled plan', three files need to change in lockstep.
- **Verify**: Verified all three cited file:line locations contain the verbatim pattern. The user-facing literal "Saved plan" is duplicated three times across data-shaping and presentation layers. Exhaustive grep for `Saved plan` literal confirms exactly 3 functional callsites (plus one unrelated comment in HomeScreen.tsx:131). grep for the `custom_name || .*title` pattern returns the same 3 sites — no other variants of the fallback chain exist in the codebase, so a single helper captures the complete surface area. The SavedPlanRow.tsx file uses `displayName` 6 times internally (lines 31, 53, 58, 68, 74, 126) for rename draft initialization, cancel-revert, idempotency check, and display — the helper would feed all of them through one source.
- **Recommendation**: Add `getPlanDisplayName(plan)` to dateUtils or a new `lib/itinerary/saved-display.ts`; import everywhere.

### dead_code

#### `CrossCuttingVibeTag + ALL_CANONICAL_VIBE_TAGS exported but never imported` — `safe-now` — `dead_code`

- **Location**: `src/config/vibes.ts:94`
  - Additional sites: `src/config/vibes.ts:99`
- **Rule violated**: Discretionary
- **Evidence**: `grep -rn 'CrossCuttingVibeTag\|ALL_CANONICAL_VIBE_TAGS' src tests` returns only the two declarations. `CrossCuttingVibeTag` (line 94) is even defined as a bare `string` alias — a documentation marker that nothing consumes. `ALL_CANONICAL_VIBE_TAGS` (line 99, a ReadonlySet built from `VIBE_VENUE_TAGS` plus `GEN_CROSS_CUTTING`) is built at module load and never read.
- **Verify**: Both symbols are exported but have zero importers anywhere in src/, tests/, or scripts/. The file is hand-written (not in src/config/generated/), so deletion is permanent. The `CrossCuttingVibeTag = string` alias provides no type safety (bare string), and `ALL_CANONICAL_VIBE_TAGS` is a never-read Set construction at module load. The sibling exports `CROSS_CUTTING_VIBE_TAGS` (line 92) and `CROSS_CUTTING_TAG_SET` (line 96) exist as separate symbols and are not implicated. This is the hand-written vibes.ts, not the auto-generated src/config/generated/vibes.ts, so deletion is safe (no `generate-configs` round-trip will resurrect them).
- **Recommendation**: Delete both. The live consumers use `VIBE_VENUE_TAGS` or `CROSS_CUTTING_TAG_SET` directly.

#### `Algorithm type alias exported but never imported` — `safe-now` — `dead_code`

- **Location**: `src/config/algorithm.ts:339`
- **Rule violated**: Discretionary
- **Evidence**: `grep -rn '\bAlgorithm\b' src tests` returns only `src/config/algorithm.ts:339: export type Algorithm = typeof ALGORITHM;`. Every consumer uses `ALGORITHM` (the value) plus inferred types — no one references the `Algorithm` alias.
- **Verify**: Full-repo grep confirms the type alias is the only occurrence. All five callsites (`src/app/api/{generate,swap-stop,add-stop}/route.ts`, `src/lib/composer.ts`, `src/lib/scoring.ts`) import the `ALGORITHM` value, not the `Algorithm` type. Removal is a single-line delete with no downstream impact.
- **Recommendation**: Drop the `export type Algorithm` line.

#### `FAVORITE_HOODS onboarding list is dead` — `safe-now` — `dead_code`

- **Location**: `src/config/onboarding.ts:61`
- **Rule violated**: Discretionary
- **Evidence**: `grep -rn 'FAVORITE_HOODS' src tests` returns only two lines, both inside `src/config/onboarding.ts`: the doc comment at line 6 and the export itself at line 61. No importer — consistent with CLAUDE.md's note that the neighborhood-favorites onboarding step is intentionally commented out and 'no longer drives prefill'. The supporting `NEIGHBORHOOD_GROUPS.map(...)` derivation runs at module load with no consumer.
- **Verify**: CLAUDE.md does note that the onboarding neighborhood-favorites step is "commented out, not deleted" — but the commented block in OnboardingFlow.tsx (lines 293-309) uses `NeighborhoodPicker` directly with local `favoriteHoods` useState, not the `FAVORITE_HOODS` constant. So even when the step is restored per the doc block, FAVORITE_HOODS would still not be used. The DB column `composer_users.favorite_hoods` is read via NeighborhoodStep prefill (line 49-50) for questionnaire, which also doesn't go through FAVORITE_HOODS — it reads the raw slug array off the profile.
- **Recommendation**: Delete `FAVORITE_HOODS` — when the step is restored per the OnboardingFlow doc block, rebuild it inline. Pre-launch is the cheap moment to do this.

#### `composerUserToPrefs adapter is dead` — `safe-now` — `dead_code`

- **Location**: `src/types/index.ts:94`
- **Rule violated**: Discretionary
- **Evidence**: `grep -rn 'composerUserToPrefs' src tests` returns only `src/types/index.ts:94: export function composerUserToPrefs(u: ComposerUser): UserPrefs { ... }`. No callers. The DB row → UserPrefs adapter is unused everywhere — components and routes go straight to the row shape.
- **Verify**: UserPrefs is used directly in src/components/onboarding/OnboardingFlow.tsx:92 (constructed as object literal) and as a parameter type in src/lib/auth.ts:132 — neither path goes through the adapter. The adapter is pure dead code at src/types/index.ts:94-102 (9 lines including signature and closing brace).
- **Recommendation**: Delete `composerUserToPrefs` from src/types/index.ts.

#### `format12h helper is dead` — `safe-now` — `dead_code`

- **Location**: `src/lib/dateUtils.ts:32`
- **Rule violated**: Discretionary
- **Evidence**: `grep -rn 'format12h' src tests` returns exactly one line — the export itself. No callers in src or tests. The other dateUtils exports (`describeDay`, `todayLocalISO`, `tomorrowLocalISO`, `isPastDate`, `formatPastDateLabel`, `formatShortDateLabel`, `splitPlansByDate`) all have callers.
- **Verify**: Repo-wide grep (excluding node_modules and .next) confirms `format12h` appears only at src/lib/dateUtils.ts:32. The dateUtils test file (tests/unit/date-utils.test.ts) imports `formatPastDateLabel` and `formatShortDateLabel` but never `format12h` — so deletion does not break tests. The file's top-of-file comment claims `format12h` was extracted because `config/prompts.ts` and "shared views" both needed it, but `config/prompts.ts` only imports `describeDay`, so the original justification no longer applies.
- **Recommendation**: Delete `format12h` from src/lib/dateUtils.ts.

#### `format12h is unused — second 12-hour-formatter sitting next to the canonical formatStartTimeLabel` — `safe-now` — `dead_code`

- **Location**: `src/lib/dateUtils.ts:32-38`
- **Rule violated**: CODING_STANDARDS.md §5 (one canonical formatter per concept)
- **Evidence**: `format12h(time24)` at dateUtils.ts:32-38 produces lowercase `7pm` / `7:30pm` output. No call sites. The canonical 12-hour formatter is `formatStartTimeLabel` in src/lib/itinerary/time-blocks.ts:147-155 (uppercase `7 PM`). Keeping `format12h` invites a future caller to import the wrong one and produce inconsistent time labels across the app.
- **Verify**: Confirmed dead via grep. The two formatters disagree on output convention, so leaving the dead one invites a future caller to pick the wrong one. CLAUDE.md's "Single source of truth" / "Audit before adding" principle backs the deletion.
- **Recommendation**: Delete `format12h`. Standard formatter is `formatStartTimeLabel`.

#### `getBlockMetadata + BlockMetadata interface unused outside time-blocks.ts` — `safe-now` — `dead_code`

- **Location**: `src/lib/itinerary/time-blocks.ts:64`
  - Additional sites: `src/lib/itinerary/time-blocks.ts:25`
- **Rule violated**: Discretionary
- **Evidence**: `grep -rn 'getBlockMetadata' src tests` returns only the definition site. `BlockMetadata` interface appears only in the same file as its definition + the local `TIME_BLOCKS` typing + `getBlockMetadata`'s signature. TIME_BLOCKS itself is consumed externally (e.g. tests/unit/time-blocks.test.ts:422) so the array exposure stays, but the lookup wrapper + its public interface are unused.
- **Verify**: Internal callsites at time-blocks.ts:65, 292, 311 all inline `TIME_BLOCKS.find((b) => b.id === ...)` rather than call getBlockMetadata, showing the wrapper is unused even within its own module. BlockMetadata is still needed as the element type of TIME_BLOCKS but can be a non-exported local interface.
- **Recommendation**: Drop `getBlockMetadata` and de-export `BlockMetadata` (or inline it on TIME_BLOCKS).

#### `pg dependency is unused` — `safe-now` — `dead_code`

- **Location**: `package.json:43`
- **Rule violated**: Discretionary
- **Evidence**: `grep -rln "from ['\"]pg['\"]\|require(['\"]pg['\"])" .` (excluding node_modules) returns no matches. devDependencies entry `"pg": "^8.20.0"` is never imported by `src/`, `tests/`, or any `scripts/*.{ts,js,py}`. The pipeline writes via Supabase + the `composer_apply_venue_import` RPC, not raw pg.
- **Verify**: No @types/pg is present either. CLAUDE.md confirms the venue import pipeline uses Supabase + the composer_apply_venue_import RPC, not raw pg. The dependency is genuinely unused dead weight.
- **Recommendation**: Drop `pg` from devDependencies in package.json. Re-run `npm install` to update the lockfile.

#### `Share-link URL builder + encoder are dead (only used by each other)` — `safe-now` — `dead_code`

- **Location**: `src/lib/sharing.ts:20`
  - Additional sites: `src/lib/sharing.ts:90`
- **Rule violated**: Discretionary
- **Evidence**: `grep -rn 'buildShareUrl\|encodeInputsToParams' src tests scripts` returns only the three lines inside src/lib/sharing.ts itself. `decodeParamsToInputs` (the other export in this file) IS consumed by `src/app/itinerary/page.tsx:119` for legacy `?timeBlock=...` translation, so the file isn't dead — just these two exports are. Shareable links now flow via /api/share snapshots, not URL-encoded inputs.
- **Verify**: Importers of @/lib/sharing only pull `decodeParamsToInputs` (src/app/itinerary/page.tsx:12, tests/unit/occasion-label.test.ts:3). Real share flow: LooksGoodCTA.tsx:107 `fetch("/api/share", {...})` confirms /api/share snapshot path. The file's header comment still describes the URL-encoded flow (lines 1-7), so deleting the two exports should also prompt a brief comment update.
- **Recommendation**: Delete `encodeInputsToParams` and `buildShareUrl` from src/lib/sharing.ts.

#### `StopStatusBadge component has zero importers (and its Tooltip dep becomes orphan)` — `safe-now` — `dead_code`

- **Location**: `src/components/ui/StopStatusBadge.tsx:13`
  - Additional sites: `src/components/ui/Tooltip.tsx:13`
- **Rule violated**: Discretionary
- **Evidence**: `grep -rn 'StopStatusBadge' src tests` returns exactly one match — the export itself. No JSX `<StopStatusBadge` mount, no import. Its only dependency, `Tooltip`, has exactly one importer — StopStatusBadge — so removing the badge orphans Tooltip too.
- **Verify**: The `InfoTooltip` reference in src/app/profile/_components/DiffSummary.tsx is a separate locally-defined component (line 280: `function InfoTooltip({ text }: { text: string })`), unrelated to the ui/Tooltip primitive. StopStatusBadge.tsx is 20 lines, Tooltip.tsx is 48 lines — both small and self-contained.
- **Recommendation**: Delete StopStatusBadge.tsx AND Tooltip.tsx together; nothing in `src/**` or `tests/**` references either.

#### `ContextOption type + CONTEXT_OPTIONS retained only for a deprecated validator branch` — `post-launch` — `dead_code`

- **Location**: `src/config/onboarding.ts:15`
  - Additional sites: `src/config/onboarding.ts:30`, `src/lib/validation/profile.ts:44`, `src/types/index.ts:74`, `src/types/index.ts:86`, `src/types/index.ts:97`, `src/lib/auth.ts:139`, `src/lib/auth.ts:150`, `src/app/api/profile/route.ts:19`, `src/app/api/profile/route.ts:54`
- **Rule violated**: Discretionary
- **Evidence**: CLAUDE.md explicitly says the onboarding context step was removed 2026-05-20, the `composer_users.context` column is no longer written, and it's 'safe to drop the column after 90 days if no future use materializes.' Meanwhile `src/lib/validation/profile.ts:44` still has a `payload.context !== undefined` branch using `CONTEXT_OPTIONS` to whitelist values that no client ever submits. `ContextOption` interface is exported but has zero importers.
- **Verify**: The recommendation is appropriately gated: tier=post-launch defers the cleanup to when the `composer_users.context` column is dropped, which is correct because the column still exists, `upsertProfile` and `/api/profile` still write to it, and removing the validator now would leave those writes unvalidated. Seven sites become unreachable when the column is dropped and should be cleaned in the same sweep as the validator branch + CONTEXT_OPTIONS + ContextOption.
- **Recommendation**: When the 90-day window closes (the column is dropped), delete the validator's `context` branch, the `CONTEXT_OPTIONS` constant, and the `ContextOption` interface in one sweep.

#### `CityDef interface is exported but only annotates the same file's CITIES const` — `not-worth-it` — `dead_code`

- **Location**: `src/config/cities.ts:3`
- **Rule violated**: Discretionary
- **Evidence**: `grep -rn '\bCityDef\b' src tests` returns only the two lines in `src/config/cities.ts`: the interface declaration at line 3 and its use to type `CITIES: CityDef[] = [...]` at line 10. No external consumer. Same story for `CityStatus`.
- **Verify**: The finding accurately characterizes a harmless over-export. CITIES is a live feature-flag for new-city expansion that may want external typing later. CITIES also has a sibling export ACTIVE_CITY_ID at line 19, suggesting the module is intended as the canonical city-vocabulary surface — typing exports alongside the data exports is consistent with a future where another module renders or filters CITIES by status.
- **Recommendation**: Decline. The over-export is harmless and the CITIES list is the live feature flag for new-city expansion; trimming the export saves nothing meaningful.

#### `Compose-abandoned helper over-exports AbandonedFlag + EmitFn` — `not-worth-it` — `dead_code`

- **Location**: `src/lib/analytics/compose-abandoned.ts:37`
  - Additional sites: `src/lib/analytics/compose-abandoned.ts:44`
- **Rule violated**: Discretionary
- **Evidence**: `grep -rn '\bAbandonedFlag\b\|\bEmitFn\b' src tests` returns only declarations in `src/lib/analytics/compose-abandoned.ts` — no external consumer. `FlagStorage` (the sibling type) IS used by the test (tests/unit/compose-abandoned.test.ts:9) so the file isn't entirely over-exported, just these two.
- **Verify**: Over-exporting two internal type aliases is a stylistic preference, not a documented standards violation, and removing `export` keywords yields no functional benefit. The finding is real (the over-export exists) but the recommendation to decline is correct.
- **Recommendation**: Decline. Internal helper types are a discretionary call; the test file already pins the public surface and removing two `export` keywords doesn't change behavior.

### abstraction

#### `Identical readDrinksPref helper duplicated verbatim in add-stop and swap-stop routes` — `safe-now` — `abstraction`

- **Location**: `src/app/api/swap-stop/route.ts:49`
  - Additional sites: `src/app/api/add-stop/route.ts:35`, `src/app/api/generate/route.ts:70`
- **Rule violated**: CLAUDE.md 'Single source of truth — shared constants ... live in ONE canonical module and are imported everywhere' + CODING_STANDARDS.md §7 'Copy-pasting a function ... with small modifications'
- **Evidence**: swap-stop/route.ts:49-65 and add-stop/route.ts:35-51 are byte-identical (verified by diff — no output). Both define `async function readDrinksPref(): Promise<{ userId: string | null; drinks: string | null }>`. generate/route.ts:70-93 has the same shape with `name` added to the select. All three routes pre-filter on the resulting `drinks` value. Any future profile-field used in scoring (e.g., dietary restrictions when scoring restaurant tags) gets added in 3 places.
- **Verify**: diff produces empty output — verbatim duplicate. grep across src/ for read*Pref/readComposerProfile finds exactly the 3 cited sites and their 3 call sites — no fourth duplicate. `src/lib/auth.ts` already imports composer_users at lines 105/156 (the upsertProfile + signIn paths), so it's the natural extraction target.
- **Recommendation**: Extract `readAuthedScoringPrefs()` (or a wider `readComposerProfile()`) to `src/lib/auth.ts` or a new `src/lib/profile/server.ts` returning `{userId, name, drinks}`.

#### `Seven byte-identical underlined text-input class strings across auth + onboarding + profile` — `safe-now` — `abstraction`

- **Location**: `src/components/auth/AuthScreen.tsx:277`
  - Additional sites: `src/components/auth/AuthScreen.tsx:413`, `src/components/auth/AuthScreen.tsx:433`, `src/components/auth/ForgotPasswordScreen.tsx:137`, `src/app/auth/reset/page.tsx:159`, `src/app/auth/reset/page.tsx:188`, `src/app/profile/_components/AddEmailSection.tsx:72`, `src/components/onboarding/OnboardingFlow.tsx:196`
- **Rule violated**: CODING_STANDARDS.md §2 + §7 smell test 'Typing a string literal that exists elsewhere'
- **Evidence**: All seven call sites carry the identical class root: `... px-0 py-3 text-base font-sans bg-transparent border-b border-border focus:border-charcoal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-burgundy/40 transition-colors text-charcoal placeholder:text-muted`. Only the sizing prefix (`w-full` vs `flex-1`), `pr-16` for password-toggle variants, and `text-base` vs `text-sm` (one variant) differ. The OnboardingFlow.tsx:196 input is the same recipe with a dynamic border-color modifier for the error state.
- **Verify**: grep against `border-b border-border focus:border-charcoal` returns exactly the seven cited sites. CODING_STANDARDS.md §7 explicitly lists "Typing a string literal that exists elsewhere in the codebase" as a smell-test trigger. CLAUDE.md's "Disabled state — one canonical treatment" section cites the `<Button>` primitive as the canonical consolidation pattern, making the proposed `<UnderlinedInput>` directly analogous and blessed.
- **Recommendation**: Add an `<UnderlinedInput>` primitive in `src/components/ui/` (mirrors how `<Button>` consolidates the disabled-state recipe) that takes a size + `hasSuffix` prop and route the seven sites through it.

#### `Three byte-identical 'small burgundy outlined swap pill' button class strings` — `safe-now` — `abstraction`

- **Location**: `src/components/ui/StopCard.tsx:291`
  - Additional sites: `src/components/ui/StopCard.tsx:305`, `src/components/itinerary/StopAvailability.tsx:364`
- **Rule violated**: CODING_STANDARDS.md §2 'If a UI element ... is used in 2+ places — or is likely to be — extract it to a shared module' + §7 smell test 'Typing a string literal that exists elsewhere in the codebase'
- **Evidence**: All three sites carry the identical class string: `inline-flex items-center justify-center min-h-[36px] px-3 rounded-full border border-burgundy/30 font-sans text-xs font-medium text-burgundy hover:border-burgundy hover:bg-burgundy/5 transition-colors`. The call-site comments are an explicit, in-code call-to-abstract: StopCard.tsx:300 says `Same treatment as the Undo pill above so the slot's vertical size is invariant` and StopAvailability.tsx:358-360 says `same bordered burgundy pill as StopCard's Swap so the two surfaces stay consistent`.
- **Verify**: grep returns exactly 3 hits — no other variants of this pill exist. The existing `pillClass` helper at src/lib/styles.ts:16-49 is a different recipe (filled selection pill at `px-4 py-2 text-sm`), so adding a sibling `swapPillClass` (a `px-3 min-h-[36px] text-xs outlined-burgundy` pill) is purely additive. The two StopCard sites are ALREADY in subtle drift risk: they sit in the same JSX tree, one labeled Undo and one labeled Swap, and the Swap comment specifically says "Same treatment as the Undo pill above" — exactly the drift pattern the standards doc warns against.
- **Recommendation**: Add a `<Button variant="outline" size="pill-sm">` recipe (or a `swapPillClass` builder in `src/lib/styles.ts` next to `pillClass`) and route all three sites through it.

#### `Three sessionStorage 'inputs + itinerary' handoff writes before navigating to /itinerary` — `safe-now` — `abstraction`

- **Location**: `src/components/questionnaire/QuestionnaireShell.tsx:144`
  - Additional sites: `src/components/questionnaire/QuestionnaireShell.tsx:176`, `src/components/home/TonightsPickCard.tsx:40`, `src/components/home/LuckyOverlay.tsx:94`, `src/app/itinerary/page.tsx:50` (partial — `persist()`)
- **Rule violated**: CODING_STANDARDS.md §2 + §7 'Copy-pasting a function or JSX block with small modifications'
- **Evidence**: Each call site writes the same two keys, in the same order, before `router.push("/itinerary")`. The pattern is even called out in-code: TonightsPickCard.tsx:38 comments `Standard handoff — same sessionStorage keys, same /itinerary page` and LuckyOverlay.tsx:91-93 comments `Mirror the questionnaire's success path: store inputs + result in the same sessionStorage keys`.
- **Verify**: Four call sites write the same two sessionStorage keys (questionnaireInputs + currentItinerary) in the same order before navigating to /itinerary. The in-code comments confirm the copy-paste lineage by the implementer's own admission. ItineraryPage:50-55 also has a partial `persist()` helper that writes only the itinerary key — extracting `writeItineraryHandoff({ inputs, itinerary })` to storage.ts collapses all of these into one writer.
- **Recommendation**: Add `writeItineraryHandoff({ inputs, itinerary })` to `src/config/storage.ts` (or a sibling `src/lib/itinerary/handoff.ts`) so all three caller paths use one writer.

#### `Client-side '422 → parse ComposeFailure body → fall back to proximity' pattern repeats four times` — `post-launch` — `abstraction`

- **Location**: `src/app/itinerary/page.tsx:99`
  - Additional sites: `src/app/itinerary/page.tsx:339`, `src/hooks/useSwapStop.ts:124`, `src/lib/lucky-runner.ts:81`, `src/app/api/daily-pick/route.ts:182` (related but different shape — noted for awareness)
- **Rule violated**: CODING_STANDARDS.md §2 + §7 smell test
- **Evidence**: All four sites do the same 422 handling: `if (res.status === 422) { const body = (await res.json().catch(() => ({}))) as unknown; const failure = isComposeFailure(body) ? body : composeFailure("proximity"); ... }`. The 'proximity' fallback on a malformed body is arguably wrong on generate-via-questionnaire (where 'budget' or 'neighborhood' is the more common zeroing stage); a shared helper would make that decision visible in one spot.
- **Verify**: All four cited sites match verbatim. A 5th 422 handler exists at src/app/api/daily-pick/route.ts:182 but it's a server-side handler that calls `generatePOST` directly (not fetch) and explicitly does NOT fall back to a synthetic ComposeFailure — different shape, would not necessarily be folded in. The compose-failure.ts file at lines 8-14 documents the deliberate "client-safe" split and is the natural home for a `parseComposeFailureResponse` helper.
- **Recommendation**: Add `parseComposeFailureResponse(res, fallbackStage = 'proximity')` to `src/lib/itinerary/compose-failure.ts` returning `Promise<ComposeFailure>`. Four callers shrink to one line each, and the fallback stage becomes a per-endpoint argument.

#### `Three itinerary pages duplicate the 'isLucky ? LuckyCrown : Header + CompositionHeader' branch` — `post-launch` — `abstraction`

- **Location**: `src/app/itinerary/page.tsx:414`
  - Additional sites: `src/app/itinerary/saved/[id]/page.tsx:116`, `src/app/itinerary/share/[id]/page.tsx:125`
- **Rule violated**: CODING_STANDARDS.md §2 + CLAUDE.md 'Lucky itineraries — layer, not fork' (the gate should be one spot)
- **Evidence**: Each of the three itinerary surfaces opens its main body with the same ternary structure. Fresh and saved are byte-identical apart from `backHref/backLabel` props passed to LuckyCrown. Share is the same shape but omits the Back link. The branches are non-trivial: any change to the back-link slot or to the wrapping container has to land three times.
- **Verify**: Verified verbatim at all three cited file:line locations. LuckyCrown.tsx:35-41 already exposes `backHref?` and `backLabel?` as optional props, so the share-vs-fresh/saved variation is already a single prop axis. An ItineraryPageHeader wrapper would just forward those two props plus a non-lucky Header rightSlot. Grep confirms LuckyCrown has exactly three callers (the three itinerary pages).
- **Recommendation**: Extract `<ItineraryPageHeader inputs header backTarget?='hide'|{ href, label } />` that owns the lucky branch internally. Three pages each drop ~12 lines of structure.

#### `Three API routes read x-ph-distinct-id / x-ph-session-id headers inline` — `not-worth-it` — `abstraction`

- **Location**: `src/app/api/generate/route.ts:99`
  - Additional sites: `src/app/api/swap-stop/route.ts:94`, `src/app/api/add-stop/route.ts:54`
- **Rule violated**: Discretionary
- **Evidence**: Each of the three composer routes opens its POST handler with the same two `request.headers.get(...)` calls. Three sites, two lines each. Recommend declining: each route consumes the two values in a slightly different control-flow shape, and bundling the read into `readAnalyticsContext(request)` saves four lines per file without removing any drift risk.
- **Verify**: Confirmed only six total occurrences of these header strings across src/ — three server reads (the cited routes) and the two writes in getAnalyticsHeaders(). The control-flow differences are real: generate uses Partial<GenerateRequestBody> for analyticsInputs, swap-stop uses SwapRequest["itinerary"]["inputs"], add-stop uses QuestionnaireAnswers — three different inputs types means a shared readAnalyticsContext would not naturally subsume the analyticsUserId / analyticsInputs setup either.
- **Recommendation**: Leave as-is. If the analytics-server module ever needs a third header (build id, region) the calculus flips — revisit then.

### architecture

#### `Triplicate "Failed to fetch venues" 500 response string literal` — `safe-now` — `architecture`

- **Location**: `src/app/api/generate/route.ts:173-178`
  - Additional sites: `src/app/api/swap-stop/route.ts:124-129`, `src/app/api/add-stop/route.ts:90-95`
- **Rule violated**: CODING_STANDARDS.md §7 (smell test: "Typing a string literal that exists elsewhere in the codebase")
- **Evidence**: Three identical blocks: `if (venuesAll === null) { return NextResponse.json({ error: "Failed to fetch venues" }, { status: 500 }); }`. Same shape as the duplicated `fetchActiveVenues().catch((err) => { console.error('[<endpoint>] fetchActiveVenues failed:', err); return null; })` immediately above each one.
- **Verify**: Each site has the identical 12-line shape: Promise.all entry calling `fetchActiveVenues().catch(err => { console.error("[<label>] fetchActiveVenues failed:", err); return null; })`, then a 5-line `if (venuesAll === null) { return NextResponse.json({ error: "Failed to fetch venues" }, { status: 500 }); }`. The error label and log prefix are the only varying bytes. /api/health (the only other fetchActiveVenues consumer) uses a bare await — different shape, correctly excluded.
- **Recommendation**: Wrap the fetchActiveVenues→null→500 pattern in a single helper in `lib/venues/fetch-active.ts` or a thin route helper module; each call site becomes one line.

#### `readDrinksPref / readAuthedPrefs duplicated verbatim across the three compose endpoints` — `post-launch` — `architecture`

- **Location**: `src/app/api/add-stop/route.ts:35-51`
  - Additional sites: `src/app/api/swap-stop/route.ts:49-65`, `src/app/api/generate/route.ts:70-93`
- **Rule violated**: CODING_STANDARDS.md §2 (extract aggressively when used 2+ places) + CODING_STANDARDS.md §3 (audit before adding)
- **Evidence**: add-stop and swap-stop define byte-identical functions. generate.ts:78 has a near-twin (`readAuthedPrefs`) that only differs by selecting `'name, drinks'` and returning an extra `name` field. Three implementations of the same authed-profile lookup against the same table — every future field (e.g., dietary, favorite_hoods) is a three-site edit.
- **Verify**: readDrinksPref is called at add-stop/route.ts:81 and swap-stop/route.ts:115; readAuthedPrefs is called at generate/route.ts:164 — confirming all three are live in production POST handlers. The generate variant additionally logs in its catch block while the other two silently fall back — a subtle behavioral drift that itself argues for consolidation behind a single helper with consistent error handling.
- **Recommendation**: Extract a shared `readComposeUserPrefs(fields)` helper into `src/lib/itinerary/` or `src/lib/auth-server.ts` returning `{ userId, name?, drinks }`; call it from all three routes.

#### `buildPreFilterArgs construction copy-pasted across the three compose endpoints` — `post-launch` — `architecture`

- **Location**: `src/app/api/generate/route.ts:185-198`
  - Additional sites: `src/app/api/swap-stop/route.ts:145-158`, `src/app/api/add-stop/route.ts:103-116`
- **Rule violated**: CODING_STANDARDS.md §2 (extract patterns used 2+ places)
- **Evidence**: Each compose route assembles the same `buildPreFilterArgs({ venues: venuesAll, inputs: { budget, day, startTime, endTime, neighborhoods: inputs.neighborhoods ?? [] }, exclude, drinks })` literal block. CLAUDE.md asserts "Identical stack across /api/generate, /api/swap-stop, /api/add-stop — implemented once in src/lib/itinerary/pre-filter.ts and consumed by all three" — the helper is canonical, but the args-shaping is not.
- **Verify**: pre-filter.ts:94-116 already defines buildPreFilterArgs with a docstring asserting it exists "Extracted so the three route handlers can't drift on field shape — adding a new pre-filter input requires editing this single builder and propagating to all three callers via the type system." The intent is exactly the collapse the finding recommends; the implementation stopped one level shy. generate route uses `body.budget` instead of `inputs.budget` (minor inconsistency — inputs already has budget via spread on line 152), so the adapter would also normalize this.
- **Recommendation**: Move the inputs→PreFilterArgs adapter into `pre-filter.ts` (e.g., `buildPreFilterArgsFromAnswers(inputs, exclude, drinks)`) so the call collapses to one line per route.

#### `Server-only walking-routes module leaks into the client bundle via mapbox.ts → SavedPlanRowExpanded` — `post-launch` — `architecture`

- **Location**: `src/lib/mapbox.ts:10`
  - Additional sites: `src/lib/walking-routes.ts:13-16`, `src/components/shared/SavedPlanRowExpanded.tsx:30`, `src/app/profile/_components/SavedPlansList.tsx:10` (transitive), `src/components/home/HomeScreen.tsx:13` (transitive)
- **Rule violated**: CLAUDE.md "Environment Variables" (MAPBOX_SERVER_TOKEN: "Never expose this token to the client") + general client/server boundary hygiene
- **Evidence**: Client component `SavedPlanRowExpanded` ("use client" at line 1) imports `buildItineraryStaticMapUrl` from `@/lib/mapbox`. `mapbox.ts:10` imports `encodeGeoJsonLineToPolyline` from `@/lib/walking-routes`. `walking-routes.ts:13-14` imports `getServiceSupabase` from `@/lib/supabase` and reads `process.env.MAPBOX_SERVER_TOKEN` (declared server-only). `encodeGeoJsonLineToPolyline` itself is a pure function — but it's defined in the same module as the server-only fetcher, so the client bundle drags it in.
- **Verify**: All four cited file:line references hold verbatim. Importer audit confirms `SavedPlanRowExpanded` is the only `@/lib/mapbox` consumer, and it's rendered from two client surfaces: `src/app/profile/_components/SavedPlansList.tsx:65` and `src/components/home/HomeScreen.tsx:166`. One nuance: Next.js inlines non-NEXT_PUBLIC env vars as `undefined` in client bundles, so the actual token VALUE doesn't reach the browser — but the function body, the supabase service-role import, and the env var key string still ship as dead code in the client bundle, and the boundary is exactly the leak shape CLAUDE.md's MAPBOX_SERVER_TOKEN comment warns against. `walking-routes.ts` doesn't declare `"sideEffects": false`, so tree-shaking is not guaranteed. The pure encoder has zero dependencies — trivial extraction.
- **Recommendation**: Move the pure encoder `encodeGeoJsonLineToPolyline` to a shared module like `src/lib/itinerary/polyline.ts` (no Supabase, no env vars); keep `walking-routes.ts` server-only with the Mapbox Directions fetch + cache. Then `mapbox.ts` (used by client) imports only the pure encoder.

#### `fetchActiveVenues paginator is canonical but pagination loop pattern still duplicated inside the venues module` — `post-launch` — `architecture`

- **Location**: `src/lib/venues/fetch-active.ts:30-48`
  - Additional sites: `src/lib/venues/import.ts:176-201`
- **Rule violated**: CODING_STANDARDS.md §2 (extract aggressively) + CLAUDE.md "Don't issue a bare full-table Supabase select on a catalog table" canonical-helper directive
- **Evidence**: `fetch-active.ts` ships the canonical paginator for runtime reads and its file-level comment explicitly parks consolidation: "We deliberately do not consolidate the two loops in this change — that's a parked follow-up". `import.ts:fetchAllDbVenues` repeats the same `for (;;) { … .range(offset, offset+PAGE-1) … if (data.length < PAGE) break; offset += PAGE; }` loop. The differences are real but parameterizable: column set + active filter inversion + service-role vs anon client.
- **Verify**: fetch-active.ts:11-17 contains the exact "We deliberately do not consolidate the two loops in this change — that's a parked follow-up" comment, explicitly tagging this as deferred debt rather than a permanent design choice. grep -rn "\.range(" across src/ returns exactly the two cited sites — no other paginators exist in the codebase, so the finding's scope is complete. runPreflight in import.ts:609-619 uses head:true count queries (not pagination) so it's correctly excluded. The runtime-fetch-truncation diagnostic motivates the canonical-helper directive — each loop is one off-by-one mistake away from re-introducing the 24% truncation bug.
- **Recommendation**: After launch: extract a `paginateAll<T>(client, { table, select, filter, order, pageSize })` helper in `lib/venues/` (or a new `lib/db/pagination.ts`); both fetchers call it.

### efficiency

No confirmed findings in this dimension.

### tests

#### `failure-block-clearing relies on a hardcoded 500-char window after updateItinerary(next); — brittle to surrounding refactors` — `safe-now` — `tests`

- **Location**: `tests/unit/failure-block-clearing.test.ts:65-81`
- **Rule violated**: Discretionary
- **Evidence**: The test uses `pageSrc.indexOf("updateItinerary(next);")` followed by `pageSrc.slice(idx, idx + 500)`. The 500-char window is a magic number. If the success branch grows (analytics emit, additional state set), the `clearSwapFailure()` call drifts out of the 500-char range and the test silently asserts the wrong thing — `.toMatch(/clearSwapFailure\(\)/)` would fail, but the `.not.toMatch(/setAddStopFailure\(/)` weakens to vacuously-true. Also `indexOf` returns the FIRST occurrence; if a later `updateItinerary(next);` is added, the window slices a different region.
- **Verify**: src/app/itinerary/page.tsx grep confirms exactly one occurrence of `updateItinerary(next);` at line 371. clearSwapFailure() sits at line 377 — well within the 500-char window today, but a future analytics emit, additional state set, or comment expansion above it would shift it. The original finding's mention that "earlier tests in this file already use that pattern correctly" overstates it: tests 47-63 use `[\s\S]*?` lazy regex against the full pageSrc, which has its own fragility — but unlike indexOf+slice, those at least don't have the vacuously-true negative-assertion failure mode.
- **Recommendation**: Replace the indexOf+slice scan with a regex on the named function body: extract the `handleAddStop` source via a function-bounded regex, then assert `clearSwapFailure()` appears after `updateItinerary(next);` inside it.

#### `Five sites cast factory output through 'as unknown as Venue' — hides type drift in the test fixtures` — `post-launch` — `tests`

- **Location**: `tests/unit/composer.test.ts:73`
  - Additional sites: `tests/unit/scoring.test.ts` (typed, contrast), `tests/unit/availability-honest-copy.test.ts:70`, `tests/unit/calendar.test.ts:35`, `tests/unit/saved-hydration.test.ts:56`, `tests/unit/stop-eyebrow.test.ts:42`, `tests/unit/swap-reason.test.ts:18`, `tests/unit/time-blocks.test.ts:480` (same pattern, AvailabilitySlot not Venue — out of scope)
- **Rule violated**: CLAUDE.md §Coding Standards → TypeScript ("No `any` types. No `ts-ignore`")
- **Evidence**: Six factory definitions close with `} as unknown as Venue;`. This double-cast tells TypeScript to stop checking, so when `Venue` gains a required field the test fixture silently goes out of sync. scoring.test.ts:7-71 and pre-filter.test.ts:18-83 demonstrate this is avoidable: they return a fully-typed Venue without the cast. CLAUDE.md says `No any types. No ts-ignore.` — `as unknown as T` is the same evasion.
- **Verify**: All six cited sites verify verbatim. The "avoidable" claim is supported by THREE contrast cases: scoring.test.ts:7-71, pre-filter.test.ts:18-83, and fit-gate.test.ts:27-92 all build fully-typed Venue returns without the cast. The reservation_lead_days drift example is concretely visible: present in all three typed fixtures but absent from at least four of the cast-based fixtures — exactly the drift the finding warns about.
- **Recommendation**: When the shared `tests/fixtures/venue.ts` is built, type the return as `Venue` (no `as unknown` cast) so future Venue field adds force a fixture update.

#### `swap-undo-slot pins the entire 200-char Tailwind class string verbatim — breaks on any class-order or whitespace nudge` — `post-launch` — `tests`

- **Location**: `tests/unit/swap-undo-slot.test.ts:74-79`
- **Rule violated**: Discretionary
- **Evidence**: The `PILL` regex literally pins a 200+char class string with single-space separators and exact class ordering. No `\s+` between class names, no allowance for class reordering. Tailwind's auto-sort plugin or `prettier-plugin-tailwindcss` reorders class names; any single class addition (e.g., `whitespace-nowrap`) for an unrelated reason breaks both occurrences at once. The actual contract is "the Undo button is the same pill treatment as Swap" — verifiable by extracting both button className strings and asserting they are `===`.
- **Verify**: The StopCard source at lines 291 and 305 shows the two button className strings are intentionally byte-identical (the comment at line 298-301 makes this explicit: "Same treatment as the Undo pill above so the slot's vertical size is invariant"). The honest contract is "the two strings are equal AND include min-h-[36px]". The project does not currently use prettier-plugin-tailwindcss, so the auto-reorder risk is theoretical, but the fragility on any unrelated class addition is real.
- **Recommendation**: Replace the PILL regex with: pull both `<button … className="…">` strings out of the source, assert they are byte-equal and contain the `min-h-[36px]` floor. Other invariants stay as-is.

#### `lucky-render and home-redesign source-greps pin the inner content of conditional expressions verbatim — overly precise for an additive-overlay contract` — `post-launch` — `tests`

- **Location**: `tests/unit/lucky-render.test.ts:303-315`
  - Additional sites: `tests/unit/lucky-render.test.ts:255-256`, `tests/unit/lucky-render.test.ts:278`, `tests/unit/home-redesign.test.ts:65-71`, `tests/unit/home-redesign.test.ts:128-129`, `tests/unit/lucky-render.test.ts:185-194`, `tests/unit/lucky-render.test.ts:240-243`, `tests/unit/lucky-render.test.ts:261-271`
- **Rule violated**: Discretionary
- **Evidence**: lucky-render.test.ts:303-311 pins the exact source text of three ternaries inside CompositionHeader.tsx (`titleColor`, `subtitleColor`, `metaColor`). The documented contract is "non-crown component instances do NOT carry crown classes" — a much weaker contract than "three specific variables exist with these exact identifiers and exact ternary spellings." If a future refactor renames `titleColor` to `headingColor` or extracts the three into one `crownColors` object, the rule isn't violated but the test breaks. Same pattern for variant and prop-passing pins, and home-redesign's class-string pins.
- **Verify**: A rename or extract-to-helper refactor would break tests without violating the documented contract. The lucky-render test even has a sibling test ("crown components are not imported from non-itinerary surfaces" at line 349) that already does exactly the contract-level check the finding asks for. The recommendation (negative-lookups for "crown classes only after isCrown") is fiddly to express as a regex and could create new test debt, but the current pins do pin variable names and class lists rather than contract violations.
- **Recommendation**: Loosen these regexes to assert the contract: `expect(composeHeaderSrc).not.toMatch(/text-crown-text/)` outside an `isCrown` ternary, or check that crown classes only appear in lines following `isCrown`. Same for home-redesign's class-string pins — assert the chevron icon imports and the absence of `stops.map`, drop the JSX class-string fragments.

### doc_drift

#### `ALGORITHM.md references occasion slug 'dating' that no longer exists in the user-facing taxonomy` — `safe-now` — `doc_drift`

- **Location**: `ALGORITHM.md:73`
  - Additional sites: `src/config/options.ts:26-30`, `src/lib/scoring.ts:37-38`, `CLAUDE.md:336-337`
- **Rule violated**: Discretionary
- **Evidence**: ALGORITHM.md line 73: "if the venue's `occasion_tags` includes the user's occasion (dating, friends, solo, etc.), full points". The user-facing occasion is now `date` / `friends` / `solo` (src/config/options.ts:26-30) which fans out to sheet-side slugs `first_date`, `dating`, `couple` (src/lib/scoring.ts:37-38). A user can never pick `dating` — the bucket is `date`.
- **Verify**: Found a worse, related instance during verification: CLAUDE.md:336-337 lists the occasion step values as 5 options including ``dating`` and ``relationship``. The actual options.ts has only 3 buckets. Both docs were written before the bucket consolidation and were never updated.
- **Recommendation**: Reword to "the user's occasion bucket (date → first_date/dating/couple, friends → friends, solo → solo)" or similar to match the bucket fan-out actually implemented.

#### `composer_saved_itineraries schema in docs missing start_time, time_block, end_time, mode columns` — `safe-now` — `doc_drift`

- **Location**: `CLAUDE.md:240-247`
  - Additional sites: `src/lib/itinerary/save.ts:25-37`, `src/lib/itinerary/saved-hydration.ts:55-96`, `src/lib/itinerary/is-lucky.ts` (comments), `supabase/migrations/20260417_saved_itinerary_duration.sql`, `supabase/migrations/20260609_add_start_time_to_saved_itineraries.sql`, `supabase/migrations/20260610_add_walks_to_saved_itineraries.sql`, `supabase/migrations/20260612_add_mode_to_saved_itineraries.sql`, `src/lib/itinerary/saved-hydration.ts:61` (custom_name also undocumented), `src/lib/itinerary/save.ts:46` (walks column also undocumented)
- **Rule violated**: Discretionary
- **Evidence**: CLAUDE.md documents `composer_saved_itineraries` columns as `title, subtitle, occasion, neighborhoods, budget, vibe, day, stops jsonb, walking jsonb, weather jsonb, created_at`. Reality from src/lib/itinerary/save.ts:25-37: the writer sets `start_time`, `time_block`, `end_time`, and `mode` columns explicitly. The is-lucky.ts header comment notes "`mode` column — added 2026-06-12".
- **Verify**: Live save.ts (lines 14-49) explicitly writes `start_time`, `time_block`, `walks`, and `mode` columns. Four schema-changing migrations exist that aren't reflected. is-lucky.ts explicitly calls out the 2026-06-12 mode column needing docs/save/hydrate alignment. Finding overstates by one (`end_time` is NOT a real column — endTime is derived in the hydrator), but understates the omitted set by missing `walks`, `custom_name`, and `duration_hours`. Location citation in finding ("CLAUDE.md:240-247") is wrong — DDL block is at lines 215-222.
- **Recommendation**: Update the composer_saved_itineraries DDL block in CLAUDE.md to include start_time, time_block, walks, mode, custom_name, duration_hours columns and reference the relevant migrations.

#### `Component file naming rule says kebab-case; entire codebase uses PascalCase` — `safe-now` — `doc_drift`

- **Location**: `CLAUDE.md:477`
  - Additional sites: every `src/components/**/*.tsx` file
- **Rule violated**: CLAUDE.md "File Naming" section
- **Evidence**: CLAUDE.md line 477 (File Naming): "One component per file. File name matches component name in kebab-case (`stop-card.tsx` exports `StopCard`)." Reality: a recursive find for any kebab-case .tsx under src/components returns zero results — every component file is PascalCase. The codebase has implicitly chosen PascalCase as the convention. The kebab-case rule is a stale/aspirational standard that has been universally ignored.
- **Verify**: Recursive find for `*-*.tsx` under `src/components` returns zero results. All 40+ component files use PascalCase. The doc itself elsewhere references components by PascalCase filename. Fix is a one-line CLAUDE.md edit with zero code churn.
- **Recommendation**: Update CLAUDE.md File Naming section to state PascalCase to match the actual convention used everywhere in src/components.

#### `Doc claims neighborhood prefill from favorite_hoods "no longer applies"; NeighborhoodStep still prefills` — `safe-now` — `doc_drift`

- **Location**: `CLAUDE.md:329`
  - Additional sites: `src/components/questionnaire/NeighborhoodStep.tsx:31-57`, `CLAUDE.md:358`
- **Rule violated**: CLAUDE.md "Questionnaire Flow" section
- **Evidence**: CLAUDE.md line 329 (Questionnaire Flow): "Neighborhood prefill from `profile.favorite_hoods` no longer applies — that data is no longer collected". Reality (src/components/questionnaire/NeighborhoodStep.tsx:31-57): the prefill is alive and well — `const prefill = profile.favorite_hoods.slice(0, 1); ... setSelected(prefill); setDidPrefill(true);`. Existing accounts with `favorite_hoods` populated still get their first favorite auto-selected.
- **Verify**: CLAUDE.md states twice that favorite_hoods prefill no longer applies (lines 345 and 358). But NeighborhoodStep.tsx lines 43-57 actively implement the prefill. Code comment at NeighborhoodStep.tsx:37-39 confirms this is intentional legacy-account behavior. Doc contradicts code in two places. Original cite was CLAUDE.md:329, but the actual contradicting text is at lines 345 and 358 — minor citation drift, substance is accurate.
- **Recommendation**: Update CLAUDE.md to say "single-select prefill from `profile.favorite_hoods[0]` still applies for legacy accounts with populated data; new users no longer populate this field via onboarding so prefill is a no-op for them".

#### `Doc says composer_users.context "no longer written"; upsertProfile still writes context: []` — `safe-now` — `doc_drift`

- **Location**: `CLAUDE.md:226`
  - Additional sites: `src/lib/auth.ts:147-154`, `src/components/onboarding/OnboardingFlow.tsx:11-12`, `src/components/onboarding/OnboardingFlow.tsx:9-12`, `src/lib/validation/profile.ts:44-51`, `src/types/index.ts:74`, `src/types/index.ts:86,97`
- **Rule violated**: CLAUDE.md "Onboarding Flow" section
- **Evidence**: CLAUDE.md line 226 and similar at line 358: "`composer_users.context` column is retained but no longer written". Reality (src/lib/auth.ts:147-154): every `upsertProfile` call still writes the `context` column — `row = { ..., context: prefs.context ?? [], ... }` — defaulting to `[]` when undefined. New users get an explicit empty-array INSERT on `context` on every onboarding save.
- **Verify**: src/lib/auth.ts:147-154 — row literal includes `context: prefs.context ?? []` and is the body of the upsert. UserPrefs type has context as optional. OnboardingFlow.tsx:92-97 builds prefs WITHOUT a context key, so prefs.context is always undefined at the new-signup site → the `?? []` branch fires every time. validateProfilePayload still validates context against CONTEXT_OPTIONS, but since prefs.context is undefined at the call site, the validation block is skipped — so it's dead defensive code post the 2026-05-20 removal but not a write site.
- **Recommendation**: Either (a) update CLAUDE.md to say "context is written as [] on every onboarding" (honest), or (b) strip the `context: prefs.context ?? []` line from auth.ts:150 and rely on the column default to make the docs accurate.

#### `Header lives at src/components/Header.tsx, but Project Structure puts it under ui/` — `safe-now` — `doc_drift`

- **Location**: `CLAUDE.md:93`
  - Additional sites: `src/components/Header.tsx`, `src/app/itinerary/page.tsx:45`, `src/components/home/HomeScreen.tsx:9`, `src/app/profile/page.tsx:13`, `src/app/itinerary/saved/[id]/page.tsx:22`, `src/app/itinerary/share/[id]/page.tsx:20`, `src/components/questionnaire/QuestionnaireShell.tsx:45`, `src/components/itinerary/LuckyCrown.tsx:19`, `src/components/onboarding/OnboardingFlow.tsx:33`
- **Rule violated**: Discretionary
- **Evidence**: CLAUDE.md line 93 lists `ui/  # Header (rightSlot prop), Button, StopCard, etc.` placing Header in `src/components/ui/`. Actual location is `src/components/Header.tsx` (top-level under components/), with every import doing `from "@/components/Header"` (8 callsites). There is no `src/components/ui/Header.tsx`.
- **Verify**: Confirmed `src/components/Header.tsx` exists; `src/components/ui/` contains Button, DatePicker, FeedbackButton, OptionCard, ProgressBar, StopCard, StopStatusBadge, Tooltip, WalkConnector — no Header. `grep "@/components/ui/Header"` returns zero matches. All 8 import sites use `@/components/Header`. Simplest fix is to update CLAUDE.md to list Header at the top of `components/` rather than under `ui/`.
- **Recommendation**: Either move the file to src/components/ui/Header.tsx to match the docs, or fix Project Structure to list Header at the top of `components/` (not under ui/).

#### `Project Structure is significantly incomplete (missing routes, dirs, files)` — `safe-now` — `doc_drift`

- **Location**: `CLAUDE.md:80-141`
  - Additional sites: `src/hooks/`, `src/app/api/analytics/track/`, `src/app/api/availability/[venueId]/`, `src/app/api/daily-pick/`, `src/app/api/itineraries/[id]/`, `src/app/admin/onboarding/`, `src/app/auth/callback/`, `src/app/auth/reset/`, `src/components/venue/`, `src/components/shared/SavedPlanRow.tsx`, `src/lib/analytics/events.ts`, `src/lib/itinerary/pre-filter.ts`, `src/lib/itinerary/compose-failure.ts`, `src/lib/itinerary/compose-failure-server.ts`, `src/lib/itinerary/save.ts`, `src/lib/itinerary/saved-hydration.ts`, `src/lib/itinerary/is-lucky.ts`, `src/lib/itinerary/swap-reason.ts`, `src/lib/lucky.ts`, `src/lib/lucky-runner.ts`, `src/lib/exclusions.ts`, `src/config/lucky.ts`, `src/config/cities.ts`, `src/config/group-visibility.ts`, `src/config/occasions.ts`, `src/lib/format/category.ts`, `src/lib/format/stop-eyebrow.ts`, `src/lib/calendar.ts`, `src/lib/dateUtils.ts`, `src/lib/mapbox.ts`, `src/lib/posthog-server.ts`, `src/lib/questionnaireReducer.ts`, `src/lib/styles.ts`, `CLAUDE.md:98` (internal contradiction)
- **Rule violated**: Discretionary
- **Evidence**: CLAUDE.md Project Structure (lines 80-141) lists src/app, src/components, src/lib, src/config. Missing entirely: src/hooks/, multiple API routes, multiple app pages, the components/venue/ dir, the entire lucky stack (lib/lucky.ts, lib/lucky-runner.ts, config/lucky.ts, components/home/LuckyDieButton+LuckyOverlay+TonightsPickCard, components/itinerary/LuckyBanner+LuckyCrown, lib/itinerary/is-lucky.ts) — which is itself a documented feature in the same file. The tree drifted enough that new contributors cannot rely on it as a map.
- **Verify**: src/hooks/ exists with 3 hook files. src/lib/format/ exists with category.ts + stop-eyebrow.ts. src/lib/analytics/ exists with 3 files. src/lib/venues/ has 11 files vs the documented single `images.ts`. src/lib/itinerary/ has 11 files vs the documented 4. src/config/ has 14 ts files vs the documented ~10. Internal doc inconsistency at CLAUDE.md:98 says onboarding has "3 steps; hood step commented out" while the Onboarding Flow narrative section says "Two steps".
- **Recommendation**: Regenerate the Project Structure block from the actual src/ tree, or replace it with a one-liner pointing to `find src -type d` and the README map; the current frozen snapshot is misleading.

#### `Project Structure mentions config/onboarding.ts owns CONTEXT_TO_OCCASION; that map was removed` — `safe-now` — `doc_drift`

- **Location**: `CLAUDE.md:132`
  - Additional sites: `src/config/onboarding.ts`, `README.md:96`
- **Rule violated**: Discretionary
- **Evidence**: CLAUDE.md line 132 lists `onboarding.ts # CONTEXT_OPTIONS + CONTEXT_TO_OCCASION`. Reality (src/config/onboarding.ts): CONTEXT_OPTIONS exists but CONTEXT_TO_OCCASION is gone (and CLAUDE.md itself acknowledges this elsewhere at line 326). The structure block in the doc contradicts the prose later in the same doc.
- **Verify**: grep across the repo finds CONTEXT_TO_OCCASION only in: CLAUDE.md:132 (the offender) + CLAUDE.md:345 (the contradiction), README.md:96 (same stale Project Structure block — additional site), docs/archive/* and docs/debug/* (historical), and a comment in QuestionnaireShell.tsx:89 noting the map was removed. No live TypeScript export.
- **Recommendation**: Remove `+ CONTEXT_TO_OCCASION` from the Project Structure line for onboarding.ts.

#### `Questionnaire budget documented with 5 options; UI ships 3 (all_out + no_preference dropped)` — `safe-now` — `doc_drift`

- **Location**: `CLAUDE.md:340`
  - Additional sites: `src/config/budgets.ts:34-44`, `src/config/options.ts:44`
- **Rule violated**: Discretionary
- **Evidence**: CLAUDE.md line 340: "Budget — `casual` | `nice_out` | `splurge` | `all_out` | `no_preference` / Display labels: Budget, Solid, Splurge, All Out, No Preference". Reality (src/config/budgets.ts:34-44): the COMPOSE_BUDGET_SLUGS list narrows the user-facing set to three (`casual`, `nice_out`, `splurge`); `all_out` and `no_preference` are deliberately filtered out of BUDGETS at the consumer layer in Phase 1.
- **Verify**: CLAUDE.md:339-340 lists all 5 budget slugs and 5 display labels for the Questionnaire step 3 surface. Reality at src/config/budgets.ts:34-44 defines COMPOSE_BUDGET_SLUGS as exactly ["casual","nice_out","splurge"] and filters BUDGETS (line 46-53) to that set. The questionnaire consumes BUDGETS directly via src/config/options.ts:44, so the user-facing surface ships 3 cards, not 5. The in-code comment at budgets.ts:34-39 already documents the rationale ("Phase 1 narrowed... canonical generated config still includes them so saved/share itineraries keep rendering").
- **Recommendation**: Update CLAUDE.md Questionnaire step 3 to list 3 user-facing budget options and add a sentence that `all_out` / `no_preference` are retained as canonical slugs only for legacy saved itineraries, not user-selectable.

#### `Questionnaire occasion documented as 5 options; code has 3 buckets (date/friends/solo)` — `safe-now` — `doc_drift`

- **Location**: `CLAUDE.md:336`
  - Additional sites: `src/config/options.ts:20-30`, `src/lib/scoring.ts:37-38`, `CLAUDE.md:347` (stale `relationship` slug example), `src/config/prompts.ts:83`, `ALGORITHM.md:73`
- **Rule violated**: Discretionary
- **Evidence**: CLAUDE.md lines 336-337 (Questionnaire Flow step 1): "Occasion — `dating` | `relationship` | `friends` | `family` | `solo`". Actual src/config/options.ts:26-30 ships only three: `{ value: "date", label: "Date Night" }`, `{ value: "friends", label: "Friends Night Out" }`, `{ value: "solo", label: "Solo" }`. src/lib/scoring.ts:37-38 confirms the bucket model — `OCCASION_BUCKET_TO_SHEET_SLUGS = { date: ["first_date", "dating", "couple"], ... }`.
- **Verify**: The comment block at the top of options.ts (lines 4-8) explicitly describes the 3-bucket UI and the fan-out — the canonical docs are inside the code file, and CLAUDE.md is stale. Additional stale site found: CLAUDE.md:347 uses `relationship` as the example of a "stable slug" — but `relationship` no longer exists anywhere in the codebase. That example needs swapping. src/config/prompts.ts:83 has OCCASION_BUCKET_TO_GEMINI_FRAMING keyed on the 3 buckets, confirming the bucket model is load-bearing across scoring + Gemini framing. ALGORITHM.md:73 references "dating, friends, solo, etc." informally.
- **Recommendation**: Rewrite CLAUDE.md Questionnaire Flow step 1 to describe the 3-bucket (`date` | `friends` | `solo`) UI and the OCCASION_BUCKET_TO_SHEET_SLUGS fan-out.

#### `Questionnaire vibe documented as 4 options including mix_it_up; UI ships 3 (mix_it_up dropped)` — `safe-now` — `doc_drift`

- **Location**: `CLAUDE.md:342`
  - Additional sites: `src/config/vibes.ts:27-31`, `src/config/vibes.ts:39-47`, `src/config/vibes.ts:64`, `src/config/vibes.ts:81-83`
- **Rule violated**: Discretionary
- **Evidence**: CLAUDE.md line 342 says: "Vibe — `food_forward` | `drinks_led` | `activity_food` | `mix_it_up` / Display labels: Meal, Drinks, Activity, Variety". Additionally line 187 lists "Vibes: `Meal` / `Drinks` / `Activity` / `Stroll` / `Variety`" (a fifth "Stroll" label that doesn't exist anywhere). Reality (src/config/vibes.ts): only `food_forward`, `drinks_led`, `activity_food` ship to the questionnaire; `mix_it_up` is explicitly dropped via `DROPPED_VIBES = new Set(["mix_it_up"])`.
- **Verify**: grep -rn "Stroll\|Variety" src/ returns only the vibes.ts:39 comment ("Phase 7: `mix_it_up` (Variety) dropped from the questionnaire"). No "Stroll" string exists anywhere in code. The Phase 7 drop comment explicitly notes the legacy slug remains a defensible string lookup for old saved itineraries but is excluded from the user-facing VIBES array.
- **Recommendation**: Update CLAUDE.md to list only the 3 user-facing vibes (Meal / Drinks / Activity), note that `mix_it_up` remains a legacy/fallback slug for old saved itineraries only, and drop the phantom "Stroll" label from line 187.

#### `options.ts comment claims "11 user-facing groups" but actual count is 25` — `safe-now` — `doc_drift`

- **Location**: `src/config/options.ts:10`
  - Additional sites: `src/config/onboarding.ts:8`, `src/config/generated/neighborhoods.ts` (25 entries)
- **Rule violated**: Discretionary
- **Evidence**: src/config/options.ts:10-11 (header comment): "The `neighborhoods` step uses `NEIGHBORHOOD_GROUPS` (the 11 user-facing groups), NOT the full 68-slug `NEIGHBORHOODS` list." Same comment in src/config/onboarding.ts:8: "the onboarding picker stays at ~11 manageable options". Reality: a count over src/config/generated/neighborhoods.ts returns 25, and CLAUDE.md line 189 itself says "Neighborhoods — 25 user-facing groups".
- **Verify**: A grep for top-level entries in src/config/generated/neighborhoods.ts returns 25, matching CLAUDE.md's authoritative statement. The "68-slug `NEIGHBORHOODS` list" reference is itself suspect — the count of underlying storage slugs may also have drifted, though that wasn't part of the original finding.
- **Recommendation**: Bump the count to 25 in both `src/config/options.ts:10` and `src/config/onboarding.ts:8`, or drop the count entirely and say "the user-facing groups" with no number.

#### `Canonical disabled-state rule violated by 5 admin sync components` — `post-launch` — `doc_drift`

- **Location**: `src/app/profile/_components/SyncResultPanel.tsx:157`
  - Additional sites: `src/app/profile/_components/SyncResultPanel.tsx:204`, `src/app/profile/_components/ThresholdOverrideDialog.tsx:82`, `src/app/profile/_components/SyncPreviewPanel.tsx:144`, `src/app/profile/_components/SyncPreviewPanel.tsx:153`
- **Rule violated**: CLAUDE.md "Disabled state — one canonical treatment"
- **Evidence**: CLAUDE.md lines 410-419 ("Disabled state — one canonical treatment"): "Every button-shaped affordance in the app uses the SAME disabled treatment ... Color does NOT change. No swap to grey/muted/burgundy-tint backgrounds — that's how `disabled:bg-muted` and similar one-offs creep in and split the visual language." Reality: 5 hand-rolled callsites in admin profile sync components still use `bg-burgundy hover:bg-burgundy-light disabled:bg-muted disabled:cursor-not-allowed` (the exact anti-pattern called out as removed from SwapReasonModal).
- **Verify**: Full repo grep `grep -rn "disabled:bg-" src/` returns exactly the 5 cited sites plus one match in SwapReasonModal.tsx:218 which is a code comment documenting why the pattern was removed there — confirming the finding's site list is complete. The SwapReasonModal comment block (lines 215-219) is itself documentation of the canonical fix path: route through `<Button>` primitive with variant="primary" size="sm". The same fix applies cleanly to all 5 admin sync sites.
- **Recommendation**: Either scope the disabled-state rule in CLAUDE.md to non-admin surfaces, or refactor these five admin buttons to go through `<Button>` so the doc claim holds universally.

### known_target

#### `Analytics rename wave left no other orphaned helpers/types` — `safe-now` — `known_target`

- **Location**: `src/lib/analytics/events.ts, src/lib/analytics.ts, src/lib/analytics-server.ts`
  - Additional sites: `src/lib/analytics.ts:30` (`type ItineraryRef` re-export, no external consumers), `src/lib/analytics.ts:31` (`type VenueRef` re-export, no external consumers)
- **Rule violated**: Discretionary
- **Evidence**: Verified every other exported helper has callers: `buildComposeContext` (15+ sites), `buildItineraryContext` (1 caller), `getAnalyticsHeaders` (5 callers), `setPersonProperties`, `incrementPersonProperty`, type exports `ComposeContext / ComposeContextInputs / ItineraryRef / VenueRef / EventName / EventSchemas` consumed by call sites and tests. The `_eventSchemaCoverageCheck` runtime nudge is a documented compile-time guard, not orphan. Nothing else to prune from the rename wave.
- **Verify**: One minor inaccuracy in the evidence: ItineraryRef and VenueRef are re-exported from src/lib/analytics.ts:30-31 but have NO external consumers — outside src/lib/analytics/events.ts itself, the only "matches" are prose comments. The interfaces ARE used inside events.ts as building blocks for the EventSchemas entries, so they cannot be deleted entirely — but the two `type ItineraryRef` / `type VenueRef` re-exports in analytics.ts could be pruned. This is borderline (3 lines of dead re-export, no behavioral cost) and doesn't undermine the finding's "nothing significant left to prune" conclusion.
- **Recommendation**: Mark this ledger item complete after removing `setPersonPropertiesOnce` (separate finding above).

#### `Dead analytics helper: setPersonPropertiesOnce has zero call sites` — `safe-now` — `known_target`

- **Location**: `src/lib/analytics.ts:164-172`
- **Rule violated**: CLAUDE.md — Analytics → Wrappers-only rule (direct `posthog.*` calls outside the wrappers + the explicit allowlist)
- **Evidence**: Definition: `export function setPersonPropertiesOnce(props: Record<string, unknown>) { ... posthog.setPersonProperties(undefined, props); ... }`. A repo-wide grep for `setPersonPropertiesOnce\b` in src/ + tests/ finds the definition + a string literal in `tests/unit/analytics-pii-denylist.test.ts:105` (regex token only, NOT a call). The expected caller — AuthProvider's signup_at / signup_source `$set_once` write — bypasses the wrapper and calls `posthog.identify(s.user.id, undefined, { signup_at, signup_source })` directly. The doc-comment on the helper at analytics.ts:148-149 still claims it owns the `signup_at, signup_source` path.
- **Verify**: grep -rn "setPersonPropertiesOnce" src/ tests/ returns exactly 3 hits: definition, error log inside that definition, and the regex alternation token in the PII denylist test. Zero call sites. AuthProvider.tsx posthog.* call sites: line 121 (identify), line 191 (reset) — neither uses setPersonPropertiesOnce. That direct call is itself blessed by CLAUDE.md's wrappers-only rule (AuthProvider is named in the allowlist for identify/reset), so the bypass isn't a violation — but the helper is genuinely dead code. Deletion is safe: the PII denylist test regex uses alternation `(setPersonProperties|setPersonPropertiesOnce|...)` and continues to match the surviving `setPersonProperties` token.
- **Recommendation**: Delete `setPersonPropertiesOnce` and update the surrounding doc-block, OR route AuthProvider's identify-$set_once through it for parity with the production-env gate (currently the direct call sidesteps `isProductionEnv()`).

#### `reids_claude/ legacy JS prototype directory — confirmed absent` — `safe-now` — `known_target` — ✅ LEDGER CLOSED 2026-06-12

- **Location**: `repo root`
- **Rule violated**: Discretionary
- **Evidence**: `ls -la` at the repo root shows no `reids_claude/` entry. Direct `ls reids_claude` returns `No such file or directory`. Visible top-level dirs: assets, docs, migrations, node_modules, public, scripts, src, supabase, tests (plus tooling/config files).
- **Verify**: `git ls-files | grep -i reids` returns empty, so it isn't tracked either. The only residual references are inside `docs/debug/reid-audit.md`, which is a historical audit document describing the now-deleted directory. Git history (`14c78c0`, `1594afa`, `6afaf34`) shows it once existed but was removed.
- **Status**: ✅ **Closed Wave 0 (2026-06-12).** Confirmed absent both on disk and in `git ls-files`. The only residual reference is the historical audit document at `docs/debug/reid-audit.md` which is preserved as a record, not a TODO.

---

## Refuted findings

Kept for traceability per audit-owner request.

| Dimension | Title | Refute rationale |
|---|---|---|
| dead_code | ALREADY CLEAN: reids_claude/ legacy prototype directory absent | Evidence holds verbatim but the finding is a tautology — its own recommendation is "no action" and it documents absence of debt rather than identifying debt. Should not occupy an audit slot. |
| dead_code | ALREADY CLEAN: date-picker 'restoration recipe' comment absent from WhenStep | Factual claim holds (no such comment exists) but the finding is a tautology — there's nothing to delete, refactor, or flag. Confirms absence of a hypothetical stale comment without naming any work. |
| architecture | daily-pick diverges from the four-endpoint compose-route pattern by design | The divergence is explicitly documented as a non-negotiable architectural rule in the file-level comment (lines 23-28). The finding's own recommendation is "leave it alone." Non-actionable; documents a deliberate, blessed divergence. |
| known_target | Date-picker `restoration recipe` comment — already absent in WhenStep.tsx | Finding correctly observes no such comment exists — but is a tautology (nothing to fix). The remaining comment blocks document current behavior, not restoration recipes. |
| known_target | Type widening remnants are deliberate and tightening them is net-negative | All 10 cited sites have documented or structurally-obvious upstream gates. The finding correctly identifies this as not-worth-it. CLAUDE.md prohibits `any` and `ts-ignore` but does NOT prohibit `as unknown as T` narrowing or `!` after upstream gates. Tightening would add nullish-path ceremony for paths the type system already rules out. |
| known_target | Second paginating loop in venues/import.ts deliberately not consolidated into fetchActiveVenues | Explicitly intentional and documented: fetch-active.ts:11-17 calls out the deliberate non-consolidation as a parked follow-up; CLAUDE.md names fetchAllDbVenues as a "canonical paginator pattern"; the finding's own recommendation is "leave as-is for now." Non-actionable. |

---

## Methodology

Nine dimension finders (duplication, sst, dead_code, abstraction, architecture, efficiency, tests, doc_drift, known_target) fanned out across `src/`, `tests/`, `scripts/`, and the root docs (`CLAUDE.md`, `ALGORITHM.md`, `README.md`) to surface candidate findings. Each candidate was then adversarially verified — re-reading cited file:line spans against current source, exhaustively grepping for additional sites and missed duplicates, and checking against CLAUDE.md / CODING_STANDARDS.md to filter out blessed patterns. Non-actionable tautologies ("already clean: X absent") and findings whose own recommendation was "leave as-is" were filed as refuted rather than confirmed. The project lacks jsdom, so several rendering-contract tests intentionally use source-grep assertions (not a finding — methodology note relevant when reading the `tests` dimension).
