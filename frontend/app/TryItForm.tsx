"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const EXAMPLES = ["Show me how the Potomac is doing this week", "Compare flow on Goose Creek and Difficult Run", "Water quality at Little Falls"];

export function TryItForm() {
  const router = useRouter();
  const [prompt, setPrompt] = useState("");

  function go(text: string) {
    const q = text.trim();
    router.push(q ? `/create?prompt=${encodeURIComponent(q)}` : "/create");
  }

  return (
    <div className="mx-auto mt-8 max-w-2xl">
      <form
        className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          go(prompt);
        }}
      >
        <input
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          maxLength={1000}
          placeholder="Describe a dashboard, e.g. water quality at Little Falls"
          aria-label="Describe a dashboard"
          className="min-w-0 flex-1 rounded-xl px-3 py-3 text-base text-slate-900 outline-none"
        />
        <button type="submit" className="rounded-xl bg-blue-600 px-6 py-3 font-medium text-white hover:bg-blue-700">
          Try it out
        </button>
      </form>
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => go(ex)}
            className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-700 hover:border-blue-400"
          >
            {ex}
          </button>
        ))}
      </div>
    </div>
  );
}
