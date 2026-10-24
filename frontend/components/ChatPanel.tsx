"use client";

import { useRef, useState } from "react";

import { TimeSeriesChart } from "@/components/charts/TimeSeriesChart";
import { ReadingMeta } from "@/components/widgets/WidgetFrame";
import { ApiError, apiPost } from "@/lib/api";
import { formatDateTime, formatNumber, unitLabel } from "@/lib/format";
import { useNow } from "@/lib/hooks";
import type { ChatChart, ChatResponse } from "@/lib/types";

type Message = { role: "user" | "model"; text: string; reply?: ChatResponse; error?: boolean };

const SUGGESTIONS = ["What's the flow right now?", "Is that normal?", "Has it been rising?"];
const HISTORY_TURNS = 10;

function ChatChartView({ chart, now }: { chart: ChatChart; now: number }) {
  if (chart.kind === "reading") {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-3">
        <p className="text-xs font-medium text-slate-500">{chart.title}</p>
        <p className="text-xl font-semibold text-slate-900">
          {formatNumber(chart.value)} <span className="text-sm font-normal text-slate-500">{unitLabel(chart.unit)}</span>
        </p>
        {chart.label && (
          <p className="text-xs text-slate-700">
            <span className="font-medium capitalize">{chart.label}</span> · {chart.percentile_text}
          </p>
        )}
        {chart.measured_at && (
          <div className="mt-1 text-xs text-slate-500">
            <ReadingMeta at={chart.measured_at} provisional={chart.provisional} now={now} />
          </div>
        )}
      </div>
    );
  }
  const daily = chart.title.startsWith("Daily");
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <p className="mb-1 text-xs font-medium capitalize text-slate-500">
        {chart.title} ({unitLabel(chart.unit)})
      </p>
      <div className="h-40">
        <TimeSeriesChart kind={daily ? "daily" : "hourly"} unit={chart.unit} series={chart.series} />
      </div>
    </div>
  );
}

export function ChatPanel({ dashboardId }: { dashboardId?: string }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const now = useNow();

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    const history = messages
      .filter((m) => !m.error)
      .slice(-HISTORY_TURNS)
      .map((m) => ({ role: m.role, text: m.text }));
    setMessages((m) => [...m, { role: "user", text: q }]);
    setInput("");
    setBusy(true);
    try {
      const reply = await apiPost<ChatResponse>("/agent/chat", { question: q, dashboard_id: dashboardId, history });
      setMessages((m) => [...m, { role: "model", text: reply.answer, reply }]);
    } catch (e) {
      const text = e instanceof ApiError ? e.message : "Something went wrong. Try again.";
      setMessages((m) => [...m, { role: "model", text, error: true }]);
    } finally {
      setBusy(false);
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 rounded-full bg-blue-600 px-5 py-3 text-sm font-medium text-white shadow-lg hover:bg-blue-700"
      >
        Ask about these rivers
      </button>
    );
  }

  return (
    <aside className="fixed inset-x-0 bottom-0 z-40 flex h-[80vh] flex-col border-t border-slate-200 bg-slate-50 shadow-2xl sm:inset-x-auto sm:right-5 sm:bottom-5 sm:h-[600px] sm:w-[420px] sm:rounded-2xl sm:border">
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 sm:rounded-t-2xl">
        <div>
          <p className="text-sm font-semibold text-slate-900">Ask about these rivers</p>
          <p className="text-xs text-slate-500">Answers use live USGS data. Not safety advice.</p>
        </div>
        <button type="button" onClick={() => setOpen(false)} className="rounded p-1 text-slate-500 hover:text-slate-900" aria-label="Close chat">
          ✕
        </button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="space-y-2">
            <p className="text-sm text-slate-600">Try one of these:</p>
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => ask(s)}
                className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-800 hover:border-blue-400"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) =>
          m.role === "user" ? (
            <div key={i} className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-blue-600 px-3 py-2 text-sm text-white">
              {m.text}
            </div>
          ) : (
            <div key={i} className="space-y-2">
              <div
                className={`w-fit max-w-[95%] whitespace-pre-line rounded-2xl rounded-bl-sm px-3 py-2 text-sm ${
                  m.error ? "bg-red-50 text-red-800" : "bg-white text-slate-800 ring-1 ring-slate-200"
                }`}
              >
                {m.text}
              </div>
              {m.reply?.charts.map((c, j) => <ChatChartView key={j} chart={c} now={now} />)}
              {m.reply && m.reply.sources.length > 0 && (
                <ul className="space-y-0.5 text-[11px] text-slate-500">
                  {m.reply.sources.map((s) => (
                    <li key={`${s.gauge_id}-${s.param}`}>
                      Source: USGS {s.gauge_id} {s.parameter}
                      {s.measured_at ? `, ${s.measured_at.length > 10 ? formatDateTime(s.measured_at) : s.measured_at}` : ""}
                      {s.provisional ? " (provisional)" : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ),
        )}
        {busy && <p className="text-sm text-slate-500">Checking the gauges…</p>}
        <div ref={endRef} />
      </div>

      <form
        className="flex gap-2 border-t border-slate-200 bg-white p-3 sm:rounded-b-2xl"
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={1000}
          placeholder="Ask a question…"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          Ask
        </button>
      </form>
    </aside>
  );
}
