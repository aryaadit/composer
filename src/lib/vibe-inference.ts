// Infer a canonical vibe tag for a provisional venue using Gemini.
// Strict JSON output targeting the locked vibe list. 5s timeout.
// On error or low confidence, returns null — the UI surfaces a
// one-tap confirmation in the anchor flow.

import { GoogleGenerativeAI } from "@google/generative-ai";

const CANONICAL_VIBES = [
  "food_forward", "drinks_led", "activity_food", "walk_explore", "mix_it_up",
] as const;

type VibeSlug = (typeof CANONICAL_VIBES)[number];

interface InferVibeResult {
  vibe: VibeSlug | null;
  confidence: "high" | "low";
}

export async function inferVibe(input: {
  name: string;
  googlePlacesTypes: string[];
  priceLevel: number | null;
  address: string;
}): Promise<InferVibeResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { vibe: null, confidence: "low" };

  try {
    const genAI = new GoogleGenerativeAI(key);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    const prompt = `You are classifying a NYC venue into exactly one vibe category.

Venue: "${input.name}"
Address: ${input.address}
Google types: ${input.googlePlacesTypes.join(", ")}
Price level: ${input.priceLevel ?? "unknown"}

Categories (pick exactly one):
- food_forward: restaurants, dining, food halls
- drinks_led: bars, cocktail lounges, wine bars
- activity_food: bowling, karaoke, comedy, games + food
- walk_explore: museums, galleries, parks, bookstores, markets
- mix_it_up: doesn't fit the above clearly

Respond with JSON only: { "vibe": "<slug>", "confidence": "high" | "low" }`;

    const result = await Promise.race([
      model.generateContent(prompt),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 5000)
      ),
    ]);

    const text = result.response.text();
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return { vibe: null, confidence: "low" };

    const parsed = JSON.parse(match[0]) as { vibe: string; confidence: string };
    const vibe = CANONICAL_VIBES.includes(parsed.vibe as VibeSlug)
      ? (parsed.vibe as VibeSlug)
      : null;

    return {
      vibe,
      confidence: vibe && parsed.confidence === "high" ? "high" : "low",
    };
  } catch {
    return { vibe: null, confidence: "low" };
  }
}
