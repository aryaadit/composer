"use client";

import { useCallback, useState } from "react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/Button";

interface Option {
  value: string;
  label: string;
}

interface NeighborhoodStepProps {
  options: Option[];
  initialSelected?: string[];
  onContinue: (selected: string[]) => void;
}

const MAX_HOODS = 3;

export function NeighborhoodStep({
  options,
  initialSelected = [],
  onContinue,
}: NeighborhoodStepProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelected));

  const handleToggle = useCallback((value: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(value)) {
        next.delete(value);
      } else if (next.size < MAX_HOODS) {
        next.add(value);
      }
      return next;
    });
  }, []);

  const handleContinue = useCallback(() => {
    if (selected.size === 0) return;
    onContinue(Array.from(selected));
  }, [selected, onContinue]);

  return (
    <div>
      <p className="text-center font-sans text-xs text-warm-gray mb-4">
        Pick up to {MAX_HOODS}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {options.map((option, i) => {
          const isSelected = selected.has(option.value);
          const isAtMax = !isSelected && selected.size >= MAX_HOODS;
          return (
            <motion.button
              key={option.value}
              onClick={() => handleToggle(option.value)}
              disabled={isAtMax}
              className={`rounded-full px-4 py-2 text-sm font-sans font-medium transition-all ${
                isSelected
                  ? "bg-burgundy text-cream"
                  : isAtMax
                  ? "bg-white border border-border text-warm-gray/50 cursor-not-allowed"
                  : "bg-white border border-border text-charcoal hover:border-burgundy/30"
              }`}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.2, delay: i * 0.03 }}
              whileTap={isAtMax ? undefined : { scale: 0.95 }}
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
