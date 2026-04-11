"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { ItineraryResponse } from "@/types";

type ToneId = "confident" | "casual" | "sweet";

interface Tone {
  id: ToneId;
  name: string;
  description: string;
  template: (name: string, place: string, day: string, time: string) => string;
}

const TONES: Tone[] = [
  {
    id: "confident",
    name: "Confident",
    description: "Direct and decisive",
    template: (_n, place, day, time) =>
      `Hey! Let's do ${place} on ${day} at ${time}. You're going to love it.`,
  },
  {
    id: "casual",
    name: "Casual",
    description: "Relaxed and easy",
    template: (name, place, day, time) =>
      `Hey ${name}, how about ${place} on ${day} around ${time}?`,
  },
  {
    id: "sweet",
    name: "Sweet",
    description: "Warm and thoughtful",
    template: (_n, place, day, time) =>
      `I found this place I think you'd really like — ${place}. Are you free ${day} at ${time}?`,
  },
];

function describeDay(dayISO: string | undefined): string {
  if (!dayISO) return "tonight";
  const target = new Date(`${dayISO}T12:00:00`);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  if (target.toDateString() === today.toDateString()) return "tonight";
  if (target.toDateString() === tomorrow.toDateString()) return "tomorrow";
  return target.toLocaleDateString("en-US", { weekday: "long" });
}

function format12h(time24: string | undefined): string {
  if (!time24) return "";
  const [h, m] = time24.split(":").map(Number);
  const period = h >= 12 ? "pm" : "am";
  const display = h % 12 || 12;
  return `${display}${m > 0 ? `:${String(m).padStart(2, "0")}` : ""}${period}`;
}

interface TextMessageShareProps {
  itinerary: ItineraryResponse;
  open: boolean;
  onClose: () => void;
}

export function TextMessageShare({
  itinerary,
  open,
  onClose,
}: TextMessageShareProps) {
  const [selectedTone, setSelectedTone] = useState<ToneId>("confident");
  const [dateName, setDateName] = useState("");
  const [copied, setCopied] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const firstStop = itinerary.stops[0];
  const tone = TONES.find((t) => t.id === selectedTone);
  if (!firstStop || !tone) return null;

  const dayDisplay = describeDay(itinerary.inputs.day);
  const timeDisplay = format12h(itinerary.inputs.startTime);
  const message = tone.template(
    dateName || "there",
    firstStop.venue.name,
    dayDisplay,
    timeDisplay
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      if (textRef.current) {
        textRef.current.select();
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 bg-charcoal/40 z-40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            className="fixed bottom-0 left-0 right-0 z-50 bg-cream rounded-t-3xl shadow-2xl max-h-[92vh] overflow-y-auto"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 280 }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 rounded-full bg-border" />
            </div>

            <div className="px-6 pb-8 max-w-lg w-full mx-auto">
              <div className="flex items-center justify-between mb-6">
                <h2 className="font-serif text-2xl text-charcoal">Send the text</h2>
                <button
                  onClick={onClose}
                  className="font-sans text-sm text-warm-gray hover:text-charcoal transition-colors"
                >
                  Close
                </button>
              </div>

              {/* Their name */}
              <div className="mb-5">
                <label className="block font-sans text-xs uppercase tracking-wider text-warm-gray mb-2">
                  Their name (optional)
                </label>
                <input
                  type="text"
                  value={dateName}
                  onChange={(e) => setDateName(e.target.value)}
                  placeholder="Name"
                  className="w-full px-4 py-3 bg-white border border-border rounded-xl font-sans text-sm focus:border-burgundy focus:outline-none transition-colors text-charcoal"
                />
              </div>

              {/* Tone selector */}
              <div className="mb-5">
                <label className="block font-sans text-xs uppercase tracking-wider text-warm-gray mb-2">
                  Pick a tone
                </label>
                <div className="flex gap-2">
                  {TONES.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setSelectedTone(t.id)}
                      className={`flex-1 py-2.5 rounded-full text-sm font-sans font-medium transition-all ${
                        selectedTone === t.id
                          ? "bg-burgundy text-cream"
                          : "bg-white border border-border text-charcoal hover:border-burgundy/30"
                      }`}
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
                <p className="font-sans text-xs text-warm-gray mt-2">
                  {tone.description}
                </p>
              </div>

              {/* iMessage preview */}
              <div className="mb-5">
                <label className="block font-sans text-xs uppercase tracking-wider text-warm-gray mb-2">
                  Preview
                </label>
                <div className="bg-white border border-border rounded-2xl p-4">
                  <div className="text-center font-sans text-[10px] text-warm-gray mb-3 uppercase tracking-wider">
                    iMessage
                  </div>
                  <div className="flex justify-end">
                    <div className="max-w-[85%] bg-[#3478F6] text-white px-4 py-2.5 rounded-2xl rounded-br-md font-sans text-sm leading-relaxed">
                      {message}
                    </div>
                  </div>
                </div>
              </div>

              <textarea
                ref={textRef}
                value={message}
                readOnly
                className="sr-only"
                aria-hidden
              />

              {/* The pitch */}
              <div className="bg-burgundy/5 border border-burgundy/20 rounded-xl p-4 mb-6">
                <p className="font-sans text-xs font-semibold text-burgundy mb-1">
                  Only the first stop is mentioned
                </p>
                <p className="font-sans text-xs text-charcoal/80 leading-relaxed">
                  The full itinerary stays with you. They just see the plan for the first
                  stop — the rest is your secret advantage.
                </p>
              </div>

              {/* Copy button */}
              <button
                onClick={handleCopy}
                className={`w-full py-4 rounded-full font-sans font-medium text-sm transition-colors ${
                  copied
                    ? "bg-forest text-cream"
                    : "bg-burgundy text-cream hover:bg-burgundy-light"
                }`}
              >
                {copied ? "Copied ✓" : "Copy to clipboard"}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
