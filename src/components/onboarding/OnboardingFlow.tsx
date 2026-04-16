"use client";

// Four-step profile builder. Runs after auth (signUp or signIn) — the
// session is already live when this component renders, so the
// completion path just upserts to composer_users and routes home. No
// email field: email lives on auth.users and is captured by
// AuthScreen before onboarding begins.

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { upsertProfile } from "@/lib/auth";
import { useAuth } from "@/components/providers/AuthProvider";
import { UserPrefs, DrinksPref } from "@/types";
import {
  CONTEXT_OPTIONS,
  DRINK_OPTIONS,
  DIETARY_OPTIONS,
} from "@/config/onboarding";
import { NeighborhoodPicker } from "@/components/shared/NeighborhoodPicker";

type PillTone = "burgundy" | "charcoal";

const pillClass = (selected: boolean, tone: PillTone = "burgundy") => {
  // Selected pills are pure fill — no visible border. Unselected keeps
  // a 1px border for shape; selected uses border-transparent so the
  // outline doesn't double-up against the fill and read as a focus ring.
  const fill =
    tone === "charcoal"
      ? "bg-charcoal text-cream border-transparent"
      : "bg-burgundy text-cream border-transparent";
  return `px-4 py-2 rounded-full text-sm font-sans font-medium transition-all border ${
    selected
      ? fill
      : "bg-cream border-border text-charcoal hover:border-charcoal/40"
  }`;
};

export function OnboardingFlow() {
  const router = useRouter();
  const { user, profile, refreshProfile } = useAuth();

  // Pre-fill from any existing profile — this happens when an admin
  // hits the reset-onboarding backdoor to redo their own profile, or
  // when a partially-onboarded user returns.
  const [step, setStep] = useState(0); // 0=name, 1=context, 2=preferences, 3=neighborhoods
  const [name, setName] = useState(profile?.name ?? "");
  const [context, setContext] = useState(profile?.context ?? "");
  const [drinks, setDrinks] = useState<DrinksPref | "">(
    (profile?.drinks as DrinksPref | null) ?? ""
  );
  const [dietary, setDietary] = useState<string[]>(profile?.dietary ?? []);
  const [favoriteHoods, setFavoriteHoods] = useState<string[]>(
    profile?.favorite_hoods ?? []
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const totalSteps = 4;

  const handleNext = () => {
    if (step < totalSteps - 1) setStep(step + 1);
  };

  const handleFinish = async () => {
    if (saving || !user) return;
    setSaving(true);
    setSaveError(null);

    const prefs: UserPrefs = {
      name: name.trim() || "Friend",
      context,
      drinks: (drinks || undefined) as DrinksPref | undefined,
      dietary,
      favoriteHoods,
    };

    const result = await upsertProfile(user.id, prefs);
    if (!result) {
      setSaveError("Couldn't save your profile. Try again.");
      setSaving(false);
      return;
    }

    // AuthProvider's `profile` is stale until refetched — do that
    // before we navigate so HomeScreen mounts with the fresh row.
    await refreshProfile();
    router.replace("/");
  };

  const toggleDietary = (id: string) => {
    if (id === "none") {
      setDietary((prev) => (prev.includes("none") ? [] : ["none"]));
    } else {
      setDietary((prev) => {
        const without = prev.filter((d) => d !== "none");
        return without.includes(id)
          ? without.filter((d) => d !== id)
          : [...without, id];
      });
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-cream">
      {/* Progress dots */}
      <div className="flex items-center justify-center gap-2 pt-12 pb-6 px-6">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <div
            key={i}
            className={`h-1 rounded-full transition-all ${
              i === step
                ? "w-8 bg-charcoal"
                : i < step
                ? "w-1.5 bg-charcoal/40"
                : "w-1.5 bg-border"
            }`}
          />
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col px-6 max-w-lg w-full mx-auto">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.25 }}
            className="flex-1 flex flex-col"
          >
            {/* Step 0: Name */}
            {step === 0 && (
              <div className="flex-1 flex flex-col justify-center">
                <h1 className="font-sans text-2xl font-medium text-charcoal mb-2">
                  What should we call you?
                </h1>
                <p className="font-sans text-sm text-warm-gray mb-8">
                  Shows up on every plan we make you.
                </p>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your first name"
                  className="w-full px-0 py-3 text-xl font-sans bg-transparent border-b border-border focus:border-charcoal focus:outline-none transition-colors text-charcoal placeholder:text-muted"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && name.trim()) handleNext();
                  }}
                />
              </div>
            )}

            {/* Step 1: Context */}
            {step === 1 && (
              <div className="flex-1 flex flex-col justify-center">
                <h1 className="font-sans text-2xl font-medium text-charcoal mb-2">
                  What brings you here?
                </h1>
                <p className="font-sans text-sm text-warm-gray mb-8">
                  So we know what kind of night you&apos;re planning.
                </p>
                <div className="flex flex-col gap-2">
                  {CONTEXT_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => setContext(opt.id)}
                      className={`px-4 py-3 rounded-md border text-left transition-all ${
                        context === opt.id
                          ? "border-border bg-burgundy-tint shadow-[inset_3px_0_0_var(--color-burgundy)]"
                          : "border-border bg-cream hover:border-charcoal/30"
                      }`}
                    >
                      <div className="font-sans text-sm font-medium text-charcoal">
                        {opt.label}
                      </div>
                      <div className="font-sans text-xs text-muted mt-0.5">
                        {opt.description}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Step 2: Preferences */}
            {step === 2 && (
              <div className="flex-1 flex flex-col pt-8">
                <h1 className="font-sans text-2xl font-medium text-charcoal mb-2">
                  A couple quick things
                </h1>
                <p className="font-sans text-sm text-warm-gray mb-8">
                  So we don&apos;t recommend anything that&apos;s not your style.
                </p>

                <div className="mb-8">
                  <h3 className="font-sans text-xs tracking-widest uppercase text-muted mb-3">
                    Do you drink?
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {DRINK_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        onClick={() => setDrinks(opt.id)}
                        className={pillClass(drinks === opt.id)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="font-sans text-xs tracking-widest uppercase text-muted mb-3">
                    Any dietary restrictions?
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {DIETARY_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        onClick={() => toggleDietary(opt.id)}
                        // "No restrictions" is a default-style choice (the
                        // absence of a filter), not an active preference —
                        // render it neutral charcoal so it doesn't read
                        // as an urgent burgundy selection.
                        className={pillClass(
                          dietary.includes(opt.id),
                          opt.id === "none" ? "charcoal" : "burgundy"
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Favorite neighborhoods */}
            {step === 3 && (
              <div className="flex-1 flex flex-col pt-8">
                <h1 className="font-sans text-2xl font-medium text-charcoal mb-2">
                  Favorite neighborhoods?
                </h1>
                <p className="font-sans text-sm text-warm-gray mb-6">
                  Optional — pick a few you love or skip this.
                </p>

                <NeighborhoodPicker
                  selected={favoriteHoods}
                  onChange={setFavoriteHoods}
                  groupByBorough={false}
                  animated={false}
                />
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Bottom action area */}
      <div className="relative z-10 px-6 pb-10 pt-4 max-w-lg w-full mx-auto">
        {saveError && (
          <p className="font-sans text-xs text-charcoal mb-3 text-center">
            {saveError}
          </p>
        )}
        {step < 3 ? (
          <Button
            variant="primary"
            onClick={handleNext}
            disabled={
              (step === 0 && !name.trim()) || (step === 1 && !context)
            }
            className="w-full"
          >
            Next →
          </Button>
        ) : (
          <div className="flex gap-3">
            <Button
              variant="secondary"
              onClick={() => void handleFinish()}
              disabled={saving}
              className="flex-1"
            >
              Skip
            </Button>
            <Button
              variant="primary"
              onClick={() => void handleFinish()}
              disabled={saving}
              className="flex-1"
            >
              {saving ? "Saving…" : "Let's go"}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
