import { describe, it, expect } from "vitest";
import { occasionLabel } from "@/config/occasions";
import { decodeParamsToInputs } from "@/lib/sharing";

// ── occasionLabel ─────────────────────────────────────────────
//
// Renders both the current UI bucket slugs (date / friends / solo) and
// deprecated sheet slugs that may still appear in saved itineraries
// written before the 2026-05-21 taxonomy collapse.

describe("occasionLabel — bucket slugs", () => {
  it("date → Date Night", () => {
    expect(occasionLabel("date")).toBe("Date Night");
  });

  it("friends → Friends Night Out", () => {
    expect(occasionLabel("friends")).toBe("Friends Night Out");
  });

  it("solo → Solo", () => {
    expect(occasionLabel("solo")).toBe("Solo");
  });
});

describe("occasionLabel — deprecated sheet slugs in saved itineraries", () => {
  it("relationship → Date Night (the 5 stored prod rows render correctly)", () => {
    expect(occasionLabel("relationship")).toBe("Date Night");
  });

  it("family → Friends Night Out", () => {
    expect(occasionLabel("family")).toBe("Friends Night Out");
  });

  it("dating → Date Night", () => {
    expect(occasionLabel("dating")).toBe("Date Night");
  });

  it("first_date → Date Night", () => {
    expect(occasionLabel("first_date")).toBe("Date Night");
  });

  it("couple → Date Night", () => {
    expect(occasionLabel("couple")).toBe("Date Night");
  });
});

describe("occasionLabel — fallback to raw slug for unknown values", () => {
  it("unknown slug falls through to the literal", () => {
    expect(occasionLabel("absolutely-not-a-slug")).toBe("absolutely-not-a-slug");
  });

  it("empty string returns empty string", () => {
    expect(occasionLabel("")).toBe("");
  });
});

// ── decodeParamsToInputs — legacy share-link occasion translation ─
//
// Share URLs written before the 2026-05-21 taxonomy collapse carry
// sheet-side slugs (dating, relationship, family, first_date, couple).
// The decoder translates them to the current bucket shape so the
// scoring pipeline only sees bucket values.

function makeParams(occasion: string): URLSearchParams {
  return new URLSearchParams({
    occasion,
    neighborhoods: "west_village",
    budget: "nice_out",
    vibe: "food_forward",
    day: "2026-05-21",
    timeBlock: "evening",
  });
}

describe("decodeParamsToInputs — legacy occasion translation", () => {
  it("legacy ?occasion=dating decodes to bucket 'date'", () => {
    const result = decodeParamsToInputs(makeParams("dating"));
    expect(result).not.toBeNull();
    expect(result?.occasion).toBe("date");
  });

  it("legacy ?occasion=relationship decodes to bucket 'date'", () => {
    const result = decodeParamsToInputs(makeParams("relationship"));
    expect(result?.occasion).toBe("date");
  });

  it("legacy ?occasion=family decodes to bucket 'friends'", () => {
    const result = decodeParamsToInputs(makeParams("family"));
    expect(result?.occasion).toBe("friends");
  });

  it("current ?occasion=date passes through unchanged", () => {
    const result = decodeParamsToInputs(makeParams("date"));
    expect(result?.occasion).toBe("date");
  });

  it("current ?occasion=solo passes through unchanged", () => {
    const result = decodeParamsToInputs(makeParams("solo"));
    expect(result?.occasion).toBe("solo");
  });
});
