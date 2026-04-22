// Pass 2: Resy venuesearch for venues that Pass 1 didn't match.
// Queries Resy's search API by venue name + geo, scores matches
// by name similarity + distance, writes to staging.
//
// Usage: npx tsx scripts/scrape-reservation-urls-pass2.ts
//   --limit N   process only first N unmatched venues

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import { compareTwoStrings } from "string-similarity";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const RESY_API_KEY = "VbWk7s3L4KiK5fzlO7JD3Q5EYolJI7n5";
const UA = "Mozilla/5.0 (compatible; ComposerBot/1.0)";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function haversineM(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface ResyHit {
  name: string;
  id: { resy: number };
  url_slug: string;
  neighborhood?: string;
  _geoloc?: { lat: number; lng: number };
}

interface ResySearchResponse {
  search?: {
    hits?: ResyHit[];
  };
}

async function searchResy(
  query: string,
  lat: number,
  lng: number
): Promise<ResyHit[]> {
  try {
    const res = await fetch(
      "https://api.resy.com/3/venuesearch/search",
      {
        method: "POST",
        headers: {
          Authorization: `ResyAPI api_key="${RESY_API_KEY}"`,
          "Content-Type": "application/json",
          "User-Agent": UA,
        },
        body: JSON.stringify({
          query,
          geo: { latitude: lat, longitude: lng, radius: 5000 },
          per_page: 5,
          page: 1,
        }),
      }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as ResySearchResponse;
    return data.search?.hits ?? [];
  } catch {
    return [];
  }
}

function scoreMatch(
  venueName: string,
  venueLat: number,
  venueLng: number,
  venueHood: string,
  hit: ResyHit
): { confidence: "high" | "medium" | "low"; notes: string } {
  const nameSim = compareTwoStrings(
    venueName.toLowerCase(),
    hit.name.toLowerCase()
  );

  const hitLat = hit._geoloc?.lat ?? 0;
  const hitLng = hit._geoloc?.lng ?? 0;
  const dist = hitLat && hitLng
    ? Math.round(haversineM(venueLat, venueLng, hitLat, hitLng))
    : 99999;

  const hoodMatch =
    !!venueHood &&
    !!hit.neighborhood &&
    venueHood.toLowerCase().replace(/_/g, " ") ===
      hit.neighborhood.toLowerCase();

  const notes = `name_sim=${nameSim.toFixed(2)} dist=${dist}m hood_match=${!!hoodMatch}`;

  if (nameSim >= 0.9 && dist <= 300) return { confidence: "high", notes };
  if (nameSim >= 0.75 && dist <= 800) return { confidence: "medium", notes };
  if (nameSim >= 0.6) return { confidence: "low", notes };

  return { confidence: "low", notes };
}

async function main() {
  const limitArg = process.argv.indexOf("--limit");
  const limit =
    limitArg >= 0 ? parseInt(process.argv[limitArg + 1], 10) : undefined;

  // Load venues that Pass 1 didn't match (confidence = 'none' or no staging row)
  const { data: venues, error } = await supabase
    .from("composer_venues")
    .select("id, venue_id, name, neighborhood, latitude, longitude")
    .eq("active", true);

  if (error || !venues) {
    console.error("Failed to load venues:", error?.message);
    process.exit(1);
  }

  // Get existing staging rows
  const { data: staged } = await supabase
    .from("venue_reservation_staging")
    .select("venue_id, confidence, platform");

  const stagedMap = new Map(
    (staged ?? []).map((s) => [s.venue_id, s])
  );

  // Filter to unmatched venues
  const unmatched = venues.filter((v) => {
    const s = stagedMap.get(v.id);
    return !s || (s.confidence === "none" && !s.platform);
  });

  const toProcess = limit ? unmatched.slice(0, limit) : unmatched;
  console.log(
    `Pass 2: ${toProcess.length} unmatched venues (of ${venues.length} total)\n`
  );

  let matched = 0;
  let noMatch = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const venue = toProcess[i];
    const progress = `[${i + 1}/${toProcess.length}]`;

    console.log(`${progress} ${venue.name}...`);

    const hits = await searchResy(
      venue.name,
      venue.latitude,
      venue.longitude
    );

    if (hits.length === 0) {
      console.log(`  — No Resy results`);
      // Update existing staging row notes
      await supabase
        .from("venue_reservation_staging")
        .upsert(
          {
            venue_id: venue.id,
            venue_name: venue.name,
            platform: null,
            confidence: "none",
            source: "resy_search",
            notes: "No Resy search results",
          },
          { onConflict: "venue_id" }
        );
      noMatch++;
      await sleep(500);
      continue;
    }

    // Score all hits, pick best
    let bestHit: ResyHit | null = null;
    let bestScore: { confidence: "high" | "medium" | "low"; notes: string } | null = null;
    const confidenceRank = { high: 3, medium: 2, low: 1 };

    for (const hit of hits) {
      const score = scoreMatch(
        venue.name,
        venue.latitude,
        venue.longitude,
        venue.neighborhood,
        hit
      );
      if (
        !bestScore ||
        confidenceRank[score.confidence] >
          confidenceRank[bestScore.confidence]
      ) {
        bestHit = hit;
        bestScore = score;
      }
    }

    if (bestHit && bestScore) {
      console.log(
        `  ✓ ${bestHit.name} (${bestScore.confidence}) — ${bestScore.notes}`
      );
      await supabase.from("venue_reservation_staging").upsert(
        {
          venue_id: venue.id,
          venue_name: venue.name,
          platform: "resy",
          resy_venue_id: bestHit.id.resy,
          resy_slug: bestHit.url_slug,
          reservation_url: `https://resy.com/cities/ny/venues/${bestHit.url_slug}`,
          confidence: bestScore.confidence,
          source: "resy_search",
          notes: `${bestScore.notes} resy_name="${bestHit.name}"`,
        },
        { onConflict: "venue_id" }
      );
      matched++;
    } else {
      noMatch++;
    }

    await sleep(500);
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Pass 2 Complete`);
  console.log(`${"=".repeat(60)}`);
  console.log(`Matched:   ${matched}`);
  console.log(`No match:  ${noMatch}`);
}

main().catch(console.error);
