# Composer Coding Standards

These standards apply to every change in this codebase. Treat them as non-negotiable defaults — deviate only with an explicit, documented reason.

---

## 1. Single source of truth for shared values

Before writing any constant, label, range, taxonomy, or enum-like value: check if it (or something similar) already exists in a config/canonical module.

- **If yes:** import it.
- **If no, but the value is likely to be referenced from more than one file:** create the canonical module first, then consume it.

### Display formatting lives with the data

Display formatting (labels, short/long versions, icons, formatted ranges) lives alongside the data, not in components.

```ts
// ✅ Good — canonical module owns data + display
// src/lib/itinerary/time-blocks.ts
export const TIME_BLOCKS = [
  {
    id: 'evening',
    label: 'Evening',
    shortRange: '5p–10p',
    fullRange: '5:00 PM – 10:00 PM',
    range: { start: '17:00', end: '22:00' },
  },
  // ...
];

// Components import data + ready-to-render formats
import { TIME_BLOCKS } from '@/lib/itinerary/time-blocks';
```

```ts
// ❌ Bad — display strings hardcoded in component
// src/components/WhenStep.tsx
const blocks = [
  { id: 'evening', label: 'Evening', range: '5p–10p' },  // duplicates canonical data
];
```

### Refactor existing duplication in the same commit

If you find existing duplication while implementing a feature, refactor it in the same commit. Don't leave known duplication behind. Note the refactor in the commit message and PR description.

---

## 2. Components and patterns get extracted aggressively

If a UI element, helper function, or pattern is used in 2+ places — or is likely to be — extract it to a shared module.

Examples already established in this codebase:
- `NeighborhoodPicker` — shared component for neighborhood selection
- SVG assets in `assets/` — single source, no duplication

When in doubt, extract. The cost of an unnecessary extraction is low; the cost of duplicated logic that drifts is high.

---

## 3. Audit before adding

Before adding new constants, types, or components, run a grep:

```bash
grep -rn "concept_keyword" src/ --include="*.ts" --include="*.tsx"
```

If matches exist, decide:
- Refactor matches to use a new canonical module
- Extend the existing canonical module
- Document why this case is genuinely different (rare — usually it isn't)

---

## 4. Architecture-first mindset

When implementing a feature:

1. **Identify what's reusable.** Could this constant, helper, or component be needed elsewhere later? If yes, design for it now.
2. **Surface architectural concerns proactively.** If the prompt asks for X but X has a structural issue (e.g., introduces duplication, couples unrelated modules, hard-codes a value that should be config), flag it before writing code. Don't silently work around it.
3. **Prefer simple over clever.** A well-named constant in a config module beats a one-line abstraction. Don't over-engineer.

---

## 5. Single source of truth examples in this codebase

These are the canonical modules that should NOT be duplicated:

| Concept | Canonical Module | Notes |
|---|---|---|
| Time blocks (morning/afternoon/evening/late_night) | `src/lib/itinerary/time-blocks.ts` | Includes ranges, labels, defaults, isSlotInBlock helper |
| Neighborhoods | `NeighborhoodPicker` shared component | Used across questionnaire and itinerary views |
| Reservation platforms | `composer_venues.reservation_platform` enum | Adapter pattern in `src/lib/availability/` |
| Vibe tags / Stop roles | Google Sheets Master Reference → DB | Synced from sheet, do not hardcode |

When working in any of these areas, import. Do not redefine.

---

## 6. Display formatting helpers belong in the canonical module

If you need to format a canonical value for display (e.g., "Evening · 5p–10p"), add the formatter to the canonical module:

```ts
// In src/lib/itinerary/time-blocks.ts
export function formatBlockChipLabel(block: TimeBlock): string {
  const meta = getBlockMetadata(block);
  return `${meta.label} · ${meta.shortRange}`;
}
```

Don't compose display strings in components by interpolating individual fields. The format itself becomes a shared concern that should live with the data.

---

## 7. The smell test

If you find yourself doing any of the following, stop and refactor:

- Typing a string literal that exists elsewhere in the codebase
- Hardcoding a numeric range, threshold, or boundary in a component
- Copy-pasting a function or JSX block "with small modifications"
- Defining the same enum / union type in two files
- Embedding business logic (filtering, sorting, validation) inside a component when it could be a pure helper

Each of these is a signal that something belongs in a canonical module.

---

## 8. Reporting requirement

In every PR / commit report-back, include:

- **Files refactored to import from canonical modules** (list)
- **Existing duplications found but intentionally not refactored** (list, with reasoning)
- **New canonical modules created** (list, with brief description of what they own)

This makes architectural drift visible across changes, and makes it easy to audit later.
