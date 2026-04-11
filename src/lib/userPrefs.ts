import { UserPrefs, DrinksPref } from "@/types";

const KEYS = {
  name: "composer_name",
  context: "composer_context",
  drinks: "composer_drinks",
  dietary: "composer_dietary",
  favoriteHoods: "composer_favorite_hoods",
} as const;

export function saveUserPrefs(prefs: UserPrefs): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEYS.name, prefs.name);
  if (prefs.context) localStorage.setItem(KEYS.context, prefs.context);
  if (prefs.drinks) localStorage.setItem(KEYS.drinks, prefs.drinks);
  if (prefs.dietary) localStorage.setItem(KEYS.dietary, JSON.stringify(prefs.dietary));
  if (prefs.favoriteHoods)
    localStorage.setItem(KEYS.favoriteHoods, JSON.stringify(prefs.favoriteHoods));
}

export function getUserPrefs(): UserPrefs | null {
  if (typeof window === "undefined") return null;
  const name = localStorage.getItem(KEYS.name);
  if (!name) return null;

  const dietaryRaw = localStorage.getItem(KEYS.dietary);
  const hoodsRaw = localStorage.getItem(KEYS.favoriteHoods);

  return {
    name,
    context: localStorage.getItem(KEYS.context) ?? undefined,
    drinks: (localStorage.getItem(KEYS.drinks) as DrinksPref | null) ?? undefined,
    dietary: dietaryRaw ? safeParse<string[]>(dietaryRaw, []) : undefined,
    favoriteHoods: hoodsRaw ? safeParse<string[]>(hoodsRaw, []) : undefined,
  };
}

export function clearUserPrefs(): void {
  if (typeof window === "undefined") return;
  for (const k of Object.values(KEYS)) localStorage.removeItem(k);
}

function safeParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
