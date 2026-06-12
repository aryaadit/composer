"use client";

// Onboarding: profile collection. The user is already authenticated
// (session exists, no profile row yet). Splash screen lives on the
// root page — this component handles the profile steps only.
//
// Steps: 0 name, 1 preferences → save → home
//
// Context step removed 2026-05-20 — onboarding no longer collects
// "What brings you here?" because the data wasn't used for scoring or
// Gemini prompts; only fed a single-context occasion prefill on /compose.
// composer_users.context column is retained but no longer written.
//
// Neighborhood step removed 2026-04-28 — see commented-out block below.

import { useRef, useState } from "react";
// (no useEffect — startMs uses useState lazy init to capture mount time
// without violating the react-hooks/purity rule on useRef arg evaluation)
import { motion, AnimatePresence } from "motion/react";
import { useRouter } from "next/navigation";
import { EVENTS, track } from "@/lib/analytics";
import { Button } from "@/components/ui/Button";
import { upsertProfile } from "@/lib/auth";
import { useAuth } from "@/components/providers/AuthProvider";
import { UserPrefs, DrinksPref } from "@/types";
import { pillClass } from "@/lib/styles";
import {
  DRINK_OPTIONS,
  DIETARY_OPTIONS,
} from "@/config/onboarding";
import { validateName } from "@/lib/profanity";
import { NeighborhoodPicker } from "@/components/shared/NeighborhoodPicker";
import { Header } from "@/components/Header";
import { ProgressBar } from "@/components/ui/ProgressBar";

const TOTAL_STEPS = 2; // 0–1

export function OnboardingFlow() {
  const router = useRouter();
  const { user, refreshProfile } = useAuth();

  const [step, setStep] = useState(0);

  // Profile state
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [drinks, setDrinks] = useState<DrinksPref | "">("");
  const [dietary, setDietary] = useState<string[]>([]);
  const [favoriteHoods, setFavoriteHoods] = useState<string[]>([]);

  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  // Wall-clock at onboarding mount — used to compute time_to_complete_ms
  // on the onboarding_completed event. useState's lazy initializer runs
  // exactly once on mount (before paint, no effect commit needed) and the
  // value is stable across renders. Doesn't trigger re-renders because we
  // never call the setter.
  const [startMs] = useState(() => performance.now());

  const handleNext = () => setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
  const handleBack = () => setStep((s) => Math.max(s - 1, 0));

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

  const handleFinish = async () => {
    if (!user || savingRef.current) return;

    // Final defense-in-depth name check at submit. Should be unreachable
    // if the step-0 button gating works, but bypasses are possible.
    const nameErr = validateName(name);
    if (nameErr) {
      setNameError(nameErr);
      setStep(0);
      return;
    }

    savingRef.current = true;
    setSaving(true);

    const prefs: UserPrefs = {
      name: name.trim(),
      drinks: (drinks || undefined) as DrinksPref | undefined,
      dietary,
      favoriteHoods,
    };

    try {
      const saved = await upsertProfile(user.id, prefs);
      if (saved) {
        track(EVENTS.ONBOARDING_COMPLETED, {
          has_drinks_pref: !!prefs.drinks,
          has_dietary_pref: (prefs.dietary?.length ?? 0) > 0,
          time_to_complete_ms: Math.round(performance.now() - startMs),
        });
        await refreshProfile();
        router.replace("/");
      } else {
        setSaving(false);
        savingRef.current = false;
      }
    } catch (err) {
      // Validation thrown from upsertProfile — surface inline at step 0.
      setNameError(err instanceof Error ? err.message : "Couldn't save profile");
      setStep(0);
      setSaving(false);
      savingRef.current = false;
    }
  };

  const showProgress = step >= 0;
  const progressSteps = TOTAL_STEPS;

  if (saving) {
    return (
      <main className="flex flex-1 items-center justify-center min-h-screen bg-cream">
        {/* Audit item 23: role=status so screen readers announce
            that work is happening while the profile upsert is in
            flight. */}
        <div role="status" aria-live="polite" className="text-center">
          <div
            className="w-6 h-6 border-2 border-burgundy border-t-transparent rounded-full animate-spin mx-auto mb-4"
            aria-hidden
          />
          <p className="font-sans text-sm text-muted">
            Setting up your account...
          </p>
        </div>
      </main>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-cream">
      {showProgress && (
        <>
          <Header
            rightSlot={
              step > 0 && (
                <button
                  type="button"
                  onClick={handleBack}
                  className="font-sans text-sm text-warm-gray hover:text-charcoal transition-colors"
                >
                  &larr; Back
                </button>
              )
            }
          />
          <div className="px-6 w-full max-w-lg mx-auto mt-1">
            <ProgressBar currentStep={step} totalSteps={progressSteps} />
          </div>
        </>
      )}

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
            {/* ── Step 0: Name ────────────────────────────── */}
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
                  onChange={(e) => {
                    setName(e.target.value);
                    if (nameError) setNameError(null);
                  }}
                  onBlur={() => setNameError(validateName(name))}
                  placeholder="Your first name"
                  aria-label="Your first name"
                  className={`w-full px-0 py-3 text-xl font-sans bg-transparent border-b focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-burgundy/40 transition-colors text-charcoal placeholder:text-muted ${
                    nameError ? "border-burgundy" : "border-border focus:border-charcoal"
                  }`}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const err = validateName(name);
                      if (err) {
                        setNameError(err);
                        return;
                      }
                      handleNext();
                    }
                  }}
                />
                {nameError && (
                  <p
                    role="alert"
                    className="font-sans text-sm text-burgundy mt-2"
                  >
                    {nameError}
                  </p>
                )}
              </div>
            )}

            {/* ── Step 1: Preferences ─────────────────────── */}
            {step === 1 && (
              <div className="flex-1 flex flex-col pt-8">
                <h1 className="font-sans text-2xl font-medium text-charcoal mb-2">
                  A couple quick things
                </h1>
                <p className="font-sans text-sm text-warm-gray mb-8">
                  So we don&apos;t recommend anything that&apos;s not your
                  style.
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
                        className={pillClass(
                          dietary.includes(opt.id),
                          opt.id === "none" ? "charcoal" : "burgundy"
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  <p className="font-sans text-xs text-muted mt-3 italic">
                    We&apos;re building dietary filters. For now, check
                    venue menus directly.
                  </p>
                </div>
              </div>
            )}

            {/*
             * NEIGHBORHOOD STEP — TEMPORARILY DISABLED (2026-04-28)
             *
             * Removed from onboarding because users found it repetitive —
             * they pick neighborhoods again during itinerary generation,
             * and the prefill wasn't strong enough to justify the duplicate
             * effort.
             *
             * The DB column composer_users.favorite_hoods is intact and
             * the NeighborhoodPicker component is unchanged. To restore:
             * uncomment this block, bump TOTAL_STEPS by 1, and adjust
             * the bottom action area step checks. Step index in the
             * block below assumes the current 2-step shape.
             *
             * We may surface this info differently in the future:
             *   - As a derived signal from the user's past itineraries
             *   - As a discovery filter rather than a planning input
             *   - As an optional polish step at the end of onboarding
             */}
            {/*
            {step === 2 && (
              <div className="flex-1 flex flex-col pt-8">
                <h1 className="font-sans text-2xl font-medium text-charcoal mb-2">
                  Favorite neighborhoods?
                </h1>
                <p className="font-sans text-sm text-warm-gray mb-6">
                  Optional — helps us make a better plan for you.
                </p>
                <NeighborhoodPicker
                  selected={favoriteHoods}
                  onChange={setFavoriteHoods}
                  groupByBorough={false}
                  animated={false}
                />
              </div>
            )}
            */}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── Bottom action area ──────────────────────────── */}
      <div className="relative z-10 px-6 pb-10 pt-4 max-w-lg w-full mx-auto">
        {step === 0 && (
          <Button
            variant="primary"
            onClick={() => {
              const err = validateName(name);
              if (err) {
                setNameError(err);
                return;
              }
              handleNext();
            }}
            disabled={validateName(name) !== null}
            className="w-full"
          >
            Next →
          </Button>
        )}
        {step === 1 && (
          <Button
            variant="primary"
            onClick={() => void handleFinish()}
            disabled={!drinks || dietary.length === 0}
            className="w-full"
          >
            Let&apos;s go →
          </Button>
        )}
      </div>
    </div>
  );
}
