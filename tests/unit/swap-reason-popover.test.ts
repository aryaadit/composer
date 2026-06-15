import { describe, expect, it } from "vitest";

// SwapReasonModal renders two presentations branched on viewport +
// anchor availability. Mobile (or no anchor) → the historical
// bottom-sheet over a backdrop with body scroll lock. Desktop
// (Tailwind md, viewport ≥ 768px) + an anchor element from the
// page → a @floating-ui/react popover anchored to a STABLE per-stop
// wrapper in ItineraryView (the StopSlot keyed by INDEX, not
// venue.id), positioned right of the swapped card with offset/flip/
// shift, no backdrop, no scroll lock so the itinerary stays
// interactive behind it.
//
// The anchor stability is the load-bearing invariant. The earlier
// (broken) shape kept the anchor inside StopCard — itself rendered
// under a Fragment keyed by stop.venue.id — so every swap
// detached the anchor DOM node and floating-ui pinned the popover
// to (0,0). Fix: an outer StopSlot wrapper that doesn't unmount on
// swap. This file pins the new architecture across all four files.
//
// No jsdom in this project (see vitest.config.ts).

async function readSources() {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const { dirname, join } = await import("node:path");
  const here = dirname(fileURLToPath(import.meta.url));
  const repoRoot = join(here, "..", "..");
  const srcRoot = join(repoRoot, "src");
  return {
    modal: readFileSync(
      join(srcRoot, "components", "itinerary", "SwapReasonModal.tsx"),
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
    page: readFileSync(
      join(srcRoot, "app", "itinerary", "page.tsx"),
      "utf-8",
    ),
  };
}

describe("SwapReasonModal — desktop vs mobile branching", () => {
  it("declares the desktop media-query hook against Tailwind md (>= 768px)", async () => {
    const { modal } = await readSources();
    expect(modal).toMatch(/const MD_QUERY = "\(min-width: 768px\)"/);
    expect(modal).toMatch(/useSyncExternalStore/);
    expect(modal).toMatch(/function getIsDesktopServerSnapshot\(\): boolean \{[\s\S]*?return false;/);
  });

  it("popover branch fires only when isOpen AND desktop AND anchorEl present", async () => {
    const { modal } = await readSources();
    expect(modal).toMatch(
      /const popoverBranch = isOpen && isDesktop && anchorEl != null;/,
    );
    expect(modal).toMatch(/const sheetBranch = isOpen && !popoverBranch;/);
  });

  it("sheet branch ships the backdrop + body scroll lock (mobile preserved as-is)", async () => {
    const { modal } = await readSources();
    expect(modal).toMatch(/className="fixed inset-0 z-40 bg-charcoal\/40"/);
    expect(modal).toMatch(
      /if \(!sheetBranch\) return;[\s\S]*?document\.body\.style\.overflow = "hidden";/,
    );
  });
});

describe("SwapReasonModal — desktop popover placement + dismissal", () => {
  it("places the popover to the right of the swapped card via floating-ui right-start", async () => {
    const { modal } = await readSources();
    expect(modal).toMatch(/from "@floating-ui\/react"/);
    // right-start aligns the popover's top edge with the anchor's
    // top edge so the visual attachment reads cleanly.
    expect(modal).toMatch(/placement: "right-start"/);
    // offset(16) clears the card's right border; flip() handles
    // right-edge viewport overflow by relocating to the left;
    // shift({padding:8}) keeps the popover inside the viewport on
    // narrow desktop widths.
    expect(modal).toMatch(/middleware: \[offset\(16\), flip\(\), shift\(\{ padding: 8 \}\)\]/);
    expect(modal).toMatch(/whileElementsMounted: autoUpdate/);
    // Visual shape unchanged: ~320px cream card, no backdrop, no
    // inset-0 wrapper.
    expect(modal).toMatch(/className="z-50 w-\[320px\] bg-cream rounded-2xl shadow-xl"/);
  });

  it("uses layout positioning (transform: false) so motion.div's scale animation can't clobber the position", async () => {
    const { modal } = await readSources();
    // floating-ui's default `transform: true` returns floatingStyles
    // with `transform: translate3d(x, y, 0)`. The popover's motion.div
    // ALSO writes the transform property (to animate scale), and
    // motion wins the style race — once scale settles at 1, motion
    // writes `transform: none` and the popover pins to (0,0) at the
    // base top/left. `transform: false` switches floatingStyles to
    // use top/left, leaving transform available for motion. Pin the
    // setting so a future "tidy up the config" pass can't quietly
    // remove it and reintroduce the corner-pin bug.
    expect(modal).toMatch(/transform: false,/);
  });

  it("outside-click dismisses; floating-ui escapeKey is OFF (window-level handler owns Esc)", async () => {
    const { modal } = await readSources();
    expect(modal).toMatch(/useDismiss\(context, \{ outsidePress: true, escapeKey: false \}\)/);
    expect(modal).toMatch(/if \(e\.key === "Escape"\) onSkipRef\.current\(\);/);
  });

  it("logs loudly when the anchor's rect is zero-sized (regression diagnostic)", async () => {
    const { modal } = await readSources();
    // A zero-sized rect means the stable-anchor contract has broken
    // again (the anchor lived inside a remounting subtree). This
    // guard runs once when anchorEl changes and prints a console
    // error pointing at the architectural assumption; floating-ui
    // would otherwise silently render at (0,0).
    expect(modal).toMatch(/rect = anchorEl\.getBoundingClientRect\(\)/);
    expect(modal).toMatch(
      /if \(rect\.width === 0 \|\| rect\.height === 0\)[\s\S]*?console\.error\(/,
    );
    expect(modal).toMatch(/stable-per-stop anchor contract regressed/);
  });
});

describe("ItineraryView — StopSlot is the STABLE per-stop anchor (keyed by INDEX)", () => {
  it("defines a StopSlot wrapper component with a stable callback ref", async () => {
    const { view } = await readSources();
    // The wrapper's identity must not change across swaps. useCallback
    // on the ref setter with [index, registerSwapAnchor] keeps the ref
    // identity stable for a given slot — React doesn't re-fire the
    // ref between renders, so the map never sees the spurious null
    // that a bare inline arrow would cause.
    expect(view).toMatch(/function StopSlot\(/);
    expect(view).toMatch(
      /const setRef = useCallback\(\s*\(el: HTMLElement \| null\) => registerSwapAnchor\?\.\(index, el\),\s*\[index, registerSwapAnchor\],\s*\)/,
    );
    expect(view).toMatch(/<div ref=\{setRef\}>\{children\}<\/div>/);
  });

  it("the stop-map Fragment is keyed by INDEX (not venue.id) so the slot survives a swap", async () => {
    const { view } = await readSources();
    // venue.id keying on the Fragment was the original bug — every
    // swap unmounted the wrapper and floating-ui ended up holding a
    // detached DOM node.
    expect(view).toMatch(/<Fragment key=\{`stop-slot-\$\{i\}`\}>/);
    // And the previous shape is gone — pin its absence so a refactor
    // can't silently re-introduce the unstable key.
    expect(view).not.toMatch(/<Fragment key=\{stop\.venue\.id\}>/);
  });

  it("the inner StopCard keeps key={stop.venue.id} so its remount-on-swap animation is preserved", async () => {
    const { view } = await readSources();
    // The card body still remounts on swap (fresh entrance animation,
    // fresh slot-grid state), but the StopSlot WRAPPER around it stays
    // mounted. Anchor stability without losing the card's freshness.
    expect(view).toMatch(/<StopCard\s+[\s\S]*?key=\{stop\.venue\.id\}/);
  });

  it("StopSlot receives registerSwapAnchor and forwards the index — not StopCard", async () => {
    const { view, stopCard } = await readSources();
    // The wiring moves OUT of StopCard. StopCard no longer has any
    // notion of the swap anchor — that prevents a future refactor
    // from re-introducing the inner-subtree ref by accident.
    expect(view).toMatch(/<StopSlot index=\{i\} registerSwapAnchor=\{registerSwapAnchor\}>/);
    expect(stopCard).not.toMatch(/registerSwapAnchor/);
    expect(stopCard).not.toMatch(/swapAnchorRef/);
  });
});

describe("/itinerary page — single-channel anchor wiring", () => {
  it("keeps a ref map keyed by stop index + a stable registrar (empty deps)", async () => {
    const { page } = await readSources();
    expect(page).toMatch(
      /const swapAnchorsRef = useRef<Map<number, HTMLElement \| null>>\(new Map\(\)\)/,
    );
    expect(page).toMatch(
      /const registerSwapAnchor = useCallback\(\s*\(i: number, el: HTMLElement \| null\) => \{\s*swapAnchorsRef\.current\.set\(i, el\);\s*\},\s*\[\],\s*\)/,
    );
  });

  it("the seed effect is the SOLE channel — no activeAnchorIndexRef, no registrar push", async () => {
    const { page } = await readSources();
    // Single channel: useEffect on swapReason → setSwapAnchorEl.
    // The previous attempt added a second channel (registrar push +
    // activeAnchorIndexRef) to cover the remount race; with a stable
    // anchor that race no longer exists, and the extra machinery is
    // pure surface-area for future bugs.
    expect(page).toMatch(
      /useEffect\(\(\) => \{\s*if \(!swapReason\) \{\s*setSwapAnchorEl\(null\);\s*return;\s*\}\s*setSwapAnchorEl\(\s*swapAnchorsRef\.current\.get\(swapReason\.swapContext\.stopIndex\) \?\? null,?\s*\);\s*\}, \[swapReason\]\)/,
    );
    expect(page).not.toMatch(/activeAnchorIndexRef/);
  });

  it("SwapReasonModal receives the stateful swapAnchorEl, NOT an inline render-time ref read", async () => {
    const { page } = await readSources();
    expect(page).toMatch(/anchorEl=\{swapAnchorEl\}/);
    expect(page).not.toMatch(
      /anchorEl=\{[^}]*swapAnchorsRef\.current\.get\(/,
    );
  });
});
