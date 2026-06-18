// ─────────────────────────────────────────────────────────────────────────
// DashboardGrid — mirrors PostHog's frontend/src/scenes/dashboard/Dashboard.tsx
// grid logic. Uses react-grid-layout's Responsive grid with the same
// breakpoint set and column counts PostHog uses, persisting each tile's
// `layouts.{sm,md,lg,xl}` via a debounced PATCH to the dashboard.
//
// Design rules:
//   - Visual UI/UX is Clain (rounded-xl cards, border #e9eae6, no shadows).
//   - All endpoints + payload shapes are PostHog 1:1.
//   - Drag handles only render when editLayout=true. Resize handle bottom-right.
//   - On layout change, optimistic state update + debounced backend PATCH.
// ─────────────────────────────────────────────────────────────────────────
import * as React from 'react';
import { Responsive, useContainerWidth, type Layout, type Layouts } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

// PostHog breakpoint set — see frontend/src/scenes/dashboard/Dashboard.tsx
const BREAKPOINTS = { xl: 1600, lg: 1280, md: 1024, sm: 768, xs: 480, xxs: 0 };
const COLS         = { xl: 12,   lg: 12,   md: 12,   sm: 12,  xs: 6,   xxs: 2 };
const ROW_HEIGHT   = 60; // PostHog: 60. Each tile's `h` is multiples of this.

export type GridTile = {
  id: number;
  layouts?: Partial<Record<keyof typeof COLS, { x?: number; y?: number; w?: number; h?: number; minW?: number; minH?: number; isResizable?: boolean }>>;
  // The actual tile content (insight viz, text card, etc.) is rendered by the
  // caller — we just provide the grid positions.
};

function defaultLayoutFor(tile: GridTile, idx: number): Layout {
  // If the tile doesn't have explicit layouts yet, give it a reasonable
  // default — 6 cols wide (half row), 4 rows tall, placed sequentially.
  // PostHog uses the same heuristic when a tile is added without layouts.
  const isText = (tile as any).text != null;
  return {
    i: String(tile.id),
    x: (idx * 6) % 12,
    y: Math.floor(idx / 2) * 4,
    w: isText ? 6 : 6,
    h: isText ? 3 : 4,
    minW: isText ? 2 : 3,
    minH: isText ? 2 : 3,
  };
}

export function tileLayoutsFor(tiles: GridTile[]): Layouts {
  const out: Layouts = { xl: [], lg: [], md: [], sm: [], xs: [], xxs: [] };
  tiles.forEach((tile, idx) => {
    (Object.keys(COLS) as Array<keyof typeof COLS>).forEach(bp => {
      const stored = tile.layouts?.[bp];
      const defLayout = defaultLayoutFor(tile, idx);
      const layout: Layout = {
        i: String(tile.id),
        x: stored?.x ?? defLayout.x,
        y: stored?.y ?? defLayout.y,
        w: bp === 'xs' || bp === 'xxs'
          ? Math.min(stored?.w ?? defLayout.w, COLS[bp])
          : (stored?.w ?? defLayout.w),
        h: stored?.h ?? defLayout.h,
        minW: stored?.minW ?? defLayout.minW,
        minH: stored?.minH ?? defLayout.minH,
        isResizable: stored?.isResizable !== false,
      };
      out[bp]!.push(layout);
    });
  });
  return out;
}

export function layoutsToTilePatch(layouts: Layouts, tiles: GridTile[]): Array<{ id: number; layouts: any }> {
  // Convert react-grid-layout's Layouts back into PostHog's per-tile
  // `layouts: { sm: {x, y, w, h, minW, minH}, md: {...}, ... }` shape that
  // the dashboard PATCH expects.
  return tiles.map(tile => {
    const tileLayouts: any = {};
    (Object.keys(COLS) as Array<keyof typeof COLS>).forEach(bp => {
      const found = layouts[bp]?.find(l => l.i === String(tile.id));
      if (found) {
        tileLayouts[bp] = { x: found.x, y: found.y, w: found.w, h: found.h, minW: found.minW, minH: found.minH };
      }
    });
    return { id: tile.id, layouts: tileLayouts };
  });
}

type DashboardGridProps = {
  tiles: GridTile[];
  editLayout: boolean;
  collapsed?: boolean;
  onLayoutsChange?: (layouts: Layouts) => void;
  renderTile: (tile: GridTile, layout: Layout | undefined) => React.ReactNode;
};

export function DashboardGrid({ tiles, editLayout, collapsed, onLayoutsChange, renderTile }: DashboardGridProps) {
  // react-grid-layout v2 returns an object, not a tuple.
  const { width, containerRef } = useContainerWidth({ initialWidth: 1024 } as any);
  const initialLayouts = React.useMemo(() => tileLayoutsFor(tiles), [JSON.stringify(tiles.map(t => ({ id: t.id, layouts: t.layouts })))]);

  // When collapsed, force a denser layout (4-col width) for all tiles so
  // users can scan more at once — matches PostHog's "Compact view" toggle.
  const effectiveLayouts = React.useMemo(() => {
    if (!collapsed) return initialLayouts;
    const compact: Layouts = { xl: [], lg: [], md: [], sm: [], xs: [], xxs: [] };
    (Object.keys(COLS) as Array<keyof typeof COLS>).forEach(bp => {
      compact[bp] = (initialLayouts[bp] ?? []).map((l, idx) => ({
        ...l,
        w: Math.min(4, COLS[bp]),
        h: Math.max(3, Math.min(l.h, 4)),
        x: (idx * 4) % COLS[bp],
        y: Math.floor(idx / (COLS[bp] / 4)) * 4,
      }));
    });
    return compact;
  }, [initialLayouts, collapsed]);

  const debounceRef = React.useRef<any>(null);
  function handleLayoutChange(_currentLayout: Layout[], allLayouts: Layouts) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => onLayoutsChange?.(allLayouts), 450);
  }

  return (
    <div ref={containerRef as any} className="clain-dashboard-grid">
      <Responsive
        className="layout"
        width={width}
        breakpoints={BREAKPOINTS}
        cols={COLS}
        layouts={effectiveLayouts}
        rowHeight={ROW_HEIGHT}
        margin={[16, 16]}
        containerPadding={[0, 0]}
        isDraggable={editLayout}
        isResizable={editLayout}
        compactType="vertical"
        preventCollision={false}
        useCSSTransforms
        draggableHandle=".clain-tile-drag-handle"
        onLayoutChange={handleLayoutChange}
      >
        {tiles.map((tile) => {
          const currentLayout = effectiveLayouts.lg?.find(l => l.i === String(tile.id));
          return (
            <div key={String(tile.id)} className="clain-grid-item">
              {renderTile(tile, currentLayout)}
            </div>
          );
        })}
      </Responsive>
    </div>
  );
}

// Inject minimal CSS overrides for react-grid-layout to match Clain look.
// We do this at module load time to avoid having to add a separate CSS file.
if (typeof document !== 'undefined' && !document.getElementById('clain-rgl-overrides')) {
  const style = document.createElement('style');
  style.id = 'clain-rgl-overrides';
  style.textContent = `
    .clain-dashboard-grid .react-grid-item {
      transition: transform 200ms ease;
    }
    .clain-dashboard-grid .react-grid-item.react-grid-placeholder {
      background: #fff5f2 !important;
      border: 1.5px dashed #e8572a !important;
      border-radius: 12px !important;
      opacity: 0.85 !important;
      box-shadow: none !important;
    }
    .clain-dashboard-grid .react-grid-item.cssTransforms { transition-property: transform; }
    .clain-dashboard-grid .react-grid-item.resizing { opacity: 0.85; z-index: 3; transition: none; }
    .clain-dashboard-grid .react-grid-item.react-draggable-dragging {
      transition: none;
      z-index: 3;
      cursor: grabbing !important;
    }
    .clain-dashboard-grid .react-resizable-handle {
      background-image: none !important;
      width: 14px !important;
      height: 14px !important;
      bottom: 4px !important;
      right: 4px !important;
      cursor: nwse-resize !important;
    }
    .clain-dashboard-grid .react-resizable-handle::after {
      content: '';
      position: absolute;
      inset: 0;
      background: linear-gradient(135deg, transparent 50%, #9ca3af 50%, #9ca3af 60%, transparent 60%, transparent 70%, #9ca3af 70%, #9ca3af 80%, transparent 80%);
      opacity: 0;
      transition: opacity 150ms;
    }
    .clain-dashboard-grid .clain-grid-item:hover .react-resizable-handle::after {
      opacity: 1;
    }
    .clain-dashboard-grid .clain-grid-item {
      display: flex;
    }
    .clain-dashboard-grid .clain-grid-item > * {
      width: 100%;
      height: 100%;
      display: flex;
      flex-direction: column;
    }
    .clain-tile-drag-handle {
      cursor: grab;
    }
    .clain-tile-drag-handle:active {
      cursor: grabbing;
    }
  `;
  document.head.appendChild(style);
}
