"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import { ApiError, apiGet } from "./api";
import { getEditToken, subscribeEditTokens } from "./editTokens";
import type { Gauge } from "./types";

type ApiState<T> = { key: string; data?: T; error?: ApiError };

// widgets refetch every 5 minutes, matching the backend's USGS cache
const REFRESH_MS = 5 * 60 * 1000;

export function useApi<T>(path: string | null, refreshMs = REFRESH_MS) {
  const [state, setState] = useState<ApiState<T> | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!path) return;
    let cancelled = false;
    apiGet<T>(path)
      .then((data) => !cancelled && setState({ key: path, data }))
      .catch((e: unknown) => {
        if (cancelled) return;
        const error = e instanceof ApiError ? e : new ApiError(0, "error", "Something went wrong");
        setState({ key: path, error });
      });
    return () => {
      cancelled = true;
    };
  }, [path, tick]);

  useEffect(() => {
    if (!path || !refreshMs) return;
    const id = setInterval(() => setTick((t) => t + 1), refreshMs);
    return () => clearInterval(id);
  }, [path, refreshMs]);

  const current = state && state.key === path ? state : null;
  return { data: current?.data, error: current?.error, loading: !!path && !current };
}

let gaugesPromise: Promise<Gauge[]> | null = null;

export function useGauges(): Gauge[] | null {
  const [gauges, setGauges] = useState<Gauge[] | null>(null);
  useEffect(() => {
    if (!gaugesPromise) {
      gaugesPromise = apiGet<Gauge[]>("/gauges").catch((e) => {
        gaugesPromise = null;
        throw e;
      });
    }
    let cancelled = false;
    gaugesPromise.then((g) => !cancelled && setGauges(g)).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return gauges;
}

export function useEditToken(dashboardId: string): string | null {
  return useSyncExternalStore(
    subscribeEditTokens,
    () => getEditToken(dashboardId),
    () => null,
  );
}

// "now" for stale checks, updated every minute
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}
