'use client';

import { useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Copy, Check, MessageSquare } from 'lucide-react';
import { MESSAGE_TONES } from '@/lib/constants';

export default function TextMessageShare({ itinerary, userName, meta, onBack }) {
  const [selectedTone, setSelectedTone] = useState('confident');
  const [dateName, setDateName] = useState('');
  const [copied, setCopied] = useState(false);
  const textRef = useRef(null);

  if (!itinerary || !itinerary.stops?.length) return null;

  const firstStop = itinerary.stops[0];
  const tone = MESSAGE_TONES.find((t) => t.id === selectedTone);

  // Get day info from the meta
  const dateStr = meta?.date;
  let dayDisplay = '';
  if (dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);

    if (d.toDateString() === today.toDateString()) {
      dayDisplay = 'tonight';
    } else if (d.toDateString() === tomorrow.toDateString()) {
      dayDisplay = 'tomorrow';
    } else {
      dayDisplay = d.toLocaleDateString('en-US', { weekday: 'long' });
    }
  }

  const message = tone?.template(
    dateName || 'there',
    firstStop.place.name,
    dayDisplay,
    firstStop.arriveAt
  ) || '';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for clipboard API
      if (textRef.current) {
        textRef.current.select();
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    }
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-12 pb-2">
        <button onClick={onBack} className="p-2 -ml-2 rounded-full hover:bg-gray-100">
          <ArrowLeft size={22} />
        </button>
        <h1 className="text-lg font-bold font-display">Send the text</h1>
      </div>

      <div className="flex-1 px-6 pt-4">
        {/* Their name */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Their name (optional)
          </label>
          <input
            type="text"
            value={dateName}
            onChange={(e) => setDateName(e.target.value)}
            placeholder="Name"
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-orange-400 focus:outline-none transition-colors"
          />
        </div>

        {/* Tone selector */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Pick a tone
          </label>
          <div className="flex gap-2">
            {MESSAGE_TONES.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedTone(t.id)}
                className={`chip flex-1 justify-center ${selectedTone === t.id ? 'selected' : ''}`}
              >
                {t.name}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2">{tone?.description}</p>
        </div>

        {/* Message preview — styled like iMessage */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-3">
            Preview
          </label>
          <div className="bg-gray-100 rounded-2xl p-4">
            {/* Their "name" as a chat header */}
            <div className="text-center text-xs text-gray-400 mb-3">
              iMessage
            </div>

            {/* The message bubble */}
            <div className="flex justify-end">
              <div className="max-w-[85%] bg-blue-500 text-white px-4 py-3 rounded-2xl rounded-br-md text-sm leading-relaxed">
                {message}
              </div>
            </div>
          </div>
        </div>

        {/* Hidden textarea for clipboard fallback */}
        <textarea
          ref={textRef}
          value={message}
          readOnly
          className="sr-only"
          aria-hidden
        />

        {/* Info note */}
        <div className="bg-orange-50 rounded-xl p-4 text-sm text-orange-800">
          <p className="font-medium mb-1">Only the first stop is mentioned</p>
          <p className="text-orange-600 text-xs">
            The full itinerary stays with you. They just see the plan for the first stop —
            the rest is your secret advantage.
          </p>
        </div>
      </div>

      {/* Copy button */}
      <div className="px-6 pb-10 pt-4">
        <button
          onClick={handleCopy}
          className="w-full py-4 rounded-xl font-semibold text-white flex items-center justify-center gap-2 transition-all"
          style={{ background: copied ? '#22c55e' : 'var(--brand-primary)' }}
        >
          {copied ? (
            <>
              <Check size={18} />
              Copied!
            </>
          ) : (
            <>
              <Copy size={18} />
              Copy to clipboard
            </>
          )}
        </button>
      </div>
    </div>
  );
}
