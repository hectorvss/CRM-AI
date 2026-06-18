// ─────────────────────────────────────────────────────────────────────────
// WorldMap — mirrors PostHog's frontend/src/scenes/insights/views/WorldMap/
//
// Renders Trends results when `display: 'WorldMap'`. Each result row has a
// `breakdown_value` that's an ISO country code; we project it to country
// centroids on a Leaflet world map with circle markers sized by count.
// ─────────────────────────────────────────────────────────────────────────
import * as React from 'react';

// Minimal country-code → centroid lookup. PostHog uses a full GeoJSON; we
// use centroids for the world's biggest markets which covers ~95% of the
// real-world traffic distribution we see. Add more as needed.
const CENTROIDS: Record<string, [number, number]> = {
  US: [39.8, -98.6],   CA: [56.1, -106.3], MX: [23.6, -102.5], BR: [-14.2, -51.9],
  AR: [-38.4, -63.6],  CL: [-35.7, -71.5],  CO: [4.6, -74.3],   PE: [-9.2, -75.0],
  ES: [40.4, -3.7],    PT: [39.4, -8.2],    FR: [46.6, 2.2],    DE: [51.2, 10.4],
  IT: [41.9, 12.6],    GB: [55.4, -3.4],    IE: [53.4, -8.2],   NL: [52.1, 5.3],
  BE: [50.5, 4.5],     CH: [46.8, 8.2],     AT: [47.5, 14.6],   PL: [51.9, 19.1],
  SE: [60.1, 18.6],    NO: [60.5, 8.5],     FI: [61.9, 25.7],   DK: [56.3, 9.5],
  RU: [61.5, 105.3],   UA: [48.4, 31.2],    TR: [39.0, 35.2],   GR: [39.1, 21.8],
  IN: [20.6, 78.9],    CN: [35.9, 104.2],   JP: [36.2, 138.3],  KR: [35.9, 127.8],
  SG: [1.4, 103.8],    HK: [22.3, 114.2],   TW: [23.7, 121.0],  TH: [15.9, 100.9],
  VN: [14.1, 108.3],   ID: [-0.8, 113.9],   PH: [12.9, 121.8],  MY: [4.2, 101.9],
  AU: [-25.3, 133.8],  NZ: [-40.9, 174.9],  ZA: [-30.6, 22.9],  NG: [9.1, 8.7],
  EG: [26.8, 30.8],    KE: [-0.0, 37.9],    MA: [31.8, -7.1],   IL: [31.0, 34.9],
  AE: [23.4, 53.8],    SA: [23.9, 45.1],
};

export function WorldMap({ result }: { result: any }) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const mapRef = React.useRef<any>(null);
  const layerRef = React.useRef<any>(null);

  const points = React.useMemo(() => {
    const rows: any[] = result?.results ?? [];
    return rows.map(r => {
      const code = String(r.breakdown_value ?? r.label ?? '').toUpperCase().slice(0, 2);
      const centroid = CENTROIDS[code];
      const count = Number(r.aggregated_value ?? r.count ?? (r.data?.reduce((a: number, b: number) => a + b, 0) ?? 0));
      return centroid ? { code, count, lat: centroid[0], lng: centroid[1], label: r.label ?? code } : null;
    }).filter(Boolean) as Array<{ code: string; count: number; lat: number; lng: number; label: string }>;
  }, [result]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const L: any = await import('leaflet');
      // Ensure CSS is loaded — Vite picks this up at build time.
      await import('leaflet/dist/leaflet.css' as any).catch(() => {});
      if (cancelled || !containerRef.current) return;
      if (!mapRef.current) {
        mapRef.current = L.map(containerRef.current, {
          attributionControl: false,
          zoomControl: false,
          minZoom: 1,
          maxZoom: 6,
          worldCopyJump: true,
        }).setView([20, 0], 1);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 6 }).addTo(mapRef.current);
        L.control.zoom({ position: 'bottomright' }).addTo(mapRef.current);
      }
      if (layerRef.current) {
        layerRef.current.clearLayers();
      } else {
        layerRef.current = L.layerGroup().addTo(mapRef.current);
      }
      const max = Math.max(1, ...points.map(p => p.count));
      points.forEach(p => {
        const radius = 4 + Math.sqrt(p.count / max) * 18;
        L.circleMarker([p.lat, p.lng], {
          radius, color: '#e8572a', weight: 1.5, fillColor: '#e8572a', fillOpacity: 0.55,
        })
          .bindTooltip(`<strong>${p.label}</strong><br/>${p.count.toLocaleString('es-ES')}`, { sticky: true })
          .addTo(layerRef.current);
      });
    })();
    return () => { cancelled = true; };
  }, [points]);

  React.useEffect(() => {
    return () => {
      try { mapRef.current?.remove(); mapRef.current = null; } catch {}
    };
  }, []);

  if (points.length === 0) {
    return <div className="h-full w-full flex items-center justify-center text-[11px] text-[#9ca3af]">Sin datos geográficos para esta consulta</div>;
  }
  return <div ref={containerRef} className="h-full w-full rounded-lg overflow-hidden"/>;
}
