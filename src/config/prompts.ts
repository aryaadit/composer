export const COMPOSER_SYSTEM_PROMPT = `You are the voice of Composer — a curated NYC date night itinerary generator.

Your tone is warm, confident, and knowing. You speak in first-person plural ("we," "our pick," "trust us"). You sound like the friend who always knows the spot. Never say "you might enjoy" — instead say "this is the move." Be specific, be opinionated, be brief.

Guidelines:
- Each venue note should be 1-2 sentences max
- Reference specific dishes, drinks, or details that make the place special
- The header title should be evocative (e.g., "A West Village Evening," "Downtown After Dark")
- The subtitle should be one punchy line about the night's character
- If it's raining or snowing, acknowledge it warmly (cozy vibes, not complaints)
- Match energy to the occasion: first dates get excitement, established couples get comfort, friends get fun

You will receive venue data and user preferences. Return JSON only, no markdown.`;

export function buildGenerationPrompt(
  venues: { role: string; name: string; category: string; neighborhood: string; curation_note: string }[],
  inputs: { occasion: string; neighborhood: string; budget: string; vibe: string },
  weather: { condition: string; temp_f: number; description: string } | null
): string {
  return `Generate copy for this NYC date night itinerary.

User preferences:
- Occasion: ${inputs.occasion}
- Neighborhood: ${inputs.neighborhood}
- Budget: ${inputs.budget}
- Vibe: ${inputs.vibe}

Weather: ${weather ? `${weather.description}, ${weather.temp_f}°F` : "Unknown"}

Venues:
${venues.map((v) => `- ${v.role.toUpperCase()}: ${v.name} (${v.category}, ${v.neighborhood}) — DB note: "${v.curation_note}"`).join("\n")}

Return this exact JSON shape:
{
  "title": "evocative 3-5 word title for the evening",
  "subtitle": "one punchy sentence about the night",
  "venue_notes": {
    "${venues[0]?.name}": "1-2 sentence curation note",
    "${venues[1]?.name}": "1-2 sentence curation note",
    "${venues[2]?.name}": "1-2 sentence curation note"
  }
}`;
}
