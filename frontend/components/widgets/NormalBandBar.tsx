"use client";

import { formatNumber, unitLabel } from "@/lib/format";
import type { PercentileResult } from "@/lib/types";

// USGS flow-condition classes, bounded by the published 10th, 25th, 75th and 90th percentiles for the date
const CLASSES = [
  { label: "Much below", color: "#b45309" },
  { label: "Below", color: "#f59e0b" },
  { label: "Normal", color: "#16a34a" },
  { label: "Above", color: "#38bdf8" },
  { label: "Much above", color: "#1d4ed8" },
];

// the band uses only published statistics (product rule 5); without all four boundaries it isn't drawn
export function NormalBandBar({ result }: { result: PercentileResult }) {
  const { reference: ref, value } = result;
  const bounds = [ref.p10, ref.p25, ref.p75, ref.p90];
  if (bounds.some((b) => b === undefined || b <= 0) || !(ref.min > 0) || !(ref.max > 0) || value <= 0) return null;

  // log scale, like the percentile method, from the record low to the record high for this date
  const lo = Math.log(Math.min(ref.min, value));
  const hi = Math.log(Math.max(ref.max, value));
  const pos = (x: number) => ((Math.log(x) - lo) / (hi - lo)) * 100;
  const edges = [0, ...bounds.map(pos), 100];
  const marker = Math.min(100, Math.max(0, pos(value)));
  const unit = unitLabel(result.unit);

  return (
    <div className="mt-1">
      <div className="relative h-3 w-full overflow-hidden rounded-full">
        {CLASSES.map((c, i) => (
          <div
            key={c.label}
            className="absolute top-0 h-full"
            style={{ left: `${edges[i]}%`, width: `${edges[i + 1] - edges[i]}%`, background: c.color, opacity: 0.85 }}
            title={`${c.label} normal`}
          />
        ))}
      </div>
      <div className="relative h-4">
        <div className="absolute -top-0.5 h-0 w-0 -translate-x-1/2 border-x-[6px] border-b-[8px] border-x-transparent border-b-slate-900" style={{ left: `${marker}%` }} />
      </div>
      <div className="flex justify-between text-[10px] text-slate-500">
        <span>Normal range: {formatNumber(ref.p25)}–{formatNumber(ref.p75)} {unit}</span>
        <span>{ref.years} years of record</span>
      </div>
    </div>
  );
}
