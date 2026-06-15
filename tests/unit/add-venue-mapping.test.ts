import { describe, expect, it } from "vitest";

import {
  blocksForDayIntervals,
  scheduleToDayBlocks,
  unionTimeBlocks,
  type Schedule,
} from "@/lib/venues/hours-to-blocks";
import {
  extractMapsContext,
  extractPlaceIdFromInput,
  extractSchedule,
  extractWeekdayDescriptions,
  mapPriceLevel,
  placesToRow,
  scheduleToHoursText,
} from "@/lib/venues/places-to-row";

// Pure data-mapping contracts for the "Add venue" admin feature.
// The route handler depends on these mappers behaving honestly;
// no jsdom is needed because every function under test is pure.

describe("PRICE_LEVEL_MAP — Places enum to composer price_tier", () => {
  it("matches the canonical Python backfill map", () => {
    expect(mapPriceLevel("PRICE_LEVEL_FREE")).toBeNull();
    expect(mapPriceLevel("PRICE_LEVEL_INEXPENSIVE")).toBe(1);
    expect(mapPriceLevel("PRICE_LEVEL_MODERATE")).toBe(2);
    expect(mapPriceLevel("PRICE_LEVEL_EXPENSIVE")).toBe(3);
    expect(mapPriceLevel("PRICE_LEVEL_VERY_EXPENSIVE")).toBe(4);
    expect(mapPriceLevel("PRICE_LEVEL_UNSPECIFIED")).toBeNull();
  });

  it("returns null for unknown / missing values", () => {
    // Unknown enum value (typo, newer API release with extra
    // levels) — silent null is the right move so the operator
    // gets a blank price_tier rather than a confidently wrong one.
    expect(mapPriceLevel("PRICE_LEVEL_BANANA")).toBeNull();
    expect(mapPriceLevel(null)).toBeNull();
    expect(mapPriceLevel(undefined)).toBeNull();
    expect(mapPriceLevel(2)).toBeNull();
  });
});

describe("extractPlaceIdFromInput — ChIJ-shape only (post-fix-C)", () => {
  it("returns a bare place_id unchanged", () => {
    expect(extractPlaceIdFromInput("ChIJN1t_tDeuEmsRUsoyG83frY4")).toBe(
      "ChIJN1t_tDeuEmsRUsoyG83frY4",
    );
  });

  it("extracts the place_id from the canonical ?q=place_id:ChIJ... form", () => {
    expect(
      extractPlaceIdFromInput(
        "https://www.google.com/maps/place/?q=place_id:ChIJN1t_tDeuEmsRUsoyG83frY4",
      ),
    ).toBe("ChIJN1t_tDeuEmsRUsoyG83frY4");
  });

  it("extracts the place_id from the older ?place_id=ChIJ... query param form", () => {
    expect(
      extractPlaceIdFromInput(
        "https://maps.google.com/?cid=999&place_id=ChIJN1t_tDeuEmsRUsoyG83frY4",
      ),
    ).toBe("ChIJN1t_tDeuEmsRUsoyG83frY4");
  });

  it("explicitly REJECTS the !1s<hex>:<hex> feature ID — that is not a place_id", () => {
    // Pre-fix-C the extractor returned this hex shape and the route
    // fed it to Places, getting null. Now we return null so the
    // route falls through to Text Search using the URL's name +
    // coords as the resolver.
    expect(
      extractPlaceIdFromInput(
        "https://www.google.com/maps/place/Spot/@40.7,-74.0,15z/data=!4m6!3m5!1s0x89c259a9b3117469:0xd134e199a405a163!8m2!3d40.7!4d-74.0",
      ),
    ).toBeNull();
  });

  it("explicitly REJECTS /g/ Knowledge Graph MIDs", () => {
    expect(
      extractPlaceIdFromInput(
        "https://www.google.com/maps/place/Spot/g/11h1z9xn3",
      ),
    ).toBeNull();
  });

  it("does not pick up a short malformed value embedded as q=place_id:", () => {
    // Sanity guard: looksLikeChIJ requires >=23 chars. A truncated
    // value like "ChIJN1t" (7 chars) must NOT be accepted, even if
    // it's wrapped in the canonical q=place_id: syntax.
    expect(
      extractPlaceIdFromInput(
        "https://www.google.com/maps/place/?q=place_id:ChIJN1t",
      ),
    ).toBeNull();
  });

  it("returns null for inputs with no recognizable shape", () => {
    expect(extractPlaceIdFromInput("")).toBeNull();
    expect(extractPlaceIdFromInput("   ")).toBeNull();
    expect(extractPlaceIdFromInput("https://example.com/")).toBeNull();
    // Shortlink: the parser alone can't resolve these, the route
    // calls resolveMapsShortlink to follow the redirect first.
    expect(extractPlaceIdFromInput("https://maps.app.goo.gl/AbCdEf")).toBeNull();
  });
});

describe("extractMapsContext — Text Search fallback input", () => {
  it("pulls name + lat/lng from !3d/!4d pin coords (preferred over @lat,lng)", () => {
    const url =
      "https://www.google.com/maps/place/Le+Bernardin/@40.7616,-73.9819,15z/data=!4m6!3m5!1s0x89c258f7d09f2c43:0xabc!8m2!3d40.7615200!4d-73.9817100";
    expect(extractMapsContext(url)).toEqual({
      name: "Le Bernardin",
      // !3d/!4d wins over the @-form viewport coords.
      lat: 40.7615200,
      lng: -73.9817100,
    });
  });

  it("falls back to @lat,lng when !3d/!4d is missing", () => {
    const url =
      "https://www.google.com/maps/place/Joe%27s+Pizza/@40.7305,-74.0027,17z/";
    expect(extractMapsContext(url)).toEqual({
      name: "Joe's Pizza",
      lat: 40.7305,
      lng: -74.0027,
    });
  });

  it("URL-decodes the name segment (encoded spaces, apostrophes)", () => {
    const url =
      "https://www.google.com/maps/place/Caf%C3%A9+M%C3%A9xico/@40.0,-73.0,15z/";
    expect(extractMapsContext(url).name).toBe("Café México");
  });

  it("treats + as a space in the name segment", () => {
    const url =
      "https://www.google.com/maps/place/Lower+East+Side+Bar/@40.0,-73.0,15z/";
    expect(extractMapsContext(url).name).toBe("Lower East Side Bar");
  });

  it("returns nulls for fields the URL doesn't expose", () => {
    expect(extractMapsContext("https://example.com/")).toEqual({
      name: null,
      lat: null,
      lng: null,
    });
  });
});

describe("hours-to-blocks — canonical boundaries", () => {
  it("a 5p–10p dinner spot lands in 'evening'", () => {
    expect(blocksForDayIntervals([[17.0, 22.0]])).toEqual(["evening"]);
  });

  it("a brunch 11a–3p spot straddles morning and afternoon", () => {
    expect(blocksForDayIntervals([[11.0, 15.0]])).toEqual(["morning", "afternoon"]);
  });

  it("a bar open until 1:30 AM hits late_night via the past-midnight wrap", () => {
    // 22.0 -> 25.5 = open at 10 PM, close at 1:30 AM next day.
    expect(blocksForDayIntervals([[22.0, 25.5]])).toEqual(["late_night"]);
  });

  it("strict-overlap rule: 8a-12p sharp is morning ONLY", () => {
    // Touching the noon boundary should NOT produce afternoon —
    // otherwise a coffee shop with a tidy noon close would
    // surface for "afternoon" filters.
    expect(blocksForDayIntervals([[8.0, 12.0]])).toEqual(["morning"]);
  });

  it("ignores degenerate intervals (close <= open)", () => {
    expect(blocksForDayIntervals([[10.0, 10.0]])).toEqual([]);
    expect(blocksForDayIntervals([[15.0, 14.0]])).toEqual([]);
  });

  it("split day -> per-day blocks reflect both intervals", () => {
    // Brunch + dinner with a 3-7 PM gap. Should hit morning,
    // afternoon (via brunch through 3p), and evening (via dinner).
    const sched: Schedule = { sat: [[10.0, 15.0], [17.0, 22.0]] };
    expect(scheduleToDayBlocks(sched).sat).toEqual([
      "morning",
      "afternoon",
      "evening",
    ]);
  });
});

describe("scheduleToDayBlocks + unionTimeBlocks", () => {
  it("union across the week is the dedup of all per-day blocks", () => {
    const sched: Schedule = {
      mon: [[17.0, 22.0]],
      tue: [[17.0, 22.0]],
      fri: [[22.0, 25.0]], // late night Friday only
    };
    const dayBlocks = scheduleToDayBlocks(sched);
    expect(unionTimeBlocks(dayBlocks)).toEqual(["evening", "late_night"]);
  });

  it("days the schedule omits produce empty arrays (not undefined)", () => {
    const dayBlocks = scheduleToDayBlocks({ mon: [[17.0, 22.0]] });
    expect(dayBlocks.tue).toEqual([]);
    expect(dayBlocks.sun).toEqual([]);
  });
});

describe("extractSchedule — Places periods to internal Schedule", () => {
  it("converts a simple Monday dinner period", () => {
    const place = {
      regularOpeningHours: {
        periods: [
          {
            open: { day: 1, hour: 17, minute: 0 },
            close: { day: 1, hour: 22, minute: 0 },
          },
        ],
      },
    };
    expect(extractSchedule(place).mon).toEqual([[17.0, 22.0]]);
  });

  it("folds a past-midnight close into the open day with hour+24", () => {
    // Bar open Friday 6 PM, closes Saturday 1:30 AM. Google sends
    // close.day = 6 (Sat). We need [18, 25.5] under fri.
    const place = {
      regularOpeningHours: {
        periods: [
          {
            open: { day: 5, hour: 18, minute: 0 },
            close: { day: 6, hour: 1, minute: 30 },
          },
        ],
      },
    };
    expect(extractSchedule(place).fri).toEqual([[18.0, 25.5]]);
  });

  it("treats missing close as 24-hour service via [open, 24]", () => {
    const place = {
      regularOpeningHours: {
        periods: [{ open: { day: 1, hour: 6, minute: 0 } }],
      },
    };
    expect(extractSchedule(place).mon).toEqual([[6.0, 24.0]]);
  });

  it("returns an empty schedule when regularOpeningHours is absent", () => {
    expect(extractSchedule({})).toEqual({});
    expect(extractSchedule({ regularOpeningHours: null })).toEqual({});
  });
});

describe("extractWeekdayDescriptions — verbose Google-form hours (FIX B)", () => {
  it("joins regularOpeningHours.weekdayDescriptions with '; '", () => {
    // Matches the verbose Places form: "Monday: 4:00 - 10:00 PM"
    // strings exactly as Google emits them, joined by "; ". This is
    // the format every existing NYC Venues row uses, so newly
    // staged rows diff cleanly against the live catalog.
    const place = {
      regularOpeningHours: {
        weekdayDescriptions: [
          "Monday: 4:00 - 10:00 PM",
          "Tuesday: 4:00 - 10:00 PM",
          "Wednesday: 4:00 - 10:00 PM",
        ],
      },
    };
    expect(extractWeekdayDescriptions(place)).toBe(
      "Monday: 4:00 - 10:00 PM; Tuesday: 4:00 - 10:00 PM; Wednesday: 4:00 - 10:00 PM",
    );
  });

  it("returns empty string when regularOpeningHours or weekdayDescriptions is absent", () => {
    expect(extractWeekdayDescriptions({})).toBe("");
    expect(extractWeekdayDescriptions({ regularOpeningHours: null })).toBe("");
    expect(extractWeekdayDescriptions({ regularOpeningHours: { periods: [] } })).toBe("");
  });

  it("drops non-string and empty entries", () => {
    const place = {
      regularOpeningHours: {
        weekdayDescriptions: ["Monday: open", "", null, 5, "Tuesday: closed"],
      },
    };
    expect(extractWeekdayDescriptions(place)).toBe("Monday: open; Tuesday: closed");
  });
});

describe("scheduleToHoursText (legacy compact formatter, still exported)", () => {
  it("renders Mon-Sun order with multiple intervals comma-joined", () => {
    const sched: Schedule = {
      mon: [[17.0, 22.0]],
      sat: [[10.0, 15.0], [17.0, 22.0]],
    };
    expect(scheduleToHoursText(sched)).toBe(
      "Mon 5p-10p; Sat 10a-3p, 5p-10p",
    );
  });

  it("omits days with no intervals", () => {
    expect(scheduleToHoursText({ wed: [[12.0, 14.0]] })).toBe("Wed 12p-2p");
  });
});

describe("placesToRow — deterministic field mapping", () => {
  it("maps the identity + Google fields without touching editorial taxonomy", () => {
    const place = {
      displayName: { text: "Test Bar" },
      formattedAddress: "1 Test St, New York",
      location: { latitude: 40.7, longitude: -74.0 },
      // Pre-fix-A the row used googleMapsUri verbatim. Post-fix-A
      // maps_url is constructed from place_id, so whatever Places
      // returns here is irrelevant — the test below pins that.
      googleMapsUri: "https://maps.google.com/?cid=1",
      nationalPhoneNumber: "(212) 555-0100",
      rating: 4.6,
      userRatingCount: 1234,
      types: ["bar", "establishment"],
      businessStatus: "OPERATIONAL",
      priceLevel: "PRICE_LEVEL_EXPENSIVE",
      outdoorSeating: true,
      allowsDogs: false,
      goodForChildren: undefined,
      accessibilityOptions: { wheelchairAccessibleEntrance: true },
      regularOpeningHours: {
        weekdayDescriptions: [
          "Monday: 6:00 - 10:00 PM",
          "Tuesday: 6:00 - 10:00 PM",
        ],
        periods: [
          {
            open: { day: 5, hour: 18, minute: 0 },
            close: { day: 6, hour: 1, minute: 30 },
          },
        ],
      },
    };
    const { fields } = placesToRow(place, {
      placeId: "ChIJTEST",
      today: "2026-06-15",
    });

    // Identity + Google
    expect(fields.name).toBe("Test Bar");
    expect(fields.address).toBe("1 Test St, New York");
    expect(fields.latitude).toBe("40.7");
    expect(fields.longitude).toBe("-74");
    expect(fields.google_place_id).toBe("ChIJTEST");
    // FIX A: maps_url is the canonical place_id form, NOT the
    // googleMapsUri Places returned (maps.google.com/?cid=...).
    expect(fields.maps_url).toBe(
      "https://www.google.com/maps/place/?q=place_id:ChIJTEST",
    );
    expect(fields.google_phone).toBe("(212) 555-0100");
    expect(fields.google_rating).toBe("4.6");
    expect(fields.google_review_count).toBe("1234");
    expect(fields.google_types).toBe("bar,establishment");
    expect(fields.business_status).toBe("OPERATIONAL");
    expect(fields.price_tier).toBe("3");

    // FIX B: hours come from weekdayDescriptions joined by "; ",
    // matching the verbose Places form every existing NYC Venues
    // row uses.
    expect(fields.hours).toBe(
      "Monday: 6:00 - 10:00 PM; Tuesday: 6:00 - 10:00 PM",
    );

    // Amenities: yes/no/blank
    expect(fields.outdoor_seating).toBe("yes");
    expect(fields.dog_friendly).toBe("no");
    expect(fields.kid_friendly).toBe("");
    expect(fields.wheelchair_accessible).toBe("yes");

    // Time blocks: Friday 6p-1:30a -> evening + late_night.
    expect(fields.fri_blocks).toBe("evening,late_night");
    expect(fields.time_blocks).toBe("evening,late_night");
    expect(fields.split_hours).toBe("no");

    // Constants
    expect(fields.curated_by).toBe("adit");
    expect(fields.content_tier).toBe("1");
    expect(fields.curation_boost).toBe("0");
    expect(fields.active).toBe("yes");
    expect(fields.enriched).toBe("yes");
    expect(fields.last_verified).toBe("2026-06-15");

    // Editorial fields stay blank in the deterministic half; Gemini
    // fills them downstream in the route layer.
    expect(fields.neighborhood).toBeUndefined();
    expect(fields.category).toBeUndefined();
    expect(fields.vibe_tags).toBeUndefined();
    expect(fields.curation_note).toBeUndefined();
  });

  it("split-day schedule sets split_hours to yes", () => {
    const place = {
      regularOpeningHours: {
        periods: [
          { open: { day: 6, hour: 10 }, close: { day: 6, hour: 15 } },
          { open: { day: 6, hour: 17 }, close: { day: 6, hour: 22 } },
        ],
      },
    };
    const { fields } = placesToRow(place, {
      placeId: "ChIJSPLIT",
      today: "2026-06-15",
    });
    expect(fields.split_hours).toBe("yes");
    expect(fields.sat_blocks).toBe("morning,afternoon,evening");
  });

  it("renders ADD_VENUE_REVIEW_TAB-shaped key set (no protected columns leaked)", () => {
    // venue_id, created_at, updated_at, id, image_keys are operator-
    // or DB-owned; the deterministic mapper must NOT emit them.
    const { fields } = placesToRow(
      {
        displayName: { text: "Test" },
        location: { latitude: 40, longitude: -74 },
      },
      { placeId: "ChIJTEST", today: "2026-06-15" },
    );
    for (const protectedKey of ["id", "created_at", "updated_at", "image_keys"]) {
      expect(fields[protectedKey]).toBeUndefined();
    }
    // venue_id is also unset deterministically — the operator types
    // the slug in the sheet review step.
    expect(fields.venue_id).toBeUndefined();
  });
});
