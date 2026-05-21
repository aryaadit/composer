# Composer launch recon — 2026-05-20

Pre-soft-launch state check on `main`. Read-only — no changes made.

---

## Top-line: what's launch-blocking

Two issues stand out as real launch blockers:

1. **🔴 Questionnaire occasion taxonomy doesn't match the venue sheet.** UI offers `relationship` and `family` as occasions; the venue sheet has no venues tagged with either slug. Users picking those get a flat 0 on the 15-point occasion-match signal. The generated taxonomy has `couple` and `first_date` instead — neither is selectable from the UI. `/api/health` smoke-tests with `first_date` (sheet-valid but UI-unreachable), so the health check passes despite the user-facing mismatch.
2. **🟠 `metadataBase` is unset.** Share-link OG previews in iMessage/Slack/Twitter will render with `http://localhost:3000` as the image base. The whole point of `/itinerary/share/[id]` is shareability; right now the messaging-app preview will be broken.

Everything else is clean enough to ship behind a small audience this week, but I'd fix #1 before launch — that's a scoring regression on 40% of the occasion picker.

---

## 1. Branch state

- ⚠️ **Not on main.** Currently on `adit/sandbox-testing`, 1 commit ahead of main (docs-only: `07d7572 docs(composer): archive 2026-05-01 audit, add session handoff doc`). Untracked working-tree file: `docs/reid-branch-review-2026-05-20.md`. For source files, working tree = main.
- Most recent main commit: **`70439eb` on 2026-05-01** (19 days ago).

Last 15 commits on `main`:

```
70439eb  docs(composer): database cleanup — drop legacy tables, audit grants (followups #6)
e0fee9e  fix(composer): redirect /privacy to canonical onpalate.com URL
88846e0  fix(composer): stabilize scrollbar gutter to prevent logo horizontal shift
1cc3f65  fix(composer): skeleton loading states for venue sync UI
90d565d  chore(infra): repair migration tracking — deduplicate version filenames (followups #1)
972ac5b  chore(composer): delete legacy import paths, refresh config comments (Phase 5b)
e002383  fix(composer): Phase 5a UI fixes — layout, copy, override fail-loud, lookup compact result
fabb6a3  feat(composer): admin route cutover to new import module + explanatory UI (Phase 5a)
a91c030  feat(composer): import audit trail (Phase 4)
e36843c  feat(composer): orphan deactivation in atomic apply (Phase 3)
e506f1e  feat(composer): atomic apply path with sanity assertions (Phase 2)
9cc9c2b  feat(composer): venue import module with dry-run mode (Phase 1)
963c423  moving docs to archive
601456f  docs: align active documentation with current state after 2026-04-27 → 2026-05-01 changes
8697931  chore(scripts): add image_keys restore script for post-import recovery
```

---

## 2. Build + type + lint health

| Check | Result |
|---|---|
| `npx tsc --noEmit` | ✅ Clean (0 errors) |
| `npm run lint` | ✅ 0 errors, 5 warnings |
| `npm run build` | ✅ Compiles + 19 static/dynamic routes generated |
| `npx vitest run` | ✅ 103/103 tests passing across 5 files |

**Lint warnings (5):**

```
src/app/profile/_components/AccountDetails.tsx:201       'HoodsField' is defined but never used
src/components/onboarding/OnboardingFlow.tsx:25          'NeighborhoodPicker' is defined but never used
src/components/onboarding/OnboardingFlow.tsx:43          'setFavoriteHoods' is assigned a value but never used
src/components/ui/StopCard.tsx:110                       <img> instead of next/image
src/components/venue/VenueDetailModal.tsx:242            <img> instead of next/image
```

The two unused-variable warnings in `OnboardingFlow.tsx` are the **commented-out neighborhood step** (intentional per CLAUDE.md — kept around to restore later). `HoodsField` is similar dead code. The two `<img>` warnings are pre-existing and tracked as an "out of scope" item in the 2026-05-01 codebase audit.

**Build warning:**

```
⚠ metadataBase property in metadata export is not set for resolving social
open graph or twitter images, using "http://localhost:3000".
```

Important for share links — see top-line item #2.

---

## 3. Env + config sanity

### `.env.example` is severely stale

| Variable | In `.env.example`? | In `.env.local`? | Used by code? |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | ✅ | ✅ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | ✅ | ✅ |
| `SUPABASE_SERVICE_ROLE_KEY` | ❌ missing | ✅ | ✅ required (admin routes, /api/profile) |
| `GEMINI_API_KEY` | ❌ missing | ✅ | ✅ required (claude.ts copy generation) |
| `OPENWEATHERMAP_API_KEY` | ✅ | ✅ | ✅ |
| `GOOGLE_SHEETS_CLIENT_EMAIL` | ❌ missing | ✅ | ✅ required (sheet sync) |
| `GOOGLE_SHEETS_PRIVATE_KEY` | ❌ missing | ✅ | ✅ required (sheet sync) |
| `GOOGLE_SHEET_ID` | ❌ missing | ✅ | ✅ required (sheet sync) |
| `GOOGLE_PLACES_API_KEY` | ❌ missing | ✅ | optional (photo + price-tier backfill scripts) |
| `MAPBOX_TOKEN` (or `_ACCESS_TOKEN`) | `MAPBOX_TOKEN` in example | ❌ missing in `.env.local` | required-ish (walk maps silently disabled when missing) |
| `ANTHROPIC_API_KEY` | ✅ in example | ❌ not set | ❌ **unused** — Composer uses Gemini, not Anthropic |
| `RESY_API_KEY` | ✅ in example | ❌ not set | ❌ **unused** — Resy lib uses anonymous public endpoint |

**Conclusions:**
- `.env.example` is misleading for any new contributor. Lists two unused keys (`ANTHROPIC_API_KEY`, `RESY_API_KEY`) and is missing seven keys that are actually required.
- **`MAPBOX_TOKEN` is not in `.env.local`** → walk maps render as text-only with no fallback placeholder in local dev. See section 7 below.
- **`MAPBOX_TOKEN` vs `MAPBOX_ACCESS_TOKEN` mismatch**: CLAUDE.md says `MAPBOX_ACCESS_TOKEN`. Code (`src/lib/mapbox.ts:12`) uses `MAPBOX_TOKEN`. Whichever is in Vercel needs to match the code, not the docs.

### `src/config/algorithm.ts` summary

Vibe match dominates: **35 pts** at 2+ tag overlap, 25 / 10 for partial / none, 25 baseline for "mix it up". Occasion = 15, budget = 15 (tiebreaker — also hard filter), neighborhood = 10, timeRelevance = 10, qualityNormalize = 10, curationMultiplier = 5, googleRating = 5. Category-duplicate penalty = -20. Jitter magnitude = 10. Hard walk caps: 1.5 km normal / 0.4 km bad weather. Budget widening triggers at <30-venue pool. Top-N weighted pick: top 5 with `[5, 4, 3, 2, 1]` weights. All weights match what's documented in ALGORITHM.md. **Clean — no drift.**

### 🔴 Generated configs vs UI taxonomy — MISMATCH

`src/config/generated/occasions.ts` (sheet-authoritative):
```ts
export const OCCASIONS = ["couple", "dating", "first_date", "friends", "solo"];
```

`src/config/options.ts` (questionnaire UI) offers:
```
dating | relationship | friends | family | solo
```

`src/config/onboarding.ts` (onboarding context + CONTEXT_TO_OCCASION mapping) mirrors the UI list and maps each slug to itself.

**Net effect:**
- `relationship` and `family` are user-selectable but **no venue is tagged with them**. The 15-pt occasion-match signal always scores 0 for those two choices. Itineraries still generate (other signals pick up slack) but the algorithm is silently degraded for 40% of the occasion picker.
- `couple` and `first_date` are tagged on venues but **never selected by real users**.
- Comment in `options.ts:5-7` references a "First / Second Date" grouping card that no longer exists — stale doc.

Either re-align the sheet's `OCCASIONS` to the UI's slug list (and regenerate), or rewrite the UI to use the canonical slugs. The first is faster; the second is more conventional.

Generated `vibes.ts` ↔ UI vibes match cleanly. Neighborhoods, budgets, stop-roles, categories all match.

---

## 4. Feature inventory

### Page routes (9)

| Route | Gate | Notes |
|---|---|---|
| `/` | Public (router) | Root gate. Bounces to `/onboarding` or HomeScreen depending on session + profile |
| `/auth/reset` | Public | Password-reset recovery handoff |
| `/itinerary/share/[id]` | Public | Shared itinerary view |
| `/compose` | ⚠️ Soft | No `useAuth` gate; server component just renders `<QuestionnaireShell />`. Direct hits without a session work; downstream `/api/generate` falls through to unauthed prefs |
| `/itinerary/saved/[id]` | ⚠️ Soft | No explicit redirect; RLS gates DB read so unauthed = empty page |
| `/itinerary` | Session-gated | `useAuth`-aware client component |
| `/onboarding` | Session-gated | Redirects to `/` if no session; allows session-without-profile |
| `/profile` | Session-gated | Redirects to `/` if no session |
| `/admin/onboarding` | **Admin-gated** | Redirects unless `isAdmin === true`. Lets you re-run onboarding to tweak your own profile via the same UI |

### API routes (10) + 1 callback

| Route | Notes |
|---|---|
| `/api/generate` | Main itinerary generator |
| `/api/add-stop` | Extend itinerary |
| `/api/swap-stop` | Replace one stop |
| `/api/share` | Snapshot itinerary into shareable link |
| `/api/profile` | PATCH — validated profile updates |
| `/api/itineraries/[id]` | Saved itinerary CRUD |
| `/api/availability/[venueId]` | Resy per-venue availability lookup |
| `/api/health` | Diagnostic read-only |
| `/api/admin/sync-venues` | Admin-gated venue sheet sync |
| `/api/admin/venue` | Admin-gated lookup |
| `/auth/callback` | Supabase recovery code → session exchange (built from Next.js, not a page) |

**No orphaned routes detected.** `/admin/onboarding` is unusual but documented inline ("admins re-run onboarding for themselves"). `/api/availability/[venueId]` is wired through `useSwapStop` → swap UI.

---

## 5. Known-issue scan

| Pattern | Hits |
|---|---|
| `TODO` / `FIXME` / `XXX` / `HACK` / `@deprecated` in `src/` | **Zero** ✅ |
| `console.error` / `console.warn` | 38 usages, all in proper error paths (no obvious red flags) |
| `SMTP` / `Resend` (service) / `Sendgrid` / `Mailgun` / `Nodemailer` | None. "Resend" in the codebase refers to the SMS-OTP resend cooldown only |
| Docs flagging pending launch work | One stale: `docs/archive/algorithm-smoke-test-2026-04-27.md` (archival, not authoritative per memory) |

The handoff doc at `docs/handoff-2026-05-01.md` is the authoritative open-work list; the audit at `docs/archive/codebase-audit-2026-05-01.md` is the queued cleanup queue. Both are listed in section 8.

---

## 6. Mobile-readiness spot check

✅ **Clean.**

- No hardcoded `min-width:` media queries triggered by my grep on tailwind class patterns.
- No hardcoded widths over 430px anywhere.
- Only wide-container usage is two `max-w-2xl` paragraphs in `AdminSection.tsx` (admin-only, not user-facing).
- Questionnaire shell, itinerary view, onboarding flow are all mobile-first patterns (`max-w-md`/`max-w-lg`/`px-6` style containers).

Nothing flagged.

---

## 7. Pending items from your notes

### Resend SMTP / sender name

**There is no SMTP setup of any kind in the codebase.** No `Resend`/`Sendgrid`/`Mailgun`/`Nodemailer`/`SMTP` references anywhere. The "Resend" you may be thinking of in the code is just the **SMS OTP resend-cooldown** button in `AuthScreen.tsx` (`RESEND_COOLDOWN_S = 60`).

If the sender-name concern is about transactional email (password reset, email change confirmations), those go through **Supabase Auth's built-in email** — configured in the Supabase Dashboard → Authentication → Email Templates, not in this repo. If you want the sender to say "Composer" rather than "Supabase Auth," that's an out-of-band dashboard change.

If the concern is about **SMS sender ID**, that's a Twilio Console + Twilio TFV submission detail, not code.

The SMS consent disclosure in `AuthScreen.tsx:322-334` reads "you agree to receive SMS messages from Composer" — that's already named.

### Broken map placeholder on the itinerary output page

Found it. The issue is in `src/components/ui/WalkConnector.tsx` and `src/lib/mapbox.ts`:

- `mapbox.ts:12` reads `process.env.MAPBOX_TOKEN`. When missing, `buildWalkMapUrl()` returns `null` and logs a warning.
- `WalkConnector.tsx:23` only renders the `<img>` if `mapUrl` is truthy. **No fallback placeholder, no neutral background, no map icon — it just renders nothing.**
- Walk segment then shows only the "12 min walk" text.

Two concrete problems contributing to the launch issue:
1. `.env.local` doesn't have `MAPBOX_TOKEN` set at all → maps are silently disabled locally.
2. **CLAUDE.md says the env var should be `MAPBOX_ACCESS_TOKEN`**; code reads `MAPBOX_TOKEN`. If whoever set up Vercel followed CLAUDE.md, production also has no map. Verify in the Vercel dashboard.

Fix path: either add a minimal placeholder in `WalkConnector.tsx` (light-gray rounded rect + walk icon) so missing maps don't look broken, **or** make sure `MAPBOX_TOKEN` is set in Vercel (and rename the env var to match CLAUDE.md, updating the code).

### Reid's `is_admin` flag

**This is a DB action, not a code change.** The code is already in place:
- `AuthProvider.tsx:111` reads `profile.is_admin ?? false`
- `useAuth().isAdmin` exposes it
- `AdminSection.tsx:117` returns `null` when not admin
- `/admin/onboarding` redirects non-admins
- `/api/admin/*` routes verify via SELECT on `composer_users.is_admin`

To make Reid an admin, run the SQL from CLAUDE.md ("Auth Tables" section):

```sql
update composer_users set is_admin = true where id = (
  select id from auth.users where email = 'reid@<his-email>'
);
```

That's it. No code change required.

---

## 8. Production-readiness audit

### `/api/health`

⚠️ **Couldn't test live** — dev server isn't running on `localhost:3000`. The route itself compiles cleanly into the build (`ƒ /api/health`). Three checks it runs: Supabase connectivity + active venue count, scoring pipeline smoke (first_date + West Village + nice_out + food_forward), Gemini round-trip latency. Recommend running `curl http://localhost:3000/api/health | jq` once a dev server is up.

⚠️ Health input uses `occasion: "first_date"` — a sheet-valid but UI-unreachable slug per section 3. The pipeline test passes but doesn't exercise a user-reachable path. Worth changing to `occasion: "dating"` once the taxonomy mismatch is resolved.

### `/privacy` (Twilio TFV)

✅ `next.config.ts` redirects `/privacy → https://www.onpalate.com/composer/privacy` with HTTP 308. The in-app SMS-consent link in `AuthScreen.tsx` already points at the canonical URL directly. **I cannot reach the external page from this session — verify externally that `https://www.onpalate.com/composer/privacy` is live, complete, and matches what Twilio TFV requires.** This is the operational follow-up flagged in the 2026-05-01 handoff (still open).

### Empty + error states

| Surface | Coverage |
|---|---|
| `/itinerary` loading | ✅ `<StepLoading />` |
| `/itinerary` post-generate failure | ✅ "We don't have a plan loaded" / "That didn't work. Try again." |
| `/itinerary` regenerate failure | ✅ Inline `regenError` banner (3s auto-clear) |
| `/itinerary` add-stop failure | ✅ Inline error message (3s auto-clear) |
| `/itinerary` swap failure | ✅ `swapError` plumbed through `useSwapStop` → `ItineraryView` |
| `/itinerary/saved/[id]` not found | ⚠️ No explicit not-found UI noticed in headers; recommend reading the page in full before launch |
| `/itinerary/share/[id]` not found | ⚠️ Same — recommend explicit empty state |
| `/api/generate` 404 path ("No matching venues") | ✅ Returns 404 with JSON `{error}` — UI converts to generic "That didn't work" |
| Gemini failure | ✅ `claude.ts` falls through to raw `curation_note` from DB — never blocks the itinerary |
| OpenWeatherMap failure | ✅ `weather.ts` logs and returns null — weather gate disabled for that request |
| MAPBOX_TOKEN missing | 🟠 Silent — see section 7 |

### Other launch-relevant items

- **`metadataBase` unset** → social previews on shared itineraries default to `http://localhost:3000` (Next.js build warning). Set `metadataBase: new URL('https://composer.onpalate.com')` in `src/app/layout.tsx`'s metadata export. Quick fix, real impact on share-link UX.
- **`/compose` has no auth gate** — direct URL hits work, generate falls back to unauthed prefs (no profile personalization). Not broken, but if you want to enforce "must be signed in to generate," add a `useAuth` redirect.
- **No analytics / no rate-limiting** on `/api/generate` and `/api/share`. For a CBS-scale soft launch (50-200 generates in week 1) it's probably fine, but a single bad actor could rack up Gemini costs.

---

## 9. Recommended pre-launch fix list

In priority order:

1. **Fix occasion taxonomy mismatch** (section 3) — either rewrite UI options or update the sheet + regenerate. Highest-leverage single change for itinerary quality.
2. **Set `metadataBase`** in `app/layout.tsx` so share-link previews render correctly.
3. **Decide on Mapbox**: either populate `MAPBOX_TOKEN` in Vercel (and `.env.local` for dev), or add a placeholder UI in `WalkConnector` when `mapUrl` is null. Either is fine; "nothing at all" is the worst option.
4. **Update `.env.example`** to match what's actually used (remove `ANTHROPIC_API_KEY` + `RESY_API_KEY`, add the seven missing required keys). 5-minute job, prevents the next contributor from getting confused.
5. **Promote Reid to admin** via the SQL one-liner once you confirm his account.
6. **Verify `https://www.onpalate.com/composer/privacy` is live + Twilio-TFV-compliant** before relying on the redirect.
7. (Optional) Add explicit not-found UI on `/itinerary/saved/[id]` and `/itinerary/share/[id]`.

Nothing else jumped out as blocking. Build is green, tests pass, no TODO debt, no SMTP rabbit hole, no hidden admin bypass paths.
