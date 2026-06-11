"use client";

import { OptionCard } from "@/components/ui/OptionCard";

interface Option {
  value: string;
  label: string;
  description?: string;
}

interface StandardStepProps {
  options: Option[];
  selectedValue: string | undefined;
  onSelect: (value: string) => void;
  /** Option values that should render disabled (non-interactive, dim,
   * `disabledNote` shown). Today the budget step uses this to gray out
   * tiers that fail the native-composability bar for the user's
   * selected neighborhoods. */
  disabledValues?: ReadonlySet<string>;
  /** One-line brand-voice copy shown in place of the description for
   * disabled cards. Single owner across the call site so the wording
   * doesn't drift. */
  disabledNote?: string;
}

export function StandardStep({
  options,
  selectedValue,
  onSelect,
  disabledValues,
  disabledNote,
}: StandardStepProps) {
  return (
    <div className="flex flex-col gap-2">
      {options.map((option, i) => {
        const isDisabled = disabledValues?.has(option.value) ?? false;
        return (
          <OptionCard
            key={option.value}
            label={option.label}
            description={option.description}
            selected={selectedValue === option.value}
            onClick={() => {
              if (isDisabled) return;
              onSelect(option.value);
            }}
            index={i}
            disabled={isDisabled}
            disabledNote={isDisabled ? disabledNote : undefined}
          />
        );
      })}
    </div>
  );
}
