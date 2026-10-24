"use client";

import Link from "next/link";
import { useState } from "react";

import { ChatPanel } from "@/components/ChatPanel";
import { DashboardGrid } from "@/components/DashboardGrid";
import { DataFooter } from "@/components/SiteChrome";
import { privateEditLink } from "@/lib/editTokens";
import { useApi, useEditToken } from "@/lib/hooks";
import type { Dashboard } from "@/lib/types";

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          window.prompt("Copy this link:", text);
        }
      }}
      className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:border-blue-500"
    >
      {copied ? "Copied!" : label}
    </button>
  );
}

export function DashboardView({ id, justCreated }: { id: string; justCreated: boolean }) {
  // the spec itself rarely changes, so it isn't refetched; each widget refreshes its own data
  const { data, error, loading } = useApi<Dashboard>(`/dashboards/${id}`, 0);
  const token = useEditToken(id);
  const [bannerOpen, setBannerOpen] = useState(justCreated);
  const shareUrl = typeof window === "undefined" ? "" : `${window.location.origin}/dashboard/${id}`;

  if (loading) {
    return <div className="mx-auto max-w-7xl px-4 py-10 text-slate-500">Loading dashboard…</div>;
  }
  if (error || !data) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="text-xl font-semibold text-slate-900">
          {error?.code === "not_found" ? "Dashboard not found" : "Couldn't load this dashboard"}
        </h1>
        <p className="mt-2 text-sm text-slate-600">{error?.message}</p>
        <Link href="/create" className="mt-6 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white">
          Create a dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      {bannerOpen && token && (
        <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-slate-800">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-semibold text-slate-900">Your dashboard is saved.</p>
              <p className="mt-1">
                Anyone with the share link can view it. This browser can edit it. To edit from another device or after
                clearing your browser, keep the private edit link somewhere safe and don&apos;t share it.
              </p>
            </div>
            <button type="button" onClick={() => setBannerOpen(false)} className="text-slate-500 hover:text-slate-900" aria-label="Dismiss">
              ✕
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <CopyButton text={shareUrl} label="Copy share link" />
            <CopyButton text={privateEditLink(id, token)} label="Copy private edit link" />
          </div>
        </div>
      )}

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{data.spec.title}</h1>
        <div className="flex gap-2">
          <CopyButton text={shareUrl} label="Copy link" />
          {token && (
            <Link href={`/create?edit=${id}`} className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700">
              Edit
            </Link>
          )}
        </div>
      </div>

      {data.spec.widgets.length === 0 ? (
        <p className="text-slate-500">This dashboard has no widgets yet.</p>
      ) : (
        <DashboardGrid widgets={data.spec.widgets} />
      )}

      <DataFooter />
      <ChatPanel dashboardId={id} />
    </div>
  );
}
