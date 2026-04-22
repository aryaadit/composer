// Pass 1: Scrape venue websites for reservation platform links.
// Looks for Resy, OpenTable, Tock, SevenRooms URLs in <a href> and
// inline <script> tags. Writes results to venue_reservation_staging.
//
// Usage: npx tsx scripts/scrape-reservation-urls-pass1.ts
//   --skip-cached   skip venues with cached HTML (default: use cache)
//   --limit N       process only first N venues

import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";
import * as cheerio from "cheerio";
import * as fs from "fs";
import * as path from "path";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const CACHE_DIR = path.resolve(".cache/websites");
const UA =
  "Mozilla/5.0 (compatible; ComposerBot/1.0; +https://composer.onpalate.com)";

// ─── Patterns ─────────────────────────────────────────────────

const RESY_URL_RE =
  /resy\.com\/cities\/([^/]+)\/venues\/([^/?#]+)/i;
const OPENTABLE_RE =
  /opentable\.com\/(?:r\/([^/?#]+)|restref\/client\/.*rid=(\d+))/i;
const TOCK_RE = /exploretock\.com\/([^/?#]+)/i;
const SEVENROOMS_RE =
  /(?:sevenrooms|fp\.sevenrooms)\.com\/(?:reservations|explore)\/([^/?#]+)/i;
const RESY_WIDGET_VENUE_ID_RE = /resyWidget[\s\S]*?venueId['":\s]+(\d+)/i;
const RESY_EMBED_ID_RE = /"venue_id"\s*:\s*(\d+)/;

// ─── Helpers ──────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

function cachePath(venueId: string): string {
  return path.join(CACHE_DIR, `${venueId}.html`);
}

async function fetchWebsite(
  url: string,
  venueId: string
): Promise<string | null> {
  const cached = cachePath(venueId);
  if (fs.existsSync(cached)) {
    return fs.readFileSync(cached, "utf-8");
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(url, {
      headers: { "User-Agent": UA },
      redirect: "follow",
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) return null;

    const html = await res.text();
    fs.writeFileSync(cached, html, "utf-8");
    return html;
  } catch {
    return null;
  }
}

interface ScrapeResult {
  platform: string | null;
  resySlug: string | null;
  resyVenueId: number | null;
  reservationUrl: string | null;
  confidence: "high" | "medium" | "low" | "none";
  notes: string;
}

function scrapeHtml(html: string, websiteUrl: string): ScrapeResult {
  const $ = cheerio.load(html);
  const allHrefs: string[] = [];

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (href) allHrefs.push(href);
  });

  // Also check the final redirect URL (some sites redirect to resy directly)
  allHrefs.push(websiteUrl);

  // Check all scripts for Resy widget embed
  let widgetVenueId: number | null = null;
  $("script").each((_, el) => {
    const text = $(el).html() ?? "";
    const widgetMatch = text.match(RESY_WIDGET_VENUE_ID_RE);
    if (widgetMatch) widgetVenueId = parseInt(widgetMatch[1], 10);
    const embedMatch = text.match(RESY_EMBED_ID_RE);
    if (embedMatch && !widgetVenueId)
      widgetVenueId = parseInt(embedMatch[1], 10);
  });

  // Check for Resy URLs
  for (const href of allHrefs) {
    const resyMatch = href.match(RESY_URL_RE);
    if (resyMatch) {
      const slug = resyMatch[2];
      return {
        platform: "resy",
        resySlug: slug,
        resyVenueId: widgetVenueId,
        reservationUrl: href,
        confidence: widgetVenueId ? "high" : "medium",
        notes: widgetVenueId
          ? `slug=${slug} venueId=${widgetVenueId} from website+widget`
          : `slug=${slug} from website link`,
      };
    }
  }

  // Resy widget without URL link
  if (widgetVenueId) {
    return {
      platform: "resy",
      resySlug: null,
      resyVenueId: widgetVenueId,
      reservationUrl: null,
      confidence: "medium",
      notes: `venueId=${widgetVenueId} from widget embed, no URL link found`,
    };
  }

  // Check for OpenTable
  for (const href of allHrefs) {
    const otMatch = href.match(OPENTABLE_RE);
    if (otMatch) {
      return {
        platform: "opentable",
        resySlug: null,
        resyVenueId: null,
        reservationUrl: href,
        confidence: "high",
        notes: `OpenTable link found: ${otMatch[1] || otMatch[2]}`,
      };
    }
  }

  // Check for Tock
  for (const href of allHrefs) {
    const tockMatch = href.match(TOCK_RE);
    if (tockMatch) {
      return {
        platform: "tock",
        resySlug: null,
        resyVenueId: null,
        reservationUrl: href,
        confidence: "high",
        notes: `Tock link found: ${tockMatch[1]}`,
      };
    }
  }

  // Check for SevenRooms
  for (const href of allHrefs) {
    const srMatch = href.match(SEVENROOMS_RE);
    if (srMatch) {
      return {
        platform: "sevenrooms",
        resySlug: null,
        resyVenueId: null,
        reservationUrl: href,
        confidence: "high",
        notes: `SevenRooms link found: ${srMatch[1]}`,
      };
    }
  }

  return {
    platform: null,
    resySlug: null,
    resyVenueId: null,
    reservationUrl: null,
    confidence: "none",
    notes: "No reservation platform links found",
  };
}

// For Resy matches with slug but no venueId, try to resolve from Resy page
async function resolveResyVenueId(
  slug: string,
  city: string = "ny"
): Promise<number | null> {
  try {
    const res = await fetch(
      `https://resy.com/cities/${city}/venues/${slug}`,
      {
        headers: { "User-Agent": UA },
        redirect: "follow",
      }
    );
    if (!res.ok) return null;
    const html = await res.text();

    // Look for venue ID in page source
    const match = html.match(/"venue_id"\s*:\s*(\d+)/);
    if (match) return parseInt(match[1], 10);

    const match2 = html.match(/"id"\s*:\s*{"resy"\s*:\s*(\d+)/);
    if (match2) return parseInt(match2[1], 10);

    return null;
  } catch {
    return null;
  }
}

// ─── Main ─────────────────────────────────────────────────────

async function main() {
  ensureCacheDir();

  const limitArg = process.argv.indexOf("--limit");
  const limit =
    limitArg >= 0 ? parseInt(process.argv[limitArg + 1], 10) : undefined;

  // Load venues with website URLs
  const { data: venues, error } = await supabase
    .from("composer_venues")
    .select("id, venue_id, name, google_place_data, latitude, longitude")
    .eq("active", true);

  if (error || !venues) {
    console.error("Failed to load venues:", error?.message);
    process.exit(1);
  }

  const toProcess = limit ? venues.slice(0, limit) : venues;
  console.log(`Pass 1: Processing ${toProcess.length} venues\n`);

  let resyFound = 0;
  let otFound = 0;
  let tockFound = 0;
  let srFound = 0;
  let noneFound = 0;
  let errors = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const venue = toProcess[i];
    const progress = `[${i + 1}/${toProcess.length}]`;
    const placeData = venue.google_place_data as Record<string, unknown> | null;
    const websiteUrl = placeData?.websiteUri as string | undefined;

    if (!websiteUrl) {
      console.log(`${progress} ${venue.name}: No website URL, skipping`);
      await upsertStaging(venue, {
        platform: null,
        resySlug: null,
        resyVenueId: null,
        reservationUrl: null,
        confidence: "none",
        notes: "No website URL in google_place_data",
      });
      noneFound++;
      continue;
    }

    console.log(`${progress} ${venue.name}...`);

    const html = await fetchWebsite(websiteUrl, venue.venue_id);
    if (!html) {
      console.log(`  ✗ Failed to fetch ${websiteUrl}`);
      await upsertStaging(venue, {
        platform: null,
        resySlug: null,
        resyVenueId: null,
        reservationUrl: null,
        confidence: "none",
        notes: `Failed to fetch website: ${websiteUrl}`,
      });
      errors++;
      noneFound++;
      await sleep(1000);
      continue;
    }

    let result = scrapeHtml(html, websiteUrl);

    // If we found a Resy slug but no venue ID, try to resolve it
    if (
      result.platform === "resy" &&
      result.resySlug &&
      !result.resyVenueId
    ) {
      console.log(`  → Resolving Resy venue ID for slug: ${result.resySlug}`);
      const venueId = await resolveResyVenueId(result.resySlug);
      if (venueId) {
        result = {
          ...result,
          resyVenueId: venueId,
          confidence: "high",
          notes: `${result.notes} → resolved venueId=${venueId} from resy.com`,
        };
      }
      await sleep(500);
    }

    await upsertStaging(venue, result);

    switch (result.platform) {
      case "resy":
        resyFound++;
        console.log(
          `  ✓ Resy: ${result.resySlug ?? "?"} (${result.confidence})`
        );
        break;
      case "opentable":
        otFound++;
        console.log(`  ✓ OpenTable`);
        break;
      case "tock":
        tockFound++;
        console.log(`  ✓ Tock`);
        break;
      case "sevenrooms":
        srFound++;
        console.log(`  ✓ SevenRooms`);
        break;
      default:
        noneFound++;
        console.log(`  — No platform found`);
    }

    await sleep(1000);
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Pass 1 Complete`);
  console.log(`${"=".repeat(60)}`);
  console.log(`Resy:        ${resyFound}`);
  console.log(`OpenTable:   ${otFound}`);
  console.log(`Tock:        ${tockFound}`);
  console.log(`SevenRooms:  ${srFound}`);
  console.log(`None found:  ${noneFound}`);
  console.log(`Errors:      ${errors}`);
}

async function upsertStaging(
  venue: { id: string; name: string },
  result: ScrapeResult
) {
  const { error } = await supabase.from("venue_reservation_staging").upsert(
    {
      venue_id: venue.id,
      venue_name: venue.name,
      platform: result.platform,
      resy_venue_id: result.resyVenueId,
      resy_slug: result.resySlug,
      reservation_url: result.reservationUrl,
      confidence: result.confidence,
      source: "website_scrape",
      notes: result.notes,
    },
    { onConflict: "venue_id" }
  );
  if (error) {
    console.error(`  ✗ DB error: ${error.message}`);
  }
}

main().catch(console.error);
