import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight text-slate-900">
          <span className="inline-block h-3 w-3 rounded-full bg-blue-600" aria-hidden />
          Stream Watch AI
        </Link>
        <Link
          href="/create"
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          <span className="sm:hidden">Create</span>
          <span className="hidden sm:inline">Create a dashboard</span>
        </Link>
      </div>
    </header>
  );
}

// shown on every dashboard
export function DataFooter() {
  return (
    <footer className="mt-8 border-t border-slate-200 pt-4 text-xs leading-relaxed text-slate-500">
      Data from the{" "}
      <a href="https://waterdata.usgs.gov/" className="text-blue-700 underline" target="_blank" rel="noreferrer">
        U.S. Geological Survey
      </a>
      , fetched live when you open this page. Provisional data has not been reviewed by USGS and may change. Percentiles
      between published USGS statistics are estimates. This dashboard shows data only and is not safety advice.
    </footer>
  );
}
