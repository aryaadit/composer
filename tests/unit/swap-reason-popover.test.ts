import { describe, expect, it } from "vitest";

// SwapReasonModal renders two presentations branched on viewport +
// anchor availability. Mobile (or no anchor) → the historical
// bottom-sheet over a backdrop with body scroll lock. Desktop
// (Tailwind md, viewport >= 768px) + an anchor element from the
// page → a @floating-ui/react popover anchored to the swap action
// slot inside the swapped StopCard, with no backdrop and no scroll
// lock so the itinerary stays interactive behind it.
//
// No jsdom in this project (see vitest.config.ts). The contract is
// pinned at the source level so a future refactor that breaks the
// branching, dismissal coordination, or scroll-lock scoping is
// caught here rather than at QA.

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

describe("SwapReasonModal — branches on desktop media query + anchor presence", () => {
  it("declares the desktop media-query hook against Tailwind md (>= 768px)", async () => {
    const { modal } = await readSources();
    // The Tailwind md breakpoint is the contract: the page-level
    // anchor only resolves to a meaningful position when the user is
    // on a desktop-shaped viewport. Hardcoding the literal here
    // catches a drift to e.g. lg (1024px) that would silently leave
    // mobile tablets on the popover branch.
    expect(modal).toMatch(/const MD_QUERY = "\(min-width: 768px\)"/);
    // useSyncExternalStore is the SSR-safe subscription primitive —
    // it returns false on the server (sheet branch) and reads
    // matchMedia synchronously on the client so there's no flash of
    // the wrong presentation on hydration.
    expect(modal).toMatch(/useSyncExternalStore/);
    expect(modal).toMatch(/function getIsDesktopServerSnapshot\(\): boolean \{[\s\S]*?return false;/);
  });

  it("popover branch fires only when isOpen AND desktop AND anchorEl present", async () => {
    const { modal } = await readSources();
    // All three conditions are load-bearing:
    //   - isOpen: the modal is closed otherwise (AnimatePresence exit)
    //   - isDesktop: mobile must keep the sheet
    //   - anchorEl != null: a null anchor on desktop falls back to
    //     the sheet so we never position the popover at (0,0)
    expect(modal).toMatch(
      /const popoverBranch = isOpen && isDesktop && anchorEl != null;/,
    );
    // The sheet branch is the residual — open and NOT popover. This
    // keeps the two branches mutually exclusive so we can never
    // render both at once.
    expect(modal).toMatch(/const sheetBranch = isOpen && !popoverBranch;/);
  });

  it("sheet branch ships the backdrop + body scroll lock (mobile preserved as-is)", async () => {
    const { modal } = await readSources();
    // The dimmed backdrop is the click target that dismisses as skip
    // on mobile. bg-charcoal/40 is the token-scoped color the rest
    // of the modal family uses (ConfirmModal, VenueDetailModal).
    expect(modal).toMatch(/className="fixed inset-0 z-40 bg-charcoal\/40"/);
    // Body scroll lock is scoped to the sheet branch. The desktop
    // popover deliberately leaves the page interactive, so the lock
    // must NOT fire in that branch — useEffect depends on sheetBranch
    // and bails early when it's false.
    expect(modal).toMatch(
      /if \(!sheetBranch\) return;[\s\S]*?document\.body\.style\.overflow = "hidden";/,
    );
  });

  it("desktop popover uses @floating-ui/react with offset/flip/shift + bottom-end placement", async () => {
    const { modal } = await readSources();
    expect(modal).toMatch(/from "@floating-ui\/react"/);
    // The composer ships bottom-end so the popover hangs off the
    // swap pill's right edge, mirroring the visual weight of the
    // action slot. flip handles the small-viewport-on-desktop case
    // where bottom would clip; shift keeps the popover inside the
    // viewport with 8px padding.
    expect(modal).toMatch(/placement: "bottom-end"/);
    expect(modal).toMatch(/middleware: \[offset\(8\), flip\(\), shift\(\{ padding: 8 \}\)\]/);
    // autoUpdate keeps the popover glued to the anchor while the
    // page scrolls / resizes during the modal's lifetime.
    expect(modal).toMatch(/whileElementsMounted: autoUpdate/);
    // Visual shape: ~320px wide cream/rounded/shadow card. No
    // backdrop, no inset-0 wrapper — the className stays minimal
    // and explicitly omits any bg-charcoal scrim.
    expect(modal).toMatch(/className="z-50 w-\[320px\] bg-cream rounded-2xl shadow-xl"/);
  });

  it("outside-click dismisses, but escapeKey is OFF on floating-ui (window handler owns Esc)", async () => {
    const { modal } = await readSources();
    // Outside-press → onOpenChange(false) → onSkip(). This is the
    // only thing that makes the popover dismissable by clicking
    // outside it (since there's no backdrop to capture the click).
    expect(modal).toMatch(/useDismiss\(context, \{ outsidePress: true, escapeKey: false \}\)/);
    // The window-level keydown handler at the SwapReasonModal scope
    // covers Esc for BOTH branches. Enabling floating-ui's escapeKey
    // would double-fire onSkip (skipped event emitted twice), so the
    // contract requires escapeKey: false to stay in sync with the
    // window handler.
    expect(modal).toMatch(
      /if \(e\.key === "Escape"\) onSkipRef\.current\(\);/,
    );
  });

  it("anchorEl prop is the only way to opt into the desktop popover", async () => {
    const { modal } = await readSources();
    // The prop is optional + nullable so legacy callers (saved /
    // share surfaces that don't run the swap-reason flow) can omit
    // it. Type contract enforces the null-fallback we test above.
    expect(modal).toMatch(
      /anchorEl\?: HTMLElement \| null;/,
    );
    // DesktopPopover gets the non-null anchorEl AFTER popoverBranch
    // narrowed it. Inside the sub-component the type is HTMLElement
    // (no null), and floating-ui's `elements.reference` reads it.
    expect(modal).toMatch(/elements: \{ reference: anchorEl \}/);
  });
});

describe("SwapReasonModal — page → view → card anchor plumbing", () => {
  it("page maintains a ref map keyed by stop index + a stable registrar", async () => {
    const { page } = await readSources();
    // The Map lives on a ref so re-renders don't blow away the
    // registered anchors. Keyed by stop index because that's what
    // SwapContext carries — the modal looks up by swapContext.stopIndex.
    expect(page).toMatch(
      /const swapAnchorsRef = useRef<Map<number, HTMLElement \| null>>\(new Map\(\)\)/,
    );
    // The registrar identity must be stable (empty deps) so StopCard's
    // own useCallback ref doesn't churn on every render of the page.
    expect(page).toMatch(
      /const registerSwapAnchor = useCallback\(\s*\(i: number, el: HTMLElement \| null\) => \{[\s\S]*?swapAnchorsRef\.current\.set\(i, el\);[\s\S]*?\},\s*\[\],\s*\)/,
    );
  });

  it("page passes anchorEl=swapAnchorsRef.lookup(swapReason.swapContext.stopIndex)", async () => {
    const { page } = await readSources();
    // The lookup must coalesce missing entries to null so the modal's
    // anchorEl != null check fires correctly on the very first frame
    // after a swap (StopCard hasn't mounted yet → no entry yet).
    expect(page).toMatch(
      /anchorEl=\{swapReason \? \(swapAnchorsRef\.current\.get\(swapReason\.swapContext\.stopIndex\) \?\? null\) : null\}/,
    );
  });

  it("ItineraryView forwards registerSwapAnchor to every StopCard", async () => {
    const { view } = await readSources();
    expect(view).toMatch(
      /registerSwapAnchor\?: \(index: number, el: HTMLElement \| null\) => void;/,
    );
    // Threading: prop destructured AND handed to each <StopCard />.
    // No remapping — same signature top-to-bottom so the contract
    // stays grep-able.
    expect(view).toMatch(/registerSwapAnchor,?\s*\n\s*\}: ItineraryViewProps/);
    expect(view).toMatch(/registerSwapAnchor=\{registerSwapAnchor\}/);
  });

  it("StopCard wraps its action slot in a stable callback-ref div", async () => {
    const { stopCard } = await readSources();
    // The stable callback ref pattern: fires once on mount with the
    // wrapper element, once on unmount with null. Deps include index
    // and registerSwapAnchor so each card's ref identity is unique
    // to that card; both are stable for a given card so the callback
    // identity stays stable across re-renders.
    expect(stopCard).toMatch(
      /const swapAnchorRef = useCallback\(\s*\(el: HTMLElement \| null\) => \{[\s\S]*?registerSwapAnchor\?\.\(index, el\);[\s\S]*?\},\s*\[index, registerSwapAnchor\],\s*\)/,
    );
    // The ref MUST be attached to the wrapper that survives across
    // the Swap → Swapped → Swap transitions. Today that's a bare
    // <div ref={swapAnchorRef}> with no className, so it doesn't
    // collide with the swap-undo-slot contract regexes.
    expect(stopCard).toMatch(/<div ref=\{swapAnchorRef\}>/);
  });
});
