"use client";

// Shared row component for saved itineraries. Used by both HomeScreen
// and SavedPlansList on the profile page. Includes inline rename
// (pencil icon → text input) and confirm-to-delete.

import { useRef, useState } from "react";
import Link from "next/link";
import type { SavedItinerary } from "@/types";

interface SavedPlanRowProps {
  plan: SavedItinerary;
  /** Show subtitle line (profile page uses it, home screen doesn't). */
  showSubtitle?: boolean;
  onDelete: (id: string) => void;
  onRenamed: (id: string, customName: string | null) => void;
}

export function SavedPlanRow({
  plan,
  showSubtitle = false,
  onDelete,
  onRenamed,
}: SavedPlanRowProps) {
  const displayName = plan.custom_name || plan.title || "Saved night";
  const stops = plan.stops ?? [];
  const firstStop = stops[0];
  const date = new Date(plan.created_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  // ── Inline rename ───────────────────────────────────────────
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(displayName);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const startEditing = () => {
    setDraft(displayName);
    setEditing(true);
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
  };

  const cancelEditing = () => {
    setEditing(false);
    setDraft(displayName);
  };

  const saveRename = async () => {
    const trimmed = draft.trim();
    const newName = trimmed || null;
    if (newName === displayName) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/itineraries/${plan.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customName: newName }),
      });
      if (res.ok) onRenamed(plan.id, newName);
    } catch {
      // keep current name on failure
    }
    setSaving(false);
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      void saveRename();
    } else if (e.key === "Escape") {
      cancelEditing();
    }
  };

  // ── Confirm delete ──────────────────────────────────────────
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="py-4 flex items-start justify-between gap-4">
      <div className="flex-1 min-w-0">
        {editing ? (
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={() => void saveRename()}
            disabled={saving}
            className="w-full font-serif text-lg text-charcoal leading-snug bg-transparent border-b border-burgundy focus:outline-none disabled:opacity-50"
          />
        ) : (
          <Link
            href={`/itinerary/saved/${plan.id}`}
            className="group flex items-center gap-2"
          >
            <span className="font-serif text-lg text-charcoal leading-snug truncate group-hover:text-burgundy transition-colors">
              {displayName}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                startEditing();
              }}
              aria-label="Rename"
              className="shrink-0 text-muted hover:text-charcoal transition-colors"
            >
              <PencilIcon />
            </button>
          </Link>
        )}
        {!editing && showSubtitle && plan.subtitle && (
          <div className="font-sans text-sm text-warm-gray mt-0.5">
            {plan.subtitle}
          </div>
        )}
        <div className="font-sans text-xs text-muted mt-1">
          {firstStop?.venue?.name ?? "—"} · {stops.length} stops · saved {date}
        </div>
      </div>

      {confirming ? (
        <div className="flex items-center gap-2 font-sans text-xs shrink-0 pt-1">
          <span className="text-muted">Remove?</span>
          <button
            type="button"
            onClick={() => {
              setConfirming(false);
              onDelete(plan.id);
            }}
            className="font-medium text-burgundy hover:text-burgundy-light transition-colors"
          >
            Yes
          </button>
          <span aria-hidden className="text-muted">
            ·
          </span>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="text-muted hover:text-charcoal transition-colors"
          >
            No
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          aria-label="Remove saved plan"
          className="text-muted hover:text-burgundy transition-colors shrink-0 pt-1"
        >
          <TrashIcon />
        </button>
      )}
    </div>
  );
}

function PencilIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="m15 5 4 4" />
    </svg>
  );
}

function TrashIcon() {
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
    >
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}
