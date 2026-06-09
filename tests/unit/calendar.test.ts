import { describe, it, expect } from "vitest";
import {
  buildDescription,
  buildGoogleCalendarUrl,
  buildIcsUid,
  foldIcsLine,
  formatIcsTimestamp,
  generateIcsContent,
  getNycOffsetHoursForDate,
  nycLocalToUtc,
  reservationStatusFor,
  resolveItineraryCalendarTimes,
} from "@/lib/calendar";
import type {
  ItineraryResponse,
  ItineraryStop,
  Venue,
  WalkSegment,
} from "@/types";

// ── Test fixtures ─────────────────────────────────────────────

function makeVenue(
  name: string,
  address: string | null = "123 Test St",
  overrides: Partial<Venue> = {},
): Venue {
  return {
    id: `v-${name}`,
    name,
    address,
    reservation_url: null,
    reservation_platform: null,
    ...overrides,
  } as unknown as Venue;
}

function makeStop(
  name: string,
  address: string | null = "123 Test St",
  overrides: { role?: "opener" | "main" | "closer"; curation_note?: string; venue?: Partial<Venue> } = {},
): ItineraryStop {
  return {
    role: overrides.role ?? "main",
    venue: makeVenue(name, address, overrides.venue ?? {}),
    curation_note: overrides.curation_note ?? "",
    spend_estimate: "$$",
    is_fixed: false,
    plan_b: null,
  };
}

function walk(min: number): WalkSegment {
  return { from: "A", to: "B", distance_km: 0.5, walk_minutes: min };
}

/** Reverse RFC 5545 line folding for assertion purposes — drops the
 * CRLF + leading space pattern that splits long lines. Tests that
 * assert on cross-fold substrings normalize via this helper. */
function unfoldIcs(ics: string): string {
  return ics.replace(/\r\n /g, "");
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

  it("description lists every stop with the rich Phase 8 format", () => {
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
    expect(details).toContain("📍 Stop 1");
    expect(details).toContain("📍 Stop 2");
    expect(details).toContain("First Stop");
    expect(details).toContain("Second Stop");
    expect(details).toContain("1 First St");
    expect(details).toContain("2 Second St");
  });
});

// ── Phase 8 critical regressions: Z suffix + literal '/' ─────

describe("buildGoogleCalendarUrl — Phase 8 encoding fixes", () => {
  it("emits the LITERAL '/' between start and end dates (not %2F)", () => {
    // URLSearchParams would percent-encode the slash, which Google's
    // parser silently treats as local-time interpretation. This test
    // is the regression for the +4h shift bug.
    //
    // 18:00 NYC EDT = 22:00 UTC same day.
    // 23:00 NYC EDT = 03:00 UTC NEXT day (overflow past midnight UTC).
    const url = buildGoogleCalendarUrl(
      makeItinerary({
        day: "2026-06-11",
        startTime: "18:00",
        endTime: "23:00",
      }),
    );
    expect(url).not.toContain("%2F");
    expect(url).toContain("dates=20260611T220000Z/20260612T030000Z");
  });

  it("preserves the trailing Z on both start and end timestamps", () => {
    const url = buildGoogleCalendarUrl(
      makeItinerary({
        day: "2026-06-09",
        startTime: "19:00",
        endTime: "00:00",
      }),
    );
    // Both timestamps end with Z, separated by a literal slash.
    expect(url).toMatch(/T\d{6}Z\/\d{8}T\d{6}Z/);
  });

  it("6 PM NYC EDT → encoded as 22:00 UTC ('20260611T220000Z')", () => {
    const url = buildGoogleCalendarUrl(
      makeItinerary({
        day: "2026-06-11",
        startTime: "18:00",
        endTime: "23:00",
      }),
    );
    // 18:00 NYC EDT = 22:00 UTC same day. 23:00 NYC EDT = 03:00 UTC
    // next day. But our window is non-wrapping (18:00 < 23:00 HH:MM)
    // so end day stays the same... wait — end on the same NYC day in
    // UTC IS the next UTC day for evening NYC times.
    //
    // Actually 23:00 NYC EDT < 24:00 → still same NYC day. The UTC
    // equivalent IS 03:00 NEXT UTC day. So the assertion below is
    // correct: end timestamp starts with 20260611T0300... wait no,
    // it would be 20260612 (next UTC day).
    //
    // Re-tracing: nycLocalToUtc("2026-06-11", "23:00"):
    //   offsetHours = -4 (EDT)
    //   new Date(Date.UTC(2026, 5, 11, 23-(-4), 0, 0))
    //     = new Date(Date.UTC(2026, 5, 11, 27, 0, 0))
    //     = 2026-06-12T03:00:00Z
    // So the end timestamp is "20260612T030000Z".
    expect(url).toContain("dates=20260611T220000Z/20260612T030000Z");
  });

  it("November EST (UTC-5) — catches hardcoded-EDT-offset bugs", () => {
    // 18:00 NYC EST = 23:00 UTC same day. 23:00 NYC EST = 04:00 UTC
    // next day. November 15 is comfortably past the DST end (Nov 1).
    const url = buildGoogleCalendarUrl(
      makeItinerary({
        day: "2026-11-15",
        startTime: "18:00",
        endTime: "23:00",
      }),
    );
    expect(url).toContain("dates=20261115T230000Z/20261116T040000Z");
    expect(url).not.toContain("%2F");
  });

  it("embeds shareUrl in description footer when provided", () => {
    const url = buildGoogleCalendarUrl(
      makeItinerary(),
      "https://composer.onpalate.com/itinerary/share/abc-123",
    );
    const params = new URL(url).searchParams;
    const details = params.get("details") ?? "";
    expect(details).toContain(
      "Composed by Composer · https://composer.onpalate.com/itinerary/share/abc-123",
    );
  });

  it("description footer falls back to plain text when shareUrl is null", () => {
    const url = buildGoogleCalendarUrl(makeItinerary(), null);
    const params = new URL(url).searchParams;
    const details = params.get("details") ?? "";
    expect(details).toContain("Composed by Composer");
    expect(details).not.toContain("https://");
  });
});

// ── .ics generator ────────────────────────────────────────────

describe("generateIcsContent", () => {
  const FIXED_NOW = new Date("2026-06-09T12:00:00.000Z");

  it("wraps with VCALENDAR/VEVENT and proper VERSION/PRODID", () => {
    const ics = generateIcsContent(makeItinerary(), "saved-1@composer.onpalate.com", null, FIXED_NOW);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("END:VEVENT");
    expect(ics).toContain("VERSION:2.0");
    expect(ics).toContain("PRODID:-//composer.onpalate.com//Composer//EN");
  });

  it("includes UID, DTSTAMP, DTSTART, DTEND, SUMMARY, DESCRIPTION, LOCATION", () => {
    const ics = generateIcsContent(makeItinerary(), "saved-1@composer.onpalate.com", null, FIXED_NOW);
    expect(ics).toContain("UID:saved-1@composer.onpalate.com");
    expect(ics).toContain(`DTSTAMP:${formatIcsTimestamp(FIXED_NOW)}`);
    expect(ics).toMatch(/DTSTART:\d{8}T\d{6}Z/);
    expect(ics).toMatch(/DTEND:\d{8}T\d{6}Z/);
    expect(ics).toContain("SUMMARY:");
    expect(ics).toContain("DESCRIPTION:");
    expect(ics).toContain("LOCATION:");
  });

  it("uses CRLF line endings (RFC 5545)", () => {
    const ics = generateIcsContent(makeItinerary(), "saved-1@composer.onpalate.com", null, FIXED_NOW);
    expect(ics.includes("\r\n")).toBe(true);
  });

  it("escapes special chars in title (comma, semicolon, newline, backslash)", () => {
    const it = makeItinerary({
      title: "Dinner, drinks; the lot\\ at home",
    });
    const ics = generateIcsContent(it, "u@d", null, FIXED_NOW);
    // Comma → \,  semicolon → \;  backslash → \\.
    expect(ics).toContain("SUMMARY:Dinner\\, drinks\\; the lot\\\\ at home");
  });

  it("encodes newlines in description as \\n", () => {
    const it = makeItinerary({
      stops: [makeStop("A"), makeStop("B")],
    });
    const ics = generateIcsContent(it, "u@d", null, FIXED_NOW);
    // The description has multi-line content; per RFC it's escaped to \n.
    expect(ics).toMatch(/DESCRIPTION:.*\\n.*/);
  });

  it("DTSTART matches the resolved UTC start", () => {
    const it = makeItinerary({
      day: "2026-06-09",
      startTime: "19:00",
      endTime: "00:00",
    });
    const ics = generateIcsContent(it, "u@d", null, FIXED_NOW);
    expect(ics).toContain("DTSTART:20260609T230000Z");
    expect(ics).toContain("DTEND:20260610T040000Z");
  });
});

// ── buildIcsUid ───────────────────────────────────────────────

// ── Phase 8: foldIcsLine (RFC 5545 §3.1) ─────────────────────

describe("foldIcsLine", () => {
  it("returns the line unchanged when ≤ 70 chars", () => {
    const short = "DESCRIPTION:short content";
    expect(foldIcsLine(short)).toBe(short);
  });

  it("folds a long line into CRLF-separated chunks", () => {
    const long = "DESCRIPTION:" + "x".repeat(200);
    const folded = foldIcsLine(long);
    expect(folded).toContain("\r\n");
    // All chunks except the first must start with a space (continuation).
    const segments = folded.split("\r\n");
    expect(segments.length).toBeGreaterThan(1);
    for (let i = 1; i < segments.length; i++) {
      expect(segments[i][0]).toBe(" ");
    }
  });

  it("does not split multi-byte chars (emoji code points stay intact)", () => {
    // 60 chars of padding + 📍 + 60 more chars — the emoji must land
    // on one segment, never split across two.
    const padded = "x".repeat(60) + "📍" + "y".repeat(60);
    const folded = foldIcsLine("DESCRIPTION:" + padded);
    // The emoji's 4 UTF-8 bytes are one code point — Array.from sees it
    // as a single "character". No segment should contain a broken \uD83D
    // surrogate without its pair.
    expect(folded).toContain("📍");
  });

  it("preserves total content across folds (round-trip via unfold)", () => {
    const original = "DESCRIPTION:" + "abcdefghij".repeat(20); // 212 chars
    const folded = foldIcsLine(original);
    // Unfold: drop the CRLF + leading-space pattern on continuation lines.
    const unfolded = folded.replace(/\r\n /g, "");
    expect(unfolded).toBe(original);
  });
});

// ── Phase 8: reservationStatusFor ────────────────────────────

describe("reservationStatusFor", () => {
  it("returns 'Walk-in welcome' for null reservation_url", () => {
    const v = makeVenue("X", null, { reservation_url: null });
    expect(reservationStatusFor(v)).toBe("Walk-in welcome");
  });

  it("returns 'Walk-in welcome' for empty reservation_url", () => {
    const v = makeVenue("X", null, { reservation_url: "" });
    expect(reservationStatusFor(v)).toBe("Walk-in welcome");
  });

  it("returns 'Walk-in welcome' for the literal 'Walk-in Only' value", () => {
    const v = makeVenue("X", null, { reservation_url: "Walk-in Only" });
    expect(reservationStatusFor(v)).toBe("Walk-in welcome");
  });

  it("returns Resy copy when platform=resy + valid URL", () => {
    const v = makeVenue("X", null, {
      reservation_url: "https://resy.com/x",
      reservation_platform: "resy",
    });
    expect(reservationStatusFor(v)).toBe("Reservations recommended on Resy");
  });

  it("returns OpenTable copy when platform=opentable + valid URL", () => {
    const v = makeVenue("X", null, {
      reservation_url: "https://opentable.com/x",
      reservation_platform: "opentable",
    });
    expect(reservationStatusFor(v)).toBe(
      "Reservations recommended on OpenTable",
    );
  });

  it("returns null (omit line) for unknown platforms", () => {
    const v = makeVenue("X", null, {
      reservation_url: "https://example.com/x",
      reservation_platform: "tock",
    });
    expect(reservationStatusFor(v)).toBeNull();
  });
});

// ── Phase 8: buildDescription (rich body) ────────────────────

describe("buildDescription", () => {
  it("leads with the subtitle (Gemini tagline)", () => {
    const it = makeItinerary();
    it.header.subtitle = "Cocktails at Attaboy, then cacio e pepe at Via Carota.";
    const body = buildDescription(it);
    expect(body.startsWith("Cocktails at Attaboy")).toBe(true);
  });

  it("includes each stop with role label + address + curation_note", () => {
    const it = makeItinerary({
      stops: [
        makeStop("Attaboy", "134 Eldridge St", {
          role: "opener",
          curation_note: "Skip the menu — tell them what you want.",
        }),
        makeStop("Via Carota", "51 Grove St", {
          role: "main",
          curation_note: "The cacio e pepe is the move.",
        }),
      ],
    });
    const body = buildDescription(it);
    expect(body).toContain("📍 Stop 1 · Start here"); // opener
    expect(body).toContain("📍 Stop 2 · The main event"); // main
    expect(body).toContain("Attaboy");
    expect(body).toContain("134 Eldridge St");
    expect(body).toContain("Skip the menu");
    expect(body).toContain("Via Carota");
    expect(body).toContain("51 Grove St");
    expect(body).toContain("cacio e pepe");
  });

  it("emits walk lines BETWEEN stops only (none after last)", () => {
    const it = makeItinerary({
      stops: [makeStop("A"), makeStop("B"), makeStop("C")],
    });
    it.walks = [walk(5), walk(7)];
    const body = buildDescription(it);
    expect(body).toContain("🚶 5 min walk");
    expect(body).toContain("🚶 7 min walk");
    // Exactly 2 walk lines for 3 stops.
    expect(body.match(/🚶 \d+ min walk/g)?.length).toBe(2);
  });

  it("ends with footer including budget and shareUrl when provided", () => {
    const it = makeItinerary();
    it.header.estimated_total = "$70–$110";
    const body = buildDescription(
      it,
      "https://composer.onpalate.com/itinerary/share/abc-123",
    );
    expect(body).toContain("—");
    expect(body).toContain("Budget: $70–$110");
    expect(body).toContain(
      "Composed by Composer · https://composer.onpalate.com/itinerary/share/abc-123",
    );
  });

  it("footer falls back to plain text when shareUrl is null", () => {
    const it = makeItinerary();
    const body = buildDescription(it, null);
    expect(body).toContain("Composed by Composer");
    expect(body).not.toContain("https://");
  });

  it("includes reservation status when applicable", () => {
    const it = makeItinerary({
      stops: [
        makeStop("Resy Spot", null, {
          venue: {
            reservation_url: "https://resy.com/x",
            reservation_platform: "resy",
          },
        }),
        makeStop("Walk-In Spot", null, {
          venue: { reservation_url: "Walk-in Only" },
        }),
      ],
    });
    const body = buildDescription(it);
    expect(body).toContain("Reservations recommended on Resy");
    expect(body).toContain("Walk-in welcome");
  });

  it("omits sections gracefully when data is missing", () => {
    const it = makeItinerary();
    it.header.subtitle = "";
    it.header.estimated_total = "";
    const body = buildDescription(it);
    // Subtitle absent, but other content still renders.
    expect(body).toContain("📍 Stop 1");
    expect(body).toContain("Composed by Composer");
    // Budget line is dropped when estimated_total is empty.
    expect(body).not.toContain("Budget:");
  });
});

// ── Phase 8: generateIcsContent (rich + folded + escaped) ───

describe("generateIcsContent — Phase 8 line folding + rich description", () => {
  const FIXED_NOW = new Date("2026-06-09T12:00:00.000Z");

  it("folds long DESCRIPTION lines per RFC 5545", () => {
    // Long curation note ensures DESCRIPTION exceeds the fold limit.
    const long = "long curation note ".repeat(20);
    const it = makeItinerary({
      stops: [makeStop("X", "addr", { curation_note: long })],
    });
    const ics = generateIcsContent(it, "u@d", null, FIXED_NOW);
    // The DESCRIPTION line should span at least 2 segments. We detect
    // a fold by looking for the continuation-line marker (CRLF + space)
    // somewhere after the DESCRIPTION: prefix.
    const descIndex = ics.indexOf("DESCRIPTION:");
    expect(descIndex).toBeGreaterThan(-1);
    const afterDesc = ics.slice(descIndex);
    expect(afterDesc).toMatch(/\r\n /);
  });

  it("escapes commas, semicolons, backslashes in SUMMARY and DESCRIPTION", () => {
    const it = makeItinerary({
      title: "Dinner, drinks; backslash\\test",
      stops: [
        makeStop("X", null, {
          curation_note: "Order the pasta, the wine; great vibes\\here",
        }),
      ],
    });
    // Unfold for assertion so multi-segment lines compare cleanly.
    const ics = unfoldIcs(generateIcsContent(it, "u@d", null, FIXED_NOW));
    // SUMMARY: , → \, ; → \; \ → \\
    expect(ics).toContain("Dinner\\, drinks\\; backslash\\\\test");
    // DESCRIPTION: same escape rules.
    expect(ics).toContain(
      "Order the pasta\\, the wine\\; great vibes\\\\here",
    );
  });

  it("embeds shareUrl in the description footer when provided", () => {
    const it = makeItinerary();
    const ics = unfoldIcs(
      generateIcsContent(
        it,
        "u@d",
        "https://composer.onpalate.com/itinerary/share/abc-123",
        FIXED_NOW,
      ),
    );
    expect(ics).toContain(
      "Composed by Composer · https://composer.onpalate.com/itinerary/share/abc-123",
    );
  });

  it("includes the rich description body inline (subtitle, stops, walks)", () => {
    const it = makeItinerary({
      stops: [makeStop("A", "addr A"), makeStop("B", "addr B")],
    });
    it.header.subtitle = "A short subtitle.";
    it.walks = [walk(6)];
    const ics = generateIcsContent(it, "u@d", null, FIXED_NOW);
    // All key content present after the description's `\n` escape.
    expect(ics).toContain("DESCRIPTION:A short subtitle.");
    expect(ics).toContain("Stop 1");
    expect(ics).toContain("Stop 2");
    expect(ics).toContain("6 min walk");
  });
});

describe("buildIcsUid", () => {
  it("composes <savedId>@composer.onpalate.com", () => {
    expect(buildIcsUid("abc-123")).toBe("abc-123@composer.onpalate.com");
  });

  it("preserves uuids verbatim for stable re-import semantics", () => {
    const uuid = "4eda78bd-2432-4a7b-a960-cdc4fc5f4dc2";
    expect(buildIcsUid(uuid)).toBe(`${uuid}@composer.onpalate.com`);
  });
});
