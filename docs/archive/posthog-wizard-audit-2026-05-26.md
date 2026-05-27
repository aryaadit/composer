# PostHog wizard audit — 2026-05-26

Audit of the PostHog setup wizard's changes to Composer. No edits were made — this is review-only. Decisions to keep / modify / discard are deferred to the operator.

## Step 1 — Inventory

| Path | Kind | +/− | Purpose |
|---|---|---|---|
| `.gitignore` | edit | +1/0 | Adds explicit `.env.local` line (already covered by `.env*` on line 34 — redundant noise) |
| [next.config.ts](next.config.ts) | edit | +18/0 | Adds `/ingest/*` rewrite proxy to `us.i.posthog.com` + `skipTrailingSlashRedirect: true` |
| [package.json](package.json) | edit | +2/0 | Adds `posthog-js ^1.376.2`, `posthog-node ^5.35.4` |
| `package-lock.json` | edit | +453/0 | Lockfile for new deps (incl. transitive `@opentelemetry/api`) |
| [instrumentation-client.ts](instrumentation-client.ts) | **new** at repo root | +10 | Next.js 15.3+ client init hook. `posthog.init(...)` with `api_host: "/ingest"`, `defaults: "2026-01-30"`, `capture_exceptions: true`, debug in dev |
| [src/lib/posthog-server.ts](src/lib/posthog-server.ts) | **new** | +17 | Lazy singleton `posthog-node` client. `flushAt: 1`, `flushInterval: 0` |
| [src/components/providers/AuthProvider.tsx](src/components/providers/AuthProvider.tsx) | edit | +10/0 | `posthog.identify(s.user.id, {email, phone, name})` in `refreshSession`; `posthog.reset()` in `signOut` |
| [src/components/questionnaire/QuestionnaireShell.tsx](src/components/questionnaire/QuestionnaireShell.tsx) | edit | +9/0 | `posthog.capture("questionnaire_completed", …)` fired **before** `/api/generate` |
| [src/app/api/generate/route.ts](src/app/api/generate/route.ts) | edit | +24/0 | Threads `userId` into `AuthedPrefs`; server-side `posthog.capture("itinerary_generated", …)` after success |
| [src/app/api/swap-stop/route.ts](src/app/api/swap-stop/route.ts) | edit | +19/0 | Server-side `posthog.capture("stop_swapped", …)` after success |
| [src/app/itinerary/page.tsx](src/app/itinerary/page.tsx) | edit | +9/0 | Client `posthog.capture("itinerary_regenerated", …)` and `posthog.capture("stop_added", …)` |
| [src/components/itinerary/ActionBar.tsx](src/components/itinerary/ActionBar.tsx) | edit | +13/0 | Client `posthog.capture("itinerary_saved", …)` and `posthog.capture("itinerary_shared", …)` |
| [src/components/onboarding/OnboardingFlow.tsx](src/components/onboarding/OnboardingFlow.tsx) | edit | +5/0 | Client `posthog.capture("onboarding_completed", …)` |
| `posthog-setup-report.md` | **new** at repo root | n/a | Wizard's own writeup. Not gitignored. |
| `.claude/skills/integration-nextjs-app-router/` | **new** dir, 10 files | n/a | Wizard left-behind agent skill (workflow + reference docs). Only `settings.local.json` is gitignored globally; the rest is not. |
| `.env.local` | edit (untracked, gitignored) | +2 keys | Added `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` + `NEXT_PUBLIC_POSTHOG_HOST` (key names only — values not read) |
| `.env.local.bak2` | **new** | — | Pre-wizard backup; gitignored via the `.env*` pattern |

## Step 2 — Categorization

### A) Required for PostHog to work at all
- `instrumentation-client.ts` (client init)
- `src/lib/posthog-server.ts` (server client)
- `package.json` + `package-lock.json` (deps)
- `.env.local` keys
- `AuthProvider` identify/reset wiring

### B) Sensible defaults worth keeping
- `next.config.ts` reverse proxy (`/ingest/*`) — bypasses ad-blockers; `skipTrailingSlashRedirect: true` is a known requirement of that proxy
- `flushAt: 1, flushInterval: 0` on server — correct for Vercel serverless ✓ matches spec
- `posthog.reset()` in `signOut` — correct pattern
- Lazy singleton in `posthog-server.ts` — correct serverless pattern
- `try/catch` around server captures with "Never block the response on analytics" comment — good defensive posture

### C) Wizard opinions that conflict with what we discussed
- **`person_profiles: 'identified_only'` is NOT set.** PostHog default is `always` → anonymous visitors create persons too, eating quota and diluting funnels. Must add to `instrumentation-client.ts`.
- **`session_recording.maskAllInputs: true` is NOT set.** Session replay isn't even enabled. If you want replay, add `session_recording: { maskAllInputs: true, maskTextSelector: '*' }` and enable on the project side; if you don't want replay yet, the spec's mention is moot — flag explicitly.
- **Env var name is `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`**, not `NEXT_PUBLIC_POSTHOG_KEY`. Pick the canonical name and use it everywhere.
- **Server-side reuses the `NEXT_PUBLIC_*` env var** rather than a separate non-public var. In PostHog's model this is actually fine — the project token is intentionally public — but if you want strict trust-boundary hygiene with `POSTHOG_KEY` server-side, rename in both files.
- **`capture_exceptions: true`** — wizard opinion, not requested. Error tracking has cost and noise implications; PostHog Error Tracking is a separate billed feature. Decide before launch.
- **`capture_pageview` / `capture_pageleave`** — not explicitly set. `defaults: "2026-01-30"` enables them implicitly per the wizard's own claim. Worth confirming against PostHog docs before relying on it.
- **Wizard instrumented 8 events directly** — the spec was for a hybrid mirror layer with one wrapper. Each call site now talks directly to `posthog-js` / `posthog-node`. This is the **opposite** of the intended pattern.

### D) Unexpected / unrelated
- `.gitignore` adds a redundant `.env.local` line — line 34 already has `.env*`. Harmless but noise.
- `.claude/skills/integration-nextjs-app-router/` (10 files) left in working tree. Only `settings.local.json` is globally ignored — the skill dir is NOT and would commit if someone runs `git add .`.
- `posthog-setup-report.md` at repo root, not gitignored. Same risk.
- `distinctId: prefs?.userId ?? "anonymous"` in `/api/generate` — uses the literal string `"anonymous"` for unauthed users, which collapses every unauthenticated generation into a single PostHog person. Real bug; should mirror the client `$device_id` or skip server capture when not authed.
- `questionnaire_completed` fires before the `/api/generate` fetch — captures intent even on failure. May or may not be desired for funnel definition.
- `stop_added` properties include only `stop_count` (no occasion/vibe/budget) — inconsistent with the other events, hurts segmentation.

## Step 3 — Missing pieces from intended setup

- **Hybrid Supabase mirror layer**: not scaffolded. Confirmed missing:
  - No `analytics_events` table (no migration added under `supabase/migrations/`)
  - No `/api/analytics/track` route
  - No `src/lib/analytics.ts` wrapper
  - No `.claude/` or repo-level docs describing the hybrid pattern
  - Correct — the wizard has no way to know about Composer's pattern. Confirmed it did not attempt it.
- **Event instrumentation**: the wizard went **further than init** — it placed 8 captures directly at call sites. If you keep the hybrid pattern, every one of these 8 capture sites will need to be rewritten to call `analytics.track(…)` instead of `posthog.capture(…)`. That's the main "rework or revert" decision.

## Step 4 — Security / env audit

- `.env.local` modified, gitignored by the `.env*` pattern (verified via `git check-ignore`). ✓ No risk.
- `.env.local.bak2` also gitignored (same pattern). ✓
- **No API keys hardcoded in source.** Both files read from `process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`. ✓
- **Host URL**: client hardcodes `/ingest` (relies on the rewrite). Server reads `NEXT_PUBLIC_POSTHOG_HOST` from env. ✓
- **Trust boundary**: server should ideally use a non-public env name. PostHog's project token is designed to ship to clients, so this is more cosmetic than a real leak, but it's a divergence from the spec.

## Step 5 — package.json

- **Added deps**: `posthog-js ^1.376.2`, `posthog-node ^5.35.4`. Both expected.
- **No script changes.** ✓
- **No tsconfig / tailwind / build-config changes besides `next.config.ts`.** ✓
- Lockfile delta is +453 lines, mostly `@opentelemetry/api` (transitive of `posthog-node`).

## Step 6 — Anomaly flags

- ✅ Files outside `src/` modified: `next.config.ts` (expected), `.gitignore` (redundant change), root-level `instrumentation-client.ts` (correct location for Next 15.3+ pattern), `posthog-setup-report.md` (cruft).
- ✅ Build config: only `next.config.ts`. No tsconfig/tailwind.
- ⚠ **Existing component logic was modified**, not just additive. `AuthProvider`, `ActionBar`, `OnboardingFlow`, `QuestionnaireShell`, `itinerary/page.tsx`, and two API routes all got `posthog.capture` calls inserted. Each is small (just adding a `.capture` after a success branch) but they're embedded in load-bearing flows.
- ✅ Instrumentation hook: wizard used Next 15.3+ `instrumentation-client.ts` at repo root. Did **not** add `instrumentation.ts` (Node hook). Correct for client-only init.

---

## Step 7 — Recommendation

### KEEP AS-IS
- `package.json` + `package-lock.json` (deps)
- `src/lib/posthog-server.ts` — singleton, `flushAt: 1`, `flushInterval: 0` ✓
- `next.config.ts` rewrite proxy + `skipTrailingSlashRedirect` ✓
- `AuthProvider` identify on session resolve + `reset()` on signout ✓
- `.env.local` env var additions (the values, not necessarily the names — see MODIFY)

### MODIFY
1. **`instrumentation-client.ts`** — add the missing options:
   ```ts
   person_profiles: "identified_only",
   capture_pageview: true,        // explicit > relying on defaults bundle
   capture_pageleave: true,
   session_recording: { maskAllInputs: true, maskTextSelector: "*" },
   ```
   And **remove** `capture_exceptions: true` unless you've explicitly opted into PostHog Error Tracking.

2. **Env var rename** (across `instrumentation-client.ts`, `src/lib/posthog-server.ts`, `.env.local`, Vercel): pick `NEXT_PUBLIC_POSTHOG_KEY` (your spec) or keep `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` (wizard). Don't ship with both.

3. **`src/lib/posthog-server.ts`** — if you want server/client env separation, change `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` → `POSTHOG_KEY` here only. (Optional — single token is also valid in PostHog's model.)

4. **`src/app/api/generate/route.ts`** — fix the `"anonymous"` distinctId collapsing all unauth users into one person. Either skip the server capture when `!prefs?.userId`, or accept a `distinctId` from the client body (read PostHog's `$device_id` cookie on the client and pass it).

5. **`.gitignore`** — remove the redundant `.env.local` line you added; `.env*` already covers it.

6. **Gitignore the wizard cruft**:
   ```
   .claude/skills/
   posthog-setup-report.md
   ```
   Or just `rm` them — they're not source code.

### DISCARD (revert)
- **All 8 event captures in source files** if you want the hybrid mirror pattern. Specifically:
  - `src/components/questionnaire/QuestionnaireShell.tsx` (+9)
  - `src/app/api/generate/route.ts` capture block (+24, partially — keep the `userId` plumbing if useful, drop the capture)
  - `src/app/api/swap-stop/route.ts` capture block (+19)
  - `src/app/itinerary/page.tsx` (+9)
  - `src/components/itinerary/ActionBar.tsx` (+13)
  - `src/components/onboarding/OnboardingFlow.tsx` (+5)

  Replace later with `analytics.track(…)` wrapper calls once `src/lib/analytics.ts` and `/api/analytics/track` exist.

- **`posthog-setup-report.md`** — wizard artifact; either delete or move to `docs/`.

- **`.claude/skills/integration-nextjs-app-router/`** — wizard "leave-behind". Move out of the repo or delete; do not commit. (Globally gitignoring `.claude/skills/` is also fine.)

---

**Bottom line**: the init + identify/reset + proxy + server client are all good and worth keeping with one small tweak to `instrumentation-client.ts`. The big decision is the 8 inline event captures — they work today but conflict with the hybrid mirror pattern you described. Keeping them now and migrating later is fine if you want a quick signal; reverting them now keeps the surface area minimal until the wrapper exists.
