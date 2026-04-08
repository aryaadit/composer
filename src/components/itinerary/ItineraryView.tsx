"use client";

import { ItineraryResponse } from "@/types";
import StopCard from "@/components/ui/StopCard";
import WalkConnector from "@/components/ui/WalkConnector";

export default function ItineraryView({
  stops,
  walks,
}: {
  stops: ItineraryResponse["stops"];
  walks: ItineraryResponse["walks"];
}) {
  return (
    <div className="flex flex-col gap-0 w-full max-w-lg mx-auto">
      {stops.map((stop, i) => (
        <div key={stop.venue.id}>
          <StopCard stop={stop} index={i} />
          {i < stops.length - 1 && walks[i] && (
            <WalkConnector walkMinutes={walks[i].walk_minutes} index={i} />
          )}
        </div>
      ))}
    </div>
  );
}
