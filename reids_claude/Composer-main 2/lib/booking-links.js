/**
 * Booking-link builder.
 *
 * Given a place (name, category, address) and a target date/time/party size,
 * returns one "primary" booking link and two "alternates" so the user can
 * click through to Resy / OpenTable / Tock / SevenRooms with the date, time,
 * and party size already filled in.
 *
 * We do NOT call any partner APIs here — those are gated behind partnerships
 * we don't have. Instead we:
 *
 *   1. Look the venue up in a small curated NYC map (getPrimaryPlatform) to
 *      pick the most likely platform.
 *   2. Build a deep link with query params that pre-select the date / time /
 *      party size on that platform.
 *   3. Fill the remaining two slots with deep links on the other most likely
 *      platforms, so the user always has three clickable options.
 *
 * Each platform's URL format was verified from its public search/booking
 * pages:
 *
 *   Resy       https://resy.com/cities/ny?date=YYYY-MM-DD&seats=N
 *              (name-matched via ?query=)
 *   OpenTable  https://www.opentable.com/s?term=NAME&dateTime=YYYY-MM-DDTHH:MM&covers=N
 *   Tock       https://www.exploretock.com/search?query=NAME&date=YYYY-MM-DD&time=HH:MM&size=N
 *   SevenRooms https://www.sevenrooms.com/search/NAME (SevenRooms is venue-
 *              hosted; each restaurant has its own reservation widget, so we
 *              deep-link to SevenRooms' public search.)
 */

/* ─── Known NYC venue → primary platform ────────────────────────────
   This is a seed list. It doesn't have to be exhaustive — any venue not in
   it defaults to OpenTable (widest NYC coverage), then Resy, then Tock as
   alternates. Lowercased for case-insensitive matching. */
const VENUE_PLATFORM_HINTS = {
  // Resy-first NYC spots
  'carbone': 'resy',
  'torrisi': 'resy',
  "don angie": 'resy',
  'cote': 'resy',
  'estela': 'resy',
  'the four horsemen': 'resy',
  'cosme': 'resy',
  'atomix': 'resy',
  'atoboy': 'resy',
  'lilia': 'resy',
  'misi': 'resy',
  'via carota': 'resy',
  "l'artusi": 'resy',
  'lartusi': 'resy',
  'rosemary': 'resy',
  "rosemary's": 'resy',
  'balthazar': 'resy',
  'pastis': 'resy',
  'dante': 'resy',
  'kings of kings': 'resy',
  'raouls': 'resy',
  "raoul's": 'resy',
  'frenchette': 'resy',
  'the nines': 'resy',
  'bar pitti': 'resy',
  'superiority burger': 'resy',
  'anton': 'resy',
  "anton's": 'resy',
  'emmy squared': 'resy',
  'the odeon': 'resy',
  'minetta tavern': 'resy',
  'bar primi': 'resy',
  'sant ambroeus': 'resy',
  'clover hill': 'resy',

  // Tock-first NYC spots (tasting menus, chef-driven)
  'eleven madison park': 'tock',
  'eleven madison': 'tock',
  'blue hill': 'tock',
  'blue hill at stone barns': 'tock',
  'le bernardin': 'tock',
  'per se': 'tock',
  'jungsik': 'tock',
  'aska': 'tock',
  'oxomoco': 'tock',
  'semma': 'tock',
  'sushi nakazawa': 'tock',
  'shion 69 leonard street': 'tock',
  'saga': 'tock',
  'overstory': 'tock',
  'crown shy': 'tock',

  // SevenRooms (venue-hosted widgets; mostly hotel restaurants + boutique)
  'the modern': 'sevenrooms',
  'gramercy tavern': 'opentable', // OT host
  'the nomad': 'sevenrooms',
  'bemelmans bar': 'sevenrooms',
  "bemelman's bar": 'sevenrooms',
  'the polo bar': 'sevenrooms',
  'polo bar': 'sevenrooms',
  'the grill': 'sevenrooms',
  'the pool': 'sevenrooms',

  // OpenTable-first NYC spots (large chains, hotel restaurants, traditional)
  'union square cafe': 'opentable',
  'gotham bar and grill': 'opentable',
  'nobu': 'opentable',
  'nobu downtown': 'opentable',
  'tao': 'opentable',
  'buddakan': 'opentable',
  'rosa mexicano': 'opentable',
  'morton': 'opentable',
  "morton's": 'opentable',
  'capital grille': 'opentable',
  'the capital grille': 'opentable',
  "del frisco's": 'opentable',
  'del friscos': 'opentable',
  "smith & wollensky": 'opentable',
  'dabney': 'opentable',
};

/* Default platform ranking when we don't recognize the venue. OpenTable has
   the widest NYC coverage so it's the safest primary; Resy is the hip/indie
   default; Tock captures tasting-menu and prepaid spots; SevenRooms is the
   least common. */
const DEFAULT_RANK = ['opentable', 'resy', 'tock', 'sevenrooms'];

/* Only show booking links for these categories. A museum or park doesn't
   need a Resy link. */
const BOOKABLE_CATEGORIES = new Set([
  'restaurant',
  'bar',
  'cafe',
  'wine bar',
  'cocktail bar',
  'italian restaurant',
  'japanese restaurant',
  'sushi restaurant',
  'french restaurant',
  'steak house',
  'pizza restaurant',
  'seafood restaurant',
  'mexican restaurant',
  'korean restaurant',
  'chinese restaurant',
  'thai restaurant',
  'american restaurant',
  'fine dining restaurant',
]);

/**
 * Is this place worth showing booking badges for?
 */
export function isBookable(place) {
  if (!place) return false;
  const cat = (place.category || '').toLowerCase();
  if (BOOKABLE_CATEGORIES.has(cat)) return true;
  // Fallback: any string containing "restaurant" / "bar" / "cafe".
  return /restaurant|bar|cafe|bistro|gastropub|eatery|dining/.test(cat);
}

/** Return the primary platform id for a given place name. */
function getPrimaryPlatform(placeName) {
  if (!placeName) return DEFAULT_RANK[0];
  const normalized = placeName.toLowerCase().trim();
  // Try a full-name match first
  if (VENUE_PLATFORM_HINTS[normalized]) return VENUE_PLATFORM_HINTS[normalized];
  // Try without leading "the "
  const noThe = normalized.replace(/^the\s+/, '');
  if (VENUE_PLATFORM_HINTS[noThe]) return VENUE_PLATFORM_HINTS[noThe];
  // Prefix match on curated keys (e.g. "Cote Korean Steakhouse" → "cote")
  for (const key of Object.keys(VENUE_PLATFORM_HINTS)) {
    if (normalized.startsWith(key) || noThe.startsWith(key)) {
      return VENUE_PLATFORM_HINTS[key];
    }
  }
  return DEFAULT_RANK[0];
}

/**
 * Convert "7:30 PM" style (or "19:30") to "HH:MM" 24-hour.
 */
function to24h(timeStr) {
  if (!timeStr) return '19:00';
  const trimmed = String(timeStr).trim();
  // Already 24h?
  if (/^\d{1,2}:\d{2}$/.test(trimmed)) {
    const [h, m] = trimmed.split(':').map(Number);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  const m = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return '19:00';
  let hour = parseInt(m[1], 10);
  const min = m[2];
  const period = m[3].toUpperCase();
  if (period === 'PM' && hour !== 12) hour += 12;
  if (period === 'AM' && hour === 12) hour = 0;
  return `${String(hour).padStart(2, '0')}:${min}`;
}

/**
 * Per-platform deep-link builders. Each takes the same shape and returns a
 * URL string. They deliberately fall back to the platform's search page if
 * they can't build a venue-specific URL.
 */
const PLATFORM_BUILDERS = {
  resy: ({ name, date, time, partySize }) => {
    const t = to24h(time);
    const qs = new URLSearchParams({
      date,
      seats: String(partySize),
      query: name || '',
      time: t,
    });
    return `https://resy.com/cities/ny?${qs.toString()}`;
  },
  opentable: ({ name, date, time, partySize }) => {
    const t = to24h(time);
    const qs = new URLSearchParams({
      term: name || '',
      dateTime: `${date}T${t}`,
      covers: String(partySize),
    });
    return `https://www.opentable.com/s?${qs.toString()}`;
  },
  tock: ({ name, date, time, partySize }) => {
    const t = to24h(time);
    const qs = new URLSearchParams({
      query: name || '',
      date,
      time: t,
      size: String(partySize),
    });
    return `https://www.exploretock.com/search?${qs.toString()}`;
  },
  sevenrooms: ({ name }) => {
    // SevenRooms has no public search with date/time pre-fill. Best we can
    // do is route the user to a Google search constrained to sevenrooms.com
    // so they land on the venue's own widget.
    const q = encodeURIComponent(`${name || ''} site:sevenrooms.com`);
    return `https://www.google.com/search?q=${q}`;
  },
};

const PLATFORM_LABELS = {
  resy: 'Resy',
  opentable: 'OpenTable',
  tock: 'Tock',
  sevenrooms: 'SevenRooms',
};

/**
 * Build { primary, alternates: [a, b] } for a place.
 *
 * @param {object} place       – resolved place with at least { name, category }
 * @param {object} opts
 * @param {string} opts.date   – "YYYY-MM-DD"
 * @param {string} opts.time   – arrival time, "HH:MM" or "7:30 PM"
 * @param {number} opts.partySize – default 2
 * @returns {{ primary: object, alternates: object[] } | null}
 */
export function buildBookingLinks(place, { date, time, partySize = 2 } = {}) {
  if (!place || !isBookable(place)) return null;
  if (!date) return null;

  const name = place.name;

  const primaryId = getPrimaryPlatform(name);
  // Build the full priority list: primary first, then the rest of the
  // default rank in order, skipping duplicates.
  const ordered = [primaryId, ...DEFAULT_RANK.filter((p) => p !== primaryId)];

  const built = ordered
    .map((platformId) => {
      const builder = PLATFORM_BUILDERS[platformId];
      if (!builder) return null;
      try {
        const url = builder({ name, date, time, partySize });
        return {
          platform: platformId,
          label: PLATFORM_LABELS[platformId] || platformId,
          url,
        };
      } catch (err) {
        return null;
      }
    })
    .filter(Boolean);

  if (built.length === 0) return null;

  return {
    primary: built[0],
    alternates: built.slice(1, 3), // exactly 2 alternates
  };
}

export const __private__ = {
  getPrimaryPlatform,
  to24h,
  PLATFORM_BUILDERS,
};
