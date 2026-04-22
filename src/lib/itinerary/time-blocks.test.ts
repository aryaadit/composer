import { describe, it, expect } from "vitest";
import {
  isSlotInBlock,
  getBlockMetadata,
  formatBlockChipLabel,
  DEFAULT_TIME_BLOCK,
} from "./time-blocks";

describe("isSlotInBlock", () => {
  // ── Morning (08:00–12:00) ──────────────────────────────
  it("08:00 belongs to morning (start-inclusive)", () => {
    expect(isSlotInBlock("2026-05-10 08:00:00", "morning")).toBe(true);
  });
  it("11:59 belongs to morning", () => {
    expect(isSlotInBlock("2026-05-10 11:59:00", "morning")).toBe(true);
  });
  it("12:00 does NOT belong to morning (end-exclusive)", () => {
    expect(isSlotInBlock("2026-05-10 12:00:00", "morning")).toBe(false);
  });
  it("07:59 does NOT belong to morning", () => {
    expect(isSlotInBlock("2026-05-10 07:59:00", "morning")).toBe(false);
  });

  // ── Afternoon (12:00–17:00) ────────────────────────────
  it("12:00 belongs to afternoon (start-inclusive)", () => {
    expect(isSlotInBlock("2026-05-10 12:00:00", "afternoon")).toBe(true);
  });
  it("12:01 belongs to afternoon", () => {
    expect(isSlotInBlock("2026-05-10 12:01:00", "afternoon")).toBe(true);
  });
  it("16:59 belongs to afternoon", () => {
    expect(isSlotInBlock("2026-05-10 16:59:00", "afternoon")).toBe(true);
  });
  it("17:00 does NOT belong to afternoon", () => {
    expect(isSlotInBlock("2026-05-10 17:00:00", "afternoon")).toBe(false);
  });

  // ── Evening (17:00–22:00) ──────────────────────────────
  it("17:00 belongs to evening (boundary: evening, not afternoon)", () => {
    expect(isSlotInBlock("2026-05-10 17:00:00", "evening")).toBe(true);
  });
  it("21:59 belongs to evening", () => {
    expect(isSlotInBlock("2026-05-10 21:59:00", "evening")).toBe(true);
  });
  it("22:00 does NOT belong to evening", () => {
    expect(isSlotInBlock("2026-05-10 22:00:00", "evening")).toBe(false);
  });

  // ── Late Night (22:00–02:00, midnight wrap) ────────────
  it("22:00 belongs to late_night (start-inclusive)", () => {
    expect(isSlotInBlock("2026-05-10 22:00:00", "late_night")).toBe(true);
  });
  it("23:30 belongs to late_night", () => {
    expect(isSlotInBlock("2026-05-10 23:30:00", "late_night")).toBe(true);
  });
  it("00:00 belongs to late_night (midnight)", () => {
    expect(isSlotInBlock("2026-05-11 00:00:00", "late_night")).toBe(true);
  });
  it("01:30 belongs to late_night (after midnight)", () => {
    expect(isSlotInBlock("2026-05-11 01:30:00", "late_night")).toBe(true);
  });
  it("01:59 belongs to late_night", () => {
    expect(isSlotInBlock("2026-05-11 01:59:00", "late_night")).toBe(true);
  });
  it("02:00 does NOT belong to late_night (end-exclusive)", () => {
    expect(isSlotInBlock("2026-05-11 02:00:00", "late_night")).toBe(false);
  });
  it("03:00 does NOT belong to late_night", () => {
    expect(isSlotInBlock("2026-05-11 03:00:00", "late_night")).toBe(false);
  });
  it("21:59 does NOT belong to late_night", () => {
    expect(isSlotInBlock("2026-05-10 21:59:00", "late_night")).toBe(false);
  });

  // ── Cross-block exclusivity ────────────────────────────
  it("17:00 is in evening but not afternoon", () => {
    expect(isSlotInBlock("2026-05-10 17:00:00", "evening")).toBe(true);
    expect(isSlotInBlock("2026-05-10 17:00:00", "afternoon")).toBe(false);
  });
  it("12:00 is in afternoon but not morning", () => {
    expect(isSlotInBlock("2026-05-10 12:00:00", "afternoon")).toBe(true);
    expect(isSlotInBlock("2026-05-10 12:00:00", "morning")).toBe(false);
  });

  // ── HH:MM only input (no date) ────────────────────────
  it("works with HH:MM input (no date prefix)", () => {
    expect(isSlotInBlock("19:30", "evening")).toBe(true);
    expect(isSlotInBlock("08:00", "morning")).toBe(true);
  });
});

describe("getBlockMetadata", () => {
  it("returns correct metadata for evening", () => {
    const meta = getBlockMetadata("evening");
    expect(meta.id).toBe("evening");
    expect(meta.label).toBe("Evening");
    expect(meta.range.start).toBe("17:00");
    expect(meta.range.end).toBe("22:00");
  });

  it("throws for unknown block", () => {
    expect(() => getBlockMetadata("brunch" as never)).toThrow();
  });
});

describe("formatBlockChipLabel", () => {
  it("formats evening chip label", () => {
    const label = formatBlockChipLabel("evening");
    expect(label).toContain("Evening");
    expect(label).toContain("5p");
    expect(label).toContain("10p");
  });
});

describe("DEFAULT_TIME_BLOCK", () => {
  it("defaults to evening", () => {
    expect(DEFAULT_TIME_BLOCK).toBe("evening");
  });
});
