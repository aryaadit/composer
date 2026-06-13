"use client";

// Post-swap reason capture. Appears AFTER a swap completes (the new
// venue is already rendered, the inline Swapped/Undo affordance may
// still be visible on the swapped StopCard — see audit item 19).
// Skippable: Esc, backdrop click, X button, and explicit "Skip" link
// all dismiss as skip. Submit captures a categorical reason + optional
// free-text "Other" detail.
//
// Following VenueDetailModal's visual pattern: bottom-sheet on mobile,
// centered modal on desktop. Body scroll lock when open. Esc/backdrop
// dismiss. AnimatePresence for enter/exit.

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Button } from "@/components/ui/Button";

export interface SwapReasonOption {
  readonly key: string;
  readonly label: string;
}

/**
 * The six categorical reasons offered to the user, in display order.
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
}

export function SwapReasonModal({
  isOpen,
  swappedFromVenueName,
  onSubmit,
  onSkip,
}: SwapReasonModalProps) {
  // Keep a stable ref to the latest onSkip so the Esc handler can
  // depend only on isOpen — re-binding keydown on every render of
  // the parent would be wasteful.
  const onSkipRef = useRef(onSkip);
  useEffect(() => {
    onSkipRef.current = onSkip;
  }, [onSkip]);

  // Esc dismissal — counts as skip.
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onSkipRef.current();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen]);

  // Body scroll lock when open. Saves the prior overflow value so
  // nested modals (or other consumers) don't get clobbered.
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
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
    </AnimatePresence>
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
