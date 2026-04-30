// Canonical name validation + profanity detection.
//
// Used at every entry point where a user-submitted name is written to
// the database. Currently: onboarding completion via upsertProfile.
// Centralized here so future entry points (e.g., profile name edit) can
// reuse the same rules without drift.

import {
  RegExpMatcher,
  englishDataset,
  englishRecommendedTransformers,
} from "obscenity";

const matcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
});

/**
 * Return true if the string contains profanity, slurs, or obvious
 * leet-speak variants ("b!tch", "sh1t", etc.).
 *
 * @param s - Raw input string. Empty/null returns false (no profanity).
 */
export function containsProfanity(s: string): boolean {
  if (!s) return false;
  return matcher.hasMatch(s);
}

/**
 * Validate a user's display name. Returns a user-facing error string,
 * or null if the name is valid.
 *
 * Rules:
 *   - required (non-empty after trim)
 *   - minimum 2 characters (after trim)
 *   - no profanity (matched by obscenity, l33t-speak aware)
 *
 * @param raw - User input. Whitespace is trimmed before checks.
 * @returns Error message for display, or null if valid.
 */
export function validateName(raw: string): string | null {
  const trimmed = (raw ?? "").trim();
  if (trimmed.length === 0) return "Name is required";
  if (trimmed.length < 2) return "Name must be at least 2 characters";
  if (containsProfanity(trimmed)) return "Please choose a different name";
  return null;
}
