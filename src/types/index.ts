// Shared data shapes used across the app.
//
// Taxonomies (Occasion, Neighborhood, Budget, Vibe, StopRole) are derived
// from the canonical lists in `src/config/*`. Those configs are the single
// source of truth — adding a value means editing the config, and the type
// updates automatically.

import type { OccasionSlug } from "@/config/occasions";
import type { NeighborhoodSlug } from "@/config/neighborhoods";
import type { BudgetSlug } from "@/config/budgets";
import type { VibeSlug } from "@/config/vibes";
import type { StopRoleSlug } from "@/config/roles";

export type Occasion = OccasionSlug;
export type Neighborhood = NeighborhoodSlug;
export type Budget = BudgetSlug;
export type Vibe = VibeSlug;
export type StopRole = StopRoleSlug;

export type DrinksPref = "yes" | "sometimes" | "no";

export interface UserPrefs {
  name: string;
  context?: string;
  drinks?: DrinksPref;
  dietary?: string[];
  favoriteHoods?: string[];
}

export interface QuestionnaireAnswers {
  occasion: Occasion;
  neighborhoods: Neighborhood[];
  budget: Budget;
  vibe: Vibe;
  day: string; // ISO date "2026-04-09"
  startTime: string; // "19:00"
  endTime: string; // "22:00"
}

export interface GenerateRequestBody extends QuestionnaireAnswers {
  userPrefs?: UserPrefs;
}

export interface Venue {
  id: string;
  name: string;
  category: string;
  neighborhood: Neighborhood;
  address: string;
  latitude: number;
  longitude: number;
  stop_roles: StopRole[];
  price_tier: 1 | 2 | 3;
  vibe_tags: string[];
  occasion_tags: Occasion[];
  outdoor_seating: boolean;
  reservation_url: string | null;
  curation_note: string;
  active: boolean;
  quality_score: number;
  curation_boost: number;
  best_before: string | null; // time like "21:00"
  best_after: string | null; // time like "17:00"
}

export interface ScoredVenue extends Venue {
  score: number;
}

export interface ItineraryStop {
  role: StopRole;
  venue: Venue;
  curation_note: string; // AI-generated or DB fallback
  spend_estimate: string;
  is_fixed: boolean;
  plan_b: Venue | null;
}

export interface WalkSegment {
  from: string;
  to: string;
  distance_km: number;
  walk_minutes: number;
}

export interface WeatherInfo {
  temp_f: number;
  condition: "clear" | "rain" | "snow" | "cloudy";
  description: string;
  is_bad_weather: boolean;
}

export interface ItineraryResponse {
  header: {
    title: string;
    subtitle: string;
    occasion_tag: string;
    vibe_tag: string;
    estimated_total: string;
    weather: WeatherInfo | null;
  };
  stops: ItineraryStop[];
  walks: WalkSegment[];
  maps_url: string;
  inputs: QuestionnaireAnswers;
}

export interface SavedItinerary {
  id: string;
  savedAt: string; // ISO timestamp
  itinerary: ItineraryResponse;
}

export type StepKind = "cards" | "pills" | "day" | "time";

export interface QuestionStep {
  id: keyof QuestionnaireAnswers;
  kind: StepKind;
  question: string;
  options: { value: string; label: string; description?: string }[];
}
