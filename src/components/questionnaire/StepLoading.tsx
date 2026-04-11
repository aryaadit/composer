"use client";

import { motion, AnimatePresence } from "motion/react";
import { useState, useEffect } from "react";

const messages = [
  "Composing your night...",
  "Scouting the neighborhood...",
  "Checking the weather...",
  "Curating the perfect trio...",
  "Adding the finishing touches...",
];

export function StepLoading() {
  const [messageIndex, setMessageIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((i) => (i + 1) % messages.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 min-h-[60vh]">
      <motion.div
        className="w-12 h-12 rounded-full border-2 border-burgundy border-t-transparent mb-8"
        animate={{ rotate: 360 }}
        transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
      />

      <AnimatePresence mode="wait">
        <motion.p
          key={messageIndex}
          className="font-serif text-2xl text-charcoal text-center"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3 }}
        >
          {messages[messageIndex]}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}
