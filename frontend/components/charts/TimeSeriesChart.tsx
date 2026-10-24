"use client";

import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { formatDate, formatDateTime, formatHourTick, formatNumber, unitLabel } from "@/lib/format";

export const SERIES_COLORS = ["#2563eb", "#0d9488", "#ea580c", "#9333ea"];

export type Series = { label: string; points: { t: string; v: number | null }[] };

const DAY_MS = 86_400_000;

// USGS skips days it has no value for; add empty points so the line breaks instead of bridging the gap
function fillMissingDays(points: { t: number; v: number | null }[]) {
  const filled: { t: number; v: number | null }[] = [];
  for (const p of points) {
    const prev = filled.at(-1);
    if (prev) for (let t = prev.t + DAY_MS; t < p.t; t += DAY_MS) filled.push({ t, v: null });
    filled.push(p);
  }
  return filled;
}

// hourly series have timestamps; daily series have calendar dates
export function TimeSeriesChart({ series, unit, kind }: { series: Series[]; unit: string; kind: "hourly" | "daily" }) {
  const toMs = (t: string) => (kind === "daily" ? Date.parse(`${t.slice(0, 10)}T12:00:00Z`) : Date.parse(t));
  const data = series.map((s) => {
    const points = s.points.map((p) => ({ t: toMs(p.t), v: p.v }));
    return kind === "daily" ? fillMissingDays(points) : points;
  });
  const unitText = unitLabel(unit);

  return (
    <ResponsiveContainer width="100%" height="100%" minHeight={80}>
      <LineChart margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke="#e2e8f0" vertical={false} />
        <XAxis
          dataKey="t"
          type="number"
          scale="time"
          domain={["dataMin", "dataMax"]}
          tickFormatter={(ms: number) => (kind === "daily" ? formatDate(new Date(ms).toISOString()) : formatHourTick(ms))}
          tick={{ fontSize: 11, fill: "#64748b" }}
          stroke="#cbd5e1"
          minTickGap={40}
          allowDuplicatedCategory={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "#64748b" }}
          stroke="#cbd5e1"
          width={52}
          tickFormatter={(v: number) => formatNumber(v)}
          domain={["auto", "auto"]}
        />
        <Tooltip
          labelFormatter={(ms) =>
            kind === "daily" ? formatDate(new Date(Number(ms)).toISOString()) : formatDateTime(new Date(Number(ms)).toISOString())
          }
          formatter={(v, name) => [`${formatNumber(Number(v))} ${unitText}`, name]}
          contentStyle={{ fontSize: 12, borderRadius: 8 }}
        />
        {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
        {series.map((s, i) => (
          <Line
            key={s.label}
            data={data[i]}
            dataKey="v"
            name={s.label}
            stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
            strokeWidth={2}
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
