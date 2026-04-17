"use client";

import { useState } from "react";

const FEEDBACK_URL = "https://forms.gle/ccbUjsfpFYeN36sY8";

export function FeedbackButton() {
  const [hovered, setHovered] = useState(false);

  return (
    <a
      href={FEEDBACK_URL}
      target="_blank"
      rel="noopener noreferrer"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-full bg-zinc-800 px-4 py-2.5 text-sm text-white shadow-lg transition-all hover:bg-zinc-700 hover:shadow-xl"
      style={{
        bottom: "max(1.5rem, env(safe-area-inset-bottom, 0px) + 1.5rem)",
      }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
      {hovered ? "Feedback" : null}
    </a>
  );
}
