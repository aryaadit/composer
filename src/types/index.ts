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
  neighborhoods: Neighborhood[]; // expanded storage slugs
  budget: Budget;
  vibe: Vibe;
  day: string; // ISO date "2026-04-09"
  startTime: string; // "19:00"
  endTime: string; // "22:00"
}

export interface GenerateRequestBody extends QuestionnaireAnswers {
  userPrefs?: UserPrefs;
}

// Venue shape — mirrors the `composer_venues` Supabase table exactly.
// See `supabase/migrations/20260413_venue_import_prep.sql` for the schema.
export interface Venue {
  id: string;
  name: string;

  // Primary category (granular; 56 distinct values across imported data).
  category: string;
  // Coarse grouping surfaced from Reid's "Category 2" column — good for
  // display badges ("Restaurant" / "Bar" / "Museum"). Nullable because
  // older seed rows don't have it.
  category_group: string | null;

  neighborhood: Neighborhood;

  // Address is nullable because Reid's spreadsheet doesn't have a
  // dedicated address column (street addresses lived in the internal
  // notes column, which we don't import). Nothing in the app currently
  // surfaces address, so null is acceptable.
  address: string | null;

  latitude: number;
  longitude: number;

  // Canonical stop roles used by the composer (opener / main / closer).
  stop_roles: StopRole[];
  // Path-A preservation: Reid's spreadsheet also uses `drinks`, `activity`,
  // and `coffee`. The import script maps those into `stop_roles` (e.g.
  // drinks -> [opener, closer]), but the original string is preserved here
  // for Phase 2 features that want the richer categorization.
  raw_stop_role: string | null;

  // Extended to 1-4 by the 20260413 migration. Tier 4 = $150+ / person.
  price_tier: 1 | 2 | 3 | 4;

  // Canonical vibe tags used by scoring. Normalized at import time from
  // the rich free-text taxonomy in Reid's spreadsheet (see Bucket 2 of
  // the tag-mapping audit).
  vibe_tags: string[];
  // Path-A preservation: Reid's original 81-tag-strong raw tag list
  // (including free-text flavor descriptors like `iykyk`, `grown-up`,
  // `pasta-forward`). Not used by scoring; reserved for future semantic
  // matching / embeddings work.
  raw_vibe_tags: string[];

  occasion_tags: Occasion[];

  // Tri-state: true, false, or null (unknown). Reid's data uses "unknown"
  // for 187 / 496 venues; we treat unknown as null and let the weather
  // filter skip the venue rather than assume false.
  outdoor_seating: boolean | null;

  reservation_url: string | null;
  curation_note: string;
  active: boolean;
  quality_score: number;
  curation_boost: number;
  best_before: string | null; // time like "21:00"
  best_after: string | null;

  // ── Enrichment columns (added by 20260413 migration) ─────────────
  duration_minutes: number | null;        // 60 / 120 / 180 typical
  curated_by: string | null;              // 'reid' | 'adit' | 'community'
  hours: string | null;                   // free-text, e.g. "Mon-Fri 11am-11pm"
  last_verified: string | null;           // ISO date, e.g. "2026-04-11"
  reservation_difficulty: number | null;  // 1..4
  dog_friendly: boolean | null;
  kid_friendly: boolean | null;
  wheelchair_accessible: string | null;   // 'yes' | 'no' | 'partial'
  signature_order: string | null;         // "Get the cacio e pepe"
  cash_only: boolean | null;

  // ── StopCard enrichment (added by 20260414 migration) ─────────────
  photo_url: string | null;
  awards: string[] | null;                // slugs; see src/config/awards.ts
  amex_dining: boolean | null;            // Amex Platinum Global Dining Access
  chase_sapphire: boolean | null;         // Chase Sapphire Reserve Dining
  dress_code: string | null;              // free-text, e.g. "Smart casual"
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
  // Summary walk stats. UI can surface a warning when any_over_cap is true
  // or when longest_walk_min is meaningfully high. Added 2026-04-13 alongside
  // the end-time buffer so the response has every honest time signal.
  walking: WalkingMeta;
  // True when trailing stops were dropped because their arrival would land
  // too close to the user's endTime (see LAST_START_BUFFER_MIN in the route).
  truncated_for_end_time: boolean;
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
