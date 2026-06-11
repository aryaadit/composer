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

// Sheet-side occasion taxonomy (entries in `venue.occasion_tags`).
// Multiple sheet slugs collapse into one UI bucket — see `OccasionBucket`
// below and the bucket-to-sheet-slugs map in `lib/scoring.ts`.
export type Occasion = OccasionSlug;

// UI-side occasion taxonomy. Three buckets the questionnaire offers;
// each maps to a set of sheet-side slugs at the scoring boundary.
// Bucket-to-slug mapping: `OCCASION_BUCKET_TO_SHEET_SLUGS` in scoring.ts.
// Bucket-to-Gemini-framing: `OCCASION_BUCKET_TO_GEMINI_FRAMING` in prompts.ts.
export type OccasionBucket = "date" | "friends" | "solo";

export type Neighborhood = NeighborhoodSlug;
// Canonical budget taxonomy (sheet-side). Wider than what the compose
// flow exposes — old saved itineraries may carry "all_out" or
// "no_preference"; saved/share views read those via `Budget`.
export type Budget = BudgetSlug;
// Narrowed budget set for the questionnaire input (Phase 1). The
// compose UI offers exactly these three; new generations always carry
// one of these. Older saves with "all_out"/"no_preference" stay typed
// as the wider `Budget` and cast at the saved-view boundary.
export type ComposeBudget = "casual" | "nice_out" | "splurge";
export type Vibe = VibeSlug;
export type StopRole = StopRoleSlug;
// TimeBlock is an INTERNAL venue-side type — venues advertise open
// hours via time_blocks/mon_blocks/etc using these values. It must NOT
// appear on QuestionnaireAnswers or GenerateRequestBody (the user
// picks a startTime instead). Boundary discipline: import TimeBlock
// from `@/lib/itinerary/time-blocks`, not from the user-input layer.
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
  /** Single canonical role OR a pool of canonical roles. Phase 2's
   * STOP_1_POOL = ["opener", "closer"] uses the pool form; main hints
   * remain the single-role form. `pickBestForRole` accepts both. */
  role: StopRole | readonly StopRole[];
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
// function. The user picks `startTime` from the COMPOSE_START_TIMES
// set; the server derives `endTime` = startTime + 5h (wrapping past
// midnight). `timeBlock` is intentionally absent — translation to
// venue-side TimeBlocks happens inside the algorithm via
// `venueOpenForWindow` / `windowCoverageFraction`.
export interface QuestionnaireAnswers {
  occasion: OccasionBucket;
  neighborhoods: Neighborhood[]; // expanded storage slugs
  budget: ComposeBudget;
  vibe: Vibe;
  day: string; // ISO date "2026-04-09"
  startTime: string; // "17:00" | "18:00" | "19:00" | "20:00" | "21:00"
  endTime: string; // server-derived: startTime + 5h (wraps past midnight)
}

// Body shape POSTed to /api/generate. Auth-derived preferences (name,
// drinks, etc.) are read server-side from the session cookie and are
// *not* part of the request body. The client posts `startTime`; the
// server derives `endTime` so the client never has to do the math.
export type GenerateRequestBody = Omit<QuestionnaireAnswers, "endTime"> & {
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
  /** Phase 10: real walking route geometry from Mapbox Directions
   * (cached server-side in composer_walking_routes, keyed by venue
   * pair). Consumed directly by ItineraryMapInner as a GeoJSON
   * LineString feature and re-encoded to Google polyline for the
   * static map's path overlay. Null when Mapbox failed at compose
   * time (cache miss + Directions outage) OR when this is a legacy
   * saved itinerary serialized before Phase 10 — callers render the
   * straight-line fallback in both cases. GeoJSON.LineString typed
   * loosely as `unknown` here so /types doesn't pull the GeoJSON
   * type dep into client bundles. */
  route_geometry?: unknown;
  /** @deprecated Pre-Phase-10 pre-baked Mapbox Static URL. Legacy
   * saved itineraries still carry this — kept as an optional field
   * so JSONB hydration doesn't error. Not consulted by any post-
   * Phase-10 render path. */
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
  maps_url: string;
  inputs: QuestionnaireAnswers;
}

// Row shape of the `composer_saved_itineraries` table. The
// authoritative start time lives in `start_time` (added 2026-06-09 as
// part of Phase 1 fidelity). `time_block` pre-dates the refactor —
// new saves write the literal "evening" to satisfy the NOT NULL
// constraint; legacy saves carry morning/afternoon/late_night/evening
// and are mapped via `startTimeFromLegacyBlock` only when `start_time`
// is null.
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
  start_time?: string | null;
  time_block: string;
  stops: ItineraryStop[];
  /** Phase 10 persistence: per-segment WalkSegment[] carrying
   * route_geometry. Optional + nullable so legacy rows (saved before
   * the 20260610 migration) keep deserializing — the read path falls
   * back to rebuildWalks(stops) which loses route_geometry. Don't
   * conflate with `walking` below: that's the WalkingMeta totals
   * (longest / total / any_over_cap / cap_min), not the segments. */
  walks?: WalkSegment[] | null;
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
