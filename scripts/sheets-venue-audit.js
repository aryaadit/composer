/**
 * Google Apps Script — Venue Data Audit & Update
 *
 * Paste into the Google Sheet's Apps Script editor:
 *   Extensions → Apps Script → paste → Save
 *
 * Two functions:
 *   1. auditVenueData()  — creates an "Audit" sheet comparing sheet vs Google Places
 *   2. updateVenueData() — overwrites sheet columns with Google Places data
 *
 * Run auditVenueData() first, review the Audit sheet, then run updateVenueData().
 */

// ─── Config ───────────────────────────────────────────────────
const SUPABASE_URL = "https://uivpcwacqsqhbpisvmun.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVpdnBjd2FjcXNxaGJwaXN2bXVuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTg1NDQ2OSwiZXhwIjoyMDkxNDMwNDY5fQ.C4ZSmTpJZkSdZIE6OePKwiGllnqkpEM6AWg_eN-rJXw";

const VENUES_SHEET = "Venues";
const HEADER_ROW = 2;
const DATA_START_ROW = 3;

// Column indices (0-based from A)
const COL = {
  venue_id:      0,   // A
  name:          1,   // B
  neighborhood:  2,   // C
  category:      3,   // D
  price_tier:    4,   // E
  outdoor_seating: 9, // J
  maps_url:     12,   // M
  curation_note: 13,  // N
  address:      18,   // S
  latitude:     19,   // T
  longitude:    20,   // U
  active:       21,   // V
  hours:        24,   // Y
  last_verified: 25,  // Z
  last_updated: 26,   // AA
  dog_friendly: 28,   // AC
  kid_friendly: 29,   // AD
  wheelchair:   30,   // AE
  google_place_id: 32, // AG
};

// ─── Mapping tables ──────────────────────────────────────────
// Google values → our taxonomy slugs. Unmapped values are skipped
// (the sheet keeps its current value).

const PRICE_MAP = {
  "PRICE_LEVEL_FREE": 1,
  "PRICE_LEVEL_INEXPENSIVE": 1,
  "PRICE_LEVEL_MODERATE": 2,
  "PRICE_LEVEL_EXPENSIVE": 3,
  "PRICE_LEVEL_VERY_EXPENSIVE": 4,
};

// Google addressDescriptor area name → our neighborhood slug
const HOOD_MAP = {
  "west village": "west_village",
  "greenwich village": "greenwich_village",
  "south village": "west_village",
  "ukrainian village": "east_village",
  "east village": "east_village",
  "alphabet city": "east_village",
  "lower east side": "lower_east_side",
  "two bridges": "lower_east_side",
  "soho": "soho_nolita",
  "nolita": "nolita",
  "noho": "noho",
  "little italy": "little_italy",
  "tribeca": "tribeca",
  "hudson square": "hudson_square",
  "chelsea": "chelsea",
  "chelsea market": "chelsea",
  "meatpacking district": "chelsea",
  "flatiron district": "flatiron",
  "nomad": "nomad",
  "gramercy park": "gramercy_kips_bay",
  "kips bay": "kips_bay",
  "rose hill": "murray_hill",
  "murray hill": "murray_hill",
  "koreatown": "koreatown",
  "midtown manhattan": "midtown",
  "midtown south": "midtown",
  "midtown east": "midtown_east",
  "midtown west": "midtown_west",
  "hell's kitchen": "midtown_hells_kitchen",
  "theater district": "midtown_west",
  "garment district": "midtown",
  "chinatown": "chinatown",
  "financial district": "fidi",
  "battery park city": "battery_park_city",
  "lower manhattan": "lower_manhattan",
  "bowery": "bowery",
  "upper west side": "upper_west_side",
  "lincoln square": "upper_west_side",
  "bloomingdale": "upper_west_side",
  "manhattan valley": "upper_west_side",
  "upper east side": "upper_east_side",
  "lenox hill": "upper_east_side",
  "carnegie hill": "upper_east_side",
  "yorkville": "upper_east_side",
  "harlem": "harlem",
  "central harlem": "harlem",
  "east harlem": "harlem",
  "hamilton heights": "harlem",
  "west harlem": "west_harlem",
  "morningside heights": "west_harlem",
  "fort george": "washington_heights",
  "washington heights": "washington_heights",
  "williamsburg": "williamsburg",
  "south williamsburg": "williamsburg",
  "southside": "williamsburg",
  "greenpoint": "greenpoint",
  "east williamsburg": "east_williamsburg",
  "dumbo": "dumbo",
  "fulton ferry district": "dumbo",
  "brooklyn heights": "brooklyn_heights",
  "cobble hill": "cobble_hill",
  "carroll gardens": "carroll_gardens",
  "columbia street waterfront district": "columbia_waterfront",
  "boerum hill": "cobble_hill",
  "fort greene": "fort_greene",
  "clinton hill": "clinton_hill",
  "park slope": "park_slope",
  "gowanus": "gowanus",
  "red hook": "red_hook",
  "bedford-stuyvesant": "bed_stuy",
  "stuyvesant heights": "bed_stuy",
  "ocean hill": "bed_stuy",
  "crown heights": "crown_heights",
  "prospect heights": "prospect_heights",
  "prospect lefferts gardens": "prospect_lefferts",
  "flatbush": "flatbush_plg",
  "sunset park": "sunset_park",
  "gravesend": "gravesend",
  "sheepshead bay": "sheepshead_bay",
  "astoria": "astoria",
  "ditmars steinway": "astoria",
  "long island city": "long_island_city",
  "hunters point": "long_island_city",
  "dutch kills": "long_island_city",
  "sunnyside": "sunnyside",
  "jackson heights": "jackson_heights",
  "flushing": "flushing",
  "downtown flushing": "flushing",
  "ridgewood": "ridgewood",
  "city island": "city_island",
  "mott haven": "mott_haven",
  "port morris": "mott_haven",
  "belmont": "arthur_avenue",
  "arthur avenue": "arthur_avenue",
  "staten island": "staten_island",
  "stapleton heights": "stapleton_heights",
  "howard beach": "howard_beach",
  "old howard beach": "howard_beach",
  "south ozone park": "south_ozone_park",
  "downtown brooklyn": "fort_greene",
};

// Google primaryTypeDisplayName → our category slug
const CAT_MAP = {
  "italian restaurant": "italian",
  "french restaurant": "french",
  "chinese restaurant": "chinese",
  "chinese noodle restaurant": "chinese",
  "dumpling restaurant": "chinese",
  "japanese restaurant": "japanese",
  "izakaya restaurant": "japanese",
  "sushi restaurant": "japanese",
  "ramen restaurant": "japanese",
  "korean restaurant": "korean",
  "korean barbecue restaurant": "korean",
  "thai restaurant": "thai",
  "vietnamese restaurant": "vietnamese",
  "indian restaurant": "indian",
  "south indian restaurant": "indian",
  "mexican restaurant": "mexican",
  "taco restaurant": "mexican",
  "tex-mex restaurant": "mexican",
  "spanish restaurant": "spanish",
  "basque restaurant": "spanish",
  "greek restaurant": "greek",
  "mediterranean restaurant": "mediterranean",
  "middle eastern restaurant": "middle_eastern",
  "israeli restaurant": "middle_eastern",
  "turkish restaurant": "middle_eastern",
  "moroccan restaurant": "moroccan",
  "caribbean restaurant": "caribbean",
  "cuban restaurant": "cuban",
  "brazilian restaurant": "latin",
  "latin american restaurant": "latin",
  "south american restaurant": "latin",
  "peruvian restaurant": "peruvian",
  "argentinian restaurant": "argentinian",
  "filipino restaurant": "filipino",
  "african restaurant": "senegalese",
  "afghan restaurant": "middle_eastern",
  "indonesian restaurant": "middle_eastern",
  "cambodian restaurant": "thai",
  "taiwanese restaurant": "chinese",
  "eastern european restaurant": "fine_dining",
  "british restaurant": "american",
  "asian restaurant": "japanese",
  "asian fusion restaurant": "japanese",
  "american restaurant": "american",
  "soul food restaurant": "american",
  "chicken restaurant": "american",
  "barbecue restaurant": "bbq",
  "seafood restaurant": "seafood",
  "oyster bar restaurant": "seafood",
  "steak house": "steakhouse",
  "fine dining restaurant": "fine_dining",
  "gastropub": "bar",
  "bar & grill": "bar",
  "bar": "bar",
  "cocktail bar": "speakeasy",
  "wine bar": "wine_bar",
  "pizza restaurant": "pizza",
  "fast food restaurant": "diner",
  "diner": "diner",
  "restaurant": "american",
  "bakery": "bakery",
  "pastry shop": "bakery",
  "cake shop": "bakery",
  "donut shop": "bakery",
  "chocolate shop": "bakery",
  "cafe": "cafe",
  "coffee shop": "cafe",
  "tea house": "cafe",
  "tea store": "cafe",
  "deli": "deli",
  "butcher shop": "deli",
  "sandwich shop": "sandwich",
  "bagel shop": "bagel_shop",
  "ice cream shop": "ice_cream",
  "dessert restaurant": "dessert",
  "dessert shop": "dessert",
  "bistro": "french",
  "food court": "food_hall",
  "market": "food_hall",
  "book store": "bookstore",
  "comedy club": "comedy_club",
  "movie theater": "cinema",
  "museum": "museum",
  "art museum": "museum",
  "art gallery": "museum",
  "park": "park",
  "botanical garden": "park",
  "performing arts theater": "theater",
  "live music venue": "music_venue",
  "spa": "spa_bathhouse",
  "sauna": "spa_bathhouse",
  "halal restaurant": "halal",
  "dim sum restaurant": "dim_sum",
  "event venue": "music_venue",
  "cultural center": "museum",
  "non-profit organization": "museum",
  "university": "park",
};

// ─── Supabase fetch ───────────────────────────────────────────

function fetchPlaceData(venueIds) {
  var url = SUPABASE_URL + "/rest/v1/composer_venues?" +
    "select=venue_id,google_place_data" +
    "&google_place_data=not.is.null" +
    "&venue_id=in.(" + venueIds.join(",") + ")";

  var response = UrlFetchApp.fetch(url, {
    headers: {
      "apikey": SUPABASE_KEY,
      "Authorization": "Bearer " + SUPABASE_KEY,
    },
    muteHttpExceptions: true,
  });

  if (response.getResponseCode() !== 200) {
    Logger.log("Supabase error: " + response.getContentText());
    return {};
  }

  var rows = JSON.parse(response.getContentText());
  var map = {};
  for (var i = 0; i < rows.length; i++) {
    map[rows[i].venue_id] = rows[i].google_place_data;
  }
  return map;
}

// ─── Extract helpers ──────────────────────────────────────────

function mapNeighborhood(place) {
  if (!place.addressDescriptor || !place.addressDescriptor.areas) return "";
  var areas = place.addressDescriptor.areas;
  // Try each area (most specific first) until we find a mapping
  for (var i = 0; i < areas.length; i++) {
    var name = areas[i].displayName ? areas[i].displayName.text : "";
    if (!name) continue;
    var slug = HOOD_MAP[name.toLowerCase()];
    if (slug) return slug;
  }
  return ""; // no mapping found — keep current sheet value
}

function mapCategory(place) {
  if (!place.primaryTypeDisplayName || !place.primaryTypeDisplayName.text) return "";
  var name = place.primaryTypeDisplayName.text.toLowerCase();
  return CAT_MAP[name] || "";
}

function getPriceTier(place) {
  if (!place.priceLevel) return "";
  return PRICE_MAP[place.priceLevel] || "";
}

function getHours(place) {
  if (!place.regularOpeningHours || !place.regularOpeningHours.weekdayDescriptions) return "";
  return place.regularOpeningHours.weekdayDescriptions.join(" | ");
}

function getBool(val) {
  if (val === true) return "yes";
  if (val === false) return "no";
  return "";
}

function getEditorialSummary(place) {
  if (!place.editorialSummary || !place.editorialSummary.text) return "";
  return place.editorialSummary.text;
}

function getActive(place) {
  if (!place.businessStatus) return "";
  return place.businessStatus === "OPERATIONAL" ? "yes" : "no";
}

// ─── Read venue row from sheet ────────────────────────────────

function readVenueRow(row) {
  return {
    venueId:        String(row[COL.venue_id] || "").trim(),
    name:           String(row[COL.name] || "").trim(),
    neighborhood:   String(row[COL.neighborhood] || "").trim(),
    category:       String(row[COL.category] || "").trim(),
    priceTier:      String(row[COL.price_tier] || "").trim(),
    address:        String(row[COL.address] || "").trim(),
    latitude:       String(row[COL.latitude] || "").trim(),
    longitude:      String(row[COL.longitude] || "").trim(),
    hours:          String(row[COL.hours] || "").trim(),
    mapsUrl:        String(row[COL.maps_url] || "").trim(),
    outdoorSeating: String(row[COL.outdoor_seating] || "").trim().toLowerCase(),
    dogFriendly:    String(row[COL.dog_friendly] || "").trim().toLowerCase(),
    kidFriendly:    String(row[COL.kid_friendly] || "").trim().toLowerCase(),
    wheelchair:     String(row[COL.wheelchair] || "").trim().toLowerCase(),
    curationNote:   String(row[COL.curation_note] || "").trim(),
    active:         String(row[COL.active] || "").trim().toLowerCase(),
    placeId:        String(row[COL.google_place_id] || "").trim(),
  };
}

// ─── Build comparison fields ──────────────────────────────────

function buildComparisons(venue, place) {
  return [
    { field: "name",            sheet: venue.name,          google: place.displayName ? place.displayName.text : "" },
    { field: "neighborhood",    sheet: venue.neighborhood,  google: mapNeighborhood(place) },
    { field: "category",        sheet: venue.category,      google: mapCategory(place) },
    { field: "price_tier",      sheet: venue.priceTier,     google: String(getPriceTier(place)) },
    { field: "address",         sheet: venue.address,       google: place.formattedAddress || "" },
    { field: "latitude",        sheet: venue.latitude,      google: place.location ? String(place.location.latitude) : "" },
    { field: "longitude",       sheet: venue.longitude,     google: place.location ? String(place.location.longitude) : "" },
    { field: "hours",           sheet: venue.hours,         google: getHours(place) },
    { field: "maps_url",        sheet: venue.mapsUrl,       google: place.googleMapsUri || "" },
    { field: "outdoor_seating", sheet: venue.outdoorSeating, google: getBool(place.outdoorSeating) },
    { field: "dog_friendly",    sheet: venue.dogFriendly,   google: getBool(place.allowsDogs) },
    { field: "kid_friendly",    sheet: venue.kidFriendly,   google: getBool(place.goodForChildren) },
    { field: "wheelchair",      sheet: venue.wheelchair,    google: getBool(place.accessibilityOptions ? place.accessibilityOptions.wheelchairAccessibleSeating : undefined) },
    { field: "curation_note",   sheet: venue.curationNote,  google: getEditorialSummary(place) },
    { field: "active",          sheet: venue.active,        google: getActive(place) },
  ];
}

// ─── Audit ────────────────────────────────────────────────────

function auditVenueData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(VENUES_SHEET);
  var data = sheet.getDataRange().getValues();

  var venues = [];
  for (var r = DATA_START_ROW - 1; r < data.length; r++) {
    var v = readVenueRow(data[r]);
    if (!v.venueId || !v.placeId) continue;
    v.row = r + 1;
    venues.push(v);
  }

  Logger.log("Found " + venues.length + " venues with google_place_id");

  var placeDataMap = {};
  for (var i = 0; i < venues.length; i += 50) {
    var batch = venues.slice(i, i + 50);
    var ids = batch.map(function(v) { return v.venueId; });
    var result = fetchPlaceData(ids);
    for (var key in result) placeDataMap[key] = result[key];
    Utilities.sleep(200);
  }

  var auditSheet = ss.getSheetByName("Audit");
  if (auditSheet) {
    auditSheet.clear();
  } else {
    auditSheet = ss.insertSheet("Audit");
  }

  auditSheet.getRange(1, 1, 1, 8).setValues([[
    "Row", "Venue ID", "Name", "Field", "Sheet Value", "Google Value", "Match", "Action"
  ]]);
  auditSheet.getRange(1, 1, 1, 8).setFontWeight("bold");

  var auditRow = 2;
  var matches = 0;
  var diffs = 0;
  var missing = 0;
  var unmapped = 0;

  for (var vi = 0; vi < venues.length; vi++) {
    var venue = venues[vi];
    var place = placeDataMap[venue.venueId];
    if (!place) {
      auditSheet.getRange(auditRow, 1, 1, 8).setValues([[
        venue.row, venue.venueId, venue.name, "ALL", "", "", "NO DATA", "Missing google_place_data"
      ]]);
      auditRow++;
      missing++;
      continue;
    }

    var comparisons = buildComparisons(venue, place);
    for (var ci = 0; ci < comparisons.length; ci++) {
      var c = comparisons[ci];
      if (!c.google) {
        // For neighborhood/category, log if Google has data but no mapping
        if ((c.field === "neighborhood" || c.field === "category") && place.addressDescriptor) {
          unmapped++;
        }
        continue;
      }
      var sheetLower = c.sheet.toLowerCase().trim();
      var googleLower = c.google.toLowerCase().trim();
      if (sheetLower !== googleLower) {
        auditSheet.getRange(auditRow, 1, 1, 8).setValues([[
          venue.row, venue.venueId, venue.name, c.field,
          c.sheet.substring(0, 200), c.google.substring(0, 200),
          "DIFF", "Will update"
        ]]);
        auditRow++;
        diffs++;
      } else {
        matches++;
      }
    }
  }

  auditSheet.insertRowBefore(1);
  auditSheet.getRange(1, 1, 1, 7).setValues([[
    "AUDIT SUMMARY", "Venues: " + venues.length, "Matches: " + matches,
    "Diffs: " + diffs, "Missing data: " + missing,
    "Unmapped (skipped): " + unmapped, "Run updateVenueData() to apply"
  ]]);
  auditSheet.getRange(1, 1, 1, 7).setFontWeight("bold").setBackground("#f0f0f0");

  for (var col = 1; col <= 8; col++) auditSheet.autoResizeColumn(col);

  SpreadsheetApp.getUi().alert(
    "Audit Complete",
    diffs + " differences found across " + venues.length + " venues.\n" +
    missing + " venues missing Google data.\n" +
    unmapped + " fields skipped (no mapping).\n\n" +
    "Review the Audit sheet, then run updateVenueData() to apply.",
    SpreadsheetApp.getUi().ButtonSet.OK
  );
}

// ─── Update ───────────────────────────────────────────────────

function updateVenueData() {
  var ui = SpreadsheetApp.getUi();
  var confirm = ui.alert(
    "Update Venue Data",
    "This will overwrite up to 15 columns with mapped Google Places data.\n" +
    "Neighborhoods and categories are mapped to our taxonomy slugs.\n" +
    "Unmapped values are skipped (sheet keeps current value).\n\n" +
    "Have you reviewed the Audit sheet?",
    ui.ButtonSet.YES_NO
  );
  if (confirm !== ui.Button.YES) return;

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(VENUES_SHEET);
  var data = sheet.getDataRange().getValues();

  var venues = [];
  for (var r = DATA_START_ROW - 1; r < data.length; r++) {
    var v = readVenueRow(data[r]);
    if (!v.venueId || !v.placeId) continue;
    v.row = r + 1;
    venues.push(v);
  }

  var placeDataMap = {};
  for (var i = 0; i < venues.length; i += 50) {
    var batch = venues.slice(i, i + 50);
    var ids = batch.map(function(v) { return v.venueId; });
    var result = fetchPlaceData(ids);
    for (var key in result) placeDataMap[key] = result[key];
    Utilities.sleep(200);
  }

  var today = Utilities.formatDate(new Date(), "America/New_York", "yyyy-MM-dd");
  var updated = 0;
  var skippedHoods = 0;
  var skippedCats = 0;

  for (var vi = 0; vi < venues.length; vi++) {
    var venue = venues[vi];
    var place = placeDataMap[venue.venueId];
    if (!place) continue;

    var r = venue.row;

    // Name
    if (place.displayName && place.displayName.text) {
      sheet.getRange(r, COL.name + 1).setValue(place.displayName.text);
    }

    // Neighborhood (mapped to our slug, skip if no mapping)
    var hood = mapNeighborhood(place);
    if (hood) {
      sheet.getRange(r, COL.neighborhood + 1).setValue(hood);
    } else {
      skippedHoods++;
    }

    // Category (mapped to our slug, skip if no mapping)
    var cat = mapCategory(place);
    if (cat) {
      sheet.getRange(r, COL.category + 1).setValue(cat);
    } else {
      skippedCats++;
    }

    // Price tier
    var pt = getPriceTier(place);
    if (pt) {
      sheet.getRange(r, COL.price_tier + 1).setValue(pt);
    }

    // Address
    if (place.formattedAddress) {
      sheet.getRange(r, COL.address + 1).setValue(place.formattedAddress);
    }

    // Lat/Lng
    if (place.location) {
      sheet.getRange(r, COL.latitude + 1).setValue(place.location.latitude);
      sheet.getRange(r, COL.longitude + 1).setValue(place.location.longitude);
    }

    // Hours
    var hrs = getHours(place);
    if (hrs) {
      sheet.getRange(r, COL.hours + 1).setValue(hrs);
    }

    // Maps URL
    if (place.googleMapsUri) {
      sheet.getRange(r, COL.maps_url + 1).setValue(place.googleMapsUri);
    }

    // Outdoor seating
    var os = getBool(place.outdoorSeating);
    if (os) {
      sheet.getRange(r, COL.outdoor_seating + 1).setValue(os);
    }

    // Dog friendly
    var df = getBool(place.allowsDogs);
    if (df) {
      sheet.getRange(r, COL.dog_friendly + 1).setValue(df);
    }

    // Kid friendly
    var kf = getBool(place.goodForChildren);
    if (kf) {
      sheet.getRange(r, COL.kid_friendly + 1).setValue(kf);
    }

    // Wheelchair accessible
    if (place.accessibilityOptions) {
      var wa = getBool(place.accessibilityOptions.wheelchairAccessibleSeating);
      if (wa) {
        sheet.getRange(r, COL.wheelchair + 1).setValue(wa);
      }
    }

    // Curation note (from Google's editorial summary)
    var summary = getEditorialSummary(place);
    if (summary) {
      sheet.getRange(r, COL.curation_note + 1).setValue(summary);
    }

    // Active (flag closed venues)
    var act = getActive(place);
    if (act) {
      sheet.getRange(r, COL.active + 1).setValue(act);
    }

    // Timestamps
    sheet.getRange(r, COL.last_verified + 1).setValue(today);
    sheet.getRange(r, COL.last_updated + 1).setValue(today);

    updated++;
  }

  ui.alert(
    "Update Complete",
    updated + " venues updated.\n" +
    skippedHoods + " neighborhoods skipped (no mapping).\n" +
    skippedCats + " categories skipped (no mapping).\n\n" +
    "Run 'Sync all venues' from the admin page to push to DB.",
    ui.ButtonSet.OK
  );
}

// ─── Menu ─────────────────────────────────────────────────────

function onOpen() {
  SpreadsheetApp.getUi().createMenu("Composer Tools")
    .addItem("Audit venue data", "auditVenueData")
    .addItem("Update venue data from Google", "updateVenueData")
    .addToUi();
}
