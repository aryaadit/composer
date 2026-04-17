// Canonical list of occasion tags.
//
// Five values, snake_case, matching the venue sheet taxonomy. These are
// the slugs stored in `composer_venues.occasion_tags` and matched by
// `scoreVenue()` in `lib/scoring.ts`.

export const OCCASIONS = [
  { slug: "first_date", label: "First Date" },
  { slug: "dating", label: "Dating" },
  { slug: "couple", label: "Couple" },
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
