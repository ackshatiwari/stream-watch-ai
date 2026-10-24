"use client";

import { TimeSeriesChart } from "@/components/charts/TimeSeriesChart";
import { NormalBandBar } from "@/components/widgets/NormalBandBar";
import { ReadingMeta, WidgetFrame, WidgetStatus } from "@/components/widgets/WidgetFrame";
import { formatDate, formatDateTime, formatNumber, paramName, unitLabel } from "@/lib/format";
import { useApi, useGauges, useNow } from "@/lib/hooks";
import type {
  ComparisonChartWidget,
  CurrentReadingWidget,
  DailyChartWidget,
  DailyData,
  HourlyChartWidget,
  HourlyData,
  LatestReading,
  NormalBandWidget,
  PercentileResult,
  TextNoteWidget,
  TrendSummary,
  TrendSummaryWidget,
  Widget,
} from "@/lib/types";

function useGaugeName(gaugeId: string): string {
  const gauges = useGauges();
  return gauges?.find((g) => g.gauge_id === gaugeId)?.short_name ?? gaugeId;
}

function daysText(days: number): string {
  return `Last ${days} day${days === 1 ? "" : "s"}`;
}

function CurrentReading({ w }: { w: CurrentReadingWidget }) {
  const name = useGaugeName(w.gauge_id);
  const now = useNow();
  const { data, error, loading } = useApi<LatestReading>(`/gauges/${w.gauge_id}/latest?param=${w.param}`);
  return (
    <WidgetFrame
      title={name}
      subtitle={paramName(w.param)}
      footer={data && <ReadingMeta at={data.measured_at} provisional={data.provisional} now={now} />}
    >
      <WidgetStatus loading={loading} error={error} />
      {data && (
        <div className="flex flex-1 items-center">
          <p className="text-3xl font-semibold tracking-tight text-slate-900">
            {formatNumber(data.value)}
            <span className="ml-1.5 text-base font-normal text-slate-500">{unitLabel(data.unit)}</span>
          </p>
        </div>
      )}
    </WidgetFrame>
  );
}

function HourlyChart({ w }: { w: HourlyChartWidget }) {
  const name = useGaugeName(w.gauge_id);
  const now = useNow();
  const { data, error, loading } = useApi<HourlyData>(`/gauges/${w.gauge_id}/hourly?param=${w.param}&days=${w.days}`);
  const last = data?.hourly.filter((h) => h.mean !== null).at(-1);
  return (
    <WidgetFrame
      title={`${name} · ${paramName(w.param)}`}
      subtitle={`Hourly averages, ${daysText(w.days).toLowerCase()}${data ? ` (${unitLabel(data.unit)})` : ""}`}
      footer={last && <ReadingMeta label="Latest hour" at={last.hour} provisional now={now} />}
    >
      <WidgetStatus loading={loading} error={error} />
      {data && <TimeSeriesChart kind="hourly" unit={data.unit} series={[{ label: name, points: data.hourly.map((h) => ({ t: h.hour, v: h.mean })) }]} />}
    </WidgetFrame>
  );
}

function DailyChart({ w }: { w: DailyChartWidget }) {
  const name = useGaugeName(w.gauge_id);
  const { data, error, loading } = useApi<DailyData>(`/gauges/${w.gauge_id}/daily?param=${w.param}&days=${w.days}`);
  const rows = data?.daily ?? [];
  const provisionalDays = rows.filter((r) => r.provisional).length;
  const unit = rows[0]?.unit ?? "";
  return (
    <WidgetFrame
      title={`${name} · ${paramName(w.param)}`}
      subtitle={`Daily averages, ${daysText(w.days).toLowerCase()}${unit ? ` (${unitLabel(unit)})` : ""}`}
      footer={
        rows.length > 0 && (
          <span className="flex flex-wrap gap-x-2">
            <span>
              {formatDate(rows[0].date)} – {formatDate(rows[rows.length - 1].date)}
            </span>
            {provisionalDays > 0 && (
              <span className="rounded bg-amber-50 px-1.5 py-0.5 font-medium text-amber-800">
                {provisionalDays} provisional day{provisionalDays === 1 ? "" : "s"}
              </span>
            )}
          </span>
        )
      }
    >
      <WidgetStatus loading={loading} error={error} />
      {data && <TimeSeriesChart kind="daily" unit={unit} series={[{ label: name, points: rows.map((r) => ({ t: r.date, v: r.mean })) }]} />}
    </WidgetFrame>
  );
}

const TREND_STYLES: Record<string, { icon: string; className: string }> = {
  rising: { icon: "↑", className: "text-blue-700 bg-blue-50" },
  falling: { icon: "↓", className: "text-slate-700 bg-slate-100" },
  steady: { icon: "→", className: "text-slate-700 bg-slate-100" },
  "not enough data": { icon: "·", className: "text-slate-500 bg-slate-50" },
};

function TrendSummaryView({ w }: { w: TrendSummaryWidget }) {
  const name = useGaugeName(w.gauge_id);
  const now = useNow();
  const { data, error, loading } = useApi<TrendSummary>(`/gauges/${w.gauge_id}/summary?param=${w.param}&days=${w.days}`);
  const style = TREND_STYLES[data?.trend ?? "steady"];
  const unit = data ? unitLabel(data.unit) : "";
  return (
    <WidgetFrame
      title={`${name} · ${paramName(w.param)}`}
      subtitle={daysText(w.days)}
      footer={data && <ReadingMeta label="Latest hour" at={data.last_hour} provisional now={now} />}
    >
      <WidgetStatus loading={loading} error={error} />
      {data && (
        <div className="flex flex-1 flex-col justify-center gap-2 text-sm">
          <span className={`w-fit rounded-full px-2.5 py-1 text-sm font-medium ${style.className}`}>
            {style.icon} {data.trend === "not enough data" ? "Not enough data for a trend" : data.trend[0].toUpperCase() + data.trend.slice(1)}
          </span>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-slate-700">
            <dt className="text-slate-500">Latest</dt>
            <dd>
              {formatNumber(data.latest_mean)} {unit}
            </dd>
            <dt className="text-slate-500">High</dt>
            <dd>
              {formatNumber(data.max.value)} {unit} <span className="text-xs text-slate-400">{formatDateTime(data.max.hour)}</span>
            </dd>
            <dt className="text-slate-500">Low</dt>
            <dd>
              {formatNumber(data.min.value)} {unit} <span className="text-xs text-slate-400">{formatDateTime(data.min.hour)}</span>
            </dd>
          </dl>
        </div>
      )}
    </WidgetFrame>
  );
}

function NormalBand({ w }: { w: NormalBandWidget }) {
  const name = useGaugeName(w.gauge_id);
  const now = useNow();
  const { data, error, loading } = useApi<PercentileResult>(`/gauges/${w.gauge_id}/percentile?param=${w.param}`);
  return (
    <WidgetFrame
      title={`${name} · ${paramName(w.param)}`}
      subtitle="Compared with past years on this date"
      footer={data && <ReadingMeta at={data.measured_at} provisional={data.provisional} now={now} />}
    >
      <WidgetStatus loading={loading} error={error} />
      {data && (
        <div className="flex flex-1 flex-col justify-center gap-2">
          {data.label ? (
            <p className="text-xl font-semibold capitalize text-slate-900">{data.label}</p>
          ) : (
            <p className="text-sm font-medium text-slate-700">No published USGS statistics for this date</p>
          )}
          <p className="text-xs text-slate-600">
            {formatNumber(data.value)} {unitLabel(data.unit)} · {data.percentile_text}
          </p>
          {data.label && <NormalBandBar result={data} />}
        </div>
      )}
    </WidgetFrame>
  );
}

function ComparisonChart({ w }: { w: ComparisonChartWidget }) {
  const gauges = useGauges();
  const now = useNow();
  const nameOf = (id: string) => gauges?.find((g) => g.gauge_id === id)?.short_name ?? id;
  const path = (i: number) => (w.gauge_ids[i] ? `/gauges/${w.gauge_ids[i]}/hourly?param=${w.param}&days=${w.days}` : null);

  // hooks can't be called in a loop, so the up-to-4 gauges each get a fixed slot
  const a = useApi<HourlyData>(path(0));
  const b = useApi<HourlyData>(path(1));
  const c = useApi<HourlyData>(path(2));
  const d = useApi<HourlyData>(path(3));
  const all = [a, b, c, d].slice(0, w.gauge_ids.length);
  const loading = all.some((r) => r.loading);
  const ok = all.map((r, i) => ({ r, id: w.gauge_ids[i] })).filter(({ r }) => r.data);
  const failed = all.map((r, i) => ({ r, id: w.gauge_ids[i] })).filter(({ r }) => r.error);
  const unit = ok[0]?.r.data?.unit ?? "";
  const latestHour = ok
    .map(({ r }) => r.data!.hourly.filter((h) => h.mean !== null).at(-1)?.hour)
    .filter((h): h is string => !!h)
    .sort()
    .at(-1);

  return (
    <WidgetFrame
      title={`${paramName(w.param)} comparison`}
      subtitle={`Hourly averages, ${daysText(w.days).toLowerCase()}${unit ? ` (${unitLabel(unit)})` : ""}`}
      footer={
        <span className="flex flex-col gap-1">
          {latestHour && <ReadingMeta label="Latest hour" at={latestHour} provisional now={now} />}
          {failed.map(({ r, id }) => (
            <span key={id} className="text-slate-600">
              {nameOf(id)}: {r.error?.code === "not_measured" ? "not measured at this gauge" : r.error?.message}
            </span>
          ))}
        </span>
      }
    >
      {loading && <WidgetStatus loading />}
      {!loading && ok.length === 0 && (
        <WidgetStatus error={failed[0]?.r.error} />
      )}
      {!loading && ok.length > 0 && (
        <TimeSeriesChart
          kind="hourly"
          unit={unit}
          series={ok.map(({ r, id }) => ({ label: nameOf(id), points: r.data!.hourly.map((h) => ({ t: h.hour, v: h.mean })) }))}
        />
      )}
    </WidgetFrame>
  );
}

function TextNote({ w }: { w: TextNoteWidget }) {
  // plain text only: React escapes it, so a note can never inject HTML
  return (
    <div className="flex h-full flex-col overflow-auto rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      {w.heading && <h3 className="text-base font-semibold text-slate-900">{w.heading}</h3>}
      {w.text && <p className="mt-1 whitespace-pre-line text-sm text-slate-700">{w.text}</p>}
    </div>
  );
}

export function WidgetView({ widget }: { widget: Widget }) {
  switch (widget.type) {
    case "current_reading":
      return <CurrentReading w={widget} />;
    case "hourly_chart":
      return <HourlyChart w={widget} />;
    case "daily_chart":
      return <DailyChart w={widget} />;
    case "trend_summary":
      return <TrendSummaryView w={widget} />;
    case "normal_band":
      return <NormalBand w={widget} />;
    case "comparison_chart":
      return <ComparisonChart w={widget} />;
    case "text_note":
      return <TextNote w={widget} />;
    default:
      // unknown types are rejected by the backend and never rendered
      return null;
  }
}
