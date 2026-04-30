"use client";

// Onboarding: profile collection. The user is already authenticated
// (session exists, no profile row yet). Splash screen lives on the
// root page — this component handles the profile steps only.
//
// Steps: 0 name, 1 context, 2 preferences → save → home
//
// Neighborhood step removed 2026-04-28 — see commented-out block below.

import { useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { upsertProfile } from "@/lib/auth";
import { useAuth } from "@/components/providers/AuthProvider";
import { UserPrefs, DrinksPref } from "@/types";
import { pillClass } from "@/lib/styles";
import {
  CONTEXT_OPTIONS,
  DRINK_OPTIONS,
  DIETARY_OPTIONS,
} from "@/config/onboarding";
import { NeighborhoodPicker } from "@/components/shared/NeighborhoodPicker";
import { Header } from "@/components/Header";
import { ProgressBar } from "@/components/ui/ProgressBar";

const TOTAL_STEPS = 3; // 0–2

export function OnboardingFlow() {
  const router = useRouter();
  const { user, refreshProfile } = useAuth();

  const [step, setStep] = useState(0);

  // Profile state
  const [name, setName] = useState("");
  const [contexts, setContexts] = useState<string[]>([]);
  const [drinks, setDrinks] = useState<DrinksPref | "">("");
  const [dietary, setDietary] = useState<string[]>([]);
  const [favoriteHoods, setFavoriteHoods] = useState<string[]>([]);

  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const handleNext = () => setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
  const handleBack = () => setStep((s) => Math.max(s - 1, 0));

  const toggleContext = (id: string) => {
    setContexts((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]
    );
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

  const handleFinish = async () => {
    if (!user || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);

    const prefs: UserPrefs = {
      name: name.trim() || "Friend",
      context: contexts,
      drinks: (drinks || undefined) as DrinksPref | undefined,
      dietary,
      favoriteHoods,
    };

    const saved = await upsertProfile(user.id, prefs);
    if (saved) {
      await refreshProfile();
      router.replace("/");
    } else {
      setSaving(false);
      savingRef.current = false;
    }
  };

  const showProgress = step >= 0;
  const progressSteps = TOTAL_STEPS;

  if (saving) {
    return (
      <main className="flex flex-1 items-center justify-center min-h-screen bg-cream">
        <div className="text-center">
          <div className="w-6 h-6 border-2 border-charcoal border-t-transparent rounded-full animate-spin mx-auto mb-4" />
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

            {/* ── Step 1: Context (multi-select) ──────────── */}
            {step === 1 && (
              <div className="flex-1 flex flex-col justify-center">
                <h1 className="font-sans text-2xl font-medium text-charcoal mb-2">
                  What brings you here?
                </h1>
                <p className="font-sans text-sm text-warm-gray mb-8">
                  Select all that apply.
                </p>
                <div className="flex flex-col gap-2">
                  {CONTEXT_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => toggleContext(opt.id)}
                      className={`px-4 py-3 rounded-md border text-left transition-all ${
                        contexts.includes(opt.id)
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

            {/* ── Step 2: Preferences ─────────────────────── */}
            {step === 2 && (
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
                    We&apos;re building dietary filters — for now, check
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
             * uncomment this block, set TOTAL_STEPS back to 4, and adjust
             * the bottom action area step checks.
             *
             * We may surface this info differently in the future:
             *   - As a derived signal from the user's past itineraries
             *   - As a discovery filter rather than a planning input
             *   - As an optional polish step at the end of onboarding
             */}
            {/*
            {step === 3 && (
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
        {step >= 0 && step <= 1 && (
          <Button
            variant="primary"
            onClick={handleNext}
            disabled={
              (step === 0 && !name.trim()) ||
              (step === 1 && contexts.length === 0)
            }
            className="w-full"
          >
            Next →
          </Button>
        )}
        {step === 2 && (
          <Button
            variant="primary"
            onClick={() => void handleFinish()}
            className="w-full"
          >
            Let&apos;s go →
          </Button>
        )}
      </div>
    </div>
  );
}
