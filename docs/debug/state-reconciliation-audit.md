# State Reconciliation Audit

## Part 1: Flow Inventories

### Flow A: Onboarding (post-auth profile collection)

| Step | Preference | Type | Options | Storage | DB Column |
|------|-----------|------|---------|---------|-----------|
| 0 | name | string | free text | useState | composer_users.name |
| 1 | contexts | string[] | dating, relationship, friends, family, solo | useState (multi-select) | composer_users.context (**only first item stored**) |
| 2a | drinks | DrinksPref | yes, sometimes, no | useState (single) | composer_users.drinks |
| 2b | dietary | string[] | none, vegetarian, vegan, halal, kosher, gluten-free | useState (multi) | composer_users.dietary |
| 3 | favoriteHoods | string[] | NEIGHBORHOOD_GROUPS (~11 groups) | useState (multi) | composer_users.favorite_hoods |

### Flow B: Questionnaire (per-itinerary generation)

| Step | Preference | Type | Options | Storage | Submitted to |
|------|-----------|------|---------|---------|-------------|
| 0 | occasion | string | dating, relationship, friends, family, solo | reducer (single-select) | /api/generate body |
| 1 | neighborhoods | string[] | NEIGHBORHOOD_GROUPS → expanded to slugs | reducer (multi, max 3) | /api/generate body |
| 2 | budget | string | casual, nice_out, splurge, all_out, no_preference | reducer (single) | /api/generate body |
| 3 | vibe | string | food_forward, drinks_led, activity_food, walk_explore, mix_it_up | reducer (single) | /api/generate body |
| 4 | day + timeBlock | string + TimeBlock | 7-day pills + time blocks | reducer | /api/generate body |

---

## Part 2: Drift Map

| Concept | Onboarding (Flow A) | Questionnaire (Flow B) | Drift Types |
|---------|-------------------|----------------------|-------------|
| **Occasion/Context** | Multi-select (`string[]`), saves `contexts[0]` only | Single-select, pre-fills from profile.context via CONTEXT_TO_OCCASION | UI cardinality, Label ("context" vs "occasion"), Option set (same IDs but different mapping) |
| **Neighborhoods** | Multi-select (uncapped), saves group IDs | Multi-select (max 3), expands to storage slugs | Persistence (profile vs ephemeral), Type shape (group IDs vs expanded slugs) |
| **Drinks** | Collected in onboarding | NOT in questionnaire — read server-side from profile | Persistence (profile → server read) |
| **Dietary** | Collected in onboarding | NOT in questionnaire, NOT used in generation | Persistence (saved but unused) |
| **Budget** | NOT collected in onboarding | Collected per-itinerary | — |
| **Vibe** | NOT collected in onboarding | Collected per-itinerary | — |
| **Day/TimeBlock** | NOT collected in onboarding | Collected per-itinerary | — |

---

## Part 3: User Profile Schema

### 3a: Code-level types

```typescript
// src/types/index.ts

type DrinksPref = "yes" | "sometimes" | "no";

interface UserPrefs {           // camelCase, client-side shape
  name: string;
  context?: string;
  drinks?: DrinksPref;
  dietary?: string[];
  favoriteHoods?: string[];
}

interface ComposerUser {        // snake_case, DB row shape
  id: string;
  name: string;
  context: string | null;
  drinks: DrinksPref | string | null;
  dietary: string[];
  favorite_hoods: string[];
  is_admin: boolean;
  created_at: string;
}
```

### 3b: DB columns (composer_users)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| id | UUID | NO | — (FK to auth.users) |
| name | TEXT | NO | — |
| context | TEXT | YES | — |
| drinks | TEXT | YES | — |
| dietary | TEXT[] | NO | '{}' |
| favorite_hoods | TEXT[] | NO | '{}' |
| is_admin | BOOLEAN | NO | false |
| created_at | TIMESTAMPTZ | YES | NOW() |

### 3c: What onboarding saves vs what code expects

**upsertProfile writes:**
```typescript
{ id, name, context: contexts[0], drinks, dietary, favorite_hoods }
```

**Gaps:**
- ⚠️ `context` stores only the FIRST selected context despite multi-select UI. If user picks "dating" + "friends", only "dating" is stored.
- ✅ `drinks`, `dietary`, `favorite_hoods` match their types
- `is_admin` is never set by onboarding (correct — set manually in Supabase)

---

## Part 4: Generate Endpoint Contract

### 4a: Request body (GenerateRequestBody)

```typescript
{
  occasion: Occasion;          // "dating" | "relationship" | etc.
  neighborhoods: Neighborhood[]; // expanded storage slugs
  budget: Budget;              // "casual" | "nice_out" | etc.
  vibe: Vibe;                  // "food_forward" | etc.
  day: string;                 // "2026-04-25"
  timeBlock: TimeBlock;        // "evening" | etc.
  excludeVenueIds?: string[];
}
```

### 4b: How onboarding data reaches generate

**Hybrid approach:**
- **Re-collected**: occasion, neighborhoods, budget, vibe, day, timeBlock — questionnaire re-asks all of these
- **Read from profile**: only `name` and `drinks` (via `readAuthedPrefs()` server-side)
- **Not used**: `context` (only for pre-filling occasion), `dietary` (collected but never consulted), `favorite_hoods` (collected but not used in scoring)

**UX issue**: Neighborhoods are collected in onboarding as "favorites" but NOT used to pre-fill the questionnaire. User sets them, then gets asked again.

**Pre-fill that DOES work**: `profile.context` → `CONTEXT_TO_OCCASION` mapping → pre-fills occasion step. But `family` context has no mapping and silently fails.

---

## Part 5: Saved Itineraries

### Columns (composer_saved_itineraries)

| Column | Type | Written by ActionBar |
|--------|------|---------------------|
| user_id | UUID | ✅ |
| title | TEXT | ✅ (from header) |
| subtitle | TEXT | ✅ (from header) |
| occasion | TEXT | ✅ (from inputs) |
| neighborhoods | TEXT[] | ✅ (from inputs) |
| budget | TEXT | ✅ (from inputs) |
| vibe | TEXT | ✅ (from inputs) |
| day | TEXT | ✅ (from inputs) |
| time_block | TEXT | ✅ (from inputs.timeBlock) |
| stops | JSONB | ✅ |
| walking | JSONB | ✅ |
| weather | JSONB | ✅ |
| custom_name | TEXT | Not set on save (edited later) |

No drift risk here — saved itineraries capture the questionnaire inputs used to generate, not the profile preferences.

---

## Part 6: Multi-Select Drift

| Field | Onboarding UI | DB Storage | Questionnaire UI | Scoring Engine | Risk |
|-------|--------------|------------|-----------------|---------------|------|
| **Context/Occasion** | Multi-select | Single string (first item) | Single-select | Expects single string | **LOW** — only first item stored, scoring gets a single string. But multi-select UI misleads user. |
| **Neighborhoods** | Multi (uncapped) | Group IDs | Multi (max 3) | Expects string[] of expanded slugs | **LOW** — different data (profile stores groups, scoring gets expanded slugs from questionnaire). No cross-contamination because questionnaire re-collects. |
| **Dietary** | Multi | string[] in DB | Not collected | **Never read** | **NONE** — collected but dead data. No runtime risk, just wasted UX effort. |

**No silent-break risks identified.** The scoring engine only reads from `QuestionnaireAnswers` (re-collected per session), not from the profile. The only profile field that influences scoring is `drinks` (hard filter).

---

## Part 7: Canonical Constants Drift

| Concept | Onboarding source | Questionnaire source | Same? |
|---------|-------------------|---------------------|-------|
| Context/Occasion options | `CONTEXT_OPTIONS` in config/onboarding.ts | `questionSteps[0].options` in config/options.ts | ⚠️ **Same IDs, different labels** — onboarding has descriptions, questionnaire has descriptions. IDs match: dating, relationship, friends, family, solo |
| Neighborhoods | `NeighborhoodPicker` component (imports NEIGHBORHOOD_GROUPS) | Same component, same config | ✅ Same |
| Drinks | `DRINK_OPTIONS` in config/onboarding.ts | Not in questionnaire | N/A |
| Dietary | `DIETARY_OPTIONS` in config/onboarding.ts | Not in questionnaire | N/A |
| Time blocks | Not in onboarding | `@/lib/itinerary/time-blocks` | N/A |
| Vibes | Not in onboarding | `@/config/vibes` | N/A |
| Budgets | Not in onboarding | `@/config/budgets` | N/A |

**No parallel taxonomies.** Onboarding uses its own config file (`config/onboarding.ts`) for the fields it collects, and the questionnaire uses the canonical configs for its fields. They don't overlap except on context/occasion, which is bridged by `CONTEXT_TO_OCCASION`.

---

## Prioritized Action List

### Breaking Issues
None. The scoring engine only reads from the questionnaire's re-collected answers, not from the profile. No silent wrong results.

### UX Issues
1. **Context multi-select misleads** — User can select multiple contexts but only the first is stored. Either make it single-select (to match reality) or store all and use them.
2. **`family` context not mapped** — Selecting "Family Fun" in onboarding doesn't pre-fill the occasion step. Missing entry in `CONTEXT_TO_OCCASION`.
3. **Neighborhoods collected twice** — Onboarding asks for favorite neighborhoods, questionnaire asks again. Profile favorites don't pre-fill the questionnaire.
4. **Dietary collected but unused** — User sets dietary restrictions in onboarding but generation never filters by them. Wasted effort, broken trust signal.
5. **`favorite_hoods` unused in scoring** — Same as dietary — collected, stored, never consulted.

### Hygiene Issues
1. **Dual option definitions** — Context options defined in `config/onboarding.ts` AND `config/options.ts` with slightly different structures. Could drift if one is updated without the other.
2. **`CONTEXT_TO_OCCASION` mapping lives in onboarding config** — Conceptually it bridges two systems, should live in a shared location or be documented more prominently.
3. **`drinks` type looseness** — `ComposerUser.drinks` is typed as `DrinksPref | string | null` (the `| string` is a safety valve for DB reads). Could be tightened.
