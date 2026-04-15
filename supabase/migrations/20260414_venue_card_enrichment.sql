-- StopCard enrichment: photo, awards, dining programs, dress code.
-- All columns nullable / defaulted so this is safe to run against
-- populated rows. See src/config/awards.ts for the canonical award
-- slug list that `awards` should contain.

alter table composer_venues
  add column if not exists photo_url      text,
  add column if not exists awards         text[] default '{}',
  add column if not exists amex_dining    boolean default false,
  add column if not exists chase_sapphire boolean default false,
  add column if not exists dress_code     text;

comment on column composer_venues.photo_url is 'Hero image URL shown on StopCard. Nullable until photos land.';
comment on column composer_venues.awards is 'Award slug array. See src/config/awards.ts for canonical list.';
comment on column composer_venues.amex_dining is 'True if venue is in Amex Platinum Global Dining Access.';
comment on column composer_venues.chase_sapphire is 'True if venue is in Chase Sapphire Reserve Dining.';
comment on column composer_venues.dress_code is 'Free text: casual | smart casual | business | jacket required | formal.';
