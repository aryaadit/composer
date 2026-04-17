// Canonical vibe taxonomy.
//
// The VIBES array defines the questionnaire options (slug, label,
// description) and maps each to scoring tags via `venueTags`. Tag
// lists are imported from the generated config (driven by the Google
// Sheet's "Vibe Scoring Matrix" tab) so adding a tag to the sheet
// and re-running `generate-configs` is the only step needed.
//
// NOTE: Vibe slugs use hyphenated format (food-forward) for URL/
// questionnaire compat. The generated file uses snake_case keys
// (food_forward). The VIBES array maps between the two — if you
// add a new vibe, add it here AND in the sheet's scoring matrix.

import {
  VIBE_VENUE_TAGS as GEN_TAGS,
  SCORED_VIBE_TAGS as GEN_SCORED,
  CROSS_CUTTING_VIBE_TAGS as GEN_CROSS_CUTTING,
} from "./generated/vibes";

export const VIBES = [
  {
    slug: "food-forward",
    label: "Food-Forward",
    description: "The meal is the move",
    venueTags: GEN_TAGS.food_forward ?? [],
  },
  {
    slug: "drinks-led",
    label: "Drinks-Led",
    description: "Bars & cocktails",
    venueTags: GEN_TAGS.drinks_led ?? [],
  },
  {
    slug: "activity-food",
    label: "Activity + Food",
    description: "Do something first",
    venueTags: GEN_TAGS.activity_food ?? [],
  },
  {
    slug: "walk-explore",
    label: "Walk & Explore",
    description: "Wander the city",
    venueTags: GEN_TAGS.walk_explore ?? [],
  },
  {
    slug: "mix-it-up",
    label: "Mix It Up",
    description: "A bit of everything",
    venueTags: GEN_TAGS.mix_it_up ?? [],
  },
] as const;

export type VibeSlug = (typeof VIBES)[number]["slug"];

export const VIBE_LABELS: Record<VibeSlug, string> = Object.fromEntries(
  VIBES.map((v) => [v.slug, v.label])
) as Record<VibeSlug, string>;

// slug → canonical venue tag array for the scoring inner loop.
// Double cast needed because Object.fromEntries erases the key type.
export const VIBE_VENUE_TAGS: Record<VibeSlug, readonly string[]> = Object.fromEntries(
  VIBES.map((v) => [v.slug, v.venueTags])
) as unknown as Record<VibeSlug, readonly string[]>;

export function vibeLabel(slug: string): string {
  return (VIBE_LABELS as Record<string, string>)[slug] ?? slug;
}

// Alcohol tags — derived from the drinks-led vibe. Used by the API
// route to drop alcohol venues when profile.drinks === "no".
export const ALCOHOL_VIBE_TAGS: ReadonlySet<string> = new Set(
  VIBES.find((v) => v.slug === "drinks-led")?.venueTags ?? []
);

// Cross-cutting tags — from the sheet's Vibe Tags tab.
export const CROSS_CUTTING_VIBE_TAGS: readonly string[] = GEN_CROSS_CUTTING;

export type CrossCuttingVibeTag = string;

export const CROSS_CUTTING_TAG_SET: ReadonlySet<string> = new Set(GEN_CROSS_CUTTING);

// Union of all canonical tags (scored + cross-cutting).
export const ALL_CANONICAL_VIBE_TAGS: ReadonlySet<string> = new Set([
  ...GEN_SCORED,
  ...GEN_CROSS_CUTTING,
]);
