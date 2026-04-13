"use client";

import { motion } from "motion/react";
import { ItineraryResponse } from "@/types";
import { occasionLabel } from "@/config/occasions";
import { vibeLabel } from "@/config/vibes";

export function CompositionHeader({
  header,
}: {
  header: ItineraryResponse["header"];
}) {
  const weatherNote = header.weather
    ? header.weather.is_bad_weather
      ? `${header.weather.description}. Keeping you indoors.`
      : `${header.weather.temp_f}°F, ${header.weather.description}`
    : null;

  const metaLine = [
    occasionLabel(header.occasion_tag),
    vibeLabel(header.vibe_tag),
    `${header.estimated_total} total`,
  ]
    .filter(Boolean)
    .join(" · ");

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

      <p className="font-sans text-xs tracking-wide uppercase text-muted">
        {metaLine}
      </p>

      {weatherNote && (
        <p className="font-sans text-xs text-muted mt-2">{weatherNote}</p>
      )}
    </motion.div>
  );
}
