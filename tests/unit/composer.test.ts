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
    hours: null,
    last_verified: null,
    happy_hour: null,
    dog_friendly: null,
    kid_friendly: null,
    wheelchair_accessible: null,
    signature_order: null,
    google_place_id: null,
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

describe("planStopMix — focus + start-time branching", () => {
  it("always returns a 2-stop pattern", () => {
    const pattern = planStopMix(ANSWERS, () => 0.5);
    expect(pattern).toHaveLength(2);
  });

  // ── Meal early start: [stop1, main] ─────────────────────────────

  it("Meal early start (17:00): first slot is STOP_1_POOL, second is main", () => {
    const pattern = planStopMix(
      { ...ANSWERS, vibe: "food_forward", startTime: "17:00" },
      () => 0.5,
    );
    expect(pattern[0].role).toEqual(STOP_1_POOL);
    expect(pattern[1].role).toBe("main");
  });

  it("food_forward applies no hint on the stop1 slot", () => {
    const pattern = planStopMix(
      { ...ANSWERS, vibe: "food_forward", startTime: "17:00" },
      () => 0.5,
    );
    expect(pattern[0].venueRoleHint).toBeUndefined();
  });

  // ── Meal late start: [main, stop1] ──────────────────────────────

  it("Meal late start (19:00 — the threshold): first slot is main, second is STOP_1_POOL", () => {
    const pattern = planStopMix(
      { ...ANSWERS, vibe: "food_forward", startTime: "19:00" },
      () => 0.5,
    );
    expect(pattern[0].role).toBe("main");
    expect(pattern[1].role).toEqual(STOP_1_POOL);
  });

  it("Meal late start (20:00) also reorders to [main, stop1]", () => {
    const pattern = planStopMix(
      { ...ANSWERS, vibe: "food_forward", startTime: "20:00" },
      () => 0.5,
    );
    expect(pattern[0].role).toBe("main");
    expect(pattern[1].role).toEqual(STOP_1_POOL);
  });

  // ── Drinks: [stop1, stop1], no main ─────────────────────────────

  it("drinks_led returns two STOP_1_POOL slots, no main", () => {
    const pattern = planStopMix(
      { ...ANSWERS, vibe: "drinks_led" },
      () => 0.5,
    );
    expect(pattern).toHaveLength(2);
    expect(pattern[0].role).toEqual(STOP_1_POOL);
    expect(pattern[1].role).toEqual(STOP_1_POOL);
    // Neither slot is "main" — Drinks has no main.
    expect(pattern.some((p) => p.role === "main")).toBe(false);
  });

  it("drinks_led applies a drinks venueRoleHint to BOTH slots", () => {
    const pattern = planStopMix(
      { ...ANSWERS, vibe: "drinks_led" },
      () => 0.5,
    );
    expect(pattern[0].venueRoleHint).toBe("drinks");
    expect(pattern[1].venueRoleHint).toBe("drinks");
  });

  it("drinks_led ignores start time (always two bars)", () => {
    const early = planStopMix(
      { ...ANSWERS, vibe: "drinks_led", startTime: "17:00" },
      () => 0.5,
    );
    const late = planStopMix(
      { ...ANSWERS, vibe: "drinks_led", startTime: "21:00" },
      () => 0.5,
    );
    // Both shapes identical — Drinks doesn't reorder by start time.
    expect(early.map((p) => p.role)).toEqual(late.map((p) => p.role));
  });
});

describe("composeItinerary — Meal path (focus = food_forward)", () => {
  // Coordinates for proximity: keep everyone within walking range of Main.
  const NEAR = { latitude: 40.7336, longitude: -74.0027 };

  // ANSWERS uses startTime "17:00" which is < MEAL_MAIN_FIRST_HOUR (19),
  // so the default shape is [stop1(opener), main]. Late-start tests
  // use 19:00+ to trip the [main, stop1(closer)] branch.
  const LATE: QuestionnaireAnswers = { ...ANSWERS, startTime: "19:00", endTime: "00:00" };

  it("early start: stop 1 is opener (bar before meal), stop 2 is main", () => {
    const venues = [
      makeVenue({ id: "main-1", name: "Main Spot", stop_roles: ["main"], ...NEAR }),
      makeVenue({ id: "opener-1", name: "Opener Spot", stop_roles: ["opener"], ...NEAR, category: "wine_bar" }),
      makeVenue({ id: "closer-1", name: "Closer Spot", stop_roles: ["closer"], ...NEAR, category: "bar" }),
    ];
    const { stops } = composeItinerary(venues, ANSWERS, CLEAR, 0, () => 0.5);
    expect(stops).toHaveLength(2);
    // Stop 1 = bar (label "opener" by ORDER, not from disambiguateStop1Role).
    expect(stops[0].role).toBe("opener");
    expect(["opener-1", "closer-1"]).toContain(stops[0].venue.id);
    // Stop 2 = Main.
    expect(stops[1].role).toBe("main");
    expect(stops[1].venue.id).toBe("main-1");
  });

  it("late start (19:00): stop 1 is main, stop 2 is closer (bar as nightcap)", () => {
    const venues = [
      makeVenue({ id: "main-1", name: "Main Spot", stop_roles: ["main"], ...NEAR }),
      makeVenue({ id: "opener-1", name: "Opener Spot", stop_roles: ["opener"], ...NEAR, category: "wine_bar" }),
      makeVenue({ id: "closer-1", name: "Closer Spot", stop_roles: ["closer"], ...NEAR, category: "bar" }),
    ];
    const { stops } = composeItinerary(venues, LATE, CLEAR, 0, () => 0.5);
    expect(stops).toHaveLength(2);
    // Stop 1 = Main.
    expect(stops[0].role).toBe("main");
    expect(stops[0].venue.id).toBe("main-1");
    // Stop 2 = bar (label "closer" by ORDER).
    expect(stops[1].role).toBe("closer");
    expect(["opener-1", "closer-1"]).toContain(stops[1].venue.id);
  });

  it("late start labels even an opener-only-tagged venue as 'closer' (label comes from order, not venue role)", () => {
    // The picked bar is opener-only at the venue level. Pre-2026-06-13
    // composer ran it through disambiguateStop1Role and would have
    // labeled the stop "opener". The new contract: label by ORDER.
    const venues = [
      makeVenue({ id: "main-1", stop_roles: ["main"], ...NEAR }),
      makeVenue({ id: "opener-only", stop_roles: ["opener"], ...NEAR, category: "wine_bar" }),
    ];
    const { stops } = composeItinerary(venues, LATE, CLEAR, 0, () => 0.5);
    expect(stops).toHaveLength(2);
    expect(stops[0].role).toBe("main");
    expect(stops[1].role).toBe("closer");
    expect(stops[1].venue.id).toBe("opener-only");
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
      makeVenue({ id: "closer-1", stop_roles: ["closer"], ...NEAR, category: "bar", quality_score: 7 }),
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
      // it serves both opener and closer canonically, so it's eligible
      // for STOP_1_POOL.
      makeVenue({ id: "drinks-1", stop_roles: ["drinks"], ...NEAR, category: "bar" }),
    ];
    const { stops } = composeItinerary(venues, ANSWERS, CLEAR, 0, () => 0.5);
    expect(stops).toHaveLength(2);
    expect(stops[0].venue.id).toBe("drinks-1");
    // ANSWERS startTime is 17:00 (early Meal) → order is [stop1, main]
    // → the stop1 label is "opener" by ORDER (no longer routed through
    // disambiguateStop1Role).
    expect(stops[0].role).toBe("opener");
  });
});

describe("composeItinerary — Drinks path (focus = drinks_led)", () => {
  const NEAR = { latitude: 40.7336, longitude: -74.0027 };
  const DRINKS: QuestionnaireAnswers = { ...ANSWERS, vibe: "drinks_led" };

  it("two bar venues yield two STOP_1_POOL stops (opener then closer), no main", () => {
    const venues = [
      makeVenue({ id: "bar-1", stop_roles: ["opener"], ...NEAR, category: "wine_bar" }),
      makeVenue({ id: "bar-2", stop_roles: ["closer"], ...NEAR, category: "bar" }),
      // Plus a main-tagged venue that should be IGNORED — Drinks
      // doesn't compose a main.
      makeVenue({ id: "main-trap", stop_roles: ["main"], ...NEAR, category: "italian" }),
    ];
    const { stops, zeroingStage } = composeItinerary(
      venues,
      DRINKS,
      CLEAR,
      0,
      () => 0.5,
    );
    expect(stops).toHaveLength(2);
    expect(zeroingStage).toBeUndefined();
    // Roles by ORDER: first bar = opener, second bar = closer.
    expect(stops[0].role).toBe("opener");
    expect(stops[1].role).toBe("closer");
    // The main-trap venue is not in the result.
    expect(stops.map((s) => s.venue.id)).not.toContain("main-trap");
    // Both picks are from the bar pool.
    expect(["bar-1", "bar-2"]).toContain(stops[0].venue.id);
    expect(["bar-1", "bar-2"]).toContain(stops[1].venue.id);
    expect(stops[0].venue.id).not.toBe(stops[1].venue.id);
  });

  it("a drinks-tagged venue counts as bar-eligible (ROLE_EXPANSION)", () => {
    // drinks expands to [opener, closer], so it should satisfy
    // STOP_1_POOL eligibility on both slots of the Drinks path.
    const venues = [
      makeVenue({ id: "drinks-1", stop_roles: ["drinks"], ...NEAR, category: "wine_bar" }),
      makeVenue({ id: "drinks-2", stop_roles: ["drinks"], ...NEAR, category: "bar" }),
    ];
    const { stops, zeroingStage } = composeItinerary(
      venues,
      DRINKS,
      CLEAR,
      0,
      () => 0.5,
    );
    expect(stops).toHaveLength(2);
    expect(zeroingStage).toBeUndefined();
    expect(stops[0].role).toBe("opener");
    expect(stops[1].role).toBe("closer");
  });

  it("only one bar-eligible venue → empty stops with zeroingStage 'proximity' (no degradation to one bar)", () => {
    // The first bar picks fine; the second can't be sourced because
    // the only other venue is main-tagged. Spec: emit "proximity"
    // and return empty stops, do NOT degrade to a one-bar itinerary.
    const venues = [
      makeVenue({ id: "bar-1", stop_roles: ["opener"], ...NEAR, category: "wine_bar" }),
      makeVenue({ id: "main-1", stop_roles: ["main"], ...NEAR, category: "italian" }),
    ];
    const { stops, zeroingStage } = composeItinerary(
      venues,
      DRINKS,
      CLEAR,
      0,
      () => 0.5,
    );
    expect(stops).toHaveLength(0);
    expect(zeroingStage).toBe("proximity");
  });

  it("zero bar-eligible venues → empty stops with zeroingStage 'proximity'", () => {
    // No first bar to pick — the failure is at the very first stage.
    const venues = [
      makeVenue({ id: "main-1", stop_roles: ["main"], ...NEAR }),
      makeVenue({ id: "main-2", stop_roles: ["main"], ...NEAR, category: "french" }),
    ];
    const { stops, zeroingStage } = composeItinerary(
      venues,
      DRINKS,
      CLEAR,
      0,
      () => 0.5,
    );
    expect(stops).toHaveLength(0);
    expect(zeroingStage).toBe("proximity");
  });

  it("second bar must be within walking range of the first (proximity cap)", () => {
    // First bar at NEAR; second bar way uptown (well beyond 1.5 km cap).
    // pickBestForRole's anchor enforces proximity on the second pick.
    const venues = [
      makeVenue({ id: "near-bar", stop_roles: ["opener"], ...NEAR, category: "wine_bar" }),
      makeVenue({
        id: "far-bar",
        stop_roles: ["closer"],
        latitude: 40.85,
        longitude: -73.9,
        category: "bar",
      }),
    ];
    const { stops, zeroingStage } = composeItinerary(
      venues,
      DRINKS,
      CLEAR,
      0,
      () => 0.5,
    );
    expect(stops).toHaveLength(0);
    expect(zeroingStage).toBe("proximity");
  });

  it("excludes main+closer venues (Seoul Salon shape) from the Drinks pool — restaurants with a late bar room are NOT bars", () => {
    // Under the collapsed role model, the right "actual bar" signal
    // is stop1-pool-eligible AND not main-eligible. A venue tagged
    // ["main","closer"] is a restaurant that stays open late, not a
    // bar — Drinks shouldn't reach for it. The only pure bar here
    // has no companion bar in range, so the pair fails honestly.
    const venues = [
      makeVenue({ id: "pure-bar", stop_roles: ["opener"], ...NEAR, category: "wine_bar" }),
      // The Seoul Salon shape: main + closer. Excluded from Drinks.
      makeVenue({
        id: "dinner-plus-bar-room",
        stop_roles: ["main", "closer"],
        ...NEAR,
        category: "korean",
      }),
      // Another restaurant to ensure no bar pairing exists for
      // pure-bar — the test asserts failure, not silent substitution.
      makeVenue({
        id: "another-restaurant",
        stop_roles: ["main"],
        ...NEAR,
        category: "japanese",
      }),
    ];
    const { stops, zeroingStage } = composeItinerary(
      venues,
      DRINKS,
      CLEAR,
      0,
      () => 0.5,
    );
    expect(stops).toHaveLength(0);
    expect(zeroingStage).toBe("proximity");
    // Belt-and-suspenders: the Seoul-Salon-shape venue is not in any
    // returned stop even though it carries the "closer" tag.
    expect(stops.map((s) => s.venue.id)).not.toContain(
      "dinner-plus-bar-room",
    );
  });

  it("Koreatown shape — one pure bar + closer-tagged restaurants → empty with 'proximity'", () => {
    // The neighborhood-level analogue: one actual bar, plus several
    // restaurants tagged main+closer (their late kitchen / bar room
    // marks them closer-eligible venue-side but they're really
    // restaurants). The collapsed-role bar filter rejects them, so
    // the only real bar has no companion and Drinks fails honestly
    // instead of pairing the bar with a dinner spot.
    const venues = [
      makeVenue({ id: "real-bar", stop_roles: ["opener"], ...NEAR, category: "bar" }),
      makeVenue({
        id: "kimchi-spot",
        stop_roles: ["main", "closer"],
        ...NEAR,
        category: "korean",
      }),
      makeVenue({
        id: "bbq-spot",
        stop_roles: ["main", "closer"],
        ...NEAR,
        category: "korean",
      }),
    ];
    const { stops, zeroingStage } = composeItinerary(
      venues,
      DRINKS,
      CLEAR,
      0,
      () => 0.5,
    );
    expect(stops).toHaveLength(0);
    expect(zeroingStage).toBe("proximity");
  });
});
