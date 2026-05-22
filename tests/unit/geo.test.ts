import { describe, it, expect } from "vitest";
import { buildGoogleMapsUrl } from "@/lib/geo";

// ── buildGoogleMapsUrl ──────────────────────────────────────────
//
// Coords are always emitted (source-of-truth fallback). place_id
// params are emitted ONLY when EVERY stop has a non-empty place_id —
// partial coverage is invalid per Google's Directions API spec and
// would get the whole batch ignored.

const A = { latitude: 40.733, longitude: -74.003, google_place_id: "ChIJ_A" };
const B = { latitude: 40.730, longitude: -73.999, google_place_id: "ChIJ_B" };
const C = { latitude: 40.728, longitude: -73.995, google_place_id: "ChIJ_C" };

describe("buildGoogleMapsUrl — empty + degenerate", () => {
  it("empty stops → static maps.google.com", () => {
    expect(buildGoogleMapsUrl([])).toBe("https://maps.google.com");
  });

  it("single stop → origin === destination, no waypoints", () => {
    const url = buildGoogleMapsUrl([A]);
    expect(url).toContain("origin=40.733,-74.003");
    expect(url).toContain("destination=40.733,-74.003");
    expect(url).not.toContain("waypoints=");
    expect(url).toContain("travelmode=walking");
  });
});

describe("buildGoogleMapsUrl — coord params (always present)", () => {
  it("multi-stop coord params", () => {
    const url = buildGoogleMapsUrl([A, B, C]);
    expect(url).toContain("origin=40.733,-74.003");
    expect(url).toContain("destination=40.728,-73.995");
    expect(url).toContain("waypoints=");
    expect(url).toContain(encodeURIComponent("40.73,-73.999"));
  });
});

describe("buildGoogleMapsUrl — place_id params (all-or-nothing)", () => {
  it("adds origin_place_id + destination_place_id when both ends have place_id (2-stop)", () => {
    const url = buildGoogleMapsUrl([A, B]);
    expect(url).toContain("origin_place_id=ChIJ_A");
    expect(url).toContain("destination_place_id=ChIJ_B");
    expect(url).not.toContain("waypoint_place_ids=");
  });

  it("adds waypoint_place_ids for intermediate stops (3-stop)", () => {
    const url = buildGoogleMapsUrl([A, B, C]);
    expect(url).toContain("origin_place_id=ChIJ_A");
    expect(url).toContain("destination_place_id=ChIJ_C");
    expect(url).toContain(`waypoint_place_ids=${encodeURIComponent("ChIJ_B")}`);
  });

  it("OMITS all place_id params when ANY stop is missing one (partial = invalid)", () => {
    const missingMiddle = [A, { ...B, google_place_id: null }, C];
    const url = buildGoogleMapsUrl(missingMiddle);
    expect(url).toContain("origin=");
    expect(url).toContain("destination=");
    expect(url).toContain("waypoints=");
    expect(url).not.toContain("origin_place_id");
    expect(url).not.toContain("destination_place_id");
    expect(url).not.toContain("waypoint_place_ids");
  });

  it("OMITS all place_id params when stops have no google_place_id at all (legacy callers)", () => {
    const noIds = [
      { latitude: A.latitude, longitude: A.longitude },
      { latitude: B.latitude, longitude: B.longitude },
    ];
    const url = buildGoogleMapsUrl(noIds);
    expect(url).toContain("origin=");
    expect(url).toContain("destination=");
    expect(url).not.toContain("place_id");
  });

  it("treats empty-string place_id as missing", () => {
    const url = buildGoogleMapsUrl([A, { ...B, google_place_id: "" }]);
    expect(url).not.toContain("origin_place_id");
    expect(url).not.toContain("destination_place_id");
  });
});
