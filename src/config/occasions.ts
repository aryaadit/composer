// Canonical list of occasion tags — generated from the sheet's
// "Occasion Tags" tab. Run `python3 scripts/generate-configs.py`
// to regenerate after editing the sheet.

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

export function occasionLabel(slug: string): string {
  return (OCCASION_LABELS as Record<string, string>)[slug] ?? slug;
}
