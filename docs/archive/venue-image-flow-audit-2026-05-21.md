# Venue image flow — investigation

**Date:** 2026-05-21
**Trigger:** Decide where to apply a backfill for venues currently rendering without photos.

## 1. Image-related fields + every code reference

**Two columns on `composer_venues_v2`:**

| Column | Type | Live count populated |
|---|---|---|
| `image_keys` | `TEXT[] NOT NULL DEFAULT '{}'` | 1,308 / 1,329 active (98.4%) |
| `corner_photo_url` | `TEXT` nullable | 847 / 1,329 active (63.7%) |

**File-level hits** (excluding markdown, archive):

- **Production UI render paths** (where photos appear to users):
  - `src/components/ui/StopCard.tsx:107` — itinerary card hero image
  - `src/components/venue/VenueDetailModal.tsx:78` — venue detail bottom-sheet photo carousel
  - `src/app/profile/_components/VenueLookup.tsx:127` — admin venue lookup hero
- **URL builder**: `src/lib/venues/images.ts` — `getVenueImageUrls()` + `getVenueHeroImageUrl()`
- **Type declarations**: `src/types/index.ts:176` (`corner_photo_url`), `:190` (`image_keys`)
- **Importer column metadata**: `src/lib/venues/columns.ts:74, 88, 107, 116` (declarations + PROTECTED list)
- **Test fixture**: `tests/unit/scoring.test.ts:53, 63`
- **Migrations**: `20260414_venue_card_enrichment.sql` (old v1 `photo_url`), `20260428_composer_venues_v2.sql:66` (`corner_photo_url` in v2 schema), `20260430000003_venue_image_keys.sql` (added `image_keys`)
- **Scripts**: `backfill_venue_photos_v2.py`, `snapshot_image_keys.py`, `restore_image_keys.py`
- **Google Places client lib** (no runtime callers in src/, only batch scripts): `src/lib/google-places.ts`

## 2. Classification per hit

**All three UI render paths read EXCLUSIVELY from `image_keys`. No Google Places API call at request time. No fallback chain.**

The canonical pattern:

```ts
// StopCard.tsx:107
const heroUrl = getVenueHeroImageUrl(v.image_keys ?? []);
return heroUrl ? <img src={heroUrl} ... /> : null;
```

If `image_keys` is empty → `getVenueHeroImageUrl()` returns `null` → **no image renders**, not even a placeholder. The render path **never reads `corner_photo_url`**.

Verified by grep: across `src/components/**/*.tsx`, the only references to `corner_photo_url` are the type declaration and the test fixture. **Zero render-site reads. The column is dead in UI today.**

## 3. `src/lib/google-places.ts` — what is it?

It's a server-side Google Places **client library**, not a render-time fetcher:

- `fetchPlaceDetails(placeId)` — pulls a JSON record with rating, hours, photos metadata, etc. Returns the place data object.
- `fetchPlacePhoto(photoName, maxWidth=800)` — downloads photo **binary bytes** (`Buffer`). Not a URL.

**Both functions are only invoked from batch scripts, never from a `/api/*` route or React component.** Grep confirms: no `src/app/**` or `src/components/**` file imports from `lib/google-places.ts`. The file comment says it explicitly (line 2): "Used by scripts and admin API routes — not called from client components."

The "admin API routes" comment is slightly stale — currently NO API route imports it either. All consumers are in `scripts/`.

**Photos are written to DB at enrichment time, never fetched fresh at request time.** The flow:

1. Script `backfill_venue_photos_v2.py` calls Google Places `places.{id}` endpoint to list photo metadata for venues missing `image_keys`.
2. Downloads the first 4 photo binaries via the photo media endpoint.
3. Uploads each as `{google_place_id}/{index}.jpg` to Supabase Storage bucket `venue-photos`.
4. Updates `composer_venues_v2.image_keys` with the array of storage paths.
5. At render time, `images.ts` builds public URLs as `${SUPABASE_URL}/storage/v1/object/public/venue-photos/${key}` — no API call, no auth.

## 4. The `enriched` flag — what writes it?

**Currently: nothing in the codebase writes `enriched=true` on v2 rows.** Verified by grep — no Python script and no TS code under `src/` or `scripts/` sets the column.

- `scripts/fetch-google-place-data.ts` exists but it's **defunct**: it targets the v1 table `composer_venues` (now dropped per the followups #6 commit) and writes columns `google_place_data` + `google_data_updated_at` that don't exist on v2.
- `scripts/backfill_venue_photos_v2.py` writes ONLY `image_keys`, not `enriched`.

The `enriched=true` flag on 1,309 / 1,329 venues was set by some pre-v2 pipeline that no longer exists in the repo. It's now legacy data, not actively maintained.

`enriched` does NOT gate any code path — grep for `enriched` returns only the column-list declarations and the test fixture. **The boolean is currently a dead signal.**

## 5. StopCard photo lookup — the field + (non)-fallback

`src/components/ui/StopCard.tsx:107`:

```ts
const heroUrl = getVenueHeroImageUrl(v.image_keys ?? []);
```

`src/lib/venues/images.ts:24-29`:

```ts
export function getVenueHeroImageUrl(imageKeys: string[]): string | null {
  const urls = getVenueImageUrls(imageKeys);
  return urls[0] ?? null;
}
```

**Field used: `image_keys[0]` only.** No fallback to `corner_photo_url`, no fallback to Google Places API, no placeholder image. If `image_keys` is empty, the card simply omits the hero image div.

Same pattern in `VenueDetailModal.tsx:78` for the photo carousel and `VenueLookup.tsx:127` for admin.

## 6. Schema — image columns on `composer_venues_v2`

```
corner_photo_url   text          (nullable)
image_keys         text[]        (NOT NULL DEFAULT '{}')
enriched           boolean       (nullable)
corner_id          text          (nullable — Corner Guides source attribution, not an image)
```

No other image-related columns. The migration history shows `corner_photo_url` was added in the v2 schema migration (April 28) and `image_keys` was added two days later in `20260430000003_venue_image_keys.sql` — `image_keys` is the newer, intended-canonical image surface.

## Live distribution (1,329 active venues)

| State | Count | % |
|---|---|---|
| Has `image_keys` populated | 1,308 | 98.4% |
| Has `corner_photo_url` populated | 847 | 63.7% |
| Has **neither** | **21** | **1.6%** |
| Has `google_place_id` | 1,309 | 98.5% |
| `enriched = true` | 1,309 | 98.5% |

Breakdown of the 21 active venues that render **without any photo**:

- **20 of 21** also lack `google_place_id` → cannot be backfilled by the existing `backfill_venue_photos_v2.py` script. Need manual photo upload or a different approach.
- **1 of 21** has `google_place_id` set → backfillable by the existing script. (One re-run would catch it.)

## Recommended backfill path

Three possible angles:

### A) Run the existing photo backfill for the 1 venue that has a `google_place_id`

Trivial: `python3 scripts/backfill_venue_photos_v2.py` will pick it up automatically (the script's filter is "google_place_id present AND image_keys empty"). Cost: ~$0.017 + storage. Fixes 1 of 21 silent failures.

### B) Add a `corner_photo_url` fallback to the UI render path

Change `src/lib/venues/images.ts:getVenueHeroImageUrl()` to fall back to `corner_photo_url` when `image_keys` is empty. This requires plumbing the venue or the URL through — currently the function only takes `imageKeys[]`. Worth doing if Corner photos are acceptable for the soft launch.

Of the 21 venues without `image_keys`, **0 also have `corner_photo_url`** (verified — they have "neither"). So this fallback would help 0 of the 21 today, but would be defensive for future venues that come in via Corner imports without a Google Places hit. Marginal value right now.

### C) Source the missing 20 manually

The 20 venues without `google_place_id` need manual lookup — either:

- Find each venue's Google Place ID by hand, write it back to the sheet, re-import, re-run backfill
- Or skip Google Places and upload curator-provided photos directly to `venue-photos/{venue_id}/0.jpg` and seed `image_keys` manually

If launch is soon, option C is probably what closes the gap — but it's manual work, ~20 venues × a few minutes each.

## Side-cleanup worth doing

- `corner_photo_url` is dead data (847 populated, 0 readers). Either wire it as a fallback (B) or stop populating it in the import path. Leaving it as-is is just storage with no behavioral effect.
- `enriched` flag is dead signal. Either repurpose it (e.g., to gate display of Google data) or document that it's vestigial.
- `scripts/fetch-google-place-data.ts` is broken — targets dropped table `composer_venues`. Either fix to v2 or delete.
