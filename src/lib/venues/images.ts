// Canonical helper for venue photo URLs.
// Photos are stored in Supabase Storage bucket "venue-photos",
// keyed by google_place_id for stability across venue_id changes.

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const BUCKET = "venue-photos";

/**
 * Returns public URLs for a venue's stored photos.
 * Empty array if venue has no photos.
 */
export function getVenueImageUrls(
  imageKeys: string[]
): string[] {
  if (!imageKeys || imageKeys.length === 0) return [];
  return imageKeys.map(
    (key) => `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${key}`
  );
}

/**
 * Returns the hero image URL (first photo) or null.
 */
export function getVenueHeroImageUrl(
  imageKeys: string[]
): string | null {
  const urls = getVenueImageUrls(imageKeys);
  return urls[0] ?? null;
}
