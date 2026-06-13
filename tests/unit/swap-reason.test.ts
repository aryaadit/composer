import { describe, it, expect } from "vitest";
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
  it("has exactly 4 entries", () => {
    expect(SWAP_REASON_OPTIONS).toHaveLength(4);
  });

  it("includes every spec-mandated key in display order", () => {
    expect(SWAP_REASON_OPTIONS.map((o) => o.key)).toEqual([
      "not_interested",
      "looking_for_different",
      "wrong_vibe",
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
    // Vibe no longer travels here — it's injected by the EngagementProvider
    // as part of ComposeContext at the trackEngagement passthrough point.
    expect(props).toEqual({
      stop_index: 1,
      stop_role: "main",
      original_venue_id: "o1",
      original_venue_name: "Orig",
      new_venue_id: "n1",
      new_venue_name: "Newer",
      surface: "fresh_itinerary",
    });
  });
});

describe("buildShownProps / buildSkippedProps", () => {
  it("returns the base swap-reason event props (no reason / reason_text)", () => {
    // Renamed 2026-06-11: legacy shape carried reason: null + reason_text:
    // null on shown/skipped for "schema uniformity"; the new schema drops
    // those fields from non-submitted events because they're meaningless
    // there. Asserting their ABSENCE keeps the payload tight.
    const c = ctx();
    const shown = buildShownProps(c);
    const skipped = buildSkippedProps(c);
    expect(shown).not.toHaveProperty("reason");
    expect(shown).not.toHaveProperty("reason_text");
    expect(skipped).not.toHaveProperty("reason");
    expect(skipped).not.toHaveProperty("reason_text");
  });

  it("shown and skipped carry the same base props", () => {
    const c = ctx();
    expect(buildShownProps(c)).toEqual(buildSkippedProps(c));
  });
});

describe("buildSubmittedProps", () => {
  it("splits payload into PostHog props and Supabase-mirror-only reason_text", () => {
    const result = buildSubmittedProps(ctx(), "wrong_vibe", null, 4321);
    expect(result.props.reason).toBe("wrong_vibe");
    expect(result.props.time_to_decision_ms).toBe(4321);
    // PII split: reason_text lives ONLY on mirrorOnlyProps — PostHog never
    // sees free-text. See EngagementProvider.tsx + analytics.ts mirror
    // contract.
    expect(result.props).not.toHaveProperty("reason_text");
    expect(result.mirrorOnlyProps.reason_text).toBeNull();
  });

  it("preserves reason_text on mirrorOnlyProps when free-text was provided", () => {
    const result = buildSubmittedProps(
      ctx(),
      "other",
      "the photos look weird",
      2200,
    );
    expect(result.props.reason).toBe("other");
    expect(result.mirrorOnlyProps.reason_text).toBe("the photos look weird");
  });

  it("carries the same base properties as shown/skipped", () => {
    const c = ctx();
    const submitted = buildSubmittedProps(c, "wrong_vibe", null, 1000);
    const shown = buildShownProps(c);
    expect(submitted.props.stop_index).toBe(shown.stop_index);
    expect(submitted.props.original_venue_id).toBe(shown.original_venue_id);
    expect(submitted.props.surface).toBe(shown.surface);
  });
});

describe("handleNextSwapContext", () => {
  it("returns only a shown event when no previous context exists", () => {
    const c = ctx();
    const { nextState, events } = handleNextSwapContext(null, c, 1_000);

    expect(events).toHaveLength(1);
    expect(events[0].event).toBe("swap_reason_shown");
    expect(events[0].props).toMatchObject({
      stop_index: c.stopIndex,
      original_venue_id: c.originalVenue.id,
    });
    expect(nextState.swapContext).toBe(c);
    expect(nextState.shownAt).toBe(1_000);
  });

  it("rapid sequential swap: returns implicit skipped for prev THEN shown for next, in order", () => {
    const first = ctx({ stopIndex: 0, originalVenue: v("o1", "First") });
    const second = ctx({ stopIndex: 1, originalVenue: v("o2", "Second") });
    const prev: SwapReasonContext = { swapContext: first, shownAt: 1_000 };

    const { nextState, events } = handleNextSwapContext(prev, second, 5_000);

    expect(events).toHaveLength(2);
    // Skip first — comes BEFORE shown for the second, in that order, so
    // the caller's drain loop emits them in funnel-correct sequence.
    expect(events[0].event).toBe("swap_reason_skipped");
    expect(events[0].props).toMatchObject({ original_venue_id: "o1" });
    expect(events[1].event).toBe("swap_reason_shown");
    expect(events[1].props).toMatchObject({ original_venue_id: "o2" });
    expect(nextState.swapContext).toBe(second);
    expect(nextState.shownAt).toBe(5_000);
  });

  it("implicit skipped carries the prev context's properties, not the next's", () => {
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

    const { events } = handleNextSwapContext(prev, second, 5_000);

    const skipped = events.find((e) => e.event === "swap_reason_skipped");
    expect(skipped?.props).toMatchObject({
      stop_index: 0,
      stop_role: "opener",
      original_venue_id: "orig-prev",
      new_venue_id: "new-prev",
    });
  });

  it("three rapid swaps: each new arrival queues implicit skip for the one before", () => {
    const a = ctx({ stopIndex: 0, originalVenue: v("a-orig", "A") });
    const b = ctx({ stopIndex: 1, originalVenue: v("b-orig", "B") });
    const c = ctx({ stopIndex: 0, originalVenue: v("c-orig", "C") });

    const r1 = handleNextSwapContext(null, a, 1_000);
    const r2 = handleNextSwapContext(r1.nextState, b, 2_000);
    const r3 = handleNextSwapContext(r2.nextState, c, 3_000);

    // Expected event sequence when each transition's events are drained
    // in order: shown(a), skipped(a) + shown(b), skipped(b) + shown(c)
    const flat = [...r1.events, ...r2.events, ...r3.events];
    expect(flat).toHaveLength(5);
    expect(flat[0].event).toBe("swap_reason_shown");
    expect(flat[0].props).toMatchObject({ original_venue_id: "a-orig" });
    expect(flat[1].event).toBe("swap_reason_skipped");
    expect(flat[1].props).toMatchObject({ original_venue_id: "a-orig" });
    expect(flat[2].event).toBe("swap_reason_shown");
    expect(flat[2].props).toMatchObject({ original_venue_id: "b-orig" });
    expect(flat[3].event).toBe("swap_reason_skipped");
    expect(flat[3].props).toMatchObject({ original_venue_id: "b-orig" });
    expect(flat[4].event).toBe("swap_reason_shown");
    expect(flat[4].props).toMatchObject({ original_venue_id: "c-orig" });

    expect(r3.nextState.swapContext).toBe(c);
    expect(r3.nextState.shownAt).toBe(3_000);
  });

  it("computed time_to_decision_ms (submitted) is positive given monotonic now", () => {
    // Simulate the parent-side computation: shownAt captured at modal
    // open, "now" captured at submit. Difference is what the submitted
    // event carries.
    const shownAt = 1_000;
    const submitAt = 1_750;
    const timeToDecision = submitAt - shownAt;
    const result = buildSubmittedProps(ctx(), "wrong_vibe", null, timeToDecision);
    expect(result.props.time_to_decision_ms).toBe(750);
    expect(result.props.time_to_decision_ms).toBeGreaterThan(0);
  });
});
