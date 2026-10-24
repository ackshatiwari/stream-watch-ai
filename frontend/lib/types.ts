// Mirrors backend/schemas/dashboard.py. The backend validates every spec; these types keep the frontend honest.

export type WidgetLayout = { x: number; y: number; w: number; h: number };

type Base = { id: string; layout: WidgetLayout };

export type CurrentReadingWidget = Base & { type: "current_reading"; gauge_id: string; param: string };
export type HourlyChartWidget = Base & { type: "hourly_chart"; gauge_id: string; param: string; days: number };
export type DailyChartWidget = Base & { type: "daily_chart"; gauge_id: string; param: string; days: number };
export type TrendSummaryWidget = Base & { type: "trend_summary"; gauge_id: string; param: string; days: number };
export type NormalBandWidget = Base & { type: "normal_band"; gauge_id: string; param: string };
export type ComparisonChartWidget = Base & {
  type: "comparison_chart";
  gauge_ids: string[];
  param: string;
  days: number;
};
export type TextNoteWidget = Base & { type: "text_note"; heading: string; text: string };

export type Widget =
  | CurrentReadingWidget
  | HourlyChartWidget
  | DailyChartWidget
  | TrendSummaryWidget
  | NormalBandWidget
  | ComparisonChartWidget
  | TextNoteWidget;

export type WidgetType = Widget["type"];

export type DashboardSpec = { title: string; widgets: Widget[] };

export type Dashboard = { id: string; spec: DashboardSpec; created_at?: string; updated_at?: string };

export type Gauge = {
  gauge_id: string;
  name: string;
  short_name: string;
  params: { param_id: string; name: string }[];
};

export type LatestReading = {
  gauge_id: string;
  site_name: string;
  parameter: string;
  param_id: string;
  value: number;
  unit: string;
  measured_at: string;
  provisional: boolean;
};

export type HourlyData = {
  gauge_id: string;
  param: string;
  days: number;
  parameter: string;
  unit: string;
  hourly: { hour: string; mean: number | null; readings: number }[];
};

export type DailyData = {
  gauge_id: string;
  param: string;
  start_date: string;
  end_date: string;
  daily: { date: string; mean: number; unit: string; provisional: boolean }[];
};

export type TrendSummary = {
  gauge_id: string;
  param: string;
  days: number;
  parameter: string;
  unit: string;
  first_hour: string;
  last_hour: string;
  latest_mean: number;
  min: { value: number; hour: string };
  max: { value: number; hour: string };
  overall_mean: number;
  hours_with_data: number;
  trend: "rising" | "falling" | "steady" | "not enough data";
};

export type PercentileResult = LatestReading & {
  percentile: number | null;
  estimated: boolean;
  label: string | null;
  percentile_text: string;
  reference: Record<string, number>;
};

export type ChatChart = {
  kind: "line" | "reading";
  title: string;
  param: string;
  parameter: string;
  unit: string;
  series: { gauge_id: string; label: string; points: { t: string; v: number | null }[] }[];
  gauge_id?: string | null;
  value?: number | null;
  measured_at?: string | null;
  provisional?: boolean | null;
  label?: string | null;
  percentile_text?: string | null;
};

export type ChatSource = {
  gauge_id: string;
  site_name: string;
  param: string;
  parameter: string;
  measured_at?: string | null;
  provisional?: boolean | null;
};

export type ChatResponse = { answer: string; charts: ChatChart[]; sources: ChatSource[] };
