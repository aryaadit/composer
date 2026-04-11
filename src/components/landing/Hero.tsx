"use client";

import { motion } from "motion/react";
import { Button } from "@/components/ui/Button";

export function Hero() {
  return (
    <section className="flex flex-1 flex-col items-center justify-center px-6 text-center">
      <motion.p
        className="font-sans text-sm tracking-widest text-warm-gray uppercase mb-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        New York City
      </motion.p>

      <motion.h1
        className="font-serif text-5xl md:text-7xl text-charcoal leading-tight mb-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.15 }}
      >
        Compose your night.
      </motion.h1>

      <motion.p
        className="font-sans text-lg md:text-xl text-warm-gray max-w-md mb-10"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.3 }}
      >
        A curated date night, built for you in under a minute.
      </motion.p>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.45 }}
      >
        <Button href="/compose">Start Composing</Button>
      </motion.div>

      <motion.p
        className="font-sans text-xs text-warm-gray/60 mt-16"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.7 }}
      >
        Opener &middot; Main &middot; Closer — three stops, one perfect night
      </motion.p>
    </section>
  );
}
