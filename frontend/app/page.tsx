import Link from "next/link";

import { TryItForm } from "./TryItForm";

const FEATURES = [
  {
    title: "Build it yourself",
    body: "Drag widgets onto a grid: current readings, hourly and daily charts, trends, and side-by-side comparisons.",
  },
  {
    title: "Or describe it",
    body: "Tell the AI designer what you want to watch. It lays out a dashboard you can then adjust by hand.",
  },
  {
    title: "Share one link",
    body: "Every dashboard gets its own link. Anyone who opens it sees live data, plus a chatbot for quick questions.",
  },
];

const GAUGES = [
  "Potomac River at Little Falls",
  "Potomac River at Point of Rocks",
  "Difficult Run",
  "Goose Creek",
  "Monocacy River",
  "Seneca Creek",
  "Anacostia River (NE Branch)",
  "Accotink Creek",
  "Rappahannock River",
];

export default function Home() {
  return (
    <div>
      <section className="border-b border-slate-200 bg-gradient-to-b from-blue-50 to-white">
        <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:py-24">
          <p className="mb-3 text-sm font-medium text-blue-700">Live USGS data · Potomac &amp; Rappahannock basins</p>
          <h1 className="text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
            Build a live dashboard for the rivers you care about
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
            Stream Watch AI turns real-time readings from nine river gauges into dashboards you can design in seconds and
            share with anyone.
          </p>
          <TryItForm />
          <p className="mt-4 text-sm text-slate-500">
            or{" "}
            <Link href="/create" className="font-medium text-blue-700 underline-offset-2 hover:underline">
              start from a blank dashboard
            </Link>
          </p>
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-5 px-4 py-14 sm:grid-cols-3">
        {FEATURES.map((f) => (
          <div key={f.title} className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="font-semibold text-slate-900">{f.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{f.body}</p>
          </div>
        ))}
      </section>

      <section className="mx-auto max-w-5xl px-4 pb-16">
        <h2 className="text-lg font-semibold text-slate-900">Nine gauges, measured every 15 minutes</h2>
        <p className="mt-1 text-sm text-slate-600">
          Discharge, gage height and, at some gauges, water temperature, dissolved oxygen, pH, conductance, turbidity and
          nitrate.
        </p>
        <ul className="mt-4 grid gap-2 text-sm text-slate-700 sm:grid-cols-3">
          {GAUGES.map((g) => (
            <li key={g} className="flex items-center gap-2">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-600" aria-hidden />
              {g}
            </li>
          ))}
        </ul>
        <p className="mt-10 text-xs text-slate-500">
          Data from the U.S. Geological Survey. Provisional data may change. Stream Watch AI shows data only and is not
          safety advice.
        </p>
      </section>
    </div>
  );
}
