"use client";

import { motion } from "motion/react";

interface ProgressBarProps {
  currentStep: number;
  totalSteps: number;
}

export function ProgressBar({
  currentStep,
  totalSteps,
}: ProgressBarProps) {
  const progress = ((currentStep + 1) / totalSteps) * 100;

  return (
    <div className="w-full flex items-center gap-3">
      <div className="flex-1 h-0.5 bg-border rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-burgundy rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.4, ease: "easeInOut" }}
        />
      </div>
      <span className="font-sans text-[11px] text-warm-gray whitespace-nowrap">
        {currentStep + 1}/{totalSteps}
      </span>
    </div>
  );
}
