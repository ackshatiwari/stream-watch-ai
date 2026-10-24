"use client";

import { useRef } from "react";
import ReactGridLayout, { useContainerWidth, verticalCompactor, type Layout, type LayoutItem } from "react-grid-layout";

import { WidgetView } from "@/components/widgets/Widgets";
import type { Widget, WidgetLayout, WidgetType } from "@/lib/types";
import { GRID_COLUMNS, ROW_HEIGHT, WIDGET_CATALOG } from "@/lib/widgets";

// below this width the grid becomes a single column, in reading order
const STACK_BELOW_PX = 640;
const MARGIN = 12;

type EditProps = {
  selectedId: string | null;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onLayoutChange: (layouts: Record<string, WidgetLayout>) => void;
  onDropWidget: (type: WidgetType, at: { x: number; y: number }) => void;
  draggingType: WidgetType | null;
};

export function DashboardGrid({ widgets, edit }: { widgets: Widget[]; edit?: EditProps }) {
  const { width, containerRef, mounted } = useContainerWidth();
  const lastLayout = useRef<string>("");

  // saved specs (or AI drafts) may use smaller sizes than a widget needs, so minimums are applied when drawing
  const layout: Layout = widgets.map((w) => {
    const min = WIDGET_CATALOG[w.type].min;
    const width = Math.max(w.layout.w, min.w);
    return {
      i: w.id,
      x: Math.min(w.layout.x, GRID_COLUMNS - width),
      y: w.layout.y,
      w: width,
      h: Math.max(w.layout.h, min.h),
      minW: min.w,
      minH: min.h,
      // not "static" in view mode: static items can't be moved, so the compactor couldn't fix overlaps.
      // Dragging and resizing are switched off below instead.
    };
  });

  const stacked = mounted && width < STACK_BELOW_PX && !edit;

  function handleLayoutChange(next: Layout) {
    if (!edit) return;
    const ids = new Set(widgets.map((w) => w.id));
    const changes: Record<string, WidgetLayout> = {};
    for (const item of next) {
      if (ids.has(item.i)) changes[item.i] = { x: item.x, y: item.y, w: item.w, h: item.h };
    }
    const key = JSON.stringify(changes);
    if (key !== lastLayout.current) {
      lastLayout.current = key;
      edit.onLayoutChange(changes);
    }
  }

  function handleDrop(_layout: Layout, item: LayoutItem | undefined) {
    if (edit?.draggingType && item) edit.onDropWidget(edit.draggingType, { x: item.x, y: item.y });
  }

  const ordered = [...widgets].sort((a, b) => a.layout.y - b.layout.y || a.layout.x - b.layout.x);

  return (
    <div ref={containerRef} className="w-full">
      {stacked && (
        <div className="flex flex-col gap-3">
          {ordered.map((w) => (
            <div key={w.id} style={{ height: Math.max(w.layout.h, WIDGET_CATALOG[w.type].min.h, 3) * ROW_HEIGHT }}>
              <WidgetView widget={w} />
            </div>
          ))}
        </div>
      )}
      {mounted && !stacked && (
        <ReactGridLayout
          width={width}
          layout={layout}
          gridConfig={{ cols: GRID_COLUMNS, rowHeight: ROW_HEIGHT, margin: [MARGIN, MARGIN], containerPadding: [0, 0] }}
          dragConfig={{ enabled: !!edit, cancel: ".no-drag" }}
          resizeConfig={{ enabled: !!edit }}
          dropConfig={{
            enabled: !!edit,
            defaultItem: edit?.draggingType ? WIDGET_CATALOG[edit.draggingType].size : { w: 4, h: 3 },
          }}
          compactor={verticalCompactor}
          onLayoutChange={handleLayoutChange}
          onDrop={handleDrop}
          className={edit ? "min-h-[400px] rounded-xl bg-slate-50 outline-2 outline-dashed outline-slate-200" : undefined}
        >
          {widgets.map((w) => (
            <div
              key={w.id}
              className={
                edit
                  ? `group relative cursor-move rounded-xl ${edit.selectedId === w.id ? "ring-2 ring-blue-600 ring-offset-2" : ""}`
                  : undefined
              }
              onMouseDown={edit ? () => edit.onSelect(w.id) : undefined}
            >
              <WidgetView widget={w} />
              {edit && (
                <button
                  type="button"
                  aria-label="Remove widget"
                  className="no-drag absolute right-2 top-2 z-10 hidden h-6 w-6 items-center justify-center rounded-full bg-white text-slate-500 shadow ring-1 ring-slate-200 hover:text-red-600 group-hover:flex"
                  onClick={(e) => {
                    e.stopPropagation();
                    edit.onRemove(w.id);
                  }}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </ReactGridLayout>
      )}
    </div>
  );
}
