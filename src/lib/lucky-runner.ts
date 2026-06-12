// Retry-orchestration for the Lucky compose path. Lives in its own
// module (not co-located in LuckyOverlay.tsx) so vitest can import
// and exercise the loop directly without spinning up React or Next's
// router. Pure async function — fetch / exclusions are injectable.

import {
  EVENTS,
  buildComposeContext,
  getAnalyticsHeaders,
  track,
} from "@/lib/analytics";
import { LUCKY } from "@/config/lucky";
import {
  composeFailure,
  isComposeFailure,
  type ComposeFailure,
} from "@/lib/itinerary/compose-failure";
import { nextEligibleStartTime, rollLuckyInputs } from "@/lib/lucky";
import { getRecentVenueIds } from "@/lib/exclusions";
import type { GenerateRequestBody, ItineraryResponse } from "@/types";

export type LuckyResult =
  | { ok: true; data: ItineraryResponse; lastBody: GenerateRequestBody }
  | { ok: false; failure: ComposeFailure };

export interface LuckyRunOpts {
  now: Date;
  userId: string | null;
  /** Notified at the start of each attempt — used by the overlay to
   *  update its in-flight attempt label without re-rendering on every
   *  state change. */
  onAttempt?: (attempt: number, body: GenerateRequestBody) => void;
  /** Injectable for tests. Defaults to global fetch. */
  fetchImpl?: typeof fetch;
  /** Injectable for tests. Defaults to the real Supabase-backed
   *  exclusions reader. */
  exclusionsImpl?: (userId: string) => Promise<string[]>;
}

export async function runLuckyRolls(opts: LuckyRunOpts): Promise<LuckyResult> {
  const fetchFn = opts.fetchImpl ?? fetch;
  const exclusionsFn = opts.exclusionsImpl ?? getRecentVenueIds;
  const excludeVenueIds = opts.userId ? await exclusionsFn(opts.userId) : [];
  const startTime = nextEligibleStartTime(opts.now);
  if (!startTime) {
    // Defensive — the button is supposed to be disabled in this case;
    // if it somehow ran anyway, fail honestly via the system stage
    // (registry copy: "Something went wrong / Give it a moment").
    return { ok: false, failure: composeFailure("system") };
  }

  let lastFailure: ComposeFailure | null = null;
  for (let attempt = 1; attempt <= LUCKY.maxAttempts; attempt++) {
    const roll = rollLuckyInputs(opts.now, startTime);
    opts.onAttempt?.(attempt, roll.body);
    // compose_submitted fires PER ATTEMPT so the funnel can see retries.
    // mode="lucky" + attempt=n distinguish from the questionnaire path
    // and from one another.
    track(EVENTS.COMPOSE_SUBMITTED, {
      ...buildComposeContext({
        ...roll.body,
        mode: "lucky",
        attempt,
      }),
      day_of_week: null,
    });
    try {
      const res = await fetchFn("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAnalyticsHeaders(),
        },
        // mode: "lucky" so server-emitted compose_failed / compose_errored
        // / itinerary_composed events carry the right entry mode (the
        // client compose_submitted above does too). Closes the gap
        // where server-side lucky events used to default to
        // "questionnaire".
        body: JSON.stringify({ ...roll.body, mode: "lucky", excludeVenueIds }),
      });
      if (res.status === 422) {
        const body = (await res.json().catch(() => ({}))) as unknown;
        lastFailure = isComposeFailure(body)
          ? body
          : composeFailure("proximity");
        continue;
      }
      if (!res.ok) {
        // Non-422 unhappy paths (500, network) — surface the neutral
        // "system" copy. Don't retry; a 500 isn't going to flip on the
        // next dice roll.
        return { ok: false, failure: composeFailure("system") };
      }
      const data = (await res.json()) as ItineraryResponse;
      return { ok: true, data, lastBody: roll.body };
    } catch {
      return { ok: false, failure: composeFailure("system") };
    }
  }
  // Exhausted the cap.
  return { ok: false, failure: lastFailure ?? composeFailure("proximity") };
}
