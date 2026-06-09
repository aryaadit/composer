import { describe, it, expect } from "vitest";
import {
  dateToDayColumn,
  venueOpenForWindow,
  type TimeWindow,
} from "@/lib/itinerary/time-blocks";

/**
 * These tests validate the venue filtering pipeline — the logic that
 * determines which venues are eligible for a given day + user window.
 * Phase 1 replaced single-block matching with window-overlap matching.
 */

function makeVenueBlocks(overrides: Partial<Record<string, string[]>> = {}) {
  return {
    time_blocks: overrides.time_blocks ?? [],
    mon_blocks: overrides.mon_blocks ?? [],
    tue_blocks: overrides.tue_blocks ?? [],
    wed_blocks: overrides.wed_blocks ?? [],
    thu_blocks: overrides.thu_blocks ?? [],
    fri_blocks: overrides.fri_blocks ?? [],
    sat_blocks: overrides.sat_blocks ?? [],
    sun_blocks: overrides.sun_blocks ?? [],
  };
}

// Phase 1 representative windows.
const W_EVENING_EARLY: TimeWindow = { startTime: "17:00", endTime: "22:00" };
const W_EVENING_LATE: TimeWindow = { startTime: "19:00", endTime: "00:00" };
const W_NIGHT_LATEST: TimeWindow = { startTime: "21:00", endTime: "02:00" };
const W_MORNING: TimeWindow = { startTime: "09:00", endTime: "14:00" };

// ── Hybrid rule scenarios ─────────────────────────────────────

describe("venue pool — hybrid time block rule (window-based)", () => {
  describe("scenario: dinner-only venue (closed Mon-Tue)", () => {
    const venue = makeVenueBlocks({
      time_blocks: ["evening", "late_night"],
      mon_blocks: [],
      tue_blocks: [],
      wed_blocks: ["evening"],
      thu_blocks: ["evening"],
      fri_blocks: ["evening", "late_night"],
      sat_blocks: ["evening", "late_night"],
      sun_blocks: ["evening"],
    });

    it("is closed Monday for evening window", () => {
      expect(venueOpenForWindow(venue, "mon_blocks", W_EVENING_EARLY)).toBe(false);
    });
    it("is closed Tuesday for evening window", () => {
      expect(venueOpenForWindow(venue, "tue_blocks", W_EVENING_EARLY)).toBe(false);
    });
    it("is open Wednesday for evening window", () => {
      expect(venueOpenForWindow(venue, "wed_blocks", W_EVENING_EARLY)).toBe(true);
    });
    it("is open Friday for late window (21:00-02:00)", () => {
      // Window overlaps both evening tail and late_night.
      expect(venueOpenForWindow(venue, "fri_blocks", W_NIGHT_LATEST)).toBe(true);
    });
    it("is NOT open Friday for morning window", () => {
      expect(venueOpenForWindow(venue, "fri_blocks", W_MORNING)).toBe(false);
    });
  });

  describe("scenario: brunch spot (weekends only)", () => {
    const venue = makeVenueBlocks({
      time_blocks: ["morning", "afternoon"],
      sat_blocks: ["morning", "afternoon"],
      sun_blocks: ["morning", "afternoon"],
    });

    it("is closed Monday for morning window", () => {
      expect(venueOpenForWindow(venue, "mon_blocks", W_MORNING)).toBe(false);
    });
    it("is open Saturday for morning window", () => {
      expect(venueOpenForWindow(venue, "sat_blocks", W_MORNING)).toBe(true);
    });
    it("is NOT open Sunday for evening window (no afternoon→evening overlap)", () => {
      // afternoon ends at 17:00 — the evening window starts at 17:00.
      // End-exclusive boundary means no overlap.
      expect(venueOpenForWindow(venue, "sun_blocks", W_EVENING_EARLY)).toBe(false);
    });
  });

  describe("scenario: no per-day data (global only)", () => {
    const venue = makeVenueBlocks({
      time_blocks: ["afternoon", "evening", "late_night"],
    });

    it("falls back to global for any day", () => {
      expect(venueOpenForWindow(venue, "mon_blocks", W_EVENING_EARLY)).toBe(true);
      expect(venueOpenForWindow(venue, "sun_blocks", W_NIGHT_LATEST)).toBe(true);
    });
    it("morning window doesn't overlap afternoon/evening/late_night", () => {
      expect(venueOpenForWindow(venue, "mon_blocks", W_MORNING)).toBe(true);
      // W_MORNING is 09:00-14:00. afternoon is 12:00-17:00 → overlaps 12-14.
      // So this venue IS open for a morning window via afternoon overlap.
      // Re-test with a strictly-pre-noon window.
      const strictMorning: TimeWindow = { startTime: "09:00", endTime: "11:00" };
      expect(venueOpenForWindow(venue, "mon_blocks", strictMorning)).toBe(false);
    });
  });

  describe("scenario: 19:00 start window overlaps evening AND late_night", () => {
    // The user picks 19:00 → window is 19:00-00:00. Venues open in
    // only late_night should still match (late_night = 22:00-02:00).
    const lateOnly = makeVenueBlocks({
      time_blocks: ["late_night"],
      fri_blocks: ["late_night"],
    });
    const eveningOnly = makeVenueBlocks({
      time_blocks: ["evening"],
      fri_blocks: ["evening"],
    });

    it("late-night-only venue is open for 19:00-00:00", () => {
      expect(venueOpenForWindow(lateOnly, "fri_blocks", W_EVENING_LATE)).toBe(true);
    });
    it("evening-only venue is open for 19:00-00:00", () => {
      expect(venueOpenForWindow(eveningOnly, "fri_blocks", W_EVENING_LATE)).toBe(true);
    });
  });

  describe("scenario: 24/7 venue", () => {
    const allBlocks = ["morning", "afternoon", "evening", "late_night"];
    const venue = makeVenueBlocks({
      time_blocks: allBlocks,
      mon_blocks: allBlocks,
      tue_blocks: allBlocks,
      wed_blocks: allBlocks,
      thu_blocks: allBlocks,
      fri_blocks: allBlocks,
      sat_blocks: allBlocks,
      sun_blocks: allBlocks,
    });

    it("is open every day for every Phase 1 window", () => {
      const days = ["mon_blocks", "tue_blocks", "wed_blocks", "thu_blocks", "fri_blocks", "sat_blocks", "sun_blocks"] as const;
      const windows = [W_EVENING_EARLY, W_EVENING_LATE, W_NIGHT_LATEST];
      for (const day of days) {
        for (const w of windows) {
          expect(venueOpenForWindow(venue, day, w)).toBe(true);
        }
      }
    });
  });
});

// ── Day column mapping edge cases ─────────────────────────────

describe("dateToDayColumn edge cases", () => {
  it("handles Jan 1 (known day)", () => {
    // Jan 1, 2026 is a Thursday
    expect(dateToDayColumn("2026-01-01")).toBe("thu_blocks");
  });
  it("handles Dec 31 (end of year)", () => {
    // Dec 31, 2026 is a Thursday
    expect(dateToDayColumn("2026-12-31")).toBe("thu_blocks");
  });
  it("handles leap year Feb 29", () => {
    // Feb 29, 2028 is a Tuesday
    expect(dateToDayColumn("2028-02-29")).toBe("tue_blocks");
  });
});

// ── Business status filtering (unchanged) ─────────────────────

describe("business status filter (simulated)", () => {
  function filterByStatus(venues: { business_status: string | null }[]) {
    return venues.filter(
      (v) =>
        v.business_status !== "CLOSED_PERMANENTLY" &&
        v.business_status !== "CLOSED_TEMPORARILY"
    );
  }

  it("allows OPERATIONAL venues", () => {
    expect(filterByStatus([{ business_status: "OPERATIONAL" }])).toHaveLength(1);
  });
  it("allows null business_status", () => {
    expect(filterByStatus([{ business_status: null }])).toHaveLength(1);
  });
  it("filters CLOSED_PERMANENTLY", () => {
    expect(filterByStatus([{ business_status: "CLOSED_PERMANENTLY" }])).toHaveLength(0);
  });
  it("filters CLOSED_TEMPORARILY", () => {
    expect(filterByStatus([{ business_status: "CLOSED_TEMPORARILY" }])).toHaveLength(0);
  });
});
