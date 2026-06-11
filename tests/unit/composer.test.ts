import { describe, it, expect } from "vitest";
import {
  STOP_1_POOL,
  composeItinerary,
  disambiguateStop1Role,
  planStopMix,
} from "@/lib/composer";
import type { Venue, QuestionnaireAnswers, WeatherInfo } from "@/types";

function makeVenue(overrides: Partial<Venue> = {}): Venue {
  return {
    id: "v_" + Math.random().toString(36).slice(2, 10),
    venue_id: "v001",
    name: "Test Venue",
    neighborhood: "west_village",
    category: "italian",
    price_tier: 2,
    vibe_tags: ["food_forward", "dinner"],
    occasion_tags: ["dating"],
    stop_roles: ["main"],
    time_blocks: ["evening"],
    mon_blocks: ["evening"],
    tue_blocks: ["evening"],
    wed_blocks: ["evening"],
    thu_blocks: ["evening"],
    fri_blocks: ["evening"],
    sat_blocks: ["evening"],
    sun_blocks: ["evening"],
    duration_hours: 2,
    outdoor_seating: "no",
    reservation_difficulty: null,
    reservation_lead_days: null,
    reservation_url: null,
    maps_url: null,
    curation_note: "Great spot",
    awards: null,
    quality_score: 7,
    curation_boost: 0,
    curated_by: null,
    address: "123 Test St",
    latitude: 40.7336,
    longitude: -74.0027,
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
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    ...overrides,
  } as unknown as Venue;
}

const ANSWERS: QuestionnaireAnswers = {
  occasion: "date",
  neighborhoods: ["west_village"],
  budget: "nice_out",
  vibe: "food_forward",
  day: "2026-04-25",
  startTime: "17:00",
  endTime: "22:00",
};

const CLEAR: WeatherInfo = {
  temp_f: 72,
  condition: "clear",
  description: "Clear",
  is_bad_weather: false,
};

describe("STOP_1_POOL constant", () => {
  it("contains exactly opener and closer", () => {
    expect(STOP_1_POOL).toEqual(["opener", "closer"]);
  });
});

describe("disambiguateStop1Role", () => {
  it("returns 'opener' for an opener-tagged venue", () => {
    const v = makeVenue({ stop_roles: ["opener"] });
    expect(disambiguateStop1Role(v)).toBe("opener");
  });

  it("returns 'closer' for a closer-only-tagged venue", () => {
    const v = makeVenue({ stop_roles: ["closer"] });
    expect(disambiguateStop1Role(v)).toBe("closer");
  });

  it("returns 'opener' for a drinks-tagged venue (both via ROLE_EXPANSION)", () => {
    // drinks expands to [opener, closer]. Spec: when ambiguous, prefer "opener"
    // since stop 1 is chronologically the start of the night.
    const v = makeVenue({ stop_roles: ["drinks"] });
    expect(disambiguateStop1Role(v)).toBe("opener");
  });

  it("returns 'opener' for activity-tagged (opener-only via expansion)", () => {
    const v = makeVenue({ stop_roles: ["activity"] });
    expect(disambiguateStop1Role(v)).toBe("opener");
  });

  it("returns 'opener' for coffee-tagged (opener-only)", () => {
    const v = makeVenue({ stop_roles: ["coffee"] });
    expect(disambiguateStop1Role(v)).toBe("opener");
  });

  it("returns 'opener' when venue carries both opener and closer literally", () => {
    const v = makeVenue({ stop_roles: ["opener", "closer"] });
    expect(disambiguateStop1Role(v)).toBe("opener");
  });
});

describe("planStopMix — Phase 2 collapsed shape", () => {
  it("always returns a 2-stop pattern", () => {
    const pattern = planStopMix(ANSWERS, () => 0.5);
    expect(pattern).toHaveLength(2);
  });

  it("first slot is STOP_1_POOL", () => {
    const pattern = planStopMix(ANSWERS, () => 0.5);
    expect(pattern[0].role).toEqual(STOP_1_POOL);
  });

  it("second slot is main", () => {
    const pattern = planStopMix(ANSWERS, () => 0.5);
    expect(pattern[1].role).toBe("main");
  });

  it("drinks_led applies a drinks venueRoleHint to stop 1", () => {
    const pattern = planStopMix(
      { ...ANSWERS, vibe: "drinks_led" },
      () => 0.5,
    );
    expect(pattern[0].venueRoleHint).toBe("drinks");
    expect(pattern[1].venueRoleHint).toBeUndefined();
  });

  it("activity_food applies an activity hint to stop 1", () => {
    const pattern = planStopMix(
      { ...ANSWERS, vibe: "activity_food" },
      () => 0.5,
    );
    expect(pattern[0].venueRoleHint).toBe("activity");
  });

  it("food_forward applies no hint (null in VIBE_STOP_1_HINTS)", () => {
    const pattern = planStopMix(
      { ...ANSWERS, vibe: "food_forward" },
      () => 0.5,
    );
    expect(pattern[0].venueRoleHint).toBeUndefined();
  });
});

describe("composeItinerary — STOP_1_POOL composition", () => {
  // Coordinates for proximity: keep everyone within walking range of Main.
  const NEAR = { latitude: 40.7336, longitude: -74.0027 };

  it("picks main for stop 2 and an opener-or-closer for stop 1", () => {
    const venues = [
      makeVenue({ id: "main-1", name: "Main Spot", stop_roles: ["main"], ...NEAR }),
      makeVenue({ id: "opener-1", name: "Opener Spot", stop_roles: ["opener"], ...NEAR, category: "wine_bar" }),
      makeVenue({ id: "closer-1", name: "Closer Spot", stop_roles: ["closer"], ...NEAR, category: "cocktail_bar" }),
    ];
    const { stops } = composeItinerary(venues, ANSWERS, CLEAR, 0, () => 0.5);
    expect(stops).toHaveLength(2);
    // Stop 2 must be Main.
    expect(stops[1].role).toBe("main");
    expect(stops[1].venue.id).toBe("main-1");
    // Stop 1 must be opener or closer (the only non-main candidates).
    expect(["opener", "closer"]).toContain(stops[0].role);
    expect(["opener-1", "closer-1"]).toContain(stops[0].venue.id);
  });

  it("main-tagged venues are excluded from stop 1's pool — empty stops on stop-1 failure (2026-06-11 strict-filters)", () => {
    // If the only non-main venue is also tagged main, stop 1 cannot be
    // filled. The single-stop fallback was REMOVED — the composer now
    // returns an empty stops array and the route handler turns that
    // into a ComposeFailure with zeroingStage="proximity".
    const venues = [
      makeVenue({ id: "main-1", name: "Main Spot", stop_roles: ["main"], ...NEAR }),
      makeVenue({ id: "main-2", name: "Another Main", stop_roles: ["main"], ...NEAR, category: "french" }),
    ];
    const { stops } = composeItinerary(venues, ANSWERS, CLEAR, 0, () => 0.5);
    expect(stops).toHaveLength(0);
  });

  it("returns empty stops when no STOP_1_POOL candidate is in walking range — no single-stop fallback (2026-06-11 strict-filters)", () => {
    // Stop 1 candidate exists but is FAR from Main (well beyond 1.5km cap).
    // Previously: returned a single Main stop. Now: returns empty so the
    // caller can emit an honest ComposeFailure.
    const venues = [
      makeVenue({ id: "main-1", stop_roles: ["main"], latitude: 40.7336, longitude: -74.0027 }),
      makeVenue({ id: "far-opener", stop_roles: ["opener"], latitude: 40.8500, longitude: -73.9000, category: "wine_bar" }),
    ];
    const { stops } = composeItinerary(venues, ANSWERS, CLEAR, 0, () => 0.5);
    expect(stops).toHaveLength(0);
  });

  it("Main carries a plan_b (not null) when an alternative main exists", () => {
    const venues = [
      makeVenue({ id: "main-1", stop_roles: ["main"], ...NEAR, quality_score: 9 }),
      makeVenue({ id: "main-2", stop_roles: ["main"], ...NEAR, category: "french", quality_score: 7 }),
      makeVenue({ id: "opener-1", stop_roles: ["opener"], ...NEAR, category: "wine_bar" }),
    ];
    const { stops } = composeItinerary(venues, ANSWERS, CLEAR, 0, () => 0.5);
    const main = stops.find((s) => s.role === "main");
    expect(main).toBeDefined();
    expect(main!.plan_b).not.toBeNull();
    expect(main!.plan_b!.id).not.toBe(main!.venue.id);
  });

  it("Main has null plan_b when no alternative main exists", () => {
    const venues = [
      makeVenue({ id: "main-1", stop_roles: ["main"], ...NEAR }),
      makeVenue({ id: "opener-1", stop_roles: ["opener"], ...NEAR, category: "wine_bar" }),
    ];
    const { stops } = composeItinerary(venues, ANSWERS, CLEAR, 0, () => 0.5);
    const main = stops.find((s) => s.role === "main");
    expect(main!.plan_b).toBeNull();
  });

  it("stop 1 carries a plan_b when an alternative opener-or-closer exists", () => {
    const venues = [
      makeVenue({ id: "main-1", stop_roles: ["main"], ...NEAR }),
      makeVenue({ id: "opener-1", stop_roles: ["opener"], ...NEAR, category: "wine_bar", quality_score: 9 }),
      makeVenue({ id: "closer-1", stop_roles: ["closer"], ...NEAR, category: "cocktail_bar", quality_score: 7 }),
    ];
    const { stops } = composeItinerary(venues, ANSWERS, CLEAR, 0, () => 0.5);
    const stop1 = stops[0];
    expect(stop1.plan_b).not.toBeNull();
    expect(stop1.plan_b!.id).not.toBe(stop1.venue.id);
  });

  it("a drinks-tagged venue can serve as stop 1 (ROLE_EXPANSION → opener+closer)", () => {
    const venues = [
      makeVenue({ id: "main-1", stop_roles: ["main"], ...NEAR }),
      // Only candidate for stop 1 is drinks-tagged. Via ROLE_EXPANSION
      // it serves both opener and closer canonically, so it should be
      // eligible for STOP_1_POOL.
      makeVenue({ id: "drinks-1", stop_roles: ["drinks"], ...NEAR, category: "cocktail_bar" }),
    ];
    const { stops } = composeItinerary(venues, ANSWERS, CLEAR, 0, () => 0.5);
    expect(stops).toHaveLength(2);
    expect(stops[0].venue.id).toBe("drinks-1");
    // Disambiguated to opener (chronologically natural for stop 1).
    expect(stops[0].role).toBe("opener");
  });
});
