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
      className={`w-full text-left rounded-xl px-4 py-3 transition-all ${
        selected
          ? "border-l-4 border-l-burgundy border-y border-r border-y-burgundy/20 border-r-burgundy/20 bg-burgundy/5"
          : "border border-border bg-white hover:border-burgundy/30"
      }`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.04 }}
      whileTap={{ scale: 0.98 }}
    >
      <span className="font-sans text-sm font-medium text-charcoal">
        {label}
      </span>
      {description && (
        <span className="font-sans text-xs text-warm-gray ml-2">
          {description}
        </span>
      )}
    </motion.button>
  );
}
