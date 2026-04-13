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

  return (
    <motion.div
      className="text-center mb-10"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <h1 className="font-serif text-4xl md:text-5xl text-charcoal mb-3">
        {header.title}
      </h1>
      <p className="font-sans text-lg text-warm-gray mb-5">{header.subtitle}</p>

      <div className="flex flex-wrap items-center justify-center gap-2 mb-4">
        <span className="inline-block px-3 py-1 text-xs font-sans font-medium rounded-full bg-burgundy/10 text-burgundy">
          {occasionLabel(header.occasion_tag)}
        </span>
        <span className="inline-block px-3 py-1 text-xs font-sans font-medium rounded-full bg-forest/10 text-forest">
          {vibeLabel(header.vibe_tag)}
        </span>
        <span className="inline-block px-3 py-1 text-xs font-sans font-medium rounded-full bg-charcoal/10 text-charcoal">
          {header.estimated_total} total
        </span>
      </div>

      {weatherNote && (
        <p className="font-sans text-sm text-warm-gray">{weatherNote}</p>
      )}
    </motion.div>
  );
}
