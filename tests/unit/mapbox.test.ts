// buildWalkSegmentStaticMapUrl URL-length guard. Mapbox Static Images
// GET URLs cap at 8 KB; long pedestrian routes (e.g. through the
// High Line at full overview detail) generate enough polyline points
// to push the URL past 10 KB. When the path-overlay variant exceeds
// the cap, the helper falls back to a pins-only URL (identical to
// the null-geometry output) so the image still loads.

import { describe, it, expect, beforeEach } from "vitest";
import type { LineString } from "geojson";
import { buildWalkSegmentStaticMapUrl } from "@/lib/mapbox";

beforeEach(() => {
  process.env.NEXT_PUBLIC_MAPBOX_TOKEN = "test-token";
});

describe("buildWalkSegmentStaticMapUrl — URL length guard", () => {
  it("normal-sized geometry keeps the path overlay", () => {
    const line: LineString = {
      type: "LineString",
      coordinates: [
        [-74.003, 40.733],
        [-74.001, 40.732],
        [-73.999, 40.730],
      ],
    };
    const url = buildWalkSegmentStaticMapUrl(line);
    expect(url).not.toBeNull();
    expect(url).toContain("path-");
    expect(url!.length).toBeLessThan(8000);
  });

  it("oversized geometry → drops path overlay, keeps pins, stays under cap", () => {
    // Generate ~5000 points along a synthetic walking corridor. Each
    // polyline point encodes to roughly 6–10 chars (after percent-
    // encoding for the URL path component), so 5000 points reliably
    // pushes the URL past 30 KB before the guard trims it back.
    const coords: [number, number][] = [];
    for (let i = 0; i < 5000; i++) {
      // Tiny per-step deltas + small added jitter to defeat any
      // run-length / delta-compression shortcuts in the polyline
      // encoder (the algorithm is varint, so each delta still costs
      // at least 1 byte regardless).
      coords.push([
        -74.003 + i * 0.0001 + ((i * 7) % 11) * 0.00001,
        40.733 + i * 0.00005 + ((i * 13) % 17) * 0.00001,
      ]);
    }
    const oversized: LineString = { type: "LineString", coordinates: coords };

    const url = buildWalkSegmentStaticMapUrl(oversized);
    expect(url).not.toBeNull();

    // Falls back to pins-only — no path- segment in the URL.
    expect(url).not.toContain("path-");
    // Pins for the endpoints are still present.
    expect(url).toMatch(/pin-s\+/);
    // Comfortably under Mapbox's 8 KB cap.
    expect(url!.length).toBeLessThan(8000);
  });

  it("no geometry → returns null (unchanged behavior)", () => {
    expect(buildWalkSegmentStaticMapUrl(null)).toBeNull();
    expect(buildWalkSegmentStaticMapUrl(undefined)).toBeNull();
  });
});
