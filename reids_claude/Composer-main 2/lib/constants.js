// ─── Neighborhoods ───────────────────────────────────────────────────────────
// Manhattan & Brooklyn neighborhoods with Google Places-friendly search terms

// Each neighborhood carries an approximate centroid (lat/lng) so the
// itinerary engine can bound its Google Places searches. These are hand-
// picked to sit roughly in the middle of each walkable zone.
export const NEIGHBORHOODS = {
  manhattan: [
    { id: 'les', name: 'Lower East Side', searchTerm: 'Lower East Side Manhattan', center: { lat: 40.7155, lng: -73.9870 } },
    { id: 'east-village', name: 'East Village', searchTerm: 'East Village Manhattan', center: { lat: 40.7265, lng: -73.9815 } },
    { id: 'west-village', name: 'West Village', searchTerm: 'West Village Manhattan', center: { lat: 40.7350, lng: -74.0045 } },
    { id: 'greenwich', name: 'Greenwich Village', searchTerm: 'Greenwich Village Manhattan', center: { lat: 40.7336, lng: -74.0027 } },
    { id: 'soho', name: 'SoHo', searchTerm: 'SoHo Manhattan', center: { lat: 40.7233, lng: -74.0030 } },
    { id: 'nolita', name: 'Nolita', searchTerm: 'Nolita Manhattan', center: { lat: 40.7222, lng: -73.9955 } },
    { id: 'chelsea', name: 'Chelsea', searchTerm: 'Chelsea Manhattan', center: { lat: 40.7465, lng: -74.0014 } },
    { id: 'flatiron', name: 'Flatiron', searchTerm: 'Flatiron Manhattan', center: { lat: 40.7410, lng: -73.9896 } },
    { id: 'midtown', name: 'Midtown', searchTerm: 'Midtown Manhattan', center: { lat: 40.7549, lng: -73.9840 } },
    { id: 'ues', name: 'Upper East Side', searchTerm: 'Upper East Side Manhattan', center: { lat: 40.7735, lng: -73.9565 } },
    { id: 'uws', name: 'Upper West Side', searchTerm: 'Upper West Side Manhattan', center: { lat: 40.7870, lng: -73.9754 } },
    { id: 'harlem', name: 'Harlem', searchTerm: 'Harlem Manhattan', center: { lat: 40.8116, lng: -73.9465 } },
    { id: 'tribeca', name: 'Tribeca', searchTerm: 'Tribeca Manhattan', center: { lat: 40.7163, lng: -74.0086 } },
    { id: 'chinatown', name: 'Chinatown', searchTerm: 'Chinatown Manhattan', center: { lat: 40.7158, lng: -73.9970 } },
    { id: 'fidi', name: 'Financial District', searchTerm: 'Financial District Manhattan', center: { lat: 40.7075, lng: -74.0113 } },
    { id: 'hells-kitchen', name: "Hell's Kitchen", searchTerm: "Hell's Kitchen Manhattan", center: { lat: 40.7638, lng: -73.9918 } },
    { id: 'murray-hill', name: 'Murray Hill', searchTerm: 'Murray Hill Manhattan', center: { lat: 40.7478, lng: -73.9784 } },
    { id: 'gramercy', name: 'Gramercy', searchTerm: 'Gramercy Manhattan', center: { lat: 40.7378, lng: -73.9857 } },
  ],
  brooklyn: [
    { id: 'williamsburg', name: 'Williamsburg', searchTerm: 'Williamsburg Brooklyn', center: { lat: 40.7081, lng: -73.9571 } },
    { id: 'dumbo', name: 'DUMBO', searchTerm: 'DUMBO Brooklyn', center: { lat: 40.7033, lng: -73.9890 } },
    { id: 'brooklyn-heights', name: 'Brooklyn Heights', searchTerm: 'Brooklyn Heights', center: { lat: 40.6958, lng: -73.9936 } },
    { id: 'park-slope', name: 'Park Slope', searchTerm: 'Park Slope Brooklyn', center: { lat: 40.6710, lng: -73.9814 } },
    { id: 'cobble-hill', name: 'Cobble Hill', searchTerm: 'Cobble Hill Brooklyn', center: { lat: 40.6874, lng: -73.9960 } },
    { id: 'boerum-hill', name: 'Boerum Hill', searchTerm: 'Boerum Hill Brooklyn', center: { lat: 40.6855, lng: -73.9845 } },
    { id: 'fort-greene', name: 'Fort Greene', searchTerm: 'Fort Greene Brooklyn', center: { lat: 40.6895, lng: -73.9745 } },
    { id: 'bushwick', name: 'Bushwick', searchTerm: 'Bushwick Brooklyn', center: { lat: 40.6944, lng: -73.9213 } },
    { id: 'greenpoint', name: 'Greenpoint', searchTerm: 'Greenpoint Brooklyn', center: { lat: 40.7290, lng: -73.9540 } },
    { id: 'prospect-heights', name: 'Prospect Heights', searchTerm: 'Prospect Heights Brooklyn', center: { lat: 40.6770, lng: -73.9680 } },
    { id: 'crown-heights', name: 'Crown Heights', searchTerm: 'Crown Heights Brooklyn', center: { lat: 40.6695, lng: -73.9440 } },
    { id: 'bed-stuy', name: 'Bed-Stuy', searchTerm: 'Bed-Stuy Brooklyn', center: { lat: 40.6872, lng: -73.9418 } },
    { id: 'carroll-gardens', name: 'Carroll Gardens', searchTerm: 'Carroll Gardens Brooklyn', center: { lat: 40.6795, lng: -73.9975 } },
    { id: 'red-hook', name: 'Red Hook', searchTerm: 'Red Hook Brooklyn', center: { lat: 40.6755, lng: -74.0090 } },
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
    description: 'Easygoing spots',
    symbol: '$',
    priceLevel: 1,
    emoji: '💚',
  },
  {
    id: 'solid',
    name: 'Solid',
    description: 'A good night out',
    symbol: '$$',
    priceLevel: 2,
    emoji: '💛',
  },
  {
    id: 'splurge',
    name: 'Splurge',
    description: 'Treat yourselves',
    symbol: '$$$',
    priceLevel: 3,
    emoji: '🧡',
  },
  {
    id: 'all-out',
    name: 'All Out',
    description: 'The full experience',
    symbol: '$$$$',
    priceLevel: 4,
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
