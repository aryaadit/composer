// Single source of truth for the `signup_source` heuristic that
// travels on two surfaces:
//   1. the user_signed_up event payload (captured at the auth ACTION
//      site in src/lib/auth.ts, then deferred to the routing branch),
//   2. the PostHog person property set via $set_once at first identify
//      (src/components/providers/AuthProvider.tsx).
//
// They were inlined twice and byte-identical pre-2026-06-12; future
// edits (UTM-aware branches, campaign attribution, etc.) need to land
// here so the event-level and person-level signup_source can't drift.
//
// Semantic note: callers at the ACTION site see referrer at the moment
// of OTP submission. Callers at the IDENTIFY site see referrer at
// session-hydration time, which for returning sessions can be a
// different page. That's OK — the identify call is wrapped in
// $set_once so the first value sticks. But the two values are only
// COINCIDENTALLY equal for a fresh signup landing directly on `/`.

export function deriveSignupSource(): string {
  if (typeof window === "undefined") return "direct";
  try {
    const ref = new URL(window.location.href).searchParams.get("ref");
    if (ref) return `ref_${ref}`;
    const referrer = document.referrer;
    if (!referrer) return "direct";
    const url = new URL(referrer);
    if (url.origin !== window.location.origin) return "external";
    if (url.pathname.startsWith("/itinerary/share")) return "share_link";
    if (url.pathname === "/" || url.pathname === "") return "home";
    return "internal";
  } catch {
    return "direct";
  }
}
