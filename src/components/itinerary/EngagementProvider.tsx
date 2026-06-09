"use client";

// Engagement tracking for an itinerary view. Mounted at each surface's
// page top level (fresh / saved / share). Provides two things to the
// component tree:
//
//   1. `trackEngagement(event, props)` — wraps the analytics track().
//      Increments a local engagement counter (ref, not state — no
//      re-renders). If this is the first engagement of the session,
//      attaches `time_to_first_engagement_ms` as a property on the
//      outgoing event.
//
//   2. `incrementEngagement()` — bump the counter without firing an
//      event. Used for server-initiated engagements (stop_swapped,
//      stop_added) where the actual track() call lives server-side
//      via trackServer. The client increments at INITIATION, before
//      the server resolves — failed server calls still count as
//      engagement because the user expressed intent.
//
// On unmount or beforeunload, emits:
//   - `itinerary_dwell_time { time_on_page_ms, engagement_count }`
//   - `itinerary_zero_engagement { time_on_page_ms }` (only if count === 0)
//
// Both emissions are guarded by a ref so navigation followed by hard
// close, or HMR remount, can't double-fire.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  type ReactNode,
} from "react";
import { track } from "@/lib/analytics";

export type EngagementSurface = "fresh" | "saved" | "share";

interface EngagementContextValue {
  trackEngagement: (
    eventName: string,
    properties?: Record<string, unknown>,
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
  children: ReactNode;
}

export function ItineraryEngagementProvider({
  source,
  itineraryId,
  children,
}: EngagementProviderProps) {
  // viewedAtRef is initialized inside the mount effect — performance.now()
  // is an impure function and isn't allowed during render. By the time any
  // user-driven trackEngagement() runs (onClick handlers, etc.), the mount
  // effect has already committed, so reading viewedAtRef.current is safe.
  const viewedAtRef = useRef<number>(0);
  const engagementCountRef = useRef<number>(0);
  const dwellEmittedRef = useRef<boolean>(false);

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
    track("itinerary_dwell_time", {
      source,
      itinerary_id: itineraryId,
      time_on_page_ms,
      engagement_count,
    });
    if (engagement_count === 0) {
      track("itinerary_zero_engagement", {
        source,
        itinerary_id: itineraryId,
        time_on_page_ms,
      });
    }
  }, [source, itineraryId]);

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
    (eventName: string, properties: Record<string, unknown> = {}) => {
      const wasFirst = engagementCountRef.current === 0;
      engagementCountRef.current += 1;
      const augmented = wasFirst
        ? {
            ...properties,
            time_to_first_engagement_ms: Math.round(
              performance.now() - viewedAtRef.current,
            ),
          }
        : properties;
      track(eventName, augmented);
    },
    [],
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
