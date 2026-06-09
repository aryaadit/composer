import { describe, it, expect } from "vitest";
import {
  buildGoogleCalendarUrl,
  buildIcsUid,
  formatIcsTimestamp,
  generateIcsContent,
  getNycOffsetHoursForDate,
  nycLocalToUtc,
  resolveItineraryCalendarTimes,
} from "@/lib/calendar";
import type { ItineraryResponse, ItineraryStop, Venue } from "@/types";

// ── Test fixtures ─────────────────────────────────────────────

function makeVenue(name: string, address: string | null = "123 Test St"): Venue {
  return { id: `v-${name}`, name, address } as unknown as Venue;
}

function makeStop(name: string, address: string | null = "123 Test St"): ItineraryStop {
  return {
    role: "main",
    venue: makeVenue(name, address),
    curation_note: "",
    spend_estimate: "$$",
    is_fixed: false,
    plan_b: null,
  };
}

function makeItinerary(overrides: {
  title?: string;
  day?: string;
  startTime?: string;
  endTime?: string;
  stops?: ItineraryStop[];
} = {}): ItineraryResponse {
  return {
    header: {
      title: overrides.title ?? "Pasta and a nightcap",
      subtitle: "",
      occasion_tag: "date",
      vibe_tag: "food_forward",
      estimated_total: "$$",
      weather: null,
    },
    stops: overrides.stops ?? [makeStop("Via Carota"), makeStop("Attaboy")],
    walks: [],
    walking: null,
    truncated_for_end_time: false,
    maps_url: "https://maps.example",
    inputs: {
      occasion: "date",
      neighborhoods: ["west_village"],
      budget: "nice_out",
      vibe: "food_forward",
      day: overrides.day ?? "2026-06-09",
      startTime: overrides.startTime ?? "19:00",
      endTime: overrides.endTime ?? "00:00",
    },
  } as unknown as ItineraryResponse;
}

// ── NYC offset helper (DST-aware) ────────────────────────────

describe("getNycOffsetHoursForDate", () => {
  it("returns -4 (EDT) for clear-summer dates", () => {
    expect(getNycOffsetHoursForDate(2026, 6, 9)).toBe(-4);
    expect(getNycOffsetHoursForDate(2026, 7, 4)).toBe(-4);
  });

  it("returns -5 (EST) for clear-winter dates", () => {
    expect(getNycOffsetHoursForDate(2026, 12, 9)).toBe(-5);
    expect(getNycOffsetHoursForDate(2026, 1, 15)).toBe(-5);
  });

  it("returns -4 (EDT) at noon on the DST-start day (2026-03-08)", () => {
    // Spring forward at 2am ET on second Sunday of March. Noon is well
    // past the transition — EDT.
    expect(getNycOffsetHoursForDate(2026, 3, 8)).toBe(-4);
  });

  it("returns -5 (EST) at noon on the DST-end day (2026-11-01)", () => {
    // Fall back at 2am ET on first Sunday of November. Noon is past
    // the transition — EST.
    expect(getNycOffsetHoursForDate(2026, 11, 1)).toBe(-5);
  });
});

// ── NYC local → UTC ──────────────────────────────────────────

describe("nycLocalToUtc", () => {
  it("19:00 NYC in June (EDT) → 23:00 UTC same day", () => {
    const utc = nycLocalToUtc("2026-06-09", "19:00");
    expect(utc.toISOString()).toBe("2026-06-09T23:00:00.000Z");
  });

  it("19:00 NYC in December (EST) → 00:00 UTC next day", () => {
    const utc = nycLocalToUtc("2026-12-09", "19:00");
    expect(utc.toISOString()).toBe("2026-12-10T00:00:00.000Z");
  });

  it("12:00 NYC on DST-start day (2026-03-08) → 16:00 UTC (EDT applies post-noon)", () => {
    const utc = nycLocalToUtc("2026-03-08", "12:00");
    expect(utc.toISOString()).toBe("2026-03-08T16:00:00.000Z");
  });

  it("12:00 NYC on DST-end day (2026-11-01) → 17:00 UTC (EST applies post-noon)", () => {
    const utc = nycLocalToUtc("2026-11-01", "12:00");
    expect(utc.toISOString()).toBe("2026-11-01T17:00:00.000Z");
  });

  it("00:00 NYC midnight in June (EDT) → 04:00 UTC same day", () => {
    const utc = nycLocalToUtc("2026-06-09", "00:00");
    expect(utc.toISOString()).toBe("2026-06-09T04:00:00.000Z");
  });
});

// ── formatIcsTimestamp ────────────────────────────────────────

describe("formatIcsTimestamp", () => {
  it("formats UTC Date as YYYYMMDDTHHMMSSZ", () => {
    const d = new Date("2026-06-09T23:00:00.000Z");
    expect(formatIcsTimestamp(d)).toBe("20260609T230000Z");
  });

  it("zero-pads single-digit components", () => {
    const d = new Date("2026-01-05T03:05:09.000Z");
    expect(formatIcsTimestamp(d)).toBe("20260105T030509Z");
  });
});

// ── resolveItineraryCalendarTimes ────────────────────────────

describe("resolveItineraryCalendarTimes", () => {
  it("non-wrapping window: 17:00–22:00 stays same day", () => {
    const it = makeItinerary({
      day: "2026-06-09",
      startTime: "17:00",
      endTime: "22:00",
    });
    const { start, end } = resolveItineraryCalendarTimes(it);
    // EDT: 17:00 NYC = 21:00 UTC; 22:00 NYC = 02:00 UTC next day.
    expect(start.toISOString()).toBe("2026-06-09T21:00:00.000Z");
    expect(end.toISOString()).toBe("2026-06-10T02:00:00.000Z");
  });

  it("wrapping window: 21:00–02:00 rolls end to next day", () => {
    const it = makeItinerary({
      day: "2026-06-09",
      startTime: "21:00",
      endTime: "02:00",
    });
    const { start, end } = resolveItineraryCalendarTimes(it);
    // EDT: 21:00 NYC = 01:00 UTC next day; 02:00 NYC (next day) = 06:00 UTC.
    expect(start.toISOString()).toBe("2026-06-10T01:00:00.000Z");
    expect(end.toISOString()).toBe("2026-06-10T06:00:00.000Z");
  });

  it("wrapping window across DST-end weekend handles tz on each side", () => {
    // 2026-10-31 (Saturday) is EDT; the wrap-to-next-day 02:00 is on
    // 2026-11-01 which is EST. Both sides resolve correctly.
    const it = makeItinerary({
      day: "2026-10-31",
      startTime: "21:00",
      endTime: "02:00",
    });
    const { start, end } = resolveItineraryCalendarTimes(it);
    // 21:00 NYC EDT = 01:00 UTC; 02:00 NYC EST (Nov 1) = 07:00 UTC.
    expect(start.toISOString()).toBe("2026-11-01T01:00:00.000Z");
    expect(end.toISOString()).toBe("2026-11-01T07:00:00.000Z");
  });

  it("midnight endTime ('00:00') with 19:00 start: end is next day 04:00 UTC", () => {
    const it = makeItinerary({
      day: "2026-06-09",
      startTime: "19:00",
      endTime: "00:00",
    });
    const { start, end } = resolveItineraryCalendarTimes(it);
    expect(start.toISOString()).toBe("2026-06-09T23:00:00.000Z");
    expect(end.toISOString()).toBe("2026-06-10T04:00:00.000Z");
  });
});

// ── buildGoogleCalendarUrl ────────────────────────────────────

describe("buildGoogleCalendarUrl", () => {
  it("builds a calendar.google.com /render URL with action=TEMPLATE", () => {
    const url = buildGoogleCalendarUrl(makeItinerary());
    expect(url).toMatch(/^https:\/\/calendar\.google\.com\/calendar\/render\?/);
    expect(url).toContain("action=TEMPLATE");
  });

  it("includes URL-encoded title in `text` param", () => {
    const url = buildGoogleCalendarUrl(
      makeItinerary({ title: "Pasta & a nightcap" }),
    );
    const params = new URL(url).searchParams;
    expect(params.get("text")).toBe("Pasta & a nightcap");
  });

  it("includes dates in YYYYMMDDTHHMMSSZ/YYYYMMDDTHHMMSSZ format", () => {
    const url = buildGoogleCalendarUrl(
      makeItinerary({
        day: "2026-06-09",
        startTime: "19:00",
        endTime: "00:00",
      }),
    );
    const params = new URL(url).searchParams;
    expect(params.get("dates")).toBe("20260609T230000Z/20260610T040000Z");
  });

  it("location is the first stop's address when available", () => {
    const url = buildGoogleCalendarUrl(
      makeItinerary({
        stops: [
          makeStop("Via Carota", "51 Grove St"),
          makeStop("Attaboy", "134 Eldridge St"),
        ],
      }),
    );
    const params = new URL(url).searchParams;
    expect(params.get("location")).toBe("51 Grove St");
  });

  it("location falls back to venue name when address is null", () => {
    const url = buildGoogleCalendarUrl(
      makeItinerary({
        stops: [makeStop("Via Carota", null), makeStop("Attaboy")],
      }),
    );
    const params = new URL(url).searchParams;
    expect(params.get("location")).toBe("Via Carota");
  });

  it("description lists every stop in order", () => {
    const url = buildGoogleCalendarUrl(
      makeItinerary({
        stops: [
          makeStop("First Stop", "1 First St"),
          makeStop("Second Stop", "2 Second St"),
        ],
      }),
    );
    const params = new URL(url).searchParams;
    const details = params.get("details") ?? "";
    expect(details).toContain("1. First Stop");
    expect(details).toContain("2. Second Stop");
    expect(details).toContain("1 First St");
    expect(details).toContain("2 Second St");
  });
});

// ── .ics generator ────────────────────────────────────────────

describe("generateIcsContent", () => {
  const FIXED_NOW = new Date("2026-06-09T12:00:00.000Z");

  it("wraps with VCALENDAR/VEVENT and proper VERSION/PRODID", () => {
    const ics = generateIcsContent(makeItinerary(), "saved-1@composer.onpalate.com", FIXED_NOW);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("END:VEVENT");
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("PRODID:-//composer.onpalate.com//Composer//EN");
  });

  it("includes UID, DTSTAMP, DTSTART, DTEND, SUMMARY, DESCRIPTION, LOCATION", () => {
    const ics = generateIcsContent(makeItinerary(), "saved-1@composer.onpalate.com", FIXED_NOW);
    expect(ics).toContain("UID:saved-1@composer.onpalate.com");
    expect(ics).toContain(`DTSTAMP:${formatIcsTimestamp(FIXED_NOW)}`);
    expect(ics).toMatch(/DTSTART:\d{8}T\d{6}Z/);
    expect(ics).toMatch(/DTEND:\d{8}T\d{6}Z/);
    expect(ics).toContain("SUMMARY:");
    expect(ics).toContain("DESCRIPTION:");
    expect(ics).toContain("LOCATION:");
  });

  it("uses CRLF line endings (RFC 5545)", () => {
    const ics = generateIcsContent(makeItinerary(), "saved-1@composer.onpalate.com", FIXED_NOW);
    expect(ics.includes("\r\n")).toBe(true);
  });

  it("escapes special chars in title (comma, semicolon, newline, backslash)", () => {
    const it = makeItinerary({
      title: "Dinner, drinks; the lot\\ at home",
    });
    const ics = generateIcsContent(it, "u@d", FIXED_NOW);
    // Comma → \,  semicolon → \;  backslash → \\.
    expect(ics).toContain("SUMMARY:Dinner\\, drinks\\; the lot\\\\ at home");
  });

  it("encodes newlines in description as \\n", () => {
    const it = makeItinerary({
      stops: [makeStop("A"), makeStop("B")],
    });
    const ics = generateIcsContent(it, "u@d", FIXED_NOW);
    // The description has multi-line content; per RFC it's escaped to \n.
    expect(ics).toMatch(/DESCRIPTION:.*\\n.*/);
  });

  it("DTSTART matches the resolved UTC start", () => {
    const it = makeItinerary({
      day: "2026-06-09",
      startTime: "19:00",
      endTime: "00:00",
    });
    const ics = generateIcsContent(it, "u@d", FIXED_NOW);
    expect(ics).toContain("DTSTART:20260609T230000Z");
    expect(ics).toContain("DTEND:20260610T040000Z");
  });
});

// ── buildIcsUid ───────────────────────────────────────────────

describe("buildIcsUid", () => {
  it("composes <savedId>@composer.onpalate.com", () => {
    expect(buildIcsUid("abc-123")).toBe("abc-123@composer.onpalate.com");
  });

  it("preserves uuids verbatim for stable re-import semantics", () => {
    const uuid = "4eda78bd-2432-4a7b-a960-cdc4fc5f4dc2";
    expect(buildIcsUid(uuid)).toBe(`${uuid}@composer.onpalate.com`);
  });
});
