"use client";

// Modal for the "skip-assertions" override path. Mirrors the CLI's
// `Type 'OVERRIDE' to continue:` interaction. The route validates the
// literal string match server-side as well — UI validation alone is not
// the gate.

import { useEffect, useRef, useState } from "react";
import { buttonLabels, overrideDialogCopy } from "./syncCopy";

interface ThresholdOverrideDialogProps {
  onCancel: () => void;
  onConfirm: () => void;
}

export function ThresholdOverrideDialog({
  onCancel,
  onConfirm,
}: ThresholdOverrideDialogProps) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onCancel]);

  const valid = input === overrideDialogCopy.expectedValue;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="override-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-charcoal/50 px-4"
      onClick={onCancel}
    >
      <div
        className="bg-cream max-w-md w-full p-6 rounded-md shadow-lg border border-border"
        onClick={(e) => e.stopPropagation()}
      >
        <h3
          id="override-title"
          className="font-display text-lg text-charcoal mb-3"
        >
          {overrideDialogCopy.title}
        </h3>
        <p className="font-sans text-sm text-warm-gray mb-4 leading-relaxed">
          {overrideDialogCopy.warning}
        </p>
        <label className="block">
          <span className="font-sans text-xs text-charcoal">
            {overrideDialogCopy.prompt}
          </span>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={overrideDialogCopy.expectedValue}
            className="mt-2 w-full px-3 py-2 font-mono text-sm bg-cream border border-border rounded-md focus:border-charcoal focus:outline-none text-charcoal placeholder:text-muted"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <div className="mt-5 flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="font-sans text-sm text-warm-gray hover:text-charcoal transition-colors px-3 py-1.5"
          >
            {buttonLabels.cancel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!valid}
            className="font-sans text-sm font-medium text-cream bg-burgundy hover:bg-burgundy-light disabled:bg-muted disabled:cursor-not-allowed transition-colors px-4 py-1.5 rounded-md"
          >
            Confirm override
          </button>
        </div>
      </div>
    </div>
  );
}
