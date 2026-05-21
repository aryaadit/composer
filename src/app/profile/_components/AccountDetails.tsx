"use client";

// Inline-editable profile fields backed by `composer_users`. Each field has
// its own local edit state (via `useFieldEditor`) so individual saves
// feel independent and a mistake on one doesn't block the others.

import {
  DRINK_OPTIONS,
  DIETARY_OPTIONS,
} from "@/config/onboarding";
import {
  FieldShell,
  EditActions,
  SavedIndicator,
  useFieldEditor,
  pillClass,
  sameArray,
} from "./FieldPrimitives";
import { SinglePillSelectField } from "./SinglePillSelectField";
import type { ComposerUser } from "@/types";

interface Props {
  profile: ComposerUser;
  userId: string;
  refreshProfile: () => Promise<void>;
}

export function AccountDetails({ profile, userId, refreshProfile }: Props) {
  // Name + email have moved up into ProfileHeader as read-only identity
  // info. Everything remaining here is editable, so there's no visible
  // "Account" heading — the fields speak for themselves.
  //
  // "What brings you here?" (Context) field removed 2026-05-20 — the
  // composer_users.context column is retained but no longer surfaced.
  return (
    <section className="mb-8">
      <div className="flex flex-col divide-y divide-border">
        <div className="pb-4">
          <DrinksField profile={profile} userId={userId} onSaved={refreshProfile} />
        </div>
        <div className="pt-4 pb-4">
          <DietaryField profile={profile} userId={userId} onSaved={refreshProfile} />
        </div>
      </div>
    </section>
  );
}

interface FieldProps {
  profile: ComposerUser;
  userId: string;
  onSaved: () => Promise<void>;
}

function DrinksField({ profile, userId, onSaved }: FieldProps) {
  return (
    <SinglePillSelectField
      label="Drinks"
      column="drinks"
      options={DRINK_OPTIONS}
      initial={profile.drinks ?? null}
      userId={userId}
      onSaved={onSaved}
    />
  );
}

function DietaryField({ profile, userId, onSaved }: FieldProps) {
  const f = useFieldEditor<string[]>(profile.dietary, userId, onSaved);
  const canSave = !sameArray(f.draft, profile.dietary);

  // "No restrictions" is mutually exclusive — picking it clears the rest,
  // and picking anything else clears "none". Matches onboarding's rule.
  const toggle = (id: string) => {
    f.setDraft((prev) => {
      if (id === "none") return prev.includes("none") ? [] : ["none"];
      const without = prev.filter((d) => d !== "none");
      return without.includes(id)
        ? without.filter((d) => d !== id)
        : [...without, id];
    });
  };

  const displayLabel =
    profile.dietary.length === 0
      ? "Not set"
      : profile.dietary
          .map((id) => DIETARY_OPTIONS.find((o) => o.id === id)?.label ?? id)
          .join(", ");

  return (
    <FieldShell label="Dietary" editing={f.editing} onEdit={f.beginEdit}>
      {f.editing ? (
        <>
          <div className="flex flex-wrap gap-2">
            {DIETARY_OPTIONS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => toggle(opt.id)}
                className={pillClass(
                  f.draft.includes(opt.id),
                  opt.id === "none" ? "charcoal" : "burgundy"
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <EditActions
            onSave={() => void f.save("dietary", f.draft)}
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

