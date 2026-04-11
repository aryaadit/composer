// Onboarding option lists.
//
// `CONTEXT_OPTIONS`, `DRINK_OPTIONS`, and `DIETARY_OPTIONS` are product UX
// specific to onboarding and stay hand-written here. `FAVORITE_HOODS` is
// derived from the canonical `NEIGHBORHOODS` taxonomy — adding a
// neighborhood there automatically shows up here.

import { DrinksPref } from "@/types";
import { NEIGHBORHOODS } from "@/config/neighborhoods";

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

export const FAVORITE_HOODS = NEIGHBORHOODS.map((n) => ({
  id: n.slug,
  name: n.shortLabel,
}));
