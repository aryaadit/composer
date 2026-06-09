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
import { track } from "@/lib/analytics";
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
}

export function ConfirmModal({
  isOpen,
  onClose,
  itinerary,
  savedItineraryId,
  surface = "fresh_itinerary",
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
  onClose,
}: {
  itinerary: ItineraryResponse;
  savedItineraryId: string;
  surface: "fresh_itinerary" | "saved";
  onClose: () => void;
}) {
  const { trackEngagement } = useEngagement();

  // Per-modal-session dedupe: cache the share id after the first
  // /api/share call so subsequent taps reuse it. Spec asked for
  // dedupe — this is the simplest form that doesn't need a DB column.
  const [shareIdState, setShareIdState] = useState<string | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copying" | "copied" | "error">(
    "idle",
  );

  const googleUrl = buildGoogleCalendarUrl(itinerary);

  const handleGoogleClick = () => {
    track("itinerary_calendar_added", {
      provider: "google",
      itinerary_id: savedItineraryId,
      surface,
    });
    // Anchor handles the navigation — no preventDefault.
  };

  const handleIcsDownload = () => {
    const blob = generateIcsBlob(itinerary, buildIcsUid(savedItineraryId));
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
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
    URL.revokeObjectURL(url);
    track("itinerary_calendar_added", {
      provider: "ics",
      itinerary_id: savedItineraryId,
      surface,
    });
  };

  const handleCopyShare = async () => {
    if (copyState === "copying" || copyState === "copied") return;
    setCopyState("copying");
    try {
      let id = shareIdState;
      let url: string | null = null;
      if (!id) {
        const res = await fetch("/api/share", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(itinerary),
        });
        if (!res.ok) throw new Error("share failed");
        const payload = (await res.json()) as { id: string; url: string };
        id = payload.id;
        url = payload.url;
        setShareIdState(id);
      }
      if (!url) {
        // Reuse path: rebuild the URL from the cached id + window origin.
        url = `${window.location.origin}/itinerary/share/${id}`;
      }
      await navigator.clipboard.writeText(url);
      trackEngagement("share_link_copied", {
        itinerary_id: id,
        share_method: "confirm_modal",
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
          className="absolute right-4 top-3 font-sans text-sm text-muted hover:text-charcoal transition-colors p-3 -m-2"
        >
          ✕
        </button>
      </div>

      <div className="px-6 pt-2">
        <h2 className="font-serif text-2xl font-normal text-charcoal leading-snug mb-1">
          You&apos;re set.
        </h2>
        <p className="font-sans text-sm text-muted mb-6">
          Lock it in — or send it.
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
