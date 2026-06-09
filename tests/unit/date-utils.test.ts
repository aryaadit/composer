import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  isPastDate,
  formatPastDateLabel,
  formatShortDateLabel,
  splitPlansByDate,
} from "@/lib/dateUtils";

// ── isPastDate ────────────────────────────────────────────────
//
// Compares an itinerary's `day` (YYYY-MM-DD) against today's *local*
// date. Today and future return false; only strictly-before-today
// returns true. Malformed/missing input returns false (safer to keep
// reservation widgets visible than blank them out from a parse error).
//
// Tests pin "today" via vi.useFakeTimers so we don't get flakes when
// the suite runs near midnight in CI.

describe("isPastDate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Anchor at 2026-05-22 12:00:00 LOCAL time (noon — well clear of
    // both midnight transitions; matches a typical user session).
    vi.setSystemTime(new Date(2026, 4, 22, 12, 0, 0));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns true for a date strictly before today", () => {
    expect(isPastDate("2026-05-21")).toBe(true);
    expect(isPastDate("2025-12-31")).toBe(true);
    expect(isPastDate("2000-01-01")).toBe(true);
  });

  it("returns false for today (same local day)", () => {
    expect(isPastDate("2026-05-22")).toBe(false);
  });

  it("returns false for any future date", () => {
    expect(isPastDate("2026-05-23")).toBe(false);
    expect(isPastDate("2027-01-01")).toBe(false);
  });

  it("returns false for missing/empty/null input (don't flag what we can't verify)", () => {
    expect(isPastDate(undefined)).toBe(false);
    expect(isPastDate(null)).toBe(false);
    expect(isPastDate("")).toBe(false);
  });

  it("returns false for malformed input (regex shape check)", () => {
    expect(isPastDate("not-a-date")).toBe(false);
    expect(isPastDate("2026/05/21")).toBe(false);
    expect(isPastDate("2026-5-21")).toBe(false); // unpadded month
    expect(isPastDate("21-05-2026")).toBe(false); // wrong order
    expect(isPastDate("2026-05-22T12:00:00")).toBe(false); // datetime, not date
  });

  it("transitions at midnight local — yesterday becomes past once today rolls over", () => {
    // 23:59 local on May 22: May 21 is still yesterday (past), May 22 is today (not past)
    vi.setSystemTime(new Date(2026, 4, 22, 23, 59, 30));
    expect(isPastDate("2026-05-21")).toBe(true);
    expect(isPastDate("2026-05-22")).toBe(false);

    // One minute later, 00:00 local on May 23: May 22 is now past
    vi.setSystemTime(new Date(2026, 4, 23, 0, 0, 0));
    expect(isPastDate("2026-05-22")).toBe(true);
    expect(isPastDate("2026-05-23")).toBe(false);
  });

  it("compares dates lexicographically — year/month boundaries handled correctly", () => {
    // From Jan 1 2026, Dec 31 2025 is past (not "31 > 1")
    vi.setSystemTime(new Date(2026, 0, 1, 12, 0, 0));
    expect(isPastDate("2025-12-31")).toBe(true);
    expect(isPastDate("2025-12-01")).toBe(true);
    expect(isPastDate("2026-01-01")).toBe(false); // today
    expect(isPastDate("2026-01-02")).toBe(false); // tomorrow
  });

  it("end-of-month and end-of-year do not trip the comparison", () => {
    vi.setSystemTime(new Date(2026, 1, 28, 12, 0, 0)); // Feb 28 2026
    expect(isPastDate("2026-02-27")).toBe(true);
    expect(isPastDate("2026-02-28")).toBe(false);
    expect(isPastDate("2026-03-01")).toBe(false);
  });
});

// ── formatPastDateLabel ───────────────────────────────────────
//
// Produces "Sunday, May 11"-style strings for the banner. Local time,
// noon-anchored to dodge DST.

describe("formatPastDateLabel", () => {
  it("formats a valid YYYY-MM-DD as 'Weekday, Month Day'", () => {
    // 2026-05-11 is a Monday (just sanity — exact weekday depends on
    // the platform's locale data but the format shape is stable).
    expect(formatPastDateLabel("2026-05-11")).toMatch(
      /^[A-Z][a-z]+, [A-Z][a-z]+ \d{1,2}$/
    );
  });

  it("returns empty string for missing/malformed input", () => {
    expect(formatPastDateLabel(undefined)).toBe("");
    expect(formatPastDateLabel(null)).toBe("");
    expect(formatPastDateLabel("")).toBe("");
    expect(formatPastDateLabel("not-a-date")).toBe("");
    expect(formatPastDateLabel("2026/05/11")).toBe("");
  });
});

// ── Phase 5: formatShortDateLabel ─────────────────────────────
//
// Compact label for the saved-plans list. "Wed Jun 10" when the year
// matches today's; "Wed Jun 10, 2027" otherwise. Noon-anchored to
// dodge DST. Empty string on missing/malformed input.

describe("formatShortDateLabel", () => {
  beforeEach(() => {
    // Pin "now" to 2026-06-09 so year comparisons are deterministic.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 9, 12, 0, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("formats a same-year date as 'Weekday Month Day' (no year)", () => {
    // 2026-06-10 — same year as the pinned now (2026).
    const label = formatShortDateLabel("2026-06-10");
    // Shape: short weekday, short month, numeric day, no year.
    expect(label).toMatch(/^[A-Z][a-z]{2} [A-Z][a-z]{2} \d{1,2}$/);
    // Not containing the year as a literal.
    expect(label).not.toContain("2026");
  });

  it("appends the year when the itinerary's year differs from today's", () => {
    const label = formatShortDateLabel("2027-01-15");
    // Shape: short weekday, short month, day, comma + year.
    expect(label).toMatch(/^[A-Z][a-z]{2} [A-Z][a-z]{2} \d{1,2}, 2027$/);
    expect(label).toContain("2027");
  });

  it("also appends year for past-year dates (e.g. legacy 2025 saves)", () => {
    expect(formatShortDateLabel("2025-12-20")).toContain("2025");
  });

  it("returns empty string for null / undefined / empty / malformed", () => {
    expect(formatShortDateLabel(null)).toBe("");
    expect(formatShortDateLabel(undefined)).toBe("");
    expect(formatShortDateLabel("")).toBe("");
    expect(formatShortDateLabel("not-a-date")).toBe("");
    expect(formatShortDateLabel("2026/06/10")).toBe("");
  });
});

// ── Phase 5: splitPlansByDate ────────────────────────────────
//
// Partitions a list of plans into Upcoming + Past using isPastDate's
// strict-before-today rule. Upcoming ASC (soonest first), Past DESC
// (most-recently-past first). Null `day` lands in Upcoming, sorted to
// the end.

describe("splitPlansByDate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 9, 12, 0, 0)); // 2026-06-09
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function plan(id: string, day: string | null) {
    return { id, day };
  }

  it("partitions strictly-before-today as past; today and future as upcoming", () => {
    const result = splitPlansByDate([
      plan("yesterday", "2026-06-08"),
      plan("today", "2026-06-09"),
      plan("tomorrow", "2026-06-10"),
      plan("last-week", "2026-06-02"),
      plan("next-month", "2026-07-15"),
    ]);
    expect(result.upcoming.map((p) => p.id)).toEqual(["today", "tomorrow", "next-month"]);
    expect(result.past.map((p) => p.id)).toEqual(["yesterday", "last-week"]);
  });

  it("sorts upcoming ASC by day (soonest first)", () => {
    const result = splitPlansByDate([
      plan("c", "2026-07-15"),
      plan("a", "2026-06-09"),
      plan("b", "2026-06-25"),
    ]);
    expect(result.upcoming.map((p) => p.id)).toEqual(["a", "b", "c"]);
  });

  it("sorts past DESC by day (most-recently-past first)", () => {
    const result = splitPlansByDate([
      plan("oldest", "2026-01-10"),
      plan("middle", "2026-04-20"),
      plan("newest", "2026-06-08"),
    ]);
    expect(result.past.map((p) => p.id)).toEqual(["newest", "middle", "oldest"]);
  });

  it("null day lands in upcoming, sorted to the end of its section", () => {
    const result = splitPlansByDate([
      plan("null-day", null),
      plan("today", "2026-06-09"),
      plan("future", "2026-07-15"),
    ]);
    expect(result.upcoming.map((p) => p.id)).toEqual([
      "today",
      "future",
      "null-day",
    ]);
    expect(result.past).toEqual([]);
  });

  it("empty input returns empty sections", () => {
    const result = splitPlansByDate([]);
    expect(result.upcoming).toEqual([]);
    expect(result.past).toEqual([]);
  });

  it("all-upcoming + all-past inputs each produce one empty section", () => {
    expect(
      splitPlansByDate([plan("a", "2026-07-01"), plan("b", "2026-08-01")]).past,
    ).toEqual([]);
    expect(
      splitPlansByDate([plan("a", "2025-01-01"), plan("b", "2025-02-01")]).upcoming,
    ).toEqual([]);
  });

  it("today counts as upcoming, not past (consistent with isPastDate)", () => {
    const result = splitPlansByDate([plan("today", "2026-06-09")]);
    expect(result.upcoming).toHaveLength(1);
    expect(result.past).toHaveLength(0);
  });
});
