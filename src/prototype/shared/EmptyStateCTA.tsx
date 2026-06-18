/**
 * EmptyStateCTA — onboarding empty state with "Conecta tu SDK" CTA.
 *
 * Parity with PostHog's <ProductIntroduction/> and per-product empty states.
 * Used across every analytics-style module when there's no data yet.
 *
 * Shows: hero (icon + headline + sub) + 3 install snippets (web / node / mobile)
 * + secondary CTA "Hacer ingesta de prueba" that fires a $pageview to populate.
 */
import React from 'react';

export type ProductKind =
  | 'web-analytics' | 'product-analytics' | 'session-replay' | 'feature-flags'
  | 'experiments' | 'surveys' | 'error-tracking' | 'heatmaps'
  | 'llm-analytics' | 'data-warehouse' | 'logs' | 'notebooks';

const PRODUCT_META: Record<ProductKind, { title: string; sub: string; docs: string }> = {
  'web-analytics': {
    title: 'Empieza a medir tu sitio',
    sub:   'Visitantes, sesiones, fuentes de tráfico y conversiones. Necesitamos el SDK de JavaScript instalado en tu web.',
    docs:  'https://posthog.com/docs/libraries/js',
  },
  'product-analytics': {
    title: 'Empieza a capturar eventos',
    sub:   'Conecta tu producto y captura cualquier acción del usuario para construir tus primeros insights.',
    docs:  'https://posthog.com/docs/product-analytics',
  },
  'session-replay': {
    title: 'Activa Session Replay',
    sub:   'Reproduce sesiones reales para entender el comportamiento de tus usuarios píxel a píxel.',
    docs:  'https://posthog.com/docs/session-replay',
  },
  'feature-flags': {
    title: 'Lanza con feature flags',
    sub:   'Despliega cambios a porcentajes de usuarios, haz rollouts canary o experimentos sin redesplegar.',
    docs:  'https://posthog.com/docs/feature-flags',
  },
  'experiments': {
    title: 'Crea tu primer experimento',
    sub:   'Mide el impacto real de cambios en producto con A/B tests basados en eventos.',
    docs:  'https://posthog.com/docs/experiments',
  },
  'surveys': {
    title: 'Pregunta a tus usuarios',
    sub:   'Lanza encuestas in-app con condiciones avanzadas y mide la satisfacción de tu audiencia.',
    docs:  'https://posthog.com/docs/surveys',
  },
  'error-tracking': {
    title: 'Detecta errores en producción',
    sub:   'Agrupa stack traces, asigna issues y ve cuántos usuarios afecta cada error.',
    docs:  'https://posthog.com/docs/error-tracking',
  },
  'heatmaps': {
    title: 'Visualiza dónde hacen clic',
    sub:   'Heatmaps de clicks, rage clicks, scroll y movimiento del ratón sobre tus páginas.',
    docs:  'https://posthog.com/docs/heatmaps',
  },
  'llm-analytics': {
    title: 'Mide tus llamadas a LLMs',
    sub:   'Captura prompts, respuestas, tokens, coste y latencia de tus integraciones de IA.',
    docs:  'https://posthog.com/docs/llm-analytics',
  },
  'data-warehouse': {
    title: 'Conecta tu data warehouse',
    sub:   'Une Postgres, Stripe, Hubspot, BigQuery y haz queries cruzadas con HogQL.',
    docs:  'https://posthog.com/docs/data-warehouse',
  },
  'logs': {
    title: 'Centraliza tus logs',
    sub:   'Recoge logs de tu aplicación y haz queries con la misma sintaxis que el resto de PostHog.',
    docs:  'https://posthog.com/docs/logs',
  },
  'notebooks': {
    title: 'Comparte hallazgos',
    sub:   'Mezcla insights, queries, replays y texto en documentos colaborativos.',
    docs:  'https://posthog.com/docs/notebooks',
  },
};

const SNIPPETS: Record<'web' | 'node' | 'mobile', { label: string; code: string }> = {
  web: {
    label: 'Web (HTML)',
    code: `<script>
  !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.async=!0,p.src=s.api_host+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="capture identify alias people.set people.set_once set_config register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset isFeatureEnabled onFeatureFlags getFeatureFlag getFeatureFlagPayload reloadFeatureFlags group updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures getActiveMatchingSurveys getSurveys getNextSurveyStep onSessionId".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);
  posthog.init('<TU_PROJECT_API_KEY>', { api_host: 'https://51.170.55.236.nip.io' });
</script>`,
  },
  node: {
    label: 'Node.js',
    code: `import { PostHog } from 'posthog-node';
const client = new PostHog('<TU_PROJECT_API_KEY>', { host: 'https://51.170.55.236.nip.io' });
client.capture({ distinctId: 'user_123', event: '$pageview', properties: { $current_url: '/dashboard' } });`,
  },
  mobile: {
    label: 'iOS / Android',
    code: `// React Native:
import PostHog from 'posthog-react-native';
const ph = await PostHog.initAsync('<TU_PROJECT_API_KEY>', { host: 'https://51.170.55.236.nip.io' });
ph.capture('$pageview', { $current_url: 'home' });`,
  },
};

export function EmptyStateCTA({
  product, compact = false, onSeedTraffic,
}: {
  product:        ProductKind;
  compact?:       boolean;
  onSeedTraffic?: () => void;
}) {
  const meta = PRODUCT_META[product];
  const [tab,    setTab]    = React.useState<'web' | 'node' | 'mobile'>('web');
  const [copied, setCopied] = React.useState(false);

  function copy() {
    try { navigator.clipboard.writeText(SNIPPETS[tab].code); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch {}
  }

  if (compact) {
    return (
      <div className="bg-white border border-[#e9eae6] rounded-xl p-6 text-center">
        <p className="text-sm font-semibold text-[#1a1a18] mb-1">{meta.title}</p>
        <p className="text-xs text-[#646462] mb-3 max-w-md mx-auto">{meta.sub}</p>
        <div className="flex items-center justify-center gap-2">
          <a href={meta.docs} target="_blank" rel="noopener noreferrer" className="text-xs text-[#3b59f6] hover:underline">Documentación →</a>
          {onSeedTraffic && <button onClick={onSeedTraffic} className="px-3 py-1.5 bg-[#1a1a18] text-white text-xs rounded-lg hover:bg-[#333]">Inyectar tráfico de prueba</button>}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-[#e9eae6] rounded-xl p-8 max-w-3xl mx-auto">
      <div className="flex items-start gap-4 mb-5">
        <span className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#3b59f6] to-[#6366f1] text-white flex items-center justify-center flex-shrink-0">
          <svg viewBox="0 0 16 16" className="w-6 h-6"><path d="M3 13l3-4 3 2 3-5 3 3" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </span>
        <div>
          <h2 className="text-lg font-bold text-[#1a1a18] mb-1">{meta.title}</h2>
          <p className="text-sm text-[#646462] max-w-xl">{meta.sub}</p>
        </div>
      </div>

      <div className="border border-[#e9eae6] rounded-lg overflow-hidden mb-4">
        <div className="border-b border-[#e9eae6] bg-[#fafaf9] flex">
          {(['web', 'node', 'mobile'] as const).map(k => (
            <button key={k} onClick={() => setTab(k)} className={`px-4 py-2 text-xs font-medium border-b-2 transition-colors ${tab === k ? 'border-[#3b59f6] text-[#3b59f6] bg-white' : 'border-transparent text-[#646462] hover:text-[#1a1a18]'}`}>{SNIPPETS[k].label}</button>
          ))}
          <button onClick={copy} className="ml-auto px-4 py-2 text-xs text-[#3b59f6] hover:bg-[#eff2ff]">{copied ? 'Copiado' : 'Copiar'}</button>
        </div>
        <pre className="p-4 bg-[#1a1a18] text-[#fafaf9] text-[11px] font-mono leading-relaxed overflow-x-auto max-h-72">{SNIPPETS[tab].code}</pre>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-2">
        <a href={meta.docs} target="_blank" rel="noopener noreferrer" className="text-xs text-[#3b59f6] hover:underline inline-flex items-center gap-1">
          Ver documentación completa
          <svg viewBox="0 0 16 16" className="w-3 h-3"><path d="M4 8h8M9 5l3 3-3 3" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </a>
        {onSeedTraffic && <button onClick={onSeedTraffic} className="px-3 py-2 bg-[#e8572a] text-white text-xs font-medium rounded-lg hover:bg-[#d44e25]">Inyectar tráfico de prueba para ver el dashboard</button>}
      </div>
    </div>
  );
}

export default EmptyStateCTA;
