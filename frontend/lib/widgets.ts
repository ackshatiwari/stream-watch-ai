import type { DashboardSpec, Widget, WidgetType } from "./types";

export const GRID_COLUMNS = 12;
export const ROW_HEIGHT = 60;
export const MAX_WIDGETS = 12;

export const WIDGET_CATALOG: Record<
  WidgetType,
  { label: string; description: string; size: { w: number; h: number }; min: { w: number; h: number } }
> = {
  current_reading: {
    label: "Current reading",
    description: "Latest value, with its time",
    size: { w: 3, h: 3 },
    min: { w: 3, h: 3 },
  },
  hourly_chart: {
    label: "Hourly chart",
    description: "Hourly averages, last 1–7 days",
    size: { w: 6, h: 5 },
    min: { w: 3, h: 3 },
  },
  daily_chart: {
    label: "Daily chart",
    description: "Daily averages over weeks or months",
    size: { w: 6, h: 5 },
    min: { w: 3, h: 3 },
  },
  trend_summary: {
    label: "Trend summary",
    description: "Low, high and rising/falling",
    size: { w: 3, h: 4 },
    min: { w: 3, h: 4 },
  },
  normal_band: {
    label: "Normal for today?",
    description: "Compared with past years on this date",
    size: { w: 4, h: 4 },
    min: { w: 4, h: 4 },
  },
  comparison_chart: {
    label: "Comparison chart",
    description: "One measurement at 2–4 gauges",
    size: { w: 8, h: 5 },
    min: { w: 4, h: 3 },
  },
  text_note: {
    label: "Text note",
    description: "Your own heading or note",
    size: { w: 4, h: 2 },
    min: { w: 2, h: 2 },
  },
};

export const WIDGET_TYPES = Object.keys(WIDGET_CATALOG) as WidgetType[];

export const DEFAULT_GAUGE = "01646500";
export const DEFAULT_COMPARISON = ["01646500", "01638500"];

export function newWidgetId(existing: Widget[]): string {
  const used = new Set(existing.map((w) => w.id));
  let n = existing.length + 1;
  while (used.has(`w${n}`)) n++;
  return `w${n}`;
}

// the first row below every existing widget
export function bottomRow(widgets: Widget[]): number {
  return widgets.reduce((max, w) => Math.max(max, w.layout.y + w.layout.h), 0);
}

export function makeWidget(
  type: WidgetType,
  existing: Widget[],
  at?: { x: number; y: number },
  gaugeId: string = DEFAULT_GAUGE,
): Widget {
  const { w, h } = WIDGET_CATALOG[type].size;
  const layout = { x: Math.min(at?.x ?? 0, GRID_COLUMNS - w), y: at?.y ?? bottomRow(existing), w, h };
  const id = newWidgetId(existing);
  switch (type) {
    case "current_reading":
    case "normal_band":
      return { id, type, layout, gauge_id: gaugeId, param: "00060" };
    case "hourly_chart":
      return { id, type, layout, gauge_id: gaugeId, param: "00060", days: 7 };
    case "daily_chart":
      return { id, type, layout, gauge_id: gaugeId, param: "00060", days: 30 };
    case "trend_summary":
      return { id, type, layout, gauge_id: gaugeId, param: "00060", days: 2 };
    case "comparison_chart":
      return { id, type, layout, gauge_ids: DEFAULT_COMPARISON, param: "00060", days: 7 };
    case "text_note":
      return { id, type, layout, heading: "Note", text: "" };
  }
}

// problems the backend would reject, caught before saving so the message is friendlier
export function specProblems(spec: DashboardSpec): string[] {
  const problems: string[] = [];
  if (!spec.title.trim()) problems.push("Give your dashboard a title.");
  if (spec.widgets.length === 0) problems.push("Add at least one widget.");
  if (spec.widgets.length > MAX_WIDGETS) problems.push(`Use at most ${MAX_WIDGETS} widgets.`);
  for (const w of spec.widgets) {
    if (w.type === "comparison_chart" && (w.gauge_ids.length < 2 || w.gauge_ids.length > 4)) {
      problems.push("Comparison charts need 2 to 4 gauges.");
    }
    if (w.type === "text_note" && !w.heading.trim() && !w.text.trim()) {
      problems.push("Text notes need a heading or some text.");
    }
  }
  return problems;
}
