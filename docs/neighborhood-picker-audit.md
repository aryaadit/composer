# Neighborhood Picker Audit

**Date:** 2026-04-27
**Context:** Tracing the bug where user picks 3 neighborhood groups but the itinerary header shows 8 expanded slugs.

---

## The Three Neighborhood Pickers

### 1. Onboarding — OnboardingFlow.tsx (Step 3)

- **File:** `src/components/onboarding/OnboardingFlow.tsx`
- **Component:** Shared `NeighborhoodPicker` from `@/components/shared/NeighborhoodPicker.tsx`
- **Options shown:** NEIGHBORHOOD_GROUPS keys (~13 groups, flat list, `groupByBorough={false}`)
- **Output shape:** Array of **group IDs** (e.g., `["west_village", "east_village_les"]`)
- **Stored to:** `composer_users.favorite_hoods` as group IDs
- **Cap:** None — no `maxSelections` prop passed
- **Expansion:** None needed at this stage — stores group IDs for later prefill

### 2. Profile Page — AccountDetails.tsx (HoodsField)

- **File:** `src/app/profile/_components/AccountDetails.tsx` (lines 184–237)
- **Component:** **Standalone inline UI** — does NOT use shared `NeighborhoodPicker`
- **Options shown:** `FAVORITE_HOODS` keys from `config/onboarding.ts` (same group IDs as onboarding)
- **Output shape:** Array of **group IDs**
- **Stored to:** `composer_users.favorite_hoods` as group IDs
- **Cap:** None
- **Expansion:** None

### 3. Questionnaire — NeighborhoodStep.tsx + QuestionnaireShell.tsx

- **File:** `src/components/questionnaire/NeighborhoodStep.tsx`
- **Component:** Shared `NeighborhoodPicker` with `maxSelections={MAX_HOODS}`, `groupByBorough={true}`
- **Options shown:** NEIGHBORHOOD_GROUPS keys (~13 groups, organized by borough)
- **Output shape:** Array of **expanded storage slugs** (e.g., `["east_village", "lower_east_side", "bowery"]`)
- **Cap:** MAX_HOODS = 3 (limits **group** selections, not slug count)
- **Expansion:** Happens in `QuestionnaireShell.tsx` lines 132–145 via `handleNeighborhoodContinue`:

```typescript
const handleNeighborhoodContinue = useCallback((groupIds: string[]) => {
  const expanded = Array.from(
    new Set(groupIds.flatMap((id) => expandNeighborhoodGroup(id)))
  ) as Neighborhood[];
  dispatch({
    type: "SET_FIELD",
    field: "neighborhoods",
    value: expanded,
    advance: true,
  });
}, []);
```

- **Back-navigation:** Uses `deriveGroupIds()` to reverse-map expanded slugs back to group IDs when user navigates back to the step.

---

## Comparison Table

| Aspect | Onboarding | Profile | Questionnaire |
|--------|-----------|---------|---------------|
| File | OnboardingFlow.tsx | AccountDetails.tsx | NeighborhoodStep.tsx |
| Shared component? | Yes (NeighborhoodPicker) | **No** (standalone) | Yes (NeighborhoodPicker) |
| Options shown | Group IDs (flat) | Group IDs (flat) | Group IDs (by borough) |
| Data stored | Group IDs | Group IDs | **Expanded slugs** |
| Cap | None | None | 3 groups |
| Expansion | None | None | `expandNeighborhoodGroup()` |

---

## Key Functions

### `expandNeighborhoodGroup(id)` — `src/config/neighborhoods.ts:88-91`

Converts a group ID to its constituent storage slugs:

```typescript
export function expandNeighborhoodGroup(id: string): string[] {
  const group = NEIGHBORHOOD_GROUPS.find((g) => g.id === id);
  return group ? [...group.slugs] : [];
}
```

Example: `"chelsea_flatiron"` → `["chelsea", "flatiron", "nomad", "gramercy", "murray_hill"]`

### `deriveGroupIds(slugs)` — `src/config/neighborhoods.ts:98-103`

Reverse-maps slugs back to group IDs (used when navigating back to neighborhood step):

```typescript
export function deriveGroupIds(slugs: string[]): string[] {
  // Returns all group IDs that contain ANY of the given slugs
}
```

---

## Assessment: Minor Drift

### Issues Found

1. **Profile page doesn't use shared NeighborhoodPicker.** It renders its own pill buttons in `AccountDetails.tsx`. Same data source (`FAVORITE_HOODS`), same output shape (group IDs), but independent UI code that could drift from the shared component.

2. **Questionnaire is the only caller that expands groups to slugs.** This is by design — onboarding and profile store group IDs (for prefill), the questionnaire expands them (for scoring). The shapes are intentionally different.

### The Original Bug

The header showing "8 slugs" instead of "3 group labels" is NOT a picker bug. The expansion in `handleNeighborhoodContinue` is working correctly — it expands for scoring. The bug is that the **header display** reads `inputs.neighborhoods` (expanded slugs) and renders them as labels, instead of showing the user-picked group labels.

### Recommended Fix

Thread the user-picked group IDs through the response so the header can render group labels. Two options:

**Option 1 (recommended): Store both at save time.**
Add `neighborhood_group_ids text[]` column to `composer_saved_itineraries`. Save both group IDs (for display) and expanded slugs (for scoring). Header reads group IDs.

**Option 2: Reverse-map at render time.**
Use `deriveGroupIds()` to map expanded slugs back to group labels. No schema change needed, but fragile if a slug appears in multiple groups.

### Profile Picker Drift

The standalone profile hood picker (`AccountDetails.tsx` HoodsField) could be replaced with the shared `NeighborhoodPicker`. Low priority — same behavior, just duplicated JSX. Worth doing in a cleanup pass but not blocking the header fix.

---

## Key Files

| File | Role |
|------|------|
| `src/components/shared/NeighborhoodPicker.tsx` | Shared pill-selection UI |
| `src/config/neighborhoods.ts` | `expandNeighborhoodGroup()`, `deriveGroupIds()`, `neighborhoodLabel()` |
| `src/config/generated/neighborhoods.ts` | `NEIGHBORHOOD_GROUPS` record (auto-generated) |
| `src/config/onboarding.ts` | `FAVORITE_HOODS` list (wraps NEIGHBORHOOD_GROUPS for onboarding/profile) |
| `src/components/questionnaire/NeighborhoodStep.tsx` | Questionnaire step wrapper |
| `src/components/questionnaire/QuestionnaireShell.tsx` | Contains `handleNeighborhoodContinue` expansion logic |
| `src/app/profile/_components/AccountDetails.tsx` | Standalone hood picker (lines 184–237) |
