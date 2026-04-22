# Audit: `reids_claude/Composer-main` vs. our codebase

Comparison of Reid's prototype Composer build against our current codebase, with recommendations for what to pull in.

## File structure of `reids_claude/`

```
reids_claude/
├── composer-prd-final.md         # Shared PRD doc (matches our CLAUDE.md vision)
├── onboarding.html               # Standalone HTML mockup (Beli-style)
└── Composer-main/                # Reid's working Next.js app
    ├── app/
    │   ├── layout.js
    │   ├── page.js                       # Onboarded gate → OnboardingFlow or HomeScreen
    │   ├── globals.css
    │   └── api/
    │       ├── itinerary/generate/route.js  # Main itinerary endpoint (Google Places)
    │       ├── places/search/route.js       # Google Places passthrough
    │       ├── places/photo/route.js        # Photo proxy
    │       ├── availability/opentable/route.js
    │       ├── availability/resy/route.js
    │       └── events/route.js
    ├── components/
    │   ├── OnboardingFlow.jsx     # 4-step name/context/prefs/hoods
    │   ├── HomeScreen.jsx         # Greeting + saved plans + stats bar
    │   ├── PlanFlow.jsx           # 3-step wizard (where → details → when)
    │   ├── TimeWheel.jsx          # iOS-style scrolling time picker
    │   ├── ItineraryView.jsx      # Output with photos, ratings, swap
    │   └── TextMessageShare.jsx   # iMessage-styled share with tone selector
    ├── lib/
    │   ├── constants.js           # NEIGHBORHOODS, VIBES, BUDGET_TIERS, DATE_TYPES, MESSAGE_TONES, CURATED_VENUES
    │   ├── itinerary-engine.js    # Time-based stop planner + walk math
    │   ├── firebase.js / firebase-admin.js
    └── package.json / tailwind.config.js / next.config.js / jsconfig.json
```

**Stack differences:** plain JS (no TypeScript), `framer-motion` (we use `motion/react`), `lucide-react` icons (we use none), Firebase scaffolding (we use Supabase), Google Places API (we use a curated Supabase table).

**Total LOC across his components/lib/api:** ~2,300 lines.

---

## What's better in his version

### 1. Onboarding flow as a separate first-run experience ⭐
`OnboardingFlow.jsx` — 264 lines, 4 steps:
1. **Name** (text input, "What should we call you?")
2. **Context** (someone new / partner / something special / exploring)
3. **Preferences** (drinks: yes/sometimes/no + dietary: chips multi-select)
4. **Favorite neighborhoods** (optional, skippable)

Stored in `sessionStorage` as `composer_name` / `composer_context`. **We have nothing like this.** Our app jumps straight into the questionnaire every time. His onboarding is genuinely the headline thing to steal.

### 2. Two-screen separation: Home vs. Plan
`HomeScreen.jsx` — Greeting ("Good evening, Adit"), big "New Date Plan" CTA, list of saved plans, stats bar (Plans made / Places found / Texts sent). Returning users land here, not in the questionnaire. Repeat-use feel.

### 3. 3-step wizard instead of 4 atomic steps
`PlanFlow.jsx` collapses the input space into:
1. **Where** — neighborhoods (max 3)
2. **Details** — date type + vibe + budget on **one** screen
3. **When** — day picker + time window on one screen

Combining vibe/budget/occasion onto a single details screen is faster than our 4 separate steps. Worth considering.

### 4. Time window picker ⭐
`TimeWheel.jsx` — iOS-style snap-scroll picker for start/end times in 15-min increments. Automatically computes duration and tags it ("3h date"). His itinerary engine uses this to decide **how many stops fit** rather than always producing exactly 3.

We have no concept of time at all. Our itinerary is implicitly evening-shaped. This is a real feature gap if Composer is meant to handle "Saturday 11am brunch + walk + late lunch" as well as "Friday 7pm dinner + drinks."

### 5. Date-type aware stop planning
`itinerary-engine.js:planStopMix` computes 1–5 stops based on `endTime - startTime`. Adapts roles (opener/main/closer/activity/bonus) based on time-of-day and vibe. For a 90-minute window it returns 1 stop; for a 5-hour window it returns 4–5. Smart.

We always return exactly 3 (Opener/Main/Closer). Locked structure is a deliberate choice in our PRD, but his approach handles short coffees and long evenings gracefully.

### 6. Multi-neighborhood selection (max 3) ⭐
`PlanFlow.jsx:98-107` lets users pick up to 3 neighborhoods. We technically support multi-select in the UI (NeighborhoodStep) but collapse it to `surprise-me` if more than one is picked. His version actually uses the multi-select downstream — the API picks a random neighborhood from the user's selection per stop. **A real implementation of what we faked.**

### 7. TextMessageShare ⭐⭐
`TextMessageShare.jsx` — iMessage-styled preview, 3 tone options (Confident / Casual / Sweet), name field for the date. Click to copy. The killer copy line:

> *"Only the first stop is mentioned. The full itinerary stays with you. They just see the plan for the first stop — the rest is your secret advantage."*

This is on-brand for the founders' voice and aligns perfectly with our CLAUDE.md system prompt ("this is the move," opinionated). **Strongly worth stealing.** It also gives a real reason for the share button to exist.

### 8. Photo + rating display in itinerary
`ItineraryView.jsx:121-152` shows venue photos pulled from Google Places, star rating, address. We show curation notes only. His feels more like a real product page; ours feels editorial. Both have merit but photos do add credibility.

### 9. Day picker (next 7 days)
`PlanFlow.jsx:159-173` — Today/Tomorrow/then weekday names. Clean. We don't pick a day at all.

### 10. Stop swap UI inside itinerary
`ItineraryView.jsx:184-208` — Per-stop "Swap" button that opens an inline panel showing alternatives. More elegant than our Plan B toggle, which only flips between two pre-selected venues.

---

## What's better in ours

### 1. TypeScript + strict typing
His is plain JS with no types. Ours has full strict TypeScript, typed API contracts, no `any`. Huge maintainability win for ours.

### 2. Curated database, not Google Places
Our entire architecture is built around the founders' curation as the differentiator. His version uses Google Places + a tiny hardcoded `CURATED_VENUES` array of 6 spots. CLAUDE.md explicitly says: *"The product works because of the curation layer, not the technology."* Ours honors that; his doesn't.

### 3. Geo clustering with proximity enforcement
We just shipped `scoring.ts` with the 1.5km MAX_WALK_KM rule that anchors opener/closer to the main venue. His itinerary engine *calculates* walk times after the fact but doesn't *enforce* them — places can still be far apart because he picks one random neighborhood per stop. **Our scoring is better.**

### 4. Weighted scoring algorithm
`scoring.ts` with vibe match + occasion fit + budget fit + location + quality + curation boost is much more sophisticated than his random-pick-from-top-3-results approach.

### 5. Weather gating
`weather.ts` → eliminates outdoor venues on bad-weather days. He has nothing for weather.

### 6. Claude API as polish layer
Our `claude.ts` generates the composition header and personalizes curation notes with founder voice. His app has no LLM in the loop at all — just template strings.

### 7. Component decomposition + standards adherence
We just split QuestionnaireShell into 4 files under the 250-line rule. His PlanFlow is **491 lines in one file** with 3 nested step renderers. He has the same God-component problem we just fixed.

### 8. Editorial design system
Our Playfair Display + DM Sans + burgundy/forest/cream palette is brand-distinctive. His is generic startup-orange (`#ff7a11`) with `font-display` (Fraunces) and Inter — fine but indistinguishable from any consumer app. Our typography decisions are stronger.

### 9. Progressive filter relaxation
Our scorer relaxes neighborhood → budget → occasion if too few candidates exist and logs a warning. His just returns 404 if nothing matches.

### 10. Server-side architecture discipline
Our API route + lib separation is cleaner. His itinerary route mixes Google Places fetching, curated lookup, stop planning, and response shaping in one 248-line file. Several `console.error` statements with no real handling.

---

## Unique to his that we don't have at all

| Feature | Where | Worth stealing? |
|---|---|---|
| **First-run onboarding** (name, context, prefs, favorite hoods) | OnboardingFlow.jsx | **Yes — high value** |
| **HomeScreen with saved plans + stats** | HomeScreen.jsx | Maybe — requires accounts/storage to be useful |
| **Time window picker** (start + end, with auto-computed duration) | TimeWheel.jsx + PlanFlow | **Yes — fixes a real gap** |
| **Day-of-week picker** (next 7 days) | PlanFlow.jsx | **Yes — pairs with time window** |
| **Date-type aware variable stop count** (1–5 stops based on time available) | itinerary-engine.js | Conflicts with our locked Opener/Main/Closer; skip |
| **Real multi-neighborhood selection** (up to 3, used downstream) | PlanFlow.jsx + API | **Yes — completes what we half-built** |
| **TextMessageShare with iMessage preview + tones** | TextMessageShare.jsx | **Yes — strong brand fit** |
| **Per-stop Swap UI with alternatives** | ItineraryView.jsx | Maybe — overlaps with our Plan B |
| **Venue photos + ratings** | ItineraryView.jsx | Conflicts with editorial style; debate |
| **Drinks / dietary preferences** | OnboardingFlow.jsx | **Yes — pull through into scoring** |
| **OpenTable + Resy availability check stubs** | api/availability/* | Phase 2 per our PRD; skip for now |
| **Google Places photo proxy** | api/places/photo/route.js | Not relevant — we're curated |
| **Firebase auth scaffolding** | lib/firebase*.js | Conflicts with our "no auth" MVP rule; skip |

---

## Recommendation: what to pull in, in priority order

1. **TextMessageShare** — biggest brand win, lowest implementation cost. Pure client-side, fits our voice perfectly, gives the share button real purpose. The "first stop only is your secret advantage" line is gold.
2. **First-run onboarding** — name + drinks/dietary preferences. Persist in `localStorage` (we already lean on it). Drinks/dietary should flow into scoring as new filters on `composer_venues` (would need a `dietary_tags` column added later). Even just capturing the name and personalizing copy ("Hey Adit, here's your night") is a fast win.
3. **Time window + day picker** — currently we have no temporal awareness at all. Even if we don't go to variable stop counts, knowing "Saturday 1pm" vs. "Friday 7pm" should change which venues we surface. Pair with weather.
4. **Multi-neighborhood real implementation** — finish what we faked. Allow up to 3 neighborhoods, score venues across them, but still enforce our 1.5km clustering within the chosen set.

## What to leave behind

- **Google Places integration** — kills our curation moat
- **Photos in cards** — conflicts with editorial design
- **Variable stop count** — breaks our Opener/Main/Closer contract
- **Firebase** — we don't need auth for MVP
- **HomeScreen + saved plans** — premature without accounts
