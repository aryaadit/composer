import Anthropic from "@anthropic-ai/sdk";
import {
  COMPOSER_SYSTEM_PROMPT,
  CLAUDE_MODEL,
  CLAUDE_MAX_TOKENS,
  buildGenerationPrompt,
} from "@/config/prompts";
import { ItineraryStop, QuestionnaireAnswers, WeatherInfo } from "@/types";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

interface ClaudeCopy {
  title: string;
  subtitle: string;
  venue_notes: Record<string, string>;
}

export async function generateCopy(
  stops: ItineraryStop[],
  inputs: QuestionnaireAnswers,
  weather: WeatherInfo | null,
  userName?: string
): Promise<ClaudeCopy> {
  const venueData = stops.map((s) => ({
    role: s.role,
    name: s.venue.name,
    category: s.venue.category,
    neighborhood: s.venue.neighborhood,
    curation_note: s.venue.curation_note,
  }));

  const prompt = buildGenerationPrompt(venueData, inputs, weather, userName);

  try {
    const response = await anthropic.messages.create({
      model: CLAUDE_MODEL,
      max_tokens: CLAUDE_MAX_TOKENS,
      system: COMPOSER_SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";

    // Extract JSON from response (handle possible markdown wrapping)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");

    return JSON.parse(jsonMatch[0]) as ClaudeCopy;
  } catch {
    // Graceful fallback: use DB curation notes
    const venue_notes: Record<string, string> = {};
    for (const stop of stops) {
      venue_notes[stop.venue.name] = stop.venue.curation_note;
    }

    return {
      title: userName ? `Here's your night, ${userName}` : "Your Night, Composed",
      subtitle: `${stops.length} stops, one perfect evening.`,
      venue_notes,
    };
  }
}
