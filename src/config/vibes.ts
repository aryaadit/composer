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
// Display label overrides. The generated labels come from the sheet's
// Vibe Scoring Matrix tab; these override for questionnaire copy clarity.
const VIBE_LABEL_OVERRIDES: Record<string, string> = {
  food_forward: "Meal",
  drinks_led: "Drinks",
};

const VIBE_DESCRIPTIONS: Record<string, string> = {
  food_forward: "A great meal anchors it all",
  drinks_led: "Bars and cocktails are the focus",
};

// Phase 7: `mix_it_up` (Variety) dropped from the questionnaire.
// 2026-06-13: `activity_food` (Activity) also dropped; the focus
// taxonomy collapsed to Meal vs Drinks, and the composer no longer
// has a third shape to drive activity-led nights. The generated
// source still includes both — we filter here at the consumer layer
// so `npm run generate-configs` doesn't have to re-clean. Old saved
// itineraries with either slug still render: the lookup falls through
// gracefully (vibeLabel returns "" for unknown slugs; scoring uses
// `vibeMixItUpBaseline` as the defensive empty-tag baseline). The
// Google Sheet should be updated to drop the rows at the next
// opportunity for cross-consumer consistency.
const DROPPED_VIBES: ReadonlySet<string> = new Set([
  "mix_it_up",
  "activity_food",
]);

// Vibe slugs match the sheet's Vibe Scoring Matrix keys (snake_case),
// minus the user-facing drops above.
const VIBE_KEYS = (Object.keys(GEN_TAGS) as (keyof typeof GEN_TAGS)[])
  .filter((k) => !DROPPED_VIBES.has(k as string));

export const VIBES = VIBE_KEYS.map((key) => ({
  slug: key,
  label: VIBE_LABEL_OVERRIDES[key] ?? GEN_LABELS[key] ?? key,
  description: VIBE_DESCRIPTIONS[key] ?? "",
  venueTags: GEN_TAGS[key] ?? [],
}));

// `VibeSlug` narrows the generated key union by the same dropped set
// so consumers (composer, scoring, templates) can't accidentally
// reference mix_it_up or activity_food at the type level.
export type VibeSlug = Exclude<
  keyof typeof GEN_TAGS,
  "mix_it_up" | "activity_food"
>;

export const VIBE_LABELS: Record<string, string> = Object.fromEntries(
  VIBES.map((v) => [v.slug, v.label])
);

// slug → canonical venue tag array for the scoring inner loop.
export const VIBE_VENUE_TAGS: Record<string, readonly string[]> = Object.fromEntries(
  VIBES.map((v) => [v.slug, v.venueTags])
);

/**
 * Display label for a vibe slug. Returns "" for unknown slugs (e.g.
 * legacy `mix_it_up` on a saved itinerary post-Phase-7) so callers
 * that `.filter(Boolean)` the resulting label array omit the chip
 * gracefully instead of rendering the raw slug.
 */
export function vibeLabel(slug: string): string {
  return VIBE_LABELS[slug] ?? "";
}

// Alcohol tags — derived from the drinks_led vibe. Used by the API
// route to drop alcohol venues when profile.drinks === "no".
export const ALCOHOL_VIBE_TAGS: ReadonlySet<string> = new Set(
  VIBES.find((v) => v.slug === "drinks_led")?.venueTags ?? []
);

// Bar taxonomy — the three sets below are the single source of truth
// for the Drinks-path "is this venue a bar?" predicate in
// src/lib/composer.ts (isBarEligible). Co-located with the rest of
// the drinks vocabulary so future tweaks (a new bar category, a
// google_type rename, an added cocktail-forward synonym) land in
// ONE module. Every value below is confirmed against active venue
// rows.

// Categories that ARE bars by category alone — the fast path of
// bar eligibility. A venue with category in this set qualifies as
// long as it's in the stop1 pool.
export const DRINKING_CATEGORIES: ReadonlySet<string> = new Set([
  "bar",
  "wine_bar",
  "speakeasy",
  "rooftop_bar",
]);

// google_types values that flag a venue as a real bar at the Google
// Places level. Used by the recovery path so food-categorized venues
// that are actually pochas/pubs/cocktail dens (e.g. Pocha 32 —
// category 'korean', google_types include 'pub','bar') still qualify
// for Drinks-night composition.
export const GOOGLE_BAR_TYPES: ReadonlySet<string> = new Set([
  "bar",
  "night_club",
  "pub",
  "wine_bar",
]);

// Vibe tags that mark a venue as drinks-forward at the curation
// level. The recovery path requires BOTH a google bar signal AND
// one of these vibe tags so a BBQ restaurant with google_types
// including 'bar' (e.g. miss KOREA BBQ) does not qualify on the
// google signal alone — the founders' curated vibe tagging stays
// load-bearing.
export const DRINK_VIBE_TAGS: ReadonlySet<string> = new Set([
  "drinks",
  "cocktail_forward",
]);

// Cross-cutting tags — from the sheet's Vibe Tags tab.
export const CROSS_CUTTING_VIBE_TAGS: readonly string[] = GEN_CROSS_CUTTING;

export type CrossCuttingVibeTag = string;

export const CROSS_CUTTING_TAG_SET: ReadonlySet<string> = new Set(GEN_CROSS_CUTTING);

// Union of all canonical tags (scored + cross-cutting).
export const ALL_CANONICAL_VIBE_TAGS: ReadonlySet<string> = new Set([
  ...GEN_SCORED,
  ...GEN_CROSS_CUTTING,
]);
