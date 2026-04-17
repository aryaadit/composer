# Composer

**Compose your night.**

Composer is a curated date night itinerary generator for New York City. Answer six quick questions in under a minute and get a full evening — Opener, Main, Closer — built around your occasion, neighborhood, budget, vibe, and time window. Every recommendation is human-curated, weather-aware, and assembled by AI in the voice of two people who actually know the city.

Live at [composer.onpalate.com](https://composer.onpalate.com).

---

## What it does

A user answers a five-step questionnaire:

1. **Occasion** — early dating, dating, couple, friends night out, solo
2. **Neighborhoods** — pick up to three from borough-grouped options
3. **Budget** — casual, nice out, splurge, all out, no preference
4. **Vibe** — food-forward, drinks-led, activity + food, walk & explore, mix it up
5. **When** — day (today through next week + custom date picker) + duration (keep it short / enjoy the moment / open-ended)

Composer returns a 2-to-4 stop evening, with the count driven by the duration:

- **Keep it short (2h)** → 2 stops (Opener + Main)
- **Enjoy the moment (3.5h)** → 3 stops (Opener + Main + Closer)
- **Open-ended (5h)** → 3-4 stops (Opener + Main + Closer + optional Closer)

Each itinerary includes walk times between stops, reservation links where available, weather-aware filtering, Plan B alternatives on flexible stops, a Google Maps export, and a shareable link.

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16.2 (App Router, Turbopack) + TypeScript (strict) |
| UI | React 19, Tailwind CSS 4, Motion (Framer fork) |
| Database | Supabase (Postgres + Row Level Security) |
| AI | Google Gemini 2.5 Flash via `@google/generative-ai` |
| Weather | OpenWeatherMap (free tier, called per request, not cached) |
| Auth | Supabase email/password (profiles + saved itineraries with RLS) |
| Deployment | Vercel — auto-deploy from `main` |
| Domain | composer.onpalate.com |

---

## Project structure

The codebase is under `src/`. Everything else at the repo root is config, docs, or assets.

```
composer/
├── src/
│   ├── app/
│   │   ├── page.tsx                   # Root gate: AuthScreen → /onboarding → HomeScreen
│   │   ├── compose/page.tsx           # Questionnaire flow
│   │   ├── itinerary/page.tsx         # Composition output
│   │   ├── onboarding/page.tsx        # Post-auth profile builder (auth-gated)
│   │   ├── profile/page.tsx           # Profile + saved itineraries + admin section
│   │   ├── admin/onboarding/page.tsx  # Admin: replay onboarding flow (is_admin gated)
│   │   ├── auth/callback/route.ts     # PKCE code exchange (safety net)
│   │   ├── auth/reset/page.tsx        # Password reset form
│   │   ├── layout.tsx                 # Fonts + AuthProvider
│   │   ├── globals.css
│   │   └── api/
│   │       ├── generate/route.ts      # POST: weather + scoring + Gemini → itinerary
│   │       ├── add-stop/route.ts      # POST: extend itinerary with one more closer
│   │       └── health/route.ts        # GET: diagnostic report (Supabase + scoring + Gemini)
│   ├── components/
│   │   ├── ui/                        # Button, OptionCard, ProgressBar, StopCard, WalkConnector
│   │   ├── auth/                      # AuthScreen, ForgotPasswordScreen
│   │   ├── providers/                 # AuthProvider (user + profile + session context)
│   │   ├── shared/                    # NeighborhoodPicker (used by onboarding + questionnaire)
│   │   ├── landing/                   # Hero
│   │   ├── home/                      # HomeScreen (signed-in landing + saved plans)
│   │   ├── onboarding/               # OnboardingFlow (name + context + prefs + neighborhoods)
│   │   ├── questionnaire/             # Shell + step components (Standard, Neighborhood, When)
│   │   └── itinerary/                 # CompositionHeader, ItineraryView, ActionBar, TextMessageShare
│   ├── lib/
│   │   ├── supabase.ts                # Anon Supabase client (venue reads, no auth)
│   │   ├── supabase/browser.ts        # Browser auth-aware client (@supabase/ssr)
│   │   ├── supabase/server.ts         # Server auth-aware client for Route Handlers
│   │   ├── auth.ts                    # Sign in / sign up / reset-password / profile helpers
│   │   ├── scoring.ts                 # Per-venue scoring + filters + per-role pick (with proximity)
│   │   ├── composer.ts                # planStopMix + composeItinerary (multi-stop assembly)
│   │   ├── weather.ts                 # OpenWeatherMap fetch + rain/snow classification
│   │   ├── geo.ts                     # Haversine + Manhattan grid correction + Maps URL builder
│   │   ├── claude.ts                  # Gemini API call + graceful fallback
│   │   ├── sharing.ts                 # URL param encode/decode for share links
│   │   └── questionnaireReducer.ts    # Questionnaire state machine
│   ├── config/
│   │   ├── options.ts                 # Questionnaire step definitions
│   │   ├── prompts.ts                 # Gemini system prompt + generation prompt builder
│   │   ├── durations.ts              # Duration presets + resolveTimeWindow
│   │   ├── onboarding.ts              # Onboarding option definitions + CONTEXT_TO_OCCASION
│   │   └── storage.ts                 # sessionStorage keys (page-to-page flight state only)
│   └── types/
│       └── index.ts                   # Shared TypeScript types
├── supabase/
│   └── seed.sql                       # Schema + seed venues
├── public/                            # Static assets
├── .github/
│   └── pull_request_template.md       # PR template (auto-loaded by GitHub on PR open)
├── CLAUDE.md                          # Project rules and conventions (loaded by Claude Code)
├── CONTRIBUTING.md                    # Branch workflow and contributor rules
└── README.md
```

---

## How itinerary generation works

`/api/generate` (POST) is the only generation endpoint. It runs server-side. The client never calls Supabase, OpenWeatherMap, or Gemini directly.

1. **User preferences** (name, drinks, dietary) are read server-side from the authenticated user's `composer_users` profile via `getServerSupabase()`. The client sends only the questionnaire answers.
2. **Parallel fetch:** weather is pulled from OpenWeatherMap and active venues are queried from Supabase.
3. **Drinks filter:** if the user said "no" to drinks, alcohol-forward venues are dropped entirely.
4. **planStopMix** ([src/lib/composer.ts](src/lib/composer.ts)) decides how many stops fit the time window and which role pattern to use:
   - `<2.5h` → `["opener", "main"]`
   - `<4.5h` → `["opener", "main", "closer"]`
   - `≥4.5h` → `["opener", "main", "closer", "closer"]`
5. **Hard filters** ([src/lib/scoring.ts](src/lib/scoring.ts)) drop inactive venues, wrong roles, neighborhood mismatches, and outdoor seating in bad weather.
6. **Bad-weather walking cap** drops the max walking distance from 1.5 km (~20 min) to 0.4 km (~5 min) when it's raining or snowing.
7. **Weighted scoring** ranks the survivors:
   - Vibe match — 35% (exact canonical tag matching, no fuzzy)
   - Occasion fit — 15%
   - Budget fit — 15%
   - Location (in selected neighborhoods) — 10%
   - Time relevance — 10%
   - Quality signal — up to 10% (from `quality_score`)
   - Curation boost — up to 10% (from `curation_boost`)
   - Plus small jitter for variety on regenerate
8. **composeItinerary** picks the Main first as the geographic anchor, then fills the remaining slots in pattern order subject to walking-distance proximity to Main. **Plan B** alternatives are pulled from the same scored list.
9. **Progressive relaxation:** if filters return zero venues for a slot, neighborhood filtering is dropped while proximity is preserved.
10. **Gemini polish layer** writes the composition title, subtitle, and per-venue notes in the founder voice. If the call fails or times out, the route falls back to raw DB curation notes — the itinerary still renders.

---

## Architecture principles

These are enforced by [CLAUDE.md](CLAUDE.md). Read that file for the full rule set; this is a summary.

- **Generation is a single API route.** Client posts answers, gets back a complete itinerary. No client-side Supabase, weather, or AI calls.
- **Scoring lives in `lib/scoring.ts`, composition in `lib/composer.ts`.** Never inline scoring or composition logic in the API route or components.
- **Weather is stateless.** Per-request, no cache layer — itineraries reflect actual current conditions.
- **Gemini is the polish layer, not the core.** Venue selection happens first; Gemini shapes the copy. If Gemini fails, the itinerary still renders with DB notes.
- **The vibe tag contract is locked.** Exact canonical tag matching only. No fuzzy or substring matching.
- **No file over 250 lines.** Split if needed.
- **No `any`, no `ts-ignore`, no default exports** outside Next.js page files.
- **Mobile-first.** Every UI decision works on a phone screen first.

---

## Venue database

Venues live in the `composer_venues` table in Supabase. **Every venue is human-curated — no AI-generated entries, no Google Places scraping.** The curation layer is the product.

Venues are managed in a Google Sheet shared between the founders and imported to Supabase via CSV. See the Import Guide tab in the venue sheet for the full pipeline.

### Schema (abridged)

```sql
composer_venues (
  id              uuid primary key,
  name            text,
  category        text,
  neighborhood    text,                -- hyphenated slug (see below)
  address         text,
  latitude        double precision,
  longitude       double precision,
  stop_roles      text[],              -- opener | main | closer
  price_tier      int,                 -- 1 | 2 | 3
  vibe_tags       text[],              -- canonical only (see below)
  occasion_tags   text[],
  outdoor_seating boolean,
  reservation_url text,
  curation_note   text,
  active          boolean,
  quality_score   int,                 -- 1-10
  curation_boost  int,                 -- 0-2
  best_before     text,                -- "21:00"
  best_after      text                 -- "17:00"
)
```

Full schema and seed data in [`supabase/seed.sql`](supabase/seed.sql).

### Canonical vibe tags

Scoring matches on exact equality. Adding a new tag requires updating `lib/scoring.ts` simultaneously.

**Scored tags:**

| Tag(s) | Maps to vibe |
|--------|-------------|
| `food_forward`, `tasting`, `dinner`, `bistro` | Food-forward |
| `cocktail_forward`, `wine_bar`, `speakeasy`, `drinks` | Drinks-led |
| `activity`, `comedy`, `karaoke`, `games`, `bowling` | Activity + food |
| `walk`, `gallery`, `bookstore`, `market`, `park` | Walk & explore |

**Cross-cutting tags** (valid, not scored): `romantic`, `conversation_friendly`, `group_friendly`, `late_night`, `casual`, `upscale`, `outdoor`.

### Neighborhood slugs

Always snake_case. Must match exactly across the DB, [src/config/neighborhoods.ts](src/config/neighborhoods.ts), and the venue sheet:

`west_village` · `east_village_les` · `soho_nolita` · `williamsburg` · `midtown_hells_kitchen` · `upper_west_side`

---

## Local development

### Prerequisites

- **Node.js 20+** (project tests against 20.19+ / 22.13+ / 24+)
- **npm**
- A **Supabase** account (Composer project)
- A **Google AI Studio** account for a Gemini API key
- An **OpenWeatherMap** account, free tier (note: new keys take up to 2 hours to activate)

### Setup

```bash
git clone git@github.com:aryaadit/composer.git
cd composer
npm install
```

Create `.env.local` in the project root:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_publishable_key
GEMINI_API_KEY=your_gemini_api_key
OPENWEATHERMAP_API_KEY=your_openweathermap_key
```

Run the seed SQL in your Supabase project (Dashboard → SQL Editor):

```
supabase/seed.sql
```

Start the dev server:

```bash
npm run dev
```

Visit `http://localhost:3000`.

### Available scripts

| Command | What it does |
|---------|-------------|
| `npm run dev` | Start the dev server with Turbopack on `localhost:3000` |
| `npm run build` | Production build |
| `npm run start` | Run the production build locally |
| `npm run lint` | ESLint over the project |
| `npx tsc --noEmit` | TypeScript check (no emit) |
| `npm run generate-configs` | Regenerate `src/config/generated/*.ts` from the Google Sheet reference tabs |
| `python3 scripts/import_venues.py --out FILE` | Generate venue import SQL from the Google Sheet's Venues tab |

For the full venue update workflow (sheet → configs → import → verify), see **CLAUDE.md → Venue Database Rules**.

`npx tsc --noEmit` and `npm run lint` must both pass before opening a PR.

---

## Environment variables

| Variable | Where to get it | Required |
|----------|----------------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API → Project URL | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API → Publishable / anon key | Yes |
| `GEMINI_API_KEY` | aistudio.google.com → API Keys | Yes |
| `OPENWEATHERMAP_API_KEY` | openweathermap.org → API Keys (allow up to 2h to activate) | Yes |

> **Production env vars must be set separately in the Vercel project dashboard.** Vercel does not read your local `.env.local`. If a value is missing in Vercel, the server will silently fall back: a missing `OPENWEATHERMAP_API_KEY` disables the weather gate (logged as a `[weather]` warning), and a missing `GEMINI_API_KEY` causes the copy generation to fall back to raw DB notes (logged as a `[gemini]` warning). Both fallbacks degrade gracefully — the itinerary still renders.

---

## Contributing

This repo uses a branch-and-PR workflow. Full process and rules in [CONTRIBUTING.md](CONTRIBUTING.md). Quick summary:

- Branch naming: `adit/feature-name` or `reid/feature-name`
- Pull `main` before starting, work on a branch, push, open a PR
- The other founder reviews and merges
- Merging to `main` auto-deploys to production via Vercel
- Never commit or push directly to `main`
- Every PR auto-loads the [PR template](.github/pull_request_template.md) — fill it out

`npx tsc --noEmit` and `npm run lint` must pass before opening a PR.

---

## Deployment

Composer is deployed on Vercel. Every push to `main` triggers an automatic production deployment to `composer.onpalate.com`. Every PR gets a preview deployment URL.

Production environment variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `GEMINI_API_KEY`, `OPENWEATHERMAP_API_KEY`) must be configured in the Vercel project settings — they are **not** read from `.env.local`.

To monitor production: check Vercel → Logs for `[gemini]` and `[weather]` warnings, which surface fallback paths and missing credentials.

---

## Health check

`GET /api/health` returns a JSON report verifying the three layers Composer depends on. Use it after a deploy, or any time you want to confirm production is wired up end-to-end.

Hit it in a browser or with `curl`:

```bash
curl https://composer.onpalate.com/api/health
# or locally:
curl http://localhost:3000/api/health
```

Response shape:

```json
{
  "ok": true,
  "timestamp": "2026-04-13T21:45:12.104Z",
  "checks": {
    "supabase": { "ok": true, "active_venue_count": 495 },
    "scoring":  {
      "ok": true,
      "input": { "occasion": "first-date", "neighborhoods": ["west_village"], "budget": "nice_out", "vibe": "food_forward", "day": "2026-04-13", "startTime": "18:00", "endTime": "22:00" },
      "hard_filtered": 37,
      "scored": 37,
      "top3": [
        { "name": "Via Carota", "neighborhood": "west_village", "price_tier": 2, "score": 87.2 },
        { "name": "I Sodi",     "neighborhood": "west_village", "price_tier": 3, "score": 82.4 },
        { "name": "Buvette",    "neighborhood": "west_village", "price_tier": 2, "score": 79.1 }
      ]
    },
    "gemini":   { "ok": true, "latency_ms": 412, "response": "OK" }
  }
}
```

What each check does:

1. **Supabase** — counts active rows in `composer_venues`. Fails loud if the DB is unreachable or empty.
2. **Scoring** — runs the real scorer against a fixed test input (first-date · West Village · nice_out · food_forward · 6pm–10pm) with jitter disabled for determinism. Reports how many venues cleared the hard filter, how many scored, and the top three with their scores. Catches silent regressions in the scoring pipeline that unit tests wouldn't notice.
3. **Gemini** — sends a minimal "Reply with the word OK" prompt to `gemini-2.5-flash` with thinking disabled and an 8-second timeout. Reports round-trip latency and the first 40 chars of the response.

The endpoint always returns HTTP 200 — inspect the top-level `ok` plus per-check flags. It never returns secrets, env vars, or full error stacks; only counts, names, scores, latency, and short error messages. Read-only: no writes, no weather call, no copy generation.

---

## Documentation

| File | Audience | Purpose |
|------|----------|---------|
| [README.md](README.md) | Everyone | What you're reading now |
| [CLAUDE.md](CLAUDE.md) | Claude Code + humans | Project rules, conventions, architectural principles, and design system |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Contributors | Branch workflow and contributor rules |
| [.github/pull_request_template.md](.github/pull_request_template.md) | GitHub | Auto-loaded PR template |

---

## Roadmap

### MVP (current)

- Email/password auth with user profiles
- Five-step questionnaire (occasion → neighborhoods → budget → vibe → when)
- 2-to-4 stop itineraries with walk routing
- Plan B alternatives, weather gate, share-as-text
- Saved itineraries (server-side, per user)
- Profile page with inline-editable preferences
- Admin section (health check, onboarding reset, DB-driven `is_admin` flag)
- Manhattan + Brooklyn (selected neighborhoods)

### Phase 2 (not yet building)

- Community venue submissions
- Live integrations: Google Places / Resy / OpenTable
- Native reservation booking
- Implicit preference learning from saved plans
- iOS app via Capacitor
- Monetization: venue partnerships, premium tier

---

## Part of the Palate family

Composer is one of several products under the [Palate](https://onpalate.com) brand — a long-term vision for a unified taste profile platform.

- **Pour Decisions** — drink logging and social discovery → [App Store](https://apps.apple.com/us/app/barkeeply/id6756134353)
- **Composer** — date night itinerary generator → [composer.onpalate.com](https://composer.onpalate.com)
- **AUX** — social music discovery → coming soon
