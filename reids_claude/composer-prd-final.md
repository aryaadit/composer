# Composer — Product Requirements Document
**Version:** 1.0 (MVP)
**Authors:** Adit Arya, Reid [Last Name]
**Date:** April 2026
**Status:** Ready to Build

---

## Overview

Composer is a date and night-out itinerary generator built for NYC. It helps people — from first dates to long-term couples — compose the perfect evening through a short, cascading questionnaire. Output is a curated, opinionated itinerary of 3 stops sequenced as **Opener → Main → Closer**.

The core product thesis: people don't lack options in NYC. They lack taste-filtered, occasion-aware curation. Composer solves that through a hybrid of human curation (Reid and Adit's vetted database) and AI assembly.

**Tagline:** Compose your night.
**Platform:** Web first (onpalate.com/composer). Anonymous. Mobile-responsive.
**Stack:** Next.js + TypeScript, Tailwind CSS, Supabase, Claude API, OpenWeatherMap API
**Deploy Target:** Vercel

---

## Target User (MVP)

**Primary:** Columbia Business School students and their dates/partners
**Secondary:** NYC professionals 25–40, especially transplants still learning the city
**Geography:** New York City — specific neighborhoods only at launch
**Auth:** Anonymous for MVP. No login required.

---

## The Problem

Planning a date in NYC is broken:
- Google Maps returns volume, not curation
- Yelp and Resy optimize for bookability, not occasion fit
- ChatGPT gives generic answers with no taste layer
- Asking friends works but doesn't scale

Nobody has built something that feels like it was designed specifically for this moment — the 6pm "what are we doing tonight?" anxiety.

---

## Solution

A short cascading questionnaire (5 inputs, under 60 seconds) that outputs a full evening composition — three stops in Opener / Main / Closer sequence, with walk times between stops, weather awareness, and a backup option on flexible stops.

The data layer is curated by Reid and Adit, grown over time by community contributions. AI assembles and personalizes. Human taste is the filter that makes it trustworthy.

---

## Pages

Three pages total:
1. Landing page
2. Questionnaire flow
3. Composition output

---

## Landing Page

Hero with tagline: *"Compose your night."*
Subhead: *"A curated date night, built for you in under a minute."*
Single CTA: **Start Composing.**

Simple, editorial, no clutter. The brand does the work.

---

## Questionnaire Flow

One question per screen. Full-screen per step. Smooth slide transition between steps. Large tap-friendly option cards — not dropdowns. Subtle step progress indicator at top. Under 60 seconds start to finish.

### Step 1 — Occasion
> "What kind of night is this?"
- First / Second Date
- Dating (a few dates in)
- Established Couple
- Friends Night Out
- Solo Exploration

### Step 2 — Neighborhood
> "Where do you want to be?"
- West Village
- East Village / LES
- SoHo / Nolita
- Williamsburg
- Midtown / Hell's Kitchen
- Upper West Side
- Surprise Me

*MVP launches with these neighborhoods. Expands with community data.*

### Step 3 — Budget
> "How are we feeling tonight?"
- $ — Casual (under $50/person)
- $$ — Nice out ($50–100/person)
- $$$ — Splurge ($100+/person)
- Don't care, just make it great

### Step 4 — Vibe
> "What's the energy?"
- Food-forward (dinner is the event)
- Drinks-led (cocktail bars, light bites)
- Activity + food (do something, then eat)
- Walk and explore (casual, outdoor-friendly)
- Mix it up

### Step 5 — Generate
Full-screen loading state. Copy: *"Composing your night..."* No spinner longer than 2 seconds.

---

## Composition Output — "The Composition"

### Structure: Opener → Main → Closer

Every composition has exactly 3 stops:

| Role | What it is | Type |
|------|------------|------|
| **Opener** | Warm-up drink, casual bar, aperitivo | Flexible (swappable) |
| **Main** | Dinner, headline activity, or anchor experience | Fixed (may have reservation) |
| **Closer** | Late bar, dessert spot, rooftop, hidden gem | Flexible (swappable) |

### Composition Header
- Title (e.g., "Your Saturday Evening — West Village")
- Occasion + vibe tags
- Estimated total spend for two
- Weather note if relevant (e.g., "Clear skies, 62°F — good for outdoor seating")

### Each Stop Card
- Stop role badge (OPENER / MAIN / CLOSER)
- Venue name — serif, large
- Category + neighborhood
- Curation note — 1–2 sentences, italic, warm confident voice
- Estimated spend per person
- Fixed or Flexible tag
- Reservation link button (deep link to Resy/OpenTable venue page, if applicable)
- Plan B button on Flexible stops — hidden by default, tap reveals backup venue

Between each card: walk time connector (e.g., "— 8 min walk →")

### Footer Actions
- Export to Google Maps (multi-stop route URL)
- Share as link
- Regenerate (same inputs, different venues)
- Save (localStorage for now)

---

## Weather Integration

**Source:** OpenWeatherMap API — called at generation time, not cached.

**Rules:**
- Rain/snow → eliminate outdoor-only venues from results
- Rain/snow → penalize venues with outdoor seating by 30% in scoring
- Extreme heat or cold → same penalty as rain for outdoor seating
- Weather note surfaces in composition header when it affects output

Low build cost. High trust signal. Ships in MVP.

---

## Itinerary Generation Logic

### Step 1 — Hard Filters (Pass/Fail)
Eliminate any venue that fails:
- Closed (active = false in database)
- Wrong stop role (e.g., a Main-only venue won't appear as Opener)
- Outdoor-only + bad weather

### Step 2 — Weighted Venue Score (0–100)

| Factor | Weight |
|--------|--------|
| Vibe match | 35% |
| Occasion fit | 15% |
| Budget fit | 15% |
| Location fit (walkable cluster) | 10% |
| Time fit | 10% |
| Quality signal (curation tier) | 10% |
| Curation boost (Reid/Adit picks) | 5% |

### Step 3 — Itinerary Composer
Pick the best **combination**, not just the top 3 individual scores:
- Geographic clustering — all stops walkable, ideally under 15 min between each
- Category variety — no two stops the same category
- Pacing — light opener, heavier main, wind-down closer
- Budget distribution — don't front-load the expensive stop
- Noise progression — calibrated to vibe selection
- Seasonal awareness — outdoor closers penalized in winter

### Step 4 — Plan B Generation
For each flexible stop (Opener and Closer):
- Pre-generate one backup at composition time
- Same hard filters, same scoring, different category from primary
- Hidden by default — surfaces on tap

### Step 5 — Claude API Pass
Pass the selected venues to Claude API to:
- Write the composition header copy in brand voice
- Polish and personalize curation notes
- Handle edge cases where filters produce thin results

**Claude API config:**
- Model: `claude-sonnet-4-20250514`
- Max tokens: 1000
- System prompt:

```
You are the voice of Composer, a curated NYC date night app founded by two people 
known for their taste in the city. Write in a warm, confident, first-person plural 
voice. You are opinionated. You say "this is the move" not "you might enjoy." 
Keep all copy concise. Never hedge. Never list more than you need to.
```

---

## Supabase Schema

```sql
create table venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  neighborhood text not null,
  category text not null,
  price_tier int not null,            -- 1=$, 2=$$, 3=$$$, 4=$$$$
  vibe_tags text[],                   -- ['cozy', 'intimate', 'dim_lighting', 'buzzy']
  occasion_fit text[],                -- ['first_date', 'couple', 'friends', 'solo']
  stop_role text[],                   -- ['opener', 'main', 'closer']
  outdoor_seating boolean default false,
  reservation_url text,               -- deep link to Resy/OpenTable venue page
  maps_url text,                      -- Google Maps link
  curation_note text,                 -- Reid/Adit voice, 1-2 sentences
  curated_by text,                    -- 'reid', 'adit', 'community'
  lat float,
  lng float,
  active boolean default true,
  created_at timestamptz default now()
);
```

Seed with 5 placeholder venues so the output page renders with real data immediately during development.

---

## Design Direction

**Aesthetic:** Editorial, warm, sophisticated. Not a startup, not a listicle. Feels like a well-designed magazine meets a knowledgeable friend. CBS students will judge it in 5 seconds — it needs to feel intentional.

**Typography:**
- Display / headlines: Playfair Display (Google Fonts) — serif, used for venue names, composition titles, landing hero
- Body / UI: DM Sans (Google Fonts) — clean, modern, used for questionnaire, labels, metadata

**Colors:**
- Background: warm off-white `#FAF8F5`
- Primary accent: deep burgundy `#6B1E2E`
- Secondary accent: forest green `#1E3D2F`
- Text primary: `#1A1A1A`
- Text secondary: `#6B6B6B`
- No gradients. No purples. No generic startup palettes.

**Motion:**
- Slide transition between questionnaire steps
- Staggered entrance on composition output — Opener reveals first, then Main, then Closer
- Loading state feels intentional, not like a spinner

**Voice:** Confident, specific, first-person plural. "We'd start here." "This is the move." "Trust us on this one." Never corporate, never hedging, never a list of disclaimers.

**Mobile-first:** Design and build mobile-first. Responsive up to desktop.

---

## Tech Stack

| Layer | Choice |
|-------|--------|
| Frontend | Next.js + TypeScript |
| Styling | Tailwind CSS |
| Database | Supabase (PostgreSQL) |
| AI | Claude API (`claude-sonnet-4-20250514`) |
| Weather | OpenWeatherMap API |
| Auth | None (anonymous, MVP) |
| Deployment | Vercel |
| Domain | onpalate.com/composer |
| Mobile Phase 2 | Capacitor → iOS |

---

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
ANTHROPIC_API_KEY
OPENWEATHERMAP_API_KEY
```

---

## MVP Scope

### In
- Landing page with CTA
- Cascading questionnaire (5 steps, full-screen per step, slide transitions)
- Opener / Main / Closer composition output
- Curated venue database (Supabase, Reid + Adit seeded)
- Weighted scoring + itinerary composer logic
- Weather gate (OpenWeatherMap)
- Plan B on flexible stops
- Walk time between stops (static lat/lng estimate)
- Reservation deep links
- Google Maps multi-stop export
- Share as link
- Regenerate button
- Save to localStorage
- Mobile-responsive

### Out (Phase 2+)
- User accounts / saved history
- Community venue submissions
- Google Places / Resy / OpenTable live API sync
- Native reservation booking
- Implicit preference learning
- Seasonal events database
- iOS app (Capacitor)
- Monetization

---

## Monetization Hypotheses (Not Building, Just Logged)

1. **Venue partnerships** — promoted placements shown to free users (disclosed)
2. **Premium tier** — preference memory, saved compositions, advanced filters
3. **Top spots leaderboard** — community-rated best date spots (SEO + brand flywheel)

---

## Pre-Build Checklist

Complete before writing a single line of code:
- [ ] Adit + Reid build venue Google Sheet (50–100 venues minimum)
- [ ] Agree on neighborhood list for launch
- [ ] Write 5 example curation notes together to lock in voice
- [ ] OpenWeatherMap API key created
- [ ] Supabase project created, schema initialized
- [ ] Vercel project connected to GitHub repo
- [ ] onpalate.com/composer routing confirmed
- [ ] Anthropic API key ready

---

## Claude Code Build Instructions

Paste the following as your first Claude Code prompt:

---

Build a web app called **Composer** — a date night itinerary generator for NYC. Full stack: Next.js + TypeScript + Tailwind + Supabase. Deploy target: Vercel. Lives at onpalate.com/composer.

Build three pages: landing page, questionnaire flow, and composition output. Follow the PRD exactly. Show me the full file structure before writing any code.

**Design:** Editorial, warm, sophisticated. Playfair Display (serif) for headlines and venue names. DM Sans for body and UI. Background `#FAF8F5`. Primary accent `#6B1E2E` (burgundy). Secondary `#1E3D2F` (forest green). No gradients. Mobile-first.

**Questionnaire:** 5 steps, one per full-screen. Smooth slide transitions. Large option cards, not dropdowns. Step progress indicator at top.

Steps:
1. Occasion — First / Second Date, Dating (a few in), Established Couple, Friends Night Out, Solo Exploration
2. Neighborhood — West Village, East Village / LES, SoHo / Nolita, Williamsburg, Midtown / Hell's Kitchen, Upper West Side, Surprise Me
3. Budget — $ Casual (under $50/pp), $$ Nice out ($50–100/pp), $$$ Splurge ($100+/pp), Don't care just make it great
4. Vibe — Food-forward, Drinks-led, Activity + food, Walk and explore, Mix it up
5. Full-screen loading state: "Composing your night..."

**Output page:** Opener → Main → Closer. Header with title, tags, total spend estimate, weather note. Three stop cards with role badge, venue name (serif large), category, curation note (italic), spend estimate, fixed/flexible tag, reservation link, Plan B button on flexible stops. Walk time connectors between cards. Footer: Google Maps export, share link, regenerate.

**Supabase schema:**
```sql
create table venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  neighborhood text not null,
  category text not null,
  price_tier int not null,
  vibe_tags text[],
  occasion_fit text[],
  stop_role text[],
  outdoor_seating boolean default false,
  reservation_url text,
  maps_url text,
  curation_note text,
  curated_by text,
  lat float,
  lng float,
  active boolean default true,
  created_at timestamptz default now()
);
```

Seed 5 placeholder venues so output renders immediately.

**Generation logic:**
1. Filter by neighborhood + price_tier + occasion_fit + stop_role + weather (call OpenWeatherMap for NYC — eliminate outdoor venues if rain/snow)
2. Score: vibe match 35%, occasion fit 15%, budget fit 15%, location fit 10%, time fit 10%, quality 10%, curation boost 5%
3. Pick best walkable Opener + Main + Closer combination
4. Pre-generate Plan B for each flexible stop
5. Pass to Claude API (claude-sonnet-4-20250514, max_tokens 1000) with system prompt: "You are the voice of Composer, a curated NYC date night app founded by two people known for their taste in the city. Write in a warm, confident, first-person plural voice. You are opinionated. Say 'this is the move' not 'you might enjoy.' Keep all copy concise. Never hedge."

**Env vars:** NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, ANTHROPIC_API_KEY, OPENWEATHERMAP_API_KEY

**Auth:** None. Fully anonymous.

---

## Success Metrics (CBS Launch)

- Week 1: 50 compositions generated within CBS community
- Week 4: 200+ compositions, 20%+ returning users
- Quality proxy: Google Maps export rate
- Word of mouth: Organic referral in CBS Slack / GroupMe

---

*"The best date nights aren't discovered — they're composed."*
