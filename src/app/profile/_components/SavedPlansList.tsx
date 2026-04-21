"use client";

// Saved itineraries list with inline rename and confirm-to-delete.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { getBrowserSupabase } from "@/lib/supabase/browser";
import type { SavedItinerary } from "@/types";
import type { PostgrestError } from "@supabase/supabase-js";

interface Props {
  userId: string;
}

type PlansState = {
  plans: SavedItinerary[];
  loadedFor: string | null;
};

export function SavedPlansList({ userId }: Props) {
  const [{ plans, loadedFor }, setState] = useState<PlansState>({
    plans: [],
    loadedFor: null,
  });
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const currentUser = userId;
    getBrowserSupabase()
      .from("composer_saved_itineraries")
      .select("*")
      .order("created_at", { ascending: false })
      .then(
        ({
          data,
          error,
        }: {
          data: SavedItinerary[] | null;
          error: PostgrestError | null;
        }) => {
          if (cancelled) return;
          if (error) {
            console.error("[profile] load saved plans failed:", error.message);
            setState({ plans: [], loadedFor: currentUser });
          } else {
            setState({ plans: data ?? [], loadedFor: currentUser });
          }
        }
      );
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const loading = loadedFor !== userId;

  const handleConfirm = (id: string) => setConfirmingId(id);
  const handleCancel = () => setConfirmingId(null);

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    const prevPlans = plans;
    setState((s) => ({ ...s, plans: s.plans.filter((p) => p.id !== id) }));
    setConfirmingId(null);
    const { error } = await getBrowserSupabase()
      .from("composer_saved_itineraries")
      .delete()
      .eq("id", id);
    setDeletingId(null);
    if (error) {
      console.error("[profile] delete failed:", error.message);
      setState((s) => ({ ...s, plans: prevPlans }));
    }
  };

  const handleRenamed = useCallback(
    (id: string, customName: string | null) => {
      setState((s) => ({
        ...s,
        plans: s.plans.map((p) =>
          p.id === id ? { ...p, custom_name: customName } : p
        ),
      }));
    },
    []
  );

  return (
    <section className="mb-10">
      <h2 className="font-sans text-xs tracking-widest uppercase text-muted mb-5">
        Saved itineraries
      </h2>

      {loading ? (
        <p className="font-sans text-sm text-muted py-8">Loading...</p>
      ) : plans.length === 0 ? (
        <div className="py-8 border-t border-border">
          <p className="font-sans text-sm text-muted">
            No saved nights yet. Generate one and tap Save.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-border border-t border-border">
          {plans.map((plan) => (
            <PlanRow
              key={plan.id}
              plan={plan}
              confirming={confirmingId === plan.id}
              deleting={deletingId === plan.id}
              onAskDelete={() => handleConfirm(plan.id)}
              onConfirmDelete={() => void handleDelete(plan.id)}
              onCancelDelete={handleCancel}
              onRenamed={handleRenamed}
            />
          ))}
        </div>
      )}
    </section>
  );
}

interface PlanRowProps {
  plan: SavedItinerary;
  confirming: boolean;
  deleting: boolean;
  onAskDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  onRenamed: (id: string, customName: string | null) => void;
}

function PlanRow({
  plan,
  confirming,
  deleting,
  onAskDelete,
  onConfirmDelete,
  onCancelDelete,
  onRenamed,
}: PlanRowProps) {
  const displayName = plan.custom_name || plan.title || "Saved night";
  const date = new Date(plan.created_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

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
    if (newName === (plan.custom_name || plan.title || "Saved night")) {
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
      if (res.ok) {
        onRenamed(plan.id, newName);
      }
    } catch {
      // silently fail — name stays as-is
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
              className="shrink-0 text-muted hover:text-charcoal transition-colors opacity-0 group-hover:opacity-100"
            >
              <PencilIcon />
            </button>
          </Link>
        )}
        {!editing && plan.subtitle && (
          <div className="font-sans text-sm text-warm-gray mt-0.5">
            {plan.subtitle}
          </div>
        )}
        <div className="font-sans text-xs text-muted mt-1">Saved {date}</div>
      </div>

      {confirming ? (
        <div className="flex items-center gap-2 font-sans text-xs shrink-0 pt-1">
          <span className="text-muted">Remove?</span>
          <button
            type="button"
            onClick={onConfirmDelete}
            disabled={deleting}
            className="font-medium text-burgundy hover:text-burgundy-light transition-colors disabled:text-muted"
          >
            Yes
          </button>
          <span aria-hidden className="text-muted">
            ·
          </span>
          <button
            type="button"
            onClick={onCancelDelete}
            disabled={deleting}
            className="text-muted hover:text-charcoal transition-colors"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={onAskDelete}
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
