const TIME_ZONE = "America/New_York";

const UNIT_LABELS: Record<string, string> = {
  "ft3/s": "ft³/s",
  ft: "ft",
  "deg C": "°C",
  "uS/cm @25C": "µS/cm",
  "mg/l": "mg/L",
  "mg/l as N": "mg/L as N",
  "std units": "",
  FNU: "FNU",
};

export const PARAM_NAMES: Record<string, string> = {
  "00060": "Discharge",
  "00065": "Gage height",
  "00010": "Water temperature",
  "00095": "Specific conductance",
  "00300": "Dissolved oxygen",
  "00400": "pH",
  "63680": "Turbidity",
  "99133": "Nitrate + nitrite",
};

// a reading older than this is called out as stale
export const STALE_AFTER_MS = 2 * 60 * 60 * 1000;

export function unitLabel(unit: string): string {
  return UNIT_LABELS[unit] ?? unit;
}

export function paramName(param: string): string {
  return PARAM_NAMES[param] ?? param;
}

export function formatNumber(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return v.toLocaleString("en-US", { maximumFractionDigits: Math.abs(v) >= 100 ? 0 : 2 });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "unknown time";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(d);
}

// daily values are calendar dates ("2026-10-20"), shown without a time
export function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function formatHourTick(ms: number): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, weekday: "short", hour: "numeric" }).format(ms);
}

export function formatAge(iso: string, now: number): string {
  const hours = Math.round((now - new Date(iso).getTime()) / 3_600_000);
  if (hours < 48) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return `${Math.round(hours / 24)} days ago`;
}

export function isStale(iso: string, now: number): boolean {
  return now - new Date(iso).getTime() > STALE_AFTER_MS;
}
