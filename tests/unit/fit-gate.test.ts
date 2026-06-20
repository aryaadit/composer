// End-time fit gate tests. Restored 2026-06-11 after a post-commit
// review caught that the strict-filters change had over-deleted the
// post-compose timeline check along with the silent buffer truncation.
// End time is a user input; a 2-stop itinerary that overshoots it is
// an honest failure, not a silent overflow.
//
// Three concerns covered:
//   1. PROOF: under the pre-2026-06-11-fit-restore behavior, an
//      itinerary with a long-Main + medium-stop-1 overshoots. The
//      composer with the restored fit gate REJECTS the long-Main
//      candidate so the user gets a fit failure instead.
//   2. The Main fit gate (upper-bound) drops mains whose duration
//      alone forces overshoot.
//   3. The stop-1 fit gate (exact projection) drops stop1s whose
//      combination with the picked Main overshoots.
//   4. The exported itineraryFits helper used by swap-stop/add-stop
//      correctly accepts fitting timelines and rejects overshoots.

import { describe, it, expect } from "vitest";
import { composeItinerary, itineraryFits } from "@/lib/composer";
import type {
  QuestionnaireAnswers,
  Venue,
  StopRole,
} from "@/types";

function makeVenue(overrides: Partial<Venue> & { id: string }): Venue {
  const { id, ...rest } = overrides;
  return {
    id,
    venue_id: id,
    name: id,
    neighborhood: "west_village",
    category: id,
    price_tier: 2,
    vibe_tags: [],
    occasion_tags: ["dating"],
    stop_roles: [],
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
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...rest,
  };
}

// Standard answers — 5h window 17:00 → 22:00.
const ANSWERS: QuestionnaireAnswers = {
  occasion: "date",
  neighborhoods: ["west_village"],
  budget: "nice_out",
  vibe: "food_forward",
  day: "2026-06-12",
  startTime: "17:00",
  endTime: "22:00",
};

const WINDOW = { startTime: "17:00", endTime: "22:00" } as const;

// ── 1. Overshoot proof + composer rejects ────────────────────────

describe("end-time fit gate — overshoot proof and rejection", () => {
  it("a long-Main + medium-stop-1 combo would overshoot 22:00 by minutes; composer rejects the Main", () => {
    // Stop-1 wine bar: 90 min (duration_hours = 1.5).
    // Main tasting menu: 240 min (duration_hours = 4.0).
    // Walk (collocated venues): ~0 min.
    // Projected: 17:00 + 90 + 0 + 240 = 22:30 — 30 min past endTime.
    // With the fit gate, the long-Main is dropped by mainCouldFit
    // (17:00 + 60 minStop1 + 5 minWalk + 240 mainDur = 22:05 > 22:00).
    const venues = [
      makeVenue({
        id: "wine-bar",
        stop_roles: ["opener"],
        duration_hours: 1.5,
        latitude: 40.7336,
        longitude: -74.0027,
      }),
      makeVenue({
        id: "tasting-menu",
        stop_roles: ["main"],
        duration_hours: 4.0,
        latitude: 40.7336,
        longitude: -74.0027,
      }),
    ];
    const result = composeItinerary(
      venues,
      ANSWERS,
      null,
      0,
      () => 0.5,
      null,
      WINDOW,
    );
    expect(result.stops).toHaveLength(0);
    expect(result.zeroingStage).toBe("fit");
  });

  it("a fitting combo is admitted", () => {
    // Stop-1 wine bar: 90 min. Main bistro: 120 min. Walk ~0.
    // Projected: 17:00 + 90 + 0 + 120 = 20:30 — well under 22:00.
    const venues = [
      makeVenue({
        id: "wine-bar",
        stop_roles: ["opener"],
        duration_hours: 1.5,
        category: "wine_bar",
        latitude: 40.7336,
        longitude: -74.0027,
      }),
      makeVenue({
        id: "bistro",
        stop_roles: ["main"],
        duration_hours: 2.0,
        category: "french",
        latitude: 40.7336,
        longitude: -74.0027,
      }),
    ];
    const result = composeItinerary(
      venues,
      ANSWERS,
      null,
      0,
      () => 0.5,
      null,
      WINDOW,
    );
    expect(result.stops).toHaveLength(2);
    expect(result.zeroingStage).toBeUndefined();
  });
});

// ── 2. Main fit gate (upper bound) ───────────────────────────────

describe("Main fit gate — drops mains whose duration alone forces overshoot", () => {
  it("4h main + 5h window → dropped (upper-bound: needs 60 stop1 + 5 walk + 240 = 305 > 300)", () => {
    const venues = [
      makeVenue({
        id: "stop1",
        stop_roles: ["opener"],
        duration_hours: 1.0,
        category: "wine_bar",
      }),
      makeVenue({
        id: "long-main",
        stop_roles: ["main"],
        duration_hours: 4.0,
        category: "tasting",
      }),
    ];
    const result = composeItinerary(
      venues,
      ANSWERS,
      null,
      0,
      () => 0.5,
      null,
      WINDOW,
    );
    expect(result.stops).toHaveLength(0);
    expect(result.zeroingStage).toBe("fit");
  });

  it("3h main + 5h window → admitted (3 + 1 stop1 + 0.1 walk = 4.1 < 5)", () => {
    const venues = [
      makeVenue({
        id: "stop1",
        stop_roles: ["opener"],
        duration_hours: 1.0,
        category: "wine_bar",
        latitude: 40.7336,
        longitude: -74.0027,
      }),
      makeVenue({
        id: "long-but-ok-main",
        stop_roles: ["main"],
        duration_hours: 3.0,
        category: "tasting",
        latitude: 40.7336,
        longitude: -74.0027,
      }),
    ];
    const result = composeItinerary(
      venues,
      ANSWERS,
      null,
      0,
      () => 0.5,
      null,
      WINDOW,
    );
    expect(result.stops).toHaveLength(2);
  });
});

// ── 3. Stop-1 fit gate (exact projection) ────────────────────────

describe("stop-1 fit gate — exact projection against picked Main", () => {
  it("rejects a 3h stop-1 paired with a 2h Main (would project 17:00 + 180 + 0 + 120 = 22:00 — exactly endTime, but a 3h+1h walk pushes past)", () => {
    // Slightly-overshooting combo: stop-1 = 3.5h = 210 min, Main = 2h.
    // 17:00 + 210 + 0 + 120 = 22:30. Overshoot.
    const venues = [
      makeVenue({
        id: "long-stop1",
        stop_roles: ["opener"],
        duration_hours: 3.5,
        category: "lounge",
        latitude: 40.7336,
        longitude: -74.0027,
      }),
      makeVenue({
        id: "bistro",
        stop_roles: ["main"],
        duration_hours: 2.0,
        category: "french",
        latitude: 40.7336,
        longitude: -74.0027,
      }),
    ];
    const result = composeItinerary(
      venues,
      ANSWERS,
      null,
      0,
      () => 0.5,
      null,
      WINDOW,
    );
    expect(result.stops).toHaveLength(0);
    expect(result.zeroingStage).toBe("fit");
  });
});

// ── 4. itineraryFits helper (for swap-stop / add-stop) ───────────

describe("itineraryFits — exported helper used by swap-stop and add-stop", () => {
  it("returns true for a fitting 2-stop", () => {
    const stops: { venue: Venue; role: StopRole }[] = [
      {
        venue: makeVenue({
          id: "s1",
          duration_hours: 1.0,
          latitude: 40.7336,
          longitude: -74.0027,
        }),
        role: "opener",
      },
      {
        venue: makeVenue({
          id: "main",
          duration_hours: 2.0,
          latitude: 40.7336,
          longitude: -74.0027,
        }),
        role: "main",
      },
    ];
    expect(itineraryFits(stops, "17:00", "22:00")).toBe(true);
  });

  it("returns false for an overshooting 2-stop", () => {
    const stops: { venue: Venue; role: StopRole }[] = [
      {
        venue: makeVenue({
          id: "s1",
          duration_hours: 1.5,
          latitude: 40.7336,
          longitude: -74.0027,
        }),
        role: "opener",
      },
      {
        venue: makeVenue({
          id: "main",
          duration_hours: 4.0,
          latitude: 40.7336,
          longitude: -74.0027,
        }),
        role: "main",
      },
    ];
    expect(itineraryFits(stops, "17:00", "22:00")).toBe(false);
  });

  it("returns true for an empty itinerary (defensive)", () => {
    expect(itineraryFits([], "17:00", "22:00")).toBe(true);
  });

  it("handles window-wraps-past-midnight (21:00 → 02:00)", () => {
    const stops: { venue: Venue; role: StopRole }[] = [
      {
        venue: makeVenue({
          id: "s1",
          duration_hours: 1.5,
          latitude: 40.7336,
          longitude: -74.0027,
        }),
        role: "opener",
      },
      {
        venue: makeVenue({
          id: "main",
          duration_hours: 2.0,
          latitude: 40.7336,
          longitude: -74.0027,
        }),
        role: "main",
      },
    ];
    // 21:00 + 90 + 0 + 120 = 00:30 — fits the 21:00 → 02:00 window.
    expect(itineraryFits(stops, "21:00", "02:00")).toBe(true);
  });
});

// ── 5. Backward compat — null window skips the fit gate ──────────

describe("legacy callers — fit gate skipped when window=null (no signature break)", () => {
  it("a long-Main combo that would fit-fail with a window still composes when window is null", () => {
    const venues = [
      makeVenue({
        id: "stop1",
        stop_roles: ["opener"],
        duration_hours: 1.0,
        category: "wine_bar",
        latitude: 40.7336,
        longitude: -74.0027,
      }),
      makeVenue({
        id: "very-long-main",
        stop_roles: ["main"],
        duration_hours: 6.0,
        category: "marathon",
        latitude: 40.7336,
        longitude: -74.0027,
      }),
    ];
    const result = composeItinerary(
      venues,
      ANSWERS,
      null,
      0,
      () => 0.5,
      null,
      null, // ← no window
    );
    // With null window, fit gate is off — composes both stops.
    expect(result.stops).toHaveLength(2);
    expect(result.zeroingStage).toBeUndefined();
  });
});
