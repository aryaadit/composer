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

export type DrinksPref = "yes" | "sometimes" | "no";

// Client-shaped preferences as collected by the onboarding flow. This is
// what sits in React state; the canonical on-disk shape is `ComposerUser`
// which uses snake_case to match the Supabase column naming.
export interface UserPrefs {
  name: string;
  context?: string;
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
  context: string | null;
  drinks: DrinksPref | string | null;
  dietary: string[];
  favorite_hoods: string[];
  is_admin: boolean;
  created_at: string;
}

export function composerUserToPrefs(u: ComposerUser): UserPrefs {
  return {
    name: u.name,
    context: u.context ?? undefined,
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

// Venue shape — mirrors the `composer_venues` Supabase table (v2 schema).
// See `supabase/migrations/20260419_venue_schema_v2.sql`.
export interface Venue {
  id: string;
  venue_id: string;
  name: string;
  neighborhood: Neighborhood;
  category: string;
  price_tier: 1 | 2 | 3 | 4;

  // Tags (arrays). vibe_tags stores canonical scored + cross-cutting tags.
  // occasion_tags uses the 5-slug snake_case taxonomy.
  // stop_roles stores the raw 6 venue roles from the sheet.
  vibe_tags: string[];
  occasion_tags: Occasion[];
  stop_roles: VenueRole[];

  // Timing — hours (1, 2, 3), not minutes. Scoring falls back to
  // ROLE_AVG_DURATION_MIN when null.
  duration_hours: number | null;

  // Tri-state text enum — 'yes' | 'no' | 'unknown'. Weather gate
  // filters out 'yes' when conditions are bad.
  outdoor_seating: "yes" | "no" | "unknown" | null;
  reservation_difficulty: number | null; // 1..4

  // URLs
  reservation_url: string | null;
  maps_url: string | null;

  // Curation
  curation_note: string;
  awards: string | null; // single text, e.g. "Michelin Star"
  curated_by: string | null; // 'reid' | 'adit' | 'community'
  signature_order: string | null; // "Get the cacio e pepe"

  // Location
  address: string | null;
  latitude: number;
  longitude: number;

  // Status
  active: boolean;
  notes: string | null; // internal notes, not surfaced in UI
  hours: string | null; // free-text, e.g. "Mon-Fri 11am-11pm"
  last_verified: string | null; // ISO date, e.g. "2026-04-11"

  // Additional attributes
  happy_hour: string | null;
  dog_friendly: boolean | null;
  kid_friendly: boolean | null;
  wheelchair_accessible: boolean | null;
  cash_only: boolean | null;

  // Scoring — now imported from the sheet, not admin-only.
  quality_score: number; // 1-10, default 7
  curation_boost: number; // 0-2, default 0

  // Reservation platform
  reservation_platform: string | null; // 'resy' | 'opentable' | 'tock' | 'sevenrooms' | 'none'
  resy_venue_id: number | null;
  resy_slug: string | null;

  // Google Places — batch-fetched, cached in DB
  google_place_id: string | null;
  google_place_data: Record<string, unknown> | null;
  google_place_photos: string[]; // Supabase Storage paths
  google_data_updated_at: string | null;
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
