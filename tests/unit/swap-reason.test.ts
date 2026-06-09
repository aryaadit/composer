import { describe, it, expect, vi } from "vitest";
import {
  buildShownProps,
  buildSkippedProps,
  buildSubmittedProps,
  buildSwapReasonEventProps,
  handleNextSwapContext,
  type SwapReasonContext,
} from "@/lib/itinerary/swap-reason";
import {
  SWAP_REASON_OPTIONS,
  normalizeOtherText,
} from "@/components/itinerary/SwapReasonModal";
import type { SwapContext } from "@/hooks/useSwapStop";
import type { Venue } from "@/types";

function v(id: string, name: string): Venue {
  return { id, name } as unknown as Venue;
}

function ctx(overrides: Partial<SwapContext> = {}): SwapContext {
  return {
    stopIndex: 0,
    stopRole: "opener",
    originalVenue: v("orig-id", "Original Place"),
    newVenue: v("new-id", "New Place"),
    vibe: "food_forward",
    surface: "fresh_itinerary",
    ...overrides,
  };
}

describe("SWAP_REASON_OPTIONS", () => {
  it("has exactly 6 entries", () => {
    expect(SWAP_REASON_OPTIONS).toHaveLength(6);
  });

  it("includes every spec-mandated key in display order", () => {
    expect(SWAP_REASON_OPTIONS.map((o) => o.key)).toEqual([
      "not_interested",
      "looking_for_different",
      "wrong_vibe",
      "out_of_budget",
      "already_been",
      "other",
    ]);
  });

  it("'other' is last (its position controls the text-input reveal)", () => {
    expect(SWAP_REASON_OPTIONS[SWAP_REASON_OPTIONS.length - 1].key).toBe("other");
  });

  it("every option has a non-empty label", () => {
    for (const option of SWAP_REASON_OPTIONS) {
      expect(option.label.length).toBeGreaterThan(0);
    }
  });
});

describe("normalizeOtherText", () => {
  it("returns null for non-other reasons regardless of text", () => {
    expect(normalizeOtherText("wrong_vibe", "ignore this")).toBeNull();
    expect(normalizeOtherText("not_interested", "")).toBeNull();
  });

  it("returns null for other when text is empty or whitespace", () => {
    expect(normalizeOtherText("other", "")).toBeNull();
    expect(normalizeOtherText("other", "   ")).toBeNull();
    expect(normalizeOtherText("other", "\t \n")).toBeNull();
  });

  it("returns trimmed text for other when non-empty", () => {
    expect(normalizeOtherText("other", "the photos look weird")).toBe(
      "the photos look weird",
    );
    expect(normalizeOtherText("other", "  trim me  ")).toBe("trim me");
  });
});

describe("buildSwapReasonEventProps", () => {
  it("maps every SwapContext field to its snake_case event property", () => {
    const props = buildSwapReasonEventProps(
      ctx({
        stopIndex: 1,
        stopRole: "main",
        originalVenue: v("o1", "Orig"),
        newVenue: v("n1", "Newer"),
        vibe: "drinks_led",
        surface: "fresh_itinerary",
      }),
    );
    expect(props).toEqual({
      stop_index: 1,
      stop_role: "main",
      original_venue_id: "o1",
      original_venue_name: "Orig",
      new_venue_id: "n1",
      new_venue_name: "Newer",
      surface: "fresh_itinerary",
      vibe: "drinks_led",
    });
  });
});

describe("buildShownProps / buildSkippedProps", () => {
  it("attach reason: null and reason_text: null for schema uniformity", () => {
    const c = ctx();
    const shown = buildShownProps(c);
    const skipped = buildSkippedProps(c);
    expect(shown.reason).toBeNull();
    expect(shown.reason_text).toBeNull();
    expect(skipped.reason).toBeNull();
    expect(skipped.reason_text).toBeNull();
  });

  it("shown and skipped carry the same base props (reason taxonomy is uniform)", () => {
    const c = ctx();
    expect(buildShownProps(c)).toEqual(buildSkippedProps(c));
  });
});

describe("buildSubmittedProps", () => {
  it("attaches reason, reason_text, and time_to_decision_ms", () => {
    const props = buildSubmittedProps(ctx(), "wrong_vibe", null, 4321);
    expect(props.reason).toBe("wrong_vibe");
    expect(props.reason_text).toBeNull();
    expect(props.time_to_decision_ms).toBe(4321);
  });

  it("preserves reason_text when free-text was provided", () => {
    const props = buildSubmittedProps(
      ctx(),
      "other",
      "the photos look weird",
      2200,
    );
    expect(props.reason).toBe("other");
    expect(props.reason_text).toBe("the photos look weird");
  });

  it("carries the same base properties as shown/skipped", () => {
    const c = ctx();
    const submitted = buildSubmittedProps(c, "wrong_vibe", null, 1000);
    const shown = buildShownProps(c);
    expect(submitted.stop_index).toBe(shown.stop_index);
    expect(submitted.original_venue_id).toBe(shown.original_venue_id);
    expect(submitted.surface).toBe(shown.surface);
  });
});

describe("handleNextSwapContext", () => {
  it("fires only shown when no previous context exists (fresh first swap)", () => {
    const emit = vi.fn();
    const c = ctx();
    const result = handleNextSwapContext(null, c, 1_000, emit);

    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(
      "stop_swap_reason_shown",
      expect.objectContaining({
        stop_index: c.stopIndex,
        original_venue_id: c.originalVenue.id,
        reason: null,
        reason_text: null,
      }),
    );
    expect(result.swapContext).toBe(c);
    expect(result.shownAt).toBe(1_000);
  });

  it("rapid sequential swap: fires implicit skipped for prev THEN shown for next", () => {
    const emit = vi.fn();
    const first = ctx({ stopIndex: 0, originalVenue: v("o1", "First") });
    const second = ctx({ stopIndex: 1, originalVenue: v("o2", "Second") });
    const prev: SwapReasonContext = { swapContext: first, shownAt: 1_000 };

    const result = handleNextSwapContext(prev, second, 5_000, emit);

    expect(emit).toHaveBeenCalledTimes(2);
    // Skip first — fires BEFORE shown for the second, in that order.
    expect(emit).toHaveBeenNthCalledWith(
      1,
      "stop_swap_reason_skipped",
      expect.objectContaining({ original_venue_id: "o1" }),
    );
    expect(emit).toHaveBeenNthCalledWith(
      2,
      "stop_swap_reason_shown",
      expect.objectContaining({ original_venue_id: "o2" }),
    );
    // New context replaces the old one.
    expect(result.swapContext).toBe(second);
    expect(result.shownAt).toBe(5_000);
  });

  it("implicit skipped carries the prev context's properties, not the next's", () => {
    const emit = vi.fn();
    const first = ctx({
      stopIndex: 0,
      stopRole: "opener",
      originalVenue: v("orig-prev", "Prev"),
      newVenue: v("new-prev", "PrevNew"),
    });
    const second = ctx({
      stopIndex: 1,
      stopRole: "main",
      originalVenue: v("orig-curr", "Curr"),
      newVenue: v("new-curr", "CurrNew"),
    });
    const prev: SwapReasonContext = { swapContext: first, shownAt: 1_000 };

    handleNextSwapContext(prev, second, 5_000, emit);

    const skippedCall = emit.mock.calls.find(
      ([name]) => name === "stop_swap_reason_skipped",
    );
    expect(skippedCall![1]).toMatchObject({
      stop_index: 0,
      stop_role: "opener",
      original_venue_id: "orig-prev",
      new_venue_id: "new-prev",
    });
  });

  it("three rapid swaps: each new arrival fires implicit skip for the one before", () => {
    const emit = vi.fn();
    const a = ctx({ stopIndex: 0, originalVenue: v("a-orig", "A") });
    const b = ctx({ stopIndex: 1, originalVenue: v("b-orig", "B") });
    const c = ctx({ stopIndex: 0, originalVenue: v("c-orig", "C") });

    const r1 = handleNextSwapContext(null, a, 1_000, emit);
    const r2 = handleNextSwapContext(r1, b, 2_000, emit);
    const r3 = handleNextSwapContext(r2, c, 3_000, emit);

    // Expected event sequence:
    //   shown(a), skipped(a), shown(b), skipped(b), shown(c)
    expect(emit).toHaveBeenCalledTimes(5);
    expect(emit.mock.calls[0][0]).toBe("stop_swap_reason_shown");
    expect(emit.mock.calls[0][1]).toMatchObject({ original_venue_id: "a-orig" });
    expect(emit.mock.calls[1][0]).toBe("stop_swap_reason_skipped");
    expect(emit.mock.calls[1][1]).toMatchObject({ original_venue_id: "a-orig" });
    expect(emit.mock.calls[2][0]).toBe("stop_swap_reason_shown");
    expect(emit.mock.calls[2][1]).toMatchObject({ original_venue_id: "b-orig" });
    expect(emit.mock.calls[3][0]).toBe("stop_swap_reason_skipped");
    expect(emit.mock.calls[3][1]).toMatchObject({ original_venue_id: "b-orig" });
    expect(emit.mock.calls[4][0]).toBe("stop_swap_reason_shown");
    expect(emit.mock.calls[4][1]).toMatchObject({ original_venue_id: "c-orig" });

    expect(r3.swapContext).toBe(c);
    expect(r3.shownAt).toBe(3_000);
  });

  it("computed time_to_decision_ms (submitted) is positive given monotonic now", () => {
    // Simulate the parent-side computation: shownAt captured at modal
    // open, "now" captured at submit. Difference is what the submitted
    // event carries.
    const shownAt = 1_000;
    const submitAt = 1_750;
    const timeToDecision = submitAt - shownAt;
    const props = buildSubmittedProps(ctx(), "wrong_vibe", null, timeToDecision);
    expect(props.time_to_decision_ms).toBe(750);
    expect(props.time_to_decision_ms).toBeGreaterThan(0);
  });
});
