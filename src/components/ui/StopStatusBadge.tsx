"use client";

import { Tooltip } from "./Tooltip";

// Audit item 6: em dashes removed from tooltip copy.
const CONFIG = {
  fixed: { label: "Res required", tooltip: "Timed reservation. Lock it in." },
  flexible: { label: "Walk-in", tooltip: "Walk-in friendly. Timing is loose." },
} as const;

type Status = keyof typeof CONFIG;

export function StopStatusBadge({ status }: { status: Status }) {
  const { label, tooltip } = CONFIG[status];
  return (
    <Tooltip content={tooltip}>
      <span tabIndex={0} className="cursor-default">{label}</span>
    </Tooltip>
  );
}
