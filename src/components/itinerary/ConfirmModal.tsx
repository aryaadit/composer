"use client";

// Post-save confirmation modal. Opens after Looks Good auto-saves;
// surfaces three actions: Add to Google Calendar, Download .ics,
// Copy share link. Esc / backdrop / X all close.
//
// Visual pattern follows VenueDetailModal + SwapReasonModal: bottom-
// sheet on mobile, centered modal on desktop, AnimatePresence enter/
// exit, body scroll lock when open.

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { ItineraryResponse } from "@/types";
import { EVENTS } from "@/lib/analytics";
import { useEngagement } from "@/components/itinerary/EngagementProvider";
import {
  buildGoogleCalendarUrl,
  buildIcsUid,
  generateIcsBlob,
} from "@/lib/calendar";

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  itinerary: ItineraryResponse;
  savedItineraryId: string;
  /** Analytics surface — "fresh_itinerary" or "saved". Threaded to
   * the calendar_added events. Defaults to "fresh_itinerary". */
  surface?: "fresh_itinerary" | "saved";
  /**
   * Current share URL (or null if not yet fetched). LooksGoodCTA owns
   * this state and prefetches in the background; we render the Google
   * Calendar anchor's href reactively from the latest value.
   */
  shareUrl?: string | null;
  /**
   * Resolver that returns the share URL — fetches if needed, dedupes
   * concurrent callers via an inflight ref in the parent. .ics and
   * copy actions await this to guarantee the URL is in hand before
   * generating output.
   */
  ensureShareUrl?: () => Promise<string | null>;
}

export function ConfirmModal({
  isOpen,
  onClose,
  itinerary,
  savedItineraryId,
  surface = "fresh_itinerary",
  shareUrl = null,
  ensureShareUrl,
}: ConfirmModalProps) {
  // Stable ref to onClose for the Esc handler — avoids re-binding on
  // every parent render.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Esc dismissal
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen]);

  // Body scroll lock
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
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            key="sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Save options"
            className="fixed inset-x-0 bottom-0 z-50 bg-cream rounded-t-2xl shadow-xl max-h-[90vh] overflow-y-auto md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:max-w-md md:w-full md:rounded-2xl md:max-h-[85vh]"
            initial={{ y: "100%", opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0 }}
            transition={{ type: "spring", damping: 30, stiffness: 280 }}
          >
            <ConfirmModalContent
              itinerary={itinerary}
              savedItineraryId={savedItineraryId}
              surface={surface}
              shareUrl={shareUrl}
              ensureShareUrl={ensureShareUrl}
              onClose={onClose}
            />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function ConfirmModalContent({
  itinerary,
  savedItineraryId,
  surface,
  shareUrl,
  ensureShareUrl,
  onClose,
}: {
  itinerary: ItineraryResponse;
  savedItineraryId: string;
  surface: "fresh_itinerary" | "saved";
  shareUrl: string | null;
  ensureShareUrl?: () => Promise<string | null>;
  onClose: () => void;
}) {
  const { trackEngagement } = useEngagement();

  const [copyState, setCopyState] = useState<"idle" | "copying" | "copied" | "error">(
    "idle",
  );

  // Reactive Google Calendar href — updates when shareUrl arrives.
  // Best-effort: if the user is fast enough to tap before the prefetch
  // resolves, the calendar event lacks the share-link footer. .ics +
  // copy await ensureShareUrl() so they're guaranteed correct.
  const googleUrl = buildGoogleCalendarUrl(itinerary, shareUrl);

  const handleGoogleClick = () => {
    // Calendar adds are real engagements — funnel through trackEngagement
    // so ComposeContext + itinerary_id auto-inject and the engagement
    // counter ticks. (savedItineraryId still travels via the auto-
    // injected itinerary_id since the provider was mounted with it.)
    trackEngagement(EVENTS.CALENDAR_ADDED, {
      provider: "google",
      surface,
    });
    // Anchor handles the navigation — no preventDefault.
  };

  const handleIcsDownload = async () => {
    // Await the share URL so the .ics description's footer is correct.
    // ensureShareUrl resolves to null if /api/share fails — generator
    // falls back to plain "Composed by Composer" footer.
    const url = ensureShareUrl ? await ensureShareUrl() : shareUrl;
    const blob = generateIcsBlob(
      itinerary,
      buildIcsUid(savedItineraryId),
      url,
    );
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    // Filename derived from the title — slugified for OS safety.
    const safeTitle = itinerary.header.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "itinerary";
    a.download = `${safeTitle}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
    trackEngagement(EVENTS.CALENDAR_ADDED, {
      provider: "ics",
      surface,
    });
  };

  const handleCopyShare = async () => {
    if (copyState === "copying" || copyState === "copied") return;
    setCopyState("copying");
    try {
      const url = ensureShareUrl ? await ensureShareUrl() : shareUrl;
      if (!url) throw new Error("no share url");
      await navigator.clipboard.writeText(url);
      trackEngagement(EVENTS.SHARE_LINK_COPIED, {
        surface: "confirm_modal",
      });
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 3000);
    } catch {
      setCopyState("error");
      setTimeout(() => setCopyState("idle"), 2500);
    }
  };

  const copyLabel =
    copyState === "copying"
      ? "Copying…"
      : copyState === "copied"
      ? "Link copied"
      : copyState === "error"
      ? "Try again"
      : "Copy share link";

  return (
    <div className="pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <div className="sticky top-0 z-10 bg-cream rounded-t-2xl pt-3 pb-2 px-6 flex items-center justify-between">
        <div className="mx-auto h-1 w-10 rounded-full bg-border md:hidden" />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-2 top-2 w-11 h-11 inline-flex items-center justify-center font-sans text-sm text-muted hover:text-charcoal transition-colors"
        >
          ✕
        </button>
      </div>

      <div className="px-6 pt-2">
        <h2 className="font-serif text-2xl font-normal text-charcoal leading-snug mb-1">
          You&apos;re set.
        </h2>
        <p className="font-sans text-sm text-muted mb-6">
          Lock it in, or send it.
        </p>

        <div className="space-y-2">
          <a
            href={googleUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={handleGoogleClick}
            className="flex items-center gap-3 w-full px-4 py-4 rounded-lg border border-border bg-transparent text-charcoal hover:border-charcoal transition-colors"
          >
            <CalendarIcon />
            <span className="flex-1 font-sans text-sm">
              Add to Google Calendar
            </span>
            <ChevronRightIcon />
          </a>

          <button
            type="button"
            onClick={handleIcsDownload}
            className="flex items-center gap-3 w-full px-4 py-4 rounded-lg border border-border bg-transparent text-charcoal hover:border-charcoal transition-colors text-left"
          >
            <DownloadIcon />
            <span className="flex-1 font-sans text-sm">
              Download .ics file
            </span>
            <ChevronRightIcon />
          </button>

          <button
            type="button"
            onClick={() => void handleCopyShare()}
            disabled={copyState === "copying"}
            className="flex items-center gap-3 w-full px-4 py-4 rounded-lg border border-border bg-transparent text-charcoal hover:border-charcoal transition-colors disabled:opacity-60 text-left"
          >
            <LinkIcon />
            <span className="flex-1 font-sans text-sm">{copyLabel}</span>
            <ChevronRightIcon />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Icons (inline SVG to avoid a dep + keep icon family consistent) ──

function CalendarIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="m7 10 5 5 5-5" />
      <path d="M12 15V3" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.72" />
      <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.72-1.72" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="text-muted"
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}
