"use client";

// Shared UI for any profile field whose editable form is a single-
// selection pill group over a fixed option list — Drinks and Context
// both use it. The multi-select pattern (Dietary, Favorite Hoods) is
// different enough that it stays inline in AccountDetails.

import {
  FieldShell,
  EditActions,
  SavedIndicator,
  useFieldEditor,
  pillClass,
} from "./FieldPrimitives";

interface PillOption {
  id: string;
  label: string;
}

interface SinglePillSelectFieldProps {
  label: string;
  /** Column name on composer_users that the selected id saves to. */
  column: string;
  options: readonly PillOption[];
  initial: string | null;
  userId: string;
  onSaved: () => Promise<void>;
}

export function SinglePillSelectField({
  label,
  column,
  options,
  initial,
  userId,
  onSaved,
}: SinglePillSelectFieldProps) {
  const f = useFieldEditor<string | null>(initial, userId, onSaved);
  const canSave = f.draft !== initial;
  const displayLabel =
    options.find((o) => o.id === initial)?.label ?? "Not set";

  return (
    <FieldShell label={label} editing={f.editing} onEdit={f.beginEdit}>
      {f.editing ? (
        <>
          <div className="flex flex-wrap gap-2">
            {options.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => f.setDraft(opt.id)}
                className={pillClass(f.draft === opt.id)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <EditActions
            onSave={() => void f.save(column, f.draft)}
            onCancel={f.cancel}
            saving={f.saving}
            canSave={canSave}
            error={f.error}
          />
        </>
      ) : (
        <>
          <p className="font-sans text-base text-charcoal">{displayLabel}</p>
          <SavedIndicator show={f.justSaved} />
        </>
      )}
    </FieldShell>
  );
}
