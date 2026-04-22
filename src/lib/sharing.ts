// Share-link URL encoding/decoding. Share URLs are stateless — the
// itinerary page reads the inputs from the query string and
// re-generates, so a shared link is a recipe, not a snapshot. The URL
// carries `timeBlock` (a preset), not startTime/endTime; the server
// resolves it on each generation.

import {
  GenerateRequestBody,
  Neighborhood,
  TimeBlock,
} from "@/types";
import { TIME_BLOCKS } from "@/config/durations";

const BLOCK_IDS = new Set<string>(TIME_BLOCKS.map((b) => b.id));
// Legacy duration IDs for decoding old share links
const LEGACY_DURATION_TO_BLOCK: Record<string, TimeBlock> = {
  "2h": "evening",
  "3.5h": "evening",
  "5h": "evening",
};

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

  // Support both new timeBlock and legacy duration params
  let timeBlock: TimeBlock | null = null;
  const timeBlockRaw = searchParams.get("timeBlock");
  const durationRaw = searchParams.get("duration");

  if (timeBlockRaw && BLOCK_IDS.has(timeBlockRaw)) {
    timeBlock = timeBlockRaw as TimeBlock;
  } else if (durationRaw && durationRaw in LEGACY_DURATION_TO_BLOCK) {
    timeBlock = LEGACY_DURATION_TO_BLOCK[durationRaw];
  }

  if (!occasion || !neighborhoodsRaw || !budget || !vibe || !day || !timeBlock) {
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
    timeBlock,
  };
}

export function buildShareUrl(inputs: GenerateRequestBody): string {
  const params = encodeInputsToParams(inputs);
  return `${window.location.origin}/itinerary?${params}`;
}
