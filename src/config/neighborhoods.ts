// Canonical list of neighborhoods Composer supports.
//
// This is the single source of truth. Adding a neighborhood means adding
// one entry here and adding venues to the Supabase `composer_venues` table
// with the matching `neighborhood` slug. Everything else — the questionnaire
// pill picker, the onboarding favorites picker, the StopCard display label,
// and the TypeScript type — derives from this array.
//
// `label` is the full display form (e.g., card details, stats). `shortLabel`
// is the truncated form that fits a pill button.

export const NEIGHBORHOODS = [
  {
    slug: "west-village",
    label: "West Village",
    shortLabel: "West Village",
  },
  {
    slug: "east-village-les",
    label: "East Village / LES",
    shortLabel: "East Village / LES",
  },
  {
    slug: "soho-nolita",
    label: "SoHo / Nolita",
    shortLabel: "SoHo / Nolita",
  },
  {
    slug: "williamsburg",
    label: "Williamsburg",
    shortLabel: "Williamsburg",
  },
  {
    slug: "midtown-hells-kitchen",
    label: "Midtown / Hell's Kitchen",
    shortLabel: "Midtown / HK",
  },
  {
    slug: "upper-west-side",
    label: "Upper West Side",
    shortLabel: "Upper West Side",
  },
] as const;

export type NeighborhoodSlug = (typeof NEIGHBORHOODS)[number]["slug"];

export const NEIGHBORHOOD_LABELS: Record<NeighborhoodSlug, string> = Object.fromEntries(
  NEIGHBORHOODS.map((n) => [n.slug, n.label])
) as Record<NeighborhoodSlug, string>;

export function neighborhoodLabel(slug: string): string {
  return (NEIGHBORHOOD_LABELS as Record<string, string>)[slug] ?? slug;
}
