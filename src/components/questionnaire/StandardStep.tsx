"use client";

import OptionCard from "@/components/ui/OptionCard";

interface Option {
  value: string;
  label: string;
  description?: string;
}

interface StandardStepProps {
  options: Option[];
  selectedValue: string | undefined;
  onSelect: (value: string) => void;
}

export default function StandardStep({
  options,
  selectedValue,
  onSelect,
}: StandardStepProps) {
  return (
    <div className="flex flex-col gap-2">
      {options.map((option, i) => (
        <OptionCard
          key={option.value}
          label={option.label}
          description={option.description}
          selected={selectedValue === option.value}
          onClick={() => onSelect(option.value)}
          index={i}
        />
      ))}
    </div>
  );
}
