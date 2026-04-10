"use client";

import { useCallback, useState } from "react";
import { motion } from "motion/react";
import Button from "@/components/ui/Button";

interface Option {
  value: string;
  label: string;
}

interface NeighborhoodStepProps {
  options: Option[];
  onContinue: (resolvedValue: string) => void;
}

export default function NeighborhoodStep({
  options,
  onContinue,
}: NeighborhoodStepProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const handleToggle = useCallback((value: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (value === "surprise-me") {
        // "Anywhere" toggles all on/off
        if (next.has("surprise-me")) {
          next.clear();
        } else {
          next.clear();
          next.add("surprise-me");
        }
        return next;
      }
      // Deselect "Anywhere" when picking specific neighborhoods
      next.delete("surprise-me");
      if (next.has(value)) {
        next.delete(value);
      } else {
        next.add(value);
      }
      return next;
    });
  }, []);

  const handleContinue = useCallback(() => {
    if (selected.size === 0) return;
    // Single neighborhood → pass directly; multiple or "Anywhere" → surprise-me
    const resolved =
      selected.has("surprise-me") || selected.size > 1
        ? "surprise-me"
        : Array.from(selected)[0];
    onContinue(resolved);
  }, [selected, onContinue]);

  return (
    <div>
      <div className="flex flex-wrap justify-center gap-2">
        {options.map((option, i) => {
          const isSelected = selected.has(option.value);
          return (
            <motion.button
              key={option.value}
              onClick={() => handleToggle(option.value)}
              className={`rounded-full px-4 py-2 text-sm font-sans font-medium transition-all ${
                isSelected
                  ? "bg-burgundy text-cream"
                  : "bg-white border border-border text-charcoal hover:border-burgundy/30"
              }`}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2, delay: i * 0.03 }}
              whileTap={{ scale: 0.95 }}
            >
              {option.label}
            </motion.button>
          );
        })}
      </div>
      <div className="flex justify-center mt-6">
        <Button
          variant="primary"
          onClick={handleContinue}
          disabled={selected.size === 0}
          className="px-10 py-3 text-sm"
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
