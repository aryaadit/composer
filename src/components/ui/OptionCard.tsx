"use client";

import { motion } from "motion/react";

interface OptionCardProps {
  label: string;
  description?: string;
  selected: boolean;
  onClick: () => void;
  index: number;
  /** When true, render dimmed + non-interactive. The disabled state
   * shows `disabledNote` (or nothing) in place of the active description
   * so the user understands why the card is dim. */
  disabled?: boolean;
  /** Short copy shown next to the label when disabled. One line, no
   * numbers, brand-voice. */
  disabledNote?: string;
}

export function OptionCard({
  label,
  description,
  selected,
  onClick,
  index,
  disabled = false,
  disabledNote,
}: OptionCardProps) {
  return (
    <motion.button
      onClick={onClick}
      disabled={disabled}
      aria-disabled={disabled}
      className={`w-full text-left rounded-md px-4 py-3 border transition-all ${
        // Audit item 5: disabled card stays dim (opacity-60 ~ matches
        // the question's intent) but the disabled NOTE renders at full
        // contrast below so it's effortlessly legible.
        disabled
          ? "border-border bg-cream/50 opacity-60 cursor-not-allowed"
          : selected
          ? "border-burgundy bg-burgundy-tint shadow-[inset_3px_0_0_var(--color-burgundy)]"
          : "border-border bg-cream hover:border-charcoal/30"
      }`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: disabled ? 0.6 : 1, y: 0 }}
      transition={{ duration: 0.25, delay: index * 0.04 }}
      whileTap={disabled ? undefined : { scale: 0.99 }}
    >
      <span className="font-sans text-sm font-medium text-charcoal">
        {label}
      </span>
      {/* Disabled cards show `disabledNote` (one line, brand-voice
          copy from the consumer) in place of the active description
          to keep the line count stable across states. Audit item 5:
          regular weight (not italic), warm-gray (not muted) so the
          message is effortlessly legible even on the dimmed card. */}
      {disabled && disabledNote ? (
        <span className="font-sans text-xs text-warm-gray ml-2">
          {disabledNote}
        </span>
      ) : description ? (
        <span className="font-sans text-xs text-muted ml-2">
          {description}
        </span>
      ) : null}
    </motion.button>
  );
}
