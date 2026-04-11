import { DrinksPref } from "@/types";

export interface ContextOption {
  id: string;
  label: string;
  emoji: string;
  description: string;
}

export const CONTEXT_OPTIONS: ContextOption[] = [
  { id: "new", label: "Someone new", emoji: "👋", description: "Planning a first impression" },
  { id: "partner", label: "My partner", emoji: "❤️", description: "Keeping the spark alive" },
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

export const FAVORITE_HOODS = [
  { id: "west-village", name: "West Village" },
  { id: "east-village-les", name: "East Village / LES" },
  { id: "soho-nolita", name: "SoHo / Nolita" },
  { id: "williamsburg", name: "Williamsburg" },
  { id: "midtown-hells-kitchen", name: "Midtown / HK" },
  { id: "upper-west-side", name: "Upper West Side" },
];
