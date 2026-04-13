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
//      picker show these ~11 groups, NOT the full ~68-slug list — the raw
//      slug count is too granular for a UX picker. Groups are expanded to
//      storage slugs before hitting the scoring logic.
//
// Adopted from Reid's spreadsheet v1.1 audit (2026-04-13). Slugs marked
// "(legacy)" are preserved for backwards compat with already-saved
// itineraries and share URLs but should no longer be used for new venues.

export const NEIGHBORHOODS = [
  // ─── Downtown Manhattan ─────────────────────────────────────────────
  { slug: "west-village", label: "West Village", shortLabel: "West Village" },
  { slug: "greenwich-village", label: "Greenwich Village", shortLabel: "Greenwich Village" },
  { slug: "east-village", label: "East Village", shortLabel: "East Village" },
  { slug: "lower-east-side", label: "Lower East Side", shortLabel: "LES" },
  { slug: "east-village-les", label: "East Village / LES (legacy)", shortLabel: "E.V. / LES" },
  { slug: "bowery", label: "Bowery", shortLabel: "Bowery" },
  { slug: "soho-nolita", label: "SoHo / Nolita", shortLabel: "SoHo / Nolita" },
  { slug: "nolita", label: "Nolita", shortLabel: "Nolita" },
  { slug: "noho", label: "NoHo", shortLabel: "NoHo" },
  { slug: "tribeca", label: "Tribeca", shortLabel: "Tribeca" },
  { slug: "little-italy", label: "Little Italy", shortLabel: "Little Italy" },
  { slug: "hudson-square", label: "Hudson Square", shortLabel: "Hudson Square" },

  // ─── Flatiron / Midtown strip ───────────────────────────────────────
  { slug: "chelsea", label: "Chelsea", shortLabel: "Chelsea" },
  { slug: "flatiron", label: "Flatiron", shortLabel: "Flatiron" },
  { slug: "nomad", label: "NoMad", shortLabel: "NoMad" },
  { slug: "gramercy-kips-bay", label: "Gramercy / Kips Bay", shortLabel: "Gramercy" },
  { slug: "kips-bay", label: "Kips Bay", shortLabel: "Kips Bay" },
  { slug: "murray-hill", label: "Murray Hill", shortLabel: "Murray Hill" },
  { slug: "midtown", label: "Midtown", shortLabel: "Midtown" },
  { slug: "midtown-west", label: "Midtown West", shortLabel: "Midtown West" },
  { slug: "midtown-east", label: "Midtown East", shortLabel: "Midtown East" },
  { slug: "midtown-hells-kitchen", label: "Midtown / Hell's Kitchen (legacy)", shortLabel: "Midtown / HK" },
  { slug: "koreatown", label: "Koreatown", shortLabel: "Koreatown" },

  // ─── Downtown fringe ────────────────────────────────────────────────
  { slug: "chinatown", label: "Chinatown", shortLabel: "Chinatown" },
  { slug: "fidi", label: "Financial District", shortLabel: "FiDi" },
  { slug: "battery-park-city", label: "Battery Park City", shortLabel: "Battery Park" },

  // ─── Uptown Manhattan ───────────────────────────────────────────────
  { slug: "upper-west-side", label: "Upper West Side", shortLabel: "UWS" },
  { slug: "upper-east-side", label: "Upper East Side", shortLabel: "UES" },
  { slug: "harlem", label: "Harlem", shortLabel: "Harlem" },
  { slug: "west-harlem", label: "West Harlem", shortLabel: "West Harlem" },
  { slug: "washington-heights", label: "Washington Heights", shortLabel: "Wash. Heights" },

  // ─── North Brooklyn ─────────────────────────────────────────────────
  { slug: "williamsburg", label: "Williamsburg", shortLabel: "Williamsburg" },
  { slug: "greenpoint", label: "Greenpoint", shortLabel: "Greenpoint" },
  { slug: "east-williamsburg", label: "East Williamsburg", shortLabel: "E. Williamsburg" },

  // ─── Brownstone Brooklyn + south ────────────────────────────────────
  { slug: "dumbo", label: "DUMBO", shortLabel: "DUMBO" },
  { slug: "brooklyn-heights", label: "Brooklyn Heights", shortLabel: "Brooklyn Heights" },
  { slug: "fort-greene", label: "Fort Greene", shortLabel: "Fort Greene" },
  { slug: "clinton-hill", label: "Clinton Hill", shortLabel: "Clinton Hill" },
  { slug: "cobble-hill", label: "Cobble Hill", shortLabel: "Cobble Hill" },
  { slug: "carroll-gardens", label: "Carroll Gardens", shortLabel: "Carroll Gardens" },
  { slug: "gowanus", label: "Gowanus", shortLabel: "Gowanus" },
  { slug: "red-hook", label: "Red Hook", shortLabel: "Red Hook" },
  { slug: "park-slope", label: "Park Slope", shortLabel: "Park Slope" },
  { slug: "prospect-heights", label: "Prospect Heights", shortLabel: "Prospect Heights" },
  { slug: "prospect-lefferts", label: "Prospect-Lefferts Gardens", shortLabel: "PLG" },
  { slug: "crown-heights", label: "Crown Heights", shortLabel: "Crown Heights" },
  { slug: "bed-stuy", label: "Bed-Stuy", shortLabel: "Bed-Stuy" },
  { slug: "flatbush-plg", label: "Flatbush", shortLabel: "Flatbush" },
  { slug: "sunset-park", label: "Sunset Park", shortLabel: "Sunset Park" },
  { slug: "gravesend", label: "Gravesend", shortLabel: "Gravesend" },
  { slug: "sheepshead-bay", label: "Sheepshead Bay", shortLabel: "Sheepshead Bay" },
  { slug: "columbia-waterfront", label: "Columbia Waterfront", shortLabel: "Columbia Waterfront" },

  // ─── Queens ─────────────────────────────────────────────────────────
  { slug: "astoria", label: "Astoria", shortLabel: "Astoria" },
  { slug: "long-island-city", label: "Long Island City", shortLabel: "LIC" },
  { slug: "sunnyside", label: "Sunnyside", shortLabel: "Sunnyside" },
  { slug: "jackson-heights", label: "Jackson Heights", shortLabel: "Jackson Heights" },
  { slug: "flushing", label: "Flushing", shortLabel: "Flushing" },
  { slug: "ridgewood", label: "Ridgewood", shortLabel: "Ridgewood" },
  { slug: "howard-beach", label: "Howard Beach", shortLabel: "Howard Beach" },
  { slug: "south-ozone-park", label: "South Ozone Park", shortLabel: "S. Ozone Park" },

  // ─── Bronx + Staten Island ──────────────────────────────────────────
  { slug: "arthur-avenue", label: "Arthur Avenue", shortLabel: "Arthur Ave" },
  { slug: "bronx", label: "The Bronx", shortLabel: "Bronx" },
  { slug: "bronx-fordham", label: "Bronx (Fordham)", shortLabel: "Fordham" },
  { slug: "bronx-concourse", label: "Bronx (Concourse)", shortLabel: "Concourse" },
  { slug: "mott-haven", label: "Mott Haven", shortLabel: "Mott Haven" },
  { slug: "staten-island", label: "Staten Island", shortLabel: "Staten Island" },
  { slug: "stapleton-heights", label: "Stapleton Heights", shortLabel: "Stapleton Heights" },
  { slug: "city-island", label: "City Island", shortLabel: "City Island" },
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

interface NeighborhoodGroupDef {
  readonly id: string;
  readonly label: string;
  readonly slugs: readonly NeighborhoodSlug[];
}

export const NEIGHBORHOOD_GROUPS = [
  {
    id: "west-village",
    label: "West Village",
    slugs: ["west-village"],
  },
  {
    id: "greenwich-village",
    label: "Greenwich Village",
    slugs: ["greenwich-village"],
  },
  {
    id: "east-village-les",
    label: "East Village / LES",
    slugs: ["east-village", "lower-east-side", "east-village-les", "bowery"],
  },
  {
    id: "soho-nolita-tribeca",
    label: "SoHo / Nolita / Tribeca",
    slugs: ["soho-nolita", "nolita", "noho", "tribeca", "little-italy", "hudson-square"],
  },
  {
    id: "chelsea-flatiron",
    label: "Chelsea / Flatiron",
    slugs: ["chelsea", "flatiron", "nomad", "gramercy-kips-bay", "kips-bay", "murray-hill"],
  },
  {
    id: "midtown-hk",
    label: "Midtown / Hell's Kitchen",
    slugs: ["midtown", "midtown-west", "midtown-east", "midtown-hells-kitchen", "koreatown"],
  },
  {
    id: "chinatown-fidi",
    label: "Chinatown / FiDi",
    slugs: ["chinatown", "fidi", "battery-park-city"],
  },
  {
    id: "uptown",
    label: "UWS / UES / Harlem",
    slugs: ["upper-west-side", "upper-east-side", "harlem", "west-harlem", "washington-heights"],
  },
  {
    id: "williamsburg-greenpoint",
    label: "Williamsburg / Greenpoint",
    slugs: ["williamsburg", "greenpoint", "east-williamsburg"],
  },
  {
    id: "brooklyn",
    label: "DUMBO / Brooklyn",
    slugs: [
      "dumbo",
      "brooklyn-heights",
      "fort-greene",
      "clinton-hill",
      "cobble-hill",
      "carroll-gardens",
      "gowanus",
      "red-hook",
      "park-slope",
      "prospect-heights",
      "prospect-lefferts",
      "crown-heights",
      "bed-stuy",
      "flatbush-plg",
      "sunset-park",
      "gravesend",
      "sheepshead-bay",
      "columbia-waterfront",
    ],
  },
  {
    id: "outer-boroughs",
    label: "Queens / Bronx / SI",
    slugs: [
      "astoria",
      "long-island-city",
      "sunnyside",
      "jackson-heights",
      "flushing",
      "ridgewood",
      "howard-beach",
      "south-ozone-park",
      "arthur-avenue",
      "bronx",
      "bronx-fordham",
      "bronx-concourse",
      "mott-haven",
      "staten-island",
      "stapleton-heights",
      "city-island",
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
