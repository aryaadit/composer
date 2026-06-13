// AUTO-GENERATED — DO NOT EDIT
// Source: Google Sheet 1XEGDSlWU-mPBKZOIHYfi6MOWclB22_wLlM-ohX3kn9I
// Generated: 2026-06-13T10:24:20.846151+00:00

export interface NeighborhoodGroup {
  label: string;
  borough: string;
  slugs: string[];
  venueCount: number;
  /** Native composability per budget tier — count of distinct
   *  (main, stop1) pairs that satisfy ALL hard filters with NO
   *  relaxation, NO cascade, NO widening, NO degradation, for
   *  Friday evening (strictest common slot). Baked by
   *  scripts/native-composability.ts via generate-configs.py.
   *  Drives the visibility predicate in src/config/group-visibility.ts. */
  itinerariesByTier: {
    casual: number;
    nice_out: number;
    splurge: number;
  };
}

export const NEIGHBORHOOD_GROUPS: Record<string, NeighborhoodGroup> = {
  west_village: {
    label: "West Village",
    borough: "Manhattan",
    slugs: ["west_village"],
    venueCount: 127,
    itinerariesByTier: { casual: 182, nice_out: 2125, splurge: 2078 },
  },
  greenwich_village: {
    label: "Greenwich Village",
    borough: "Manhattan",
    slugs: ["greenwich_village"],
    venueCount: 31,
    itinerariesByTier: { casual: 2, nice_out: 68, splurge: 123 },
  },
  east_village_les: {
    label: "East Village / LES",
    borough: "Manhattan",
    slugs: ["east_village", "lower_east_side", "bowery"],
    venueCount: 219,
    itinerariesByTier: { casual: 690, nice_out: 6167, splurge: 3799 },
  },
  soho_nolita_tribeca: {
    label: "SoHo / Nolita / Tribeca",
    borough: "Manhattan",
    slugs: ["soho_nolita", "nolita", "noho", "tribeca", "little_italy", "hudson_square"],
    venueCount: 148,
    itinerariesByTier: { casual: 157, nice_out: 1219, splurge: 1478 },
  },
  chelsea: {
    label: "Chelsea",
    borough: "Manhattan",
    slugs: ["chelsea"],
    venueCount: 40,
    itinerariesByTier: { casual: 10, nice_out: 209, splurge: 206 },
  },
  flatiron_nomad: {
    label: "Flatiron / NoMad",
    borough: "Manhattan",
    slugs: ["flatiron", "nomad"],
    venueCount: 61,
    itinerariesByTier: { casual: 5, nice_out: 256, splurge: 554 },
  },
  gramercy_murray_hill: {
    label: "Gramercy / Murray Hill",
    borough: "Manhattan",
    slugs: ["gramercy", "murray_hill", "gramercy_kips_bay"],
    venueCount: 13,
    itinerariesByTier: { casual: 0, nice_out: 18, splurge: 31 },
  },
  midtown_west: {
    label: "Hell's Kitchen / Midtown West",
    borough: "Manhattan",
    slugs: ["midtown_west"],
    venueCount: 29,
    itinerariesByTier: { casual: 16, nice_out: 48, splurge: 55 },
  },
  midtown_east: {
    label: "Midtown East",
    borough: "Manhattan",
    slugs: ["midtown_east"],
    venueCount: 28,
    itinerariesByTier: { casual: 0, nice_out: 28, splurge: 55 },
  },
  koreatown: {
    label: "Koreatown",
    borough: "Manhattan",
    slugs: ["koreatown"],
    venueCount: 39,
    itinerariesByTier: { casual: 16, nice_out: 94, splurge: 51 },
  },
  chinatown: {
    label: "Chinatown",
    borough: "Manhattan",
    slugs: ["chinatown"],
    venueCount: 35,
    itinerariesByTier: { casual: 47, nice_out: 152, splurge: 49 },
  },
  fidi_lower_manhattan: {
    label: "FiDi / Lower Manhattan",
    borough: "Manhattan",
    slugs: ["fidi", "lower_manhattan", "battery_park_city"],
    venueCount: 25,
    itinerariesByTier: { casual: 4, nice_out: 83, splurge: 39 },
  },
  upper_west_side: {
    label: "Upper West Side",
    borough: "Manhattan",
    slugs: ["upper_west_side"],
    venueCount: 33,
    itinerariesByTier: { casual: 2, nice_out: 23, splurge: 12 },
  },
  upper_east_side: {
    label: "Upper East Side",
    borough: "Manhattan",
    slugs: ["upper_east_side"],
    venueCount: 26,
    itinerariesByTier: { casual: 0, nice_out: 7, splurge: 44 },
  },
  harlem_uptown: {
    label: "Harlem / Uptown",
    borough: "Manhattan",
    slugs: ["harlem", "washington_heights"],
    venueCount: 5,
    itinerariesByTier: { casual: 0, nice_out: 0, splurge: 0 },
  },
  williamsburg_greenpoint: {
    label: "Williamsburg / Greenpoint",
    borough: "Brooklyn",
    slugs: ["williamsburg", "greenpoint"],
    venueCount: 141,
    itinerariesByTier: { casual: 144, nice_out: 3055, splurge: 2603 },
  },
  east_williamsburg_bushwick: {
    label: "East Williamsburg / Bushwick",
    borough: "Brooklyn",
    slugs: ["east_williamsburg", "bushwick"],
    venueCount: 75,
    itinerariesByTier: { casual: 48, nice_out: 410, splurge: 218 },
  },
  dumbo_brooklyn_heights: {
    label: "DUMBO / Brooklyn Heights",
    borough: "Brooklyn",
    slugs: ["dumbo", "brooklyn_heights", "cobble_hill", "carroll_gardens"],
    venueCount: 51,
    itinerariesByTier: { casual: 8, nice_out: 180, splurge: 117 },
  },
  fort_greene_clinton_hill: {
    label: "Fort Greene / Clinton Hill",
    borough: "Brooklyn",
    slugs: ["fort_greene", "clinton_hill"],
    venueCount: 19,
    itinerariesByTier: { casual: 0, nice_out: 46, splurge: 54 },
  },
  park_slope_prospect: {
    label: "Park Slope / Prospect",
    borough: "Brooklyn",
    slugs: ["park_slope", "prospect_heights", "prospect_lefferts", "gowanus"],
    venueCount: 42,
    itinerariesByTier: { casual: 5, nice_out: 100, splurge: 96 },
  },
  bed_stuy_crown_heights: {
    label: "Bed-Stuy / Crown Heights",
    borough: "Brooklyn",
    slugs: ["bed_stuy", "crown_heights"],
    venueCount: 31,
    itinerariesByTier: { casual: 10, nice_out: 66, splurge: 21 },
  },
  south_brooklyn: {
    label: "South Brooklyn",
    borough: "Brooklyn",
    slugs: ["red_hook", "sunset_park", "columbia_waterfront", "sheepshead_bay", "gravesend"],
    venueCount: 16,
    itinerariesByTier: { casual: 0, nice_out: 5, splurge: 3 },
  },
  astoria_lic: {
    label: "Astoria / LIC",
    borough: "Queens",
    slugs: ["astoria", "long_island_city", "sunnyside"],
    venueCount: 36,
    itinerariesByTier: { casual: 0, nice_out: 30, splurge: 36 },
  },
  queens: {
    label: "Queens",
    borough: "Queens",
    slugs: ["flushing", "jackson_heights", "ridgewood", "howard_beach", "south_ozone_park", "queens"],
    venueCount: 25,
    itinerariesByTier: { casual: 0, nice_out: 2, splurge: 1 },
  },
  bronx_si: {
    label: "Bronx / Staten Island",
    borough: "Outer",
    slugs: ["bronx", "bronx_fordham", "bronx_concourse", "mott_haven", "arthur_avenue", "city_island", "staten_island", "stapleton_heights"],
    venueCount: 14,
    itinerariesByTier: { casual: 0, nice_out: 0, splurge: 0 },
  },
};

export const ALL_NEIGHBORHOODS: string[] = ["arthur_avenue", "astoria", "battery_park_city", "bed_stuy", "bowery", "bronx", "bronx_concourse", "bronx_fordham", "brooklyn_heights", "bushwick", "carroll_gardens", "chelsea", "chinatown", "city_island", "clinton_hill", "cobble_hill", "columbia_waterfront", "crown_heights", "dumbo", "east_village", "east_williamsburg", "fidi", "flatiron", "flushing", "fort_greene", "gowanus", "gramercy", "gravesend", "greenpoint", "greenwich_village", "harlem", "howard_beach", "hudson_square", "jackson_heights", "koreatown", "little_italy", "long_island_city", "lower_east_side", "lower_manhattan", "midtown_east", "midtown_west", "mott_haven", "murray_hill", "noho", "nolita", "nomad", "park_slope", "prospect_heights", "prospect_lefferts", "red_hook", "ridgewood", "sheepshead_bay", "soho_nolita", "south_ozone_park", "stapleton_heights", "staten_island", "sunnyside", "sunset_park", "tribeca", "upper_east_side", "upper_west_side", "washington_heights", "west_village", "williamsburg"];
export const BAKE_VERSION = "3a9f67ed58bd";
