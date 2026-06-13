"use client";

import { motion } from "motion/react";
import { ItineraryResponse } from "@/types";
import { occasionLabel } from "@/config/occasions";
import { vibeLabel } from "@/config/vibes";
import { deriveGroupIds, NEIGHBORHOOD_GROUPS } from "@/config/neighborhoods";
import { formatWindowLabel } from "@/lib/itinerary/time-blocks";
import { isLuckyItinerary } from "@/lib/itinerary/is-lucky";

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
  /** Visual variant — "default" for the standard white surface,
   *  "crown" when rendered inside the lucky-itinerary crown band. */
  variant?: "default" | "crown";
}

export function CompositionHeader({
  header,
  inputs,
  partySize = 2,
  variant = "default",
}: CompositionHeaderProps) {
  const isCrown = variant === "crown";
  // Text-color overrides for the crown variant. The crown-text /
  // crown-text-muted tokens are tuned to pass 4.5:1 on crown-field.
  const titleColor = isCrown ? "text-crown-text" : "text-charcoal";
  const subtitleColor = isCrown ? "text-crown-text-muted" : "text-warm-gray";
  const metaColor = isCrown ? "text-crown-text-muted" : "text-muted";
  // Utility row 1: date · time window · party size
  const utilityParts: string[] = [];
  if (inputs?.day) {
    utilityParts.push(formatItineraryDate(inputs.day));
  }
  if (inputs?.startTime && inputs?.endTime) {
    utilityParts.push(
      formatWindowLabel({ startTime: inputs.startTime, endTime: inputs.endTime })
    );
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

  // Audit item 16: render the canonical condition bucket as
  // sentence-case human copy, NOT the raw API description (which
  // arrives lowercase or, on some endpoints, all-caps). The
  // description still rides on the WeatherInfo shape for future use.
  const CONDITION_LABELS: Record<NonNullable<typeof header.weather>["condition"], string> = {
    clear: "Clear",
    rain: "Light rain",
    snow: "Snow",
    cloudy: "Overcast",
  };
  // Atmosphere row: occasion · vibe · budget · weather
  const weatherText = header.weather
    ? header.weather.is_bad_weather
      ? CONDITION_LABELS[header.weather.condition]
      : `${header.weather.temp_f}°F, ${CONDITION_LABELS[header.weather.condition]}`
    : null;

  const atmosphereParts = [
    occasionLabel(header.occasion_tag),
    vibeLabel(header.vibe_tag),
    header.estimated_total.replace(/ total$/i, ""),
    weatherText,
  ].filter(Boolean);
  const atmosphereLine = atmosphereParts.join(" · ");

  // Lucky layer — additive only. Standard + daily renders are
  // unchanged; lucky adds a small die glyph beside the title. The
  // banner above the map carries the semantic for SR users, so the
  // die is aria-hidden — pure visual flourish.
  const isLucky = isLuckyItinerary(inputs);

  return (
    <motion.div
      className={
        isCrown
          ? "w-full max-w-lg mx-auto px-6"
          : "w-full max-w-lg mx-auto mb-8"
      }
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <h1
        className={`font-sans text-2xl font-medium mb-2 leading-tight ${titleColor}`}
      >
        {isLucky && (
          <TitleDie variant={isCrown ? "crown" : "burgundy"} />
        )}
        {header.title}
      </h1>
      <p className={`font-sans text-sm mb-3 ${subtitleColor}`}>
        {header.subtitle}
      </p>

      {/* Utility rows — when/where/how many */}
      {utilityLine && (
        <p className={`font-sans text-sm ${metaColor}`}>{utilityLine}</p>
      )}
      {neighborhoodLine && (
        <p className={`font-sans text-sm mt-0.5 ${metaColor}`}>
          {neighborhoodLine}
        </p>
      )}

      {/* Atmosphere row — feel/budget/weather */}
      <p
        className={`font-sans text-xs tracking-wide uppercase ${metaColor} ${
          utilityLine || neighborhoodLine ? "mt-3" : ""
        }`}
      >
        {atmosphereLine}
      </p>
    </motion.div>
  );
}

// Small die glyph rendered inline beside the lucky-itinerary title.
// Size matches the surrounding text-2xl (text height ~32px → glyph
// at 22px feels in-flight). aria-hidden — the banner carries the
// announceable context for screen readers.
//
// Crown variant: cream glyph for visibility on the burgundy field.
// Default: burgundy on cream for the (now rare) non-crown lucky path.
function TitleDie({ variant }: { variant: "burgundy" | "crown" }) {
  const colorClass = variant === "crown" ? "text-crown-text" : "text-burgundy";
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
      aria-hidden="true"
      data-testid="title-die"
      className={`inline-block align-[-0.15em] mr-2 ${colorClass}`}
    >
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <circle cx="8.5" cy="8.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="8.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="8.5" cy="15.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="15.5" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}
