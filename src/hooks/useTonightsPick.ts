"use client";

// Client hook for Tonight's Pick. Fires a single POST to /api/daily-pick
// on mount; the route handles the seeded-roll-and-cache contract. The
// hook just exposes the response state to the home-screen card.
//
// Impression policy: the server's `was_first_view` flag drives the
// once-per-day client-side daily_pick_viewed emit. This avoids needing
// localStorage (CLAUDE.md prohibits it for analytics dedup too) and
// is honest across browsers + tabs — the source of truth is the
// composer_daily_picks.first_viewed_at column.

import { useEffect, useState } from "react";
import { EVENTS, getAnalyticsHeaders, track } from "@/lib/analytics";
import type { DailyPickResponse } from "@/app/api/daily-pick/route";

interface UseTonightsPickResult {
  data: DailyPickResponse | null;
}

export function useTonightsPick(userId: string | null): UseTonightsPickResult {
  const [data, setData] = useState<DailyPickResponse | null>(null);

  useEffect(() => {
    // Logged-out users get the unchanged splash flow per spec
    // "auth scope: authed users only in v1". Bail without a setState
    // (loading flag intentionally absent — consumer only checks for
    // a "ready" payload; missing/loading/failed all render nothing).
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/daily-pick", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...getAnalyticsHeaders(),
          },
        });
        if (!res.ok) {
          // Auth blip, 500, etc. Don't pollute analytics — the section
          // just stays empty (spec: "no error state for unrequested
          // content").
          return;
        }
        const payload = (await res.json()) as DailyPickResponse;
        if (cancelled) return;
        setData(payload);
        // Funnel impression — once per (user, date). Server's
        // was_first_view gate guarantees that across tabs / sessions /
        // browsers without needing localStorage.
        if (payload.was_first_view) {
          track(EVENTS.DAILY_PICK_VIEWED, {
            has_pick: payload.status === "ready",
            pick_date: payload.pick_date,
          });
        }
      } catch (err) {
        console.error("[tonights-pick] fetch failed:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { data };
}
