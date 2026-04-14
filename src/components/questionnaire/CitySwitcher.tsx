"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { CITIES, ACTIVE_CITY_ID } from "@/config/cities";

export function CitySwitcherButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="flex justify-end mt-6">
      <button
        onClick={onClick}
        className="inline-flex items-center gap-1.5 font-sans text-xs text-muted hover:text-charcoal transition-colors"
      >
        <PinIcon />
        NYC &middot; Change city
      </button>
    </div>
  );
}

export function CitySwitcher({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  // Close on Escape. Simple listener; full focus trap is a later polish pass.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="backdrop"
            className="fixed inset-0 z-40 bg-charcoal/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            key="sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Choose a city"
            className="fixed left-0 right-0 bottom-0 z-50 bg-cream rounded-t-2xl pt-3 pb-[max(1.5rem,env(safe-area-inset-bottom))] px-6 shadow-xl max-h-[85vh] overflow-y-auto"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 280 }}
          >
            {/* Grabber */}
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" />

            <div className="flex items-start justify-between mb-5">
              <div>
                <h2 className="font-serif text-2xl text-charcoal">Cities</h2>
                <p className="font-sans text-sm text-muted">
                  NYC is live. More on the way.
                </p>
              </div>
              <button
                onClick={onClose}
                aria-label="Close"
                className="font-sans text-sm text-muted hover:text-charcoal transition-colors p-1"
              >
                ✕
              </button>
            </div>

            <ul className="flex flex-col gap-2 mb-6">
              {CITIES.map((city) => {
                const isActive = city.id === ACTIVE_CITY_ID;
                return (
                  <li
                    key={city.id}
                    className={`rounded-xl border p-4 flex items-start justify-between gap-3 ${
                      isActive
                        ? "border-burgundy bg-burgundy/5"
                        : "border-border bg-white"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={`font-serif text-lg ${
                            isActive ? "text-burgundy font-medium" : "text-charcoal"
                          }`}
                        >
                          {city.name}
                        </span>
                        {isActive && <CheckIcon />}
                      </div>
                      <p className="font-sans text-sm text-muted mt-0.5">
                        {city.tagline}
                      </p>
                    </div>
                    {!isActive && (
                      <span className="shrink-0 inline-block px-3 py-1 text-xs font-sans font-medium rounded-full bg-burgundy/10 text-burgundy">
                        Coming soon
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>

            <p className="font-sans text-xs text-muted text-center">
              More cities coming. Want one sooner? Text us.
            </p>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function PinIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 21s-7-6.5-7-12a7 7 0 1 1 14 0c0 5.5-7 12-7 12Z" />
      <circle cx="12" cy="9" r="2.5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-burgundy"
      aria-hidden
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}
