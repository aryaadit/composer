import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { getCountdownLabel } from "@/components/shared/SavedPlanRowExpanded";
import {
  todayLocalISO,
  tomorrowLocalISO,
} from "@/lib/dateUtils";
import { buildItineraryStaticMapUrl } from "@/lib/mapbox";

// ── getCountdownLabel ─────────────────────────────────────────
//
// Spec:
//   - day === today    → "TONIGHT AT 7 PM"  / urgency "today"
//   - day === tomorrow → "TOMORROW AT 7 PM" / urgency "tomorrow"
//   - else (or null)   → null

describe("getCountdownLabel", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 5, 9, 12, 0, 0)); // 2026-06-09 noon
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns TONIGHT for today's date with the formatted start time", () => {
    const result = getCountdownLabel("2026-06-09", "19:00");
    expect(result).toEqual({ text: "TONIGHT AT 7 PM", urgency: "today" });
  });

  it("returns TOMORROW for tomorrow's date with the formatted start time", () => {
    const result = getCountdownLabel("2026-06-10", "21:00");
    expect(result).toEqual({ text: "TOMORROW AT 9 PM", urgency: "tomorrow" });
  });

  it("returns null for beyond-tomorrow dates", () => {
    expect(getCountdownLabel("2026-06-11", "19:00")).toBeNull();
    expect(getCountdownLabel("2026-07-15", "19:00")).toBeNull();
    expect(getCountdownLabel("2027-01-01", "19:00")).toBeNull();
  });

  it("returns null for past dates (defensive — should never be on a hero card)", () => {
    expect(getCountdownLabel("2026-06-08", "19:00")).toBeNull();
    expect(getCountdownLabel("2025-12-25", "19:00")).toBeNull();
  });

  it("returns null for missing day", () => {
    expect(getCountdownLabel(null, "19:00")).toBeNull();
    expect(getCountdownLabel(undefined, "19:00")).toBeNull();
  });

  it("tonight and tomorrow have DIFFERENT urgency tokens (drives the dot color shift)", () => {
    const tonight = getCountdownLabel("2026-06-09", "19:00");
    const tomorrow = getCountdownLabel("2026-06-10", "19:00");
    expect(tonight?.urgency).toBe("today");
    expect(tomorrow?.urgency).toBe("tomorrow");
    expect(tonight?.urgency).not.toBe(tomorrow?.urgency);
  });

  it("accepts injected today/tomorrow for testability (no system clock dependency)", () => {
    // Bypass the default Date.now() pickup — useful for snapshot-style
    // tests that don't want to mess with system time.
    const result = getCountdownLabel(
      "2030-01-01",
      "17:00",
      "2030-01-01",
      "2030-01-02",
    );
    expect(result).toEqual({ text: "TONIGHT AT 5 PM", urgency: "today" });
  });

  it("formats every Phase 1 start time correctly in the TONIGHT line", () => {
    expect(getCountdownLabel("2026-06-09", "17:00")?.text).toBe("TONIGHT AT 5 PM");
    expect(getCountdownLabel("2026-06-09", "18:00")?.text).toBe("TONIGHT AT 6 PM");
    expect(getCountdownLabel("2026-06-09", "19:00")?.text).toBe("TONIGHT AT 7 PM");
    expect(getCountdownLabel("2026-06-09", "20:00")?.text).toBe("TONIGHT AT 8 PM");
    expect(getCountdownLabel("2026-06-09", "21:00")?.text).toBe("TONIGHT AT 9 PM");
  });
});

// ── tomorrowLocalISO + todayLocalISO ──────────────────────────

describe("tomorrowLocalISO", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns YYYY-MM-DD one day after today", () => {
    vi.setSystemTime(new Date(2026, 5, 9, 12, 0, 0)); // 2026-06-09
    expect(tomorrowLocalISO()).toBe("2026-06-10");
  });

  it("rolls over month boundary correctly", () => {
    vi.setSystemTime(new Date(2026, 5, 30, 12, 0, 0)); // 2026-06-30
    expect(tomorrowLocalISO()).toBe("2026-07-01");
  });

  it("rolls over year boundary correctly", () => {
    vi.setSystemTime(new Date(2026, 11, 31, 12, 0, 0)); // 2026-12-31
    expect(tomorrowLocalISO()).toBe("2027-01-01");
  });

  it("today === tomorrow - 1 across all the cases above (sanity)", () => {
    vi.setSystemTime(new Date(2026, 5, 9, 12, 0, 0));
    expect(todayLocalISO()).toBe("2026-06-09");
    expect(tomorrowLocalISO()).toBe("2026-06-10");
  });
});

// ── buildItineraryStaticMapUrl ───────────────────────────────

describe("buildItineraryStaticMapUrl", () => {
  beforeEach(() => {
    // The builder reads NEXT_PUBLIC_MAPBOX_TOKEN at call time, so
    // stubEnv is enough — no module-load timing concerns.
    vi.stubEnv("NEXT_PUBLIC_MAPBOX_TOKEN", "test.token.value");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns null for an empty stops array", () => {
    expect(buildItineraryStaticMapUrl([])).toBeNull();
  });

  it("returns null when all stops have NaN coordinates (defensive)", () => {
    const result = buildItineraryStaticMapUrl([
      { latitude: NaN, longitude: -74.0 },
      { latitude: 40.7, longitude: NaN },
    ]);
    expect(result).toBeNull();
  });

  it("returns null when the token env var is missing", () => {
    vi.stubEnv("NEXT_PUBLIC_MAPBOX_TOKEN", "");
    const result = buildItineraryStaticMapUrl([
      { latitude: 40.7336, longitude: -74.0027 },
    ]);
    expect(result).toBeNull();
  });

  it("includes a numbered pin for each stop with brand burgundy stroke", () => {
    const result = buildItineraryStaticMapUrl([
      { latitude: 40.7336, longitude: -74.0027 },
      { latitude: 40.7295, longitude: -73.9965 },
    ]);
    expect(result).not.toBeNull();
    expect(result).toContain("pin-s-1+6B1E2E(-74.0027,40.7336)");
    expect(result).toContain("pin-s-2+6B1E2E(-73.9965,40.7295)");
    expect(result).toContain("mapbox/light-v11");
    expect(result).toContain("/auto/");
  });

  it("filters out NaN coords while preserving valid pins (numbering re-bases)", () => {
    const result = buildItineraryStaticMapUrl([
      { latitude: 40.7336, longitude: -74.0027 },
      { latitude: NaN, longitude: NaN },
      { latitude: 40.7295, longitude: -73.9965 },
    ]);
    expect(result).not.toBeNull();
    // Pin labels come from the filtered list — the second valid stop
    // becomes "pin-s-2", not "pin-s-3".
    expect(result).toContain("pin-s-1+6B1E2E(-74.0027,40.7336)");
    expect(result).toContain("pin-s-2+6B1E2E(-73.9965,40.7295)");
    expect(result).not.toContain("NaN");
  });

  it("honors custom width/height/padding options", () => {
    const result = buildItineraryStaticMapUrl(
      [{ latitude: 40.7336, longitude: -74.0027 }],
      { width: 800, height: 200, padding: 50 },
    );
    expect(result).toContain("/800x200@2x");
    expect(result).toContain("padding=50");
  });

  it("defaults to 600x280@2x with padding=120 (Mapbox constraint: padding < min(w,h)/2)", () => {
    // Tuning history:
    //   640x160@30   (Phase 6 initial) — pins at cropping edge
    //   600x180@60   (Phase 9 step 1)  — still crowded
    //   600x180@120  (Phase 9 step 2)  — HTTP 422: padding > height/2
    //   600x280@120  (Phase 9 step 3)  — empirically verified HTTP 200
    //
    // Mapbox rejects padding >= min(width, height) / 2 with a 422
    // "padding cannot exceed height/width" error. For padding=120
    // (20% horizontal margin on a 600 wide image), height must be
    // > 240; we use 280 for a small safety buffer.
    const result = buildItineraryStaticMapUrl([
      { latitude: 40.7336, longitude: -74.0027 },
    ]);
    expect(result).toContain("/600x280@2x");
    expect(result).toContain("padding=120");
  });

  it("default padding satisfies Mapbox's padding < min(width, height) / 2 rule", () => {
    // Regression guard: any future tweak to width/height/padding
    // defaults must keep padding strictly less than half the smaller
    // dimension. Mapbox returns 422 otherwise.
    const result = buildItineraryStaticMapUrl([
      { latitude: 40.7336, longitude: -74.0027 },
    ]);
    expect(result).not.toBeNull();
    const sizeMatch = /\/(\d+)x(\d+)@2x/.exec(result!);
    const padMatch = /padding=(\d+)/.exec(result!);
    expect(sizeMatch).not.toBeNull();
    expect(padMatch).not.toBeNull();
    const width = parseInt(sizeMatch![1], 10);
    const height = parseInt(sizeMatch![2], 10);
    const padding = parseInt(padMatch![1], 10);
    expect(padding).toBeLessThan(Math.min(width, height) / 2);
  });

  it("uses '/auto/' bounds (Mapbox auto-fits all pins) — NOT lng,lat,zoom center", () => {
    const result = buildItineraryStaticMapUrl([
      { latitude: 40.7336, longitude: -74.0027 },
      { latitude: 40.7295, longitude: -73.9965 },
    ]);
    // Auto bounds path is /auto/ between the overlay segment and the
    // size. An explicit center+zoom would be /lng,lat,zoom/ instead.
    expect(result).toMatch(/\/auto\/\d+x\d+@2x/);
  });

  it("includes @2x retina suffix for sharp pin rendering", () => {
    const result = buildItineraryStaticMapUrl([
      { latitude: 40.7336, longitude: -74.0027 },
    ]);
    expect(result).toContain("@2x");
  });

  it("3-stop itinerary generates 3 numbered pins (1, 2, 3) in coordinate order", () => {
    const result = buildItineraryStaticMapUrl([
      { latitude: 40.7336, longitude: -74.0027 }, // stop 1
      { latitude: 40.7295, longitude: -73.9965 }, // stop 2
      { latitude: 40.7250, longitude: -73.9900 }, // stop 3
    ]);
    expect(result).toContain("pin-s-1+6B1E2E(-74.0027,40.7336)");
    expect(result).toContain("pin-s-2+6B1E2E(-73.9965,40.7295)");
    expect(result).toContain("pin-s-3+6B1E2E(-73.99,40.725)");
    // Pins are comma-separated and ordered by index.
    const pinIndex1 = result!.indexOf("pin-s-1");
    const pinIndex2 = result!.indexOf("pin-s-2");
    const pinIndex3 = result!.indexOf("pin-s-3");
    expect(pinIndex1).toBeLessThan(pinIndex2);
    expect(pinIndex2).toBeLessThan(pinIndex3);
  });

  it("uses brand burgundy hex (#6B1E2E) for pin color", () => {
    const result = buildItineraryStaticMapUrl([
      { latitude: 40.7336, longitude: -74.0027 },
    ]);
    // The hex is uppercase 6B1E2E (matches the inline ItineraryMap).
    expect(result).toContain("+6B1E2E(");
  });
});
