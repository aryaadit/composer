import { GoogleGenerativeAI, GenerationConfig } from "@google/generative-ai";
import {
  COMPOSER_SYSTEM_PROMPT,
  GEMINI_MODEL,
  GEMINI_MAX_TOKENS,
  buildGenerationPrompt,
} from "@/config/prompts";
import { ItineraryStop, QuestionnaireAnswers, WeatherInfo } from "@/types";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");
const geminiModel = genAI.getGenerativeModel({
  model: GEMINI_MODEL,
  systemInstruction: COMPOSER_SYSTEM_PROMPT,
});

interface GeneratedCopy {
  title: string;
  subtitle: string;
  venue_notes: Record<string, string>;
}

export async function generateCopy(
  stops: ItineraryStop[],
  inputs: QuestionnaireAnswers,
  weather: WeatherInfo | null,
  userName?: string
): Promise<GeneratedCopy> {
  const venueData = stops.map((s) => ({
    role: s.role,
    name: s.venue.name,
    category: s.venue.category,
    neighborhood: s.venue.neighborhood,
    curation_note: s.venue.curation_note,
    // Per-venue "what to order" hint — 117 venues in the curated DB have
    // this populated. When present, Gemini should use it verbatim rather
    // than guessing at a dish.
    signature_order: s.venue.signature_order,
  }));

  const prompt = buildGenerationPrompt(venueData, inputs, weather, userName);

  try {
    // Gemini 2.5 Flash has reasoning enabled by default, which would consume
    // the entire token budget before any visible output. Disable it — copy
    // generation is a fast text-shaping task, not reasoning. The SDK's
    // GenerationConfig type doesn't yet expose thinkingConfig, so we cast
    // around the missing field; the REST API accepts it.
    const generationConfig = {
      maxOutputTokens: GEMINI_MAX_TOKENS,
      responseMimeType: "application/json",
      thinkingConfig: { thinkingBudget: 0 },
    } as GenerationConfig;

    const result = await geminiModel.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig,
    });

    const text = result.response.text();

    // Defensive: extract JSON in case the model wraps it in prose despite
    // responseMimeType. Matches the original Claude path's error tolerance.
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");

    return JSON.parse(jsonMatch[0]) as GeneratedCopy;
  } catch (error) {
    // Log so the fallback path is debuggable in dev/prod logs.
    console.error("[gemini] generateCopy failed, using DB fallback:", error);
    // Graceful fallback: use DB curation notes
    const venue_notes: Record<string, string> = {};
    for (const stop of stops) {
      venue_notes[stop.venue.name] = stop.venue.curation_note;
    }

    return {
      title: userName ? `Here's your night, ${userName}` : "Your Night, Composed",
      subtitle: `${stops.length} stops. Let's go.`,
      venue_notes,
    };
  }
}
