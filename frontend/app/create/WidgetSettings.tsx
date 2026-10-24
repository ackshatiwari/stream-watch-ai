"use client";

import { paramName } from "@/lib/format";
import type { Gauge, Widget } from "@/lib/types";
import { WIDGET_CATALOG } from "@/lib/widgets";

const fieldClass = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-blue-500";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}

const DAY_RANGES: Record<string, number[]> = {
  hourly_chart: [1, 2, 3, 5, 7],
  trend_summary: [1, 2, 3, 5, 7],
  comparison_chart: [1, 2, 3, 5, 7],
  daily_chart: [7, 14, 30, 60, 90, 180, 366],
};

export function WidgetSettings({
  gauges,
  widget,
  onChange,
  onRemove,
}: {
  gauges: Gauge[];
  widget: Widget;
  onChange: (w: Widget) => void;
  onRemove: (id: string) => void;
}) {
  const catalog = WIDGET_CATALOG[widget.type];

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
      <div>
        <p className="text-sm font-semibold text-slate-900">{catalog.label}</p>
        <p className="text-xs text-slate-500">{catalog.description}</p>
      </div>

      {"gauge_id" in widget && (
        <>
          <Field label="Gauge">
            <select
              className={fieldClass}
              value={widget.gauge_id}
              onChange={(e) => {
                const gauge = gauges.find((g) => g.gauge_id === e.target.value)!;
                // keep the measurement if the new gauge reports it; otherwise fall back to its first one
                const param = gauge.params.some((p) => p.param_id === widget.param) ? widget.param : gauge.params[0].param_id;
                onChange({ ...widget, gauge_id: gauge.gauge_id, param });
              }}
            >
              {gauges.map((g) => (
                <option key={g.gauge_id} value={g.gauge_id}>
                  {g.short_name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Measurement">
            <select className={fieldClass} value={widget.param} onChange={(e) => onChange({ ...widget, param: e.target.value })}>
              {/* only what this gauge actually measures */}
              {gauges
                .find((g) => g.gauge_id === widget.gauge_id)
                ?.params.map((p) => (
                  <option key={p.param_id} value={p.param_id}>
                    {paramName(p.param_id)}
                  </option>
                ))}
            </select>
          </Field>
          {(widget.type === "daily_chart" || widget.type === "normal_band") && widget.param === "00065" && (
            <p className="text-xs text-amber-700">USGS usually doesn&apos;t publish daily statistics for gage height; discharge works best here.</p>
          )}
        </>
      )}

      {widget.type === "comparison_chart" && (
        <>
          <Field label="Measurement">
            <select
              className={fieldClass}
              value={widget.param}
              onChange={(e) => {
                const param = e.target.value;
                // drop gauges that don't report the new measurement
                const gauge_ids = widget.gauge_ids.filter((id) => gauges.find((g) => g.gauge_id === id)?.params.some((p) => p.param_id === param));
                onChange({ ...widget, param, gauge_ids });
              }}
            >
              {[...new Set(gauges.flatMap((g) => g.params.map((p) => p.param_id)))].map((id) => (
                <option key={id} value={id}>
                  {paramName(id)}
                </option>
              ))}
            </select>
          </Field>
          <fieldset className="space-y-1">
            <legend className="text-xs font-medium text-slate-600">Gauges (pick 2–4)</legend>
            {gauges
              .filter((g) => g.params.some((p) => p.param_id === widget.param))
              .map((g) => {
                const checked = widget.gauge_ids.includes(g.gauge_id);
                const full = !checked && widget.gauge_ids.length >= 4;
                return (
                  <label key={g.gauge_id} className={`flex items-center gap-2 text-sm ${full ? "text-slate-400" : "text-slate-800"}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={full}
                      onChange={() =>
                        onChange({
                          ...widget,
                          gauge_ids: checked ? widget.gauge_ids.filter((id) => id !== g.gauge_id) : [...widget.gauge_ids, g.gauge_id],
                        })
                      }
                    />
                    {g.short_name}
                  </label>
                );
              })}
            {widget.gauge_ids.length < 2 && <p className="text-xs text-amber-700">Pick at least 2 gauges.</p>}
          </fieldset>
        </>
      )}

      {"days" in widget && (
        <Field label="Time range">
          <select className={fieldClass} value={widget.days} onChange={(e) => onChange({ ...widget, days: Number(e.target.value) })}>
            {DAY_RANGES[widget.type].map((d) => (
              <option key={d} value={d}>
                Last {d} day{d === 1 ? "" : "s"}
              </option>
            ))}
          </select>
        </Field>
      )}

      {widget.type === "text_note" && (
        <>
          <Field label="Heading">
            <input className={fieldClass} value={widget.heading} maxLength={80} onChange={(e) => onChange({ ...widget, heading: e.target.value })} />
          </Field>
          <Field label="Note">
            <textarea
              className={`${fieldClass} resize-none`}
              rows={5}
              value={widget.text}
              maxLength={500}
              onChange={(e) => onChange({ ...widget, text: e.target.value })}
            />
          </Field>
        </>
      )}

      <button type="button" onClick={() => onRemove(widget.id)} className="text-sm font-medium text-red-600 hover:text-red-700">
        Remove widget
      </button>
    </div>
  );
}
