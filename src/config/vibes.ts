// Canonical vibe taxonomy.
//
// The VIBES array defines the questionnaire options (slug, label,
// description) and maps each to scoring tags via `venueTags`. Tag
// lists are imported from the generated config (driven by the Google
// Sheet's "Vibe Scoring Matrix" tab) so adding a tag to the sheet
// and re-running `generate-configs` is the only step needed.
//
// Vibe slugs, labels, descriptions, and tag mappings. Tag lists are
// imported from the generated config (driven by the Google Sheet's
// "Vibe Scoring Matrix" tab). Adding a tag to the sheet and running
// `npm run generate-configs` is the only step needed.

import {
  VIBE_VENUE_TAGS as GEN_TAGS,
  VIBE_DISPLAY_LABELS as GEN_LABELS,
  SCORED_VIBE_TAGS as GEN_SCORED,
  CROSS_CUTTING_VIBE_TAGS as GEN_CROSS_CUTTING,
} from "./generated/vibes";

// Descriptions live here (not in the sheet) because they're UI copy,
// not scoring config. If a new vibe appears in the sheet without a
// description entry here, it renders with an empty description — add
// one when you see it.
const VIBE_DESCRIPTIONS: Record<string, string> = {
  food_forward: "The meal is the move",
  drinks_led: "Bars & cocktails",
  activity_food: "Do something first",
  walk_explore: "Wander the city",
  mix_it_up: "A bit of everything",
};

// Vibe slugs match the sheet's Vibe Scoring Matrix keys (snake_case).
const VIBE_KEYS = Object.keys(GEN_TAGS) as (keyof typeof GEN_TAGS)[];

export const VIBES = VIBE_KEYS.map((key) => ({
  slug: key,
  label: GEN_LABELS[key] ?? key,
  description: VIBE_DESCRIPTIONS[key] ?? "",
  venueTags: GEN_TAGS[key] ?? [],
}));

export type VibeSlug = keyof typeof GEN_TAGS;

export const VIBE_LABELS: Record<string, string> = Object.fromEntries(
  VIBES.map((v) => [v.slug, v.label])
);

// slug → canonical venue tag array for the scoring inner loop.
export const VIBE_VENUE_TAGS: Record<string, readonly string[]> = Object.fromEntries(
  VIBES.map((v) => [v.slug, v.venueTags])
);

export function vibeLabel(slug: string): string {
  return VIBE_LABELS[slug] ?? slug;
}

// Alcohol tags — derived from the drinks_led vibe. Used by the API
// route to drop alcohol venues when profile.drinks === "no".
export const ALCOHOL_VIBE_TAGS: ReadonlySet<string> = new Set(
  VIBES.find((v) => v.slug === "drinks_led")?.venueTags ?? []
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
