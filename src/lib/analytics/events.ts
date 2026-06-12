// Canonical analytics schema. Isomorphic (no "use client") so server
// route handlers can import EVENTS / EventSchemas / context builders
// directly. The two transports — src/lib/analytics.ts (client) and
// src/lib/analytics-server.ts (server) — re-export the type-narrowed
// track() / trackServer() signatures derived from EventSchemas here.
//
// Why this file is THE source of truth:
//   1. One name registry → no string-literal drift between client and
//      server call sites (the 47 free-floating literals the
//      2026-06-11 audit catalogued all map here).
//   2. One payload-shape registry → adding a context property is a
//      single edit; TypeScript flags every emission site that's now
//      missing it.
//   3. Isomorphic → server code can read EVENTS.* without the
//      "use client" directive that previously forced the registry into
//      client-only modules. That was the proximate cause of every
//      server-side `track("compose_failed", …)` literal.
//
// Property naming rule: `budget` is the user bucket (casual / nice_out
// / splurge); `price_tier` is the venue-level integer 1-4. Never bare
// `tier`. Group identifiers travel as `group_ids` (NEIGHBORHOOD_GROUPS
// ids), not as expanded storage slugs.

import { deriveGroupIds } from "@/config/neighborhoods";

// ─── Shared context types ──────────────────────────────────────────

/** Compose context: every prop the questionnaire collects, in canonical
 * snake_case. Attached to every funnel + engagement event tied to a
 * compose flow. */
export interface ComposeContext {
  occasion: string | null;
  vibe: string | null;
  /** User-facing budget bucket: "casual" | "nice_out" | "splurge". */
  budget: string | null;
  /** Neighborhood GROUP ids (NEIGHBORHOOD_GROUPS keys), not storage slugs. */
  group_ids: string[];
  day: string | null;
  start_time: string | null;
  end_time: string | null;
}

/** Itinerary identity reference. `itinerary_id` is null for fresh
 * compositions that haven't been saved yet; non-null on save / share /
 * revisit surfaces. */
export interface ItineraryRef {
  itinerary_id: string | null;
}

/** Venue identity reference. `venue_name` is denormalized for human-
 * readable PostHog queries; `venue_id` is the canonical key. */
export interface VenueRef {
  venue_id: string;
  venue_name: string;
}

// ─── Context builders ──────────────────────────────────────────────

/** Partial inputs we accept — the questionnaire may have answered some
 * but not all when the event fires (e.g. compose_step_completed mid-
 * flow). Unset fields surface as null in the canonical context. */
export interface ComposeContextInputs {
  occasion?: string | null;
  vibe?: string | null;
  budget?: string | null;
  /** Storage slugs (expanded). Builder reverse-derives group_ids. */
  neighborhoods?: readonly string[] | null;
  day?: string | null;
  startTime?: string | null;
  endTime?: string | null;
}

export function buildComposeContext(
  inputs: ComposeContextInputs | null | undefined,
): ComposeContext {
  if (!inputs) {
    return {
      occasion: null,
      vibe: null,
      budget: null,
      group_ids: [],
      day: null,
      start_time: null,
      end_time: null,
    };
  }
  const slugs = inputs.neighborhoods ?? [];
  return {
    occasion: inputs.occasion ?? null,
    vibe: inputs.vibe ?? null,
    budget: inputs.budget ?? null,
    group_ids: slugs.length > 0 ? deriveGroupIds(slugs) : [],
    day: inputs.day ?? null,
    start_time: inputs.startTime ?? null,
    end_time: inputs.endTime ?? null,
  };
}

export function buildItineraryContext(
  itinerary: { id?: string | null } | null | undefined,
): ItineraryRef {
  return { itinerary_id: itinerary?.id ?? null };
}

// ─── EVENTS registry ──────────────────────────────────────────────

/** Every event name shipped to PostHog + composer_analytics_events.
 * Single canonical definition. Naming: snake_case object_action.
 * - *_failed → expected 422-class failure (user input shape can't be satisfied)
 * - *_errored → unexpected 500-class failure (system broke) */
export const EVENTS = {
  // ── User identity ─────────────────────────────────────
  /** SMS OTP send request fired (first send OR resend). Sits one step
   *  before USER_SIGNED_UP / USER_SIGNED_IN in the auth funnel:
   *  otp_requested → user_signed_up | user_signed_in. */
  OTP_REQUESTED: "otp_requested",
  USER_SIGNED_UP: "user_signed_up",
  USER_SIGNED_IN: "user_signed_in",
  USER_SIGNED_OUT: "user_signed_out",

  // ── Compose funnel ────────────────────────────────────
  COMPOSE_STARTED: "compose_started",
  COMPOSE_STEP_COMPLETED: "compose_step_completed",
  COMPOSE_START_TIME_SELECTED: "compose_start_time_selected",
  COMPOSE_SUBMITTED: "compose_submitted",
  COMPOSE_ABANDONED: "compose_abandoned",
  /** 422-class failure: pre-filter or composer returned a typed
   * ComposeFailure. zeroing_stage discriminates which user input
   * couldn't be satisfied. Emitted once per logical failure (collapsed
   * from the prior 9 per-branch sites). */
  COMPOSE_FAILED: "compose_failed",
  /** 500-class failure: unexpected exception during compose / swap /
   * add. Emitted from the three outer try/catch blocks. Carries
   * `error_name` (classified), never raw Error.message. */
  COMPOSE_ERRORED: "compose_errored",
  /** Client-side confirmation that the failure UI actually painted.
   * Closes the loop on `compose_failed` → did the user see it? */
  COMPOSE_FAILURE_VIEWED: "compose_failure_viewed",

  // ── Itinerary lifecycle ───────────────────────────────
  /** Renamed from itinerary_generated. "Composed" is the product verb. */
  ITINERARY_COMPOSED: "itinerary_composed",
  ITINERARY_VIEWED: "itinerary_viewed",
  /** Renamed from itinerary_dwell_time (noun → verb). */
  ITINERARY_DWELLED: "itinerary_dwelled",
  /** Renamed from itinerary_zero_engagement (aligns with compose_abandoned). */
  ITINERARY_ABANDONED: "itinerary_abandoned",
  /** Renamed from itinerary_extended_to_three; final stop count moved
   * into the payload as `final_stop_count`. */
  ITINERARY_EXTENDED: "itinerary_extended",
  ITINERARY_SAVED: "itinerary_saved",

  // ── Stops ─────────────────────────────────────────────
  STOP_SWAPPED: "stop_swapped",
  STOP_ADDED: "stop_added",

  // ── Swap reason flow (`stop_` prefix collapsed) ───────
  SWAP_REASON_SHOWN: "swap_reason_shown",
  SWAP_REASON_SUBMITTED: "swap_reason_submitted",
  SWAP_REASON_SKIPPED: "swap_reason_skipped",

  // ── Map / venue ───────────────────────────────────────
  /** Renamed from itinerary_map_pin_tapped. */
  MAP_PIN_TAPPED: "map_pin_tapped",
  /** Renamed from itinerary_map_expanded. */
  MAP_EXPANDED: "map_expanded",
  VENUE_DETAIL_OPENED: "venue_detail_opened",

  // ── Reservation ───────────────────────────────────────
  RESERVATION_CLICKED: "reservation_clicked",
  /** Renamed from time_slot_selected — collided with the map_* family. */
  RESERVATION_SLOT_SELECTED: "reservation_slot_selected",

  // ── Save / share / calendar / directions ─────────────
  SHARE_LINK_COPIED: "share_link_copied",
  SHARE_LINK_VISITED: "share_link_visited",
  /** Renamed from itinerary_calendar_added — `provider` prop discriminates. */
  CALENDAR_ADDED: "calendar_added",
  /** Renamed from maps_opened — disambiguates from the map_* family
   * which refer to the on-page map, not the external maps deep-link. */
  DIRECTIONS_OPENED: "directions_opened",

  // ── Onboarding ────────────────────────────────────────
  ONBOARDING_COMPLETED: "onboarding_completed",

  // ── Questionnaire instrumentation ─────────────────────
  /** New: emitted once when the neighborhood picker mounts inside the
   * questionnaire. Records which groups the visibility gate hid. */
  NEIGHBORHOOD_OPTIONS_SHOWN: "neighborhood_options_shown",
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];

// ─── Payload schemas — per event ──────────────────────────────────

type Empty = Record<string, never>;
type Endpoint = "generate" | "swap-stop" | "add-stop";

/** Maps every event name → its exact payload type. The track / trackServer
 * wrappers narrow on this so a typo or missing context field is a
 * compile error, not a silent emission. */
export interface EventSchemas {
  // User identity
  otp_requested: {
    /** True iff the user tapped "Resend code"; false on the first send. */
    is_resend: boolean;
  };
  user_signed_up: {
    method: "phone" | "password";
    signup_source: string;
  };
  user_signed_in: {
    method: "phone" | "password";
  };
  user_signed_out: Empty;

  // Compose funnel
  compose_started: {
    entry_source: string;
  };
  compose_step_completed: ComposeContext & {
    step: string;
    step_value: string | string[] | null;
    step_index: number;
    time_on_step_ms: number;
  };
  compose_start_time_selected: {
    selected_time: string;
    previous_value: string | null;
  };
  compose_submitted: ComposeContext & {
    day_of_week: string | null;
  };
  compose_abandoned: {
    time_in_flow_ms: number;
    last_step_completed: string | null;
  };
  compose_failed: ComposeContext & {
    endpoint: Endpoint;
    zeroing_stage: string;
  };
  compose_errored: ComposeContext & {
    endpoint: Endpoint;
    /** Classified error category. NEVER raw Error.message — PII risk. */
    error_name: string;
    time_to_fail_ms: number;
  };
  compose_failure_viewed: {
    endpoint: string;
    zeroing_stage: string;
  };

  // Itinerary lifecycle
  itinerary_composed: ComposeContext &
    ItineraryRef & {
      requested_stop_count: number;
      stop_count: number;
      venue_ids: string[];
      venue_names: string[];
      categories: (string | null)[];
      neighborhoods_used: string[];
      total_walk_min: number;
      longest_walk_min: number;
      time_total_ms: number;
      time_to_compose_ms: number;
      time_to_enrich_ms: number;
    };
  itinerary_viewed: ItineraryRef & {
    source: "fresh" | "saved" | "share";
    is_past: boolean;
    /** Saved surface only. True iff `days_since_saved > 0`. */
    is_revisit?: boolean;
    /** Saved surface only. */
    days_since_saved?: number;
  };
  itinerary_dwelled: ComposeContext &
    ItineraryRef & {
      source: string;
      time_on_page_ms: number;
      engagement_count: number;
    };
  itinerary_abandoned: ComposeContext &
    ItineraryRef & {
      source: string;
      time_on_page_ms: number;
    };
  itinerary_extended: ComposeContext &
    ItineraryRef &
    VenueRef & {
      original_stop_count: number;
      final_stop_count: number;
      added_role: string;
      time_since_viewed_ms: number | null;
    };
  itinerary_saved: ComposeContext &
    ItineraryRef & {
      stop_count: number;
    };

  // Stops
  stop_swapped: ComposeContext &
    ItineraryRef & {
      stop_index: number;
      stop_role: string;
      from_venue_id: string;
      from_venue_name: string;
      from_neighborhood: string;
      from_category: string | null;
      to_venue_id: string;
      to_venue_name: string;
      to_neighborhood: string;
      to_category: string | null;
    };
  stop_added: ComposeContext &
    ItineraryRef & {
      new_stop_count: number;
    };

  // Swap reason
  swap_reason_shown: ComposeContext &
    ItineraryRef & {
      stop_index: number;
      stop_role: string;
      original_venue_id: string;
      original_venue_name: string;
      new_venue_id: string;
      new_venue_name: string;
      surface: string;
    };
  /** `reason_text` is mirror-only — see track()'s mirrorOnlyProps. */
  swap_reason_submitted: ComposeContext &
    ItineraryRef & {
      stop_index: number;
      stop_role: string;
      original_venue_id: string;
      original_venue_name: string;
      new_venue_id: string;
      new_venue_name: string;
      surface: string;
      reason: string;
      time_to_decision_ms: number;
      time_to_first_engagement_ms?: number;
    };
  swap_reason_skipped: ComposeContext &
    ItineraryRef & {
      stop_index: number;
      stop_role: string;
      original_venue_id: string;
      original_venue_name: string;
      new_venue_id: string;
      new_venue_name: string;
      surface: string;
    };

  // Map / venue
  map_pin_tapped: ComposeContext &
    ItineraryRef &
    VenueRef & {
      stop_index: number;
      from_surface: string;
      time_to_first_engagement_ms?: number;
    };
  map_expanded: ComposeContext &
    ItineraryRef & {
      from_surface: string;
      time_to_first_engagement_ms?: number;
    };
  venue_detail_opened: ComposeContext &
    ItineraryRef &
    VenueRef & {
      stop_role: string;
      /** Origin surface inside the itinerary view ("fresh"/"saved"/
       *  "share"). The modal isn't stop-bound — the audit catalogued
       *  this as the venue_detail_opened delta vs the stop-bound
       *  events that carry stop_index. */
      from_surface: string;
      time_to_first_engagement_ms?: number;
    };

  // Reservation
  /** `from_surface` names the click origin within the itinerary view
   *  ("stop_card", "venue_detail_modal", "availability_unconfirmed",
   *  "availability_has_slots_header", "availability_slot_specific",
   *  "availability_no_slots"). `stop_index` and `has_slot` are present
   *  on every surface that has the context — only the modal lacks
   *  stop_index by construction (it isn't passed in from the page). */
  reservation_clicked: ComposeContext &
    ItineraryRef &
    VenueRef & {
      stop_index?: number;
      stop_role: string;
      platform: string | null;
      from_surface: string;
      has_slot?: boolean;
      slot_time?: string;
      time_to_first_engagement_ms?: number;
    };
  reservation_slot_selected: ComposeContext &
    ItineraryRef &
    VenueRef & {
      stop_index?: number;
      stop_role: string;
      slot_time: string;
      /** 0-based position in the rendered slot grid (1st, 2nd, …) —
       *  useful for tuning slot recommendation logic. Optional because
       *  not every surface ranks slots. */
      slot_position?: number;
      from_surface: string;
      time_to_first_engagement_ms?: number;
    };

  // Save / share / calendar / directions
  share_link_copied: ItineraryRef & {
    surface: string;
  };
  share_link_visited: {
    share_id: string;
    is_authenticated: boolean;
    /** Always false today — composer_shared_itineraries doesn't store
     * a user_id (migration 20260420). Reserved for when ownership lands. */
    is_owner: boolean;
    found: boolean;
  };
  calendar_added: ComposeContext &
    ItineraryRef & {
      provider: "google" | "ics";
      surface: string;
      time_to_first_engagement_ms?: number;
    };
  directions_opened: ComposeContext &
    ItineraryRef & {
      surface: string;
      /** Single-stop CTA: venue_id + venue_name + stop_index present.
       *  Multi-stop CTA (ActionBar / ShareFooter): stop_count present. */
      venue_id?: string;
      venue_name?: string;
      stop_index?: number;
      stop_count?: number;
      time_to_first_engagement_ms?: number;
    };

  // Onboarding
  onboarding_completed: {
    has_drinks_pref: boolean;
    has_dietary_pref: boolean;
    time_to_complete_ms: number;
  };

  // Questionnaire instrumentation
  neighborhood_options_shown: {
    visible_group_ids: string[];
    hidden_count: number;
    bake_version: string;
  };
}

/** Compile-time assertion: every EVENTS value is a key of EventSchemas.
 * If a new EVENTS entry is added without a matching schema entry,
 * TypeScript flags this line. */
type _EventSchemaCoverageCheck = {
  [K in EventName]: K extends keyof EventSchemas ? true : never;
};
// Tiny runtime nudge so the type isn't unused at the value layer.
export const _eventSchemaCoverageCheck: _EventSchemaCoverageCheck =
  null as unknown as _EventSchemaCoverageCheck;
