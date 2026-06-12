// ComposeFailure shape tests — the structured 422 body returned by
// the three generation endpoints when no honest 2-stop itinerary can
// be produced. The strict-filters change replaced 4 different
// bare-string error responses with this typed shape, so these tests
// guard the contract between the routes and the UI.

import { describe, it, expect } from "vitest";
import {
  composeFailure,
  isComposeFailure,
} from "@/lib/itinerary/compose-failure";
import type { ZeroingStage } from "@/lib/itinerary/pre-filter";

const STAGES: ZeroingStage[] = [
  "exclusions",
  "hours",
  "neighborhood",
  "budget",
  "proximity",
  "drinks",
  "fit",
  // Client-synthesized stage for catch paths (network drop, 500, etc.)
  // — the server never returns it via pre-filter, but the registry
  // lookup MUST work because useSwapStop and handleAddStop call
  // composeFailure("system") on their catch branches.
  "system",
];

describe("composeFailure — typed shape per ZeroingStage", () => {
  for (const stage of STAGES) {
    it(`stage="${stage}" returns failed=true + title + suggestion`, () => {
      const f = composeFailure(stage);
      expect(f.failed).toBe(true);
      expect(f.zeroingStage).toBe(stage);
      expect(typeof f.title).toBe("string");
      expect(f.title.length).toBeGreaterThan(0);
      expect(typeof f.suggestion).toBe("string");
      expect(f.suggestion.length).toBeGreaterThan(0);
    });

    it(`stage="${stage}" copy contains no numbers (brand-voice rule)`, () => {
      const f = composeFailure(stage);
      expect(/\d/.test(f.title)).toBe(false);
      expect(/\d/.test(f.suggestion)).toBe(false);
    });
  }
});

describe("isComposeFailure — client-side narrowing", () => {
  it("accepts a well-formed failure body", () => {
    expect(isComposeFailure(composeFailure("budget"))).toBe(true);
  });

  it("rejects a generic error shape", () => {
    expect(isComposeFailure({ error: "Something went wrong" })).toBe(false);
  });

  it("rejects nullish and primitives", () => {
    expect(isComposeFailure(null)).toBe(false);
    expect(isComposeFailure(undefined)).toBe(false);
    expect(isComposeFailure("budget")).toBe(false);
    expect(isComposeFailure(42)).toBe(false);
  });

  it("rejects a partial object missing zeroingStage", () => {
    expect(isComposeFailure({ failed: true, title: "x", suggestion: "y" })).toBe(false);
  });

  it("requires failed=true (not truthy — the exact discriminator)", () => {
    expect(
      isComposeFailure({
        failed: 1, // truthy but not === true
        zeroingStage: "budget",
        title: "x",
        suggestion: "y",
      }),
    ).toBe(false);
  });
});

describe("every ZeroingStage value has copy entries", () => {
  it("every stage produces a non-empty title (no fallthrough to undefined)", () => {
    for (const stage of STAGES) {
      const f = composeFailure(stage);
      expect(f.title.trim()).not.toBe("");
    }
  });
});
