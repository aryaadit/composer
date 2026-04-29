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
import type { TimeBlock } from "@/lib/itinerary/time-blocks";
import type { AvailabilitySlot } from "@/lib/availability/resy";

export type Occasion = OccasionSlug;
export type Neighborhood = NeighborhoodSlug;
export type Budget = BudgetSlug;
export type Vibe = VibeSlug;
export type StopRole = StopRoleSlug;
export type { TimeBlock };

// The 6 values a venue can carry in its stop_roles column. The
// composition engine plans with 3 canonical roles (opener / main /
// closer); scoring.ts maps VenueRole → StopRole via ROLE_EXPANSION
// so venues tagged "drinks" can serve as opener OR closer.
export type VenueRole =
  | "opener"
  | "main"
  | "closer"
  | "drinks"
  | "activity"
  | "coffee";

export interface StopHint {
  role: StopRole;
  venueRoleHint?: VenueRole;
}
export type StopPattern = StopHint[];

export type DrinksPref = "yes" | "sometimes" | "no";

// Client-shaped preferences as collected by the onboarding flow. This is
// what sits in React state; the canonical on-disk shape is `ComposerUser`
// which uses snake_case to match the Supabase column naming.
export interface UserPrefs {
  name: string;
  context?: string[];
  drinks?: DrinksPref;
  dietary?: string[];
  favoriteHoods?: string[];
}

// Row shape of the `composer_users` table. `id` matches `auth.users.id`.
// `is_admin` is flipped manually in Supabase — see CLAUDE.md. The
// select * in AuthProvider's getProfile picks it up automatically.
export interface ComposerUser {
  id: string;
  name: string;
  context: string[];
  drinks: DrinksPref | string | null;
  dietary: string[];
  favorite_hoods: string[];
  is_admin: boolean;
  created_at: string;
}

export function composerUserToPrefs(u: ComposerUser): UserPrefs {
  return {
    name: u.name,
    context: u.context,
    drinks: (u.drinks as DrinksPref | null) ?? undefined,
    dietary: u.dietary,
    favoriteHoods: u.favorite_hoods,
  };
}

// Full canonical shape used by every downstream scoring/composition
// function. `startTime` and `endTime` are computed server-side from
// `timeBlock` — the client never fills them in.
export interface QuestionnaireAnswers {
  occasion: Occasion;
  neighborhoods: Neighborhood[]; // expanded storage slugs
  budget: Budget;
  vibe: Vibe;
  day: string; // ISO date "2026-04-09"
  timeBlock: TimeBlock; // "morning" | "afternoon" | "evening" | "late_night"
  startTime: string; // "17:00" — resolved server-side from timeBlock
  endTime: string; // "22:00" — resolved server-side from timeBlock
}

// Body shape POSTed to /api/generate. Auth-derived preferences (name,
// drinks, etc.) are read server-side from the session cookie and are
// *not* part of the request body. Time window is resolved on the
// server from `timeBlock`, so the client omits startTime/endTime.
export type GenerateRequestBody = Omit<
  QuestionnaireAnswers,
  "startTime" | "endTime"
> & {
  excludeVenueIds?: string[];
};

// Venue shape — mirrors `composer_venues_v2` table.
// See `supabase/migrations/20260428_composer_venues_v2.sql`.
export interface Venue {
  id: string;
  venue_id: string;
  name: string;
  neighborhood: string;
  category: string | null;
  price_tier: number | null;

  // Tags (arrays)
  vibe_tags: string[];
  occasion_tags: string[];
  stop_roles: string[];

  // Time blocks — per-day with global fallback
  time_blocks: string[];
  mon_blocks: string[];
  tue_blocks: string[];
  wed_blocks: string[];
  thu_blocks: string[];
  fri_blocks: string[];
  sat_blocks: string[];
  sun_blocks: string[];

  // Logistics
  duration_hours: number | null;
  outdoor_seating: string | null;
  reservation_difficulty: number | null;
  reservation_lead_days: number | null;
  reservation_url: string | null;
  maps_url: string | null;

  // Curation
  curation_note: string | null;
  awards: string | null;
  quality_score: number;
  curation_boost: number;
  curated_by: string | null;

  // Geo
  address: string | null;
  latitude: number;
  longitude: number;

  // Status
  active: boolean;
  notes: string | null;
  verified: boolean | null;
  hours: string | null;
  last_verified: string | null;
  last_updated: string | null;

  // Attributes
  happy_hour: string | null;
  dog_friendly: boolean | null;
  kid_friendly: boolean | null;
  wheelchair_accessible: boolean | null;
  signature_order: string | null;
  google_place_id: string | null;

  // Corner source
  corner_id: string | null;
  corner_photo_url: string | null;
  guide_count: number | null;
  source_guides: string[];
  all_neighborhoods: string[];

  // Google Places
  google_rating: number | null;
  google_review_count: number | null;
  google_types: string[];
  google_phone: string | null;
  enriched: boolean;
  business_status: string | null;

  // Photos (Supabase Storage paths keyed by google_place_id)
  image_keys: string[];

  // Reservation platform
  reservation_platform: string | null;
  resy_venue_id: number | null;
  resy_slug: string | null;

  // Timestamps
  created_at: string;
  updated_at: string;
}

export interface ScoredVenue extends Venue {
  score: number;
}

export interface StopAvailability {
  status: "has_slots" | "no_slots_in_block" | "walk_in" | "unconfirmed";
  slots: AvailabilitySlot[];
  bookingUrlBase: string | null;
  swapped: boolean;
  swappedFrom?: { venueId: string; venueName: string };
}

export interface ItineraryStop {
  role: StopRole;
  venue: Venue;
  curation_note: string; // AI-generated or DB fallback
  spend_estimate: string;
  is_fixed: boolean;
  plan_b: Venue | null;
  availability?: StopAvailability;
}

export interface WalkSegment {
  from: string;
  to: string;
  distance_km: number;
  walk_minutes: number;
  // Mapbox static image URL showing the walking route. Null when MAPBOX_TOKEN
  // is missing or Directions failed; WalkConnector then renders text-only.
  map_url?: string | null;
}

export interface WeatherInfo {
  temp_f: number;
  condition: "clear" | "rain" | "snow" | "cloudy";
  description: string;
  is_bad_weather: boolean;
}

export interface WalkingMeta {
  longest_walk_min: number;
  total_walk_min: number;
  any_over_cap: boolean;
  cap_min: number;
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
  walking: WalkingMeta;
  truncated_for_end_time: boolean;
  maps_url: string;
  inputs: QuestionnaireAnswers;
}

// Row shape of the `composer_saved_itineraries` table.
export interface SavedItinerary {
  id: string;
  user_id: string;
  custom_name: string | null;
  title: string | null;
  subtitle: string | null;
  occasion: string | null;
  neighborhoods: string[] | null;
  budget: string | null;
  vibe: string | null;
  day: string | null;
  time_block: string;
  stops: ItineraryStop[];
  walking: WalkingMeta | null;
  weather: WeatherInfo | null;
  created_at: string;
}

export type StepKind = "cards" | "pills" | "when";

export interface QuestionStep {
  id: keyof QuestionnaireAnswers;
  kind: StepKind;
  question: string;
  subtitle?: string;
  options: { value: string; label: string; description?: string }[];
}
