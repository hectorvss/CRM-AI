/**
 * Mobile heatmaps — parity with PostHog mobile session replay heatmap overlay.
 *
 * GET /api/projects/{pid}/heatmaps/?type=<touch|tap|swipe|scroll>&url_pattern=<screen>&viewport_width_min=...
 *
 * Surfaces:
 *  - Type selector (Touch / Tap / Rage / Swipe / Scroll)
 *  - Viewport bucket selector (phone / tablet)
 *  - Screen / URL pattern picker
 *  - Hot-spot overlay (rendered as a faux phone frame with circles)
 */
import React from 'react';

type HeatmapType = 'touch' | 'tap' | 'swipe' | 'scroll' | 'rageclick';
type ViewportBucket = 'phone' | 'tablet';

const TYPE_LABELS: Record<HeatmapType, string> = {
  touch:     'Touch',
  tap:       'Tap',
  swipe:     'Swipe',
  scroll:    'Scroll',
  rageclick: 'Rage taps',
};

const VIEWPORT_RANGES: Record<ViewportBucket, [number, number]> = {
  phone:  [0, 600],
  tablet: [601, 1024],
};

interface Spot { x: number; y: number; count: number }

export function MobileHeatmaps({ url, dateFrom, dateTo }: { url: string; dateFrom: string; dateTo?: string }) {
  const [type,     setType]     = React.useState<HeatmapType>('tap');
  const [viewport, setViewport] = React.useState<ViewportBucket>('phone');
  const [aggr,     setAggr]     = React.useState<'total_count' | 'unique_visitors'>('total_count');
  const [spots,    setSpots]    = React.useState<Spot[]>([]);
  const [max,      setMax]      = React.useState(0);
  const [loading,  setLoading]  = React.useState(true);
  const [error,    setError]    = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    (async () => {
      try {
        const ph = await import('../../api/posthog');
        if (!ph.getProjectId()) await ph.bootstrapPostHog();
        const [min, maxVp] = VIEWPORT_RANGES[viewport];
        const res: any = await ph.posthog.heatmaps.list({
          type, url_pattern: url, date_from: dateFrom, date_to: dateTo,
          viewport_width_min: min, viewport_width_max: maxVp,
          aggregation: aggr,
        });
        if (cancelled) return;
        const out: Spot[] = (res?.results ?? []).map((r: any) => ({
          x: Number(r.pointer_relative_x ?? r.x ?? 0),
          y: Number(r.pointer_target_fixed ?? r.y ?? 0),
          count: Number(r.count ?? 1),
        })).filter(s => Number.isFinite(s.x) && Number.isFinite(s.y));
        setSpots(out);
        setMax(out.reduce((m, s) => Math.max(m, s.count), 0));
      } catch (e: any) { if (!cancelled) setError(e?.message ?? 'Error al cargar heatmap'); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [url, dateFrom, dateTo, type, viewport, aggr]);

  return (
    <div className="bg-white border border-[#e9eae6] rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-[#e9eae6] flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-[#1a1a18] mr-2">Heatmap móvil</h3>
        <div className="inline-flex bg-[#fafaf9] border border-[#e9eae6] rounded-lg overflow-hidden text-xs">
          {(Object.keys(TYPE_LABELS) as HeatmapType[]).map(t => (
            <button key={t} onClick={() => setType(t)} className={`px-3 py-1.5 ${type === t ? 'bg-[#1a1a18] text-white' : 'text-[#646462] hover:bg-[#f3f3f1]'}`}>{TYPE_LABELS[t]}</button>
          ))}
        </div>
        <div className="inline-flex bg-[#fafaf9] border border-[#e9eae6] rounded-lg overflow-hidden text-xs ml-auto">
          {(['phone', 'tablet'] as const).map(v => (
            <button key={v} onClick={() => setViewport(v)} className={`px-3 py-1.5 ${viewport === v ? 'bg-[#3b59f6] text-white' : 'text-[#646462] hover:bg-[#f3f3f1]'}`}>{v === 'phone' ? 'Móvil' : 'Tablet'}</button>
          ))}
        </div>
        <select value={aggr} onChange={e => setAggr(e.target.value as any)} className="px-2 py-1 border border-[#e9eae6] rounded text-xs focus:outline-none focus:border-[#3b59f6]">
          <option value="total_count">Total</option>
          <option value="unique_visitors">Únicos</option>
        </select>
      </div>
      <div className="p-6 flex justify-center bg-[#fafaf9]">
        <PhoneFrame loading={loading} error={error} spots={spots} max={max} type={type} viewport={viewport} />
      </div>
    </div>
  );
}

function PhoneFrame({ loading, error, spots, max, type, viewport }: { loading: boolean; error: string | null; spots: Spot[]; max: number; type: HeatmapType; viewport: ViewportBucket }) {
  const w = viewport === 'phone' ? 280 : 420;
  const h = viewport === 'phone' ? 560 : 580;
  return (
    <div className="relative" style={{ width: w + 24, height: h + 60 }}>
      <div className="absolute inset-0 rounded-[32px] bg-[#1a1a18] p-3 shadow-lg">
        <div className="w-full h-full rounded-[24px] bg-white relative overflow-hidden">
          {/* Notch */}
          <div className="absolute top-1 left-1/2 -translate-x-1/2 w-16 h-4 bg-[#1a1a18] rounded-b-2xl z-10" />
          {/* Heatmap layer */}
          <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-full">
            {loading && Array.from({ length: 30 }).map((_, i) => {
              const cx = 20 + (i * 19) % (w - 40);
              const cy = 30 + Math.floor((i * 19) / (w - 40)) * 40;
              return <circle key={i} cx={cx} cy={cy} r={8} fill="#fafaf9" />;
            })}
            {!loading && spots.map((s, i) => {
              // PostHog returns x/y in 0..1 if relative or in viewport units if not.
              const px = s.x <= 1 ? s.x * w : Math.min(s.x, w);
              const py = s.y <= 1 ? s.y * h : Math.min(s.y, h);
              const intensity = max ? s.count / max : 0;
              const r = 8 + intensity * 22;
              const color = type === 'rageclick' ? '#dc2626' : type === 'scroll' ? '#3b59f6' : '#e8572a';
              return <circle key={i} cx={px} cy={py} r={r} fill={color} fillOpacity={0.15 + intensity * 0.55} />;
            })}
          </svg>
          {!loading && !error && spots.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-[#9ca3af] text-xs px-6 text-center">
              Sin eventos de tipo "{TYPE_LABELS[type]}" en el rango y viewport seleccionados.
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center text-[#dc2626] text-xs px-6 text-center">{error}</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default MobileHeatmaps;
