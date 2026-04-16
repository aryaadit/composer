// Canonical list of neighborhoods Composer supports.
//
// This file defines TWO layers:
//
//   1. NEIGHBORHOODS — storage slugs. Each slug corresponds 1:1 with a value
//      in `composer_venues.neighborhood` in Supabase. Adding a venue in a
//      new neighborhood means adding a slug entry here.
//
//   2. NEIGHBORHOOD_GROUPS — user-facing pickers. Each group maps to one or
//      more storage slugs. The questionnaire and the onboarding favorites
//      picker show these ~14 groups, NOT the full ~68-slug list — the raw
//      slug count is too granular for a UX picker. Groups are expanded to
//      storage slugs before hitting the scoring logic.
//
// Slugs use snake_case throughout (storage slugs and group ids both).
// Slugs marked "(legacy)" in the label are preserved for backwards compat
// with already-saved itineraries and share URLs but should no longer be
// used for new venues.

export const NEIGHBORHOODS = [
  // ─── Downtown Manhattan ─────────────────────────────────────────────
  { slug: "west_village", label: "West Village", shortLabel: "West Village" },
  { slug: "greenwich_village", label: "Greenwich Village", shortLabel: "Greenwich Village" },
  { slug: "east_village", label: "East Village", shortLabel: "East Village" },
  { slug: "lower_east_side", label: "Lower East Side", shortLabel: "LES" },
  { slug: "east_village_les", label: "East Village / LES (legacy)", shortLabel: "E.V. / LES" },
  { slug: "bowery", label: "Bowery", shortLabel: "Bowery" },
  { slug: "soho_nolita", label: "SoHo / Nolita", shortLabel: "SoHo / Nolita" },
  { slug: "nolita", label: "Nolita", shortLabel: "Nolita" },
  { slug: "noho", label: "NoHo", shortLabel: "NoHo" },
  { slug: "tribeca", label: "Tribeca", shortLabel: "Tribeca" },
  { slug: "little_italy", label: "Little Italy", shortLabel: "Little Italy" },
  { slug: "hudson_square", label: "Hudson Square", shortLabel: "Hudson Square" },

  // ─── Flatiron / Midtown strip ───────────────────────────────────────
  { slug: "chelsea", label: "Chelsea", shortLabel: "Chelsea" },
  { slug: "flatiron", label: "Flatiron", shortLabel: "Flatiron" },
  { slug: "nomad", label: "NoMad", shortLabel: "NoMad" },
  { slug: "gramercy_kips_bay", label: "Gramercy / Kips Bay", shortLabel: "Gramercy" },
  { slug: "kips_bay", label: "Kips Bay", shortLabel: "Kips Bay" },
  { slug: "murray_hill", label: "Murray Hill", shortLabel: "Murray Hill" },
  { slug: "midtown", label: "Midtown", shortLabel: "Midtown" },
  { slug: "midtown_west", label: "Midtown West", shortLabel: "Midtown West" },
  { slug: "midtown_east", label: "Midtown East", shortLabel: "Midtown East" },
  { slug: "midtown_hells_kitchen", label: "Midtown / Hell's Kitchen (legacy)", shortLabel: "Midtown / HK" },
  { slug: "koreatown", label: "Koreatown", shortLabel: "Koreatown" },

  // ─── Downtown fringe ────────────────────────────────────────────────
  { slug: "chinatown", label: "Chinatown", shortLabel: "Chinatown" },
  { slug: "fidi", label: "Financial District", shortLabel: "FiDi" },
  { slug: "battery_park_city", label: "Battery Park City", shortLabel: "Battery Park" },

  // ─── Uptown Manhattan ───────────────────────────────────────────────
  { slug: "upper_west_side", label: "Upper West Side", shortLabel: "UWS" },
  { slug: "upper_east_side", label: "Upper East Side", shortLabel: "UES" },
  { slug: "harlem", label: "Harlem", shortLabel: "Harlem" },
  { slug: "west_harlem", label: "West Harlem", shortLabel: "West Harlem" },
  { slug: "washington_heights", label: "Washington Heights", shortLabel: "Wash. Heights" },

  // ─── North Brooklyn ─────────────────────────────────────────────────
  { slug: "williamsburg", label: "Williamsburg", shortLabel: "Williamsburg" },
  { slug: "greenpoint", label: "Greenpoint", shortLabel: "Greenpoint" },
  { slug: "east_williamsburg", label: "East Williamsburg", shortLabel: "E. Williamsburg" },

  // ─── Brownstone Brooklyn + south ────────────────────────────────────
  { slug: "dumbo", label: "DUMBO", shortLabel: "DUMBO" },
  { slug: "brooklyn_heights", label: "Brooklyn Heights", shortLabel: "Brooklyn Heights" },
  { slug: "fort_greene", label: "Fort Greene", shortLabel: "Fort Greene" },
  { slug: "clinton_hill", label: "Clinton Hill", shortLabel: "Clinton Hill" },
  { slug: "cobble_hill", label: "Cobble Hill", shortLabel: "Cobble Hill" },
  { slug: "carroll_gardens", label: "Carroll Gardens", shortLabel: "Carroll Gardens" },
  { slug: "gowanus", label: "Gowanus", shortLabel: "Gowanus" },
  { slug: "red_hook", label: "Red Hook", shortLabel: "Red Hook" },
  { slug: "park_slope", label: "Park Slope", shortLabel: "Park Slope" },
  { slug: "prospect_heights", label: "Prospect Heights", shortLabel: "Prospect Heights" },
  { slug: "prospect_lefferts", label: "Prospect-Lefferts Gardens", shortLabel: "PLG" },
  { slug: "crown_heights", label: "Crown Heights", shortLabel: "Crown Heights" },
  { slug: "bed_stuy", label: "Bed-Stuy", shortLabel: "Bed-Stuy" },
  { slug: "flatbush_plg", label: "Flatbush", shortLabel: "Flatbush" },
  { slug: "sunset_park", label: "Sunset Park", shortLabel: "Sunset Park" },
  { slug: "gravesend", label: "Gravesend", shortLabel: "Gravesend" },
  { slug: "sheepshead_bay", label: "Sheepshead Bay", shortLabel: "Sheepshead Bay" },
  { slug: "columbia_waterfront", label: "Columbia Waterfront", shortLabel: "Columbia Waterfront" },

  // ─── Queens ─────────────────────────────────────────────────────────
  { slug: "astoria", label: "Astoria", shortLabel: "Astoria" },
  { slug: "long_island_city", label: "Long Island City", shortLabel: "LIC" },
  { slug: "sunnyside", label: "Sunnyside", shortLabel: "Sunnyside" },
  { slug: "jackson_heights", label: "Jackson Heights", shortLabel: "Jackson Heights" },
  { slug: "flushing", label: "Flushing", shortLabel: "Flushing" },
  { slug: "ridgewood", label: "Ridgewood", shortLabel: "Ridgewood" },
  { slug: "howard_beach", label: "Howard Beach", shortLabel: "Howard Beach" },
  { slug: "south_ozone_park", label: "South Ozone Park", shortLabel: "S. Ozone Park" },

  // ─── Bronx + Staten Island ──────────────────────────────────────────
  { slug: "arthur_avenue", label: "Arthur Avenue", shortLabel: "Arthur Ave" },
  { slug: "bronx", label: "The Bronx", shortLabel: "Bronx" },
  { slug: "bronx_fordham", label: "Bronx (Fordham)", shortLabel: "Fordham" },
  { slug: "bronx_concourse", label: "Bronx (Concourse)", shortLabel: "Concourse" },
  { slug: "mott_haven", label: "Mott Haven", shortLabel: "Mott Haven" },
  { slug: "staten_island", label: "Staten Island", shortLabel: "Staten Island" },
  { slug: "stapleton_heights", label: "Stapleton Heights", shortLabel: "Stapleton Heights" },
  { slug: "city_island", label: "City Island", shortLabel: "City Island" },
] as const;

export type NeighborhoodSlug = (typeof NEIGHBORHOODS)[number]["slug"];

export const NEIGHBORHOOD_LABELS: Record<NeighborhoodSlug, string> = Object.fromEntries(
  NEIGHBORHOODS.map((n) => [n.slug, n.label])
) as Record<NeighborhoodSlug, string>;

export function neighborhoodLabel(slug: string): string {
  return (NEIGHBORHOOD_LABELS as Record<string, string>)[slug] ?? slug;
}

// ═══════════════════════════════════════════════════════════════════════
// User-facing groups for the questionnaire + onboarding pickers.
//
// Each group maps to one or more storage slugs. When the user picks a
// group, QuestionnaireShell expands to the underlying slugs before
// dispatching into state. The scoring logic only ever sees storage slugs.
// ═══════════════════════════════════════════════════════════════════════

export type Borough = "manhattan" | "brooklyn" | "outer";

export const BOROUGH_LABELS: Record<Borough, string> = {
  manhattan: "Manhattan",
  brooklyn: "Brooklyn",
  outer: "Outer Boroughs",
};

// Order of sections in the picker UI.
export const BOROUGH_ORDER: readonly Borough[] = ["manhattan", "brooklyn", "outer"];

interface NeighborhoodGroupDef {
  readonly id: string;
  readonly label: string;
  readonly borough: Borough;
  readonly slugs: readonly NeighborhoodSlug[];
}

export const NEIGHBORHOOD_GROUPS = [
  {
    id: "west_village",
    label: "West Village",
    borough: "manhattan",
    slugs: ["west_village"],
  },
  {
    id: "greenwich_village",
    label: "Greenwich Village",
    borough: "manhattan",
    slugs: ["greenwich_village"],
  },
  {
    id: "east_village_les",
    label: "East Village / LES",
    borough: "manhattan",
    slugs: ["east_village", "lower_east_side", "east_village_les", "bowery"],
  },
  {
    id: "soho_nolita_tribeca",
    label: "SoHo / Nolita / Tribeca",
    borough: "manhattan",
    slugs: ["soho_nolita", "nolita", "noho", "tribeca", "little_italy", "hudson_square"],
  },
  {
    id: "chelsea_flatiron",
    label: "Chelsea / Flatiron",
    borough: "manhattan",
    slugs: ["chelsea", "flatiron", "nomad", "gramercy_kips_bay", "kips_bay", "murray_hill"],
  },
  {
    id: "midtown_hk",
    label: "Midtown / Hell's Kitchen",
    borough: "manhattan",
    slugs: ["midtown", "midtown_west", "midtown_east", "midtown_hells_kitchen", "koreatown"],
  },
  {
    id: "chinatown_fidi",
    label: "Chinatown / FiDi",
    borough: "manhattan",
    slugs: ["chinatown", "fidi", "battery_park_city"],
  },
  {
    id: "upper_west_side",
    label: "Upper West Side",
    borough: "manhattan",
    slugs: ["upper_west_side"],
  },
  {
    id: "upper_east_side",
    label: "Upper East Side",
    borough: "manhattan",
    slugs: ["upper_east_side"],
  },
  {
    id: "harlem_uptown",
    label: "Harlem / Washington Heights",
    borough: "manhattan",
    slugs: ["harlem", "west_harlem", "washington_heights"],
  },
  {
    id: "williamsburg_greenpoint",
    label: "Williamsburg / Greenpoint",
    borough: "brooklyn",
    slugs: ["williamsburg", "greenpoint", "east_williamsburg"],
  },
  {
    id: "brooklyn",
    label: "DUMBO / Brooklyn",
    borough: "brooklyn",
    slugs: [
      "dumbo",
      "brooklyn_heights",
      "fort_greene",
      "clinton_hill",
      "cobble_hill",
      "carroll_gardens",
      "gowanus",
      "red_hook",
      "park_slope",
      "prospect_heights",
      "prospect_lefferts",
      "crown_heights",
      "bed_stuy",
      "flatbush_plg",
      "sunset_park",
      "gravesend",
      "sheepshead_bay",
      "columbia_waterfront",
    ],
  },
  {
    id: "outer_boroughs",
    label: "Queens / Bronx / SI",
    borough: "outer",
    slugs: [
      "astoria",
      "long_island_city",
      "sunnyside",
      "jackson_heights",
      "flushing",
      "ridgewood",
      "howard_beach",
      "south_ozone_park",
      "arthur_avenue",
      "bronx",
      "bronx_fordham",
      "bronx_concourse",
      "mott_haven",
      "staten_island",
      "stapleton_heights",
      "city_island",
    ],
  },
] as const satisfies readonly NeighborhoodGroupDef[];

export type NeighborhoodGroupId = (typeof NEIGHBORHOOD_GROUPS)[number]["id"];

/** Expand a group id to its underlying storage slugs. */
export function expandNeighborhoodGroup(id: string): NeighborhoodSlug[] {
  const group = NEIGHBORHOOD_GROUPS.find((g) => g.id === id);
  return group ? [...group.slugs] : [];
}

/**
 * Reverse-derive which groups are "selected" given a slug list. A group is
 * selected if ANY of its member slugs appears in the list. Used by the
 * questionnaire's back-nav so a user returning to the neighborhood step
 * sees their groups still marked.
 */
export function deriveGroupIds(slugs: readonly string[]): NeighborhoodGroupId[] {
  const slugSet = new Set(slugs);
  return NEIGHBORHOOD_GROUPS.filter((g) =>
    g.slugs.some((s) => slugSet.has(s))
  ).map((g) => g.id);
}
