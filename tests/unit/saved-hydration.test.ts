import { describe, it, expect } from "vitest";
import { hydrateSavedItinerary } from "@/lib/itinerary/saved-hydration";
import { COMPOSE_START_TIMES } from "@/lib/itinerary/time-blocks";
import type { ItineraryStop, SavedItinerary, Venue } from "@/types";

// Minimal Venue stub — only fields hydrateSavedItinerary reads.
function stubVenue(name: string, lat: number, lng: number): Venue {
  return {
    id: `v_${name}`,
    name,
    neighborhood: "west_village",
    latitude: lat,
    longitude: lng,
    price_tier: 2,
    category: "restaurant",
    vibe_tags: [],
    occasion_tags: [],
    stop_roles: [],
    time_blocks: ["evening"],
    duration_hours: 1.5,
    outdoor_seating: false,
    reservation_difficulty: 2,
    reservation_url: null,
    maps_url: null,
    curation_note: "",
    awards: null,
    curated_by: null,
    signature_order: null,
    address: "",
    active: true,
    notes: null,
    hours: null,
    last_verified: null,
    last_updated: null,
    happy_hour: null,
    dog_friendly: null,
    kid_friendly: null,
    wheelchair_accessible: null,
    google_place_id: null,
    google_rating: null,
    google_review_count: null,
    google_types: null,
    google_phone: null,
    business_status: "OPERATIONAL",
    reservation_platform: null,
    resy_venue_id: null,
    resy_slug: null,
    image_keys: null,
    corner_id: null,
    corner_photo_url: null,
    guide_count: null,
    source_guides: null,
    all_neighborhoods: null,
    quality_score: 5,
    curation_boost: 0,
  } as unknown as Venue;
}

function stubStop(name: string, lat = 40.73, lng = -74.0): ItineraryStop {
  return {
    role: "main",
    venue: stubVenue(name, lat, lng),
    curation_note: "",
    spend_estimate: "$$",
    is_fixed: false,
    plan_b: null,
  };
}

function row(overrides: Partial<SavedItinerary>): SavedItinerary {
  return {
    id: "test-row-id",
    user_id: "test-user-id",
    custom_name: null,
    title: "Test plan",
    subtitle: "",
    occasion: "date",
    neighborhoods: ["west_village"],
    budget: "nice_out",
    vibe: "food_forward",
    day: "2026-06-09",
    start_time: null,
    time_block: "evening",
    stops: [stubStop("Anchor")],
    walking: null,
    weather: null,
    created_at: "2026-06-09T00:00:00Z",
    ...overrides,
  };
}

describe("saved itinerary start_time round-trip (Phase 1 fidelity)", () => {
  describe("fresh saves — start_time column populated", () => {
    for (const startTime of COMPOSE_START_TIMES) {
      it(`preserves startTime=${startTime} through save+hydrate`, () => {
        // Simulates exactly what ActionBar.handleSave writes:
        // start_time = inputs.startTime, time_block hardcoded to "evening".
        const saved = row({ start_time: startTime, time_block: "evening" });
        const hydrated = hydrateSavedItinerary(saved);
        expect(hydrated.inputs.startTime).toBe(startTime);
      });
    }

    it("21:00 hydrates with the wrap-aware end of 02:00 (the bug case)", () => {
      const saved = row({ start_time: "21:00", time_block: "evening" });
      const hydrated = hydrateSavedItinerary(saved);
      expect(hydrated.inputs.startTime).toBe("21:00");
      expect(hydrated.inputs.endTime).toBe("02:00");
    });

    it("17:00 hydrates with the non-wrap end of 22:00", () => {
      const saved = row({ start_time: "17:00", time_block: "evening" });
      const hydrated = hydrateSavedItinerary(saved);
      expect(hydrated.inputs.startTime).toBe("17:00");
      expect(hydrated.inputs.endTime).toBe("22:00");
    });

    it("ignores time_block when start_time is present (the whole point of the fix)", () => {
      // If hydration accidentally read time_block first, this would
      // return 19:00 from the "evening" mapping. start_time must win.
      const saved = row({ start_time: "21:00", time_block: "evening" });
      const hydrated = hydrateSavedItinerary(saved);
      expect(hydrated.inputs.startTime).not.toBe("19:00");
      expect(hydrated.inputs.startTime).toBe("21:00");
    });
  });

  describe("legacy rows — start_time null, fallback to time_block", () => {
    const cases: Array<[string, string, string]> = [
      ["morning", "09:00", "14:00"],
      ["afternoon", "13:00", "18:00"],
      ["evening", "19:00", "00:00"],
      ["late_night", "22:00", "03:00"],
    ];
    for (const [block, expectedStart, expectedEnd] of cases) {
      it(`legacy time_block=${block} hydrates as ${expectedStart}–${expectedEnd}`, () => {
        const saved = row({ start_time: null, time_block: block });
        const hydrated = hydrateSavedItinerary(saved);
        expect(hydrated.inputs.startTime).toBe(expectedStart);
        expect(hydrated.inputs.endTime).toBe(expectedEnd);
      });
    }

    it("legacy row with unknown time_block defaults to 19:00", () => {
      const saved = row({ start_time: null, time_block: "garbage" });
      const hydrated = hydrateSavedItinerary(saved);
      expect(hydrated.inputs.startTime).toBe("19:00");
    });
  });

  describe("intermediate cases", () => {
    it("undefined start_time (older fetch shape) falls back to time_block", () => {
      const saved = row({ time_block: "afternoon" });
      delete (saved as { start_time?: string | null }).start_time;
      const hydrated = hydrateSavedItinerary(saved);
      expect(hydrated.inputs.startTime).toBe("13:00");
    });

    it("empty-string start_time still falls back (defensive)", () => {
      // ?? only coalesces null/undefined; an empty string would pass through
      // and then resolveTimeWindow would balk. Document the behavior so a
      // future change to `||` is a deliberate choice.
      const saved = row({ start_time: "", time_block: "afternoon" });
      const hydrated = hydrateSavedItinerary(saved);
      // Current behavior: empty string passes through as the start. This
      // assertion will break if anyone "fixes" it to fall back — at which
      // point both behavior and test should be revisited.
      expect(hydrated.inputs.startTime).toBe("");
    });
  });
});
