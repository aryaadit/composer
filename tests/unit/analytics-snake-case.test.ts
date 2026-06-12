import { describe, expect, it } from "vitest";
import { EVENTS } from "@/lib/analytics/events";

// Every EVENTS value goes to PostHog and to composer_analytics_events
// where consumers run downstream queries against the literal string.
// Drift here (camelCase, dashes, "ITEM_X" leftovers) silently splits
// funnels — the audit's "47 free-floating literals" tally was largely
// because we'd never asserted this shape.
const SNAKE_CASE = /^[a-z][a-z0-9_]*$/;

describe("EVENTS registry shape", () => {
  it("every event name is snake_case object_action", () => {
    for (const [key, value] of Object.entries(EVENTS)) {
      expect(
        SNAKE_CASE.test(value),
        `EVENTS.${key} = "${value}" does not match snake_case`,
      ).toBe(true);
    }
  });

  it("no event name contains uppercase letters or dashes", () => {
    for (const [key, value] of Object.entries(EVENTS)) {
      expect(
        value === value.toLowerCase(),
        `EVENTS.${key} = "${value}" contains uppercase`,
      ).toBe(true);
      expect(
        value.includes("-"),
        `EVENTS.${key} = "${value}" contains a dash`,
      ).toBe(false);
    }
  });

  it("no duplicate event names across the registry", () => {
    const values = Object.values(EVENTS);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });

  it("every event name contains at least one underscore (object_action shape)", () => {
    // The spec says "snake_case object_action" — i.e. a noun + verb
    // separated by `_`. The bare-snake-case regex above admits a
    // single-word value like `foo` which today no event uses, but a
    // future drift would slip through without this guard.
    for (const [key, value] of Object.entries(EVENTS)) {
      expect(
        value.includes("_"),
        `EVENTS.${key} = "${value}" is single-word — events must be object_action (noun + verb)`,
      ).toBe(true);
    }
  });

  it("registry keys mirror their values (TYPE_NAME → \"type_name\")", () => {
    // Keeps EVENTS.X → "x" alignment so a future find/replace on the
    // literal value translates 1:1 to the constant key.
    for (const [key, value] of Object.entries(EVENTS)) {
      expect(value).toBe(key.toLowerCase());
    }
  });
});
