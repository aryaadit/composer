import { QuestionnaireAnswers } from "@/types";

const PARAM_KEYS: (keyof QuestionnaireAnswers)[] = [
  "occasion",
  "neighborhood",
  "budget",
  "vibe",
];

export function encodeInputsToParams(inputs: QuestionnaireAnswers): string {
  const params = new URLSearchParams();
  for (const key of PARAM_KEYS) {
    params.set(key, inputs[key]);
  }
  return params.toString();
}

export function decodeParamsToInputs(
  searchParams: URLSearchParams
): QuestionnaireAnswers | null {
  const result: Partial<QuestionnaireAnswers> = {};
  for (const key of PARAM_KEYS) {
    const val = searchParams.get(key);
    if (!val) return null;
    (result as Record<string, string>)[key] = val;
  }
  return result as QuestionnaireAnswers;
}

export function buildShareUrl(inputs: QuestionnaireAnswers): string {
  const params = encodeInputsToParams(inputs);
  return `${window.location.origin}/itinerary?${params}`;
}
