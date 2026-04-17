# Config Generation System — Full Context

## Background: What We're Solving

We're restructuring so the Google Sheet/Excel file is the **SINGLE SOURCE OF TRUTH** for all venue data AND scoring configuration. 

### Current Problem:
- Sheet has reference tabs (Vibe Tags, Neighborhoods, Occasion Tags, etc.)
- Code has hardcoded arrays (`VIBE_VENUE_TAGS`, `NEIGHBORHOOD_GROUPS`, `ROLE_EXPANSION`, etc.)
- These can drift — I add a value to the sheet, forget to update code, scoring breaks silently
- Import script was doing heavy normalization/mapping because Reid's original data was messy
- Now my sheet has dropdown validation — data is already clean, no transformation needed

### Target Architecture:

```
┌─────────────────────────┐
│  Google Sheet           │
│  (single source of      │
│   truth)                │
│                         │
│  - Venues tab (data)    │
│  - Vibe Tags            │
│  - Vibe Scoring Matrix  │
│  - Neighborhood Groups  │
│  - Occasion Tags        │
│  - Stop Roles           │
│  - Budget Tiers         │
│  - Categories           │
└───────────┬─────────────┘
            │
            │ npm run generate-configs
            │ (reads xlsx, writes .ts)
            ▼
┌─────────────────────────┐
│  src/config/generated/  │
│                         │
│  - vibes.ts             │
│  - neighborhoods.ts     │
│  - occasions.ts         │
│  - stop-roles.ts        │
│  - budgets.ts           │
│  - categories.ts        │
└───────────┬─────────────┘
            │
            │ imported by
            ▼
┌─────────────────────────┐
│  src/config/*.ts        │
│  src/lib/scoring.ts     │
│  (app code)             │
└─────────────────────────┘
```

### Workflow After This:
1. I update my Google Sheet (add a neighborhood, tweak vibe scoring, etc.)
2. Export as xlsx to `docs/`
3. Run `npm run generate-configs`
4. Commit the generated files
5. Deploy

**No manual code edits for config changes. Sheet drives everything.**

### The Import Script:
Already simplified to be a dumb passthrough — no validation, no mapping. It reads the Venues tab and outputs INSERT statements. The config generation is separate from venue import.

---

## Task: Build Config Generation Script

### 1. Create `scripts/generate-configs.ts`

Reads the Excel file and outputs TypeScript config files.

**Input:** `docs/composer_venue_sheet_curated.xlsx`

**Output files in `src/config/generated/`:**

| Output File | Source Sheet(s) | What it exports |
|-------------|-----------------|-----------------|
| `vibes.ts` | Vibe Scoring Matrix | `VIBE_VENUE_TAGS`: `Record<string, string[]>` — maps vibe slug → array of matching venue tags |
| `vibes.ts` | Vibe Tags | `SCORED_VIBE_TAGS`: `string[]` — tags under "⚡ SCORED TAGS" header |
| `vibes.ts` | Vibe Tags | `CROSS_CUTTING_VIBE_TAGS`: `string[]` — tags under "✦ CROSS-CUTTING TAGS" header |
| `neighborhoods.ts` | Neighborhood Groups | `NEIGHBORHOOD_GROUPS`: `Record<string, { label: string, borough: string, slugs: string[] }>` |
| `neighborhoods.ts` | Neighborhoods | `ALL_NEIGHBORHOODS`: `string[]` — all valid storage slugs |
| `stop-roles.ts` | Stop Roles | `ROLE_EXPANSION`: `Record<string, string[]>` — maps role → serves-as roles (from "Serves As" column) |
| `stop-roles.ts` | Stop Roles | `ALL_STOP_ROLES`: `string[]` — all 6 role values |
| `budgets.ts` | Budget Tiers | `BUDGET_TIER_MAP`: `Record<string, number[]>` — maps budget slug → array of price tiers |
| `occasions.ts` | Occasion Tags | `OCCASIONS`: `string[]` — all valid occasion values |
| `categories.ts` | Categories | `CATEGORIES`: `string[]` — all valid category values |

### 2. Update Existing Config Files

Update `src/config/vibes.ts`, `src/config/neighborhoods.ts`, etc. to import from generated files instead of hardcoding values.

Example transformation:

```typescript
// BEFORE (hardcoded):
export const VIBE_VENUE_TAGS = {
  "food-forward": ["food_forward", "tasting", "dinner", "bistro"],
  // ...
};

// AFTER (imports from generated):
import { VIBE_VENUE_TAGS } from './generated/vibes';
export { VIBE_VENUE_TAGS };
// ... any additional logic that uses VIBE_VENUE_TAGS stays here
```

### 3. Add npm Script

In `package.json`:
```json
{
  "scripts": {
    "generate-configs": "npx ts-node scripts/generate-configs.ts"
  }
}
```

### 4. Commit Generated Files

Generated files should be **committed to git** (not gitignored) so production builds don't require the xlsx file to be present.

### 5. Verify

After generation works, re-run the dry-run venue import to confirm all 496 venues pass with the new configs.

---

## Sheet Structure Reference

All reference sheets follow this format:
- **Row 1:** Title (e.g., `⬡ VIBE TAGS`)
- **Row 2:** DB column info (e.g., `DB column: vibe_tags`)
- **Row 3:** Column headers (e.g., `Value`, `Description`)
- **Row 4+:** Data rows

### Vibe Tags Sheet
```
Row 1: ⬡  VIBE TAGS
Row 2: DB column: vibe_tags | DB type: text[]
Row 3: Value | Description
Row 4: ⚡  SCORED TAGS — these directly affect venue matching in the algorithm
Row 5: food_forward | Restaurants, dinner spots
Row 6: dinner | General dinner venue
...
Row N: ✦  CROSS-CUTTING TAGS — valid but not scored
Row N+1: romantic | Date night vibe
...
```

### Vibe Scoring Matrix Sheet
```
Row 1: ⬡  VIBE SCORING MATRIX
Row 2: Maps questionnaire vibe selection → venue vibe_tags that score (35% weight)
Row 3: Vibe Slug | Display Label | Matching Venue Tags | Notes
Row 4: food_forward | Food-Forward | food_forward, tasting, dinner, bistro | 2+ matches = 35pts...
Row 5: drinks_led | Drinks-Led | cocktail_forward, wine_bar, speakeasy, drinks |
...
```

### Neighborhood Groups Sheet
```
Row 1: ⬡  NEIGHBORHOOD GROUPS
Row 2: Questionnaire picker groups → storage slugs for scoring (10% weight)
Row 3: Group ID | Display Label | Borough | Storage Slugs
Row 4: west_village | West Village | Manhattan | west_village
Row 5: east_village_les | East Village / LES | Manhattan | east_village, lower_east_side, east_village_les, bowery
...
```

### Stop Roles Sheet
```
Row 1: ⬡  STOP ROLES
Row 2: DB column: stop_roles | DB type: text[]
Row 3: Value | Description | Notes | Serves As
Row 4: opener | Warm-up: cocktail bar, aperitivo... | Composer role | opener
Row 5: main | Anchor: dinner, headline experience... | Composer role | main
Row 6: closer | Wind-down: late bar, dessert spot... | Composer role | closer
Row 7: drinks | Bar flexible as opener or closer | Maps to opener+closer | opener, closer
Row 8: activity | Experience-based stop | Maps to opener | opener
Row 9: coffee | Cafe or daytime stop | Maps to opener | opener
```

### Budget Tiers Sheet
```
Row 1: ⬡  BUDGET TIERS
Row 2: Maps questionnaire budget selection → price_tier matching (15% weight)
Row 3: Budget Slug | Display Label | Matches price_tier | Per-Person Estimate
Row 4: casual | Casual ($) | 1 | $15–$30
Row 5: nice_out | Nice Out ($$) | 2 | $35–$65
Row 6: splurge | Splurge ($$$) | 3 | $75–$150
Row 7: all_out | All Out ($$$$) | 4 | $150–$300
Row 8: no_preference | No Preference | 1, 2, 3, 4 | Any
```

### Occasion Tags Sheet
```
Row 1: ⬡  OCCASION TAGS
Row 2: DB column: occasion_tags | DB type: text[]
Row 3: Value | Description
Row 4: first_date | First date occasion
Row 5: dating | General dating
Row 6: couple | Established couple
Row 7: friends | Friends outing
Row 8: solo | Solo dining/activity
```

### Categories Sheet
```
Row 1: ⬡  CATEGORIES
Row 2: DB column: category | DB type: text
Row 3: Value | Description
Row 4: american | American cuisine
Row 5: italian | Italian cuisine
...
```

---

## Expected Generated Output Examples

### `src/config/generated/vibes.ts`
```typescript
// AUTO-GENERATED — DO NOT EDIT
// Source: docs/composer_venue_sheet_curated.xlsx
// Generated: 2026-04-17T...

export const VIBE_VENUE_TAGS: Record<string, string[]> = {
  food_forward: ["food_forward", "tasting", "dinner", "bistro"],
  drinks_led: ["cocktail_forward", "wine_bar", "speakeasy", "drinks"],
  activity_food: ["activity", "comedy", "karaoke", "games", "bowling"],
  walk_explore: ["walk", "gallery", "bookstore", "market", "park"],
  mix_it_up: [],
};

export const SCORED_VIBE_TAGS: string[] = [
  "food_forward",
  "dinner",
  "tasting",
  "bistro",
  "cocktail_forward",
  "wine_bar",
  "speakeasy",
  "drinks",
  "activity",
  "comedy",
  "karaoke",
  "games",
  "bowling",
  "walk",
  "gallery",
  "bookstore",
  "market",
  "park",
];

export const CROSS_CUTTING_VIBE_TAGS: string[] = [
  "romantic",
  "conversation_friendly",
  "group_friendly",
  "late_night",
  "casual",
  "upscale",
  "outdoor",
  "classic",
  "iykyk",
  "lunch",
  "cash_only",
  "reliable",
];
```

### `src/config/generated/neighborhoods.ts`
```typescript
// AUTO-GENERATED — DO NOT EDIT
// Source: docs/composer_venue_sheet_curated.xlsx

export const NEIGHBORHOOD_GROUPS: Record<string, { label: string; borough: string; slugs: string[] }> = {
  west_village: {
    label: "West Village",
    borough: "Manhattan",
    slugs: ["west_village"],
  },
  east_village_les: {
    label: "East Village / LES",
    borough: "Manhattan",
    slugs: ["east_village", "lower_east_side", "east_village_les", "bowery"],
  },
  chinatown_fidi: {
    label: "Chinatown / FiDi",
    borough: "Manhattan",
    slugs: ["chinatown", "fidi", "battery_park_city", "lower_manhattan"],
  },
  // ...
};

export const ALL_NEIGHBORHOODS: string[] = [
  "west_village",
  "greenwich_village",
  "east_village",
  "lower_east_side",
  // ... all 68+ slugs
];
```

### `src/config/generated/stop-roles.ts`
```typescript
// AUTO-GENERATED — DO NOT EDIT

export const ROLE_EXPANSION: Record<string, string[]> = {
  opener: ["opener"],
  main: ["main"],
  closer: ["closer"],
  drinks: ["opener", "closer"],
  activity: ["opener"],
  coffee: ["opener"],
};

export const ALL_STOP_ROLES: string[] = [
  "opener",
  "main",
  "closer",
  "drinks",
  "activity",
  "coffee",
];
```

---

## Files to Update After Generation

Once generated files exist, update these to import from them:

| File | What to change |
|------|----------------|
| `src/config/vibes.ts` | Import `VIBE_VENUE_TAGS`, `SCORED_VIBE_TAGS`, `CROSS_CUTTING_VIBE_TAGS` from `./generated/vibes` |
| `src/config/neighborhoods.ts` | Import `NEIGHBORHOOD_GROUPS`, `ALL_NEIGHBORHOODS` from `./generated/neighborhoods` |
| `src/config/occasions.ts` | Import `OCCASIONS` from `./generated/occasions` |
| `src/lib/scoring.ts` | Import `ROLE_EXPANSION` from `../config/generated/stop-roles` (or via re-export) |

---

## Summary

**Goal:** Sheet is single source of truth. Run one command, configs regenerate, commit, deploy. No manual code edits for config changes.

**Deliverables:**
1. `scripts/generate-configs.ts` — reads xlsx, writes TypeScript
2. `src/config/generated/*.ts` — generated config files
3. Updated existing config files to import from generated
4. `npm run generate-configs` script
5. Verification that import dry-run still passes
