"use client";

import { motion } from "motion/react";

interface OptionCardProps {
  label: string;
  description?: string;
  selected: boolean;
  onClick: () => void;
  index: number;
}

export default function OptionCard({
  label,
  description,
  selected,
  onClick,
  index,
}: OptionCardProps) {
  return (
    <motion.button
      onClick={onClick}
      className={`w-full text-left rounded-2xl border-2 px-6 py-5 transition-colors ${
        selected
          ? "border-burgundy bg-burgundy/5"
          : "border-border bg-white hover:border-burgundy/30"
      }`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      whileTap={{ scale: 0.98 }}
    >
      <span className="block font-sans text-base font-medium text-charcoal">
        {label}
      </span>
      {description && (
        <span className="block font-sans text-sm text-warm-gray mt-1">
          {description}
        </span>
      )}
    </motion.button>
  );
}
