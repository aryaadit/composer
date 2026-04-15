"use client";

import { motion } from "motion/react";

interface WalkConnectorProps {
  walkMinutes: number;
  index: number;
  mapUrl?: string | null;
}

export function WalkConnector({
  walkMinutes,
  index,
  mapUrl,
}: WalkConnectorProps) {
  return (
    <motion.div
      className="flex flex-col items-center gap-2 py-5"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, delay: index * 0.15 + 0.1 }}
    >
      {mapUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={mapUrl}
          alt={`${walkMinutes} minute walking route`}
          loading="lazy"
          width={512}
          height={120}
          className="w-full max-w-lg h-[120px] object-cover rounded-lg"
        />
      )}
      <span className="font-sans text-xs text-muted whitespace-nowrap">
        {walkMinutes} min walk
      </span>
    </motion.div>
  );
}
