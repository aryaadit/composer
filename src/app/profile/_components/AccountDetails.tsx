"use client";

// Four inline-editable fields backed by `composer_users`. Each field has
// its own local edit state (via `useFieldEditor`) so individual saves
// feel independent and a mistake on one doesn't block the others.

import {
  DRINK_OPTIONS,
  DIETARY_OPTIONS,
  FAVORITE_HOODS,
} from "@/config/onboarding";
import {
  FieldShell,
  EditActions,
  SavedIndicator,
  useFieldEditor,
  pillClass,
  sameArray,
} from "./fieldPrimitives";
import type { ComposerUser, DrinksPref } from "@/types";

interface Props {
  profile: ComposerUser;
  userId: string;
  refreshProfile: () => Promise<void>;
}

export function AccountDetails({ profile, userId, refreshProfile }: Props) {
  // Name + email have moved up into ProfileHeader as read-only identity
  // info. Everything remaining here is editable, so there's no visible
  // "Account" heading — the fields speak for themselves.
  return (
    <section className="mb-12">
      <div className="flex flex-col gap-7 divide-y divide-border">
        <div className="pb-2">
          <DrinksField profile={profile} userId={userId} onSaved={refreshProfile} />
        </div>
        <div className="pt-5 pb-2">
          <DietaryField profile={profile} userId={userId} onSaved={refreshProfile} />
        </div>
        <div className="pt-5 pb-2">
          <HoodsField profile={profile} userId={userId} onSaved={refreshProfile} />
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
  const initial = (profile.drinks as DrinksPref | null) ?? null;
  const f = useFieldEditor<DrinksPref | null>(initial, userId, onSaved);
  const canSave = f.draft !== initial;
  const displayLabel =
    DRINK_OPTIONS.find((o) => o.id === profile.drinks)?.label ?? "Not set";
  return (
    <FieldShell label="Drinks" editing={f.editing} onEdit={f.beginEdit}>
      {f.editing ? (
        <>
          <div className="flex flex-wrap gap-2">
            {DRINK_OPTIONS.map((opt) => (
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
            onSave={() => void f.save("drinks", f.draft)}
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

function HoodsField({ profile, userId, onSaved }: FieldProps) {
  const f = useFieldEditor<string[]>(profile.favorite_hoods, userId, onSaved);
  const canSave = !sameArray(f.draft, profile.favorite_hoods);

  const toggle = (id: string) => {
    f.setDraft((prev) =>
      prev.includes(id) ? prev.filter((h) => h !== id) : [...prev, id]
    );
  };

  const displayLabel =
    profile.favorite_hoods.length === 0
      ? "Not set"
      : profile.favorite_hoods
          .map((id) => FAVORITE_HOODS.find((h) => h.id === id)?.name ?? id)
          .join(", ");

  return (
    <FieldShell
      label="Favorite Neighborhoods"
      editing={f.editing}
      onEdit={f.beginEdit}
    >
      {f.editing ? (
        <>
          <div className="flex flex-wrap gap-2">
            {FAVORITE_HOODS.map((hood) => (
              <button
                key={hood.id}
                type="button"
                onClick={() => toggle(hood.id)}
                className={pillClass(f.draft.includes(hood.id))}
              >
                {hood.name}
              </button>
            ))}
          </div>
          <EditActions
            onSave={() => void f.save("favorite_hoods", f.draft)}
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
