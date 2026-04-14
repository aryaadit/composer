"use client";

import { useReducer, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { questionSteps } from "@/config/options";
import {
  QuestionnaireAnswers,
  GenerateRequestBody,
  Neighborhood,
} from "@/types";
import {
  expandNeighborhoodGroup,
  deriveGroupIds,
} from "@/config/neighborhoods";
import {
  questionnaireReducer,
  initialState,
  slideVariants,
} from "@/lib/questionnaireReducer";
import { getUserPrefs } from "@/lib/userPrefs";
import { STORAGE_KEYS } from "@/config/storage";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { StepLoading } from "./StepLoading";
import { NeighborhoodStep } from "./NeighborhoodStep";
import { StandardStep } from "./StandardStep";
import { DayStep } from "./DayStep";
import { TimeStep } from "./TimeStep";

export function QuestionnaireShell() {
  const router = useRouter();
  const [state, dispatch] = useReducer(questionnaireReducer, initialState);

  const submitAnswers = useCallback(
    (finalAnswers: QuestionnaireAnswers) => {
      dispatch({ type: "SET_LOADING" });
      sessionStorage.setItem(STORAGE_KEYS.session.questionnaireInputs, JSON.stringify(finalAnswers));

      const userPrefs = getUserPrefs() ?? undefined;
      const body: GenerateRequestBody = {
        ...finalAnswers,
        userPrefs,
      };

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

  const handleCardSelect = useCallback(
    (key: keyof QuestionnaireAnswers, value: string) => {
      // Deselect if tapping the already-selected option
      const currentValue = state.answers[key];
      if (currentValue === value) {
        dispatch({ type: "DESELECT", field: key });
        return;
      }
      // Card selections always advance after a brief delay
      setTimeout(() => {
        dispatch({ type: "SET_FIELD", field: key, value, advance: true });
      }, 150);
    },
    [state.answers]
  );

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

  const handleDaySelect = useCallback((dayISO: string) => {
    setTimeout(() => {
      dispatch({ type: "SET_FIELD", field: "day", value: dayISO, advance: true });
    }, 150);
  }, []);

  const handleTimeContinue = useCallback(
    (startTime: string, endTime: string) => {
      const finalAnswers = {
        ...state.answers,
        startTime,
        endTime,
      } as QuestionnaireAnswers;
      dispatch({
        type: "SET_FIELDS",
        values: { startTime, endTime },
      });
      submitAnswers(finalAnswers);
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
          <Link
            href="/"
            className="font-sans text-sm text-warm-gray hover:text-charcoal transition-colors"
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
                  options={step.options}
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

              {step.kind === "day" && (
                <DayStep
                  selectedValue={state.answers.day}
                  onSelect={handleDaySelect}
                />
              )}

              {step.kind === "time" && (
                <TimeStep
                  initialStart={state.answers.startTime}
                  initialEnd={state.answers.endTime}
                  onContinue={handleTimeContinue}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
