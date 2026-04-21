// Batch-download venue photos from Google Places and upload to Supabase
// Storage. Stores up to 4 photos per venue in the `venue-photos` bucket.
//
// Usage: npx tsx scripts/fetch-venue-photos.ts

import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
import { fetchPlacePhoto } from "../src/lib/google-places";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const MAX_PHOTOS = 4;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const { data: venues, error } = await supabase
    .from("composer_venues")
    .select("id, venue_id, name, google_place_data")
    .not("google_place_data", "is", null)
    .or("google_place_photos.is.null,google_place_photos.eq.{}");

  if (error) {
    console.error("Failed to fetch venues:", error.message);
    process.exit(1);
  }

  console.log(`Found ${venues.length} venues to process\n`);

  let success = 0;
  let failed = 0;

  for (let i = 0; i < venues.length; i++) {
    const venue = venues[i];
    const progress = `[${i + 1}/${venues.length}]`;
    const placeData = venue.google_place_data as {
      photos?: { name: string }[];
    };

    if (!placeData.photos || placeData.photos.length === 0) {
      console.log(`${progress} ${venue.name}: No photos available`);
      continue;
    }

    const count = Math.min(placeData.photos.length, MAX_PHOTOS);
    console.log(`${progress} ${venue.name}: Downloading ${count} photos...`);

    const paths: string[] = [];

    for (let j = 0; j < count; j++) {
      const photo = placeData.photos[j];
      const buffer = await fetchPlacePhoto(photo.name);

      if (buffer) {
        const storagePath = `${venue.venue_id}/${j + 1}.jpg`;

        const { error: uploadError } = await supabase.storage
          .from("venue-photos")
          .upload(storagePath, buffer, {
            contentType: "image/jpeg",
            upsert: true,
          });

        if (uploadError) {
          console.log(
            `  ✗ Failed to upload photo ${j + 1}: ${uploadError.message}`
          );
        } else {
          paths.push(storagePath);
        }
      }

      await sleep(150);
    }

    if (paths.length > 0) {
      const { error: updateError } = await supabase
        .from("composer_venues")
        .update({ google_place_photos: paths })
        .eq("id", venue.id);

      if (updateError) {
        console.log(`  ✗ Failed to save paths: ${updateError.message}`);
        failed++;
      } else {
        console.log(`  ✓ Saved ${paths.length} photos`);
        success++;
      }
    } else {
      failed++;
    }
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log(`SUCCESS: ${success}`);
  console.log(`FAILED:  ${failed}`);
  console.log(
    `ESTIMATED COST: $${(success * MAX_PHOTOS * 0.007).toFixed(2)}`
  );
}

main().catch(console.error);
