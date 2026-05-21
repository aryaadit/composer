// Canonical list of occasion tags — generated from the sheet's
// "Occasion Tags" tab. Run `python3 scripts/generate-configs.py`
// to regenerate after editing the sheet.
//
// The UI now offers 3 buckets (`date` / `friends` / `solo`) that fan
// out to these sheet slugs at the scoring boundary. `occasionLabel()`
// below renders both shapes — fresh bucket slugs from /compose and
// deprecated sheet slugs from saved itineraries written before the
// 2026-05-21 collapse.

import { OCCASIONS as GEN_OCCASIONS } from "./generated/occasions";

export type OccasionSlug = (typeof GEN_OCCASIONS)[number];

// Build label by converting slug: first_date → "First Date"
function slugToLabel(slug: string): string {
  return slug
    .split("_")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

export const OCCASIONS = GEN_OCCASIONS.map((slug) => ({
  slug,
  label: slugToLabel(slug),
}));

export const OCCASION_LABELS: Record<OccasionSlug, string> = Object.fromEntries(
  OCCASIONS.map((o) => [o.slug, o.label])
) as Record<OccasionSlug, string>;

// UI bucket → display label. These are the labels the questionnaire
// renders today; the bucket slugs live in `src/config/options.ts`.
export const OCCASION_BUCKET_LABELS: Record<string, string> = {
  date: "Date Night",
  friends: "Friends Night Out",
  solo: "Solo",
};

// Deprecated sheet-side slugs that may still appear in saved
// itineraries and legacy share links written before the 2026-05-21
// taxonomy collapse. Map each to the bucket it would land in today.
// Used by `occasionLabel()` below for display and by
// `decodeParamsToInputs()` in `lib/sharing.ts` to translate legacy
// share-URL `?occasion=...` values to the current bucket shape
// before they hit the scoring pipeline.
export const DEPRECATED_OCCASION_SLUG_TO_BUCKET: Record<string, string> = {
  relationship: "date",
  family: "friends",
  dating: "date",
  first_date: "date",
  couple: "date",
};

/**
 * Map an occasion slug (bucket or deprecated sheet slug) to a display
 * label.
 *
 * Lookup order:
 *   1. UI bucket label (`date` → "Date Night")
 *   2. Deprecated slug → bucket → bucket label (`relationship` → `date` → "Date Night")
 *   3. Sheet-slug label (`first_date` → "First Date") — covers any
 *      sheet slug that didn't land in DEPRECATED_OCCASION_SLUG_TO_BUCKET
 *   4. Raw slug as last resort
 */
export function occasionLabel(slug: string): string {
  if (OCCASION_BUCKET_LABELS[slug]) return OCCASION_BUCKET_LABELS[slug];
  const bucket = DEPRECATED_OCCASION_SLUG_TO_BUCKET[slug];
  if (bucket && OCCASION_BUCKET_LABELS[bucket]) {
    return OCCASION_BUCKET_LABELS[bucket];
  }
  return (OCCASION_LABELS as Record<string, string>)[slug] ?? slug;
}
