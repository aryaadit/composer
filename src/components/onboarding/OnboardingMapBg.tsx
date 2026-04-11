"use client";

// Subtle abstract NYC map backdrop for the onboarding splash. Decorative only.
// All POI positions are precompiled Tailwind classes so the JIT picks them up
// without any runtime style props.

interface POI {
  pos: string;
  emoji: string;
}

const POIS: POI[] = [
  { pos: "left-[38%] top-[14%]", emoji: "🍷" },
  { pos: "left-[52%] top-[19%]", emoji: "🖼️" },
  { pos: "left-[28%] top-[24%]", emoji: "🍝" },
  { pos: "left-[58%] top-[28%]", emoji: "🚶" },
  { pos: "left-[34%] top-[34%]", emoji: "🎭" },
  { pos: "left-[48%] top-[38%]", emoji: "🍱" },
  { pos: "left-[24%] top-[42%]", emoji: "🌉" },
  { pos: "left-[56%] top-[46%]", emoji: "🎷" },
  { pos: "left-[40%] top-[50%]", emoji: "🍸" },
  { pos: "left-[30%] top-[56%]", emoji: "🌳" },
];

export function OnboardingMapBg() {
  return (
    <div
      className="absolute inset-0 overflow-hidden pointer-events-none opacity-40"
      aria-hidden
    >
      <svg
        viewBox="0 0 430 900"
        preserveAspectRatio="xMidYMid slice"
        className="w-full h-full"
      >
        <defs>
          <linearGradient id="composer-water" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#c9d9e8" />
            <stop offset="1" stopColor="#dde8f0" />
          </linearGradient>
        </defs>
        <rect width="430" height="900" fill="#FAF8F5" />
        {/* Hudson */}
        <path
          d="M 0 0 L 70 0 L 90 180 L 60 340 L 110 520 L 80 700 L 40 900 L 0 900 Z"
          fill="url(#composer-water)"
        />
        {/* East river */}
        <path
          d="M 330 0 L 430 0 L 430 900 L 380 900 L 360 720 L 400 540 L 350 360 L 380 180 Z"
          fill="url(#composer-water)"
        />
        {/* Avenues + crosstown streets */}
        <g stroke="#E5E0DA" strokeWidth="1.5" fill="none">
          <path d="M 100 50 L 100 860" />
          <path d="M 160 30 L 170 870" />
          <path d="M 220 20 L 235 880" />
          <path d="M 280 40 L 295 870" />
          <path d="M 100 140 L 320 160" />
          <path d="M 90 260 L 310 280" />
          <path d="M 95 380 L 320 400" />
          <path d="M 90 500 L 310 520" />
        </g>
      </svg>
      <div className="absolute inset-0 text-xl">
        {POIS.map((p) => (
          <div key={p.pos} className={`absolute ${p.pos}`}>
            {p.emoji}
          </div>
        ))}
      </div>
    </div>
  );
}
