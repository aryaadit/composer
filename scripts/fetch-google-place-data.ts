// Batch-fetch Google Places details for all venues with a google_place_id
// but missing google_place_data. Stores trimmed JSONB in the DB.
//
// Usage: npx tsx scripts/fetch-google-place-data.ts

import { config } from "dotenv";
config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";
import { fetchPlaceDetails } from "../src/lib/google-places";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const refreshAll = process.argv.includes("--refresh");

  let query = supabase
    .from("composer_venues")
    .select("id, venue_id, name, google_place_id")
    .not("google_place_id", "is", null);

  if (!refreshAll) {
    query = query.is("google_place_data", null);
  }

  const { data: venues, error } = await query;

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

    console.log(`${progress} ${venue.name}...`);

    const placeData = await fetchPlaceDetails(venue.google_place_id);

    if (placeData) {
      const { error: updateError } = await supabase
        .from("composer_venues")
        .update({
          google_place_data: placeData,
          google_data_updated_at: new Date().toISOString(),
        })
        .eq("id", venue.id);

      if (updateError) {
        console.log(`  ✗ Failed to save: ${updateError.message}`);
        failed++;
      } else {
        console.log(`  ✓ Saved`);
        success++;
      }
    } else {
      console.log(`  ✗ API returned no data`);
      failed++;
    }

    // Rate limit: ~6 requests per second
    await sleep(170);
  }

  console.log(`\n${"=".repeat(50)}`);
  console.log(`SUCCESS: ${success}`);
  console.log(`FAILED:  ${failed}`);
  console.log(`ESTIMATED COST: $${(success * 0.017).toFixed(2)}`);
}

main().catch(console.error);
