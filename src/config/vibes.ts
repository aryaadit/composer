// Canonical vibe taxonomy — the single source of truth for the vibe concept.
//
// Each vibe has a slug (used in URLs + questionnaire values), a display label,
// a one-line description for the questionnaire card, and a `venueTags` array
// of canonical tags that `lib/scoring.ts` uses for exact-match scoring.
//
// Adding a new vibe means adding one entry here. Removing a vibe tag from an
// existing vibe's `venueTags` must be coordinated with the venue sheet and
// the scoring logic since they participate in the 35% weighted scoring tier.
//
// The vibe tags listed here are the "scored" canonical tags. Cross-cutting
// tags (`romantic`, `conversation_friendly`, `group_friendly`, `late_night`,
// `casual`, `upscale`, `outdoor`) are valid on venues but do not participate
// in vibe scoring.

export const VIBES = [
  {
    slug: "food-forward",
    label: "Food-Forward",
    description: "The meal is the move",
    venueTags: ["food_forward", "tasting", "dinner", "bistro"],
  },
  {
    slug: "drinks-led",
    label: "Drinks-Led",
    description: "Bars & cocktails",
    venueTags: ["cocktail_forward", "wine_bar", "speakeasy", "drinks"],
  },
  {
    slug: "activity-food",
    label: "Activity + Food",
    description: "Do something first",
    venueTags: ["activity", "comedy", "karaoke", "games", "bowling"],
  },
  {
    slug: "walk-explore",
    label: "Walk & Explore",
    description: "Wander the city",
    venueTags: ["walk", "gallery", "bookstore", "market", "park"],
  },
  {
    slug: "mix-it-up",
    label: "Mix It Up",
    description: "A bit of everything",
    venueTags: [] as readonly string[],
  },
] as const;

export type VibeSlug = (typeof VIBES)[number]["slug"];

export const VIBE_LABELS: Record<VibeSlug, string> = Object.fromEntries(
  VIBES.map((v) => [v.slug, v.label])
) as Record<VibeSlug, string>;

// slug → canonical venue tag array. Mirrors the previous `VIBE_TAGS` map that
// lived in `lib/scoring.ts`. Kept as a plain record for fast lookup in the
// scoring inner loop.
export const VIBE_VENUE_TAGS: Record<VibeSlug, readonly string[]> = Object.fromEntries(
  VIBES.map((v) => [v.slug, v.venueTags])
) as Record<VibeSlug, readonly string[]>;

export function vibeLabel(slug: string): string {
  return (VIBE_LABELS as Record<string, string>)[slug] ?? slug;
}

// Subset of canonical venue tags that imply alcohol. Derived from the
// `drinks-led` vibe so this list stays consistent if the taxonomy changes.
// Used by `/api/generate` to drop alcohol venues when `userPrefs.drinks === "no"`.
export const ALCOHOL_VIBE_TAGS: ReadonlySet<string> = new Set(
  VIBES.find((v) => v.slug === "drinks-led")?.venueTags ?? []
);
