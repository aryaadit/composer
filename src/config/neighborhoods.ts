// Neighborhood config. ALL data (slugs, groups, group→slug mappings)
// comes from generated/neighborhoods.ts — driven by the Google Sheet.
// This wrapper adds: types, label formatting, helper functions, and
// borough constants for the picker UI.

import {
  NEIGHBORHOOD_GROUPS as GEN_GROUPS,
  ALL_NEIGHBORHOODS as GEN_ALL,
} from "./generated/neighborhoods";

// ─── Label formatting ──────────────────────────────────────────────────
// Most labels are auto-derived from slugs (west_village → "West Village").
// These overrides handle the ~10 slugs where the auto-derivation is wrong.
const LABEL_OVERRIDES: Record<string, string> = {
  fidi: "Financial District",
  noho: "NoHo",
  nomad: "NoMad",
  soho_nolita: "SoHo / Nolita",
  east_village_les: "East Village / LES",
  bed_stuy: "Bed-Stuy",
  dumbo: "DUMBO",
  upper_west_side: "Upper West Side",
  upper_east_side: "Upper East Side",
  gramercy_kips_bay: "Gramercy / Kips Bay",
  long_island_city: "Long Island City",
};

function slugToLabel(slug: string): string {
  if (LABEL_OVERRIDES[slug]) return LABEL_OVERRIDES[slug];
  return slug
    .split("_")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

// ─── Storage slugs (flat list) ─────────────────────────────────────────
// Every valid value for `composer_venues.neighborhood`. Adding a
// neighborhood means adding it to the sheet's Neighborhoods tab and
// re-running generate-configs.

export const NEIGHBORHOODS = GEN_ALL.map((slug) => ({
  slug,
  label: slugToLabel(slug),
  shortLabel: slugToLabel(slug), // shortLabel = label for now
}));

export type NeighborhoodSlug = (typeof GEN_ALL)[number];

export const NEIGHBORHOOD_LABELS: Record<string, string> = Object.fromEntries(
  NEIGHBORHOODS.map((n) => [n.slug, n.label])
);

export function neighborhoodLabel(slug: string): string {
  return NEIGHBORHOOD_LABELS[slug] ?? slug;
}

// ─── User-facing groups (questionnaire + onboarding pickers) ───────────
// Each group maps to 1+ storage slugs. The questionnaire shows these
// ~14 groups; expansion to storage slugs happens in QuestionnaireShell
// before scoring. Adding/editing groups = edit the sheet's
// "Neighborhood Groups" tab.

export type Borough = "manhattan" | "brooklyn" | "queens" | "outer";

export const BOROUGH_LABELS: Record<Borough, string> = {
  manhattan: "Manhattan",
  brooklyn: "Brooklyn",
  queens: "Queens",
  outer: "Outer Boroughs",
};

export const BOROUGH_ORDER: readonly Borough[] = ["manhattan", "brooklyn", "queens", "outer"];

// Convert the generated Record to the ordered array the UI iterates.
export const NEIGHBORHOOD_GROUPS = Object.entries(GEN_GROUPS).map(
  ([id, { label, borough, slugs }]) => ({
    id,
    label,
    borough: borough.toLowerCase() as Borough,
    slugs,
  })
);

export type NeighborhoodGroupId = keyof typeof GEN_GROUPS;

/** Expand a group id to its underlying storage slugs. */
export function expandNeighborhoodGroup(id: string): string[] {
  const group = NEIGHBORHOOD_GROUPS.find((g) => g.id === id);
  return group ? [...group.slugs] : [];
}

/**
 * Reverse-derive which groups are "selected" given a slug list. A group
 * is selected if ANY of its member slugs appears in the list. Used by
 * the questionnaire's back-nav.
 */
export function deriveGroupIds(slugs: readonly string[]): string[] {
  const slugSet = new Set(slugs);
  return NEIGHBORHOOD_GROUPS.filter((g) =>
    g.slugs.some((s) => slugSet.has(s))
  ).map((g) => g.id);
}
