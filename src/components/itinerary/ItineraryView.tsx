"use client";

import { Fragment } from "react";
import { ItineraryResponse } from "@/types";
import { StopCard } from "@/components/ui/StopCard";
import { WalkConnector } from "@/components/ui/WalkConnector";

export function ItineraryView({
  stops,
  walks,
}: {
  stops: ItineraryResponse["stops"];
  walks: ItineraryResponse["walks"];
}) {
  return (
    <div className="w-full max-w-lg mx-auto divide-y divide-border border-y border-border">
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
