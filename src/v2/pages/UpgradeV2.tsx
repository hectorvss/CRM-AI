// UpgradeV2 — migrated by agent-upgrade-01.
// ─────────────────────────────────────────────────────────────────────────────
// What works (this iteration):
//   • Sidebar with 5 tabs: Planes / Créditos / Puestos / Facturación / Uso
//     (replaces the legacy MinimalCategoryShell horizontal-tabs pattern)
//   • Real workspace + subscription data via workspacesApi.currentContext() and
//     billingApi.subscription(orgId), shared across all panels (one fetch, not
//     five). refreshKey forces a refetch after every mutation.
//   • Planes panel: 4 plans (Starter / Growth / Scale / Business) with monthly
//     vs annual pricing toggle and "current plan" badge. Apply plan calls
//     billingApi.changePlan(orgId, planId).
//   • Créditos panel: AI credits overview (included / used / available + top-up
//     balance) with usage progress bar; 3 credit packs that call
//     billingApi.topUp(orgId, { type: 'credits', quantity, amount_cents }).
//     Flexible-usage toggle wired to billingApi.toggleFlexibleUsage(enabled,
//     capCredits) — original component never persisted this state, v2 does.
//   • Puestos panel: seat usage cards + qty stepper + Add Seats button calling
//     billingApi.topUp(orgId, { type: 'seats', quantity, amount_cents }).
//   • Facturación panel: current plan summary, payment method (subscription
//     mock), invoice history table from billingApi.ledger(orgId). Each row
//     downloads the full ledger as CSV (matches legacy behavior).
//   • Uso panel: AI Credits + Seats progress bars + quick "buy 5,000 credits"
//     CTA via billingApi.topUp.
//   • Toast feedback (success/error) for every mutation.
//
// Pending for later iterations (still in src/components/Upgrade.tsx tabs):
//   • Stripe checkout / portal redirect — billingApi.checkoutSession() and
//     billingApi.portalSession() exist in the API client but neither the
//     legacy tabs nor v2 wire them up; would need a "Manage billing" button
//     that opens result.url in a new tab.
//   • billingApi.usage() and billingApi.usageEvents() — Cluster I endpoints
//     that return richer per-event telemetry; v2 still derives everything
//     from the subscription row to match the legacy display.
//   • Per-row invoice download (current Download button exports the full
//     ledger CSV — same as legacy). True per-invoice PDF export would need
//     a backend endpoint that does not exist yet.
//   • Workspace settings persistence for the Flexible Usage cap & alerts
//     beyond the toggle — legacy reads workspace.settings.billing.* but only
//     the toggle is sent back. v2 keeps the same scope.
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useMemo, useEffect, useCallback } from 'react';
import { billingApi, workspacesApi } from '../../api/client';
import { useApi } from '../../api/hooks';

type UpgradeTab = 'plans' | 'credits' | 'seats' | 'billing' | 'usage';

// ── Helpers ──────────────────────────────────────────────────────────────────
const moneyEUR = (n: number) => {
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR' }).format(n);
};
const formatDate = (s?: string | null) =>
  s ? new Date(s).toLocaleDateString() : '—';

function parseSettings(settings: any): Record<string, any> {
  if (!settings) return {};
  if (typeof settings === 'string') {
    try { return JSON.parse(settings); } catch { return {}; }
  }
  return settings;
}

// ── Sidebar (236px) — 5 tab buttons + plan badge ─────────────────────────────
function UpgradeSidebar({ activeTab, onTabChange, planLabel }: {
  activeTab: UpgradeTab;
  onTabChange: (t: UpgradeTab) => void;
  planLabel: string;
}) {
  const itemCls = (active: boolean) =>
    `relative flex items-center gap-2 h-8 pl-3 pr-3 py-1 rounded-lg cursor-pointer text-[13px] w-full text-left transition-colors ${
      active
        ? 'bg-white shadow-[0px_0px_0px_1px_#e9eae6,0px_1px_4px_0px_rgba(20,20,20,0.15)] font-semibold text-[#1a1a1a]'
        : 'hover:bg-[#e9eae6]/40 text-[#1a1a1a]'
    }`;

  const items: { id: UpgradeTab; label: string; icon: JSX.Element }[] = [
    {
      id: 'plans',
      label: 'Planes',
      icon: <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><path d="M8 1.5l6.5 3.25v6.5L8 14.5 1.5 11.25v-6.5L8 1.5zm0 1.65L3.5 5.4l4.5 2.25 4.5-2.25L8 3.15zM2.75 6.5v4.4L7.5 13.4V8.85L2.75 6.5zm10.5 0L8.5 8.85v4.55l4.75-2.5V6.5z"/></svg>,
    },
    {
      id: 'credits',
      label: 'Créditos AI',
      icon: <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><circle cx="8" cy="8" r="6.5"/><circle cx="8" cy="8" r="3" fill="#fff"/></svg>,
    },
    {
      id: 'seats',
      label: 'Puestos',
      icon: <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><circle cx="6" cy="5" r="2.5"/><path d="M1.8 12.5c.4-2 2.1-3.2 4.2-3.2s3.8 1.2 4.2 3.2v.5H1.8v-.5z"/><circle cx="11.5" cy="6" r="2"/><path d="M9.5 9.4c.6-.2 1.3-.3 2-.3 1.7 0 3 .9 3.4 2.5v.4H10.6c-.1-.9-.4-1.8-1.1-2.6z"/></svg>,
    },
    {
      id: 'billing',
      label: 'Facturación',
      icon: <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><path d="M2 4a1 1 0 011-1h10a1 1 0 011 1v8a1 1 0 01-1 1H3a1 1 0 01-1-1V4zm1.5.5v2h9v-2h-9zm0 4v3.5h9V8.5h-9z"/></svg>,
    },
    {
      id: 'usage',
      label: 'Uso',
      icon: <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><path d="M2 13h2v-4H2v4zm3.5 0h2V5h-2v8zM9 13h2V8H9v5zm3.5 0h2V3h-2v10z"/></svg>,
    },
  ];

  return (
    <div className="flex flex-col h-full w-[236px] bg-[#f8f8f7] border-r border-[#e9eae6] flex-shrink-0 overflow-hidden">
      <div className="flex items-center justify-between px-6 py-4 h-16 flex-shrink-0">
        <span className="text-[20px] font-semibold tracking-[-0.4px] text-[#1a1a1a]">Suscripción</span>
      </div>

      <div className="px-3 pb-3">
        <div className="rounded-xl border border-[#e9eae6] bg-white px-3 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#646462]">Plan actual</p>
          <p className="text-[14px] font-semibold text-[#1a1a1a] capitalize mt-0.5">{planLabel.replace(/_/g, ' ')}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pl-3 pr-3 pb-4 flex flex-col gap-0.5">
        {items.map(it => (
          <button key={it.id} onClick={() => onTabChange(it.id)} className={itemCls(activeTab === it.id)}>
            {it.icon}
            <span className="flex-1">{it.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Reusable card primitive ──────────────────────────────────────────────────
function Section({ title, action, children }: { title: string; action?: JSX.Element; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl border border-[#e9eae6] overflow-hidden">
      <div className="px-6 py-4 border-b border-[#e9eae6] flex justify-between items-center">
        <h2 className="text-[14px] font-semibold text-[#1a1a1a]">{title}</h2>
        {action}
      </div>
      <div className="p-6">{children}</div>
    </section>
  );
}

function MetricCard({ label, value, hint, accent }: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className={`p-4 rounded-xl border ${accent ? 'border-[#fa7938]/30 bg-[#fff7f1]' : 'border-[#e9eae6] bg-[#f8f8f7]'}`}>
      <p className={`text-[11px] mb-1 ${accent ? 'text-[#9a3412] font-semibold' : 'text-[#646462]'}`}>{label}</p>
      <p className={`text-[22px] font-bold ${accent ? 'text-[#9a3412]' : 'text-[#1a1a1a]'}`}>{value}</p>
      {hint && <p className={`text-[10px] mt-1 ${accent ? 'text-[#9a3412]/70' : 'text-[#646462]'}`}>{hint}</p>}
    </div>
  );
}

// ── PlansPanel ───────────────────────────────────────────────────────────────
function PlansPanel({ orgId, subscription, currentPlanKey, refreshAll, onAction }: {
  orgId: string | undefined;
  subscription: any;
  currentPlanKey: string;
  refreshAll: () => void;
  onAction: (msg: string, type: 'success' | 'error') => void;
}) {
  const [isAnnual, setIsAnnual] = useState(true);
  const [savingPlanId, setSavingPlanId] = useState<string | null>(null);

  const plans = [
    {
      name: 'Starter',
      planId: 'starter',
      originalPrice: 149,
      monthlyPrice: 49,
      annualPrice: 42,
      bestFor: 'Equipos pequeños empezando con soporte asistido por IA.',
      capacity: '5,000 créditos/mes (~500 casos resueltos o ~2,500 borradores).',
      bullets: [
        '5,000 créditos AI/mes',
        '3 puestos incluidos (€25/extra)',
        'Workflows core de soporte',
        'Email & chat estándar',
        'Reporting básico',
      ],
    },
    {
      name: 'Growth',
      planId: 'growth',
      originalPrice: 399,
      monthlyPrice: 129,
      annualPrice: 109,
      bestFor: 'Equipos que usan IA cada día.',
      capacity: '20,000 créditos/mes (~2,000 casos complejos o automatizaciones completas).',
      isRecommended: true,
      bullets: [
        '20,000 créditos AI/mes',
        '8 puestos incluidos (€22/extra)',
        'Workflows multi-paso avanzados',
        'Integraciones API personalizadas',
        'Soporte por email prioritario',
      ],
    },
    {
      name: 'Scale',
      planId: 'scale',
      originalPrice: 899,
      monthlyPrice: 299,
      annualPrice: 254,
      bestFor: 'Operaciones avanzadas, multi-canal y alto volumen.',
      capacity: '60,000 créditos/mes (~6,000 casos complejos multi-idioma).',
      bullets: [
        '60,000 créditos AI/mes',
        '20 puestos incluidos (€19/extra)',
        'Workflows ilimitados',
        'Customer success manager dedicado',
        'Dashboards de reporting personalizados',
      ],
    },
    {
      name: 'Business',
      planId: 'business',
      originalPrice: 'Custom' as const,
      monthlyPrice: 'Custom' as const,
      annualPrice: 'Custom' as const,
      bestFor: 'Capacidad y gobernanza enterprise a medida.',
      capacity: 'Asignación custom de créditos según volumen y requisitos de seguridad.',
      bullets: [
        'Puestos a medida',
        'Seguridad y compliance enterprise',
        'SLA & uptime garantizados',
        'Onboarding y formación dedicados',
      ],
    },
  ];

  const applyPlan = useCallback(async (planId: string) => {
    if (!orgId) return;
    setSavingPlanId(planId);
    try {
      await billingApi.changePlan(orgId, planId);
      onAction(`Plan actualizado a ${planId}.`, 'success');
      refreshAll();
    } catch (err: any) {
      onAction(err?.message || 'No se pudo cambiar el plan.', 'error');
    } finally {
      setSavingPlanId(null);
    }
  }, [orgId, onAction, refreshAll]);

  return (
    <div className="flex flex-col gap-6">
      <Section
        title="Plan actual"
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h3 className="text-[18px] font-bold text-[#1a1a1a] capitalize">{currentPlanKey.replace(/_/g, ' ')} plan</h3>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#dcfce7] text-[#15803d]">Activo</span>
            </div>
            <p className="text-[13px] text-[#646462]">
              Incluye {(subscription?.ai_credits_included ?? subscription?.credits_included ?? 5000).toLocaleString()} créditos AI y {subscription?.seats_included ?? 3} puestos al mes.
            </p>
          </div>
        </div>
      </Section>

      <Section
        title="Planes disponibles"
        action={
          <div className="flex items-center bg-[#f3f3f1] p-1 rounded-full">
            <button
              onClick={() => setIsAnnual(false)}
              className={`px-3 h-7 rounded-full text-[12px] font-semibold transition-all ${!isAnnual ? 'bg-white shadow-sm text-[#1a1a1a]' : 'text-[#646462]'}`}
            >
              Mensual
            </button>
            <button
              onClick={() => setIsAnnual(true)}
              className={`px-3 h-7 rounded-full text-[12px] font-semibold transition-all flex items-center gap-1.5 ${isAnnual ? 'bg-white shadow-sm text-[#1a1a1a]' : 'text-[#646462]'}`}
            >
              Anual <span className="text-[10px] font-bold text-[#15803d] bg-[#dcfce7] px-1.5 py-0.5 rounded">15%</span>
            </button>
          </div>
        }
      >
        <p className="text-[13px] text-[#646462] mb-6">Todos los planes incluyen la plataforma core. Lo que cambia es la capacidad de IA, los puestos y la escala.</p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {plans.map(plan => {
            const isCurrent = currentPlanKey === plan.planId;
            const isSaving = savingPlanId === plan.planId;
            return (
              <div key={plan.planId} className={`relative flex flex-col p-5 rounded-2xl border ${
                plan.isRecommended ? 'border-[#fa7938] bg-[#fff7f1]' : 'border-[#e9eae6] bg-white'
              }`}>
                {plan.isRecommended && (
                  <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                    <span className="bg-[#fa7938] text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wide shadow-sm">Recomendado</span>
                  </div>
                )}

                <div className="mb-4">
                  <h3 className="text-[18px] font-bold text-[#1a1a1a]">{plan.name}</h3>
                  <p className="text-[12px] text-[#646462] mt-1.5 min-h-[36px]">{plan.bestFor}</p>
                </div>

                <div className="mb-5">
                  <div className="flex items-baseline gap-1 flex-wrap">
                    {plan.monthlyPrice === 'Custom' ? (
                      <span className="text-[28px] font-bold text-[#1a1a1a]">Custom</span>
                    ) : (
                      <>
                        <span className="text-[12px] font-medium text-[#646462] line-through mr-1">€{plan.originalPrice}</span>
                        <span className="text-[28px] font-bold text-[#1a1a1a]">€{isAnnual ? plan.annualPrice : plan.monthlyPrice}</span>
                        <span className="text-[12px] text-[#646462]">/ mes</span>
                      </>
                    )}
                  </div>
                  {plan.monthlyPrice !== 'Custom' && (
                    <p className="text-[11px] text-[#646462] mt-1">
                      {isAnnual && typeof plan.annualPrice === 'number'
                        ? `Facturación anual (€${plan.annualPrice * 12}/año)`
                        : 'Facturación mensual'}
                    </p>
                  )}
                </div>

                <div className="flex-1 flex flex-col">
                  <div className="mb-5">
                    <h4 className="text-[12px] font-bold text-[#1a1a1a] mb-3 uppercase tracking-wider">Incluido</h4>
                    <div className="flex flex-col gap-2">
                      <div className="flex items-start gap-2 text-[12px] text-[#1a1a1a]">
                        <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#fa7938] mt-0.5 flex-shrink-0"><path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM6.7 10.6L4 7.9l1-1L6.7 8.6 11 4.3l1 1-5.3 5.3z"/></svg>
                        <span>{plan.capacity}</span>
                      </div>
                      {plan.bullets.map((b, i) => (
                        <div key={i} className="flex items-start gap-2 text-[12px] text-[#1a1a1a]">
                          <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#fa7938] mt-0.5 flex-shrink-0"><path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM6.7 10.6L4 7.9l1-1L6.7 8.6 11 4.3l1 1-5.3 5.3z"/></svg>
                          <span>{b}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => isCurrent ? onAction(`${plan.name} ya está activo.`, 'success') : applyPlan(plan.planId)}
                    disabled={isSaving || isCurrent}
                    className={`w-full h-9 rounded-full text-[13px] font-semibold transition-all mt-auto ${
                      isCurrent
                        ? 'bg-[#e9eae6] text-[#646462] cursor-not-allowed'
                        : plan.isRecommended
                          ? 'bg-[#fa7938] hover:bg-[#e3691f] text-white'
                          : plan.planId === 'business'
                            ? 'bg-[#1a1a1a] hover:bg-black text-white'
                            : 'bg-[#f8f8f7] hover:bg-[#ededea] text-[#1a1a1a] border border-[#e9eae6]'
                    }`}
                  >
                    {isSaving ? 'Aplicando…' : isCurrent ? 'Plan actual' : plan.planId === 'business' ? 'Hablar con ventas' : `Cambiar a ${plan.name}`}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </Section>
    </div>
  );
}

// ── CreditsPanel ─────────────────────────────────────────────────────────────
function CreditsPanel({ orgId, subscription, workspace, refreshAll, onAction }: {
  orgId: string | undefined;
  subscription: any;
  workspace: any;
  refreshAll: () => void;
  onAction: (msg: string, type: 'success' | 'error') => void;
}) {
  const [savingPack, setSavingPack] = useState<string | null>(null);
  const [flexExpanded, setFlexExpanded] = useState(false);
  const [flexEnabled, setFlexEnabled] = useState(false);
  const [spendCap, setSpendCap] = useState('100');
  const [savingFlex, setSavingFlex] = useState(false);

  const includedCredits = subscription?.ai_credits_included ?? subscription?.credits_included ?? 0;
  const usedCredits = subscription?.ai_credits_used_period ?? subscription?.credits_used ?? 0;
  const topupBalance = subscription?.ai_credits_topup_balance ?? 0;
  const remainingCredits = Math.max(includedCredits - usedCredits, 0) + topupBalance;
  const percentUsed = includedCredits > 0 ? Math.min(100, Math.round((usedCredits / includedCredits) * 100)) : 0;
  const workspaceSettings = useMemo(() => parseSettings(workspace?.settings), [workspace?.settings]);

  useEffect(() => {
    setSpendCap(String(workspaceSettings.billing?.monthlyBudgetCap ?? 100));
    setFlexEnabled(Boolean(workspaceSettings.billing?.flexibleUsageEnabled ?? false));
  }, [workspaceSettings]);

  const buyPack = async (label: string, credits: number, amountCents: number) => {
    if (!orgId) return;
    setSavingPack(label);
    try {
      await billingApi.topUp(orgId, { type: 'credits', quantity: credits, amount_cents: amountCents });
      onAction(`Comprados ${credits.toLocaleString()} créditos.`, 'success');
      refreshAll();
    } catch (err: any) {
      onAction(err?.message || 'No se pudieron comprar créditos.', 'error');
    } finally {
      setSavingPack(null);
    }
  };

  const saveFlexible = async (enabled: boolean) => {
    setSavingFlex(true);
    try {
      const cap = enabled ? Math.max(0, Math.round(Number(spendCap) || 0)) : undefined;
      await billingApi.toggleFlexibleUsage(enabled, cap);
      setFlexEnabled(enabled);
      setFlexExpanded(false);
      onAction(enabled ? `Uso flexible activado (cap €${cap}).` : 'Uso flexible desactivado.', 'success');
      refreshAll();
    } catch (err: any) {
      onAction(err?.message || 'No se pudo actualizar el uso flexible.', 'error');
    } finally {
      setSavingFlex(false);
    }
  };

  const creditPacks = [
    { credits: 5000,  price: 79,  models: ['GPT-4o mini', 'Claude 3 Haiku', 'Gemini 1.5 Flash'], compute: 'Hasta 5M tokens / ~10k tareas automáticas' },
    { credits: 20000, price: 249, popular: true, models: ['GPT-4o', 'Claude 3.5 Sonnet', 'Gemini 1.5 Pro'], compute: 'Hasta 20M tokens / ~40k tareas automáticas' },
    { credits: 50000, price: 549, models: ['Todos los modelos + fine-tuned'], compute: 'Hasta 50M tokens / ~100k tareas automáticas' },
  ];

  return (
    <div className="flex flex-col gap-6">
      <Section title="Resumen de créditos AI">
        <div className="grid grid-cols-3 gap-4 mb-6">
          <MetricCard
            label="Incluidos / mes"
            value={includedCredits > 0 ? includedCredits.toLocaleString() : '—'}
            hint={subscription?.ai_credits_period_end ? `Renueva ${formatDate(subscription.ai_credits_period_end)}` : 'Por ciclo'}
          />
          <MetricCard
            label="Usados"
            value={usedCredits.toLocaleString()}
            hint="Este ciclo"
          />
          <MetricCard
            label="Disponibles ahora"
            value={remainingCredits.toLocaleString()}
            hint={topupBalance > 0 ? `Incl. ${topupBalance.toLocaleString()} top-up` : 'Incluidos + top-up'}
            accent
          />
        </div>

        {includedCredits > 0 && (
          <div className="mb-6">
            <div className="flex justify-between text-[11px] text-[#646462] mb-1.5">
              <span>{usedCredits.toLocaleString()} de {includedCredits.toLocaleString()} créditos incluidos</span>
              <span className={percentUsed >= 100 ? 'text-[#dc2626] font-semibold' : percentUsed >= 80 ? 'text-[#ca8a04] font-semibold' : ''}>{percentUsed}%</span>
            </div>
            <div className="h-2 bg-[#f3f3f1] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  percentUsed >= 100 ? 'bg-[#dc2626]' : percentUsed >= 80 ? 'bg-[#ca8a04]' : 'bg-[#fa7938]'
                }`}
                style={{ width: `${Math.min(100, percentUsed)}%` }}
              />
            </div>
            {topupBalance > 0 && (
              <p className="text-[10px] text-[#646462] mt-1.5">+ {topupBalance.toLocaleString()} créditos top-up disponibles tras consumir los incluidos</p>
            )}
          </div>
        )}

        <div className="bg-[#f5f7ff] rounded-xl p-4 border border-[#dbeafe] flex gap-3">
          <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a47b8] flex-shrink-0 mt-0.5"><path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM7.25 4.5h1.5V6h-1.5V4.5zm0 2.5h1.5v4.5h-1.5V7z"/></svg>
          <div>
            <h4 className="text-[12px] font-semibold text-[#1a47b8] mb-1">Cómo funcionan los créditos AI</h4>
            <ul className="text-[11.5px] text-[#1e40af] leading-[16px] list-disc list-inside space-y-0.5">
              <li>Clasificación y etiquetado simple</li>
              <li>Resúmenes de conversación</li>
              <li>Recomendaciones de respuesta</li>
              <li>Razonamiento de workflows complejos</li>
            </ul>
          </div>
        </div>
      </Section>

      <Section title="Comprar créditos extra">
        <p className="text-[13px] text-[#646462] mb-5">
          Los créditos top-up están disponibles en cualquier plan y se consumen sólo después de los créditos incluidos. Permanecen disponibles mientras tu suscripción esté activa.
        </p>

        <div className="flex flex-col gap-3">
          {creditPacks.map(pack => {
            const label = `pack-${pack.credits}`;
            const isSaving = savingPack === label;
            return (
              <div key={label} className={`relative p-5 rounded-xl border flex items-center justify-between gap-6 ${
                pack.popular ? 'border-[#fa7938] bg-[#fff7f1]' : 'border-[#e9eae6] bg-white'
              }`}>
                {pack.popular && (
                  <div className="absolute -top-2.5 left-5">
                    <span className="bg-[#fa7938] text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">Popular</span>
                  </div>
                )}

                <div className="flex items-center gap-3 w-1/4">
                  <div className="w-10 h-10 rounded-full bg-[#fff7f1] border border-[#fa7938]/30 flex items-center justify-center flex-shrink-0">
                    <svg viewBox="0 0 16 16" className="w-5 h-5 fill-[#fa7938]"><circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="3" fill="#fff"/></svg>
                  </div>
                  <div>
                    <h3 className="text-[20px] font-bold text-[#1a1a1a]">{pack.credits.toLocaleString()}</h3>
                    <p className="text-[12px] text-[#646462]">Créditos AI</p>
                  </div>
                </div>

                <div className="flex-1 px-4 border-l border-r border-[#e9eae6]">
                  <ul className="space-y-1.5">
                    <li className="flex items-start text-[12px] text-[#1a1a1a] gap-2">
                      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#15803d] flex-shrink-0 mt-0.5"><path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM6.7 10.6L4 7.9l1-1L6.7 8.6 11 4.3l1 1-5.3 5.3z"/></svg>
                      <div><span className="font-semibold">Modelos:</span> {pack.models.join(', ')}</div>
                    </li>
                    <li className="flex items-start text-[12px] text-[#1a1a1a] gap-2">
                      <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#15803d] flex-shrink-0 mt-0.5"><path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM6.7 10.6L4 7.9l1-1L6.7 8.6 11 4.3l1 1-5.3 5.3z"/></svg>
                      <div><span className="font-semibold">Capacidad:</span> {pack.compute}</div>
                    </li>
                  </ul>
                </div>

                <div className="flex flex-col items-end w-1/4">
                  <div className="text-[24px] font-bold text-[#1a1a1a] mb-2">€{pack.price}</div>
                  <button
                    type="button"
                    disabled={isSaving || !orgId}
                    onClick={() => buyPack(label, pack.credits, pack.price * 100)}
                    className={`w-full h-9 rounded-full text-[13px] font-semibold transition-all ${
                      isSaving || !orgId
                        ? 'bg-[#e9eae6] text-[#646462] cursor-not-allowed'
                        : pack.popular
                          ? 'bg-[#fa7938] hover:bg-[#e3691f] text-white'
                          : 'bg-[#1a1a1a] hover:bg-black text-white'
                    }`}
                  >
                    {isSaving ? 'Comprando…' : 'Comprar'}
                  </button>
                </div>
              </div>
            );
          })}

          {/* Flexible usage card */}
          <div className="rounded-xl border border-[#e9eae6] bg-white overflow-hidden">
            <div className="p-5 flex items-center justify-between gap-6">
              <div className="flex items-center gap-3 w-1/4">
                <div className="w-10 h-10 rounded-full bg-[#f5f7ff] border border-[#dbeafe] flex items-center justify-center flex-shrink-0">
                  <svg viewBox="0 0 16 16" className="w-5 h-5 fill-[#1a47b8]"><path d="M2 13h2v-4H2v4zm3.5 0h2V5h-2v8zM9 13h2V8H9v5zm3.5 0h2V3h-2v10z"/></svg>
                </div>
                <div>
                  <h3 className="text-[16px] font-bold text-[#1a1a1a]">Uso flexible</h3>
                  <p className="text-[11px] text-[#646462] mt-0.5 leading-tight">Paga sólo por créditos extra después de tu capacidad incluida.</p>
                </div>
              </div>

              <div className="flex-1 px-4 border-l border-r border-[#e9eae6]">
                <ul className="space-y-1.5">
                  <li className="flex items-start text-[12px] text-[#1a1a1a] gap-2">
                    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#1a47b8] flex-shrink-0 mt-0.5"><path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM6.7 10.6L4 7.9l1-1L6.7 8.6 11 4.3l1 1-5.3 5.3z"/></svg>
                    <div>Empieza tras consumir los créditos incluidos</div>
                  </li>
                  <li className="flex items-start text-[12px] text-[#1a1a1a] gap-2">
                    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#1a47b8] flex-shrink-0 mt-0.5"><path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM6.7 10.6L4 7.9l1-1L6.7 8.6 11 4.3l1 1-5.3 5.3z"/></svg>
                    <div>Facturado mensualmente por uso real</div>
                  </li>
                  <li className="flex items-start text-[12px] text-[#1a1a1a] gap-2">
                    <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#1a47b8] flex-shrink-0 mt-0.5"><path d="M8 1.5a6.5 6.5 0 100 13 6.5 6.5 0 000-13zM6.7 10.6L4 7.9l1-1L6.7 8.6 11 4.3l1 1-5.3 5.3z"/></svg>
                    <div>Cap mensual con alertas de uso</div>
                  </li>
                </ul>
              </div>

              <div className="flex flex-col items-end w-1/4">
                <div className="text-[14px] font-bold text-[#1a1a1a] mb-0.5">€19 / 1,000 créditos</div>
                <div className="text-[11px] text-[#646462] mb-2">Mensual por uso extra</div>
                <button
                  onClick={() => setFlexExpanded(s => !s)}
                  className={`w-full h-9 rounded-full text-[13px] font-semibold transition-all flex items-center justify-center gap-1.5 ${
                    flexEnabled
                      ? 'bg-[#dcfce7] text-[#15803d] border border-[#bbf7d0] hover:bg-[#bbf7d0]'
                      : 'bg-[#f8f8f7] text-[#1a1a1a] border border-[#e9eae6] hover:bg-[#ededea]'
                  }`}
                >
                  {flexEnabled ? 'Gestionar uso flexible' : 'Activar uso flexible'}
                  <svg viewBox="0 0 16 16" className={`w-3 h-3 fill-current transition-transform ${flexExpanded ? 'rotate-180' : ''}`}><path d="M4 6l4 4 4-4z"/></svg>
                </button>
              </div>
            </div>

            {flexExpanded && (
              <div className="border-t border-[#e9eae6] bg-[#f8f8f7]/50 p-5 space-y-5">
                <div className="bg-white rounded-xl p-4 border border-[#e9eae6]">
                  <p className="text-[13px] text-[#1a1a1a] leading-[18px]">
                    El uso extra empieza sólo cuando se consumen los créditos incluidos. Se factura mensualmente a <strong>€19 por 1,000 créditos</strong>. Las funciones de IA se pausan automáticamente al alcanzar el cap.
                  </p>
                </div>

                <div>
                  <h3 className="text-[13px] font-semibold text-[#1a1a1a] mb-3">A. Cap mensual de gasto</h3>
                  <div className="grid grid-cols-4 gap-2 mb-2">
                    {['50', '100', '250', '500'].map(val => (
                      <button
                        key={val}
                        onClick={() => setSpendCap(val)}
                        className={`h-9 rounded-lg text-[13px] font-semibold border transition-colors ${
                          spendCap === val ? 'bg-[#1a1a1a] text-white border-[#1a1a1a]' : 'bg-white text-[#1a1a1a] border-[#e9eae6] hover:bg-[#f8f8f7]'
                        }`}
                      >
                        €{val}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] text-[#646462]">Personalizado: €</span>
                    <input
                      type="number"
                      value={spendCap}
                      onChange={e => setSpendCap(e.target.value)}
                      className="flex-1 h-9 bg-white border border-[#e9eae6] rounded-lg px-3 text-[13px] text-[#1a1a1a] focus:outline-none focus:border-[#1a1a1a]"
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-[#e9eae6] flex justify-between items-center">
                  {flexEnabled ? (
                    <button
                      onClick={() => saveFlexible(false)}
                      disabled={savingFlex}
                      className="text-[13px] font-semibold text-[#dc2626] hover:text-[#991b1b] disabled:opacity-50"
                    >
                      Desactivar uso flexible
                    </button>
                  ) : (
                    <div></div>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => setFlexExpanded(false)}
                      className="px-3 h-9 rounded-full text-[13px] font-semibold text-[#1a1a1a] bg-[#f8f8f7] hover:bg-[#ededea]"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => saveFlexible(true)}
                      disabled={savingFlex}
                      className="px-4 h-9 rounded-full text-[13px] font-semibold text-white bg-[#fa7938] hover:bg-[#e3691f] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {savingFlex ? 'Guardando…' : flexEnabled ? 'Guardar cambios' : 'Activar uso flexible'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </Section>
    </div>
  );
}

// ── SeatsPanel ───────────────────────────────────────────────────────────────
function SeatsPanel({ orgId, subscription, refreshAll, onAction }: {
  orgId: string | undefined;
  subscription: any;
  refreshAll: () => void;
  onAction: (msg: string, type: 'success' | 'error') => void;
}) {
  const [quantity, setQuantity] = useState(1);
  const [isSaving, setIsSaving] = useState(false);

  const includedSeats = subscription?.seats_included ?? 3;
  const usedSeats = subscription?.seats_used ?? 0;
  const remainingSeats = Math.max(includedSeats - usedSeats, 0);
  const planLabel = String(subscription?.plan_id || 'starter');

  const addSeats = async () => {
    if (!orgId) return;
    setIsSaving(true);
    try {
      await billingApi.topUp(orgId, { type: 'seats', quantity, amount_cents: quantity * 2500 });
      onAction(`Añadido${quantity === 1 ? '' : 's'} ${quantity} puesto${quantity === 1 ? '' : 's'}.`, 'success');
      refreshAll();
    } catch (err: any) {
      onAction(err?.message || 'No se pudieron añadir puestos.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Section title="Gestión de puestos">
        <div className="grid grid-cols-3 gap-4 mb-6">
          <MetricCard label={`Incluidos en ${planLabel}`} value={String(includedSeats)} hint="Puestos base" />
          <MetricCard label="En uso" value={String(usedSeats)} hint="Miembros activos" />
          <MetricCard label="Disponibles" value={String(remainingSeats)} hint="Para invitar" accent />
        </div>

        <div className="border-t border-[#e9eae6] pt-6">
          <h3 className="text-[14px] font-bold text-[#1a1a1a] mb-3">Añadir puestos extra</h3>
          <div className="flex items-center justify-between p-4 rounded-xl border border-[#e9eae6] bg-white">
            <div>
              <p className="text-[13px] font-semibold text-[#1a1a1a]">Puestos extra</p>
              <p className="text-[11px] text-[#646462] mt-0.5">€25 / puesto / mes en el plan {planLabel}</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center border border-[#e9eae6] rounded-full overflow-hidden bg-white">
                <button
                  type="button"
                  onClick={() => setQuantity(q => Math.max(q - 1, 1))}
                  className="w-8 h-8 flex items-center justify-center text-[#1a1a1a] hover:bg-[#f8f8f7] transition-colors"
                  aria-label="Reducir cantidad"
                >
                  <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#1a1a1a]"><path d="M3 7.25h10v1.5H3z"/></svg>
                </button>
                <span className="px-3 h-8 inline-flex items-center text-[13px] font-semibold text-[#1a1a1a] min-w-[40px] justify-center border-l border-r border-[#e9eae6]">{quantity}</span>
                <button
                  type="button"
                  onClick={() => setQuantity(q => q + 1)}
                  className="w-8 h-8 flex items-center justify-center text-[#1a1a1a] hover:bg-[#f8f8f7] transition-colors"
                  aria-label="Aumentar cantidad"
                >
                  <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#1a1a1a]"><path d="M7.25 3h1.5v4H13v1.5H8.75V13h-1.5V8.5H3V7h4.25z"/></svg>
                </button>
              </div>
              <button
                type="button"
                disabled={isSaving || !orgId}
                onClick={addSeats}
                className={`px-4 h-9 rounded-full text-[13px] font-semibold transition-all ${
                  isSaving || !orgId
                    ? 'bg-[#e9eae6] text-[#646462] cursor-not-allowed'
                    : 'bg-[#1a1a1a] text-white hover:bg-black'
                }`}
              >
                {isSaving ? 'Añadiendo…' : 'Añadir puestos'}
              </button>
            </div>
          </div>
          <p className="text-[11px] text-[#646462] mt-3">Total: <span className="font-semibold text-[#1a1a1a]">€{quantity * 25} / mes</span></p>
        </div>
      </Section>
    </div>
  );
}

// ── BillingPanel ─────────────────────────────────────────────────────────────
function BillingPanel({ orgId, subscription }: {
  orgId: string | undefined;
  subscription: any;
}) {
  const { data: ledger } = useApi(
    () => orgId ? billingApi.ledger(orgId) : Promise.resolve([]),
    [orgId],
    [],
  );

  const invoices = useMemo(() => {
    const rows = Array.isArray(ledger) ? ledger : [];
    return rows.map((entry: any, index: number) => ({
      id: entry.reference_id || entry.id || `LEDGER-${index + 1}`,
      date: entry.occurred_at ? new Date(entry.occurred_at).toLocaleDateString() : '—',
      amount: moneyEUR(Number(entry.amount)),
      status: entry.entry_type === 'credit' ? 'Crédito' : 'Pagada',
      note: entry.reason || entry.reference_type || undefined,
    }));
  }, [ledger]);

  const downloadLedger = () => {
    const csv = [
      ['Factura', 'Fecha', 'Importe', 'Estado', 'Nota'].join(','),
      ...invoices.map(invoice => [
        invoice.id,
        invoice.date,
        invoice.amount,
        invoice.status,
        invoice.note || '',
      ].map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `billing-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const planLabel = String(subscription?.plan_id || 'starter').replace(/_/g, ' ');
  const monthly = subscription?.price_cents ? subscription.price_cents / 100 : 49;

  return (
    <div className="flex flex-col gap-6">
      <Section title="Resumen de facturación">
        <div className="grid grid-cols-2 gap-6">
          <div>
            <h3 className="text-[11px] font-semibold text-[#646462] uppercase tracking-wider mb-3">Plan actual</h3>
            <div className="flex items-center gap-3 mb-1">
              <span className="text-[18px] font-bold text-[#1a1a1a] capitalize">{planLabel}</span>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#dcfce7] text-[#15803d]">{subscription?.status || 'Active'}</span>
            </div>
            <p className="text-[13px] text-[#1a1a1a] mb-1">{moneyEUR(monthly)} / mes</p>
            <p className="text-[12px] text-[#646462]">Próxima renovación: {formatDate(subscription?.current_period_end)}</p>
          </div>

          <div>
            <h3 className="text-[11px] font-semibold text-[#646462] uppercase tracking-wider mb-3">Método de pago</h3>
            <div className="flex items-center gap-3 p-3 rounded-xl border border-[#e9eae6] bg-[#f8f8f7]">
              <div className="w-10 h-6 bg-white rounded flex items-center justify-center border border-[#e9eae6]">
                <span className="text-[10px] font-bold text-[#1a47b8]">VISA</span>
              </div>
              <div className="flex-1">
                <p className="text-[13px] font-semibold text-[#1a1a1a]">•••• •••• •••• 4242</p>
                <p className="text-[11px] text-[#646462]">Conectado a la suscripción</p>
              </div>
            </div>
          </div>
        </div>
      </Section>

      <Section title="Historial de facturas" action={
        invoices.length > 0 ? (
          <button
            onClick={downloadLedger}
            className="px-3 h-8 rounded-full text-[12px] font-semibold text-[#1a1a1a] bg-[#f8f8f7] hover:bg-[#ededea] flex items-center gap-1.5"
          >
            <svg viewBox="0 0 16 16" className="w-3.5 h-3.5 fill-[#1a1a1a]"><path d="M8 1.5v8.4l2.6-2.6 1.05 1.05L8 12 4.35 8.35 5.4 7.3 8 9.9V1.5h0zM2.5 13h11v1.5h-11z"/></svg>
            CSV
          </button>
        ) : undefined
      }>
        <div className="overflow-x-auto -mx-6 -mb-6">
          <table className="w-full text-left">
            <thead>
              <tr className="border-y border-[#e9eae6] bg-[#f8f8f7]">
                <th className="px-6 py-3 text-[11px] font-semibold text-[#646462] uppercase tracking-wider">Factura</th>
                <th className="px-6 py-3 text-[11px] font-semibold text-[#646462] uppercase tracking-wider">Fecha</th>
                <th className="px-6 py-3 text-[11px] font-semibold text-[#646462] uppercase tracking-wider">Importe</th>
                <th className="px-6 py-3 text-[11px] font-semibold text-[#646462] uppercase tracking-wider">Estado</th>
                <th className="px-6 py-3 text-[11px] font-semibold text-[#646462] uppercase tracking-wider text-right">Acción</th>
              </tr>
            </thead>
            <tbody>
              {invoices.length === 0 && (
                <tr>
                  <td className="px-6 py-12 text-center text-[13px] text-[#646462]" colSpan={5}>
                    No hay facturas registradas todavía.
                  </td>
                </tr>
              )}
              {invoices.map((invoice, idx) => (
                <tr key={idx} className="border-b border-[#e9eae6] hover:bg-[#f8f8f7] transition-colors">
                  <td className="px-6 py-3.5">
                    <p className="text-[13px] font-semibold text-[#1a1a1a]">{invoice.id}</p>
                    {invoice.note && <p className="text-[11px] text-[#646462] mt-0.5">{invoice.note}</p>}
                  </td>
                  <td className="px-6 py-3.5 text-[13px] text-[#1a1a1a]">{invoice.date}</td>
                  <td className="px-6 py-3.5 text-[13px] font-semibold text-[#1a1a1a]">{invoice.amount}</td>
                  <td className="px-6 py-3.5">
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#dcfce7] text-[#15803d]">
                      {invoice.status}
                    </span>
                  </td>
                  <td className="px-6 py-3.5 text-right">
                    <button
                      type="button"
                      onClick={downloadLedger}
                      className="text-[#646462] hover:text-[#1a1a1a] transition-colors"
                      title="Descargar ledger CSV"
                    >
                      <svg viewBox="0 0 16 16" className="w-4 h-4 fill-current"><path d="M8 1.5v8.4l2.6-2.6 1.05 1.05L8 12 4.35 8.35 5.4 7.3 8 9.9V1.5h0zM2.5 13h11v1.5h-11z"/></svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

// ── UsagePanel ───────────────────────────────────────────────────────────────
function UsagePanel({ orgId, subscription, workspace, refreshAll, onAction }: {
  orgId: string | undefined;
  subscription: any;
  workspace: any;
  refreshAll: () => void;
  onAction: (msg: string, type: 'success' | 'error') => void;
}) {
  const [isSaving, setIsSaving] = useState(false);
  const creditsIncluded = subscription?.ai_credits_included ?? subscription?.credits_included ?? 5000;
  const creditsUsed = subscription?.ai_credits_used_period ?? subscription?.credits_used ?? 0;
  const seatsIncluded = subscription?.seats_included ?? 3;
  const seatsUsed = subscription?.seats_used ?? 0;
  const planLabel = String(subscription?.plan_id || workspace?.plan_id || 'starter');

  const creditPercent = Math.min((creditsUsed / Math.max(creditsIncluded, 1)) * 100, 100);
  const seatPercent = Math.min((seatsUsed / Math.max(seatsIncluded, 1)) * 100, 100);

  const buyCredits = async () => {
    if (!orgId) return;
    setIsSaving(true);
    try {
      await billingApi.topUp(orgId, { type: 'credits', quantity: 5000, amount_cents: 7900 });
      onAction('Comprados 5,000 créditos.', 'success');
      refreshAll();
    } catch (err: any) {
      onAction(err?.message || 'No se pudieron comprar créditos.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <Section
        title="Uso del ciclo actual"
        action={
          <span className="text-[11px] text-[#646462]">
            {workspace?.created_at ? `Workspace activo desde ${formatDate(workspace.created_at)}` : 'Ciclo de facturación actual'}
          </span>
        }
      >
        <div className="space-y-7">
          <div>
            <div className="flex justify-between items-end mb-2">
              <div>
                <h3 className="text-[14px] font-bold text-[#1a1a1a] flex items-center gap-2">
                  <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#fa7938]"><circle cx="8" cy="8" r="6.5"/><circle cx="8" cy="8" r="3" fill="#fff"/></svg>
                  Créditos AI
                </h3>
                <p className="text-[11px] text-[#646462] mt-0.5">Incluidos en plan {planLabel}</p>
              </div>
              <div className="text-right">
                <span className="text-[14px] font-bold text-[#1a1a1a]">{creditsUsed.toLocaleString()}</span>
                <span className="text-[12px] text-[#646462]"> / {creditsIncluded.toLocaleString()}</span>
              </div>
            </div>
            <div className="w-full bg-[#f3f3f1] rounded-full h-2 overflow-hidden">
              <div className="bg-[#fa7938] h-2 rounded-full transition-all" style={{ width: `${creditPercent}%` }} />
            </div>
            <p className="text-[10px] text-[#646462] mt-1.5">{Math.max(creditsIncluded - creditsUsed, 0).toLocaleString()} créditos restantes este ciclo.</p>
          </div>

          <div>
            <div className="flex justify-between items-end mb-2">
              <div>
                <h3 className="text-[14px] font-bold text-[#1a1a1a] flex items-center gap-2">
                  <svg viewBox="0 0 16 16" className="w-4 h-4 fill-[#1a1a1a]"><circle cx="6" cy="5" r="2.5"/><path d="M1.8 12.5c.4-2 2.1-3.2 4.2-3.2s3.8 1.2 4.2 3.2v.5H1.8v-.5z"/><circle cx="11.5" cy="6" r="2"/><path d="M9.5 9.4c.6-.2 1.3-.3 2-.3 1.7 0 3 .9 3.4 2.5v.4H10.6c-.1-.9-.4-1.8-1.1-2.6z"/></svg>
                  Puestos
                </h3>
                <p className="text-[11px] text-[#646462] mt-0.5">Incluidos en plan {planLabel}</p>
              </div>
              <div className="text-right">
                <span className="text-[14px] font-bold text-[#1a1a1a]">{seatsUsed}</span>
                <span className="text-[12px] text-[#646462]"> / {seatsIncluded}</span>
              </div>
            </div>
            <div className="w-full bg-[#f3f3f1] rounded-full h-2 overflow-hidden">
              <div className="bg-[#1a1a1a] h-2 rounded-full transition-all" style={{ width: `${seatPercent}%` }} />
            </div>
            <p className="text-[10px] text-[#646462] mt-1.5">{Math.max(seatsIncluded - seatsUsed, 0)} puestos disponibles para invitar.</p>
          </div>
        </div>
      </Section>

      <Section title="Add-ons & top-ups">
        <div className="flex items-center justify-between p-4 rounded-xl border border-[#e9eae6] bg-[#f8f8f7]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-[#fff7f1] border border-[#fa7938]/30 flex items-center justify-center">
              <svg viewBox="0 0 16 16" className="w-5 h-5 fill-[#fa7938]"><circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="3" fill="#fff"/></svg>
            </div>
            <div>
              <h4 className="text-[13px] font-bold text-[#1a1a1a]">Créditos AI extra</h4>
              <p className="text-[11px] text-[#646462] mt-0.5">Los top-ups se reflejan en el ledger.</p>
            </div>
          </div>
          <button
            type="button"
            disabled={isSaving || !orgId}
            onClick={buyCredits}
            className={`px-4 h-9 rounded-full text-[13px] font-semibold ${
              isSaving || !orgId
                ? 'bg-[#e9eae6] text-[#646462] cursor-not-allowed'
                : 'bg-[#1a1a1a] text-white hover:bg-black'
            }`}
          >
            {isSaving ? 'Comprando…' : 'Comprar 5,000 créditos (€79)'}
          </button>
        </div>
      </Section>
    </div>
  );
}

// ── Main UpgradeV2 component ─────────────────────────────────────────────────
export default function UpgradeV2() {
  const [activeTab, setActiveTab] = useState<UpgradeTab>('plans');
  const [refreshKey, setRefreshKey] = useState(0);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const { data: workspace, loading: wsLoading, error: wsError } = useApi(
    workspacesApi.currentContext,
    [refreshKey],
  );
  const orgId = workspace?.org_id;
  const { data: subscription, loading: subLoading } = useApi(
    () => orgId ? billingApi.subscription(orgId) : Promise.resolve(null),
    [orgId, refreshKey],
    null,
  );

  const currentPlanKey = String(subscription?.plan_id || workspace?.plan_id || 'starter').toLowerCase();
  const loading = wsLoading || subLoading;

  function showToast(msg: string, type: 'success' | 'error') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }
  function refreshAll() {
    setRefreshKey(k => k + 1);
  }

  return (
    <div className="flex flex-1 min-w-0 h-full overflow-hidden relative bg-[#fbfbfa]">
      <UpgradeSidebar activeTab={activeTab} onTabChange={setActiveTab} planLabel={currentPlanKey} />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex items-center justify-between px-8 py-5 h-16 border-b border-[#e9eae6] bg-white flex-shrink-0">
          <div>
            <h1 className="text-[20px] font-semibold tracking-[-0.4px] text-[#1a1a1a]">
              {activeTab === 'plans'   && 'Planes y precios'}
              {activeTab === 'credits' && 'Créditos AI'}
              {activeTab === 'seats'   && 'Puestos'}
              {activeTab === 'billing' && 'Facturación'}
              {activeTab === 'usage'   && 'Uso'}
            </h1>
            <p className="text-[12px] text-[#646462] mt-0.5">
              {activeTab === 'plans'   && 'Compara planes y cambia tu suscripción.'}
              {activeTab === 'credits' && 'Compra créditos extra y configura el uso flexible.'}
              {activeTab === 'seats'   && 'Añade puestos para nuevos miembros del equipo.'}
              {activeTab === 'billing' && 'Resumen de facturación y método de pago.'}
              {activeTab === 'usage'   && 'Consumo de créditos y puestos del ciclo actual.'}
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-8 py-6">
          {wsError && (
            <div className="mb-4 px-4 py-3 rounded-xl border border-red-200 bg-red-50 text-[13px] text-red-700">
              No se pudo cargar el workspace: {String(wsError)}
            </div>
          )}

          {activeTab === 'plans' && (
            <PlansPanel orgId={orgId} subscription={subscription} currentPlanKey={currentPlanKey} refreshAll={refreshAll} onAction={showToast} />
          )}
          {activeTab === 'credits' && (
            <CreditsPanel orgId={orgId} subscription={subscription} workspace={workspace} refreshAll={refreshAll} onAction={showToast} />
          )}
          {activeTab === 'seats' && (
            <SeatsPanel orgId={orgId} subscription={subscription} refreshAll={refreshAll} onAction={showToast} />
          )}
          {activeTab === 'billing' && (
            <BillingPanel orgId={orgId} subscription={subscription} />
          )}
          {activeTab === 'usage' && (
            <UsagePanel orgId={orgId} subscription={subscription} workspace={workspace} refreshAll={refreshAll} onAction={showToast} />
          )}
        </div>
      </div>

      {loading && (
        <div className="absolute top-4 right-4 bg-white border border-[#e9eae6] rounded-lg px-3 py-2 text-[12px] text-[#646462] shadow-sm">
          Cargando…
        </div>
      )}
      {toast && (
        <div className={`absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full text-[13px] font-semibold shadow-lg ${
          toast.type === 'success' ? 'bg-[#1a1a1a] text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
