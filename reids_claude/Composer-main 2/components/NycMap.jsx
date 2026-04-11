'use client';

import { useEffect, useMemo, useRef } from 'react';
import 'leaflet/dist/leaflet.css';

/**
 * NycMap — a private "your NYC" map that pins every stop from every saved plan.
 *
 * Loads leaflet from the bundled package on the client only (leaflet touches
 * window, so it must stay out of the server build). We intentionally use
 * plain leaflet instead of react-leaflet here so we can keep it lightweight
 * and avoid react-leaflet's SSR context footguns.
 */
export default function NycMap({ plans = [] }) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerLayerRef = useRef(null);

  /** Flatten every stop across every plan into a single pin list. */
  const pins = useMemo(() => {
    const out = [];
    const seen = new Set();
    for (const plan of plans) {
      const stops = Array.isArray(plan?.itinerary) ? plan.itinerary : [];
      for (const stop of stops) {
        if (typeof stop?.lat !== 'number' || typeof stop?.lng !== 'number') continue;
        const key = stop.placeId || `${stop.name}-${stop.lat.toFixed(4)}-${stop.lng.toFixed(4)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          key,
          lat: stop.lat,
          lng: stop.lng,
          name: stop.name || 'Unnamed',
          category: stop.category || stop.placeType || '',
          neighborhood: plan?.meta?.neighborhoods?.[0] || '',
        });
      }
    }
    return out;
  }, [plans]);

  /** Neighborhood tally for the caption strip. */
  const stats = useMemo(() => {
    const hoods = new Set();
    for (const plan of plans) {
      for (const n of plan?.meta?.neighborhoods || []) hoods.add(n);
    }
    return {
      placeCount: pins.length,
      hoodCount: hoods.size,
    };
  }, [pins, plans]);

  /** One-time map init. */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const L = (await import('leaflet')).default;
      // Leaflet's default marker assets assume a bundler that resolves PNGs
      // from node_modules — Next doesn't by default, so we swap to a CDN.
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl:
          'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      if (cancelled || !containerRef.current || mapRef.current) return;

      const map = L.map(containerRef.current, {
        center: [40.7308, -73.9973], // lower Manhattan
        zoom: 12,
        scrollWheelZoom: false,
        zoomControl: true,
        attributionControl: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      markerLayerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;

      // Force a size recalc after the container finishes laying out.
      setTimeout(() => map.invalidateSize(), 100);
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerLayerRef.current = null;
      }
    };
  }, []);

  /** Re-render markers whenever pins change. */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const L = (await import('leaflet')).default;
      if (cancelled || !mapRef.current || !markerLayerRef.current) return;

      markerLayerRef.current.clearLayers();

      if (pins.length === 0) return;

      const latLngs = [];
      for (const p of pins) {
        const marker = L.marker([p.lat, p.lng]);
        const cat = p.category ? ` · ${p.category}` : '';
        marker.bindPopup(
          `<strong>${escapeHtml(p.name)}</strong>${escapeHtml(cat)}`
        );
        marker.addTo(markerLayerRef.current);
        latLngs.push([p.lat, p.lng]);
      }

      if (latLngs.length > 1) {
        mapRef.current.fitBounds(latLngs, { padding: [40, 40] });
      } else {
        mapRef.current.setView(latLngs[0], 14);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pins]);

  return (
    <div className="rounded-2xl overflow-hidden border border-[#ececec] bg-white">
      <div className="flex items-center justify-between px-4 pt-3 pb-2">
        <div>
          <div className="text-sm font-semibold">Your NYC</div>
          <div className="text-xs text-[var(--muted)]">
            {pins.length === 0
              ? 'Save a plan to start filling in your map'
              : `${stats.placeCount} ${pluralize(stats.placeCount, 'place', 'places')} across ${stats.hoodCount} ${pluralize(stats.hoodCount, 'neighborhood', 'neighborhoods')}`}
          </div>
        </div>
      </div>
      <div ref={containerRef} className="h-[280px] w-full" aria-label="Map of your saved places" />
    </div>
  );
}

function pluralize(n, one, many) {
  return n === 1 ? one : many;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
