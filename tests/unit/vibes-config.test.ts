import { describe, it, expect } from "vitest";
import { VIBES, VIBE_LABELS, VIBE_VENUE_TAGS, vibeLabel } from "@/config/vibes";
import { getStop1Hint } from "@/config/templates";

// Phase 7: mix_it_up dropped from the questionnaire.
// 2026-06-13: activity_food (Activity) also dropped with the focus
// collapse to Meal + Drinks. These tests guard against regressions
// where either generated-source entry leaks back into the user-
// facing surfaces.

describe("VIBES — questionnaire taxonomy (no Variety, no Activity)", () => {
  it("contains exactly the two concrete vibes (Meal + Drinks)", () => {
    const slugs = VIBES.map((v) => v.slug).sort();
    expect(slugs).toEqual(["drinks_led", "food_forward"]);
  });

  it("does not contain mix_it_up or activity_food", () => {
    const slugs = VIBES.map((v) => v.slug);
    expect(slugs).not.toContain("mix_it_up");
    expect(slugs).not.toContain("activity_food");
  });

  it("each vibe carries a non-empty UI label", () => {
    for (const vibe of VIBES) {
      expect(vibe.label.length).toBeGreaterThan(0);
    }
  });

  it("VIBE_LABELS has no Variety or Activity entry", () => {
    expect(VIBE_LABELS.mix_it_up).toBeUndefined();
    expect(VIBE_LABELS.activity_food).toBeUndefined();
    expect(Object.values(VIBE_LABELS)).not.toContain("Variety");
    expect(Object.values(VIBE_LABELS)).not.toContain("Activity");
  });
});

describe("VIBE_VENUE_TAGS — dropped vibes filtered at consumer layer", () => {
  it("does not include mix_it_up or activity_food at the consumer layer", () => {
    expect(VIBE_VENUE_TAGS.mix_it_up).toBeUndefined();
    expect(VIBE_VENUE_TAGS.activity_food).toBeUndefined();
  });

  it("each concrete vibe has at least one canonical tag", () => {
    expect(VIBE_VENUE_TAGS.food_forward?.length ?? 0).toBeGreaterThan(0);
    expect(VIBE_VENUE_TAGS.drinks_led?.length ?? 0).toBeGreaterThan(0);
  });
});

describe("getStop1Hint — unknown-vibe graceful degradation", () => {
  it("returns null for food_forward (no role bias)", () => {
    expect(getStop1Hint("food_forward", () => 0.5)).toBeNull();
  });

  it("returns 'drinks' for drinks_led", () => {
    expect(getStop1Hint("drinks_led", () => 0.5)).toBe("drinks");
  });

  it("legacy mix_it_up falls through to a concrete vibe's hint", () => {
    // The PRNG is seeded — picking 0.0 selects the first concrete
    // (food_forward → null), 0.99 picks the last concrete (drinks_led
    // → "drinks"). With the focus collapse to 2 vibes, the random
    // index space is {0, 1} so anything in [0.5, 1) lands on
    // drinks_led.
    expect(getStop1Hint("mix_it_up", () => 0.0)).toBeNull();
    expect(getStop1Hint("mix_it_up", () => 0.99)).toBe("drinks");
  });

  it("legacy activity_food (now retired) falls through gracefully", () => {
    // Old saved itineraries / share links with activity_food no
    // longer get an "activity" hint; they land on the same fallback
    // as any unknown vibe.
    expect(getStop1Hint("activity_food", () => 0.0)).toBeNull();
    expect(getStop1Hint("activity_food", () => 0.99)).toBe("drinks");
  });

  it("unknown vibes (legacy walk_explore, garbage) also fall through gracefully", () => {
    expect(getStop1Hint("walk_explore", () => 0.0)).toBeNull();
    expect(getStop1Hint("walk_explore", () => 0.99)).toBe("drinks");
    expect(getStop1Hint("garbage_value", () => 0.99)).toBe("drinks");
  });
});

describe("vibeLabel — unknown-slug fallback", () => {
  it("returns the UI label for known vibes", () => {
    expect(vibeLabel("food_forward")).toBe("Meal");
    expect(vibeLabel("drinks_led")).toBe("Drinks");
  });

  it("returns empty string for retired activity_food (focus collapse)", () => {
    expect(vibeLabel("activity_food")).toBe("");
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
      vibeLabel("activity_food"),
      "$$",
    ].filter(Boolean);
    // Both empty-string vibe labels drop out of the chip line.
    expect(parts).toEqual(["Date Night", "$$"]);
  });
});
