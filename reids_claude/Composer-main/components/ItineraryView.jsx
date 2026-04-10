'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
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
} from 'lucide-react';
import TextMessageShare from './TextMessageShare';

export default function ItineraryView({ itinerary, meta, userName, onBack, onSave, onRegenerate }) {
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
    <div className="min-h-screen bg-white pb-32">
      {/* Header */}
      <div className="sticky top-0 bg-white/95 backdrop-blur-sm z-10 border-b border-gray-100">
        <div className="flex items-center justify-between px-4 pt-12 pb-3">
          <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-gray-100">
            <ArrowLeft size={22} />
          </button>
          <div className="flex gap-2">
            <button
              onClick={onRegenerate}
              className="p-2 rounded-full hover:bg-gray-100"
              title="Regenerate"
            >
              <RefreshCw size={18} className="text-gray-500" />
            </button>
            <button
              onClick={onSave}
              className="p-2 rounded-full hover:bg-gray-100"
              title="Save plan"
            >
              <Bookmark size={18} className="text-gray-500" />
            </button>
          </div>
        </div>
      </div>

      {/* Summary card */}
      <div className="px-6 pt-5 pb-4">
        <h1 className="text-2xl font-bold font-display mb-3">Your date plan</h1>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-orange-50 text-orange-700 rounded-full">
            <MapPin size={12} /> {meta?.neighborhoods?.join(', ')}
          </span>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-purple-50 text-purple-700 rounded-full">
            {meta?.vibe}
          </span>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-50 text-green-700 rounded-full">
            <Clock size={12} /> {itinerary.startTime} – {itinerary.endTime}
          </span>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-yellow-50 text-yellow-700 rounded-full">
            <DollarSign size={12} /> ~${itinerary.totalCostEstimate}
          </span>
        </div>
      </div>

      {/* Stops timeline */}
      <div className="px-6">
        {itinerary.stops.map((stop, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1 }}
          >
            {/* Walking connector */}
            {stop.walkFromPrevious && (
              <div className="flex items-center gap-3 py-2 pl-6">
                <div className="w-0.5 h-6 bg-orange-200 ml-0.5" />
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <Footprints size={12} />
                  {stop.walkFromPrevious.description}
                </span>
              </div>
            )}

            {/* Stop card */}
            <div className="relative flex gap-4 pb-4">
              {/* Timeline dot */}
              <div className="flex flex-col items-center pt-1">
                <div
                  className="w-3 h-3 rounded-full border-2 flex-shrink-0"
                  style={{
                    borderColor: 'var(--brand-primary)',
                    background: i === 0 ? 'var(--brand-primary)' : 'white',
                  }}
                />
                {i < itinerary.stops.length - 1 && (
                  <div className="w-0.5 flex-1 bg-orange-200 mt-1" />
                )}
              </div>

              {/* Card */}
              <div className="flex-1 bg-white rounded-xl border border-gray-200 overflow-hidden">
                {/* Photo placeholder */}
                {stop.place.photoUrl && (
                  <div className="h-32 bg-gray-100 relative">
                    <img
                      src={stop.place.photoUrl}
                      alt={stop.place.name}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/50 text-white text-xs rounded-full">
                      Stop {stop.order}
                    </div>
                  </div>
                )}

                {!stop.place.photoUrl && (
                  <div className="h-16 bg-gradient-to-r from-orange-50 to-orange-100 flex items-center px-4">
                    <span className="text-xs font-medium text-orange-600 uppercase tracking-wider">
                      Stop {stop.order} · {stop.role}
                    </span>
                  </div>
                )}

                <div className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <h3 className="font-bold text-base">{stop.place.name}</h3>
                    {stop.place.rating && (
                      <span className="flex items-center gap-1 text-xs text-gray-500 flex-shrink-0">
                        <Star size={12} className="text-yellow-500 fill-yellow-500" />
                        {stop.place.rating.toFixed(1)}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-gray-500 mb-3">{stop.place.address}</p>

                  <div className="flex items-center gap-3 text-xs text-gray-600 mb-3">
                    <span className="flex items-center gap-1">
                      <Clock size={12} /> {stop.arriveAt} – {stop.leaveAt}
                    </span>
                    <span>{stop.duration} min</span>
                    <span>~${stop.costEstimate}</span>
                  </div>

                  <div className="flex gap-2">
                    {stop.place.bookingUrl && (
                      <a
                        href={stop.place.bookingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-full border border-orange-200 text-orange-600 hover:bg-orange-50"
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

                  {/* Swap panel (placeholder) */}
                  {swappingStop === i && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      className="mt-3 pt-3 border-t border-gray-100"
                    >
                      <p className="text-xs text-gray-500 mb-2">
                        Alternative suggestions:
                      </p>
                      <div className="space-y-2">
                        {['Alternative 1', 'Alternative 2'].map((alt, j) => (
                          <button
                            key={j}
                            className="w-full text-left p-2 rounded-lg bg-gray-50 hover:bg-gray-100 text-sm transition-colors"
                          >
                            <div className="font-medium">{alt}</div>
                            <div className="text-xs text-gray-500">
                              Tap to swap in this option
                            </div>
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Bottom actions */}
      <div className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] px-6 pb-8 pt-4 bg-gradient-to-t from-white via-white to-transparent">
        <div className="flex gap-3">
          <button
            onClick={onSave}
            className="flex-1 py-4 rounded-xl font-semibold border-2 border-gray-200 flex items-center justify-center gap-2 text-gray-700"
          >
            <Save size={18} />
            Save
          </button>
          <button
            onClick={() => setShowShare(true)}
            className="flex-[2] py-4 rounded-xl font-semibold text-white flex items-center justify-center gap-2"
            style={{ background: 'var(--brand-primary)' }}
          >
            <MessageSquare size={18} />
            Send the text
          </button>
        </div>
      </div>
    </div>
  );
}
