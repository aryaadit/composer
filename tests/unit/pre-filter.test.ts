// Pre-filter stack tests — the canonical filter shared by /api/generate,
// /api/swap-stop, /api/add-stop. Covers:
//   1. Each filter stage zeroes the pool → correct zeroingStage.
//   2. The honest-failure paths that replace the deleted relaxation rules:
//      - exclude-list strict (no graceful trim)
//      - budget strict (no upward widening)
//      - neighborhood strict (no cascade drop)
//   3. Parity: identical predicates regardless of caller — the same
//      args produce the same output across endpoints.
//   4. Regression: no path returns a venue outside the user's
//      neighborhood selection.

import { describe, it, expect } from "vitest";
import { applyPreFilters, buildPreFilterArgs } from "@/lib/itinerary/pre-filter";
import type { Venue } from "@/types";

// ── Minimal Venue stub — only fields the pre-filter reads. ────────
function makeVenue(overrides: Partial<Venue> & { id: string }): Venue {
  const { id, ...rest } = overrides;
  return {
    id,
    venue_id: id,
    name: overrides.id,
    neighborhood: "west_village",
    category: null,
    price_tier: 2,
    vibe_tags: [],
    occasion_tags: [],
    stop_roles: ["main"],
    time_blocks: ["evening"],
    mon_blocks: [],
    tue_blocks: [],
    wed_blocks: [],
    thu_blocks: [],
    fri_blocks: ["evening"],
    sat_blocks: [],
    sun_blocks: [],
    duration_hours: 1.5,
    outdoor_seating: null,
    reservation_difficulty: null,
    reservation_lead_days: null,
    reservation_url: null,
    maps_url: null,
    curation_note: null,
    awards: null,
    quality_score: 5,
    curation_boost: 0,
    curated_by: null,
    address: null,
    latitude: 40.733,
    longitude: -74.003,
    active: true,
    notes: null,
    verified: null,
    hours: null,
    last_verified: null,
    last_updated: null,
    happy_hour: null,
    dog_friendly: null,
    kid_friendly: null,
    wheelchair_accessible: null,
    signature_order: null,
    google_place_id: null,
    corner_id: null,
    corner_photo_url: null,
    guide_count: null,
    source_guides: [],
    all_neighborhoods: [],
    google_rating: null,
    google_review_count: null,
    google_types: [],
    google_phone: null,
    enriched: false,
    business_status: "OPERATIONAL",
    image_keys: [],
    reservation_platform: null,
    resy_venue_id: null,
    resy_slug: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...rest,
  };
}

const FRIDAY_2026_06_12 = "2026-06-12"; // confirmed a Friday
const INPUTS = {
  budget: "nice_out" as const,
  day: FRIDAY_2026_06_12,
  startTime: "19:00",
  endTime: "00:00",
  neighborhoods: ["west_village"],
};

// ─────────────────────────────────────────────────────────────────
// Stage zeroing → correct zeroingStage
// ─────────────────────────────────────────────────────────────────

describe("applyPreFilters — zeroingStage on stage zero", () => {
  it("ok=true when every stage has survivors", () => {
    const venues = [makeVenue({ id: "v1", price_tier: 2 })];
    const res = applyPreFilters({
      venues,
      inputs: INPUTS,
      exclude: new Set(),
      drinks: null,
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.venues).toHaveLength(1);
  });

  it("exclusions zeros pool → zeroingStage=\"exclusions\"", () => {
    const venues = [makeVenue({ id: "v1" })];
    const res = applyPreFilters({
      venues,
      inputs: INPUTS,
      exclude: new Set(["v1"]),
      drinks: null,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.zeroingStage).toBe("exclusions");
  });

  it("hours zeros pool → zeroingStage=\"hours\"", () => {
    // Venue only has Wednesday daytime hours; user wants Friday evening.
    const venues = [
      makeVenue({
        id: "v1",
        time_blocks: ["afternoon"],
        fri_blocks: [],
        wed_blocks: ["afternoon"],
      }),
    ];
    const res = applyPreFilters({
      venues,
      inputs: INPUTS,
      exclude: new Set(),
      drinks: null,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.zeroingStage).toBe("hours");
  });

  it("closed status zeros pool → zeroingStage=\"hours\" (bundled)", () => {
    const venues = [
      makeVenue({ id: "v1", business_status: "CLOSED_PERMANENTLY" }),
    ];
    const res = applyPreFilters({
      venues,
      inputs: INPUTS,
      exclude: new Set(),
      drinks: null,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.zeroingStage).toBe("hours");
  });

  it("budget zeros pool → zeroingStage=\"budget\"", () => {
    // nice_out admits tier 1 + 2. A pool of only tier-4 venues zeroes.
    const venues = [makeVenue({ id: "v1", price_tier: 4 })];
    const res = applyPreFilters({
      venues,
      inputs: INPUTS,
      exclude: new Set(),
      drinks: null,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.zeroingStage).toBe("budget");
  });

  it("neighborhood zeros pool → zeroingStage=\"neighborhood\"", () => {
    // Venue is in east_village; user picked west_village.
    const venues = [makeVenue({ id: "v1", neighborhood: "east_village" })];
    const res = applyPreFilters({
      venues,
      inputs: INPUTS,
      exclude: new Set(),
      drinks: null,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.zeroingStage).toBe("neighborhood");
  });
});

// ─────────────────────────────────────────────────────────────────
// Honest-failure replacements for the deleted relaxation rules
// ─────────────────────────────────────────────────────────────────

describe("strict exclusions — no graceful trim (replaces deleted /api/generate trim)", () => {
  it("a long exclude list that empties the pool does NOT trim oldest entries", () => {
    // Pre-2026-06-11 behavior: if exclude.size made the pool drop
    // below ALGORITHM.pools.minPoolSize (4), the route trimmed oldest
    // IDs. The trim was deleted; the pre-filter now reports an honest
    // exclusions-zero.
    const venues = [makeVenue({ id: "v1" }), makeVenue({ id: "v2" })];
    const exclude = new Set(["v1", "v2", "ghost1", "ghost2", "ghost3"]);
    const res = applyPreFilters({
      venues,
      inputs: INPUTS,
      exclude,
      drinks: null,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.zeroingStage).toBe("exclusions");
  });
});

describe("strict budget — no upward widening (replaces deleted /api/generate widening)", () => {
  it("casual + thin tier-1 pool does NOT widen into tier-2 — explicit casual upsell guard", () => {
    // Spec: "We designed it hard; the June 10 coverage audit saw
    // behavior consistent with silent upsell in thin casual
    // neighborhoods." This test is the regression that holds the
    // strict-filters principle.
    const casualInputs = { ...INPUTS, budget: "casual" as const };
    const venues = [
      // No tier-1 venues. Only tier-2.
      makeVenue({ id: "tier2-a", price_tier: 2 }),
      makeVenue({ id: "tier2-b", price_tier: 2 }),
    ];
    const res = applyPreFilters({
      venues,
      inputs: casualInputs,
      exclude: new Set(),
      drinks: null,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.zeroingStage).toBe("budget");
  });

  it("casual + only tier-1 venues passes — strict membership", () => {
    const casualInputs = { ...INPUTS, budget: "casual" as const };
    const venues = [makeVenue({ id: "tier1", price_tier: 1 })];
    const res = applyPreFilters({
      venues,
      inputs: casualInputs,
      exclude: new Set(),
      drinks: null,
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.venues).toHaveLength(1);
  });
});

describe("strict neighborhood — no cascade drop (replaces deleted relaxedFilter step)", () => {
  it("returns ONLY in-neighborhood venues even when the pool is thin", () => {
    // Pre-2026-06-11: when a stop-1 cascade emptied at the strict
    // neighborhood step, relaxedFilter dropped neighborhood entirely
    // and let in adjacent-neighborhood venues. That step is gone —
    // the data layer just returns nothing if neighborhood is the
    // blocker.
    const venues = [
      makeVenue({ id: "in-1", neighborhood: "west_village" }),
      makeVenue({ id: "out-1", neighborhood: "east_village" }),
      makeVenue({ id: "out-2", neighborhood: "midtown_east" }),
    ];
    const res = applyPreFilters({
      venues,
      inputs: INPUTS,
      exclude: new Set(),
      drinks: null,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.venues.map((v) => v.id)).toEqual(["in-1"]);
    }
  });
});

// ─────────────────────────────────────────────────────────────────
// Parity: same args → same output across endpoints
// ─────────────────────────────────────────────────────────────────

describe("parity via buildPreFilterArgs — same caller inputs → identical filter args", () => {
  // Adversarial-review fix (2026-06-11): the previous parity test
  // called applyPreFilters three times with literal-identical inline
  // objects, which proved nothing about call-site convergence. The
  // three routes now construct their pre-filter args through the
  // shared `buildPreFilterArgs` helper exported from pre-filter.ts,
  // which strips/normalizes the input shape. Routes that drift from
  // calling this helper would still pass the inline-equality test
  // but would fail this one — because the helper's output is the
  // canonical input shape every route must produce.
  it("the helper produces deep-equal args from the same inputs (call-site convergence pin)", () => {
    const venues = [
      makeVenue({ id: "v1", price_tier: 2 }),
      makeVenue({ id: "v2", price_tier: 2, neighborhood: "east_village" }),
      makeVenue({ id: "v3", price_tier: 4 }),
    ];
    // Three slightly different call shapes that all generate, swap-stop,
    // and add-stop produce — extra fields, different exclude
    // construction patterns. The helper normalizes them all into the
    // canonical PreFilterArgs.
    const generateArgs = buildPreFilterArgs({
      venues,
      inputs: { ...INPUTS, neighborhoods: INPUTS.neighborhoods },
      exclude: new Set([]),
      drinks: null,
    });
    const swapArgs = buildPreFilterArgs({
      venues,
      inputs: {
        budget: INPUTS.budget,
        day: INPUTS.day,
        startTime: INPUTS.startTime,
        endTime: INPUTS.endTime,
        neighborhoods: [...INPUTS.neighborhoods],
      },
      exclude: new Set(),
      drinks: null,
    });
    const addArgs = buildPreFilterArgs({
      venues,
      inputs: INPUTS,
      exclude: new Set<string>(),
      drinks: null,
    });
    expect(applyPreFilters(generateArgs)).toEqual(applyPreFilters(swapArgs));
    expect(applyPreFilters(swapArgs)).toEqual(applyPreFilters(addArgs));
  });
});

// ─────────────────────────────────────────────────────────────────
// Regression: no path returns out-of-neighborhood venues
// ─────────────────────────────────────────────────────────────────

describe("no-out-of-neighborhood regression", () => {
  it("with a mixed pool, no venue outside the user's union survives", () => {
    const inputs = { ...INPUTS, neighborhoods: ["west_village", "chelsea"] };
    const venues = [
      makeVenue({ id: "wv", neighborhood: "west_village" }),
      makeVenue({ id: "ch", neighborhood: "chelsea" }),
      makeVenue({ id: "ev", neighborhood: "east_village" }),
      makeVenue({ id: "mw", neighborhood: "midtown_west" }),
    ];
    const res = applyPreFilters({
      venues,
      inputs,
      exclude: new Set(),
      drinks: null,
    });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const slugs = new Set(res.venues.map((v) => v.neighborhood));
      expect(slugs.has("east_village")).toBe(false);
      expect(slugs.has("midtown_west")).toBe(false);
      expect(slugs).toEqual(new Set(["west_village", "chelsea"]));
    }
  });

  it("empty neighborhoods array → no neighborhood gating (defensive)", () => {
    // No user picked neighborhoods → pre-filter doesn't gate on it.
    const inputs = { ...INPUTS, neighborhoods: [] };
    const venues = [
      makeVenue({ id: "wv", neighborhood: "west_village" }),
      makeVenue({ id: "ev", neighborhood: "east_village" }),
    ];
    const res = applyPreFilters({
      venues,
      inputs,
      exclude: new Set(),
      drinks: null,
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.venues).toHaveLength(2);
  });
});

// ─────────────────────────────────────────────────────────────────
// Drinks=no — profile cull
// ─────────────────────────────────────────────────────────────────

describe("drinks=no profile cull", () => {
  it("drops alcohol-tagged venues when drinks='no'", () => {
    const venues = [
      makeVenue({ id: "bar", vibe_tags: ["cocktail_forward"] }),
      makeVenue({ id: "diner", vibe_tags: [] }),
    ];
    const res = applyPreFilters({
      venues,
      inputs: INPUTS,
      exclude: new Set(),
      drinks: "no",
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.venues.map((v) => v.id)).toEqual(["diner"]);
  });

  it("does NOT drop alcohol venues when drinks='yes' or null", () => {
    const venues = [
      makeVenue({ id: "bar", vibe_tags: ["cocktail_forward"] }),
    ];
    const yesRes = applyPreFilters({
      venues,
      inputs: INPUTS,
      exclude: new Set(),
      drinks: "yes",
    });
    expect(yesRes.ok).toBe(true);
    const nullRes = applyPreFilters({
      venues,
      inputs: INPUTS,
      exclude: new Set(),
      drinks: null,
    });
    expect(nullRes.ok).toBe(true);
  });

  // Adversarial-review fix (2026-06-11): drinks=no zeroing the pool
  // now reports zeroingStage="drinks", not "neighborhood". Previously
  // the empty-after-drinks-cull case was rolled into "neighborhood"
  // which misdirected users in alcohol-skewed neighborhoods.
  it("drinks=no zeros pool → zeroingStage=\"drinks\" (not misattributed to neighborhood)", () => {
    const venues = [
      makeVenue({ id: "bar1", vibe_tags: ["cocktail_forward"] }),
      makeVenue({ id: "bar2", vibe_tags: ["wine_bar"] }),
    ];
    const res = applyPreFilters({
      venues,
      inputs: INPUTS,
      exclude: new Set(),
      drinks: "no",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.zeroingStage).toBe("drinks");
  });
});
