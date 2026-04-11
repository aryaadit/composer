// Canonical list of occasion tags.
//
// The taxonomy has six values (including `second-date`), even though the
// questionnaire groups `first-date` and `second-date` into a single "First /
// Second Date" card. That grouping is a UX decision made in `options.ts`; the
// full six-value taxonomy is preserved here so `second-date` remains a valid
// venue tag in the Supabase `composer_venues.occasion_tags` column.

export const OCCASIONS = [
  { slug: "first-date", label: "First Date" },
  { slug: "second-date", label: "Second Date" },
  { slug: "dating", label: "Dating" },
  { slug: "established", label: "Established" },
  { slug: "friends", label: "Friends Night" },
  { slug: "solo", label: "Solo" },
] as const;

export type OccasionSlug = (typeof OCCASIONS)[number]["slug"];

export const OCCASION_LABELS: Record<OccasionSlug, string> = Object.fromEntries(
  OCCASIONS.map((o) => [o.slug, o.label])
) as Record<OccasionSlug, string>;

export function occasionLabel(slug: string): string {
  return (OCCASION_LABELS as Record<string, string>)[slug] ?? slug;
}
