'use client';

import { useState, useRef } from 'react';
import { Copy, Check, MessageSquare } from 'lucide-react';
import { MESSAGE_TONES } from '@/lib/constants';

export default function TextMessageShare({ itinerary, userName, meta, onBack }) {
  const [selectedTone, setSelectedTone] = useState('confident');
  const [dateName, setDateName] = useState('');
  const [copied, setCopied] = useState(false);
  const textRef = useRef(null);

  if (!itinerary || !itinerary.stops?.length) return null;

  const firstStop = itinerary.stops[0];
  const tone = MESSAGE_TONES.find((t) => t.id === selectedTone);

  const dateStr = meta?.date;
  let dayDisplay = '';
  if (dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    const today = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(today.getDate() + 1);
    if (d.toDateString() === today.toDateString()) dayDisplay = 'tonight';
    else if (d.toDateString() === tomorrow.toDateString()) dayDisplay = 'tomorrow';
    else dayDisplay = d.toLocaleDateString('en-US', { weekday: 'long' });
  }

  const message =
    tone?.template(dateName || 'there', firstStop.place.name, dayDisplay, firstStop.arriveAt) ||
    '';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      if (textRef.current) {
        textRef.current.select();
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    }
  };

  return (
    <div className="min-h-[100dvh] bg-white flex flex-col relative">
      <div className="flex items-center gap-3 px-4 pt-12 pb-2">
        <button
          onClick={onBack}
          className="w-10 h-10 -ml-2 rounded-full hover:bg-gray-100 flex items-center justify-center text-2xl"
        >
          ‹
        </button>
        <h1 className="text-lg font-bold serif">Send the text</h1>
      </div>

      <div className="flex-1 px-6 pt-4">
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Their name (optional)
          </label>
          <input
            type="text"
            value={dateName}
            onChange={(e) => setDateName(e.target.value)}
            placeholder="Name"
            className="w-full px-4 py-3 border-1.5 border border-[#e5e5e5] rounded-2xl focus:border-[var(--mango)] focus:outline-none transition-colors"
          />
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-3">Pick a tone</label>
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
          <p className="text-xs text-[var(--muted)] mt-2">{tone?.description}</p>
        </div>

        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-3">Preview</label>
          <div className="bg-gray-100 rounded-2xl p-4">
            <div className="text-center text-xs text-[var(--muted)] mb-3">iMessage</div>
            <div className="flex justify-end">
              <div className="max-w-[85%] bg-blue-500 text-white px-4 py-3 rounded-2xl rounded-br-md text-sm leading-relaxed">
                {message}
              </div>
            </div>
          </div>
        </div>

        <textarea ref={textRef} value={message} readOnly className="sr-only" aria-hidden />

        <div className="bg-[var(--mango-soft)] rounded-2xl p-4 text-sm text-[var(--mango-dark)]">
          <p className="font-semibold mb-1">Only the first stop is mentioned</p>
          <p className="text-xs opacity-80">
            The full itinerary stays with you. They just see the plan for the first stop — the rest
            is your secret advantage.
          </p>
        </div>
      </div>

      <div className="px-6 pb-10 pt-4">
        <button
          onClick={handleCopy}
          className="btn-primary"
          style={copied ? { background: '#22c55e' } : undefined}
        >
          {copied ? (
            <>
              <Check size={18} /> Copied!
            </>
          ) : (
            <>
              <Copy size={18} /> Copy to clipboard
            </>
          )}
        </button>
      </div>
    </div>
  );
}
