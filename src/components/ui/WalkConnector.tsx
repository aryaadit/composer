"use client";

import { useMemo } from "react";
import { motion } from "motion/react";
import type { LineString } from "geojson";
import { buildWalkSegmentStaticMapUrl } from "@/lib/mapbox";

interface WalkConnectorProps {
  walkMinutes: number;
  index: number;
  /** Phase 10: real walking-route geometry from composer_walking_routes.
   * Untyped (unknown) on the wire so the WalkSegment type doesn't drag
   * the geojson dep through client-bundle imports; we cast to LineString
   * here at the rendering boundary. Null or undefined → no static map
   * (legacy itineraries pre-Phase 10) — the connector renders text-only,
   * matching the existing graceful-fallback path. */
  routeGeometry?: unknown;
}

export function WalkConnector({
  walkMinutes,
  index,
  routeGeometry,
}: WalkConnectorProps) {
  // Build the static URL once per geometry. buildWalkSegmentStaticMapUrl
  // returns null when there's no token or no geometry — the <img> block
  // is gated on a non-null result.
  const mapUrl = useMemo(
    () =>
      buildWalkSegmentStaticMapUrl(
        (routeGeometry as LineString | null | undefined) ?? null,
      ),
    [routeGeometry],
  );

  return (
    <motion.div
      className="flex flex-col items-center gap-2 py-5"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, delay: index * 0.15 + 0.1 }}
    >
      {mapUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={mapUrl}
          alt={`${walkMinutes} minute walking route`}
          loading="lazy"
          width={512}
          height={120}
          className="w-full max-w-lg h-[120px] object-cover rounded-lg"
        />
      )}
      <span className="font-sans text-xs text-muted whitespace-nowrap">
        {walkMinutes} min walk
      </span>
    </motion.div>
  );
}
