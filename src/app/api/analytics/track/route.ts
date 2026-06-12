// POST /api/analytics/track — internal endpoint called by the client
// analytics wrapper (src/lib/analytics.ts) to mirror PostHog captures
// into the Supabase composer_analytics_events table.
//
// Why a separate endpoint? Browsers can't talk to service-role Supabase
// directly. The route reads the auth cookie to associate the row with
// the signed-in user (when present) and writes via service-role to
// bypass RLS.
//
// Body shape: { event_name, properties, distinct_id, session_id }

import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import { getServiceSupabase } from "@/lib/supabase";

interface TrackRequestBody {
  event_name?: unknown;
  properties?: unknown;
  distinct_id?: unknown;
  session_id?: unknown;
}

export async function POST(req: Request) {
  // Production-only gate (parity with the client wrapper). Non-prod
  // deploys quietly accept the POST without writing — we don't want
  // preview / dev pollution in the production mirror.
  if (process.env.VERCEL_ENV !== "production") {
    return NextResponse.json({ ok: true, skipped: "non_production_env" });
  }
  try {
    const body = (await req.json()) as TrackRequestBody;
    const { event_name, properties, distinct_id, session_id } = body;

    if (!event_name || typeof event_name !== "string") {
      return NextResponse.json(
        { ok: false, error: "missing event_name" },
        { status: 400 }
      );
    }
    if (!distinct_id || typeof distinct_id !== "string") {
      return NextResponse.json(
        { ok: false, error: "missing distinct_id" },
        { status: 400 }
      );
    }

    // Resolve the authed user (for the user_id FK). Null is fine — the
    // row still records distinct_id for anonymous visitors.
    const supabase = await getServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const serviceRole = getServiceSupabase();
    const { error } = await serviceRole.from("composer_analytics_events").insert({
      user_id: user?.id ?? null,
      distinct_id,
      session_id: typeof session_id === "string" ? session_id : null,
      event_name,
      properties: (properties && typeof properties === "object") ? properties : {},
    });

    if (error) {
      console.error("composer_analytics_events insert failed:", error);
      return NextResponse.json({ ok: false }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("/api/analytics/track error:", err);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
