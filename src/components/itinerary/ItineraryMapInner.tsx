"use client";

// Mapbox-GL renderer behind the dynamic-import boundary. Mounted only on
// the client (parent uses next/dynamic with ssr:false), so the
// mapbox-gl/dist CSS + the ~200KB mapbox-gl bundle are isolated into
// their own chunk and never touch SSR or the initial bundle.

import { useEffect, useMemo, useRef } from "react";
import Map, {
  Marker,
  Source,
  Layer,
  type MapRef,
  type LngLatBoundsLike,
} from "react-map-gl";
import type { FillLayerSpecification, LineLayerSpecification } from "mapbox-gl";
import type { LineString } from "geojson";
import "mapbox-gl/dist/mapbox-gl.css";

export interface MapPin {
  /** 1-based label shown inside the pin. Matches the user-facing stop
   * number (Stop 1, Stop 2, etc.) — NOT the index in the filtered array,
   * which can differ when some stops are missing coords. */
  label: number;
  /** Index in the parent stops array — used for scroll-into-view and
   * highlight wiring. */
  originalIndex: number;
  lat: number;
  lng: number;
  venueId: string;
  venueName: string;
}

/** Phase 10: optional real walking route geometries between consecutive
 * pins. When provided, the polyline layer renders one feature per
 * walk segment using the geometry; null/missing entries fall back to a
 * straight LineString between the two pins. Length should equal
 * pins.length - 1 (or shorter — missing tail segments are skipped). */
export interface ItineraryRouteSegment {
  geometry: LineString | null | undefined;
}

interface ItineraryMapInnerProps {
  pins: MapPin[];
  /** Tap on a pin → smooth-scroll + highlight in the parent. Receives
   * the pin's originalIndex. */
  onPinClick: (pin: MapPin) => void;
  /** Tap anywhere on the map body (outside a pin) → expand to
   * fullscreen overlay. Not called when expanded (no recursion). */
  onMapClick?: () => void;
  /** Phase 10 — per-segment route geometries (one per pin pair). */
  routeSegments?: ItineraryRouteSegment[];
  /** When true, single-finger drag scrolls the page instead of panning
   * the map; users must pan with two fingers (Mapbox shows a "Use two
   * fingers to move the map" overlay). Inline map opts in so the map
   * doesn't trap the page scroll; fullscreen map leaves it off so the
   * full canvas is panable with one finger. */
  cooperativeGestures?: boolean;
}

const BURGUNDY = "#6B1E2E";
const ROUTE_OPACITY = 0.6;
const ROUTE_WIDTH = 2.5;
const PIN_DIAMETER = 30;
const FIT_PADDING = 36;

export function ItineraryMapInner({
  pins,
  onPinClick,
  onMapClick,
  routeSegments,
  cooperativeGestures = false,
}: ItineraryMapInnerProps) {
  const mapRef = useRef<MapRef | null>(null);
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? "";

  // Compute bounding box once. Single-pin case skips fitBounds and uses
  // a center+zoom initialViewState instead (fitBounds with a single
  // point is degenerate).
  const bounds = useMemo<LngLatBoundsLike | null>(() => {
    if (pins.length < 2) return null;
    let minLng = pins[0].lng;
    let maxLng = pins[0].lng;
    let minLat = pins[0].lat;
    let maxLat = pins[0].lat;
    for (const p of pins) {
      if (p.lng < minLng) minLng = p.lng;
      if (p.lng > maxLng) maxLng = p.lng;
      if (p.lat < minLat) minLat = p.lat;
      if (p.lat > maxLat) maxLat = p.lat;
    }
    return [
      [minLng, minLat],
      [maxLng, maxLat],
    ];
  }, [pins]);

  // Fit bounds on mount. duration:0 so the map opens already framed
  // (avoids a visible pan/zoom animation when the user first sees it).
  useEffect(() => {
    if (!bounds || !mapRef.current) return;
    mapRef.current.fitBounds(bounds, { padding: FIT_PADDING, duration: 0 });
  }, [bounds]);

  // Phase 10: one Feature per walk segment. If routeSegments[i].geometry
  // is real (Mapbox Directions, cached in composer_walking_routes), the
  // line follows actual streets; if null/missing (Mapbox failure or
  // legacy saved itineraries pre-Phase 10), it falls back to a straight
  // LineString between pin[i] and pin[i+1]. Mixed real + fallback is
  // fine — every segment renders independently.
  const routeGeoJSON = useMemo(() => {
    if (pins.length < 2) return null;
    const features = [];
    for (let i = 0; i < pins.length - 1; i++) {
      const segmentGeom: LineString | null | undefined =
        routeSegments?.[i]?.geometry;
      const coordinates: [number, number][] = segmentGeom
        ? (segmentGeom.coordinates as [number, number][])
        : [
            [pins[i].lng, pins[i].lat],
            [pins[i + 1].lng, pins[i + 1].lat],
          ];
      features.push({
        type: "Feature" as const,
        properties: { segmentIndex: i },
        geometry: {
          type: "LineString" as const,
          coordinates,
        },
      });
    }
    return {
      type: "FeatureCollection" as const,
      features,
    };
  }, [pins, routeSegments]);

  // Initial view state for the single-pin path (no bounds to fit).
  const initialViewState = useMemo(() => {
    if (pins.length >= 2) {
      // Bounds path overrides this — but Map requires SOMETHING here.
      // Use the first pin as a fallback center.
      return { longitude: pins[0].lng, latitude: pins[0].lat, zoom: 13 };
    }
    return { longitude: pins[0].lng, latitude: pins[0].lat, zoom: 14 };
  }, [pins]);

  return (
    <Map
      ref={mapRef}
      mapboxAccessToken={token}
      initialViewState={initialViewState}
      mapStyle="mapbox://styles/mapbox/light-v11"
      style={{ width: "100%", height: "100%" }}
      cooperativeGestures={cooperativeGestures}
      onClick={(e) => {
        // Marker onClick stops propagation, so this fires only on the
        // map body (outside any pin). Guard for SSR-rendered phantoms
        // by checking the event's origin presence.
        if (!e.originalEvent) return;
        onMapClick?.();
      }}
    >
      {routeGeoJSON && (
        <Source id="itinerary-route" type="geojson" data={routeGeoJSON}>
          <Layer
            id="itinerary-route-line"
            type="line"
            paint={
              {
                "line-color": BURGUNDY,
                "line-width": ROUTE_WIDTH,
                "line-opacity": ROUTE_OPACITY,
              } satisfies LineLayerSpecification["paint"]
            }
            layout={
              {
                "line-cap": "round",
                "line-join": "round",
              } satisfies LineLayerSpecification["layout"]
            }
          />
        </Source>
      )}
      {pins.map((pin) => (
        <Marker
          key={pin.originalIndex}
          longitude={pin.lng}
          latitude={pin.lat}
          anchor="center"
          onClick={(e) => {
            // Don't let the click bubble to Map's onClick (which would
            // expand to fullscreen). Pin taps are scroll-to-stop.
            e.originalEvent.stopPropagation();
            onPinClick(pin);
          }}
        >
          <div
            style={{
              width: PIN_DIAMETER,
              height: PIN_DIAMETER,
              borderRadius: "50%",
              background: BURGUNDY,
              color: "white",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 13,
              fontFamily: "var(--font-sans)",
              fontWeight: 600,
              boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
              cursor: "pointer",
              border: "2px solid white",
              userSelect: "none",
            }}
          >
            {pin.label}
          </div>
        </Marker>
      ))}
    </Map>
  );
}

// Re-export for the parent's dynamic import; FillLayerSpecification is
// imported only to satisfy the bundler when Layer's paint type-checks
// (mapbox-gl pulls FillLayerSpecification transitively via the Layer
// types).
export type { FillLayerSpecification };
