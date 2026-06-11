// AUTO-GENERATED — DO NOT EDIT
// Source: Google Sheet 1ZH8CniJglou0A72e7U4b3nvtsa7tDRVMIAzNqMqEck8
// Generated: 2026-06-11T18:28:52.002690+00:00

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
    venueCount: 128,
    itinerariesByTier: { casual: 80, nice_out: 1486, splurge: 1758 },
  },
  greenwich_village: {
    label: "Greenwich Village",
    borough: "Manhattan",
    slugs: ["greenwich_village"],
    venueCount: 31,
    itinerariesByTier: { casual: 2, nice_out: 60, splurge: 114 },
  },
  east_village_les: {
    label: "East Village / LES",
    borough: "Manhattan",
    slugs: ["east_village", "lower_east_side", "bowery"],
    venueCount: 220,
    itinerariesByTier: { casual: 296, nice_out: 3836, splurge: 2752 },
  },
  soho_nolita_tribeca: {
    label: "SoHo / Nolita / Tribeca",
    borough: "Manhattan",
    slugs: ["soho_nolita", "nolita", "noho", "tribeca", "little_italy", "hudson_square"],
    venueCount: 149,
    itinerariesByTier: { casual: 122, nice_out: 1104, splurge: 1366 },
  },
  chelsea: {
    label: "Chelsea",
    borough: "Manhattan",
    slugs: ["chelsea"],
    venueCount: 40,
    itinerariesByTier: { casual: 5, nice_out: 159, splurge: 170 },
  },
  flatiron_nomad: {
    label: "Flatiron / NoMad",
    borough: "Manhattan",
    slugs: ["flatiron", "nomad"],
    venueCount: 62,
    itinerariesByTier: { casual: 3, nice_out: 217, splurge: 464 },
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
    venueCount: 30,
    itinerariesByTier: { casual: 10, nice_out: 34, splurge: 52 },
  },
  midtown_east: {
    label: "Midtown East",
    borough: "Manhattan",
    slugs: ["midtown_east"],
    venueCount: 29,
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
    itinerariesByTier: { casual: 54, nice_out: 154, splurge: 49 },
  },
  fidi_lower_manhattan: {
    label: "FiDi / Lower Manhattan",
    borough: "Manhattan",
    slugs: ["fidi", "lower_manhattan", "battery_park_city"],
    venueCount: 25,
    itinerariesByTier: { casual: 0, nice_out: 69, splurge: 40 },
  },
  upper_west_side: {
    label: "Upper West Side",
    borough: "Manhattan",
    slugs: ["upper_west_side"],
    venueCount: 33,
    itinerariesByTier: { casual: 0, nice_out: 21, splurge: 18 },
  },
  upper_east_side: {
    label: "Upper East Side",
    borough: "Manhattan",
    slugs: ["upper_east_side"],
    venueCount: 26,
    itinerariesByTier: { casual: 0, nice_out: 7, splurge: 42 },
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
    itinerariesByTier: { casual: 31, nice_out: 1532, splurge: 1513 },
  },
  east_williamsburg_bushwick: {
    label: "East Williamsburg / Bushwick",
    borough: "Brooklyn",
    slugs: ["east_williamsburg", "bushwick"],
    venueCount: 76,
    itinerariesByTier: { casual: 34, nice_out: 263, splurge: 127 },
  },
  dumbo_brooklyn_heights: {
    label: "DUMBO / Brooklyn Heights",
    borough: "Brooklyn",
    slugs: ["dumbo", "brooklyn_heights", "cobble_hill", "carroll_gardens"],
    venueCount: 51,
    itinerariesByTier: { casual: 7, nice_out: 156, splurge: 110 },
  },
  fort_greene_clinton_hill: {
    label: "Fort Greene / Clinton Hill",
    borough: "Brooklyn",
    slugs: ["fort_greene", "clinton_hill"],
    venueCount: 20,
    itinerariesByTier: { casual: 0, nice_out: 38, splurge: 51 },
  },
  park_slope_prospect: {
    label: "Park Slope / Prospect",
    borough: "Brooklyn",
    slugs: ["park_slope", "prospect_heights", "prospect_lefferts", "gowanus"],
    venueCount: 44,
    itinerariesByTier: { casual: 4, nice_out: 85, splurge: 92 },
  },
  bed_stuy_crown_heights: {
    label: "Bed-Stuy / Crown Heights",
    borough: "Brooklyn",
    slugs: ["bed_stuy", "crown_heights"],
    venueCount: 31,
    itinerariesByTier: { casual: 4, nice_out: 69, splurge: 29 },
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
    venueCount: 37,
    itinerariesByTier: { casual: 0, nice_out: 30, splurge: 35 },
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
