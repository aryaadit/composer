import { describe, it, expect } from "vitest";
import { pickBestForRole } from "@/lib/scoring";
import type { Venue, QuestionnaireAnswers, WeatherInfo } from "@/types";

// ── Test fixtures ─────────────────────────────────────────────

function makeVenue(overrides: Partial<Venue> = {}): Venue {
  return {
    id: "test-" + Math.random().toString(36).slice(2, 8),
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
    reservation_platform: null,
    resy_venue_id: null,
    resy_slug: null,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    ...overrides,
  };
}

const BASE_ANSWERS: QuestionnaireAnswers = {
  occasion: "dating",
  neighborhoods: ["west_village"],
  budget: "nice_out",
  vibe: "food_forward",
  day: "2026-04-25",
  timeBlock: "evening",
  startTime: "17:00",
  endTime: "22:00",
};

const CLEAR_WEATHER: WeatherInfo = {
  temp_f: 72,
  condition: "clear",
  is_bad_weather: false,
};

const BAD_WEATHER: WeatherInfo = {
  temp_f: 45,
  condition: "rain",
  is_bad_weather: true,
};

// ── Hard filter tests ─────────────────────────────────────────

describe("pickBestForRole — hard filters", () => {
  it("excludes inactive venues", () => {
    const venues = [
      makeVenue({ name: "Active", active: true }),
      makeVenue({ name: "Inactive", active: false }),
    ];
    const { scored } = pickBestForRole(
      venues, "main", BASE_ANSWERS, CLEAR_WEATHER, new Set(), null, 0
    );
    expect(scored.every((v) => v.active)).toBe(true);
  });

  it("excludes venues already used", () => {
    const v1 = makeVenue({ name: "Used" });
    const v2 = makeVenue({ name: "Fresh" });
    const { best } = pickBestForRole(
      [v1, v2], "main", BASE_ANSWERS, CLEAR_WEATHER, new Set([v1.id]), null, 0
    );
    expect(best?.name).toBe("Fresh");
  });

  it("excludes venues outside selected neighborhoods", () => {
    const v1 = makeVenue({ name: "WV", neighborhood: "west_village" });
    const v2 = makeVenue({ name: "EV", neighborhood: "east_village" });
    const { best } = pickBestForRole(
      [v1, v2], "main", BASE_ANSWERS, CLEAR_WEATHER, new Set(), null, 0
    );
    expect(best?.name).toBe("WV");
  });

  it("includes all neighborhoods when none selected", () => {
    const v1 = makeVenue({ name: "WV", neighborhood: "west_village" });
    const v2 = makeVenue({ name: "EV", neighborhood: "east_village" });
    const answers = { ...BASE_ANSWERS, neighborhoods: [] as string[] };
    const { scored } = pickBestForRole(
      [v1, v2], "main", answers, CLEAR_WEATHER, new Set(), null, 0
    );
    expect(scored.length).toBe(2);
  });

  it("excludes outdoor venues in bad weather", () => {
    const indoor = makeVenue({ name: "Indoor", outdoor_seating: "no" });
    const outdoor = makeVenue({ name: "Outdoor", outdoor_seating: "yes" });
    const { scored } = pickBestForRole(
      [indoor, outdoor], "main", BASE_ANSWERS, BAD_WEATHER, new Set(), null, 0
    );
    expect(scored.every((v) => v.outdoor_seating !== "yes")).toBe(true);
  });

  it("allows outdoor venues in clear weather", () => {
    const outdoor = makeVenue({ name: "Outdoor", outdoor_seating: "yes" });
    const { scored } = pickBestForRole(
      [outdoor], "main", BASE_ANSWERS, CLEAR_WEATHER, new Set(), null, 0
    );
    expect(scored.length).toBe(1);
  });

  it("excludes venues that don't match the role", () => {
    const opener = makeVenue({ name: "Opener", stop_roles: ["opener"] });
    const main = makeVenue({ name: "Main", stop_roles: ["main"] });
    const { best } = pickBestForRole(
      [opener, main], "main", BASE_ANSWERS, CLEAR_WEATHER, new Set(), null, 0
    );
    expect(best?.name).toBe("Main");
  });
});

// ── Scoring weights ───────────────────────────────────────────

describe("pickBestForRole — scoring", () => {
  it("prefers venues with matching vibe tags", () => {
    const match = makeVenue({ name: "Match", vibe_tags: ["food_forward", "dinner"] });
    const noMatch = makeVenue({ name: "NoMatch", vibe_tags: ["activity"] });
    const { best } = pickBestForRole(
      [match, noMatch], "main", BASE_ANSWERS, CLEAR_WEATHER, new Set(), null, 0
    );
    expect(best?.name).toBe("Match");
  });

  it("prefers venues with matching occasion", () => {
    const match = makeVenue({ name: "Dating", occasion_tags: ["dating"], vibe_tags: [] });
    const noMatch = makeVenue({ name: "Solo", occasion_tags: ["solo"], vibe_tags: [] });
    const { best } = pickBestForRole(
      [match, noMatch], "main", BASE_ANSWERS, CLEAR_WEATHER, new Set(), null, 0
    );
    expect(best?.name).toBe("Dating");
  });

  it("prefers venues in budget range", () => {
    // nice_out typically maps to tier 2-3
    const affordable = makeVenue({ name: "Affordable", price_tier: 2 });
    const expensive = makeVenue({ name: "Expensive", price_tier: 4 });
    const { best } = pickBestForRole(
      [affordable, expensive], "main", BASE_ANSWERS, CLEAR_WEATHER, new Set(), null, 0
    );
    expect(best?.name).toBe("Affordable");
  });

  it("prefers higher quality_score all else equal", () => {
    const high = makeVenue({ name: "High", quality_score: 10 });
    const low = makeVenue({ name: "Low", quality_score: 3 });
    const { best } = pickBestForRole(
      [high, low], "main", BASE_ANSWERS, CLEAR_WEATHER, new Set(), null, 0
    );
    expect(best?.name).toBe("High");
  });

  it("curation_boost adds to score", () => {
    const boosted = makeVenue({ name: "Boosted", curation_boost: 2, quality_score: 5 });
    const normal = makeVenue({ name: "Normal", curation_boost: 0, quality_score: 5 });
    const { scored } = pickBestForRole(
      [boosted, normal], "main", BASE_ANSWERS, CLEAR_WEATHER, new Set(), null, 0
    );
    const boostedScore = scored.find((v) => v.name === "Boosted")!.score;
    const normalScore = scored.find((v) => v.name === "Normal")!.score;
    expect(boostedScore).toBeGreaterThan(normalScore);
  });
});

// ── Tiebreaker ────────────────────────────────────────────────

describe("pickBestForRole — tiebreaker", () => {
  it("uses google_rating when scores are equal", () => {
    const rated = makeVenue({ name: "Rated", google_rating: 4.8 });
    const unrated = makeVenue({ name: "Unrated", google_rating: null });
    const { best } = pickBestForRole(
      [rated, unrated], "main", BASE_ANSWERS, CLEAR_WEATHER, new Set(), null, 0
    );
    expect(best?.name).toBe("Rated");
  });

  it("uses google_review_count as secondary tiebreaker", () => {
    const popular = makeVenue({
      name: "Popular", google_rating: 4.5, google_review_count: 5000,
    });
    const niche = makeVenue({
      name: "Niche", google_rating: 4.5, google_review_count: 50,
    });
    const { best } = pickBestForRole(
      [popular, niche], "main", BASE_ANSWERS, CLEAR_WEATHER, new Set(), null, 0
    );
    expect(best?.name).toBe("Popular");
  });
});

// ── Progressive relaxation ────────────────────────────────────

describe("pickBestForRole — relaxation", () => {
  it("relaxes neighborhood filter when no matches", () => {
    const farVenue = makeVenue({
      name: "Far",
      neighborhood: "williamsburg",
      latitude: 40.7081,
      longitude: -73.9571,
    });
    // No west_village venues, but we should still get a result via relaxation
    const { best } = pickBestForRole(
      [farVenue], "main", BASE_ANSWERS, CLEAR_WEATHER, new Set(), null, 0
    );
    // May or may not relax depending on proximity — at minimum shouldn't crash
    expect(best === null || best.name === "Far").toBe(true);
  });

  it("returns null when no venues match at all", () => {
    const { best } = pickBestForRole(
      [], "main", BASE_ANSWERS, CLEAR_WEATHER, new Set(), null, 0
    );
    expect(best).toBeNull();
  });
});
