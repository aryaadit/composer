# CLAUDE.md — Composer

## Project Overview

Composer is a date and night-out itinerary generator for NYC. Users answer a short cascading questionnaire (occasion → neighborhood → budget → vibe) and receive a curated 3-stop evening itinerary structured as **Opener → Main → Closer**.

The product is built on a **hybrid curation model**: the venue database is human-curated by the founders (Reid and Adit), scored and assembled by weighted algorithm, and polished by the Claude API for copy voice. The human taste layer is the core differentiator — this is not a generic AI recommendation engine.

**Primary target: Mobile-responsive web.** Website first at onpalate.com/composer. iOS via Capacitor is Phase 2. Every UI decision should work on a phone screen first.

**Auth: Anonymous.** No login required for MVP. Users do not have accounts. All state is ephemeral or localStorage-based.

---

## Tech Stack

- **Framework**: Next.js 14+ (App Router) + TypeScript
- **Styling**: Tailwind CSS
- **Database**: Supabase (PostgreSQL + Row Level Security)
- **AI**: Anthropic Claude API (`claude-sonnet-4-20250514`) — itinerary copy and voice
- **Weather**: OpenWeatherMap API — called per generation, not cached
- **Package Manager**: npm
- **Deployment**: Vercel
- **Mobile (Phase 2)**: Capacitor → iOS

---

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
ANTHROPIC_API_KEY
OPENWEATHERMAP_API_KEY
```

Never hardcode these. Never commit `.env.local`. Always use `process.env.*` server-side and `NEXT_PUBLIC_*` only when the value is safe to expose to the client.

---

## Project Structure

```
app/
├── page.tsx                  # Landing page
├── compose/
│   └── page.tsx              # Questionnaire flow
├── itinerary/
│   └── page.tsx              # Composition output
└── api/
    └── generate/
        └── route.ts          # POST endpoint: weather + scoring + Claude → itinerary

components/
├── ui/                       # Base UI primitives (Button, OptionCard, ProgressBar)
├── landing/                  # Hero, CTA
├── questionnaire/            # QuestionnaireShell, StepLoading, OptionCard
└── itinerary/                # CompositionHeader, StopCard, WalkConnector, ActionBar

lib/
├── supabase.ts               # Lazy-initialized Supabase client
├── scoring.ts                # Weighted venue scoring + itinerary composer
├── weather.ts                # OpenWeatherMap fetch + rain/snow classification
├── geo.ts                    # Haversine distance + Manhattan grid correction + Maps URL builder
├── claude.ts                 # Claude API call + graceful fallback
└── sharing.ts                # URL param encode/decode + localStorage save

config/
├── options.ts                # All questionnaire step definitions
└── prompts.ts                # Claude system prompt + generation prompt builder

supabase/
└── seed.sql                  # Schema + seed venues
```

---

## Database Schema

```sql
create table venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  neighborhood text not null,       -- hyphenated slug: west-village, williamsburg, etc.
  category text not null,
  price_tier int not null,          -- 1=$ 2=$$ 3=$$$ 4=$$$$
  vibe_tags text[],                 -- canonical tags only (see Canonical Tags below)
  occasion_tags text[],             -- first_date | dating | couple | friends | solo
  stop_roles text[],                -- opener | main | closer
  outdoor_seating boolean default false,
  reservation_url text,             -- deep link to venue page on Resy/OpenTable
  maps_url text,
  curation_note text,               -- 1-2 sentence human-written note
  curated_by text,                  -- reid | adit | community
  latitude float,
  longitude float,
  active boolean default true,
  created_at timestamptz default now()
);
```

### Canonical Vibe Tags

This is the locked tag contract. Do not add new tags without updating `scoring.ts` simultaneously.

**Scored tags** (mapped to questionnaire vibe selections in `scoring.ts`):

| Tag | Maps to vibe |
|-----|-------------|
| `food_forward`, `tasting`, `dinner`, `bistro` | food-forward |
| `cocktail_forward`, `wine_bar`, `speakeasy`, `drinks` | drinks-led |
| `activity`, `comedy`, `karaoke`, `games`, `bowling` | activity-food |
| `walk`, `gallery`, `bookstore`, `market`, `park` | walk-explore |

**Cross-cutting tags** (valid, not scored by vibe):
`romantic`, `conversation_friendly`, `group_friendly`, `late_night`, `casual`, `upscale`, `outdoor`

### Neighborhood Slugs

Always hyphenated. Must match exactly between the database, `config/options.ts`, and the venue sheet:
`west-village`, `east-village-les`, `soho-nolita`, `williamsburg`, `midtown`, `hells-kitchen`, `upper-west-side`

---

## Architecture Principles

### API Route for Generation
All itinerary generation happens server-side in `app/api/generate/route.ts`. The client POSTs questionnaire answers and receives a complete itinerary. The client never calls Supabase, OpenWeatherMap, or Claude directly.

### No Direct DB Calls from Components
All Supabase calls go through `lib/supabase.ts`. Components never import or call Supabase directly. Keep data access in `lib/` or API routes.

### Scoring Logic Lives in `lib/scoring.ts`
The weighted scoring algorithm and itinerary composer are isolated here. Do not inline scoring logic in the API route. If scoring behavior needs to change, it changes in one place.

### Weather is Stateless
`lib/weather.ts` fetches current NYC conditions per request. There is no caching layer. This is intentional — itineraries should reflect actual current conditions.

### Claude as Polish Layer, Not Core Logic
The Claude API call in `lib/claude.ts` is a copy enhancement step, not the core logic. The scoring and venue selection happen first. Claude receives the selected venues and writes the composition header and personalizes curation notes. If the Claude call fails, `lib/claude.ts` falls back gracefully to the raw `curation_note` from the database — the itinerary still renders.

---

## Scoring System

Vibe match scoring in `lib/scoring.ts` uses **exact canonical tag matching** via set intersection. No substring matching, no fuzzy matching.

```typescript
const VIBE_TAGS: Record<string, string[]> = {
  "food-forward":  ["food_forward", "tasting", "dinner", "bistro"],
  "drinks-led":    ["cocktail_forward", "wine_bar", "speakeasy", "drinks"],
  "activity-food": ["activity", "comedy", "karaoke", "games", "bowling"],
  "walk-explore":  ["walk", "gallery", "bookstore", "market", "park"],
  "mix-it-up":     [],  // empty = no vibe filter, all venues score equally on this dimension
};
```

Scoring tiers:
- 2+ tag hits = full 35pts
- 1 hit = 25pts
- 0 hits = 10pts base (venue can still appear if other factors score high)

**Never change this to substring or fuzzy matching.** Fragile matching was the original bug — it's been fixed.

### Weighted Score Breakdown

| Factor | Weight |
|--------|--------|
| Vibe match | 35% |
| Occasion fit | 15% |
| Budget fit | 15% |
| Location fit (walkable cluster) | 10% |
| Time fit | 10% |
| Quality signal (curation tier) | 10% |
| Curation boost (reid/adit picks) | 5% |

### Itinerary Composition
The composer picks the best **combination** not the top 3 individual scores. Priority factors:
- Geographic clustering (all stops walkable, ideally <15 min between each)
- Category variety (no two stops the same category)
- Pacing (light opener → heavier main → wind-down closer)
- Budget distribution

### Progressive Filter Relaxation
If filters return too few venues (<3 candidates per role), the scorer relaxes constraints in order: neighborhood → budget → occasion. It never returns an empty itinerary. Log a warning when relaxation triggers — it signals a database coverage gap.

### Plan B
For each flexible stop (Opener and Closer), a backup venue is pre-generated at composition time. Same hard filters, different category from primary. Fixed stops (Main) do not get Plan B.

---

## Weather Gate

OpenWeatherMap is called in `lib/weather.ts` at generation time. Classification:
- `rain` or `snow` → eliminate `outdoor_seating = true` venues
- Extreme temp (< 32°F or > 90°F) → same penalty as rain
- Clear → no adjustment

Surface a weather note in the composition header only when conditions affected the output. Don't show weather info if it didn't matter.

---

## Questionnaire Flow

Defined in `config/options.ts`. Four steps, one per full-screen:
1. **Occasion** — first_date | dating | couple | friends | solo
2. **Neighborhood** — one of the 7 neighborhood slugs
3. **Budget** — price tier 1-4
4. **Vibe** — food-forward | drinks-led | activity-food | walk-explore | mix-it-up

Slide transitions between steps. Option cards, not dropdowns. Auto-advance is acceptable after selection if transition is smooth. Never auto-advance before the user has seen their selection register visually.

---

## Claude API

Model: `claude-sonnet-4-20250514`
Max tokens: 1000

System prompt (from `config/prompts.ts`):
```
You are the voice of Composer, a curated NYC date night app founded by two people 
known for their taste in the city. Write in a warm, confident, first-person plural 
voice. You are opinionated. Say "this is the move" not "you might enjoy." 
Keep all copy concise. Never hedge. Never list more than you need to.
```

**Do not change the system prompt without discussing with the founders.** Brand voice is intentional.

The Claude call always has a graceful fallback. If it throws or times out, use the raw `curation_note` from the DB. Never block itinerary rendering on a Claude API failure.

---

## Design System

### Typography
- **Display / venue names / titles**: Playfair Display (serif, Google Fonts)
- **UI / body / labels**: DM Sans (sans-serif, Google Fonts)

### Colors
```
Background:         #FAF8F5  (warm off-white)
Primary accent:     #6B1E2E  (deep burgundy)
Secondary accent:   #1E3D2F  (forest green)
Text primary:       #1A1A1A
Text secondary:     #6B6B6B
```

Never use generic purple gradients, white backgrounds, or Inter/Roboto. The aesthetic is editorial and warm, not startup.

### Principles
- Mobile-first always
- No decorative gradients
- Staggered entrance on composition output (Opener → Main → Closer sequential reveal)
- Loading states feel intentional — never a bare spinner
- Touch targets minimum 44x44px

---

## Coding Standards

### TypeScript
- Strict mode on. No `any` types. No `ts-ignore`.
- Define types in `types/` for shared data shapes. Inline types for local-only shapes.
- All API route handlers must type their request body and response.
- Supabase query results must be typed — use generated types or explicit casting, never implicit `any`.

### React / Next.js
- App Router only. No Pages Router patterns.
- Server Components by default. Add `"use client"` only when necessary (interactivity, hooks, browser APIs).
- No God components. If a file exceeds 250 lines, split it.
- One component per file. File name matches component name in kebab-case (`stop-card.tsx` exports `StopCard`).
- No inline styles. Tailwind only. If a custom value is needed more than once, extract to a CSS variable.

### Data Fetching
- Server Components fetch directly (no React Query needed — no auth, no real-time).
- Client-side state is minimal — questionnaire answers in `useState`, itinerary result passed via URL params or shallow route state.
- Do not use `useEffect` for data fetching. Fetch in Server Components or API routes.

### Error Handling
- All API routes return typed error responses with appropriate HTTP status codes.
- Client components handle error states visibly — never silently swallow errors.
- The Claude fallback in `lib/claude.ts` must be tested — do not remove it.

### File Naming
- Components: `PascalCase.tsx`
- Utilities / libs: `camelCase.ts`
- Config files: `camelCase.ts`
- All exported functions and components use named exports. No default exports except Next.js page files.

### Imports
Order: React → Next.js → third-party → internal (`@/lib`, `@/components`, `@/config`, `@/types`)

### Git Commits
Format: `type(scope): description`
Types: `feat`, `fix`, `chore`, `refactor`, `style`, `docs`

**Keep commit messages concise — one line only.** No multi-line bodies, no bullet lists, no co-author trailers. The git history should stay scannable. If a change is so large it can't be summarized in one line, that's a signal to split it into multiple commits.

Examples:
```
feat(scoring): add progressive filter relaxation for thin neighborhoods
fix(weather): handle OpenWeatherMap timeout gracefully
chore(venues): add 12 new West Village venues to seed
```

**Never run `git commit`, `git push`, or `git add`.** When a task is complete, provide the suggested commit message in the format above and stop. The developer runs all git commands manually.

---

## Performance Rules

- No animations that block interaction or feel slow on a mid-range Android device
- Google Maps export URL is constructed client-side in `lib/geo.ts` — no API call needed
- OpenWeatherMap call happens server-side in the API route — never from the client
- Do not add new npm dependencies without justification. Prefer what's already in the project.

---

## Venue Database Rules

- **Never edit venues directly in the DB.** All venue additions go through the Google Sheet → CSV → import pipeline to maintain a single source of truth.
- Tag changes require updating both the venue record AND verifying `scoring.ts` still handles the tag correctly.
- Neighborhood slugs are always hyphenated. If you see underscores in the DB, that's a bug.
- `active = false` hides a venue from scoring. Use this instead of deleting records.
- The `notes` column in the Google Sheet is internal only — it is never imported to Supabase.

---

## What NOT To Do

- Don't call Supabase from client components. Use API routes.
- Don't add AI-generated venues to the database. Every venue must be human-verified.
- Don't change the vibe tag matching from exact to substring/fuzzy. This was a deliberate fix.
- Don't change the Claude system prompt without founder approval.
- Don't add loading states that feel like the app is doing more work than it is.
- Don't use `useEffect` for data fetching.
- Don't use `any` types or `ts-ignore`.
- Don't add new neighborhood slugs without updating `config/options.ts`, the venue sheet Reference tab, and the DB validation simultaneously.
- Don't build auth. This is anonymous by design for MVP.
- Don't add features that aren't in the PRD without flagging them first. Scope creep kills MVPs.
- Don't assume desktop-first. Mobile is the primary surface.
- Don't run `git commit`, `git push`, or `git add`. Provide the commit message and let the developer run it.

---

## Product Context

**Founders:** Adit and Reid
**Platform:** onpalate.com/composer (part of the Palate brand alongside Pour Decisions)
**Launch target:** Columbia Business School community (NYC)
**MVP success metric:** 50 compositions generated in week 1, 200+ by week 4

The product works because of the curation layer, not the technology. Reid and Adit are known in the CBS community as the go-to people for NYC date and dinner recommendations. They host weekly dinner reservations around the city. The app is the productization of that reputation.

When in doubt about a product decision, ask: does this make the output feel more trustworthy and opinionated, or less?

---

## Phase 2 (Not Building Yet)

- User accounts + saved compositions
- Community venue submissions
- Google Places / Resy / OpenTable live sync
- Native reservation booking
- Implicit preference learning
- iOS app via Capacitor
- Monetization (venue partnerships, premium tier)
