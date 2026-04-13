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

export const CONTEXT_OPTIONS: ContextOption[] = [
  { id: "new", label: "Someone new", emoji: "👋", description: "Planning a first impression" },
  { id: "partner", label: "My partner", emoji: "❤️", description: "An ongoing thing" },
  { id: "special", label: "Something special", emoji: "🎁", description: "An occasion worth planning" },
  { id: "exploring", label: "Just exploring", emoji: "🗺️", description: "See what's out there" },
];

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
