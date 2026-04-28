// Onboarding option lists.
//
// `CONTEXT_OPTIONS`, `DRINK_OPTIONS`, and `DIETARY_OPTIONS` are product UX
// specific to onboarding and stay hand-written here.
//
// `FAVORITE_HOODS` is derived from the user-facing `NEIGHBORHOOD_GROUPS`
// (not the raw 68-slug `NEIGHBORHOODS` list) so the onboarding picker
// stays at ~11 manageable options. When favoriteHoods is eventually used
// for scoring / personalization (Phase 2), the group ids can be expanded
// to storage slugs via `expandNeighborhoodGroup()`.

import { DrinksPref } from "@/types";
import { NEIGHBORHOOD_GROUPS } from "@/config/neighborhoods";

export interface ContextOption {
  id: string;
  label: string;
  emoji: string;
  description: string;
}

// Canonical context values. These are the slugs stored in
// `composer_users.context` and mirror the questionnaire occasion
// taxonomy via `CONTEXT_TO_OCCASION` below (both locations update
// together when a value is added/removed).
//
// Emojis intentionally kept out — the text carries the meaning and
// emojis on the context cards read as AI-app-ish.
export const CONTEXT_OPTIONS: ContextOption[] = [
  { id: "dating", label: "Dating", emoji: "", description: "Meeting someone new" },
  { id: "relationship", label: "Relationship", emoji: "", description: "Nights with my partner" },
  { id: "friends", label: "Friends Night Out", emoji: "", description: "No rules" },
  { id: "family", label: "Family", emoji: "", description: "Something for everyone, kids included" },
  { id: "solo", label: "Solo", emoji: "", description: "Just me exploring" },
];

// Context → default occasion for questionnaire pre-fill. The
// questionnaire's occasion step uses the slugs from `config/occasions`
// (`first-date`, `established`, `friends`, `solo`), so we map
// onboarding context to the most natural default here.
export const CONTEXT_TO_OCCASION: Record<string, string> = {
  dating: "dating",
  relationship: "relationship",
  friends: "friends",
  family: "family",
  solo: "solo",
};

export interface DrinkOption {
  id: DrinksPref;
  label: string;
  emoji: string;
}

export const DRINK_OPTIONS: DrinkOption[] = [
  { id: "yes", label: "Yes", emoji: "🍷" },
  { id: "sometimes", label: "Sometimes", emoji: "🍺" },
  { id: "no", label: "No", emoji: "☕" },
];

export const DIETARY_OPTIONS = [
  { id: "none", label: "No restrictions" },
  { id: "vegetarian", label: "Vegetarian" },
  { id: "vegan", label: "Vegan" },
  { id: "halal", label: "Halal" },
  { id: "kosher", label: "Kosher" },
  { id: "gluten-free", label: "Gluten-free" },
];

// Derived from user-facing groups. Stored `id` values are group ids; to
// resolve to storage slugs for scoring, call `expandNeighborhoodGroup(id)`.
export const FAVORITE_HOODS = NEIGHBORHOOD_GROUPS.map((g) => ({
  id: g.id,
  name: g.label,
}));
