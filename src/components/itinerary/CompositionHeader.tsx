"use client";

import { motion } from "motion/react";
import { ItineraryResponse } from "@/types";
import { occasionLabel } from "@/config/occasions";
import { vibeLabel } from "@/config/vibes";
import { deriveGroupIds, NEIGHBORHOOD_GROUPS } from "@/config/neighborhoods";
import { getBlockMetadata } from "@/lib/itinerary/time-blocks";
import type { TimeBlock } from "@/lib/itinerary/time-blocks";

function formatItineraryDate(isoDate: string): string {
  // Parse as local date (avoid UTC shift by splitting the ISO string)
  const [year, month, day] = isoDate.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

interface CompositionHeaderProps {
  header: ItineraryResponse["header"];
  inputs?: ItineraryResponse["inputs"];
  partySize?: number;
}

export function CompositionHeader({
  header,
  inputs,
  partySize = 2,
}: CompositionHeaderProps) {
  // Utility row 1: date · time block · party size
  const utilityParts: string[] = [];
  if (inputs?.day) {
    utilityParts.push(formatItineraryDate(inputs.day));
  }
  if (inputs?.timeBlock) {
    utilityParts.push(getBlockMetadata(inputs.timeBlock as TimeBlock).label);
  }
  if (partySize > 2) {
    utilityParts.push(`Party of ${partySize}`);
  }
  const utilityLine = utilityParts.join(" · ");

  // Utility row 2: neighborhoods — show group labels, not expanded slugs
  const neighborhoodLine = (() => {
    if (!inputs?.neighborhoods || inputs.neighborhoods.length === 0) return null;
    const groupIds = deriveGroupIds(inputs.neighborhoods);
    if (groupIds.length === 0) return null;
    const labels = groupIds.map(
      (id) => NEIGHBORHOOD_GROUPS.find((g) => g.id === id)?.label ?? id
    );
    return Array.from(new Set(labels)).join(", ");
  })();

  // Atmosphere row: occasion · vibe · budget · weather
  const weatherText = header.weather
    ? header.weather.is_bad_weather
      ? header.weather.description
      : `${header.weather.temp_f}°F, ${header.weather.description}`
    : null;

  const atmosphereParts = [
    occasionLabel(header.occasion_tag),
    vibeLabel(header.vibe_tag),
    header.estimated_total.replace(/ total$/i, ""),
    weatherText,
  ].filter(Boolean);
  const atmosphereLine = atmosphereParts.join(" · ");

  return (
    <motion.div
      className="w-full max-w-lg mx-auto mb-8"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <h1 className="font-sans text-2xl font-medium text-charcoal mb-2 leading-tight">
        {header.title}
      </h1>
      <p className="font-sans text-sm text-warm-gray mb-3">{header.subtitle}</p>

      {/* Utility rows — when/where/how many */}
      {utilityLine && (
        <p className="font-sans text-sm text-muted">{utilityLine}</p>
      )}
      {neighborhoodLine && (
        <p className="font-sans text-sm text-muted mt-0.5">
          {neighborhoodLine}
        </p>
      )}

      {/* Atmosphere row — feel/budget/weather */}
      <p
        className={`font-sans text-xs tracking-wide uppercase text-muted ${
          utilityLine || neighborhoodLine ? "mt-3" : ""
        }`}
      >
        {atmosphereLine}
      </p>
    </motion.div>
  );
}
