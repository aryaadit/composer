import { describe, expect, it } from "vitest";

// Audit item 1 (regression): when one of swap / add-stop succeeds, the
// failure block from the OTHER must be cleared so the user isn't
// staring at a stale "Nothing nearby pairs up" / "Too much for one
// night" message that no longer reflects the candidate pool.
//
// The actual clearing lives in:
//   - src/app/itinerary/page.tsx onSwapComplete  → setAddStopFailure(null)
//   - src/app/itinerary/page.tsx handleAddStop  → clearSwapFailure()
//   - src/hooks/useSwapStop.ts clearSwapFailure  → exported helper
//
// This test reads the source files and asserts the symmetric clearing
// hooks survive future edits.  Behavior-level coverage would need a
// render runtime we don't have in vitest — the grep tripwire is the
// next best thing.

describe("Failure-block clearing — symmetric on swap success and add-stop success", () => {
  let pageSrc: string;
  let hookSrc: string;

  // No top-level await with vitest's module loader, so resolve in the
  // first test via dynamic import of node:fs.
  async function readSources() {
    if (pageSrc && hookSrc) return;
    const { readFileSync } = await import("node:fs");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");
    const here = dirname(fileURLToPath(import.meta.url));
    const srcRoot = join(here, "..", "..", "src");
    pageSrc = readFileSync(
      join(srcRoot, "app", "itinerary", "page.tsx"),
      "utf-8",
    );
    hookSrc = readFileSync(join(srcRoot, "hooks", "useSwapStop.ts"), "utf-8");
  }

  it("useSwapStop exports a clearSwapFailure helper", async () => {
    await readSources();
    // The hook must expose an explicit clear so the page-level
    // handleAddStop success can call it. A future refactor that
    // collapses state into the page would still need an equivalent.
    expect(hookSrc).toMatch(/clearSwapFailure/);
    expect(hookSrc).toMatch(/swapFailure:\s*null/);
  });

  it("onSwapComplete on the page clears addStopFailure (swap → add-stop direction)", async () => {
    await readSources();
    // The success-of-swap callback clears addStopFailure so a stale
    // add-stop failure block doesn't outlive a successful swap.
    // Looser regex (constSwapComplete may grow to include analytics
    // emits before the clear).
    expect(pageSrc).toMatch(/onSwapComplete[\s\S]*?setAddStopFailure\(\s*null\s*\)/);
  });

  it("handleAddStop on the page calls clearSwapFailure on success (add-stop → swap direction)", async () => {
    await readSources();
    // The add-stop success path must call clearSwapFailure so a
    // stale swap-failure block doesn't outlive a successful add. The
    // call lives right after updateItinerary(next); — assert the
    // sequence appears anywhere in handleAddStop.
    expect(pageSrc).toMatch(/updateItinerary\(next\);[\s\S]*?clearSwapFailure\(\)/);
  });

  it("The success branch in handleAddStop is followed by clearSwapFailure (not by re-setting either failure)", async () => {
    await readSources();
    // Sanity tripwire: the success branch in handleAddStop must
    // clear, not re-set. The 422 path (which DOES setAddStopFailure)
    // sits ABOVE the success branch and is unaffected.
    const idx = pageSrc.indexOf("updateItinerary(next);");
    expect(idx).toBeGreaterThan(-1);
    // Look at the ~500 chars immediately after the success-path
    // updateItinerary call; that's the window where the audit's
    // symmetric clear lives.
    const window = pageSrc.slice(idx, idx + 500);
    expect(window).toMatch(/clearSwapFailure\(\)/);
    // The successful-add window must NOT call setAddStopFailure
    // (the 422 and catch branches above DO, but those are before
    // updateItinerary).
    expect(window).not.toMatch(/setAddStopFailure\(/);
  });
});
