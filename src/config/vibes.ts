// Canonical vibe taxonomy — the single source of truth for the vibe concept.
//
// Each vibe has a slug (used in URLs + questionnaire values), a display label,
// a one-line description for the questionnaire card, and a `venueTags` array
// of canonical tags that `lib/scoring.ts` uses for exact-match scoring.
//
// Adding a new vibe means adding one entry here. Removing a vibe tag from an
// existing vibe's `venueTags` must be coordinated with the venue sheet and
// the scoring logic since they participate in the 35% weighted scoring tier.

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

// ═══════════════════════════════════════════════════════════════════════
// Cross-cutting vibe tags — valid on venues but NOT scored by vibe matching.
//
// These are flavor/atmosphere descriptors that compose with the scored
// tags above. A venue can be tagged `romantic + food_forward + dinner`;
// the scorer only uses `food_forward, dinner` for vibe match, but the
// cross-cutting tags are still canonical and can drive future features
// (filters, display badges, Phase 2 semantic matching).
//
// `classic` was added (2026-04-13) to honor "timeless NYC institution"
// as a real taste signal — the audience specifically wants to take dates
// to classic spots (Keens, Balthazar, Blue Note, etc.).
//
// Any tag not in this set AND not in any vibe's `venueTags` array is a
// non-canonical tag. The import script normalizes Reid's rich 81-tag
// taxonomy down to the scored + cross-cutting canonical set; raw tags
// stay preserved in `venues.raw_vibe_tags` for Phase 2.
// ═══════════════════════════════════════════════════════════════════════
export const CROSS_CUTTING_VIBE_TAGS = [
  "romantic",
  "conversation_friendly",
  "group_friendly",
  "late_night",
  "casual",
  "upscale",
  "outdoor",
  "classic",
] as const;

export type CrossCuttingVibeTag = (typeof CROSS_CUTTING_VIBE_TAGS)[number];

export const CROSS_CUTTING_TAG_SET: ReadonlySet<string> = new Set(CROSS_CUTTING_VIBE_TAGS);

/**
 * Every canonical tag the scorer + cross-cutting layer recognizes. A venue
 * whose `vibe_tags` contains tags NOT in this union will score-poorly but
 * still be valid. The import script uses this to validate normalized tags.
 */
export const ALL_CANONICAL_VIBE_TAGS: ReadonlySet<string> = new Set([
  ...VIBES.flatMap((v) => v.venueTags),
  ...CROSS_CUTTING_VIBE_TAGS,
]);
