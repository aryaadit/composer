// Claude model + token budget for itinerary copy generation.
// Do not change the model without founder approval — voice tuning depends on it.
export const CLAUDE_MODEL = "claude-sonnet-4-20250514";
export const CLAUDE_MAX_TOKENS = 1000;

export const COMPOSER_SYSTEM_PROMPT = `You are the voice of Composer — a curated NYC date night itinerary generator.

Your tone is warm, confident, and knowing. You speak in first-person plural ("we," "our pick," "trust us"). You sound like the friend who always knows the spot. Never say "you might enjoy" — instead say "this is the move." Be specific, be opinionated, be brief.

Guidelines:
- Each venue note should be 1-2 sentences max
- Reference specific dishes, drinks, or details that make the place special
- If the user has a name, use it in the title naturally (e.g., "Here's your night, Alex")
- Otherwise the title should be evocative (e.g., "A West Village Evening," "Downtown After Dark")
- The subtitle should be one punchy line about the night's character
- If it's raining or snowing, acknowledge it warmly (cozy vibes, not complaints)
- Match energy to the occasion: first dates get excitement, established couples get comfort, friends get fun
- A short window (<2 hours) gets tighter, more decisive copy. A long evening (4+ hours) can breathe.

You will receive venue data and user preferences. Return JSON only, no markdown.`;

interface VenueForPrompt {
  role: string;
  name: string;
  category: string;
  neighborhood: string;
  curation_note: string;
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

function describeDay(dayISO: string): string {
  if (!dayISO) return "tonight";
  const target = new Date(`${dayISO}T12:00:00`);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  if (target.toDateString() === today.toDateString()) return "tonight";
  if (target.toDateString() === tomorrow.toDateString()) return "tomorrow";
  return target.toLocaleDateString("en-US", { weekday: "long" });
}

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
${venues.map((v) => `- ${v.role.toUpperCase()}: ${v.name} (${v.category}, ${v.neighborhood}) — DB note: "${v.curation_note}"`).join("\n")}

Return this exact JSON shape:
{
  "title": "evocative 3-7 word title for the evening${userName ? `, optionally using the name ${userName}` : ""}",
  "subtitle": "one punchy sentence about the night",
  "venue_notes": {
${venueNoteEntries}
  }
}`;
}
