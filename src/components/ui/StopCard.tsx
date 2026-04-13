"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { ItineraryStop } from "@/types";
import { ROLE_LABELS, ROLE_COLOR_CLASSES } from "@/config/roles";
import { neighborhoodLabel } from "@/config/neighborhoods";

export function StopCard({
  stop,
  index,
}: {
  stop: ItineraryStop;
  index: number;
}) {
  const [showPlanB, setShowPlanB] = useState(false);
  const activeVenue = showPlanB && stop.plan_b ? stop.plan_b : stop.venue;
  const activeNote =
    showPlanB && stop.plan_b ? stop.plan_b.curation_note : stop.curation_note;

  return (
    <motion.div
      className="bg-white rounded-2xl border border-border p-6 shadow-sm"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.15 }}
    >
      <div className="flex items-center gap-3 mb-4">
        <span
          className={`px-2.5 py-0.5 text-xs font-sans font-medium rounded-full ${ROLE_COLOR_CLASSES[stop.role]}`}
        >
          {ROLE_LABELS[stop.role]}
        </span>
        <span className="text-xs font-sans text-warm-gray">
          {stop.is_fixed ? "Fixed" : "Flexible"}
        </span>
      </div>

      <h3 className="font-serif text-2xl text-charcoal mb-1">
        {activeVenue.name}
      </h3>
      <p className="font-sans text-sm text-warm-gray mb-3">
        {activeVenue.category} &middot; {neighborhoodLabel(activeVenue.neighborhood)}
      </p>

      <p className="font-sans text-base text-charcoal/80 italic mb-4 leading-relaxed">
        {activeNote}
      </p>

      <div className="flex flex-wrap items-center gap-4">
        <span className="font-sans text-sm font-medium text-charcoal">
          {stop.spend_estimate}
        </span>

        {activeVenue.reservation_url && (
          <a
            href={activeVenue.reservation_url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-sans text-sm text-burgundy hover:text-burgundy-light transition-colors underline underline-offset-2"
          >
            Reserve
          </a>
        )}

        {!stop.is_fixed && stop.plan_b && (
          <button
            onClick={() => setShowPlanB(!showPlanB)}
            className="font-sans text-sm text-forest hover:text-forest-light transition-colors underline underline-offset-2"
          >
            {showPlanB ? "Back to original" : "Plan B"}
          </button>
        )}
      </div>
    </motion.div>
  );
}
