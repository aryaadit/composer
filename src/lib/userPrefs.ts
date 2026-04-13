import { UserPrefs, DrinksPref } from "@/types";
import { STORAGE_KEYS } from "@/config/storage";

const KEYS = STORAGE_KEYS.local;

// Keys that belong to user prefs (cleared by `clearUserPrefs`). Listed
// explicitly so `saved_itineraries` and `seen_coachmark` aren't swept up.
const USER_PREF_KEYS = [
  KEYS.userName,
  KEYS.userContext,
  KEYS.userDrinks,
  KEYS.userDietary,
  KEYS.userFavoriteHoods,
] as const;

export function saveUserPrefs(prefs: UserPrefs): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEYS.userName, prefs.name);
  if (prefs.context) localStorage.setItem(KEYS.userContext, prefs.context);
  if (prefs.drinks) localStorage.setItem(KEYS.userDrinks, prefs.drinks);
  if (prefs.dietary) localStorage.setItem(KEYS.userDietary, JSON.stringify(prefs.dietary));
  if (prefs.favoriteHoods)
    localStorage.setItem(KEYS.userFavoriteHoods, JSON.stringify(prefs.favoriteHoods));
}

export function getUserPrefs(): UserPrefs | null {
  if (typeof window === "undefined") return null;
  const name = localStorage.getItem(KEYS.userName);
  if (!name) return null;

  const dietaryRaw = localStorage.getItem(KEYS.userDietary);
  const hoodsRaw = localStorage.getItem(KEYS.userFavoriteHoods);

  return {
    name,
    context: localStorage.getItem(KEYS.userContext) ?? undefined,
    drinks: (localStorage.getItem(KEYS.userDrinks) as DrinksPref | null) ?? undefined,
    dietary: dietaryRaw ? safeParse<string[]>(dietaryRaw, []) : undefined,
    favoriteHoods: hoodsRaw ? safeParse<string[]>(hoodsRaw, []) : undefined,
  };
}

export function clearUserPrefs(): void {
  if (typeof window === "undefined") return;
  for (const k of USER_PREF_KEYS) localStorage.removeItem(k);
}

function safeParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
