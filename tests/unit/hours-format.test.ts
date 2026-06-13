import { describe, expect, it } from "vitest";
import {
  formatVenueHours,
  type HoursDisplay,
  type HoursRow,
} from "@/lib/format/hours";

// formatVenueHours is presentation-only: the data layer keeps the JSON
// untouched and the renderer reads from this helper at display time.
// Tests cover the decimal/24h time formatting, past-midnight folding,
// the day-grouping that collapses consecutive identical rows, and the
// raw-passthrough fallback for legacy strings or malformed input.

// Small helper to keep assertions terse for the rows-kind result.
function rows(display: HoursDisplay | null): HoursRow[] {
  expect(display).not.toBeNull();
  expect(display?.kind).toBe("rows");
  if (display?.kind !== "rows") throw new Error("expected rows");
  return display.rows;
}

// Build a 7-day schedule from a single per-day entry — cuts noise in
// the many tests that only exercise one day's formatting.
function oneDay(day: "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun", intervals: Array<[number, number]>): string {
  return JSON.stringify({ [day]: intervals });
}

describe("formatVenueHours — single-hour formatting", () => {
  it("11.0 renders as '11 AM'", () => {
    const r = rows(formatVenueHours(oneDay("mon", [[11.0, 12.0]])));
    expect(r[0].hours).toBe("11 AM – 12 PM");
  });

  it("23.0 renders as '11 PM'", () => {
    const r = rows(formatVenueHours(oneDay("mon", [[22.0, 23.0]])));
    expect(r[0].hours).toBe("10 PM – 11 PM");
  });

  it("18.75 renders as '6:45 PM'", () => {
    const r = rows(formatVenueHours(oneDay("mon", [[12.0, 18.75]])));
    expect(r[0].hours).toBe("12 PM – 6:45 PM");
  });

  it("10.5 renders as '10:30 AM'", () => {
    const r = rows(formatVenueHours(oneDay("mon", [[10.5, 14.0]])));
    expect(r[0].hours).toBe("10:30 AM – 2 PM");
  });

  it("12.0 renders as '12 PM' (noon)", () => {
    const r = rows(formatVenueHours(oneDay("mon", [[12.0, 13.0]])));
    expect(r[0].hours).toBe("12 PM – 1 PM");
  });

  it("24.0 renders as '12 AM' (folded to midnight)", () => {
    const r = rows(formatVenueHours(oneDay("mon", [[20.0, 24.0]])));
    expect(r[0].hours).toBe("8 PM – 12 AM");
  });

  it("0.0 renders as '12 AM' (midnight)", () => {
    const r = rows(formatVenueHours(oneDay("mon", [[0.0, 6.0]])));
    expect(r[0].hours).toBe("12 AM – 6 AM");
  });
});

describe("formatVenueHours — past-midnight (>24 convention)", () => {
  it("close at 25.0 folds to '1 AM'", () => {
    const r = rows(formatVenueHours(oneDay("mon", [[12.0, 25.0]])));
    expect(r[0].hours).toBe("12 PM – 1 AM");
  });

  it("close at 26.5 folds to '2:30 AM'", () => {
    const r = rows(formatVenueHours(oneDay("mon", [[17.0, 26.5]])));
    expect(r[0].hours).toBe("5 PM – 2:30 AM");
  });
});

describe("formatVenueHours — split intervals", () => {
  it("three intervals join with comma", () => {
    const r = rows(
      formatVenueHours(oneDay("mon", [[8.0, 10.5], [12.0, 15.0], [17.0, 22.0]])),
    );
    expect(r[0].hours).toBe(
      "8 AM – 10:30 AM, 12 PM – 3 PM, 5 PM – 10 PM",
    );
  });
});

describe("formatVenueHours — closed day", () => {
  it("[] renders as 'Closed'", () => {
    const r = rows(formatVenueHours(oneDay("sun", [])));
    // Only one day has an entry; the other six default to empty intervals
    // which is the same as Closed — so they group together into one row.
    // The sunday row inherits the same shape; verify the closed-text
    // appears on the row that contains sunday.
    const sundayRow = r.find((row) => row.days.includes("Sun"));
    expect(sundayRow?.hours).toBe("Closed");
  });
});

describe("formatVenueHours — day grouping (Google-style)", () => {
  it("all 7 days identical → one row 'Mon – Sun'", () => {
    const schedule = JSON.stringify({
      mon: [[11, 23]],
      tue: [[11, 23]],
      wed: [[11, 23]],
      thu: [[11, 23]],
      fri: [[11, 23]],
      sat: [[11, 23]],
      sun: [[11, 23]],
    });
    const r = rows(formatVenueHours(schedule));
    expect(r).toHaveLength(1);
    expect(r[0]).toEqual({ days: "Mon – Sun", hours: "11 AM – 11 PM" });
  });

  it("Mon-Fri same + Sat-Sun different → correct split rows", () => {
    const schedule = JSON.stringify({
      mon: [[9, 17]],
      tue: [[9, 17]],
      wed: [[9, 17]],
      thu: [[9, 17]],
      fri: [[9, 17]],
      sat: [[10, 22]],
      sun: [[10, 22]],
    });
    const r = rows(formatVenueHours(schedule));
    expect(r).toHaveLength(2);
    expect(r[0]).toEqual({ days: "Mon – Fri", hours: "9 AM – 5 PM" });
    expect(r[1]).toEqual({ days: "Sat – Sun", hours: "10 AM – 10 PM" });
  });

  it("non-contiguous identical days do NOT collapse (Mon = Wed, Tue different)", () => {
    // Mon and Wed have the same hours, but Tue is different — the helper
    // groups only CONSECUTIVE identical days, so Mon and Wed stay as
    // separate single-day rows.
    const schedule = JSON.stringify({
      mon: [[9, 17]],
      tue: [[10, 18]],
      wed: [[9, 17]],
      thu: [],
      fri: [],
      sat: [],
      sun: [],
    });
    const r = rows(formatVenueHours(schedule));
    expect(r).toEqual([
      { days: "Mon", hours: "9 AM – 5 PM" },
      { days: "Tue", hours: "10 AM – 6 PM" },
      { days: "Wed", hours: "9 AM – 5 PM" },
      { days: "Thu – Sun", hours: "Closed" },
    ]);
  });

  it("single-day rows render as just the day label, not a range", () => {
    const schedule = JSON.stringify({
      mon: [[9, 17]],
      tue: [[10, 18]],
      wed: [[11, 19]],
      thu: [[12, 20]],
      fri: [[13, 21]],
      sat: [[14, 22]],
      sun: [[15, 23]],
    });
    const r = rows(formatVenueHours(schedule));
    expect(r).toHaveLength(7);
    for (const row of r) {
      expect(row.days).not.toMatch(/–/);
    }
  });

  it("missing day keys default to closed and group with explicit closed days", () => {
    // The schedule only specifies mon/tue; the other five days default
    // to Closed (empty intervals fallthrough). The closed days group
    // into one range.
    const schedule = JSON.stringify({
      mon: [[9, 17]],
      tue: [[10, 18]],
    });
    const r = rows(formatVenueHours(schedule));
    expect(r).toEqual([
      { days: "Mon", hours: "9 AM – 5 PM" },
      { days: "Tue", hours: "10 AM – 6 PM" },
      { days: "Wed – Sun", hours: "Closed" },
    ]);
  });
});

describe("formatVenueHours — legacy + edge inputs (raw passthrough)", () => {
  it("legacy human-readable string falls through to {kind:'raw'}", () => {
    const raw =
      "Monday: 11:00 AM – 11:00 PM; Tuesday: 11:00 AM – 11:00 PM; Closed Sunday";
    expect(formatVenueHours(raw)).toEqual({ kind: "raw", text: raw });
  });

  it("malformed JSON ('{bad') falls through to {kind:'raw'}", () => {
    expect(formatVenueHours("{bad")).toEqual({
      kind: "raw",
      text: "{bad",
    });
  });

  it("JSON that parses but has no day keys falls through to {kind:'raw'}", () => {
    // Defensive: an object like {"note":"closed for renovation"} should
    // NOT be silently rendered as a zero-row schedule.
    const raw = '{"note":"closed for renovation"}';
    expect(formatVenueHours(raw)).toEqual({ kind: "raw", text: raw });
  });

  it("JSON whose day value isn't an array falls through to {kind:'raw'}", () => {
    const raw = '{"mon":"11-23"}';
    expect(formatVenueHours(raw)).toEqual({ kind: "raw", text: raw });
  });

  it("JSON whose interval is malformed (string instead of number) falls through", () => {
    const raw = '{"mon":[["11","23"]]}';
    expect(formatVenueHours(raw)).toEqual({ kind: "raw", text: raw });
  });

  it("JSON whose interval has wrong arity (3 numbers) falls through", () => {
    const raw = '{"mon":[[11,15,23]]}';
    expect(formatVenueHours(raw)).toEqual({ kind: "raw", text: raw });
  });

  it("JSON top-level array (not object) falls through", () => {
    const raw = '[[11,23]]';
    expect(formatVenueHours(raw)).toEqual({ kind: "raw", text: raw });
  });

  it("null input returns null", () => {
    expect(formatVenueHours(null)).toBeNull();
  });

  it("undefined input returns null", () => {
    expect(formatVenueHours(undefined)).toBeNull();
  });

  it("empty string returns null", () => {
    expect(formatVenueHours("")).toBeNull();
  });

  it("whitespace-only string returns null", () => {
    expect(formatVenueHours("   ")).toBeNull();
  });
});

describe("formatVenueHours — combined realistic schedule", () => {
  it("mixed schedule renders Google-style", () => {
    // Real-world shape: weekday lunch service, weekend brunch, late
    // close past midnight on Friday + Saturday.
    const schedule = JSON.stringify({
      mon: [[11.5, 22.0]],
      tue: [[11.5, 22.0]],
      wed: [[11.5, 22.0]],
      thu: [[11.5, 22.0]],
      fri: [[11.5, 26.0]],
      sat: [[10.0, 26.0]],
      sun: [[10.0, 15.0]],
    });
    const r = rows(formatVenueHours(schedule));
    expect(r).toEqual([
      { days: "Mon – Thu", hours: "11:30 AM – 10 PM" },
      { days: "Fri", hours: "11:30 AM – 2 AM" },
      { days: "Sat", hours: "10 AM – 2 AM" },
      { days: "Sun", hours: "10 AM – 3 PM" },
    ]);
  });
});
