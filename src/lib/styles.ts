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
  tone: PillTone = "burgundy"
): string {
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
