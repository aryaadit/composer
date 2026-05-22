import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { isPastDate, formatPastDateLabel } from "@/lib/dateUtils";

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
