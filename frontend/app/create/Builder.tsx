"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { DashboardGrid } from "@/components/DashboardGrid";
import { ApiError, apiGet, apiPost, apiPut } from "@/lib/api";
import { saveEditToken } from "@/lib/editTokens";
import { useEditToken, useGauges } from "@/lib/hooks";
import type { Dashboard, DashboardSpec, Gauge, Widget, WidgetLayout, WidgetType } from "@/lib/types";
import { MAX_WIDGETS, WIDGET_CATALOG, WIDGET_TYPES, makeWidget, specProblems } from "@/lib/widgets";
import { WidgetSettings } from "./WidgetSettings";

const AI_EXAMPLES = [
  "Show me how the Potomac is doing this week",
  "Compare flow on Goose Creek and Difficult Run",
  "Water quality at Little Falls",
  "Is the Rappahannock normal for October?",
];

type Created = Dashboard & { edit_token: string };

export function Builder({ editId, initialPrompt }: { editId: string | null; initialPrompt: string }) {
  const router = useRouter();
  const gauges = useGauges();
  const token = useEditToken(editId ?? "");

  const [title, setTitle] = useState("My river dashboard");
  const [widgets, setWidgets] = useState<Widget[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draggingType, setDraggingType] = useState<WidgetType | null>(null);

  const [loadState, setLoadState] = useState<"idle" | "loading" | "loaded" | "error">(editId ? "loading" : "idle");
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const [aiPrompt, setAiPrompt] = useState(initialPrompt);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState("");
  const autoRan = useRef(false);

  const spec: DashboardSpec = { title, widgets };
  const selected = widgets.find((w) => w.id === selectedId) ?? null;
  const canUpdate = !!editId && !!token;

  // a private edit link carries the token after "#": keep it in this browser, then remove it from the address bar
  useEffect(() => {
    if (!editId) return;
    const match = window.location.hash.match(/token=([^&]+)/);
    if (match) {
      saveEditToken(editId, decodeURIComponent(match[1]));
      window.history.replaceState(null, "", `/create?edit=${editId}`);
    }
  }, [editId]);

  useEffect(() => {
    if (!editId) return;
    let cancelled = false;
    apiGet<Dashboard>(`/dashboards/${editId}`)
      .then((d) => {
        if (cancelled) return;
        setTitle(d.spec.title);
        setWidgets(d.spec.widgets);
        setLoadState("loaded");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setLoadError(e instanceof ApiError ? e.message : "Couldn't load that dashboard.");
        setLoadState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [editId]);

  async function runDesigner(request: string) {
    const text = request.trim();
    if (!text || aiBusy) return;
    setAiBusy(true);
    setAiError("");
    try {
      const current = widgets.length > 0 && specProblems(spec).length === 0 ? spec : null;
      const { spec: draft } = await apiPost<{ spec: DashboardSpec }>("/dashboards/design", { request: text, current_spec: current });
      setTitle(draft.title);
      setWidgets(draft.widgets);
      setSelectedId(null);
    } catch (e) {
      setAiError(e instanceof ApiError ? e.message : "The AI designer couldn't make that dashboard.");
    } finally {
      setAiBusy(false);
    }
  }

  // a prompt typed on the home page runs once when the builder opens
  useEffect(() => {
    if (initialPrompt && !editId && !autoRan.current) {
      autoRan.current = true;
      void runDesigner(initialPrompt);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addWidget(type: WidgetType, at?: { x: number; y: number }) {
    if (widgets.length >= MAX_WIDGETS) return;
    const lastGauge = selected && "gauge_id" in selected ? selected.gauge_id : undefined;
    const w = makeWidget(type, widgets, at, lastGauge);
    setWidgets((ws) => [...ws, w]);
    setSelectedId(w.id);
  }

  function updateWidget(next: Widget) {
    setWidgets((ws) => ws.map((w) => (w.id === next.id ? next : w)));
  }

  function removeWidget(id: string) {
    setWidgets((ws) => ws.filter((w) => w.id !== id));
    setSelectedId((s) => (s === id ? null : s));
  }

  function applyLayout(layouts: Record<string, WidgetLayout>) {
    setWidgets((ws) => ws.map((w) => (layouts[w.id] ? { ...w, layout: layouts[w.id] } : w)));
  }

  async function save(asNew = false) {
    const problems = specProblems(spec);
    if (problems.length) {
      setSaveError(problems.join(" "));
      return;
    }
    setSaving(true);
    setSaveError("");
    try {
      if (canUpdate && !asNew) {
        await apiPut<Dashboard>(`/dashboards/${editId}`, { spec }, { "X-Edit-Token": token! });
        router.push(`/dashboard/${editId}`);
      } else {
        const created = await apiPost<Created>("/dashboards", { spec });
        saveEditToken(created.id, created.edit_token);
        router.push(`/dashboard/${created.id}?created=1`);
      }
    } catch (e) {
      setSaveError(e instanceof ApiError ? e.message : "Couldn't save the dashboard.");
      setSaving(false);
    }
  }

  if (loadState === "loading") {
    return <div className="mx-auto max-w-7xl px-4 py-10 text-slate-500">Loading dashboard…</div>;
  }
  if (loadState === "error") {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="text-xl font-semibold">Couldn&apos;t open that dashboard for editing</h1>
        <p className="mt-2 text-sm text-slate-600">{loadError}</p>
        <Link href="/create" className="mt-6 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white">
          Start a new dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-5">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={80}
          aria-label="Dashboard title"
          className="min-w-0 flex-1 rounded-lg border border-transparent px-2 py-1 text-2xl font-semibold tracking-tight text-slate-900 outline-none hover:border-slate-200 focus:border-blue-500"
        />
        {editId && !token && (
          <span className="text-sm text-amber-700">You can&apos;t edit the original, but you can save a copy.</span>
        )}
        {canUpdate && (
          <button
            type="button"
            onClick={() => save(true)}
            disabled={saving}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-800 hover:border-blue-500 disabled:opacity-50"
          >
            Save as new
          </button>
        )}
        <button
          type="button"
          onClick={() => save(false)}
          disabled={saving}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : canUpdate ? "Save changes" : "Save & share"}
        </button>
      </div>
      {saveError && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{saveError}</p>}

      <div className="grid gap-5 lg:grid-cols-[260px_minmax(0,1fr)_280px]">
        {/* left: AI designer and widget palette */}
        <aside className="space-y-5">
          <section className="rounded-xl border border-blue-200 bg-blue-50/60 p-4">
            <h2 className="text-sm font-semibold text-slate-900">Design with AI</h2>
            <p className="mt-0.5 text-xs text-slate-600">Describe a dashboard. You can adjust it afterwards.</p>
            <form
              className="mt-3 space-y-2"
              onSubmit={(e) => {
                e.preventDefault();
                void runDesigner(aiPrompt);
              }}
            >
              <textarea
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                maxLength={1000}
                rows={3}
                placeholder="e.g. Compare flow on Goose Creek and Difficult Run this week"
                className="w-full resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500"
              />
              <button
                type="submit"
                disabled={aiBusy || !aiPrompt.trim()}
                className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {aiBusy ? "Designing…" : widgets.length ? "Update with AI" : "Design it"}
              </button>
            </form>
            {aiError && <p className="mt-2 text-xs text-red-700">{aiError}</p>}
            <div className="mt-3 flex flex-wrap gap-1.5">
              {AI_EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => setAiPrompt(ex)}
                  className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-left text-[11px] text-slate-700 hover:border-blue-400"
                >
                  {ex}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h2 className="text-sm font-semibold text-slate-900">Widgets</h2>
            <p className="mb-2 text-xs text-slate-500">Drag onto the grid, or click to add.</p>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-1">
              {WIDGET_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  draggable
                  disabled={widgets.length >= MAX_WIDGETS}
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", type);
                    setDraggingType(type);
                  }}
                  onDragEnd={() => setDraggingType(null)}
                  onClick={() => addWidget(type)}
                  className="cursor-grab rounded-lg border border-slate-200 bg-white px-3 py-2 text-left hover:border-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="block text-sm font-medium text-slate-900">{WIDGET_CATALOG[type].label}</span>
                  <span className="block text-xs text-slate-500">{WIDGET_CATALOG[type].description}</span>
                </button>
              ))}
            </div>
            {widgets.length >= MAX_WIDGETS && <p className="mt-2 text-xs text-slate-500">That&apos;s the maximum of {MAX_WIDGETS} widgets.</p>}
          </section>
        </aside>

        {/* center: live preview grid */}
        <main className="min-w-0">
          {widgets.length === 0 && !aiBusy && (
            <div className="mb-3 rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">
              Your dashboard is empty. Describe one to the AI, or drag widgets here.
            </div>
          )}
          {aiBusy && widgets.length === 0 && (
            <div className="mb-3 animate-pulse rounded-xl bg-blue-50 p-6 text-center text-sm text-blue-800">Designing your dashboard…</div>
          )}
          <DashboardGrid
            widgets={widgets}
            edit={{
              selectedId,
              onSelect: setSelectedId,
              onRemove: removeWidget,
              onLayoutChange: applyLayout,
              onDropWidget: (type, at) => {
                addWidget(type, at);
                setDraggingType(null);
              },
              draggingType,
            }}
          />
        </main>

        {/* right: settings for the selected widget */}
        <aside>
          <WidgetSettingsPanel gauges={gauges} widget={selected} onChange={updateWidget} onRemove={removeWidget} />
        </aside>
      </div>
    </div>
  );
}

function WidgetSettingsPanel({
  gauges,
  widget,
  onChange,
  onRemove,
}: {
  gauges: Gauge[] | null;
  widget: Widget | null;
  onChange: (w: Widget) => void;
  onRemove: (id: string) => void;
}) {
  if (!widget) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
        Select a widget to choose its gauge, measurement and time range.
      </div>
    );
  }
  if (!gauges) {
    return <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">Loading gauges…</div>;
  }
  return <WidgetSettings key={widget.id} gauges={gauges} widget={widget} onChange={onChange} onRemove={onRemove} />;
}
