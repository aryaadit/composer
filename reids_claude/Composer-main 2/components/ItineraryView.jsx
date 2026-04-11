'use client';

import { useState } from 'react';
import {
  RefreshCw,
  Save,
  MessageSquare,
  Clock,
  MapPin,
  DollarSign,
  Star,
  ExternalLink,
  Footprints,
  ArrowDownUp,
  Bookmark,
  Plus,
} from 'lucide-react';
import TextMessageShare from './TextMessageShare';

/* Map a Google priceLevel (1-4) to a $-$$$$ symbol. */
function priceLevelToSymbol(level) {
  if (!level || level < 1) return '$';
  return '$'.repeat(Math.min(4, Math.max(1, Math.round(level))));
}

/* Summary symbol for the whole date. Uses the chosen budget tier's symbol
   if we know it, otherwise averages the stops' price levels. */
function budgetSymbol(budgetName, itinerary) {
  const tierMap = { Chill: '$', Solid: '$$', Splurge: '$$$', 'All Out': '$$$$' };
  if (budgetName && tierMap[budgetName]) return tierMap[budgetName];
  const stops = itinerary?.stops || [];
  const levels = stops.map((s) => s.place?.priceLevel).filter(Boolean);
  if (levels.length === 0) return '$$';
  const avg = levels.reduce((a, b) => a + b, 0) / levels.length;
  return priceLevelToSymbol(avg);
}

/* Symbol for a single stop. Prefer the Google-reported priceLevel, fall
   back to any tier-derived estimate. */
function stopSymbol(stop) {
  const lvl = stop?.place?.priceLevel;
  if (lvl) return priceLevelToSymbol(lvl);
  return '$$';
}

/* Per-platform colors for booking badges. Keeps brand-ish vibes without
   actually using their logos. */
const PLATFORM_STYLE = {
  resy: 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100',
  opentable: 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100',
  tock: 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100',
  sevenrooms: 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100',
};

function BookingBadge({ link, isPrimary }) {
  if (!link) return null;
  const style =
    PLATFORM_STYLE[link.platform] ||
    'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100';
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors ${style} ${
        isPrimary ? 'ring-1 ring-offset-0 ring-[var(--mango-soft)]' : ''
      }`}
      title={`Book on ${link.label}${isPrimary ? ' (recommended)' : ''}`}
    >
      <ExternalLink size={11} />
      {link.label}
    </a>
  );
}

export default function ItineraryView({
  itinerary,
  meta,
  userName,
  onBack,
  onSave,
  onRegenerate,
  onAddStop,
  addStopLoading = false,
  addStopError = '',
}) {
  const [showShare, setShowShare] = useState(false);
  const [swappingStop, setSwappingStop] = useState(null);

  if (!itinerary) return null;

  if (showShare) {
    return (
      <TextMessageShare
        itinerary={itinerary}
        userName={userName}
        meta={meta}
        onBack={() => setShowShare(false)}
      />
    );
  }

  return (
    <div className="min-h-[100dvh] bg-white pb-36 relative">
      {/* Header */}
      <div className="sticky top-0 bg-white/95 backdrop-blur-sm z-10 border-b border-gray-100">
        <div className="flex items-center justify-between px-4 pt-12 pb-3">
          <button
            onClick={onBack}
            className="w-10 h-10 -ml-2 rounded-full hover:bg-gray-100 flex items-center justify-center text-2xl"
          >
            ‹
          </button>
          <div className="flex gap-2">
            <button
              onClick={onRegenerate}
              className="p-2 rounded-full hover:bg-gray-100"
              title="Regenerate"
            >
              <RefreshCw size={18} className="text-[var(--muted)]" />
            </button>
            <button
              onClick={onSave}
              className="p-2 rounded-full hover:bg-gray-100"
              title="Save plan"
            >
              <Bookmark size={18} className="text-[var(--muted)]" />
            </button>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="px-6 pt-5 pb-4">
        <div className="eyebrow mb-2">YOUR DATE</div>
        <h1 className="h1-display mb-4">A plan for the night</h1>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-[var(--mango-soft)] text-[var(--mango-dark)] rounded-full">
            <MapPin size={12} /> {meta?.neighborhoods?.join(', ')}
          </span>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 text-gray-700 rounded-full">
            {meta?.vibe}
          </span>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 text-gray-700 rounded-full">
            <Clock size={12} /> {itinerary.startTime} – {itinerary.endTime}
          </span>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-gray-100 text-gray-700 rounded-full">
            <DollarSign size={12} /> {budgetSymbol(meta?.budget, itinerary)}
          </span>
        </div>
      </div>

      {/* Stops timeline */}
      <div className="px-6">
        {itinerary.stops.map((stop, i) => (
          <div key={i}>
            {stop.walkFromPrevious && (
              <div className="flex items-center gap-3 py-2 pl-6">
                <div className="w-0.5 h-6 bg-[var(--mango-soft)] ml-0.5" />
                <span className="text-xs text-[var(--muted)] flex items-center gap-1">
                  <Footprints size={12} />
                  {stop.walkFromPrevious.description}
                </span>
              </div>
            )}

            <div className="relative flex gap-4 pb-4">
              <div className="flex flex-col items-center pt-1">
                <div
                  className="w-3 h-3 rounded-full border-2 flex-shrink-0"
                  style={{
                    borderColor: 'var(--mango)',
                    background: i === 0 ? 'var(--mango)' : 'white',
                  }}
                />
                {i < itinerary.stops.length - 1 && (
                  <div className="w-0.5 flex-1 bg-[var(--mango-soft)] mt-1" />
                )}
              </div>

              <div className="flex-1 bg-white rounded-2xl border border-[#ececec] overflow-hidden">
                {stop.place.photoUrl ? (
                  <div className="h-32 bg-gray-100 relative">
                    <img
                      src={stop.place.photoUrl}
                      alt={stop.place.name}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/60 text-white text-xs rounded-full">
                      Stop {stop.order}
                    </div>
                  </div>
                ) : (
                  <div className="h-14 bg-gradient-to-r from-[var(--mango-soft)] to-[#fff] flex items-center px-4">
                    <span className="text-xs font-semibold text-[var(--mango-dark)] uppercase tracking-wider">
                      Stop {stop.order} · {stop.role}
                    </span>
                  </div>
                )}

                <div className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-bold text-base serif">{stop.place.name}</h3>
                    {stop.place.rating && (
                      <span className="flex items-center gap-1 text-xs text-[var(--muted)] flex-shrink-0">
                        <Star size={12} className="text-yellow-500 fill-yellow-500" />
                        {stop.place.rating.toFixed(1)}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--muted)] mb-3">{stop.place.address}</p>
                  <div className="flex items-center gap-3 text-xs text-gray-600 mb-3">
                    <span className="flex items-center gap-1">
                      <Clock size={12} /> {stop.arriveAt} – {stop.leaveAt}
                    </span>
                    <span>{stop.duration} min</span>
                    <span>{stopSymbol(stop)}</span>
                  </div>
                  {stop.place.bookingLinks?.primary && (
                    <div className="mb-3">
                      <div className="text-[10px] uppercase tracking-wider text-[var(--muted)] mb-1.5 font-semibold">
                        Book this table
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        <BookingBadge
                          link={stop.place.bookingLinks.primary}
                          isPrimary
                        />
                        {(stop.place.bookingLinks.alternates || []).map((alt) => (
                          <BookingBadge key={alt.platform} link={alt} />
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="flex gap-2">
                    {!stop.place.bookingLinks?.primary && stop.place.bookingUrl && (
                      <a
                        href={stop.place.bookingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-full border border-[var(--mango-soft)] text-[var(--mango-dark)] hover:bg-[var(--mango-soft)]"
                      >
                        <ExternalLink size={12} /> Book
                      </a>
                    )}
                    <button
                      onClick={() => setSwappingStop(swappingStop === i ? null : i)}
                      className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50"
                    >
                      <ArrowDownUp size={12} /> Swap
                    </button>
                  </div>

                  {swappingStop === i && (
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <p className="text-xs text-[var(--muted)] mb-2">
                        Alternative suggestions:
                      </p>
                      <div className="space-y-2">
                        {['Alternative 1', 'Alternative 2'].map((alt, j) => (
                          <button
                            key={j}
                            className="w-full text-left p-2 rounded-lg bg-gray-50 hover:bg-gray-100 text-sm transition-colors"
                          >
                            <div className="font-medium">{alt}</div>
                            <div className="text-xs text-[var(--muted)]">
                              Tap to swap in this option
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* Add-another-stop card — "the date's going well, where next?" */}
        {onAddStop && (
          <div className="pl-6 pt-1 pb-2">
            {addStopError && (
              <div className="mb-3 text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                {addStopError}
              </div>
            )}
            <button
              type="button"
              onClick={() => onAddStop()}
              disabled={addStopLoading}
              className="w-full py-3 px-4 rounded-2xl border border-dashed border-[var(--mango)] text-[var(--mango-dark)] bg-[var(--mango-soft)]/30 hover:bg-[var(--mango-soft)]/60 transition-colors flex items-center justify-center gap-2 text-sm font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {addStopLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-[var(--mango)] border-t-transparent rounded-full animate-spin" />
                  Finding another spot…
                </>
              ) : (
                <>
                  <Plus size={16} />
                  Add another stop
                </>
              )}
            </button>
            <p className="text-[11px] text-[var(--muted)] text-center mt-1.5">
              Night going well? Tack on one more.
            </p>
          </div>
        )}
      </div>

      {/* Bottom actions */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] px-6 pb-8 pt-4 bg-gradient-to-t from-white via-white to-transparent">
        <div className="flex gap-3">
          <button
            onClick={onSave}
            className="flex-1 py-4 rounded-full font-semibold border-1.5 border-[#e5e5e5] flex items-center justify-center gap-2 text-gray-700"
          >
            <Save size={18} />
            Save
          </button>
          <button
            onClick={() => setShowShare(true)}
            className="flex-[2] btn-primary"
          >
            <MessageSquare size={18} />
            Send the text
          </button>
        </div>
      </div>
    </div>
  );
}
