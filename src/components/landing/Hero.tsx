"use client";

import { motion } from "motion/react";
import { Button } from "@/components/ui/Button";

export function Hero() {
  return (
    <section className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <motion.h1
        className="font-serif text-4xl md:text-5xl font-normal text-charcoal leading-tight mb-5"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.15 }}
      >
        Compose your night.
      </motion.h1>

      <motion.p
        className="font-sans text-base md:text-lg text-warm-gray max-w-md mb-10"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.3 }}
      >
        Tell us the vibe, the neighborhood, the time. We&apos;ll figure out the rest.
      </motion.p>

      <motion.div
        className="w-full max-w-xs"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.45 }}
      >
        <Button href="/compose" className="w-full">Start Composing</Button>
      </motion.div>

      <motion.p
        className="font-sans text-xs text-muted mt-14"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.7 }}
      >
        Opener &middot; Main &middot; Closer. Two to four stops, picked by people who live here.
      </motion.p>
    </section>
  );
}
