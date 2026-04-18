"use client";

import { motion } from "motion/react";

interface OptionCardProps {
  label: string;
  description?: string;
  selected: boolean;
  onClick: () => void;
  index: number;
}

export function OptionCard({
  label,
  description,
  selected,
  onClick,
  index,
}: OptionCardProps) {
  return (
    <motion.button
      onClick={onClick}
      className={`w-full text-left rounded-md px-4 py-3 border transition-all ${
        selected
          ? "border-burgundy bg-burgundy-tint shadow-[inset_3px_0_0_var(--color-burgundy)]"
          : "border-border bg-cream hover:border-charcoal/30"
      }`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.04 }}
      whileTap={{ scale: 0.99 }}
    >
      <span className="font-sans text-sm font-medium text-charcoal">
        {label}
      </span>
      {description && (
        <span className="font-sans text-xs text-muted ml-2">
          {description}
        </span>
      )}
    </motion.button>
  );
}
