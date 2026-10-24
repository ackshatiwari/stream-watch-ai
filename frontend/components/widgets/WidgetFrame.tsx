"use client";

import type { ReactNode } from "react";

import type { ApiError } from "@/lib/api";
import { formatAge, formatDateTime, isStale } from "@/lib/format";

export function WidgetFrame({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-2 min-w-0">
        <h3 className="truncate text-sm font-semibold text-slate-900" title={title}>
          {title}
        </h3>
        {subtitle && <p className="truncate text-xs text-slate-500">{subtitle}</p>}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      {footer && <div className="mt-2 text-xs text-slate-500">{footer}</div>}
    </div>
  );
}

const ERROR_TITLES: Record<string, string> = {
  not_measured: "Not measured at this gauge",
  no_data: "No recent data",
  upstream: "USGS data is unavailable right now",
  unknown_gauge: "Unknown gauge",
  network: "Can't reach the server",
};

export function WidgetStatus({ loading, error }: { loading?: boolean; error?: ApiError }) {
  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="h-full w-full animate-pulse rounded-lg bg-slate-100" aria-label="Loading" />
      </div>
    );
  }
  if (!error) return null;
  return (
    <div className="flex flex-1 flex-col items-center justify-center rounded-lg bg-slate-50 p-3 text-center">
      <p className="text-sm font-medium text-slate-700">{ERROR_TITLES[error.code] ?? "Couldn't load this widget"}</p>
      <p className="mt-1 line-clamp-3 text-xs text-slate-500">{error.message}</p>
    </div>
  );
}

// every reading shows when it was taken and whether it's provisional (product rule 3)
export function ReadingMeta({ at, provisional, now, label = "Reading at" }: {
  at: string;
  provisional?: boolean | null;
  now: number;
  label?: string;
}) {
  const stale = isStale(at, now);
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span>
        {label} {formatDateTime(at)}
      </span>
      {provisional && (
        <span
          className="rounded bg-amber-50 px-1.5 py-0.5 font-medium text-amber-800"
          title="Provisional data has not been reviewed by USGS and may change."
        >
          Provisional
        </span>
      )}
      {stale && (
        <span className="rounded bg-red-50 px-1.5 py-0.5 font-medium text-red-700">
          Stale: last reading {formatAge(at, now)}
        </span>
      )}
    </span>
  );
}
