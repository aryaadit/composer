import { describe, it, expect } from "vitest";
import {
  isSlotInBlock,
  dateToDayColumn,
  effectiveBlocksForDay,
  venueOpenForBlock,
  formatSlotTimeForDisplay,
  formatBlockChipLabel,
  resolveTimeWindow,
  DEFAULT_TIME_BLOCK,
  TIME_BLOCKS,
} from "@/lib/itinerary/time-blocks";

// ── isSlotInBlock ─────────────────────────────────────────────

describe("isSlotInBlock", () => {
  describe("morning (08:00–12:00)", () => {
    it("08:00 is morning (start-inclusive)", () => {
      expect(isSlotInBlock("2026-05-10 08:00:00", "morning")).toBe(true);
    });
    it("11:59 is morning", () => {
      expect(isSlotInBlock("2026-05-10 11:59:00", "morning")).toBe(true);
    });
    it("12:00 is NOT morning (end-exclusive)", () => {
      expect(isSlotInBlock("2026-05-10 12:00:00", "morning")).toBe(false);
    });
    it("07:59 is NOT morning", () => {
      expect(isSlotInBlock("2026-05-10 07:59:00", "morning")).toBe(false);
    });
  });

  describe("afternoon (12:00–17:00)", () => {
    it("12:00 is afternoon", () => {
      expect(isSlotInBlock("2026-05-10 12:00:00", "afternoon")).toBe(true);
    });
    it("16:59 is afternoon", () => {
      expect(isSlotInBlock("2026-05-10 16:59:00", "afternoon")).toBe(true);
    });
    it("17:00 is NOT afternoon", () => {
      expect(isSlotInBlock("2026-05-10 17:00:00", "afternoon")).toBe(false);
    });
  });

  describe("evening (17:00–22:00)", () => {
    it("17:00 is evening (boundary)", () => {
      expect(isSlotInBlock("2026-05-10 17:00:00", "evening")).toBe(true);
    });
    it("21:59 is evening", () => {
      expect(isSlotInBlock("2026-05-10 21:59:00", "evening")).toBe(true);
    });
    it("22:00 is NOT evening", () => {
      expect(isSlotInBlock("2026-05-10 22:00:00", "evening")).toBe(false);
    });
  });

  describe("late_night (22:00–02:00, midnight wrap)", () => {
    it("22:00 is late_night", () => {
      expect(isSlotInBlock("2026-05-10 22:00:00", "late_night")).toBe(true);
    });
    it("23:30 is late_night", () => {
      expect(isSlotInBlock("2026-05-10 23:30:00", "late_night")).toBe(true);
    });
    it("00:00 is late_night (midnight)", () => {
      expect(isSlotInBlock("2026-05-11 00:00:00", "late_night")).toBe(true);
    });
    it("01:59 is late_night", () => {
      expect(isSlotInBlock("2026-05-11 01:59:00", "late_night")).toBe(true);
    });
    it("02:00 is NOT late_night", () => {
      expect(isSlotInBlock("2026-05-11 02:00:00", "late_night")).toBe(false);
    });
    it("21:59 is NOT late_night", () => {
      expect(isSlotInBlock("2026-05-10 21:59:00", "late_night")).toBe(false);
    });
  });

  describe("cross-block exclusivity", () => {
    it("17:00 is evening but not afternoon", () => {
      expect(isSlotInBlock("2026-05-10 17:00:00", "evening")).toBe(true);
      expect(isSlotInBlock("2026-05-10 17:00:00", "afternoon")).toBe(false);
    });
    it("12:00 is afternoon but not morning", () => {
      expect(isSlotInBlock("2026-05-10 12:00:00", "afternoon")).toBe(true);
      expect(isSlotInBlock("2026-05-10 12:00:00", "morning")).toBe(false);
    });
    it("22:00 is late_night but not evening", () => {
      expect(isSlotInBlock("2026-05-10 22:00:00", "late_night")).toBe(true);
      expect(isSlotInBlock("2026-05-10 22:00:00", "evening")).toBe(false);
    });
  });

  it("works with HH:MM input (no date)", () => {
    expect(isSlotInBlock("19:30", "evening")).toBe(true);
    expect(isSlotInBlock("08:00", "morning")).toBe(true);
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

// ── effectiveBlocksForDay (hybrid rule) ───────────────────────

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

  const fullVenue = {
    time_blocks: ["morning", "afternoon", "evening"],
    mon_blocks: ["evening"] as string[],
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
    it("returns global time_blocks for Saturday", () => {
      expect(effectiveBlocksForDay(emptyVenue, "sat_blocks")).toEqual([
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
    it("returns per-day data for Saturday", () => {
      expect(effectiveBlocksForDay(perDayVenue, "sat_blocks")).toEqual([
        "afternoon", "evening", "late_night",
      ]);
    });
  });

  describe("all per-day populated → uses per-day", () => {
    it("returns mon_blocks for Monday", () => {
      expect(effectiveBlocksForDay(fullVenue, "mon_blocks")).toEqual(["evening"]);
    });
  });
});

// ── venueOpenForBlock ─────────────────────────────────────────

describe("venueOpenForBlock", () => {
  const venue = {
    time_blocks: ["morning", "afternoon", "evening"],
    mon_blocks: [] as string[],
    tue_blocks: ["evening"] as string[],
    wed_blocks: [] as string[],
    thu_blocks: [] as string[],
    fri_blocks: ["evening", "late_night"] as string[],
    sat_blocks: ["afternoon", "evening"] as string[],
    sun_blocks: [] as string[],
  };

  it("closed Monday evening (has per-day data, mon empty)", () => {
    expect(venueOpenForBlock(venue, "mon_blocks", "evening")).toBe(false);
  });
  it("open Tuesday evening", () => {
    expect(venueOpenForBlock(venue, "tue_blocks", "evening")).toBe(true);
  });
  it("open Friday late_night", () => {
    expect(venueOpenForBlock(venue, "fri_blocks", "late_night")).toBe(true);
  });
  it("closed Friday morning", () => {
    expect(venueOpenForBlock(venue, "fri_blocks", "morning")).toBe(false);
  });
  it("open Saturday afternoon", () => {
    expect(venueOpenForBlock(venue, "sat_blocks", "afternoon")).toBe(true);
  });
});

// ── formatSlotTimeForDisplay ──────────────────────────────────

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
  it("formats 17:00 as 5 PM", () => {
    expect(formatSlotTimeForDisplay("17:00")).toBe("5 PM");
  });
});

// ── resolveTimeWindow ─────────────────────────────────────────

describe("resolveTimeWindow", () => {
  it("morning resolves to 08:00–12:00", () => {
    expect(resolveTimeWindow("morning")).toEqual({
      startTime: "08:00",
      endTime: "12:00",
    });
  });
  it("evening resolves to 17:00–22:00", () => {
    expect(resolveTimeWindow("evening")).toEqual({
      startTime: "17:00",
      endTime: "22:00",
    });
  });
  it("late_night wraps past midnight to 02:00", () => {
    expect(resolveTimeWindow("late_night")).toEqual({
      startTime: "22:00",
      endTime: "02:00",
    });
  });
});

// ── Constants ─────────────────────────────────────────────────

describe("constants", () => {
  it("DEFAULT_TIME_BLOCK is evening", () => {
    expect(DEFAULT_TIME_BLOCK).toBe("evening");
  });
  it("TIME_BLOCKS has 4 entries", () => {
    expect(TIME_BLOCKS).toHaveLength(4);
  });
  it("each block has required metadata", () => {
    for (const block of TIME_BLOCKS) {
      expect(block.id).toBeTruthy();
      expect(block.label).toBeTruthy();
      expect(block.shortRange).toBeTruthy();
      expect(block.range.start).toMatch(/^\d{2}:\d{2}$/);
      expect(block.range.end).toMatch(/^\d{2}:\d{2}$/);
    }
  });
  it("formatBlockChipLabel includes label and range", () => {
    const label = formatBlockChipLabel("evening");
    expect(label).toContain("Evening");
    expect(label).toContain("5p");
    expect(label).toContain("10p");
  });
});
