export type Occasion =
  | "first-date"
  | "second-date"
  | "dating"
  | "established"
  | "friends"
  | "solo";

export type Neighborhood =
  | "west-village"
  | "east-village-les"
  | "soho-nolita"
  | "williamsburg"
  | "midtown-hells-kitchen"
  | "upper-west-side"
  | "surprise-me";

export type Budget = "casual" | "nice-out" | "splurge" | "no-preference";

export type Vibe =
  | "food-forward"
  | "drinks-led"
  | "activity-food"
  | "walk-explore"
  | "mix-it-up";

export type StopRole = "opener" | "main" | "closer";

export interface QuestionnaireAnswers {
  occasion: Occasion;
  neighborhood: Neighborhood;
  budget: Budget;
  vibe: Vibe;
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
  curation_note: string; // Claude-generated or DB fallback
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

export interface QuestionStep {
  id: keyof QuestionnaireAnswers;
  question: string;
  options: { value: string; label: string; description?: string }[];
}
