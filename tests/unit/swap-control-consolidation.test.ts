import { describe, expect, it } from "vitest";

// The Swap and Swapped/Undo affordances must live in ONE consistent
// location per stop: StopCard's action row. The previous layout split
// them across surfaces for Resy venues — Swap rendered inside
// StopAvailability (under the slot grid) while Swapped/Undo rendered
// in StopCard's action row, so during the post-swap undo window the
// user saw two controls in two places. Walk-in venues already had a
// single location (no slot grid → both surfaces in StopCard).
//
// This contract pins the consolidation at the source level (no jsdom
// in this project): StopAvailability has no Swap button, no onSwap
// prop, and the ItineraryView no longer wires onSwap into it. Future
// refactors that re-introduce a Swap in either of those places will
// fail this file before reaching QA.

async function readSources() {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const { dirname, join } = await import("node:path");
  const here = dirname(fileURLToPath(import.meta.url));
  const repoRoot = join(here, "..", "..");
  const srcRoot = join(repoRoot, "src");
  return {
    availability: readFileSync(
      join(srcRoot, "components", "itinerary", "StopAvailability.tsx"),
      "utf-8",
    ),
    view: readFileSync(
      join(srcRoot, "components", "itinerary", "ItineraryView.tsx"),
      "utf-8",
    ),
    stopCard: readFileSync(
      join(srcRoot, "components", "ui", "StopCard.tsx"),
      "utf-8",
    ),
  };
}

describe("StopAvailability — no Swap surface lives here anymore", () => {
  it("does not declare or reference an onSwap prop", async () => {
    const { availability } = await readSources();
    // The Swap pill used to render in HasSlotsView's footer flex row.
    // Removing the prop + the button keeps the file lean and prevents
    // a future contributor from re-introducing the duplicate control
    // by wiring onSwap from the page without also touching StopCard.
    expect(availability).not.toMatch(/onSwap/);
  });

  it("does not render a Swap button anywhere", async () => {
    const { availability } = await readSources();
    // Specifically searching for the literal "Swap" text inside the
    // module catches both the pill button text and any future Swap
    // affordance someone might prototype. "Swap" appears nowhere in
    // this file post-consolidation.
    expect(availability).not.toMatch(/>Swap</);
  });

  it("the show-more-times button stands alone (no flex sibling for Swap)", async () => {
    const { availability } = await readSources();
    // Previously a "(hasMore || onSwap)" wrapper produced a
    // flex/justify-between row carrying both buttons. With Swap gone,
    // the show-more button is rendered directly — no orphan wrapper,
    // no dead flex container.
    expect(availability).toMatch(
      /\{hasMore && \(\s*<button[\s\S]*?Show more times[\s\S]*?<\/button>\s*\)\}/,
    );
  });
});

describe("ItineraryView — StopAvailability call site no longer wires onSwap", () => {
  it("the StopAvailabilitySection JSX has no onSwap prop", async () => {
    const { view } = await readSources();
    // Trim window: the JSX block from <StopAvailabilitySection through
    // its closing tag must not contain `onSwap=`. The Swap surface is
    // already wired into StopCard via the existing onSwap prop, so the
    // duplicate plumbing is purely dead weight.
    const m = view.match(
      /<StopAvailabilitySection[\s\S]*?\/>/,
    );
    expect(m).not.toBeNull();
    expect(m![0]).not.toMatch(/onSwap=/);
  });
});

describe("StopCard — Swap pill renders for every venue type (hasSlots gate gone)", () => {
  it("showInlineSwap is gated only by onSwap, never by hasSlots", async () => {
    const { stopCard } = await readSources();
    // Two halves: the new shape is present, and the previous
    // "&& !hasSlots" guard is absent. Pinning the absence makes the
    // regression case (re-introducing the gate) caught here rather
    // than at QA on a Resy venue.
    expect(stopCard).toMatch(/const showInlineSwap = !!onSwap;/);
    expect(stopCard).not.toMatch(/!!onSwap && !hasSlots/);
  });
});
