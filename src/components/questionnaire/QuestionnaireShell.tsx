"use client";

import { useEffect, useReducer, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { questionSteps } from "@/config/options";
import type {
  QuestionnaireAnswers,
  GenerateRequestBody,
  Duration,
  Neighborhood,
  Occasion,
} from "@/types";
import {
  expandNeighborhoodGroup,
  deriveGroupIds,
} from "@/config/neighborhoods";
import { CONTEXT_TO_OCCASION } from "@/config/onboarding";
import {
  questionnaireReducer,
  initialState,
  slideVariants,
} from "@/lib/questionnaireReducer";
import { STORAGE_KEYS } from "@/config/storage";
import { useAuth } from "@/components/providers/AuthProvider";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Button } from "@/components/ui/Button";
import { StepLoading } from "./StepLoading";
import { NeighborhoodStep } from "./NeighborhoodStep";
import { StandardStep } from "./StandardStep";
import { WhenStep } from "./WhenStep";

export function QuestionnaireShell() {
  const router = useRouter();
  const [state, dispatch] = useReducer(questionnaireReducer, initialState);

  // Pre-fill the occasion step from the signed-in user's saved
  // context. Runs once on mount (guarded by a ref) and only when the
  // user hasn't already picked an occasion manually — the `!occasion`
  // check respects back-nav and prior in-flight choices.
  const { profile } = useAuth();
  const prefilledOccasionRef = useRef(false);
  useEffect(() => {
    if (prefilledOccasionRef.current) return;
    if (!profile?.context) return;
    if (state.answers.occasion) {
      prefilledOccasionRef.current = true;
      return;
    }
    const occasion = CONTEXT_TO_OCCASION[profile.context];
    if (!occasion) return;
    prefilledOccasionRef.current = true;
    // Microtask hop keeps the dispatch off the synchronous effect body
    // (react-hooks/set-state-in-effect rule).
    void Promise.resolve().then(() => {
      dispatch({
        type: "SET_FIELD",
        field: "occasion",
        value: occasion as Occasion,
      });
    });
  }, [profile, state.answers.occasion]);

  const submitAnswers = useCallback(
    (body: GenerateRequestBody) => {
      dispatch({ type: "SET_LOADING" });
      sessionStorage.setItem(
        STORAGE_KEYS.session.questionnaireInputs,
        JSON.stringify(body)
      );

      // Auth-derived prefs (name, drinks, etc.) are read server-side from
      // the session cookie. Time window (startTime/endTime) is resolved
      // server-side from `duration`. Client sends day + duration, not
      // concrete times.
      fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
        .then((res) => res.json())
        .then((data) => {
          sessionStorage.setItem(STORAGE_KEYS.session.currentItinerary, JSON.stringify(data));
          router.push("/itinerary");
        })
        .catch(() => {
          router.push("/itinerary");
        });
    },
    [router]
  );

  // Card selection only updates state — no auto-advance. Every step
  // (occasion, budget, vibe) has a manual "Next →" CTA rendered in the
  // shell below. Toggling an already-selected card deselects it.
  const handleCardSelect = useCallback(
    (key: keyof QuestionnaireAnswers, value: string) => {
      const currentValue = state.answers[key];
      if (currentValue === value) {
        dispatch({ type: "DESELECT", field: key });
        return;
      }
      dispatch({ type: "SET_FIELD", field: key, value });
    },
    [state.answers]
  );

  // Generic "Next →" for any cards-kind step. Advances by re-
  // dispatching the already-stored value with `advance: true`.
  const handleCardContinue = useCallback(() => {
    const currentStep = questionSteps[state.currentStep];
    if (!currentStep) return;
    const value = state.answers[currentStep.id];
    if (!value) return;
    dispatch({
      type: "SET_FIELD",
      field: currentStep.id,
      value,
      advance: true,
    });
  }, [state.currentStep, state.answers]);

  const handleNeighborhoodContinue = useCallback((groupIds: string[]) => {
    // The picker hands us NEIGHBORHOOD_GROUPS ids; expand to storage slugs
    // (deduped) before committing to state. Downstream scoring only sees
    // slugs, so this expansion is the one and only translation point.
    const expanded = Array.from(
      new Set(groupIds.flatMap((id) => expandNeighborhoodGroup(id)))
    ) as Neighborhood[];
    dispatch({
      type: "SET_FIELD",
      field: "neighborhoods",
      value: expanded,
      advance: true,
    });
  }, []);

  const handleWhenContinue = useCallback(
    (day: string, duration: Duration) => {
      // Combined step — day and duration land together, then we submit
      // immediately. Reducer gets the update for consistency / back-nav,
      // but the fetch body is built from local values to avoid racing
      // the reducer's next render.
      dispatch({ type: "SET_FIELDS", values: { day, duration } });
      submitAnswers({
        ...(state.answers as Omit<GenerateRequestBody, "day" | "duration">),
        day,
        duration,
      });
    },
    [state.answers, submitAnswers]
  );

  if (state.status === "loading") return <StepLoading />;

  const step = questionSteps[state.currentStep];
  if (!step) return <StepLoading />;

  return (
    <div className="relative min-h-screen px-6">
      {/* Top chrome — pulled out of the centering math via absolute positioning
          so the question content can be true-centered in the viewport, not in
          the leftover space below the header + progress. */}
      <div className="absolute top-0 inset-x-0 px-6 pt-4 z-10">
        <div className="w-full max-w-lg mx-auto flex items-center justify-between mb-3">
          <Link href="/" aria-label="Composer — home" className="inline-block">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/composer-lockup.svg"
              alt="Composer"
              className="h-8 w-auto"
            />
          </Link>
          {state.currentStep > 0 ? (
            <button
              onClick={() => dispatch({ type: "BACK" })}
              className="font-sans text-sm text-warm-gray hover:text-charcoal transition-colors"
            >
              &larr; Back
            </button>
          ) : (
            <span />
          )}
        </div>
        <div className="w-full max-w-lg mx-auto">
          <ProgressBar
            currentStep={state.currentStep}
            totalSteps={questionSteps.length}
          />
        </div>
      </div>

      {/* Content — viewport-centered. Equal pt/pb so the centered content
          actually lands at viewport center, not below it. pt-24 covers the
          absolute top chrome on short viewports. */}
      <div className="min-h-screen flex flex-col justify-center items-center py-24">
        <div className="w-full max-w-lg">
          <AnimatePresence mode="wait" custom={state.direction}>
            <motion.div
              key={state.currentStep}
              custom={state.direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="w-full"
            >
              <h2 className="font-sans text-2xl font-medium text-charcoal mb-6 text-center leading-tight">
                {step.question}
              </h2>

              {step.kind === "pills" && (
                <NeighborhoodStep
                  key={`hoods-${state.currentStep}`}
                  // State stores expanded storage slugs; reverse-derive which
                  // picker groups to pre-select on back-nav.
                  initialSelected={deriveGroupIds(state.answers.neighborhoods ?? [])}
                  onContinue={handleNeighborhoodContinue}
                />
              )}

              {step.kind === "cards" && (
                <StandardStep
                  options={step.options}
                  selectedValue={
                    state.answers[step.id] as string | undefined
                  }
                  onSelect={(value) => handleCardSelect(step.id, value)}
                />
              )}

              {/* Every cards step gets a manual Next CTA. */}
              {step.kind === "cards" && (
                <div className="mt-8">
                  <Button
                    variant="primary"
                    onClick={handleCardContinue}
                    disabled={!state.answers[step.id]}
                    className="w-full"
                  >
                    Next →
                  </Button>
                </div>
              )}

              {step.kind === "when" && (
                <WhenStep
                  initialDay={state.answers.day}
                  initialDuration={state.answers.duration}
                  onContinue={handleWhenContinue}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
