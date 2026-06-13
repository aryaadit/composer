"use client";

// Post-swap reason capture. Appears AFTER a swap completes (the new
// venue is already rendered, the inline Swapped/Undo affordance may
// still be visible on the swapped StopCard — see audit item 19).
// Skippable: Esc, backdrop / outside-click, X button, and explicit
// "Skip" link all dismiss as skip. Submit captures a categorical
// reason + optional free-text "Other" detail.
//
// Two presentations, branched on viewport + anchor availability:
//   - MOBILE (or no anchor): bottom-sheet over a full-page backdrop
//     with body scroll lock. This is the historical default, unchanged.
//   - DESKTOP (Tailwind md, viewport ≥ 768px) + anchor element from the
//     page: a popover positioned via @floating-ui/react, anchored to
//     the swap action-slot wrapper inside the corresponding StopCard.
//     No backdrop, no scroll lock — the itinerary stays interactive
//     behind the popover. Outside-click and the existing Esc handler
//     dismiss as skip.
//
// AnimatePresence drives enter/exit for both branches.

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  autoUpdate,
  flip,
  offset,
  shift,
  useDismiss,
  useFloating,
  useInteractions,
} from "@floating-ui/react";
import { Button } from "@/components/ui/Button";

export interface SwapReasonOption {
  readonly key: string;
  readonly label: string;
}

/**
 * The categorical reasons offered to the user, in display order.
 * "other" is last and special-cased to reveal a free-text input.
 */
export const SWAP_REASON_OPTIONS: readonly SwapReasonOption[] = [
  { key: "not_interested", label: "Not interested in this place" },
  { key: "looking_for_different", label: "Looking for something else here" },
  { key: "wrong_vibe", label: "Wrong vibe" },
  { key: "other", label: "Other" },
] as const;

interface SwapReasonModalProps {
  isOpen: boolean;
  /** Used in the modal header ("Why did you swap {name}?"). */
  swappedFromVenueName: string;
  onSubmit: (reason: string, otherText: string | null) => void;
  onSkip: () => void;
  /** When provided AND the viewport is ≥ Tailwind md (768px), the
   *  modal renders as a popover anchored to this element instead of
   *  a centered/bottom-sheet dialog. The page owns a ref map keyed by
   *  stop index and supplies the active stop's swap action-slot
   *  wrapper here; if null or undefined, the mobile sheet renders
   *  even on desktop. */
  anchorEl?: HTMLElement | null;
}

// ── Desktop detection: SSR-safe, no flash of the sheet ────────────
//
// useSyncExternalStore reads matchMedia synchronously on the client so
// the first browser render already knows desktop-vs-not. SSR renders
// with `false` (and the bottom sheet shape, which we degrade to
// gracefully). The matchMedia subscription auto-syncs on viewport
// resize so resizing into / out of md flips the presentation live.

const MD_QUERY = "(min-width: 768px)";

function subscribeIsDesktop(callback: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mql = window.matchMedia(MD_QUERY);
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

function getIsDesktopSnapshot(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(MD_QUERY).matches;
}

function getIsDesktopServerSnapshot(): boolean {
  return false;
}

function useIsDesktop(): boolean {
  return useSyncExternalStore(
    subscribeIsDesktop,
    getIsDesktopSnapshot,
    getIsDesktopServerSnapshot,
  );
}

export function SwapReasonModal({
  isOpen,
  swappedFromVenueName,
  onSubmit,
  onSkip,
  anchorEl,
}: SwapReasonModalProps) {
  // Keep a stable ref to the latest onSkip so the Esc handler can
  // depend only on isOpen — re-binding keydown on every render of
  // the parent would be wasteful.
  const onSkipRef = useRef(onSkip);
  useEffect(() => {
    onSkipRef.current = onSkip;
  }, [onSkip]);

  // Esc dismissal — counts as skip. Covers BOTH the sheet and the
  // desktop popover. floating-ui's escapeKey dismiss is intentionally
  // OFF so we don't double-fire onSkip.
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onSkipRef.current();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen]);

  const isDesktop = useIsDesktop();
  const popoverBranch = isOpen && isDesktop && anchorEl != null;
  const sheetBranch = isOpen && !popoverBranch;

  // Body scroll lock applies ONLY in the sheet branch. The desktop
  // popover leaves the page interactive behind it, so locking would
  // be hostile (and the user can't tap into the body to dismiss
  // otherwise — outsidePress handles that).
  useEffect(() => {
    if (!sheetBranch) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [sheetBranch]);

  return (
    <AnimatePresence>
      {sheetBranch && (
        <>
          <motion.div
            key="backdrop"
            className="fixed inset-0 z-40 bg-charcoal/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onSkip}
            aria-hidden
          />
          <motion.div
            key="sheet"
            role="dialog"
            aria-modal="true"
            aria-label={`Why did you swap ${swappedFromVenueName}?`}
            className="fixed inset-x-0 bottom-0 z-50 bg-cream rounded-t-2xl shadow-xl max-h-[90vh] overflow-y-auto md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:max-w-md md:w-full md:rounded-2xl md:max-h-[85vh]"
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 30, stiffness: 280 }}
          >
            {/* The form lives in a child so its internal state resets
                via remount when isOpen flips (a fresh modal for each
                swap), avoiding the "setState in useEffect" pattern. */}
            <SwapReasonContent
              swappedFromVenueName={swappedFromVenueName}
              onSubmit={onSubmit}
              onSkip={onSkip}
            />
          </motion.div>
        </>
      )}

      {popoverBranch && (
        // Dedicated sub-component so the floating-ui hooks are called
        // unconditionally within it. anchorEl is non-null inside this
        // branch (popoverBranch checks it above).
        <DesktopPopover
          key="popover"
          anchorEl={anchorEl}
          swappedFromVenueName={swappedFromVenueName}
          onSubmit={onSubmit}
          onSkip={onSkip}
        />
      )}
    </AnimatePresence>
  );
}

function DesktopPopover({
  anchorEl,
  swappedFromVenueName,
  onSubmit,
  onSkip,
}: {
  anchorEl: HTMLElement;
  swappedFromVenueName: string;
  onSubmit: (reason: string, otherText: string | null) => void;
  onSkip: () => void;
}) {
  const { refs, floatingStyles, context } = useFloating({
    open: true,
    onOpenChange: (next) => {
      if (!next) onSkip();
    },
    placement: "bottom-end",
    middleware: [offset(8), flip(), shift({ padding: 8 })],
    whileElementsMounted: autoUpdate,
    elements: { reference: anchorEl },
  });

  // Outside-click dismisses (→ onSkip via onOpenChange) without a
  // blocking layer, so clicks fall through to the itinerary. Esc is
  // OFF here because the window-level handler in SwapReasonModal
  // already owns Esc; enabling it on floating-ui would double-fire.
  const dismiss = useDismiss(context, { outsidePress: true, escapeKey: false });
  const { getFloatingProps } = useInteractions([dismiss]);

  return (
    <motion.div
      // `refs.setFloating` is a stable callback-ref setter returned by
      // useFloating — it's a function, not a React ref object, so
      // attaching it to <motion.div ref={...}> is the documented
      // @floating-ui/react usage. The react-hooks/refs lint flags the
      // shape because of the `refs.` prefix; the access is safe here.
      // eslint-disable-next-line react-hooks/refs
      ref={refs.setFloating}
      style={floatingStyles}
      role="dialog"
      aria-modal="false"
      aria-label={`Why did you swap ${swappedFromVenueName}?`}
      // The "fixed" positioning + z-50 keeps the popover above the
      // itinerary content and the sticky LooksGoodCTA at the bottom.
      // ~320px wide; cream/rounded/shadow card matches VenueDetailModal
      // and ConfirmModal so the visual family stays consistent.
      className="z-50 w-[320px] bg-cream rounded-2xl shadow-xl"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.15 }}
      {...getFloatingProps()}
    >
      <SwapReasonContent
        swappedFromVenueName={swappedFromVenueName}
        onSubmit={onSubmit}
        onSkip={onSkip}
      />
    </motion.div>
  );
}

function SwapReasonContent({
  swappedFromVenueName,
  onSubmit,
  onSkip,
}: {
  swappedFromVenueName: string;
  onSubmit: (reason: string, otherText: string | null) => void;
  onSkip: () => void;
}) {
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [otherText, setOtherText] = useState("");

  const handleSubmit = () => {
    if (!selectedReason) return;
    const text = normalizeOtherText(selectedReason, otherText);
    onSubmit(selectedReason, text);
  };

  return (
    <>
      {/* Sticky header — grabber + close. */}
      <div className="sticky top-0 z-10 bg-cream rounded-t-2xl pt-3 pb-2 px-6 flex items-center justify-between">
        <div className="mx-auto h-1 w-10 rounded-full bg-border md:hidden" />
        <button
          type="button"
          onClick={onSkip}
          aria-label="Skip"
          className="absolute right-2 top-2 w-11 h-11 inline-flex items-center justify-center font-sans text-sm text-muted hover:text-charcoal transition-colors"
        >
          ✕
        </button>
      </div>

      <div className="px-6 pt-2 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <h2 className="font-serif text-2xl font-normal text-charcoal leading-snug mb-1">
          Why did you swap {swappedFromVenueName}?
        </h2>
        <p className="font-sans text-sm text-muted mb-5">
          Helps us tune what we suggest next.
        </p>

        <div className="space-y-2 mb-5">
          {SWAP_REASON_OPTIONS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setSelectedReason(key)}
              aria-pressed={selectedReason === key}
              className={`w-full text-left px-4 py-3 rounded-lg border font-sans text-sm transition-colors ${
                selectedReason === key
                  ? "border-burgundy bg-burgundy/5 text-charcoal"
                  : "border-border bg-transparent text-charcoal hover:border-charcoal"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {selectedReason === "other" && (
          // Audit item 27: visible char counter + aria-describedby so
          // the 200-char cap is announced, not silent-truncated. The
          // counter turns burgundy at >= 180 to warn before the cap.
          // Audit item 25: aria-label since placeholder isn't an
          // accessible name. Audit item 24: focus-visible ring per
          // Button.tsx pattern.
          <>
            <input
              type="text"
              aria-label="Tell us more about why you swapped"
              aria-describedby="swap-reason-other-count"
              value={otherText}
              onChange={(e) => setOtherText(e.target.value)}
              placeholder="Tell us more (optional)"
              maxLength={200}
              className="w-full px-4 py-3 rounded-lg border border-border bg-transparent font-sans text-sm text-charcoal placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-burgundy/40 focus-visible:border-burgundy mb-1"
            />
            <p
              id="swap-reason-other-count"
              className={`text-right font-sans text-[11px] mb-5 ${
                otherText.length >= 180 ? "text-burgundy" : "text-muted"
              }`}
            >
              {otherText.length}/200
            </p>
          </>
        )}

        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onSkip}
            className="font-sans text-sm text-muted hover:text-charcoal transition-colors"
          >
            Skip
          </button>
          {/* Audit items 18 + 30: routed through Button primitive,
              which carries the CANONICAL disabled treatment
              (opacity-40 + cursor-not-allowed). Drops the bespoke
              `disabled:bg-muted` color swap so every disabled button
              in the app reads the same way. */}
          <Button
            variant="primary"
            size="sm"
            onClick={handleSubmit}
            disabled={!selectedReason}
            type="button"
          >
            Submit
          </Button>
        </div>
      </div>
    </>
  );
}

/**
 * Normalize the free-text "Other" detail before reporting to analytics.
 * Returns the trimmed string when "other" is selected and the user
 * actually typed something; null otherwise. Pure — exported for tests.
 */
export function normalizeOtherText(
  selectedReason: string,
  rawOtherText: string,
): string | null {
  if (selectedReason !== "other") return null;
  const trimmed = rawOtherText.trim();
  return trimmed.length > 0 ? trimmed : null;
}
