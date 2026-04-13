"use client";

import { Fragment } from "react";
import { ItineraryResponse } from "@/types";
import { StopCard } from "@/components/ui/StopCard";
import { WalkConnector } from "@/components/ui/WalkConnector";

// Slightly heavier than --color-border so the stop-to-stop separation actually
// reads. --color-border is used everywhere else and stays light; these rules
// are structural so they get a dedicated shade.
export function ItineraryView({
  stops,
  walks,
}: {
  stops: ItineraryResponse["stops"];
  walks: ItineraryResponse["walks"];
}) {
  return (
    <div className="w-full max-w-lg mx-auto border-y border-[#D8D8D8] divide-y divide-[#D8D8D8]">
      {stops.map((stop, i) => (
        <Fragment key={stop.venue.id}>
          <StopCard stop={stop} index={i} />
          {i < stops.length - 1 && walks[i] && (
            <WalkConnector walkMinutes={walks[i].walk_minutes} index={i} />
          )}
        </Fragment>
      ))}
    </div>
  );
}
