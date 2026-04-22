// Share-link URL encoding/decoding. Share URLs are stateless — the
// itinerary page reads the inputs from the query string and
// re-generates, so a shared link is a recipe, not a snapshot. The URL
// carries `timeBlock`, not startTime/endTime; the server resolves it
// on each generation.

import {
  GenerateRequestBody,
  Neighborhood,
  TimeBlock,
} from "@/types";
import { TIME_BLOCKS } from "@/lib/itinerary/time-blocks";

const BLOCK_IDS = new Set<string>(TIME_BLOCKS.map((b) => b.id));

export function encodeInputsToParams(inputs: GenerateRequestBody): string {
  const params = new URLSearchParams();
  params.set("occasion", inputs.occasion);
  params.set("neighborhoods", inputs.neighborhoods.join(","));
  params.set("budget", inputs.budget);
  params.set("vibe", inputs.vibe);
  params.set("day", inputs.day);
  params.set("timeBlock", inputs.timeBlock);
  return params.toString();
}

export function decodeParamsToInputs(
  searchParams: URLSearchParams
): GenerateRequestBody | null {
  const occasion = searchParams.get("occasion");
  const neighborhoodsRaw = searchParams.get("neighborhoods");
  const budget = searchParams.get("budget");
  const vibe = searchParams.get("vibe");
  const day = searchParams.get("day");
  const timeBlockRaw = searchParams.get("timeBlock");

  if (
    !occasion ||
    !neighborhoodsRaw ||
    !budget ||
    !vibe ||
    !day ||
    !timeBlockRaw ||
    !BLOCK_IDS.has(timeBlockRaw)
  ) {
    return null;
  }

  const neighborhoods = neighborhoodsRaw
    .split(",")
    .filter(Boolean) as Neighborhood[];

  return {
    occasion: occasion as GenerateRequestBody["occasion"],
    neighborhoods,
    budget: budget as GenerateRequestBody["budget"],
    vibe: vibe as GenerateRequestBody["vibe"],
    day,
    timeBlock: timeBlockRaw as TimeBlock,
  };
}

export function buildShareUrl(inputs: GenerateRequestBody): string {
  const params = encodeInputsToParams(inputs);
  return `${window.location.origin}/itinerary?${params}`;
}
