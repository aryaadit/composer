"use client";

// Shared primitives for the inline-editable profile fields.
//
// Each field on the profile page has the same skeleton — label row with
// a pencil toggle, an edit mode with Save/Cancel, a brief "Saved" flash
// after success. Pulling those bits here keeps the individual field
// components focused on their own value shape.

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { getBrowserSupabase } from "@/lib/supabase/browser";

export type PillTone = "burgundy" | "charcoal";

export function pillClass(
  selected: boolean,
  tone: PillTone = "burgundy"
): string {
  const fill =
    tone === "charcoal"
      ? "bg-charcoal text-cream border-transparent"
      : "bg-burgundy text-cream border-transparent";
  return `px-4 py-2 rounded-full text-sm font-sans font-medium transition-all border ${
    selected
      ? fill
      : "bg-cream border-border text-charcoal hover:border-charcoal/40"
  }`;
}

export function sameArray(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

export function PencilIcon() {
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
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  );
}

interface FieldShellProps {
  label: string;
  editing: boolean;
  onEdit: () => void;
  children: React.ReactNode;
}

export function FieldShell({
  label,
  editing,
  onEdit,
  children,
}: FieldShellProps) {
  // Pencil is always rendered so the label row never shifts. While
  // editing it stays in place but dims and disables — the edit action
  // is the Save/Cancel pair below, clicking the pencil again would be
  // confusing. Keeping the layout stable is the whole point.
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <label className="font-sans text-xs tracking-widest uppercase text-muted">
          {label}
        </label>
        <button
          type="button"
          onClick={onEdit}
          disabled={editing}
          aria-label={`Edit ${label.toLowerCase()}`}
          className={`transition-opacity ${
            editing
              ? "opacity-30 cursor-default text-muted"
              : "text-muted hover:text-charcoal"
          }`}
        >
          <PencilIcon />
        </button>
      </div>
      {children}
    </div>
  );
}

/**
 * 2-second "Saved" acknowledgement rendered in the same vertical slot
 * that EditActions occupies during edit mode. Fade in/out via
 * AnimatePresence so it doesn't pop. Mounted by each field's view
 * branch — never in the label row.
 */
export function SavedIndicator({ show }: { show: boolean }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="saved"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="mt-3 font-sans text-xs text-muted"
        >
          Saved
        </motion.div>
      )}
    </AnimatePresence>
  );
}

interface EditActionsProps {
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  canSave?: boolean;
  error?: string | null;
}

export function EditActions({
  onSave,
  onCancel,
  saving,
  canSave = true,
  error,
}: EditActionsProps) {
  return (
    <div className="flex items-center gap-3 mt-3">
      <button
        type="button"
        onClick={onSave}
        disabled={saving || !canSave}
        className="font-sans text-sm font-medium text-burgundy hover:text-burgundy-light transition-colors disabled:text-muted disabled:cursor-not-allowed"
      >
        {saving ? "Saving…" : "Save"}
      </button>
      <button
        type="button"
        onClick={onCancel}
        disabled={saving}
        className="font-sans text-sm text-muted hover:text-charcoal transition-colors disabled:cursor-not-allowed"
      >
        Cancel
      </button>
      {error && <span className="font-sans text-xs text-charcoal">{error}</span>}
    </div>
  );
}

/**
 * Small per-field editor state container. Each profile field owns its
 * own instance so saves, drafts, and "Saved" flashes don't cross-
 * contaminate. `save(column, value)` writes one column of composer_users
 * and calls `onSaved()` (typically AuthProvider.refreshProfile) to sync
 * the context before exiting edit mode.
 */
export function useFieldEditor<T>(
  initial: T,
  userId: string,
  onSaved: () => Promise<void>
) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<T>(initial);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const beginEdit = () => {
    setDraft(initial);
    setError(null);
    setEditing(true);
  };

  const cancel = () => {
    setDraft(initial);
    setError(null);
    setEditing(false);
  };

  const save = async (column: string, value: unknown) => {
    setSaving(true);
    setError(null);
    const { error: err } = await getBrowserSupabase()
      .from("composer_users")
      .update({ [column]: value })
      .eq("id", userId);
    if (err) {
      console.error("[profile] update failed:", err.message);
      setError("Save failed");
      setSaving(false);
      return;
    }
    await onSaved();
    setSaving(false);
    setEditing(false);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2000);
  };

  return {
    editing,
    draft,
    setDraft,
    saving,
    justSaved,
    error,
    beginEdit,
    cancel,
    save,
  };
}

