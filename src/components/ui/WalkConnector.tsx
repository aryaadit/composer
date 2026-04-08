"use client";

import { motion } from "motion/react";

interface WalkConnectorProps {
  walkMinutes: number;
  index: number;
}

export default function WalkConnector({
  walkMinutes,
  index,
}: WalkConnectorProps) {
  return (
    <motion.div
      className="flex items-center justify-center py-3"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, delay: index * 0.15 + 0.1 }}
    >
      <div className="h-px w-8 bg-border" />
      <span className="px-3 font-sans text-xs text-warm-gray whitespace-nowrap">
        {walkMinutes} min walk
      </span>
      <div className="h-px w-8 bg-border" />
    </motion.div>
  );
}
