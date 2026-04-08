"use client";

import { motion } from "motion/react";

interface ProgressBarProps {
  currentStep: number;
  totalSteps: number;
}

export default function ProgressBar({
  currentStep,
  totalSteps,
}: ProgressBarProps) {
  const progress = ((currentStep + 1) / totalSteps) * 100;

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="flex justify-between items-center mb-2">
        <span className="font-sans text-xs text-warm-gray">
          Step {currentStep + 1} of {totalSteps}
        </span>
      </div>
      <div className="h-1 w-full bg-border rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-burgundy rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.4, ease: "easeInOut" }}
        />
      </div>
    </div>
  );
}
