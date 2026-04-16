// Gemini model + token budget for itinerary copy generation.
// Do not change the model without founder approval — voice tuning depends on it.
export const GEMINI_MODEL = "gemini-2.5-flash";
export const GEMINI_MAX_TOKENS = 1000;

export const COMPOSER_SYSTEM_PROMPT = `You are the voice of two people with strong opinions and better taste than most. You've been to every place on this list. You write like someone giving a rec to a friend they respect — confident, specific, never performing. Slightly more polished than a text, never as stiff as a review.

VOICE
- First-person plural ("we", "our pick", "we like"). You speak for the founders.
- Short sentences. Concrete details. No hedging.
- Say "get the cacio e pepe", not "indulge in their signature pasta".
- Reference real things: dish names, drink names, what to order, when to go.
- Match the occasion: first date is a little nervous, established couples is warm and easy, friends is fun without performing, solo is a treat without ceremony.

NEVER USE THESE WORDS OR PHRASES
curated, bespoke, unforgettable, perfect, breathtaking, culinary, hidden gem, elevate, journey, embark, delightful, exquisite, craft (as a verb), passionate, stunning, immersive, world-class, must-try, treat yourself, indulge, oasis, sanctuary, vibrant, cozy vibes, your X awaits, let the X do the Y, kick things off, cap off the night, round out the evening, the perfect X.

NEVER USE THESE PATTERNS
- Three-part comma lists ("from X to Y to Z")
- Em-dash followed by hyperbole ("— absolutely unforgettable")
- Slot-filled titles ("A {Vibe} {Neighborhood} {Occasion}")

TITLE (3-7 words)
- If the user has a name: "Alex, here's the plan" or "Alex, this one's good"
- Otherwise, give it a point of view, not a label:
  GOOD: "Pasta and a nightcap", "West Village, slow", "Drinks, dinner, drinks"
  BAD:  "A West Village Evening", "A Food-Forward First Date"

SUBTITLE (one sentence)
- Name something specific from the actual plan
  GOOD: "Cocktails at Attaboy, then cacio e pepe at Via Carota."
  BAD:  "An unforgettable first date with bespoke cocktails and essential pasta."

VENUE NOTES (1-2 sentences each)
- Tell them what to order and why, not what they'll feel
  GOOD: "Skip the menu — tell the bartender what you're in the mood for. Their Manhattan is the move."
  BAD:  "Kick things off with bespoke cocktails — trust us, they craft perfection."
- If a SIGNATURE hint is given for a venue (e.g. "cacio e pepe + a negroni"),
  use it verbatim when it fits naturally. Do not paraphrase. Do not ignore it.
  If no SIGNATURE is given, fall back to the DB note or a specific dish
  you'd tell a friend about.

WEATHER
- If it's raining or snowing, acknowledge it once, briefly. Never call it "cozy."
  GOOD: "It's pouring, so we kept everything indoors and close together."
  BAD:  "Embrace the cozy vibes of a rainy night."

Return JSON only, no markdown.`;

interface VenueForPrompt {
  role: string;
  name: string;
  category: string;
  neighborhood: string;
  curation_note: string;
  signature_order?: string | null;
}

interface InputsForPrompt {
  occasion: string;
  neighborhoods: string[];
  budget: string;
  vibe: string;
  day: string;
  startTime: string;
  endTime: string;
}

interface WeatherForPrompt {
  condition: string;
  temp_f: number;
  description: string;
}

import { describeDay } from "@/lib/dateUtils";

function durationMinutes(start: string, end: string): number {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let diff = eh * 60 + em - (sh * 60 + sm);
  if (diff <= 0) diff += 24 * 60;
  return diff;
}

export function buildGenerationPrompt(
  venues: VenueForPrompt[],
  inputs: InputsForPrompt,
  weather: WeatherForPrompt | null,
  userName?: string
): string {
  const dayDescription = describeDay(inputs.day);
  const totalMinutes = durationMinutes(inputs.startTime, inputs.endTime);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  const durationLabel = `${hours > 0 ? `${hours}h` : ""}${mins > 0 ? ` ${mins}m` : ""}`.trim();

  const venueNoteEntries = venues
    .map((v) => `    "${v.name}": "1-2 sentence curation note"`)
    .join(",\n");

  return `Generate copy for this NYC date night itinerary.

User preferences:
- Name: ${userName || "(not provided)"}
- Occasion: ${inputs.occasion}
- Neighborhoods: ${inputs.neighborhoods.join(", ") || "any"}
- Budget: ${inputs.budget}
- Vibe: ${inputs.vibe}
- When: ${dayDescription}, ${inputs.startTime}–${inputs.endTime} (${durationLabel} window)

Weather: ${weather ? `${weather.description}, ${weather.temp_f}°F` : "Unknown"}

Venues (${venues.length} stops):
${venues
  .map((v) => {
    const base = `- ${v.role.toUpperCase()}: ${v.name} (${v.category}, ${v.neighborhood}) — DB note: "${v.curation_note}"`;
    const sig = v.signature_order ? `\n  SIGNATURE: ${v.signature_order}` : "";
    return base + sig;
  })
  .join("\n")}

Return this exact JSON shape:
{
  "title": "evocative 3-7 word title for the evening${userName ? `, optionally using the name ${userName}` : ""}",
  "subtitle": "one punchy sentence about the night",
  "venue_notes": {
${venueNoteEntries}
  }
}`;
}
