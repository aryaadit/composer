// Phase 10 — fetchOrCacheWalkingRoute + encodeGeoJsonLineToPolyline.
//
// We mock @/lib/supabase and global.fetch so the tests don't touch the
// real Supabase service-role client or the Mapbox Directions API. Each
// test resets all mocks and rebuilds the supabase chain — the chain
// uses thenable-returning maybeSingle() and upsert() that the helper
// awaits at well-defined points.

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { LineString } from "geojson";

vi.mock("@/lib/supabase", () => ({
  getServiceSupabase: vi.fn(),
}));

import { getServiceSupabase } from "@/lib/supabase";
import {
  fetchOrCacheWalkingRoute,
  encodeGeoJsonLineToPolyline,
} from "@/lib/walking-routes";

const ORIGIN_ID = "00000000-0000-0000-0000-000000000001";
const DEST_ID = "00000000-0000-0000-0000-000000000002";
const ORIGIN: [number, number] = [-74.003, 40.733];
const DEST: [number, number] = [-73.999, 40.730];

interface SupabaseStub {
  from: ReturnType<typeof vi.fn>;
  upsertSpy: ReturnType<typeof vi.fn>;
}

interface CacheRowFixture {
  route_geometry: LineString;
  walk_minutes: number;
  walk_distance_meters: number;
  /** Defaults to ORIGIN/DEST when omitted, simulating a fresh row whose
   * stored coords match the current venue coords. Tests that exercise
   * the stale-coord refetch path override these. Numeric — Postgres
   * NUMERIC arrives as a string at runtime, and the helper handles
   * both via Number(), so either shape is fine in fixtures. */
  origin_lat?: number;
  origin_lng?: number;
  dest_lat?: number;
  dest_lng?: number;
}

function buildSupabaseStub(opts: {
  cacheRow: CacheRowFixture | null;
  cacheError?: { message: string } | null;
  upsertError?: { message: string } | null;
}): SupabaseStub {
  // Default coord-fingerprint columns to the test's ORIGIN/DEST so
  // existing tests (cache hit, error paths) don't need to know about
  // the new columns. Tests targeting the stale-coord branch pass
  // explicit coords.
  const enrichedRow: (CacheRowFixture & {
    origin_lat: number;
    origin_lng: number;
    dest_lat: number;
    dest_lng: number;
  }) | null = opts.cacheRow && {
    ...opts.cacheRow,
    origin_lat: opts.cacheRow.origin_lat ?? ORIGIN[1],
    origin_lng: opts.cacheRow.origin_lng ?? ORIGIN[0],
    dest_lat: opts.cacheRow.dest_lat ?? DEST[1],
    dest_lng: opts.cacheRow.dest_lng ?? DEST[0],
  };
  const upsertSpy = vi.fn().mockResolvedValue({
    error: opts.upsertError ?? null,
  });
  const from = vi.fn().mockImplementation(() => ({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({
            data: enrichedRow,
            error: opts.cacheError ?? null,
          }),
        }),
      }),
    }),
    upsert: upsertSpy,
  }));
  return { from, upsertSpy };
}

const SAMPLE_GEOMETRY: LineString = {
  type: "LineString",
  coordinates: [
    [-74.003, 40.733],
    [-74.001, 40.732],
    [-73.999, 40.730],
  ],
};

beforeEach(() => {
  vi.resetAllMocks();
  // Server-side Mapbox fetches authenticate via MAPBOX_SERVER_TOKEN, not
  // the URL-allowlisted public token. Tests that exercise the live
  // Mapbox path set this; the missing-token + cross-fallback tests
  // override it explicitly.
  process.env.MAPBOX_SERVER_TOKEN = "test-server-token";
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN = "test-public-token";
});

describe("fetchOrCacheWalkingRoute — cache hit", () => {
  it("returns the cached row without calling Mapbox", async () => {
    const stub = buildSupabaseStub({
      cacheRow: {
        route_geometry: SAMPLE_GEOMETRY,
        walk_minutes: 7,
        walk_distance_meters: 540,
      },
    });
    vi.mocked(getServiceSupabase).mockReturnValue(
      { from: stub.from } as never,
    );
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("should not be called"));

    const result = await fetchOrCacheWalkingRoute(
      ORIGIN_ID, DEST_ID, ORIGIN, DEST, 99, 99000,
    );

    expect(result.routeGeometry).toEqual(SAMPLE_GEOMETRY);
    expect(result.walkMinutes).toBe(7);
    expect(result.walkDistanceMeters).toBe(540);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(stub.upsertSpy).not.toHaveBeenCalled();
  });

  it("matching coords (PG NUMERIC arrives as string) still hits cache", async () => {
    // supabase-js returns NUMERIC columns as decimal strings, not JS
    // numbers. The helper Number()s them before rounding — this test
    // catches a regression where someone reaches for === on the raw
    // string and misses the cache forever.
    const stub = buildSupabaseStub({
      cacheRow: {
        route_geometry: SAMPLE_GEOMETRY,
        walk_minutes: 7,
        walk_distance_meters: 540,
        origin_lat: ORIGIN[1] as unknown as number,
        origin_lng: ORIGIN[0] as unknown as number,
        dest_lat: DEST[1] as unknown as number,
        dest_lng: DEST[0] as unknown as number,
      },
    });
    // Re-stub maybeSingle to return STRINGS, not numbers, simulating
    // the PG NUMERIC wire format.
    const enrichedFrom = vi.fn().mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                route_geometry: SAMPLE_GEOMETRY,
                walk_minutes: 7,
                walk_distance_meters: 540,
                origin_lat: String(ORIGIN[1]),
                origin_lng: String(ORIGIN[0]),
                dest_lat: String(DEST[1]),
                dest_lng: String(DEST[0]),
              },
              error: null,
            }),
          }),
        }),
      }),
      upsert: stub.upsertSpy,
    }));
    vi.mocked(getServiceSupabase).mockReturnValue(
      { from: enrichedFrom } as never,
    );
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("should not be called"));

    const result = await fetchOrCacheWalkingRoute(
      ORIGIN_ID, DEST_ID, ORIGIN, DEST, 99, 99000,
    );

    expect(result.routeGeometry).toEqual(SAMPLE_GEOMETRY);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(stub.upsertSpy).not.toHaveBeenCalled();
  });
});

describe("fetchOrCacheWalkingRoute — stale coords trigger refetch", () => {
  it("cached row with mismatched origin coords → refetch + upsert", async () => {
    // Row exists for this venue pair but the stored origin lat drifted
    // ~50m from the current venue lat (data-cleanup nudge). Helper
    // must refetch from Mapbox and overwrite the row with the new
    // geometry + new coords.
    const FRESH_GEOMETRY: LineString = {
      type: "LineString",
      coordinates: [
        [-74.003, 40.733],
        [-74.000, 40.731],
        [-73.999, 40.730],
      ],
    };
    const stub = buildSupabaseStub({
      cacheRow: {
        route_geometry: SAMPLE_GEOMETRY,
        walk_minutes: 7,
        walk_distance_meters: 540,
        // Stale: differs from ORIGIN at the 4th decimal (~11 m).
        origin_lat: 40.7335,
        origin_lng: ORIGIN[0],
        dest_lat: DEST[1],
        dest_lng: DEST[0],
      },
    });
    vi.mocked(getServiceSupabase).mockReturnValue(
      { from: stub.from } as never,
    );
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          routes: [
            { geometry: FRESH_GEOMETRY, duration: 480, distance: 600 },
          ],
        }),
        { status: 200 },
      ),
    );

    const result = await fetchOrCacheWalkingRoute(
      ORIGIN_ID, DEST_ID, ORIGIN, DEST, 99, 99000,
    );

    // Returned the FRESH geometry, not the stale cached one.
    expect(result.routeGeometry).toEqual(FRESH_GEOMETRY);
    expect(result.walkMinutes).toBe(8); // 480 / 60
    expect(result.walkDistanceMeters).toBe(600);

    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Upsert overwrites the stale row with the current coords (rounded
    // to 6 dp). The (origin_venue_id, destination_venue_id) UNIQUE
    // constraint handles the conflict — same PK, fresh values.
    expect(stub.upsertSpy).toHaveBeenCalledTimes(1);
    const upsertArgs = stub.upsertSpy.mock.calls[0][0];
    expect(upsertArgs.origin_venue_id).toBe(ORIGIN_ID);
    expect(upsertArgs.destination_venue_id).toBe(DEST_ID);
    expect(upsertArgs.route_geometry).toEqual(FRESH_GEOMETRY);
    expect(upsertArgs.origin_lat).toBe(ORIGIN[1]); // 40.733
    expect(upsertArgs.origin_lng).toBe(ORIGIN[0]); // -74.003
    expect(upsertArgs.dest_lat).toBe(DEST[1]);
    expect(upsertArgs.dest_lng).toBe(DEST[0]);
  });

  it("cached row with mismatched destination coords also triggers refetch", async () => {
    const stub = buildSupabaseStub({
      cacheRow: {
        route_geometry: SAMPLE_GEOMETRY,
        walk_minutes: 7,
        walk_distance_meters: 540,
        origin_lat: ORIGIN[1],
        origin_lng: ORIGIN[0],
        dest_lat: DEST[1],
        // Stale by ~10m on the destination side.
        dest_lng: -73.998,
      },
    });
    vi.mocked(getServiceSupabase).mockReturnValue(
      { from: stub.from } as never,
    );
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          routes: [
            { geometry: SAMPLE_GEOMETRY, duration: 432, distance: 540 },
          ],
        }),
        { status: 200 },
      ),
    );

    await fetchOrCacheWalkingRoute(
      ORIGIN_ID, DEST_ID, ORIGIN, DEST, 99, 99000,
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(stub.upsertSpy).toHaveBeenCalledTimes(1);
  });
});

describe("fetchOrCacheWalkingRoute — cache miss → Mapbox success", () => {
  it("fetches from Mapbox, persists, and returns the live route", async () => {
    const stub = buildSupabaseStub({ cacheRow: null });
    vi.mocked(getServiceSupabase).mockReturnValue(
      { from: stub.from } as never,
    );

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          routes: [
            {
              geometry: SAMPLE_GEOMETRY,
              duration: 432, // 7.2 min → rounds to 7
              distance: 540,
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const result = await fetchOrCacheWalkingRoute(
      ORIGIN_ID, DEST_ID, ORIGIN, DEST, 99, 99000,
    );

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy.mock.calls[0][0]).toMatch(
      /^https:\/\/api\.mapbox\.com\/directions\/v5\/mapbox\/walking\//,
    );
    expect(result.routeGeometry).toEqual(SAMPLE_GEOMETRY);
    expect(result.walkMinutes).toBe(7);
    expect(result.walkDistanceMeters).toBe(540);

    expect(stub.upsertSpy).toHaveBeenCalledTimes(1);
    const upsertArgs = stub.upsertSpy.mock.calls[0][0];
    expect(upsertArgs.origin_venue_id).toBe(ORIGIN_ID);
    expect(upsertArgs.destination_venue_id).toBe(DEST_ID);
    expect(upsertArgs.route_geometry).toEqual(SAMPLE_GEOMETRY);
    // Phase-10 follow-up: coord fingerprint persisted alongside the
    // geometry so a future venue-coord correction can be detected.
    expect(upsertArgs.origin_lat).toBe(ORIGIN[1]);
    expect(upsertArgs.origin_lng).toBe(ORIGIN[0]);
    expect(upsertArgs.dest_lat).toBe(DEST[1]);
    expect(upsertArgs.dest_lng).toBe(DEST[0]);
  });
});

describe("fetchOrCacheWalkingRoute — Mapbox error paths", () => {
  it("HTTP 500 → fallback geometry null + fallback minutes/distance", async () => {
    const stub = buildSupabaseStub({ cacheRow: null });
    vi.mocked(getServiceSupabase).mockReturnValue(
      { from: stub.from } as never,
    );
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("server error", { status: 500 }),
    );

    const result = await fetchOrCacheWalkingRoute(
      ORIGIN_ID, DEST_ID, ORIGIN, DEST, 6, 480,
    );

    expect(result.routeGeometry).toBeNull();
    expect(result.walkMinutes).toBe(6);
    expect(result.walkDistanceMeters).toBe(480);
    expect(stub.upsertSpy).not.toHaveBeenCalled();
  });

  it("fetch rejects (AbortError) → fallback values", async () => {
    const stub = buildSupabaseStub({ cacheRow: null });
    vi.mocked(getServiceSupabase).mockReturnValue(
      { from: stub.from } as never,
    );
    vi.spyOn(globalThis, "fetch").mockImplementation(() => {
      const err = new Error("aborted");
      err.name = "AbortError";
      return Promise.reject(err);
    });

    const result = await fetchOrCacheWalkingRoute(
      ORIGIN_ID, DEST_ID, ORIGIN, DEST, 4, 320,
    );

    expect(result.routeGeometry).toBeNull();
    expect(result.walkMinutes).toBe(4);
    expect(result.walkDistanceMeters).toBe(320);
    expect(stub.upsertSpy).not.toHaveBeenCalled();
  });

  it("malformed payload (missing geometry) → fallback values", async () => {
    const stub = buildSupabaseStub({ cacheRow: null });
    vi.mocked(getServiceSupabase).mockReturnValue(
      { from: stub.from } as never,
    );
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ routes: [{}] }), { status: 200 }),
    );

    const result = await fetchOrCacheWalkingRoute(
      ORIGIN_ID, DEST_ID, ORIGIN, DEST, 5, 400,
    );

    expect(result.routeGeometry).toBeNull();
    expect(result.walkMinutes).toBe(5);
    expect(stub.upsertSpy).not.toHaveBeenCalled();
  });

  it("no MAPBOX_SERVER_TOKEN → fallback values without fetching", async () => {
    delete process.env.MAPBOX_SERVER_TOKEN;
    const stub = buildSupabaseStub({ cacheRow: null });
    vi.mocked(getServiceSupabase).mockReturnValue(
      { from: stub.from } as never,
    );
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await fetchOrCacheWalkingRoute(
      ORIGIN_ID, DEST_ID, ORIGIN, DEST, 3, 240,
    );

    expect(result.routeGeometry).toBeNull();
    expect(result.walkMinutes).toBe(3);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("no cross-fallback: NEXT_PUBLIC_MAPBOX_TOKEN set but MAPBOX_SERVER_TOKEN unset → no fetch", async () => {
    // Regression guard. The public token is URL-allowlisted (browser
    // Referer header required) — using it for server-side Directions
    // silently 403s every call. The helper must NOT fall back to it
    // when the server-only token is missing; a loud miss + fallback
    // is the intended behavior.
    delete process.env.MAPBOX_SERVER_TOKEN;
    process.env.NEXT_PUBLIC_MAPBOX_TOKEN = "this-must-not-be-used";
    const stub = buildSupabaseStub({ cacheRow: null });
    vi.mocked(getServiceSupabase).mockReturnValue(
      { from: stub.from } as never,
    );
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await fetchOrCacheWalkingRoute(
      ORIGIN_ID, DEST_ID, ORIGIN, DEST, 4, 320,
    );

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.routeGeometry).toBeNull();
    expect(result.walkMinutes).toBe(4);
    expect(result.walkDistanceMeters).toBe(320);
    expect(stub.upsertSpy).not.toHaveBeenCalled();
  });
});

describe("fetchOrCacheWalkingRoute — DB failures don't block the route", () => {
  it("cache write failure still returns the live Mapbox result", async () => {
    const stub = buildSupabaseStub({
      cacheRow: null,
      upsertError: { message: "constraint violation" },
    });
    vi.mocked(getServiceSupabase).mockReturnValue(
      { from: stub.from } as never,
    );
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          routes: [
            { geometry: SAMPLE_GEOMETRY, duration: 432, distance: 540 },
          ],
        }),
        { status: 200 },
      ),
    );

    const result = await fetchOrCacheWalkingRoute(
      ORIGIN_ID, DEST_ID, ORIGIN, DEST, 99, 99000,
    );

    expect(result.routeGeometry).toEqual(SAMPLE_GEOMETRY);
    expect(result.walkMinutes).toBe(7);
  });
});

describe("encodeGeoJsonLineToPolyline", () => {
  // Reference vector from Google's documentation:
  //   (38.5, -120.2), (40.7, -120.95), (43.252, -126.453)
  //   → "_p~iF~ps|U_ulLnnqC_mqNvxq`@"
  // GeoJSON stores coords as [lng, lat], so we input the same points
  // with lng-first ordering.
  it("matches Google's documented reference encoding", () => {
    const line: LineString = {
      type: "LineString",
      coordinates: [
        [-120.2, 38.5],
        [-120.95, 40.7],
        [-126.453, 43.252],
      ],
    };
    expect(encodeGeoJsonLineToPolyline(line)).toBe(
      "_p~iF~ps|U_ulLnnqC_mqNvxq`@",
    );
  });

  it("single-point line → encodes one (lat, lng) delta from origin", () => {
    const line: LineString = {
      type: "LineString",
      coordinates: [[-120.2, 38.5]],
    };
    // Manually computed using the same algorithm — verifies the
    // encoder is symmetric with the reference path.
    const encoded = encodeGeoJsonLineToPolyline(line);
    expect(encoded).toBe("_p~iF~ps|U");
  });
});
