// ─── Neighborhoods ───────────────────────────────────────────────────────────
// Manhattan & Brooklyn neighborhoods with Google Places-friendly search terms

export const NEIGHBORHOODS = {
  manhattan: [
    { id: 'les', name: 'Lower East Side', searchTerm: 'Lower East Side Manhattan' },
    { id: 'east-village', name: 'East Village', searchTerm: 'East Village Manhattan' },
    { id: 'west-village', name: 'West Village', searchTerm: 'West Village Manhattan' },
    { id: 'greenwich', name: 'Greenwich Village', searchTerm: 'Greenwich Village Manhattan' },
    { id: 'soho', name: 'SoHo', searchTerm: 'SoHo Manhattan' },
    { id: 'nolita', name: 'Nolita', searchTerm: 'Nolita Manhattan' },
    { id: 'chelsea', name: 'Chelsea', searchTerm: 'Chelsea Manhattan' },
    { id: 'flatiron', name: 'Flatiron', searchTerm: 'Flatiron Manhattan' },
    { id: 'midtown', name: 'Midtown', searchTerm: 'Midtown Manhattan' },
    { id: 'ues', name: 'Upper East Side', searchTerm: 'Upper East Side Manhattan' },
    { id: 'uws', name: 'Upper West Side', searchTerm: 'Upper West Side Manhattan' },
    { id: 'harlem', name: 'Harlem', searchTerm: 'Harlem Manhattan' },
    { id: 'tribeca', name: 'Tribeca', searchTerm: 'Tribeca Manhattan' },
    { id: 'chinatown', name: 'Chinatown', searchTerm: 'Chinatown Manhattan' },
    { id: 'fidi', name: 'Financial District', searchTerm: 'Financial District Manhattan' },
    { id: 'hells-kitchen', name: "Hell's Kitchen", searchTerm: "Hell's Kitchen Manhattan" },
    { id: 'murray-hill', name: 'Murray Hill', searchTerm: 'Murray Hill Manhattan' },
    { id: 'gramercy', name: 'Gramercy', searchTerm: 'Gramercy Manhattan' },
  ],
  brooklyn: [
    { id: 'williamsburg', name: 'Williamsburg', searchTerm: 'Williamsburg Brooklyn' },
    { id: 'dumbo', name: 'DUMBO', searchTerm: 'DUMBO Brooklyn' },
    { id: 'brooklyn-heights', name: 'Brooklyn Heights', searchTerm: 'Brooklyn Heights' },
    { id: 'park-slope', name: 'Park Slope', searchTerm: 'Park Slope Brooklyn' },
    { id: 'cobble-hill', name: 'Cobble Hill', searchTerm: 'Cobble Hill Brooklyn' },
    { id: 'boerum-hill', name: 'Boerum Hill', searchTerm: 'Boerum Hill Brooklyn' },
    { id: 'fort-greene', name: 'Fort Greene', searchTerm: 'Fort Greene Brooklyn' },
    { id: 'bushwick', name: 'Bushwick', searchTerm: 'Bushwick Brooklyn' },
    { id: 'greenpoint', name: 'Greenpoint', searchTerm: 'Greenpoint Brooklyn' },
    { id: 'prospect-heights', name: 'Prospect Heights', searchTerm: 'Prospect Heights Brooklyn' },
    { id: 'crown-heights', name: 'Crown Heights', searchTerm: 'Crown Heights Brooklyn' },
    { id: 'bed-stuy', name: 'Bed-Stuy', searchTerm: 'Bed-Stuy Brooklyn' },
    { id: 'carroll-gardens', name: 'Carroll Gardens', searchTerm: 'Carroll Gardens Brooklyn' },
    { id: 'red-hook', name: 'Red Hook', searchTerm: 'Red Hook Brooklyn' },
  ],
};

export const ALL_NEIGHBORHOODS = [
  ...NEIGHBORHOODS.manhattan,
  ...NEIGHBORHOODS.brooklyn,
];

// ─── Vibes ───────────────────────────────────────────────────────────────────
export const VIBES = [
  {
    id: 'cozy',
    name: 'Cozy & Intimate',
    emoji: '🕯️',
    description: 'Candlelit spots, quiet corners, speakeasies',
    searchTerms: ['romantic', 'intimate', 'cozy', 'candlelit', 'speakeasy'],
    color: '#C44536',
  },
  {
    id: 'fun',
    name: 'Fun & Spontaneous',
    emoji: '🎉',
    description: 'Games, karaoke, comedy, lively energy',
    searchTerms: ['fun', 'lively', 'games', 'karaoke', 'entertainment'],
    color: '#FF9838',
  },
  {
    id: 'classy',
    name: 'Classy Night Out',
    emoji: '🥂',
    description: 'Upscale dining, cocktail bars, rooftops',
    searchTerms: ['upscale', 'fine dining', 'cocktail bar', 'rooftop'],
    color: '#2E294E',
  },
  {
    id: 'creative',
    name: 'Creative & Unique',
    emoji: '🎨',
    description: 'Art, galleries, workshops, something different',
    searchTerms: ['art', 'gallery', 'workshop', 'creative', 'unique'],
    color: '#7B68EE',
  },
  {
    id: 'active',
    name: 'Active & Outdoors',
    emoji: '🌿',
    description: 'Parks, walks, biking, outdoor adventures',
    searchTerms: ['outdoor', 'park', 'walking', 'active', 'nature'],
    color: '#3B7A57',
  },
  {
    id: 'chill',
    name: 'Chill & Lowkey',
    emoji: '☕',
    description: 'Coffee shops, bookstores, farmers markets',
    searchTerms: ['casual', 'cafe', 'coffee shop', 'relaxed', 'lowkey'],
    color: '#8B7355',
  },
];

// ─── Budget Tiers (updated: total for two, for the whole evening) ───────────
export const BUDGET_TIERS = [
  {
    id: 'chill',
    name: 'Chill',
    description: '$50–$100 for two',
    priceLevel: 1,
    range: { min: 50, max: 100 },
    emoji: '💚',
  },
  {
    id: 'solid',
    name: 'Solid',
    description: '$100–$200 for two',
    priceLevel: 2,
    range: { min: 100, max: 200 },
    emoji: '💛',
  },
  {
    id: 'splurge',
    name: 'Splurge',
    description: '$200–$400 for two',
    priceLevel: 3,
    range: { min: 200, max: 400 },
    emoji: '🧡',
  },
  {
    id: 'all-out',
    name: 'All Out',
    description: '$400+ for two',
    priceLevel: 4,
    range: { min: 400, max: null },
    emoji: '❤️',
  },
];

// ─── Date Types ──────────────────────────────────────────────────────────────
export const DATE_TYPES = [
  {
    id: 'first-date',
    name: 'First Date',
    description: 'Keep it casual, easy exit option',
    emoji: '👋',
  },
  {
    id: 'early-dating',
    name: 'Early Dating',
    description: 'A little more adventurous',
    emoji: '🌟',
  },
  {
    id: 'date-night',
    name: 'Date Night',
    description: 'Make it a great night',
    emoji: '✨',
  },
  {
    id: 'special-occasion',
    name: 'Special Occasion',
    description: 'Go all out, reservations included',
    emoji: '🎁',
  },
];

// ─── Place Categories (for Google Places search) ─────────────────────────────
export const PLACE_CATEGORIES = {
  restaurant: {
    types: ['restaurant'],
    label: 'Restaurant',
  },
  bar: {
    types: ['bar', 'night_club'],
    label: 'Bar / Lounge',
  },
  cafe: {
    types: ['cafe', 'bakery'],
    label: 'Cafe',
  },
  activity: {
    types: ['amusement_center', 'bowling_alley', 'tourist_attraction'],
    label: 'Activity',
  },
  culture: {
    types: ['art_gallery', 'museum', 'performing_arts_theater'],
    label: 'Culture',
  },
  outdoors: {
    types: ['park', 'hiking_area'],
    label: 'Outdoors',
  },
};

// ─── Curated Event Sources ───────────────────────────────────────────────────
export const CURATED_VENUES = [
  {
    id: 'comedy-cellar',
    name: 'Comedy Cellar',
    type: 'comedy',
    neighborhood: 'greenwich',
    website: 'https://www.comedycellar.com',
    address: '117 MacDougal St, New York, NY 10012',
    vibes: ['fun', 'cozy'],
    priceRange: { min: 20, max: 40 },
    bookingUrl: 'https://www.comedycellar.com/reservation/',
  },
  {
    id: 'city-winery-nyc',
    name: 'City Winery NYC',
    type: 'music_venue',
    neighborhood: 'hells-kitchen',
    website: 'https://citywinery.com/new-york-city',
    address: '25 11th Ave, New York, NY 10011',
    vibes: ['cozy', 'classy', 'creative'],
    priceRange: { min: 30, max: 100 },
    bookingUrl: 'https://citywinery.com/pages/events/new-york-city',
  },
  {
    id: 'village-vanguard',
    name: 'Village Vanguard',
    type: 'jazz',
    neighborhood: 'greenwich',
    website: 'https://villagevanguard.com',
    address: '178 7th Ave S, New York, NY 10014',
    vibes: ['cozy', 'classy', 'creative'],
    priceRange: { min: 35, max: 50 },
    bookingUrl: 'https://villagevanguard.com',
  },
  {
    id: 'blue-note',
    name: 'Blue Note Jazz Club',
    type: 'jazz',
    neighborhood: 'greenwich',
    website: 'https://www.bluenotejazz.com',
    address: '131 W 3rd St, New York, NY 10012',
    vibes: ['cozy', 'classy'],
    priceRange: { min: 30, max: 85 },
    bookingUrl: 'https://www.bluenotejazz.com/new-york/schedule/',
  },
  {
    id: 'sleep-no-more',
    name: 'Sleep No More',
    type: 'immersive_theater',
    neighborhood: 'chelsea',
    website: 'https://mckittrickhotel.com',
    address: '530 W 27th St, New York, NY 10001',
    vibes: ['creative', 'classy'],
    priceRange: { min: 100, max: 175 },
    bookingUrl: 'https://mckittrickhotel.com/sleep-no-more/',
  },
  {
    id: 'smorgasburg',
    name: 'Smorgasburg',
    type: 'food_market',
    neighborhood: 'williamsburg',
    website: 'https://www.smorgasburg.com',
    address: '90 Kent Ave, Brooklyn, NY 11249',
    vibes: ['fun', 'chill', 'active'],
    priceRange: { min: 15, max: 40 },
    bookingUrl: null,
  },
];

// ─── Text Message Templates ──────────────────────────────────────────────────
export const MESSAGE_TONES = [
  {
    id: 'confident',
    name: 'Confident',
    description: 'Direct and decisive',
    template: (name, place, day, time) =>
      `Hey! Let's do ${place} on ${day} at ${time}. You're going to love it.`,
  },
  {
    id: 'casual',
    name: 'Casual',
    description: 'Relaxed and easy',
    template: (name, place, day, time) =>
      `Hey ${name}, how about ${place} on ${day} around ${time}?`,
  },
  {
    id: 'sweet',
    name: 'Sweet',
    description: 'Warm and thoughtful',
    template: (name, place, day, time) =>
      `I found this place I think you'd really like — ${place}. Are you free ${day} at ${time}?`,
  },
];

// ─── Day & Time Options ──────────────────────────────────────────────────────
// TIME_SLOTS removed — replaced by start/end time picker with 15-min increments
