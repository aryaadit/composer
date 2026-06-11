// Tests for src/config/group-visibility.ts — the native-composability
// gate that replaced the venueCount < 25 rule on 2026-06-11.
//
// Three concerns covered:
//   1. The gate predicate (isGroupVisible): synthetic groups exercise
//      mid-tier vs worst-tier behavior at the bar boundary.
//   2. The per-tier selector predicate (isTierSelectable +
//      isTierSelectableForGroups): the budget-step disabled-set logic.
//   3. A snapshot of the visible-group list against the LIVE baked
//      NEIGHBORHOOD_GROUPS. Any catalog change that alters which
//      groups render fails this test loudly so the gate's effect is
//      explicit in PR review.

import { describe, it, expect } from "vitest";
import type { NeighborhoodGroup } from "@/config/generated/neighborhoods";
import { NEIGHBORHOOD_GROUPS as GEN_GROUPS } from "@/config/generated/neighborhoods";
import {
  GROUP_VISIBILITY,
  TIER_UNAVAILABLE_COPY,
  isGroupVisible,
  isTierSelectable,
  isTierSelectableForGroups,
} from "@/config/group-visibility";

function mkGroup(
  label: string,
  tiers: { casual: number; nice_out: number; splurge: number },
  venueCount = 50,
): NeighborhoodGroup {
  return {
    label,
    borough: "Manhattan",
    slugs: ["fake"],
    venueCount,
    itinerariesByTier: tiers,
  };
}

// ── 1. Gate predicate ─────────────────────────────────────────────

describe("isGroupVisible — mid-tier rule (current GROUP_VISIBILITY.mode)", () => {
  // Sanity-check the assumption baked into this test file. If someone
  // flipped the mode, the entire suite below needs re-thinking.
  it("the live config is mid_tier @ 25 (precondition for the rest of the suite)", () => {
    expect(GROUP_VISIBILITY.mode).toBe("mid_tier");
    expect(GROUP_VISIBILITY.bar).toBe(25);
  });

  it("Queens-shaped group (0 / 2 / 1) is HIDDEN — median = 1, fails bar", () => {
    const g = mkGroup("Queens (synthetic)", {
      casual: 0,
      nice_out: 2,
      splurge: 1,
    });
    expect(isGroupVisible(g)).toBe(false);
  });

  it("Fort Greene-shaped group (0 / 38 / 51) RENDERS — median = 38, clears bar", () => {
    const g = mkGroup("Fort Greene (synthetic)", {
      casual: 0,
      nice_out: 38,
      splurge: 51,
    });
    expect(isGroupVisible(g)).toBe(true);
  });

  it("Koreatown-shaped group (16 / 94 / 51) RENDERS — median = 51, clears bar", () => {
    // Note: real Koreatown bake may shift over time; this test pins the
    // shape (median dominates one weak tier) not the exact group.
    const g = mkGroup("Koreatown (synthetic)", {
      casual: 16,
      nice_out: 94,
      splurge: 51,
    });
    expect(isGroupVisible(g)).toBe(true);
  });

  it("group at the exact boundary (25 / 25 / 25) RENDERS — median = 25, equals bar", () => {
    const g = mkGroup("Boundary", { casual: 25, nice_out: 25, splurge: 25 });
    expect(isGroupVisible(g)).toBe(true);
  });

  it("group just under the boundary (24 / 24 / 100) is HIDDEN — median = 24", () => {
    // Tests that mid-tier is the MEDIAN of three, not the average or
    // the second-best. Without sorting, an "every tier averages above"
    // mistake would let this pass.
    const g = mkGroup("Lopsided", { casual: 24, nice_out: 24, splurge: 100 });
    expect(isGroupVisible(g)).toBe(false);
  });
});

// ── 2. Per-tier selectability ────────────────────────────────────

describe("isTierSelectable — per-tier bar check inside a visible group", () => {
  // Koreatown shape: passes the group gate (median = 51), but the casual
  // tier is below the bar. So the GROUP renders, and CASUAL renders
  // disabled inside it.
  const koreatownShaped = mkGroup("Koreatown (synthetic)", {
    casual: 16,
    nice_out: 94,
    splurge: 51,
  });

  it("Koreatown-shaped: casual is NOT selectable (16 < 25)", () => {
    expect(isTierSelectable(koreatownShaped, "casual")).toBe(false);
  });
  it("Koreatown-shaped: nice_out IS selectable (94 ≥ 25)", () => {
    expect(isTierSelectable(koreatownShaped, "nice_out")).toBe(true);
  });
  it("Koreatown-shaped: splurge IS selectable (51 ≥ 25)", () => {
    expect(isTierSelectable(koreatownShaped, "splurge")).toBe(true);
  });

  it("a tier at exactly the bar IS selectable", () => {
    const g = mkGroup("Exact", { casual: 25, nice_out: 100, splurge: 100 });
    expect(isTierSelectable(g, "casual")).toBe(true);
  });
});

describe("isTierSelectableForGroups — budget-step disabled set logic", () => {
  // The questionnaire pools venues across selected groups (per
  // scoring.ts neighborhood predicate + the questionnaire shell's
  // expandNeighborhoodGroup flatmap). So a tier is disabled only when
  // NO selected group can serve it. A user picking Koreatown +
  // East Village/LES gets casual enabled because EV/LES has plenty,
  // even though Koreatown alone is too thin.
  const koreatownShaped = mkGroup("Koreatown", {
    casual: 16,
    nice_out: 94,
    splurge: 51,
  });
  const fatShaped = mkGroup("Fat group", {
    casual: 100,
    nice_out: 200,
    splurge: 300,
  });
  const queensShaped = mkGroup("Queens", {
    casual: 0,
    nice_out: 2,
    splurge: 1,
  });

  it("empty selection → no tier is disabled", () => {
    for (const tier of ["casual", "nice_out", "splurge"] as const) {
      expect(isTierSelectableForGroups([], tier)).toBe(true);
    }
  });

  it("only a thin-casual group selected → casual is disabled", () => {
    expect(isTierSelectableForGroups([koreatownShaped], "casual")).toBe(false);
    expect(isTierSelectableForGroups([koreatownShaped], "nice_out")).toBe(true);
  });

  it("thin-casual + fat group selected → casual is ENABLED (fat group serves it)", () => {
    expect(
      isTierSelectableForGroups([koreatownShaped, fatShaped], "casual"),
    ).toBe(true);
  });

  it("two thin groups selected → tier disabled iff every selected group fails", () => {
    // Queens has 0/2/1 — no tier passes the bar in isolation.
    // Koreatown has 16/94/51 — nice_out and splurge pass.
    // Union: nice_out and splurge enabled (Koreatown serves them);
    // casual disabled (neither group serves it).
    expect(
      isTierSelectableForGroups([koreatownShaped, queensShaped], "casual"),
    ).toBe(false);
    expect(
      isTierSelectableForGroups([koreatownShaped, queensShaped], "nice_out"),
    ).toBe(true);
  });
});

// ── 3. Live snapshot of the visible-group list ────────────────────

describe("visible-group snapshot — fails loudly when the catalog shifts", () => {
  it("the exact set of groups that render under the live gate", () => {
    // This is the visible-group list against the live baked
    // NEIGHBORHOOD_GROUPS. If the catalog changes (new venues, fewer
    // venues, new groups, new slugs) and the visible set shifts, this
    // test fails. Regenerate the snapshot below ONLY after eyeballing
    // the new list and confirming the change is intended.
    //
    // Generated 2026-06-11 against
    //   median(itinerariesByTier) >= 25
    // with itinerariesByTier baked from Friday-evening native counts.
    // 18 groups render; 7 hide (gramercy_murray_hill, harlem_uptown,
    // upper_east_side, upper_west_side, south_brooklyn, queens,
    // bronx_si). Refresh via:
    //   npx tsx -e "import { NEIGHBORHOOD_GROUPS } from '@/config/generated/neighborhoods'; import { isGroupVisible } from '@/config/group-visibility'; console.log(JSON.stringify(Object.entries(NEIGHBORHOOD_GROUPS).filter(([, g]) => isGroupVisible(g)).map(([id]) => id).sort(), null, 2));"
    const expected = new Set([
      "astoria_lic",
      "bed_stuy_crown_heights",
      "chelsea",
      "chinatown",
      "dumbo_brooklyn_heights",
      "east_village_les",
      "east_williamsburg_bushwick",
      "fidi_lower_manhattan",
      "flatiron_nomad",
      "fort_greene_clinton_hill",
      "greenwich_village",
      "koreatown",
      "midtown_east",
      "midtown_west",
      "park_slope_prospect",
      "soho_nolita_tribeca",
      "west_village",
      "williamsburg_greenpoint",
    ]);

    const actual = new Set(
      Object.entries(GEN_GROUPS)
        .filter(([, g]) => isGroupVisible(g))
        .map(([id]) => id),
    );

    expect(actual).toEqual(expected);
  });
});

// ── Copy regression ──────────────────────────────────────────────

describe("TIER_UNAVAILABLE_COPY — disabled-tier brand-voice copy", () => {
  it("is a single short line with no numbers", () => {
    expect(TIER_UNAVAILABLE_COPY.length).toBeLessThan(40);
    expect(/\d/.test(TIER_UNAVAILABLE_COPY)).toBe(false);
    expect(TIER_UNAVAILABLE_COPY).not.toContain("\n");
  });
});
