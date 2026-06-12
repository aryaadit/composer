import { describe, expect, it } from "vitest";

// The post-swap "Swapped · Undo" affordance used to render as its own
// row below the Swap pill in StopCard, so both were visible at once
// for the ~8s undo window. The 2026-06-12 rework collapses that into
// ONE action slot: the Swap pill is replaced IN PLACE while justSwapped
// is active, then reverts on undo / timer expiry / next action.
//
// Three contracts pinned at the source level (no jsdom in this project,
// see vitest.config.ts):
//   1. Swap pill is hidden whenever the swap-undo slot is rendering.
//   2. Undo restores the prior venue via the existing onUndoSwap, and
//      when justSwapped flips back to false (handled by useSwapStop)
//      the slot reverts to the Swap pill.
//   3. Timer expiry on useSwapStop's 8s undoRef setTimeout fires
//      setState that clears swappedIndex → justSwapped becomes false
//      → the slot reverts to Swap.

async function readSources() {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const { dirname, join } = await import("node:path");
  const here = dirname(fileURLToPath(import.meta.url));
  const srcRoot = join(here, "..", "..", "src");
  return {
    stopCard: readFileSync(
      join(srcRoot, "components", "ui", "StopCard.tsx"),
      "utf-8",
    ),
    swapHook: readFileSync(
      join(srcRoot, "hooks", "useSwapStop.ts"),
      "utf-8",
    ),
  };
}

describe("StopCard — Swap / Undo share one action slot", () => {
  it("the separate Swapped/Undo block below the meta line is gone", async () => {
    const { stopCard } = await readSources();
    // The pre-rework block lived OUTSIDE the actions-row container
    // and rendered alongside the Swap pill. Pin its removal so a
    // future merge can't resurrect the dual-render.
    expect(stopCard).not.toMatch(/mt-3 flex items-center gap-3 font-sans text-xs text-warm-gray/);
    // The "Swapped" word must only ever appear inside the right slot
    // of the actions row, not as a top-level block. We check this
    // structurally below by asserting it's nested under showSwappedSlot.
    const swappedHits = stopCard.match(/<span>Swapped<\/span>/g) ?? [];
    expect(swappedHits.length).toBe(1);
  });

  it("right slot is gated by showSwappedSlot ? Swapped+Undo : Swap (Swap hidden during undo window)", async () => {
    const { stopCard } = await readSources();
    // The slot's conditional MUST evaluate the swapped state before
    // the Swap pill — that's the in-place replacement contract. A
    // future edit that flips the ternary or renders both branches
    // unconditionally would re-introduce the confusion.
    expect(stopCard).toMatch(
      /showSwappedSlot \? \([\s\S]*?<span>Swapped<\/span>[\s\S]*?Undo[\s\S]*?\) : \([\s\S]*?showInlineSwap && \([\s\S]*?Swap[\s\S]*?\)\s*\)/,
    );
    // showSwappedSlot must require both justSwapped AND onUndoSwap so
    // we never strand a "Swapped" label without an actionable Undo.
    expect(stopCard).toMatch(
      /const showSwappedSlot = justSwapped && !swapFailure && !!onUndoSwap/,
    );
  });

  it("Undo button is the same pill treatment as Swap (no layout shift)", async () => {
    const { stopCard } = await readSources();
    // Both the Undo button (inside the showSwappedSlot branch) and
    // the Swap button (inside the showInlineSwap branch) share the
    // identical className recipe so the slot's vertical height is
    // invariant across all three states. min-h-[36px] is the touch-
    // target floor the audit established.
    const PILL = /inline-flex items-center justify-center min-h-\[36px\] px-3 rounded-full border border-burgundy\/30 font-sans text-xs font-medium text-burgundy hover:border-burgundy hover:bg-burgundy\/5 transition-colors/;
    const pillHits = stopCard.match(new RegExp(PILL, "g")) ?? [];
    // Two occurrences: Undo + Swap. If a future refactor diverges
    // them (different padding, different text size) this assertion
    // catches the layout-shift regression.
    expect(pillHits.length).toBe(2);
  });

  it("role=status aria-live=polite still announces the swap confirmation", async () => {
    const { stopCard } = await readSources();
    // The wrapper around Swapped + Undo carries the announcement so
    // screen reader users get parity with the visual confirmation.
    expect(stopCard).toMatch(
      /role="status"[\s\S]*?aria-live="polite"[\s\S]*?<span>Swapped<\/span>/,
    );
  });

  it("showActionsRow renders whenever swapSlot is showing (hasSlots case keeps Undo visible)", async () => {
    const { stopCard } = await readSources();
    // The actions row is gated by showActionsRow. When hasSlots is
    // true the Swap pill lives in StopAvailability, but justSwapped
    // can still fire after a slot-grid swap; force-rendering the row
    // for showSwappedSlot keeps the undo affordance reachable.
    expect(stopCard).toMatch(
      /const showActionsRow =[\s\S]*?showSwappedSlot/,
    );
  });

  it("Undo click calls onUndoSwap — restore closure on useSwapStop reverts the prior venue", async () => {
    const { stopCard, swapHook } = await readSources();
    // Click → onUndoSwap (StopCard).
    expect(stopCard).toMatch(/onClick=\{onUndoSwap\}[\s\S]*?Undo/);
    // onUndoSwap (useSwapStop.undoSwap) clears the timer, calls the
    // captured restore() closure (which calls onUpdate(prevItinerary)
    // and removes the swap from excludedRef), and flips swappedIndex
    // to null — which makes justSwapped false on the StopCard, which
    // reverts the slot to the Swap pill.
    expect(swapHook).toMatch(/const undoSwap = useCallback\(\(\) => \{/);
    expect(swapHook).toMatch(/window\.clearTimeout\(undoRef\.current\.timer\)/);
    expect(swapHook).toMatch(/const \{ restore, index \} = undoRef\.current/);
    expect(swapHook).toMatch(/restore\(\)/);
    expect(swapHook).toMatch(
      /s\.swappedIndex === index \? \{ \.\.\.s, swappedIndex: null \} : s/,
    );
  });

  it("Timer expiry restores the Swap pill — 8s setTimeout clears swappedIndex", async () => {
    const { swapHook } = await readSources();
    // The undoRef.timer setTimeout body clears swappedIndex to null
    // on expiry — same downstream effect as undoSwap: justSwapped
    // flips false on the card and the slot reverts to Swap. Without
    // this, the Undo affordance would linger forever and the user
    // could never reach Swap on the same stop again.
    expect(swapHook).toMatch(
      /const timer = window\.setTimeout\(\(\) => \{[\s\S]*?undoRef\.current = null;[\s\S]*?setState\(\(s\) =>[\s\S]*?s\.swappedIndex === index \? \{ \.\.\.s, swappedIndex: null \} : s[\s\S]*?\}, 8000\)/,
    );
  });
});
