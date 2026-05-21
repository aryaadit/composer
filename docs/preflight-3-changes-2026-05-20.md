# Pre-flight verification — onboarding step removal, occasion collapse, copy audit

**Date:** 2026-05-20
**Scope:** Read-only inspection of `main` (working tree is `adit/sandbox-testing`, 1 docs-only commit ahead; source identical to main).

---

## CHECK 1 — `context` field usage

The column is **`context`** (singular) on `composer_users`, not `contexts`. The variable `contexts` exists as a **local** React state name in `OnboardingFlow.tsx` (a plural plural-ization at the UI layer). Everything else uses `context`.

### Every reference, classified

| File:Line | What it does | Bucket |
|---|---|---|
| [src/types/index.ts:48](src/types/index.ts#L48) | `UserPrefs.context?: string[]` — onboarding payload type | type |
| [src/types/index.ts:60,71](src/types/index.ts#L60-L71) | `ComposerUser.context: string[]` — profile shape from DB | type |
| [src/app/profile/_components/AccountDetails.tsx:78-111](src/app/profile/_components/AccountDetails.tsx#L78-L111) | Profile page: reads `profile.context` for display, writes via `f.save("context", f.draft)` | **(b) profile display + edit** |
| [src/app/api/profile/route.ts:19,54](src/app/api/profile/route.ts#L19-L54) | PATCH endpoint: validates + writes `context` via service-role | **(b) profile write path** |
| [src/lib/validation/profile.ts:44-48](src/lib/validation/profile.ts#L44-L48) | Taxonomy whitelist validation against `CONTEXT_OPTIONS` | validation |
| [src/lib/auth.ts:76,87](src/lib/auth.ts#L76-L87) | `upsertProfile()` writes `context` during onboarding completion | **(a) onboarding write** |
| [src/config/onboarding.ts:29-47](src/config/onboarding.ts#L29-L47) | `CONTEXT_OPTIONS` (the 5 options) + `CONTEXT_TO_OCCASION` (slug→occasion map) | config |
| [src/components/onboarding/OnboardingFlow.tsx:40,87,211,216,342](src/components/onboarding/OnboardingFlow.tsx) | Onboarding step 2 — local `[contexts, setContexts]` state, multi-select cards, writes via `context: contexts` in submit | **(a) onboarding write** |
| [src/components/questionnaire/QuestionnaireShell.tsx:18,47-58](src/components/questionnaire/QuestionnaireShell.tsx#L47-L58) | Reads `profile.context` to prefill `occasion` step. **Only when `context.length === 1`** — multi-context users are not prefilled. Uses `CONTEXT_TO_OCCASION` | **(c) picker prefill** |

### Confirmed scope

✅ **`context` is used for ONLY (a), (b), and (c).** No scoring usage, no Gemini-prompt usage, no analytics, no audit-log usage.

Cross-check:
- `src/lib/scoring.ts` — references to "context" are JSDoc only (e.g., "no day/block context") and unrelated to the profile column.
- `src/config/prompts.ts` / `src/lib/claude.ts` — no reference to `context` at all. The Gemini prompt is built from `QuestionnaireAnswers` only.
- No `console.log`, audit table, or analytics call references `context`.

### Other observations

- `OnboardingFlow.tsx:40` declares `const [contexts, setContexts]` — local state plural. When step 2 is removed, this state goes too, along with `OnboardingFlow.tsx:211-242` (the rendered options) and the `contexts.length === 0` validation at line 342.
- `QuestionnaireShell.tsx:47-58` will silently no-op when `profile.context` is empty (`if (!profile?.context?.length) return;`), so removing step 2 doesn't break the picker prefill — but the prefill will stop firing for new users, which is fine because no occasion can be inferred when no context is collected.
- Migration [20260430000002_context_array.sql](supabase/migrations/20260430000002_context_array.sql) widened `context` from text to text[]. The column itself can be left in place when removing the step — historical data stays valid, new users land with `context: []`.

---

## CHECK 2 — Venue distribution for the new "Date" bucket

**Data source:** Live Supabase pull via `psql` (1,329 active venues across all neighborhoods). Aggregated against `NEIGHBORHOOD_GROUPS` from [src/config/generated/neighborhoods.ts](src/config/generated/neighborhoods.ts) and `ROLE_EXPANSION` from [src/config/generated/stop-roles.ts](src/config/generated/stop-roles.ts).

The "Date" bucket = venues whose `occasion_tags` overlap any of `{first_date, dating, couple}`. Role counts use `venueMatchesRole()` semantics: a venue with `stop_roles=["drinks"]` counts toward both opener and closer.

### Full distribution

```
Group                             Tot | D-tot D-O  D-M  D-C | F-tot F-O  F-M  F-C | S-tot S-O  S-M  S-C
------------------------------------------------------------------------------------------------------------------------
West Village                      130 |   128  65   50   36 |   112  57   44   29 |    81  58   14   34
Greenwich Village                  31 |    30  16   15    6 |    24  12   12    3 |    17  15    4    5
East Village / LES                221 |   201 127   58   63 |   196 112   56   53 |   150 117   24   57
SoHo / Nolita / Tribeca           149 |   142  63   64   29 |   136  58   62   27 |    81  59   15   24
Chelsea                            40 |    39  26   18    8 |    38  24   18    8 |    28  25    9    7
Flatiron / NoMad                   62 |    59  32   16   29 |    48  23   14   21 |    39  30    3   24
Gramercy / Murray Hill             13 |    13   7    6    4 |    13   7    6    4 |     7   5    3    2
Hell's Kitchen / Midtown West      29 |    28  13   12    9 |    25  11   12    7 |    16  10    4    6
Midtown East                       29 |    28  14   12   10 |    27  15   10   10 |    15  12    4    7
Koreatown                          41 |    41   1   24    0 |    41   1   24    0 |    22   1    5    0
Chinatown                          35 |    34  15   16    6 |    30  13   16    5 |    23  13   10    5
FiDi / Lower Manhattan             26 |    25  10   10    6 |    23  10    8    6 |    12   9    1    5
Upper West Side                    32 |    31  11   22    2 |    29  11   20    2 |    18  11   10    1
Upper East Side                    26 |    26  16   14    5 |    20  13   11    4 |    16  14    6    4
Harlem / Uptown                     5 |     5   3    2    0 |     5   3    2    0 |     5   3    2    0
Williamsburg / Greenpoint         142 |   119  72   37   33 |   129  69   36   32 |    85  68   12   32
East Williamsburg / Bushwick       77 |    68  48   16   13 |    70  49   16   13 |    51  47    1   13
DUMBO / Brooklyn Heights           52 |    47  19   21    7 |    42  15   20    5 |    30  21    7    8
Fort Greene / Clinton Hill         20 |    20  10   10    5 |    18   9    9    5 |    13  10    3    5
Park Slope / Prospect              44 |    41  18   18    7 |    39  16   17    7 |    25  18    5    7
Bed-Stuy / Crown Heights           31 |    30  10   18    5 |    29   8   18    6 |    26  10   13    6
South Brooklyn                     15 |     9   4    4    2 |    15   4    7    3 |    13   4    6    3
Astoria / LIC                      37 |    35  12   19    5 |    34  10   19    3 |    27  11   12    4
Queens                             25 |    23   2   19    0 |    25   2   19    0 |    19   2   15    0
Bronx / Staten Island              14 |    14   2   10    2 |    13   2    9    2 |    12   2    8    2
```

Legend: `Tot` = active venues in the group. `D-tot/F-tot/S-tot` = Date/Friends/Solo bucket counts. `O/M/C` = venues that can fill opener/main/closer per role-expansion semantics.

### 🔴 Risk flags — Date bucket

| Group | Issue | Detail |
|---|---|---|
| Harlem / Uptown | **<8 venues** | Only 5 Date-tagged venues across the whole group. Below the rough composition threshold. |
| Koreatown | **0 closers** | 41 Date venues but ZERO can serve `closer` (no `closer` or `drinks` role). User picks Koreatown for a Date night → composer cascades to neighborhood relaxation for the closer slot. |
| Queens | **0 closers** | 23 Date venues, same issue — zero closer-eligible. |

Below the picker's `minGroupVenuesToRender` threshold of 50 (per [algorithm.ts](src/config/algorithm.ts)), Harlem/Uptown and several other small groups should already be hidden from the questionnaire. Verify in [NeighborhoodPicker](src/components/shared/NeighborhoodPicker.tsx).

### Comparison — Friends & Solo buckets

**Friends bucket risks:**
- Harlem / Uptown — 5 venues (same root cause as Date)
- Koreatown — 0 closers
- Queens — 0 closers

**Solo bucket risks:**
- Gramercy / Murray Hill — 7 (just under threshold; was OK on Date with 13)
- Harlem / Uptown — 5
- Koreatown — 0 closers
- Queens — 0 closers

### Other surfaced data-quality issues

3 active venues have non-snake_case `neighborhood` values not mapped into any group:
- `"Hell's Kitchen"` (literal label with apostrophe) — 1 venue
- `"midtown"` (likely should be `midtown_east` or `midtown_west`) — 1 venue
- `"nyc"` (filler value) — 1 venue

These are orphaned from the picker — users can never reach them via neighborhood selection. Not launch-blocking but worth fixing in the sheet.

### Net read

The Date bucket is **healthy in 22 of 25 groups**. The collapse doesn't materially shrink the venue pool for `Date` — combining the 3 sheet slugs (`first_date`, `dating`, `couple`) actually broadens it vs. any one slug alone. The 3 risk-flagged groups (Harlem, Koreatown, Queens-closer) would already trigger composer cascade relaxation today even without the collapse.

---

## CHECK 3 — Saved itineraries with deprecated occasion slugs

### Currently stored in prod

Live query against `composer_saved_itineraries`:

```
relationship | 5
solo         | 1
```

**Six saved itineraries total.** Five use `occasion = "relationship"` (UI-current but **not** in the generated sheet taxonomy, so already broken on main — see launch recon doc). One uses `solo`. None use `family`, `dating`, `first_date`, or `couple`.

After the collapse to `date | friends | solo`, the five `relationship` rows will still be there, holding a slug that no longer exists in any taxonomy.

### Read path tolerance

[src/app/itinerary/saved/[id]/page.tsx:62-93](src/app/itinerary/saved/[id]/page.tsx#L62-L93) hydrates the row via `toItineraryResponse(saved)` and passes the raw `saved.occasion` slug into both `header.occasion_tag` and `inputs.occasion`. **No filtering, no fallback, no validation.** Will not throw — the slug just flows through.

### Where the slug renders

The slug is converted to a display label via [`occasionLabel()`](src/config/occasions.ts#L25-L27):

```ts
export function occasionLabel(slug: string): string {
  return (OCCASION_LABELS as Record<string, string>)[slug] ?? slug;
}
```

If the slug isn't in `OCCASION_LABELS`, **it returns the slug literal**. So `occasionLabel("relationship")` returns `"relationship"`.

Used in:
- [src/components/itinerary/CompositionHeader.tsx:65](src/components/itinerary/CompositionHeader.tsx#L65) — atmosphere row "occasion · vibe · budget · weather" on **every** saved-itinerary view.

Result for the 5 stored `relationship` rows: the atmosphere row will literally read `"relationship · …"` — lowercase, raw, no styling.

`SavedPlanRow.tsx` (the home + profile list view) does NOT render the occasion — only `custom_name / title / subtitle / stop count`. ✅ Safe.

### Recommendation

Add an `OCCASION_DISPLAY_FALLBACKS` map (or extend `OCCASION_LABELS` server-side) that converts deprecated slugs to a sensible label:

```ts
const DEPRECATED_OCCASION_LABELS: Record<string, string> = {
  relationship: "Date Night",
  family: "Friends & Family",
  dating: "Date Night",
  first_date: "Date Night",
  couple: "Date Night",
};
```

Then `occasionLabel()` falls through deprecated → fresh → slug-literal. Survives any saved-itinerary view regardless of when it was written.

---

## CHECK 4 — Copy audit scope

Excluded: JS Date API calls (`new Date()`, `getDate()`, `toISOString()`, etc.), `type | interface` declarations, calendar `type="date"` form inputs, the `date` prop wiring for Resy booking URLs, the YYYY-MM-DD `date` query param on `/api/availability/*`, and the occasion slugs themselves.

### User-facing copy hits

| File:Line | Surface | String |
|---|---|---|
| [src/app/layout.tsx:23](src/app/layout.tsx#L23) | `<title>` | `"Composer — Curated NYC Date Nights"` |
| [src/app/layout.tsx:25](src/app/layout.tsx#L25) | meta description | `"A curated date night in New York City, built for you in under a minute."` |
| [src/app/layout.tsx:27](src/app/layout.tsx#L27) | OG title | `"Composer — Curated NYC Date Nights"` (duplicate of 23) |
| [src/app/layout.tsx:29](src/app/layout.tsx#L29) | OG description | duplicate of 25 |
| [src/app/page.tsx:99](src/app/page.tsx#L99) | landing rotator | `"a first date"` |
| [src/app/page.tsx:102](src/app/page.tsx#L102) | landing rotator | `"date night"` |
| [src/app/page.tsx:112](src/app/page.tsx#L112) | landing rotator | `"a first date"` (loop terminator) |
| [src/components/questionnaire/StepLoading.tsx:29-36](src/components/questionnaire/StepLoading.tsx#L29-L36) | loading copy dictionary | keys: `dating`, `relationship`, `family`, `first_date`, `couple` — all become **dead keys** after collapse. Values include user-facing strings (`"Planning your date night..."`) |

### Gemini prompt hits (higher leverage)

| File:Line | Where | Detail |
|---|---|---|
| [src/config/prompts.ts:13](src/config/prompts.ts#L13) | system prompt | `"Match the occasion: first date is a little nervous, established couples is warm and easy, friends is fun without performing, solo is a treat without ceremony."` — **the occasion-nuance instruction the model uses to vary voice** |
| [src/config/prompts.ts:27](src/config/prompts.ts#L27) | system prompt example | `"BAD: A Food-Forward First Date"` — explicit anti-pattern |
| [src/config/prompts.ts:32](src/config/prompts.ts#L32) | system prompt example | `"BAD: An unforgettable first date with bespoke cocktails..."` — anti-pattern |
| [src/config/prompts.ts:101](src/config/prompts.ts#L101) | user-prompt header | `"Generate copy for this NYC date night itinerary."` — single hardcoded "date night" framing |

### Comment / dev-facing (skip for copy review)

5 more references in `src/config/options.ts`, `src/config/occasions.ts`, `src/lib/venues/*.ts` are code comments or `"date"` as a column-type literal. **No user-facing impact.**

### Scope size for review

- **4 marketing-meta strings** in `layout.tsx` (one tagline, repeated 2x for OG).
- **3 landing-rotator phrases** in `app/page.tsx` (visible on every unauthed visit).
- **5 occasion-keyed loading-copy entries** in `StepLoading.tsx` (~10 strings total inside the values).
- **4 prompt strings** in `prompts.ts` — highest leverage because they shape every Gemini output.

**Total: ~22 strings across 4 files.** A focused 30-minute pass. The prompt changes are most consequential — both because they're seen on every generate (vs. landing once) and because the system prompt's "first date is a little nervous" line is the model's main occasion-differentiating cue.

---

## CHECK 5 — Gemini prompt occasion slug shape

### Where the slug is interpolated

Single interpolation site: [src/config/prompts.ts:108](src/config/prompts.ts#L108)

```ts
- Occasion: ${inputs.occasion}
```

`inputs.occasion` is the slug from the questionnaire, passed **raw** with no expansion. So today Gemini sees:

```
- Occasion: dating
- Occasion: first_date
- Occasion: solo
```

After the taxonomy collapse, it would see literally:

```
- Occasion: date
```

### Why "Occasion: date" is bad in the prompt

Three compounding problems:

1. **The system prompt at [prompts.ts:13](src/config/prompts.ts#L13) distinguishes `first date is a little nervous` from `established couples is warm and easy`** — collapsing both into "date" tells the model less than today, not more. Voice will flatten.
2. **The user-prompt header at [prompts.ts:101](src/config/prompts.ts#L101) is already `"NYC date night itinerary"`** — adding `Occasion: date` immediately below it is doubling down on the exact word ("date") we're de-emphasizing in the UI. The model will mirror it heavily in output.
3. **Gemini is trained to use input slugs as anchors.** A literal `date` in the input is going to surface in title/subtitle/notes regardless of the avoid-list in the system prompt. Anti-patterns in the system prompt are weaker than positive anchors in the user prompt.

### Recommended shape

When the slug is the new `date` bucket, expand at the prompt-build boundary to something more semantically rich than the bucket label. Map at `prompts.ts:buildGenerationPrompt`:

```ts
const OCCASION_TO_PROMPT_FRAMING: Record<string, string> = {
  date: "Romantic night — couple, partner, or new date; warm intimacy without performing",
  friends: "Group night — friends or family, casual and high-energy",
  solo: "Solo — a treat, no ceremony",
};
const occasionFraming = OCCASION_TO_PROMPT_FRAMING[inputs.occasion] ?? inputs.occasion;
```

Then `- Occasion: ${occasionFraming}` in the prompt. This:
- Keeps Gemini from echoing "date" into copy.
- Preserves the "warm / casual / treat" distinctions the system prompt is built around.
- Lives at the prompt-build boundary, so the slug stays clean everywhere else.

Founder voice is at risk here — per CLAUDE.md, system-prompt changes need founder sign-off. But this is an **input-prompt** change, which is the right place to do bucket→framing mapping without touching the voice rules.

---

## CHECK 6 — `/api/health` smoke test inputs

Current shape ([src/app/api/health/route.ts:31-40](src/app/api/health/route.ts#L31-L40)):

```ts
const SCORING_TEST_INPUT: QuestionnaireAnswers = {
  occasion: "first_date",
  neighborhoods: ["west_village"],
  budget: "nice_out",
  vibe: "food_forward",
  day: <today>,
  timeBlock: "evening",
  startTime: "17:00",
  endTime: "22:00",
};
```

- `occasion: "first_date"` — sheet-valid slug, **NOT** UI-reachable today. After collapse: stops being valid in any layer.
- `neighborhoods: ["west_village"]` — 130 active venues, healthy. Unchanged.
- `vibe: "food_forward"` — valid, unchanged.
- `budget: "nice_out"` — valid, unchanged.

### What to change post-collapse

```ts
occasion: "date",  // was "first_date"
```

…plus a note: the health check exercises the scoring pipeline, so the scorer needs to understand `"date"` as a bucket that maps to `[first_date, dating, couple]` on the venue side. If the collapse implementation translates `"date"` → bucket tags at the **request boundary** (e.g., `/api/generate` expands `date` to the venue-tag set before scoring), the health check input shape should match the post-boundary representation — which means either:

- **Option A:** Send `occasion: "date"` and let `/api/health` go through the same translation path as `/api/generate`.
- **Option B:** Pick the most representative sheet-side slug (`dating` is the broadest of the three) and feed that to the scorer directly.

Option A is closer to real-user flow. Option B is closer to the pre-collapse smoke test.

Everything else in `SCORING_TEST_INPUT` stays as-is — West Village + food-forward + nice_out + evening will keep returning a non-empty top-3 against either taxonomy.

---

## Summary table

| Check | Result |
|---|---|
| 1. `context` usage | ✅ Confirmed (a)/(b)/(c) only. No scoring, Gemini, analytics, or audit touch points |
| 2. Date bucket distribution | 🟡 22 of 25 hoods healthy. 3 risk-flagged: Harlem/Uptown (5 venues), Koreatown (0 closers), Queens (0 closers). 3 data-quality orphans (`"Hell's Kitchen"`, `"midtown"`, `"nyc"`) |
| 3. Saved itineraries | 🟡 5 stored `relationship` rows will render `"relationship · …"` literal in CompositionHeader after collapse. Need a deprecated-slug fallback map. Read path doesn't throw |
| 4. Copy audit scope | ~22 user-facing strings across 4 files. Bulk in `layout.tsx`, `app/page.tsx`, `StepLoading.tsx`, `prompts.ts`. ~30 min review |
| 5. Gemini prompt shape | 🔴 Occasion slug is interpolated raw at [prompts.ts:108](src/config/prompts.ts#L108). Sending literal `"date"` will compound with the existing "NYC date night itinerary" header and break the system prompt's first-date/couples nuance. Need a bucket→framing expansion map at prompt-build |
| 6. `/api/health` | 🟡 Currently `occasion: "first_date"` (sheet-valid but UI-unreachable). Change to `"date"` post-collapse; verify the scorer handles the bucket→tags translation |
