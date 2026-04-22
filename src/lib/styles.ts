// Shared Tailwind class builders. Extracted here so pill-selection UI
// (onboarding, profile editor, questionnaire neighborhood picker) uses
// the same visual treatment without duplicating the class string.

export type PillTone = "burgundy" | "charcoal";

/**
 * Compute the Tailwind class string for a selectable pill. Selected
 * pills are pure fill with no visible border; unselected pills keep a
 * 1px border for shape.
 *
 * @param selected  Whether the pill is currently active.
 * @param tone      Fill color when selected. `"charcoal"` is used for
 *                  neutral default choices like "No restrictions".
 */
export function pillClass(
  selected: boolean,
  toneOrDisabled: PillTone | boolean = "burgundy",
  disabled?: boolean
): string {
  // Support two call signatures:
  //   pillClass(selected)
  //   pillClass(selected, tone)
  //   pillClass(selected, disabled)       — boolean second arg
  //   pillClass(selected, tone, disabled)
  let tone: PillTone = "burgundy";
  let isDisabled = false;

  if (typeof toneOrDisabled === "boolean") {
    isDisabled = toneOrDisabled;
  } else {
    tone = toneOrDisabled;
    isDisabled = disabled ?? false;
  }

  if (isDisabled && !selected) {
    return "px-4 py-2 rounded-full text-sm font-sans font-medium transition-all border bg-cream border-border text-muted cursor-not-allowed";
  }

  const fill =
    tone === "charcoal"
      ? "bg-charcoal text-cream border-transparent"
      : "bg-burgundy text-cream border-transparent";
  return `px-4 py-2 rounded-full text-sm font-sans font-medium transition-all border ${
    selected
      ? fill
      : "bg-cream border-border text-charcoal hover:border-charcoal/40"
  }`;
}
