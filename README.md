# Composer

**Compose your night.**

Composer is a curated date night itinerary generator for New York City. Answer four questions in under a minute and get a full evening — Opener, Main, Closer — built around your occasion, neighborhood, budget, and vibe. Every recommendation is human-curated, weather-aware, and assembled by AI in the voice of two people who actually know the city.

Live at [composer.onpalate.com](https://composer.onpalate.com)

---

## What it does

You answer four questions:
1. **What kind of night is this?** — First date, established couple, friends, solo
2. **Where do you want to be?** — West Village, Williamsburg, SoHo, and more
3. **How are we feeling tonight?** — Casual to splurge
4. **What's the energy?** — Food-forward, drinks-led, activity, walk and explore

Composer returns a three-stop evening — Opener, Main, Closer — with walk times between stops, reservation links, weather awareness, and a Plan B on flexible stops. The itinerary is shareable as a link and exportable to Google Maps.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 15 (App Router) + TypeScript |
| Styling | Tailwind CSS |
| Database | Supabase (PostgreSQL) |
| AI | Google Gemini 2.5 Flash |
| Weather | OpenWeatherMap API |
| Auth | Supabase Auth (in progress) |
| Deployment | Vercel |
| Domain | composer.onpalate.com |

---

## Project structure

```
app/
├── page.tsx                  # Landing page / home screen gate
├── compose/page.tsx          # Questionnaire flow (6 steps)
├── itinerary/page.tsx        # Composition output
└── api/generate/route.ts     # POST endpoint: weather + scoring + Gemini → itinerary

components/
├── onboarding/               # First-run onboarding flow (name, context, prefs, neighborhoods)
├── home/                     # HomeScreen with saved plans and greeting
├── landing/                  # Hero and CTA
├── questionnaire/            # 6-step questionnaire (occasion, neighborhood, budget, vibe, day, time)
└── itinerary/                # CompositionHeader, StopCard, WalkConnector, ActionBar, TextMessageShare

lib/
├── supabase.ts               # Supabase client
├── scoring.ts                # Weighted venue scoring + hard filters + proximity enforcement
├── composer.ts               # Multi-stop assembly via planStopMix + composeItinerary
├── weather.ts                # OpenWeatherMap fetch + rain/snow classification
├── geo.ts                    # Haversine + Manhattan grid correction + Maps URL builder
├── claude.ts                 # Gemini API call + graceful fallback
├── sharing.ts                # URL param encode/decode + localStorage save
└── createCachedStore.ts      # Generic useSyncExternalStore factory

config/
├── options.ts                # All questionnaire step definitions
└── prompts.ts                # Gemini system prompt + generation prompt builder

supabase/
└── seed.sql                  # Schema + seed venues
```

---

## How itinerary generation works

1. **Onboarding preferences** (name, drinks preference, favorite neighborhoods) are read from `localStorage`
2. **Questionnaire answers** (occasion, neighborhood, budget, vibe, day, time window) are posted to `/api/generate`
3. **planStopMix** determines how many stops fit the time window: `<2.5h → 2 stops`, `<4.5h → 3 stops`, `≥4.5h → 4 stops`
4. **Weather gate** — OpenWeatherMap is called. Rain or snow eliminates outdoor-only venues and drops max walk distance from 1.5km to 0.4km
5. **Hard filters** remove closed venues, wrong roles, and dietary conflicts
6. **Weighted scoring** ranks remaining venues: vibe match 35%, occasion fit 15%, budget 15%, location 10%, time fit 10%, quality 10%, curation boost 5%
7. **composeItinerary** picks the best walkable combination (not just the top individual scores), anchored to the Main venue
8. **Plan B** venues are pre-generated for each flexible stop (Opener and Closer)
9. **Gemini** writes the composition header and personalizes curation notes in brand voice
10. Itinerary is returned to the client and rendered

---

## Venue database

The venue database lives in Supabase (`composer_venues` table). Every venue is human-curated — no AI-generated venues, no Google Places scraping. The curation layer is the product.

Venues are managed via a Google Sheet (shared between founders) and imported to Supabase via CSV. See the Import Guide tab in the venue sheet for the full process.

### Canonical vibe tags

These are the only valid vibe tags. Scoring matches on exact equality — no fuzzy matching.

**Scored tags:**

| Tag | Maps to vibe selection |
|-----|----------------------|
| `food_forward`, `tasting`, `dinner`, `bistro` | Food-forward |
| `cocktail_forward`, `wine_bar`, `speakeasy`, `drinks` | Drinks-led |
| `activity`, `comedy`, `karaoke`, `games`, `bowling` | Activity + food |
| `walk`, `gallery`, `bookstore`, `market`, `park` | Walk & explore |

**Cross-cutting tags** (not scored, use freely):
`romantic`, `conversation_friendly`, `group_friendly`, `late_night`, `casual`, `upscale`, `outdoor`

### Neighborhood slugs

Always hyphenated. Must match exactly across the DB, `config/options.ts`, and the venue sheet:

`west-village` · `east-village-les` · `soho-nolita` · `williamsburg` · `midtown` · `hells-kitchen` · `upper-west-side`

---

## Local development

### Prerequisites
- Node.js 18+
- npm
- A Supabase account (Composer project)
- A Google AI Studio account (Gemini API key)
- An OpenWeatherMap account (free tier)

### Setup

```bash
git clone git@github.com:aryaadit/composer.git
cd composer
npm install
```

Create `.env.local` in the project root:

```
NEXT_PUBLIC_SUPABASE_URL=https://uivpcwacqsqhbpisvmun.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_publishable_key
GEMINI_API_KEY=your_gemini_api_key
OPENWEATHERMAP_API_KEY=your_openweathermap_key
```

Run the seed SQL in your Supabase project:
```
supabase/seed.sql
```

Start the dev server:
```bash
npm run dev
```

Visit `http://localhost:3000`

---

## Contributing

### Branch workflow

This repo has branch protection on `main`. Direct pushes to main are blocked.

```bash
# Start of every session
git pull origin main

# Create your branch
git checkout -b yourname/what-youre-building

# Do your work, then push
git push origin yourname/what-youre-building

# Open a PR on GitHub → other person reviews → merge to main
```

**Branch naming:**
- `adit/feature-name` for Adit's work
- `reid/feature-name` for Reid's work

### Rules

- Never push directly to main
- Always pull before starting a new session
- `tsc --noEmit` and `eslint` must pass before opening a PR
- No `any` types, no `ts-ignore`, no default exports outside Next.js page files
- No file over 250 lines — split if needed
- All Supabase calls go through `lib/supabase.ts` — never from components
- Never add AI-generated venues to the database — human-verified only
- Never run `git commit`, `git push`, or `git add` from Claude Code — provide the commit message and stop

### Commit format

```
type(scope): description
```

Types: `feat`, `fix`, `chore`, `refactor`, `style`, `docs`

Examples:
```
feat(scoring): add progressive filter relaxation for thin neighborhoods
fix(weather): handle OpenWeatherMap timeout gracefully
chore(venues): add 12 new West Village venues to seed
```

---

## Environment variables

| Variable | Where to get it | Required |
|----------|----------------|----------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → General (Project ID → construct URL) | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API → Publishable key | Yes |
| `GEMINI_API_KEY` | aistudio.google.com → API Keys | Yes |
| `OPENWEATHERMAP_API_KEY` | openweathermap.org → API Keys | Yes (2hr activation delay on new keys) |

---

## Deployment

Composer is deployed on Vercel. Every push to `main` triggers an automatic production deployment to `composer.onpalate.com`. Every PR gets a preview deployment URL.

To deploy manually: push to main (via merged PR) and Vercel handles the rest.

---

## Part of the Palate family

Composer is one of several products under the [Palate](https://onpalate.com) brand — a long-term vision for a unified taste profile platform.

- **Pour Decisions** — drink logging and social discovery → [App Store](https://apps.apple.com/us/app/barkeeply/id6756134353)
- **Composer** — date night itinerary generator → [composer.onpalate.com](https://composer.onpalate.com)
- **AUX** — social music discovery → coming soon
