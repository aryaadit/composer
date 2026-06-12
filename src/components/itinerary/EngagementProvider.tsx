"use client";

// Engagement tracking for an itinerary view. Mounted at each surface's
// page top level (fresh / saved / share). Provides three things to the
// component tree:
//
//   1. `trackEngagement(event, props, opts?)` — typed wrapper around the
//      analytics track(). The provider injects ComposeContext +
//      itinerary_id into every emission at this single passthrough
//      point, so call sites never have to assemble the context
//      themselves. Returns void; increments a local engagement counter
//      (ref, not state — no re-renders). If this is the first
//      engagement of the session, attaches `time_to_first_engagement_ms`.
//
//   2. `incrementEngagement()` — bump the counter without firing an
//      event. Used for server-initiated engagements (stop_swapped,
//      stop_added) where the actual track() call lives server-side
//      via trackServer. The client increments at INITIATION, before
//      the server resolves — failed server calls still count as
//      engagement because the user expressed intent.
//
//   3. `getTimeSinceViewed()` — ms since the surface was viewed. Used
//      for properties like time_since_viewed_ms on extension events.
//
// On unmount or beforeunload, emits:
//   - itinerary_dwelled { time_on_page_ms, engagement_count, … context }
//   - itinerary_abandoned { time_on_page_ms, … context }  (count === 0 only)
//
// Both emissions are guarded by a ref so navigation followed by hard
// close, or HMR remount, can't double-fire.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import {
  track,
  EVENTS,
  buildComposeContext,
  type ComposeContextInputs,
  type ComposeContext,
  type EventName,
  type EventSchemas,
} from "@/lib/analytics";

export type EngagementSurface = "fresh" | "saved" | "share";

/** Fields the provider auto-injects. Call sites omit these from their
 *  `props` arg. */
type InjectedFields =
  | keyof ComposeContext
  | "itinerary_id"
  | "time_to_first_engagement_ms";

/** Per-event prop shape callers actually have to supply. */
type EngagementProps<E extends EventName> = Omit<
  EventSchemas[E],
  InjectedFields
>;

interface EngagementOptions {
  /** Mirror-only payload (free-text, etc.). Never sent to PostHog;
   *  concatenated for the Supabase mirror insert. Pass through to the
   *  underlying track() options form. */
  mirrorOnlyProps?: Record<string, unknown>;
}

interface EngagementContextValue {
  trackEngagement: <E extends EventName>(
    event: E,
    props: EngagementProps<E>,
    opts?: EngagementOptions,
  ) => void;
  incrementEngagement: () => void;
  /** Milliseconds since the itinerary surface was viewed (provider mount).
   * Returns null when called before the mount effect has committed
   * (effectively impossible from a user-driven handler). Use for
   * properties like time_since_viewed_ms on extension/save events. */
  getTimeSinceViewed: () => number | null;
}

const EngagementContext = createContext<EngagementContextValue | null>(null);

interface EngagementProviderProps {
  source: EngagementSurface;
  itineraryId: string | null;
  /** Questionnaire inputs that produced this itinerary. Used by the
   *  provider to build ComposeContext once and inject it into every
   *  engagement emission. Null on surfaces where the inputs aren't
   *  available (e.g. share view of someone else's plan) — the builder
   *  emits all-null context, which still parses cleanly. */
  composeInputs: ComposeContextInputs | null;
  children: ReactNode;
}

export function ItineraryEngagementProvider({
  source,
  itineraryId,
  composeInputs,
  children,
}: EngagementProviderProps) {
  // viewedAtRef is initialized inside the mount effect — performance.now()
  // is an impure function and isn't allowed during render. By the time any
  // user-driven trackEngagement() runs (onClick handlers, etc.), the mount
  // effect has already committed, so reading viewedAtRef.current is safe.
  const viewedAtRef = useRef<number>(0);
  const engagementCountRef = useRef<number>(0);
  const dwellEmittedRef = useRef<boolean>(false);

  // Build ComposeContext once per inputs change. The questionnaire
  // inputs are immutable for the lifetime of a single itinerary view —
  // recomputing on every emit would be wasted work, and identity
  // stability lets the useCallback hooks below take a stable dep.
  const composeContext = useMemo(
    () => buildComposeContext(composeInputs),
    [composeInputs],
  );

  const emitDwell = useCallback(() => {
    if (dwellEmittedRef.current) return;
    const time_on_page_ms = Math.round(
      performance.now() - viewedAtRef.current,
    );
    // Guard against React StrictMode dev double-mount: the first
    // cleanup fires within a few ms of mount, before any real engagement
    // is possible. Skip emits shorter than this token threshold so dev
    // doesn't pollute analytics with synthetic zero-engagement events.
    if (time_on_page_ms < 200) return;
    dwellEmittedRef.current = true;
    const engagement_count = engagementCountRef.current;
    track(EVENTS.ITINERARY_DWELLED, {
      ...composeContext,
      itinerary_id: itineraryId,
      source,
      time_on_page_ms,
      engagement_count,
    });
    if (engagement_count === 0) {
      track(EVENTS.ITINERARY_ABANDONED, {
        ...composeContext,
        itinerary_id: itineraryId,
        source,
        time_on_page_ms,
      });
    }
  }, [source, itineraryId, composeContext]);

  useEffect(() => {
    viewedAtRef.current = performance.now();
    const onBeforeUnload = () => emitDwell();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      // SPA navigation / React unmount path. emitDwell is idempotent
      // via dwellEmittedRef so this is safe even if beforeunload also
      // fires (e.g. some browsers fire it during pagehide).
      emitDwell();
    };
  }, [emitDwell]);

  const incrementEngagement = useCallback(() => {
    engagementCountRef.current += 1;
  }, []);

  const getTimeSinceViewed = useCallback((): number | null => {
    if (viewedAtRef.current === 0) return null;
    return Math.round(performance.now() - viewedAtRef.current);
  }, []);

  const trackEngagement = useCallback(
    <E extends EventName>(
      event: E,
      props: EngagementProps<E>,
      opts?: EngagementOptions,
    ) => {
      const wasFirst = engagementCountRef.current === 0;
      engagementCountRef.current += 1;
      // Build the augmented payload at the single passthrough point.
      // Order: compose context → itinerary id → caller props →
      // first-engagement timing. Caller props can never override the
      // injected context/id (deliberate — those are surface-level
      // facts, not call-site choices).
      const merged: Record<string, unknown> = {
        ...composeContext,
        itinerary_id: itineraryId,
        ...(props as Record<string, unknown>),
      };
      if (wasFirst) {
        merged.time_to_first_engagement_ms = Math.round(
          performance.now() - viewedAtRef.current,
        );
      }
      // Cast: we've assembled the same shape as EventSchemas[E] minus
      // the InjectedFields the caller could not have supplied. The
      // wrapper guarantees they're present.
      const propsForTrack = merged as EventSchemas[E];
      if (opts?.mirrorOnlyProps) {
        track(event, {
          props: propsForTrack,
          mirrorOnlyProps: opts.mirrorOnlyProps,
        });
      } else {
        track(event, propsForTrack);
      }
    },
    [composeContext, itineraryId],
  );

  return (
    <EngagementContext.Provider
      value={{ trackEngagement, incrementEngagement, getTimeSinceViewed }}
    >
      {children}
    </EngagementContext.Provider>
  );
}

export function useEngagement(): EngagementContextValue {
  const ctx = useContext(EngagementContext);
  if (!ctx) {
    throw new Error(
      "useEngagement must be used inside <ItineraryEngagementProvider>.",
    );
  }
  return ctx;
}
