-- analytics_events: hybrid mirror of PostHog captures.
--
-- Every event sent to PostHog (client or server) is also inserted here
-- via /api/analytics/track (client) or src/lib/analytics-server.ts
-- (server routes). PostHog stays the source of truth for funnels and
-- dashboards; this table is for ad-hoc SQL, audit, and offline analysis
-- that doesn't fit PostHog's query model.
--
-- RLS is on with NO public policies — only the service role bypasses,
-- which is what /api/analytics/track uses (via getServiceSupabase()).

BEGIN;

create table analytics_events (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete set null,
  distinct_id text not null,    -- mirrors PostHog distinct_id (auth user id OR anonymous device id)
  session_id text,              -- mirrors PostHog session_id when available
  event_name text not null,
  properties jsonb default '{}'::jsonb,
  occurred_at timestamptz default now(),
  inserted_at timestamptz default now()
);

create index analytics_events_user_idx on analytics_events (user_id, occurred_at desc);
create index analytics_events_distinct_idx on analytics_events (distinct_id, occurred_at desc);
create index analytics_events_event_idx on analytics_events (event_name, occurred_at desc);
create index analytics_events_properties_idx on analytics_events using gin (properties);

alter table analytics_events enable row level security;
-- No public policies. Only service_role inserts (via the API route).
-- This means RLS denies anon and authenticated reads/writes; service role bypasses.

COMMIT;
