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

/**
 * Generic JSON-shaped Gemini call. Reuses the same SDK, API key, and
 * model the composer copy path uses, but with a caller-supplied
 * system prompt (so the response stays voice-correct for whatever
 * task it serves) and no hardcoded fallback shape. Returns the parsed
 * object on success or null on any failure (network, timeout, JSON
 * parse, response shape mismatch) so callers can surface a domain-
 * appropriate fallback rather than inheriting the itinerary copy
 * fallback baked into generateCopy.
 *
 * Notes:
 *   - thinkingBudget: 0 is load-bearing. Gemini 2.5 Flash defaults to
 *     reasoning ON, which consumes the entire token budget before any
 *     visible output. The SDK's GenerationConfig type doesn't yet
 *     expose thinkingConfig so we cast through the missing field;
 *     the REST API accepts it.
 *   - The defensive `{...}` regex extract mirrors generateCopy's path
 *     so a model that wraps JSON in prose despite responseMimeType
 *     still parses.
 */
export async function callGeminiJSON<T>(
  prompt: string,
  opts: {
    systemInstruction: string;
    maxOutputTokens?: number;
  },
): Promise<T | null> {
  try {
    const model = genAI.getGenerativeModel({
      model: GEMINI_MODEL,
      systemInstruction: opts.systemInstruction,
    });
    const generationConfig = {
      maxOutputTokens: opts.maxOutputTokens ?? GEMINI_MAX_TOKENS,
      responseMimeType: "application/json",
      thinkingConfig: { thinkingBudget: 0 },
    } as GenerationConfig;
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig,
    });
    const text = result.response.text();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]) as T;
  } catch (error) {
    console.error("[gemini] callGeminiJSON failed:", error);
    return null;
  }
}

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
    category: s.venue.category ?? "",
    neighborhood: s.venue.neighborhood,
    curation_note: s.venue.curation_note ?? "",
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
      venue_notes[stop.venue.name] = stop.venue.curation_note ?? "";
    }

    return {
      title: userName ? `Here's your night, ${userName}` : "Your Night, Composed",
      subtitle: `${stops.length} stops. Let's go.`,
      venue_notes,
    };
  }
}
