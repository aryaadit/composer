import { describe, it, expect } from "vitest";
import {
  dateToDayColumn,
  venueOpenForBlock,
  effectiveBlocksForDay,
} from "@/lib/itinerary/time-blocks";
import type { Venue } from "@/types";

/**
 * These tests validate the venue filtering pipeline — the logic that
 * determines which venues are eligible for a given day + time block.
 * They use synthetic venue data to test edge cases that would be hard
 * to catch with real DB data.
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

// ── Hybrid rule scenarios ─────────────────────────────────────

describe("venue pool — hybrid time block rule", () => {
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

    it("is closed Monday evening", () => {
      expect(venueOpenForBlock(venue, "mon_blocks", "evening")).toBe(false);
    });
    it("is closed Tuesday evening", () => {
      expect(venueOpenForBlock(venue, "tue_blocks", "evening")).toBe(false);
    });
    it("is open Wednesday evening", () => {
      expect(venueOpenForBlock(venue, "wed_blocks", "evening")).toBe(true);
    });
    it("is open Friday late_night", () => {
      expect(venueOpenForBlock(venue, "fri_blocks", "late_night")).toBe(true);
    });
    it("is NOT open Friday morning", () => {
      expect(venueOpenForBlock(venue, "fri_blocks", "morning")).toBe(false);
    });
  });

  describe("scenario: brunch spot (weekends only)", () => {
    const venue = makeVenueBlocks({
      time_blocks: ["morning", "afternoon"],
      mon_blocks: [],
      tue_blocks: [],
      wed_blocks: [],
      thu_blocks: [],
      fri_blocks: [],
      sat_blocks: ["morning", "afternoon"],
      sun_blocks: ["morning", "afternoon"],
    });

    it("is closed Monday morning", () => {
      expect(venueOpenForBlock(venue, "mon_blocks", "morning")).toBe(false);
    });
    it("is open Saturday morning", () => {
      expect(venueOpenForBlock(venue, "sat_blocks", "morning")).toBe(true);
    });
    it("is open Sunday afternoon", () => {
      expect(venueOpenForBlock(venue, "sun_blocks", "afternoon")).toBe(true);
    });
    it("is NOT open Sunday evening", () => {
      expect(venueOpenForBlock(venue, "sun_blocks", "evening")).toBe(false);
    });
  });

  describe("scenario: no per-day data (Corner import, global only)", () => {
    const venue = makeVenueBlocks({
      time_blocks: ["afternoon", "evening", "late_night"],
    });

    it("falls back to global for any day", () => {
      expect(venueOpenForBlock(venue, "mon_blocks", "evening")).toBe(true);
      expect(venueOpenForBlock(venue, "sat_blocks", "afternoon")).toBe(true);
      expect(venueOpenForBlock(venue, "sun_blocks", "late_night")).toBe(true);
    });
    it("respects global — morning not in global", () => {
      expect(venueOpenForBlock(venue, "mon_blocks", "morning")).toBe(false);
    });
  });

  describe("scenario: venue with empty global but populated per-day", () => {
    const venue = makeVenueBlocks({
      time_blocks: [],
      fri_blocks: ["evening"],
      sat_blocks: ["evening", "late_night"],
    });

    it("uses per-day even with empty global", () => {
      expect(venueOpenForBlock(venue, "fri_blocks", "evening")).toBe(true);
      expect(venueOpenForBlock(venue, "sat_blocks", "late_night")).toBe(true);
    });
    it("empty per-day = closed (not fallback to empty global)", () => {
      expect(venueOpenForBlock(venue, "mon_blocks", "evening")).toBe(false);
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

    it("is open every block every day", () => {
      const days = ["mon_blocks", "tue_blocks", "wed_blocks", "thu_blocks", "fri_blocks", "sat_blocks", "sun_blocks"] as const;
      for (const day of days) {
        for (const block of allBlocks) {
          expect(venueOpenForBlock(venue, day, block as any)).toBe(true);
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

// ── Business status filtering ─────────────────────────────────

describe("business status filter (simulated)", () => {
  // These test the filter logic that lives in generate/route.ts.
  // We simulate it here since we can't import the route handler.

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
