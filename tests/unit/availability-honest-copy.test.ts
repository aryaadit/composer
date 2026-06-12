// Availability split-by-cause — 2026-06-12 fix.
//
// Three contracts pinned here:
//   1. Enrichment sets reason="no_live_data" when the data-gate trips
//      (no resy_venue_id / no resy_slug / non-resy platform) and
//      reason="fetch_failed" when the underlying Resy fetch rejects.
//   2. The renderer branches its copy on `reason` for Resy / Tock /
//      generic — OpenTable keeps its single line either way.
//   3. fetchResyWithTimeout actually wires AbortController.signal
//      into the Resy fetch — the prior implementation created a
//      controller but never threaded it, so the 5s budget was dead
//      code and slow Resy hung the whole compose.

import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

// Mock the Resy module BEFORE importing the enrichment module so the
// mock is in place when enrichment binds its import.
vi.mock("@/lib/availability/resy", () => ({
  getResyAvailability: vi.fn(),
}));

import { enrichWithAvailability } from "@/lib/itinerary/availability-enrichment";
import { getResyAvailability } from "@/lib/availability/resy";
import type {
  ItineraryResponse,
  ItineraryStop,
  Venue,
} from "@/types";

const getResyMock = vi.mocked(getResyAvailability);

function makeVenue(overrides: Partial<Venue> = {}): Venue {
  return {
    id: "v1",
    name: "Test Venue",
    neighborhood: "midtown",
    category: "drinks",
    price_tier: 2,
    vibe_tags: ["drinks_led"],
    occasion_tags: ["dating"],
    stop_roles: ["main"],
    time_blocks: ["evening"],
    duration_hours: 2,
    outdoor_seating: false,
    reservation_difficulty: 2,
    reservation_url: "https://resy.com/cities/new-york-ny/venues/test-venue",
    maps_url: "",
    curation_note: "",
    awards: null,
    curated_by: null,
    signature_order: null,
    address: "",
    latitude: 40.7,
    longitude: -73.99,
    active: true,
    image_keys: [],
    quality_score: 80,
    curation_boost: 0,
    reservation_platform: "resy",
    resy_venue_id: 12345,
    resy_slug: "test-venue",
    ...overrides,
  } as unknown as Venue;
}

function makeStop(venue: Venue): ItineraryStop {
  return {
    role: "main",
    venue,
    curation_note: "",
    spend_estimate: "$$",
    is_fixed: false,
    plan_b: null,
  };
}

function makeResponse(stops: ItineraryStop[]): ItineraryResponse {
  return {
    header: {
      title: "",
      subtitle: "",
      occasion_tag: "dating",
      vibe_tag: "drinks_led",
      estimated_total: "",
    },
    stops,
    walks: [],
    maps_url: "",
    inputs: {
      occasion: "dating",
      neighborhoods: ["midtown"],
      budget: "nice_out",
      vibe: "drinks_led",
      day: "2026-06-15",
      startTime: "19:00",
      endTime: "00:00",
    },
  } as unknown as ItineraryResponse;
}

const WINDOW = { startTime: "19:00", endTime: "00:00" };
const DATE = "2026-06-15";

beforeEach(() => {
  getResyMock.mockReset();
});

describe("enrichWithAvailability — reason split", () => {
  it("data-gate (Resy slug populated, venue id null) → reason=no_live_data, no fetch attempted", async () => {
    // The exact shape of the 68 venues described in the report:
    // platform=resy, slug present, venue_id null. Server must NOT
    // call Resy and the renderer must read the honest copy.
    const venue = makeVenue({ resy_venue_id: null, resy_slug: "test-venue" });
    const response = makeResponse([makeStop(venue)]);

    const result = await enrichWithAvailability(response, DATE, 2, WINDOW);

    const av = result.stops[0].availability!;
    expect(av.status).toBe("unconfirmed");
    expect(av.reason).toBe("no_live_data");
    // bookingUrlBase is the venue's reservation_url (unchanged Resy URL).
    expect(av.bookingUrlBase).toMatch(/resy\.com/);
    // And — the contract that matters most — Resy was NEVER called.
    expect(getResyMock).not.toHaveBeenCalled();
  });

  it("non-resy platform → reason=no_live_data, no fetch attempted", async () => {
    const venue = makeVenue({
      reservation_platform: "tock",
      resy_venue_id: null,
      resy_slug: null,
      reservation_url: "https://exploretock.com/test-venue",
    });
    const response = makeResponse([makeStop(venue)]);

    const result = await enrichWithAvailability(response, DATE, 2, WINDOW);

    const av = result.stops[0].availability!;
    expect(av.status).toBe("unconfirmed");
    expect(av.reason).toBe("no_live_data");
    expect(getResyMock).not.toHaveBeenCalled();
  });

  it("Resy fetch throws → reason=fetch_failed, bookingUrlBase is the canonical Resy URL", async () => {
    getResyMock.mockRejectedValueOnce(new Error("network blip"));
    const venue = makeVenue(); // full Resy data
    const response = makeResponse([makeStop(venue)]);

    const result = await enrichWithAvailability(response, DATE, 2, WINDOW);

    const av = result.stops[0].availability!;
    expect(av.status).toBe("unconfirmed");
    expect(av.reason).toBe("fetch_failed");
    // The catch branch reaches for buildResyBookingUrl unconditionally
    // since by that point we know resy_slug is populated.
    expect(av.bookingUrlBase).toMatch(/resy\.com/);
    expect(getResyMock).toHaveBeenCalledTimes(1);
  });

  it("Resy fetch returns slots in window → has_slots (sanity check; no reason field)", async () => {
    getResyMock.mockResolvedValueOnce([
      {
        time: `${DATE} 19:30:00`,
        endTime: `${DATE} 21:30:00`,
        type: "Dining Room",
        token: "rgs://test-token",
      },
    ]);
    const venue = makeVenue();
    const response = makeResponse([makeStop(venue)]);

    const result = await enrichWithAvailability(response, DATE, 2, WINDOW);

    const av = result.stops[0].availability!;
    expect(av.status).toBe("has_slots");
    expect(av.reason).toBeUndefined();
    expect(av.slots.length).toBe(1);
  });

  it("OpenTable rescue (platform=null, url is OpenTable) → reason=no_live_data", async () => {
    // The upper branch in enrichment that detects an OpenTable URL on a
    // platform-null venue and rescues it from walk_in. The honest
    // reason is still no_live_data — OpenTable inherently doesn't
    // share live availability.
    const venue = makeVenue({
      reservation_platform: null,
      resy_venue_id: null,
      resy_slug: null,
      reservation_url: "https://www.opentable.com/restref/client?rid=12345",
    });
    const response = makeResponse([makeStop(venue)]);

    const result = await enrichWithAvailability(response, DATE, 2, WINDOW);

    const av = result.stops[0].availability!;
    expect(av.status).toBe("unconfirmed");
    expect(av.reason).toBe("no_live_data");
    expect(av.bookingUrlBase).toMatch(/opentable/);
    expect(getResyMock).not.toHaveBeenCalled();
  });

  it("Resy returns empty + venue is wired → no_slots_in_block (NOT unconfirmed)", async () => {
    // Pin the boundary: an HTTP error in resy.ts returns [] which lands
    // here as no_slots_in_block, NOT unconfirmed. The reported bug
    // ("Couldn't load times" on venues that actually have slots) only
    // fires when status=unconfirmed — this sanity-check makes sure a
    // future refactor doesn't blur the boundary.
    getResyMock.mockResolvedValueOnce([]);
    const venue = makeVenue();
    const response = makeResponse([makeStop(venue)]);

    const result = await enrichWithAvailability(response, DATE, 2, WINDOW);

    const av = result.stops[0].availability!;
    expect(av.status).toBe("no_slots_in_block");
    expect(av.reason).toBeUndefined();
  });
});

describe("StopAvailability renderer — copy branches on reason (source contract)", () => {
  let src: string;

  beforeEach(async () => {
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");
    const here = dirname(fileURLToPath(import.meta.url));
    src = readFileSync(
      join(
        here,
        "..",
        "..",
        "src",
        "components",
        "itinerary",
        "StopAvailability.tsx",
      ),
      "utf-8",
    );
  });

  it("OpenTable keeps its single honest line regardless of reason", async () => {
    expect(src).toMatch(
      /detectedId === "opentable"[\s\S]*?"OpenTable doesn't share live availability\. Book directly\."/,
    );
  });

  it("no_live_data → Resy honest copy (sentence case, no em dashes)", async () => {
    expect(src).toMatch(
      /reason === "no_live_data"[\s\S]*?detectedId === "resy"[\s\S]*?"Resy doesn't share live times for this spot\. Book directly\."/,
    );
    // No em dashes (–, —) in any of the new strings.
    expect(src).not.toMatch(/Resy doesn't share live times[^"]*[—–]/);
  });

  it("no_live_data → Tock honest copy", async () => {
    expect(src).toMatch(
      /"Tock doesn't share live times for this spot\. Book directly\."/,
    );
  });

  it("no_live_data → generic fallback for other / null platforms", async () => {
    expect(src).toMatch(
      /"We don't have live times for this spot\. Book directly\."/,
    );
  });

  it("fetch_failed (or legacy absent reason) keeps the apologetic Resy copy", async () => {
    expect(src).toMatch(
      /"Couldn't load times\. Check directly on Resy\."/,
    );
    expect(src).toMatch(
      /"Couldn't load times\. Check directly on Tock\."/,
    );
    // Generic case interpolates platform name.
    expect(src).toMatch(
      /`Couldn't load times\. Check directly on \$\{name\}\.`/,
    );
  });

  it("absent reason on legacy availability defaults to fetch_failed (conservative)", async () => {
    // The ?? "fetch_failed" fallback keeps saved itineraries from
    // before this field stay on the apologetic copy.
    expect(src).toMatch(/availability\.reason \?\? "fetch_failed"/);
  });
});

describe("fetchResyWithTimeout — AbortController signal threads into fetch", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  it("passes the controller's signal into the underlying fetch call", async () => {
    // Use the REAL Resy client here (not the module-mocked
    // enrichment binding from the top of the file). We reach it via
    // a fresh dynamic import that bypasses the top-level vi.mock,
    // since vi.mock() is hoisted but doesn't apply to dynamic
    // imports of unmocked specifiers.
    const fetchSpy = vi.fn(async (_url: string, init?: RequestInit) => {
      return new Response(
        JSON.stringify({ results: { venues: [{ slots: [] }] } }),
        { status: 200 },
      );
    });
    globalThis.fetch = fetchSpy as unknown as typeof globalThis.fetch;

    const { getResyAvailability: realGetResy } = await vi.importActual<
      typeof import("@/lib/availability/resy")
    >("@/lib/availability/resy");

    const controller = new AbortController();
    await realGetResy(12345, "2026-06-15", 2, controller.signal);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0];
    // The bug being fixed: signal used to be missing entirely.
    expect(init?.signal).toBeDefined();
    expect(init?.signal).toBe(controller.signal);
  });

  it("aborting the controller mid-flight rejects the fetch with AbortError", async () => {
    // Simulate Resy hanging forever; abort fires after 50ms; the
    // fetch promise rejects. This is the behavior that used to be
    // dead code — the timeout fired but never aborted anything.
    const hangingFetch = vi.fn((_url: string, init?: RequestInit) => {
      return new Promise<Response>((_, reject) => {
        const signal = init?.signal;
        if (!signal) {
          // Defensive — if the bug ever reappears (signal missing),
          // resolve so the test fails loudly on the `rejects`
          // assertion below instead of hanging forever.
          setTimeout(
            () => reject(new Error("test setup: no signal received")),
            100,
          );
          return;
        }
        signal.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    });
    globalThis.fetch = hangingFetch as unknown as typeof globalThis.fetch;

    const { getResyAvailability: realGetResy } = await vi.importActual<
      typeof import("@/lib/availability/resy")
    >("@/lib/availability/resy");

    const controller = new AbortController();
    const pending = realGetResy(12345, "2026-06-15", 2, controller.signal);
    // Fire abort on a microtask boundary so the listener is wired.
    queueMicrotask(() => controller.abort());

    await expect(pending).rejects.toThrow(/abort/i);
  });
});
