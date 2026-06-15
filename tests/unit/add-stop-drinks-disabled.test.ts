import { describe, it, expect } from "vitest";

// Launch-scope: extending a Drinks itinerary isn't supported. Two
// contracts pin the policy:
//   1. The /itinerary page hides the "Add another stop" affordance
//      entirely when inputs.vibe === "drinks_led" (no button to
//      click → no /api/add-stop POST in normal flow).
//   2. The /api/add-stop route degrades to a typed ComposeFailure
//      (422, stage "system") if a stale tab or external POST hits
//      it anyway. The previous raw 400 ("No main stop to anchor
//      extension") let the client crash to a generic error path
//      instead of rendering the existing ComposeFailureBlock.
//
// No jsdom in this project — both contracts are pinned at the source
// level (see vitest.config.ts).

async function readSources() {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const { dirname, join } = await import("node:path");
  const here = dirname(fileURLToPath(import.meta.url));
  const srcRoot = join(here, "..", "..", "src");
  return {
    page: readFileSync(
      join(srcRoot, "app", "itinerary", "page.tsx"),
      "utf-8",
    ),
    addStopRoute: readFileSync(
      join(srcRoot, "app", "api", "add-stop", "route.ts"),
      "utf-8",
    ),
  };
}

describe("/itinerary page — Add stop is hidden on drinks_led", () => {
  it("onAddStop is undefined when inputs.vibe is drinks_led", async () => {
    const { page } = await readSources();
    // The button render is gated by `wrappedOnAddStop && (...)` inside
    // ItineraryView, so passing undefined from the parent suppresses
    // the affordance entirely. Pin the conditional so a future edit
    // can't silently re-enable the button on Drinks.
    expect(page).toMatch(
      /onAddStop=\{\s*itinerary\.inputs\.vibe === "drinks_led" \? undefined : handleAddStop\s*\}/,
    );
  });
});

describe("/api/add-stop — typed ComposeFailure backstop for Drinks / no-Main", () => {
  it("drinks_led OR missing-main returns respondComposeFailure(\"system\", \"add-stop\", ...) instead of a raw 400", async () => {
    const { addStopRoute } = await readSources();
    // Single branch covers both conditions explicitly. The "system"
    // stage is the right copy registry entry here: neutral framing,
    // no user-input blame, and the existing ComposeFailureBlock on
    // the client already renders it.
    expect(addStopRoute).toMatch(
      /if \(inputs\.vibe === "drinks_led" \|\| !mainStop\) \{\s*return respondComposeFailure\(\s*"system",\s*"add-stop",\s*inputs,\s*\{\s*userId: null,\s*distinctId,\s*sessionId,\s*\},?\s*\);\s*\}/,
    );
  });

  it("the raw 'No main stop to anchor extension' 400 is GONE", async () => {
    const { addStopRoute } = await readSources();
    // The old branch returned NextResponse.json({error:"No main stop ..."}, {status:400}).
    // It's untyped (no `failed:true` discriminator), so isComposeFailure
    // returns false on the client and the failure-block render branch
    // never fires. Pin its absence so a regression can't silently
    // resurrect the bad shape.
    expect(addStopRoute).not.toMatch(/No main stop to anchor extension/);
  });
});
