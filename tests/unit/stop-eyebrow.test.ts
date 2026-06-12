import { describe, expect, it } from "vitest";
import { getStopEyebrowLabel, STOP_EYEBROW } from "@/lib/format/stop-eyebrow";
import type { ItineraryStop, StopRole, Venue } from "@/types";

// Board item 2 (label half) — stop eyebrows derive from position in
// the night, not from the role slug. The pre-redesign render leaned
// on ROLE_LABELS keyed by stop.role, which mis-labeled the last stop
// of a 3-stop plan as "Start here" whenever scoring landed two
// openers in a row. This helper is the single source of truth that
// every surface (itinerary view, home hero, saved/share, future) now
// consumes.

function makeStop(role: StopRole, name = "Stop"): ItineraryStop {
  // Minimal shape — only `role` is read by the helper. Everything
  // else just satisfies the typed signature.
  const venue = {
    id: name,
    name,
    neighborhood: "test",
    category: null,
    price_tier: 2,
    vibe_tags: [],
    occasion_tags: [],
    stop_roles: [role],
    time_blocks: [],
    duration_hours: 1,
    outdoor_seating: false,
    reservation_difficulty: 0,
    reservation_url: null,
    maps_url: "",
    curation_note: "",
    awards: null,
    curated_by: null,
    signature_order: null,
    address: "",
    latitude: 0,
    longitude: 0,
    active: true,
    image_keys: [],
    quality_score: 0,
    curation_boost: 0,
  } as unknown as Venue;
  return {
    venue,
    role,
    spend_estimate: "",
    curation_note: "",
    is_fixed: false,
    plan_b: null,
  } satisfies ItineraryStop;
}

describe("getStopEyebrowLabel — position-aware stop labels", () => {
  it("first stop is always 'Start here'", () => {
    const stops = [makeStop("opener"), makeStop("main")];
    expect(getStopEyebrowLabel(stops[0], 0, stops)).toBe(STOP_EYEBROW.first);
  });

  it("the main stop reads 'The main event'", () => {
    const stops = [makeStop("opener"), makeStop("main"), makeStop("closer")];
    expect(getStopEyebrowLabel(stops[1], 1, stops)).toBe(STOP_EYEBROW.main);
  });

  it("a normal 3-stop plan labels the last stop as the closer", () => {
    const stops = [makeStop("opener"), makeStop("main"), makeStop("closer")];
    expect(getStopEyebrowLabel(stops[2], 2, stops)).toBe(STOP_EYEBROW.closer);
  });

  it("REGRESSION: a 3-stop plan with role='opener' on the last stop still labels it as closer (no more START HERE on the tail)", () => {
    // The bug the board called out: scoring lands two openers; the
    // last stop's role slug is "opener" but it sits AFTER the main,
    // so it must read as the closer.
    const stops = [makeStop("opener"), makeStop("main"), makeStop("opener")];
    expect(getStopEyebrowLabel(stops[2], 2, stops)).toBe(STOP_EYEBROW.closer);
    // And the bug surface: NOT "Start here" on the third stop.
    expect(getStopEyebrowLabel(stops[2], 2, stops)).not.toBe(
      STOP_EYEBROW.first,
    );
  });

  it("any stop after the main reads the closer label, regardless of role", () => {
    const stops = [
      makeStop("opener"),
      makeStop("main"),
      makeStop("opener"),
      makeStop("opener"),
    ];
    expect(getStopEyebrowLabel(stops[2], 2, stops)).toBe(STOP_EYEBROW.closer);
    expect(getStopEyebrowLabel(stops[3], 3, stops)).toBe(STOP_EYEBROW.closer);
  });

  it("pre-main non-first stops fall through to the role-driven label", () => {
    // 4-stop plan with TWO openers stacked before the main. Index 1
    // is pre-main, non-first, role=opener → fall-through label
    // (ROLE_LABELS opener = "Start here"). Rare but honest.
    const stops = [
      makeStop("opener"),
      makeStop("opener"),
      makeStop("main"),
      makeStop("closer"),
    ];
    expect(getStopEyebrowLabel(stops[1], 1, stops)).toBe("Start here");
    expect(getStopEyebrowLabel(stops[2], 2, stops)).toBe(STOP_EYEBROW.main);
    expect(getStopEyebrowLabel(stops[3], 3, stops)).toBe(STOP_EYEBROW.closer);
  });

  it("when no main is present, the last stop still labels as closer (defensive)", () => {
    // composer.ts almost always plants a main, but if a degenerate
    // 2-stop plan ever lands without one, the tail should not
    // silently relapse to "Start here" via role fallback.
    const stops = [makeStop("opener"), makeStop("closer")];
    expect(getStopEyebrowLabel(stops[0], 0, stops)).toBe(STOP_EYEBROW.first);
    expect(getStopEyebrowLabel(stops[1], 1, stops)).toBe(STOP_EYEBROW.closer);
  });

  it("STOP_EYEBROW constants are stable copy (regression tripwire)", () => {
    // Pin the strings so a stray rename gets flagged. Changing these
    // is intentional product work, not a refactor side-effect.
    expect(STOP_EYEBROW.first).toBe("Start here");
    expect(STOP_EYEBROW.main).toBe("The main event");
    expect(STOP_EYEBROW.closer).toBe("Last call");
  });
});
