// ─────────────────────────────────────────────────────────────────────────
// SankeyPaths — mirrors PostHog's frontend/src/scenes/insights/views/Paths/
//
// PostHog uses d3-sankey. We render a lightweight SVG sankey-style flow with
// columns of nodes (one column per step) and bezier paths between them whose
// thickness is proportional to the count. Matches the visual structure of
// PostHog's PathsViz while avoiding the d3 dependency.
//
// Backend payload shape (PathsQuery from /query/):
//   result.results = [{ source, target, value, average_conversion_time? }, ...]
// ─────────────────────────────────────────────────────────────────────────
import * as React from 'react';

type Edge = { source: string; target: string; value: number };

export function SankeyPaths({ result }: { result: any }) {
  const edges: Edge[] = React.useMemo(() => {
    const raw: any[] = result?.results ?? [];
    return raw
      .map(r => ({
        source: String(r.source ?? r.source_step ?? ''),
        target: String(r.target ?? r.target_step ?? ''),
        value: Number(r.value ?? r.count ?? 0),
      }))
      .filter(e => e.source && e.target && e.value > 0);
  }, [result]);

  // Compute the step index of each node based on string prefixes "1_", "2_"
  // (PostHog's convention).
  const layout = React.useMemo(() => {
    if (edges.length === 0) return null;
    const stepOf = (name: string): number => {
      const m = /^(\d+)_/.exec(name);
      return m ? Number(m[1]) : 0;
    };
    const nodes = new Map<string, { name: string; step: number; in: number; out: number }>();
    edges.forEach(e => {
      const s = stepOf(e.source);
      const t = stepOf(e.target);
      if (!nodes.has(e.source)) nodes.set(e.source, { name: e.source, step: s, in: 0, out: 0 });
      if (!nodes.has(e.target)) nodes.set(e.target, { name: e.target, step: t, in: 0, out: 0 });
      nodes.get(e.source)!.out += e.value;
      nodes.get(e.target)!.in += e.value;
    });
    const stepsMap = new Map<number, string[]>();
    nodes.forEach(n => {
      if (!stepsMap.has(n.step)) stepsMap.set(n.step, []);
      stepsMap.get(n.step)!.push(n.name);
    });
    // Sort each step's nodes by total throughput.
    stepsMap.forEach(arr => arr.sort((a, b) => (nodes.get(b)!.in + nodes.get(b)!.out) - (nodes.get(a)!.in + nodes.get(a)!.out)));
    return { nodes, stepsMap };
  }, [edges]);

  if (!layout || edges.length === 0) {
    return <div className="h-full w-full flex items-center justify-center text-[11px] text-[#9ca3af]">Sin caminos detectados.</div>;
  }
  const { nodes, stepsMap } = layout;
  const steps = Array.from(stepsMap.keys()).sort((a, b) => a - b);
  const W = 800, H = 360;
  const colW = W / Math.max(1, steps.length);
  const maxFlow = Math.max(1, ...Array.from(nodes.values()).map(n => Math.max(n.in, n.out)));
  const nodeY: Record<string, { y: number; h: number }> = {};
  steps.forEach((step, si) => {
    const list = stepsMap.get(step) ?? [];
    let y = 8;
    list.forEach(name => {
      const n = nodes.get(name)!;
      const h = Math.max(4, (Math.max(n.in, n.out) / maxFlow) * (H - 16));
      nodeY[name] = { y, h };
      y += h + 4;
    });
  });

  return (
    <div className="h-full w-full overflow-auto">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" className="w-full h-full">
        {/* Edges */}
        {edges.map((e, i) => {
          const s = nodes.get(e.source)!; const t = nodes.get(e.target)!;
          const x1 = s.step * colW + 14;
          const x2 = t.step * colW + colW - 14;
          const yS = nodeY[e.source].y + nodeY[e.source].h / 2;
          const yT = nodeY[e.target].y + nodeY[e.target].h / 2;
          const thickness = Math.max(1, (e.value / maxFlow) * 24);
          const cx1 = (x1 + x2) / 2; const cx2 = cx1;
          const d = `M ${x1},${yS} C ${cx1},${yS} ${cx2},${yT} ${x2},${yT}`;
          return <path key={i} d={d} stroke="#3b59f6" strokeOpacity="0.25" fill="none" strokeWidth={thickness}/>;
        })}
        {/* Nodes */}
        {Array.from(nodes.values()).map((n, i) => {
          const { y, h } = nodeY[n.name];
          const x = n.step * colW + 6;
          const label = n.name.replace(/^\d+_/, '');
          return (
            <g key={i}>
              <rect x={x} y={y} width={12} height={h} fill="#1a1a18" rx={2}/>
              <text x={x + 16} y={y + Math.min(12, h - 2)} fontSize="10" fill="#1a1a18" className="font-mono">{label.length > 28 ? label.slice(0, 26) + '…' : label}</text>
              <text x={x + 16} y={y + Math.min(24, h + 8)} fontSize="9" fill="#646462">{Math.max(n.in, n.out).toLocaleString('es-ES')}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
