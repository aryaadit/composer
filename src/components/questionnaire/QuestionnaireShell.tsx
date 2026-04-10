"use client";

import { useReducer, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { questionSteps } from "@/config/options";
import { QuestionnaireAnswers } from "@/types";
import {
  questionnaireReducer,
  initialState,
  slideVariants,
} from "@/lib/questionnaireReducer";
import ProgressBar from "@/components/ui/ProgressBar";
import StepLoading from "./StepLoading";
import NeighborhoodStep from "./NeighborhoodStep";
import StandardStep from "./StandardStep";

const NEIGHBORHOOD_STEP_INDEX = 1;

export default function QuestionnaireShell() {
  const router = useRouter();
  const [state, dispatch] = useReducer(questionnaireReducer, initialState);

  const submitAnswers = useCallback(
    (finalAnswers: QuestionnaireAnswers) => {
      dispatch({ type: "SET_LOADING" });
      sessionStorage.setItem("composer_inputs", JSON.stringify(finalAnswers));

      fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(finalAnswers),
      })
        .then((res) => res.json())
        .then((data) => {
          sessionStorage.setItem("composer_itinerary", JSON.stringify(data));
          router.push("/itinerary");
        })
        .catch(() => {
          router.push("/itinerary");
        });
    },
    [router]
  );

  const handleSelect = useCallback(
    (key: string, value: string) => {
      // Deselect if tapping the already-selected option
      const currentValue = state.answers[key as keyof QuestionnaireAnswers];
      if (currentValue === value) {
        dispatch({ type: "DESELECT", key });
        return;
      }

      const isLast = state.currentStep === questionSteps.length - 1;
      if (isLast) {
        const finalAnswers = {
          ...state.answers,
          [key]: value,
        } as QuestionnaireAnswers;
        dispatch({ type: "SELECT", key, value });
        submitAnswers(finalAnswers);
        return;
      }

      // Auto-advance after brief delay so selected state is visible
      setTimeout(() => {
        dispatch({ type: "SELECT", key, value });
      }, 150);
    },
    [state.currentStep, state.answers, submitAnswers]
  );

  const handleNeighborhoodContinue = useCallback(
    (resolvedValue: string) => {
      dispatch({ type: "SELECT", key: "neighborhood", value: resolvedValue });
    },
    []
  );

  if (state.status === "loading") return <StepLoading />;

  const step = questionSteps[state.currentStep];
  if (!step) return <StepLoading />;

  const isNeighborhoodStep = state.currentStep === NEIGHBORHOOD_STEP_INDEX;

  return (
    <div className="flex flex-col min-h-screen px-6 pt-5 pb-8">
      {/* Header */}
      <div className="w-full max-w-lg mx-auto flex items-center justify-between mb-4">
        <Link
          href="/"
          className="font-serif text-sm text-warm-gray hover:text-charcoal transition-colors"
        >
          Composer
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

      {/* Progress */}
      <div className="w-full max-w-lg mx-auto mb-6">
        <ProgressBar
          currentStep={state.currentStep}
          totalSteps={questionSteps.length}
        />
      </div>

      {/* Content — vertically centered */}
      <div className="flex-1 flex items-center justify-center">
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
              <h2 className="font-serif text-2xl sm:text-3xl text-charcoal mb-6 text-center">
                {step.question}
              </h2>

              {isNeighborhoodStep ? (
                <NeighborhoodStep
                  key={`hoods-${state.currentStep}`}
                  options={step.options}
                  onContinue={handleNeighborhoodContinue}
                />
              ) : (
                <StandardStep
                  options={step.options}
                  selectedValue={state.answers[step.id]}
                  onSelect={(value) => handleSelect(step.id, value)}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
