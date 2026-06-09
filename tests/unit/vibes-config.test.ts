import { describe, it, expect } from "vitest";
import { VIBES, VIBE_LABELS, VIBE_VENUE_TAGS, vibeLabel } from "@/config/vibes";
import { getStop1Hint } from "@/config/templates";

// Phase 7: mix_it_up dropped from the questionnaire. These tests guard
// against regressions where the generated source's mix_it_up entry
// leaks back into the user-facing surfaces.

describe("VIBES — Phase 7 (no Variety/mix_it_up)", () => {
  it("contains exactly the three concrete vibes", () => {
    const slugs = VIBES.map((v) => v.slug).sort();
    expect(slugs).toEqual(["activity_food", "drinks_led", "food_forward"]);
  });

  it("does not contain mix_it_up", () => {
    expect(VIBES.map((v) => v.slug)).not.toContain("mix_it_up");
  });

  it("each vibe carries a non-empty UI label", () => {
    for (const vibe of VIBES) {
      expect(vibe.label.length).toBeGreaterThan(0);
    }
  });

  it("VIBE_LABELS has no Variety entry", () => {
    expect(VIBE_LABELS.mix_it_up).toBeUndefined();
    expect(Object.values(VIBE_LABELS)).not.toContain("Variety");
  });
});

describe("VIBE_VENUE_TAGS — Phase 7", () => {
  it("does not include mix_it_up at the consumer layer", () => {
    expect(VIBE_VENUE_TAGS.mix_it_up).toBeUndefined();
  });

  it("each concrete vibe has at least one canonical tag", () => {
    expect(VIBE_VENUE_TAGS.food_forward?.length ?? 0).toBeGreaterThan(0);
    expect(VIBE_VENUE_TAGS.drinks_led?.length ?? 0).toBeGreaterThan(0);
    expect(VIBE_VENUE_TAGS.activity_food?.length ?? 0).toBeGreaterThan(0);
  });
});

describe("getStop1Hint — Phase 7 unknown-vibe graceful degradation", () => {
  it("returns null for food_forward (no role bias)", () => {
    expect(getStop1Hint("food_forward", () => 0.5)).toBeNull();
  });

  it("returns 'drinks' for drinks_led", () => {
    expect(getStop1Hint("drinks_led", () => 0.5)).toBe("drinks");
  });

  it("returns 'activity' for activity_food", () => {
    expect(getStop1Hint("activity_food", () => 0.5)).toBe("activity");
  });

  it("legacy mix_it_up falls through to a concrete vibe's hint", () => {
    // The PRNG is seeded — picking 0.0 selects the first concrete
    // (food_forward → null), 0.5 picks the middle (drinks_led →
    // "drinks"), 0.99 picks the last (activity_food → "activity").
    // Either way, the function returns a valid concrete-vibe hint.
    expect(getStop1Hint("mix_it_up", () => 0.0)).toBeNull(); // food_forward
    expect(getStop1Hint("mix_it_up", () => 0.5)).toBe("drinks");
    expect(getStop1Hint("mix_it_up", () => 0.99)).toBe("activity");
  });

  it("unknown vibes (legacy walk_explore, garbage) also fall through gracefully", () => {
    // Same degradation path as mix_it_up — concrete vibe selection.
    expect(getStop1Hint("walk_explore", () => 0.5)).toBe("drinks");
    expect(getStop1Hint("garbage_value", () => 0.5)).toBe("drinks");
  });
});

describe("vibeLabel — unknown-slug fallback (Phase 7)", () => {
  it("returns the UI label for known vibes", () => {
    expect(vibeLabel("food_forward")).toBe("Meal");
    expect(vibeLabel("drinks_led")).toBe("Drinks");
    expect(vibeLabel("activity_food")).toBe("Activity");
  });

  it("returns empty string for legacy mix_it_up so callers omit the chip", () => {
    expect(vibeLabel("mix_it_up")).toBe("");
  });

  it("returns empty string for any unknown slug (does NOT render raw slug)", () => {
    expect(vibeLabel("walk_explore")).toBe("");
    expect(vibeLabel("garbage_value")).toBe("");
    expect(vibeLabel("")).toBe("");
  });

  it("integrates with filter(Boolean) — atmosphere row would omit unknown vibes", () => {
    // Mirrors CompositionHeader's atmosphere assembly pattern.
    const parts = [
      "Date Night",
      vibeLabel("mix_it_up"),
      "$$",
    ].filter(Boolean);
    // The empty-string vibe label drops out of the chip line.
    expect(parts).toEqual(["Date Night", "$$"]);
  });
});
