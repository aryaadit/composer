import { describe, it, expect } from "vitest";
import {
  isSlotInWindow,
  dateToDayColumn,
  effectiveBlocksForDay,
  venueOpenForWindow,
  windowCoverageFraction,
  formatSlotTimeForDisplay,
  formatStartTimeLabel,
  formatWindowLabel,
  resolveTimeWindow,
  startTimeFromLegacyBlock,
  isComposeStartTime,
  COMPOSE_START_TIMES,
  TIME_BLOCKS,
  type TimeWindow,
} from "@/lib/itinerary/time-blocks";

// ── isSlotInWindow ────────────────────────────────────────────
// Replaces the prior isSlotInBlock tests. Window endpoint is
// start-inclusive, end-exclusive (mirrors the old block semantics);
// the wrap case is exercised by 19:00-00:00 and 21:00-02:00.

describe("isSlotInWindow", () => {
  describe("non-wrapping window 17:00-22:00", () => {
    const w: TimeWindow = { startTime: "17:00", endTime: "22:00" };
    it("17:00 is in (start-inclusive)", () => {
      expect(isSlotInWindow("2026-05-10 17:00:00", w)).toBe(true);
    });
    it("21:59 is in", () => {
      expect(isSlotInWindow("2026-05-10 21:59:00", w)).toBe(true);
    });
    it("22:00 is NOT in (end-exclusive)", () => {
      expect(isSlotInWindow("2026-05-10 22:00:00", w)).toBe(false);
    });
    it("16:59 is NOT in", () => {
      expect(isSlotInWindow("2026-05-10 16:59:00", w)).toBe(false);
    });
  });

  describe("wrapping window 19:00-00:00", () => {
    const w: TimeWindow = { startTime: "19:00", endTime: "00:00" };
    it("19:00 is in", () => {
      expect(isSlotInWindow("19:00", w)).toBe(true);
    });
    it("23:30 is in", () => {
      expect(isSlotInWindow("2026-05-10 23:30:00", w)).toBe(true);
    });
    it("00:00 is end-exclusive (NOT in)", () => {
      expect(isSlotInWindow("2026-05-11 00:00:00", w)).toBe(false);
    });
    it("18:59 is NOT in (before window)", () => {
      expect(isSlotInWindow("18:59", w)).toBe(false);
    });
  });

  describe("wrapping window 21:00-02:00 (latest start)", () => {
    const w: TimeWindow = { startTime: "21:00", endTime: "02:00" };
    it("21:00 is in", () => {
      expect(isSlotInWindow("21:00", w)).toBe(true);
    });
    it("00:30 is in (after midnight)", () => {
      expect(isSlotInWindow("00:30", w)).toBe(true);
    });
    it("01:59 is in", () => {
      expect(isSlotInWindow("01:59", w)).toBe(true);
    });
    it("02:00 is NOT in (end-exclusive)", () => {
      expect(isSlotInWindow("02:00", w)).toBe(false);
    });
    it("20:59 is NOT in", () => {
      expect(isSlotInWindow("20:59", w)).toBe(false);
    });
  });

  it("works with HH:MM input (no date)", () => {
    const w: TimeWindow = { startTime: "17:00", endTime: "22:00" };
    expect(isSlotInWindow("19:30", w)).toBe(true);
    expect(isSlotInWindow("08:00", w)).toBe(false);
  });
});

// ── dateToDayColumn ───────────────────────────────────────────

describe("dateToDayColumn", () => {
  it("maps Monday to mon_blocks", () => {
    expect(dateToDayColumn("2026-04-27")).toBe("mon_blocks"); // Monday
  });
  it("maps Friday to fri_blocks", () => {
    expect(dateToDayColumn("2026-04-24")).toBe("fri_blocks");
  });
  it("maps Saturday to sat_blocks", () => {
    expect(dateToDayColumn("2026-04-25")).toBe("sat_blocks");
  });
  it("maps Sunday to sun_blocks", () => {
    expect(dateToDayColumn("2026-04-26")).toBe("sun_blocks");
  });
});

// ── effectiveBlocksForDay (hybrid rule, unchanged behavior) ───

describe("effectiveBlocksForDay", () => {
  const emptyVenue = {
    time_blocks: ["morning", "afternoon", "evening"],
    mon_blocks: [] as string[],
    tue_blocks: [] as string[],
    wed_blocks: [] as string[],
    thu_blocks: [] as string[],
    fri_blocks: [] as string[],
    sat_blocks: [] as string[],
    sun_blocks: [] as string[],
  };

  const perDayVenue = {
    time_blocks: ["morning", "afternoon", "evening", "late_night"],
    mon_blocks: [] as string[],
    tue_blocks: ["evening"] as string[],
    wed_blocks: ["evening"] as string[],
    thu_blocks: ["evening"] as string[],
    fri_blocks: ["evening", "late_night"] as string[],
    sat_blocks: ["afternoon", "evening", "late_night"] as string[],
    sun_blocks: ["afternoon", "evening"] as string[],
  };

  describe("all per-day empty → falls back to global", () => {
    it("returns global time_blocks for Monday", () => {
      expect(effectiveBlocksForDay(emptyVenue, "mon_blocks")).toEqual([
        "morning", "afternoon", "evening",
      ]);
    });
  });

  describe("some per-day populated → trusts per-day", () => {
    it("returns empty for Monday (closed)", () => {
      expect(effectiveBlocksForDay(perDayVenue, "mon_blocks")).toEqual([]);
    });
    it("returns per-day data for Friday", () => {
      expect(effectiveBlocksForDay(perDayVenue, "fri_blocks")).toEqual([
        "evening", "late_night",
      ]);
    });
  });
});

// ── venueOpenForWindow ────────────────────────────────────────
// Replaces venueOpenForBlock. The compose window must overlap at
// least one of the venue's effective blocks for the day.

describe("venueOpenForWindow", () => {
  const dinnerOnly = {
    time_blocks: ["evening"],
    mon_blocks: [] as string[],
    tue_blocks: ["evening"] as string[],
    wed_blocks: [] as string[],
    thu_blocks: [] as string[],
    fri_blocks: ["evening", "late_night"] as string[],
    sat_blocks: ["evening"] as string[],
    sun_blocks: [] as string[],
  };

  const brunchOnly = {
    time_blocks: ["morning", "afternoon"],
    mon_blocks: [] as string[],
    tue_blocks: [] as string[],
    wed_blocks: [] as string[],
    thu_blocks: [] as string[],
    fri_blocks: [] as string[],
    sat_blocks: ["morning", "afternoon"] as string[],
    sun_blocks: ["morning", "afternoon"] as string[],
  };

  it("evening venue open on Tuesday 5pm-10pm window", () => {
    expect(
      venueOpenForWindow(dinnerOnly, "tue_blocks", {
        startTime: "17:00",
        endTime: "22:00",
      })
    ).toBe(true);
  });

  it("evening venue closed on Monday (per-day empty)", () => {
    expect(
      venueOpenForWindow(dinnerOnly, "mon_blocks", {
        startTime: "17:00",
        endTime: "22:00",
      })
    ).toBe(false);
  });

  it("evening-only venue open for 21:00-02:00 window (evening overlaps)", () => {
    // The user picks 21:00; window is 21:00-02:00. evening (17-22)
    // overlaps the first hour of the window.
    expect(
      venueOpenForWindow(dinnerOnly, "fri_blocks", {
        startTime: "21:00",
        endTime: "02:00",
      })
    ).toBe(true);
  });

  it("late_night venue open for 19:00-00:00 window (late_night overlaps)", () => {
    const lateOnly = {
      ...dinnerOnly,
      time_blocks: ["late_night"],
      tue_blocks: ["late_night"] as string[],
    };
    expect(
      venueOpenForWindow(lateOnly, "tue_blocks", {
        startTime: "19:00",
        endTime: "00:00",
      })
    ).toBe(true);
  });

  it("brunch-only venue closed for evening window", () => {
    expect(
      venueOpenForWindow(brunchOnly, "sat_blocks", {
        startTime: "19:00",
        endTime: "00:00",
      })
    ).toBe(false);
  });

  it("brunch-only venue closed on weekday (per-day empty)", () => {
    expect(
      venueOpenForWindow(brunchOnly, "mon_blocks", {
        startTime: "17:00",
        endTime: "22:00",
      })
    ).toBe(false);
  });
});

// ── windowCoverageFraction ─────────────────────────────────────
// Replaces blockCoverageFraction. 1.0 = covered in both per-day
// and global, 0.5 = either, 0.0 = neither.

describe("windowCoverageFraction", () => {
  const window: TimeWindow = { startTime: "17:00", endTime: "22:00" };

  it("returns 1.0 when both global and per-day overlap", () => {
    const venue = {
      time_blocks: ["evening"],
      mon_blocks: [] as string[],
      tue_blocks: [] as string[],
      wed_blocks: [] as string[],
      thu_blocks: [] as string[],
      fri_blocks: ["evening"] as string[],
      sat_blocks: [] as string[],
      sun_blocks: [] as string[],
    };
    expect(windowCoverageFraction(venue, "fri_blocks", window)).toBe(1.0);
  });

  it("returns 0.5 when only per-day overlaps", () => {
    const venue = {
      time_blocks: ["morning"],
      mon_blocks: [] as string[],
      tue_blocks: [] as string[],
      wed_blocks: [] as string[],
      thu_blocks: [] as string[],
      fri_blocks: ["evening"] as string[],
      sat_blocks: [] as string[],
      sun_blocks: [] as string[],
    };
    expect(windowCoverageFraction(venue, "fri_blocks", window)).toBe(0.5);
  });

  it("returns 0.5 when only global overlaps", () => {
    const venue = {
      time_blocks: ["evening"],
      mon_blocks: [] as string[],
      tue_blocks: [] as string[],
      wed_blocks: [] as string[],
      thu_blocks: [] as string[],
      fri_blocks: ["morning"] as string[],
      sat_blocks: [] as string[],
      sun_blocks: [] as string[],
    };
    expect(windowCoverageFraction(venue, "fri_blocks", window)).toBe(0.5);
  });

  it("returns 0.0 when neither overlaps", () => {
    const venue = {
      time_blocks: ["morning"],
      mon_blocks: [] as string[],
      tue_blocks: [] as string[],
      wed_blocks: [] as string[],
      thu_blocks: [] as string[],
      fri_blocks: ["morning"] as string[],
      sat_blocks: [] as string[],
      sun_blocks: [] as string[],
    };
    expect(windowCoverageFraction(venue, "fri_blocks", window)).toBe(0.0);
  });
});

// ── formatSlotTimeForDisplay (unchanged) ──────────────────────

describe("formatSlotTimeForDisplay", () => {
  it("formats 19:30 as 7:30 PM", () => {
    expect(formatSlotTimeForDisplay("2026-04-25 19:30:00")).toBe("7:30 PM");
  });
  it("formats 08:00 as 8 AM (no minutes)", () => {
    expect(formatSlotTimeForDisplay("2026-04-25 08:00:00")).toBe("8 AM");
  });
  it("formats 12:00 as 12 PM", () => {
    expect(formatSlotTimeForDisplay("12:00")).toBe("12 PM");
  });
  it("formats 00:00 as 12 AM", () => {
    expect(formatSlotTimeForDisplay("00:00")).toBe("12 AM");
  });
});

// ── resolveTimeWindow (new signature: startTime → window) ─────

describe("resolveTimeWindow", () => {
  it("17:00 → 17:00-22:00", () => {
    expect(resolveTimeWindow("17:00")).toEqual({
      startTime: "17:00",
      endTime: "22:00",
    });
  });
  it("19:00 → 19:00-00:00 (wraps to midnight)", () => {
    expect(resolveTimeWindow("19:00")).toEqual({
      startTime: "19:00",
      endTime: "00:00",
    });
  });
  it("21:00 → 21:00-02:00 (caps semantically at 02:00)", () => {
    expect(resolveTimeWindow("21:00")).toEqual({
      startTime: "21:00",
      endTime: "02:00",
    });
  });
});

// ── startTimeFromLegacyBlock (saved itinerary fallback) ───────

describe("startTimeFromLegacyBlock", () => {
  it("morning → 09:00", () => {
    expect(startTimeFromLegacyBlock("morning")).toBe("09:00");
  });
  it("afternoon → 13:00", () => {
    expect(startTimeFromLegacyBlock("afternoon")).toBe("13:00");
  });
  it("evening → 19:00 (Phase 1 default)", () => {
    expect(startTimeFromLegacyBlock("evening")).toBe("19:00");
  });
  it("late_night → 22:00", () => {
    expect(startTimeFromLegacyBlock("late_night")).toBe("22:00");
  });
  it("null/undefined → 19:00", () => {
    expect(startTimeFromLegacyBlock(null)).toBe("19:00");
    expect(startTimeFromLegacyBlock(undefined)).toBe("19:00");
  });
  it("unknown values → 19:00", () => {
    expect(startTimeFromLegacyBlock("dinner")).toBe("19:00");
  });
});

// ── isComposeStartTime ────────────────────────────────────────

describe("isComposeStartTime", () => {
  it("accepts all five Phase 1 values", () => {
    for (const t of COMPOSE_START_TIMES) {
      expect(isComposeStartTime(t)).toBe(true);
    }
  });
  it("rejects an HH:MM outside the set", () => {
    expect(isComposeStartTime("16:00")).toBe(false);
    expect(isComposeStartTime("22:00")).toBe(false);
  });
  it("rejects non-strings", () => {
    expect(isComposeStartTime(17)).toBe(false);
    expect(isComposeStartTime(null)).toBe(false);
    expect(isComposeStartTime(undefined)).toBe(false);
  });
});

// ── formatStartTimeLabel + formatWindowLabel ──────────────────

describe("formatStartTimeLabel", () => {
  it("formats 17:00 as 5 PM", () => {
    expect(formatStartTimeLabel("17:00")).toBe("5 PM");
  });
  it("formats 21:00 as 9 PM", () => {
    expect(formatStartTimeLabel("21:00")).toBe("9 PM");
  });
  it("formats 09:00 as 9 AM", () => {
    expect(formatStartTimeLabel("09:00")).toBe("9 AM");
  });
});

describe("formatWindowLabel", () => {
  it("17:00-22:00 → '5 PM – 10 PM'", () => {
    expect(formatWindowLabel({ startTime: "17:00", endTime: "22:00" })).toBe(
      "5 PM – 10 PM"
    );
  });
  it("19:00-00:00 → '7 PM – Midnight'", () => {
    expect(formatWindowLabel({ startTime: "19:00", endTime: "00:00" })).toBe(
      "7 PM – Midnight"
    );
  });
  it("21:00-02:00 → '9 PM – 2 AM'", () => {
    expect(formatWindowLabel({ startTime: "21:00", endTime: "02:00" })).toBe(
      "9 PM – 2 AM"
    );
  });
});

// ── Constants ─────────────────────────────────────────────────

describe("constants", () => {
  it("COMPOSE_START_TIMES has 5 values", () => {
    expect(COMPOSE_START_TIMES).toEqual(["17:00", "18:00", "19:00", "20:00", "21:00"]);
  });
  it("TIME_BLOCKS still has 4 entries (internal venue-side type)", () => {
    expect(TIME_BLOCKS).toHaveLength(4);
  });
});
