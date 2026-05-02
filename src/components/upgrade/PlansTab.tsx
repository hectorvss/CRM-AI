import React, { useCallback, useState } from 'react';
import { useApi } from '../../api/hooks';
import { billingApi, workspacesApi } from '../../api/client';

export default function PlansTab() {
  const { data: workspace, refetch: refetchWorkspace } = useApi(workspacesApi.currentContext);
  const orgId = workspace?.org_id;
  const { data: subscription, refetch: refetchSubscription } = useApi(() => (orgId ? billingApi.subscription(orgId) : Promise.resolve(null)), [orgId], null);
  const [isAnnual, setIsAnnual] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const currentPlanKey = String(subscription?.plan_id || workspace?.plan_id || 'starter').toLowerCase();

  // Pricing structure (must match landing & Paywall exactly):
  //   originalPrice = MSRP (always strikethrough)
  //   monthlyPrice  = discounted price when billing monthly
  //   annualPrice   = further discounted price when billing annually
  const plans = [
    {
      name: 'Starter',
      originalPrice: 149,
      monthlyPrice: 49,
      annualPrice: 42,
      bestFor: 'For small teams getting started with AI-assisted support operations',
      cta: 'Current Plan',
      isCurrent: currentPlanKey === 'starter',
      capacityExplanation: '5,000 AI credits per month. Equivalent to resolving ~500 standard cases or drafting ~2,500 replies.',
      models: ['GPT-4o mini', 'Claude 3.5 Haiku', 'Gemini 1.5 Flash'],
      bullets: [
        '5,000 AI credits per month',
        '3 seats included (€25/extra seat)',
        'Core support and ops workflows',
        'Standard email & chat integrations',
        'Basic reporting & analytics',
      ],
    },
    {
      name: 'Growth',
      originalPrice: 399,
      monthlyPrice: 129,
      annualPrice: 109,
      bestFor: 'For growing support and ops teams using AI every day',
      cta: 'Upgrade to Growth',
      isRecommended: true,
      isCurrent: currentPlanKey === 'growth',
      capacityExplanation: '20,000 AI credits per month. Equivalent to resolving ~2,000 complex cases or automating full workflows.',
      models: ['GPT-4o', 'Claude 3.5 Sonnet', 'Gemini 1.5 Pro'],
      bullets: [
        '20,000 AI credits per month',
        '8 seats included (€22/extra seat)',
        'Advanced multi-step workflows',
        'Custom API integrations',
        'Priority email support',
      ],
    },
    {
      name: 'Scale',
      originalPrice: 899,
      monthlyPrice: 299,
      annualPrice: 254,
      bestFor: 'For advanced teams managing high-volume, multi-workflow operations',
      cta: 'Upgrade to Scale',
      isCurrent: currentPlanKey === 'scale',
      capacityExplanation: '60,000 AI credits per month. Equivalent to resolving ~6,000 complex cases across multiple languages and systems.',
      models: ['GPT-4o', 'Claude 3.5 Sonnet', 'Gemini 1.5 Pro', 'Custom Fine-tuned Models'],
      bullets: [
        '60,000 AI credits per month',
        '20 seats included (€19/extra seat)',
        'Unlimited custom workflows',
        'Dedicated success manager',
        'Custom reporting dashboards',
      ],
    },
    {
      name: 'Business',
      originalPrice: 'Custom',
      monthlyPrice: 'Custom',
      annualPrice: 'Custom',
      bestFor: 'For organizations with custom capacity, governance, and enterprise needs',
        cta: 'Talk to Sales',
        isCurrent: currentPlanKey === 'business',
      capacityExplanation: 'Custom AI credit allocation tailored to your specific enterprise volume and security requirements.',
      models: ['All Premium Models', 'Bring Your Own Model (BYOM)', 'On-premise deployment options'],
      bullets: [
        'Custom seat allocation',
        'Enterprise-grade security & compliance',
        'Custom SLA & uptime guarantees',
        'Tailored onboarding & training'
      ]
    }
  ];

  const applyPlan = useCallback(async (planId: string) => {
    if (!orgId) return;
    setIsSaving(true);
    setStatusMessage(null);
    try {
      await billingApi.changePlan(orgId, planId);
      setStatusMessage(`Plan changed to ${planId}.`);
      refetchWorkspace();
      refetchSubscription();
    } catch (error: any) {
      setStatusMessage(error?.message || 'Unable to update plan.');
    } finally {
      setIsSaving(false);
    }
  }, [orgId, refetchSubscription, refetchWorkspace]);

  return (
    <div className="space-y-8">
      {statusMessage && (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-900/15 dark:text-emerald-300">
          {statusMessage}
        </div>
      )}

      {/* Current Plan State */}
      <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Current Plan</h2>
          <span className="material-symbols-outlined text-gray-400">verified</span>
        </div>
        <div className="p-6 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h3 className="text-lg font-bold text-gray-900 dark:text-white capitalize">{currentPlanKey.replace(/_/g, ' ')} plan</h3>
              <span className="px-2 py-0.5 rounded text-[10px] font-medium border bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 border-green-100 dark:border-green-800/30">Active</span>
            </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Includes {(subscription?.ai_credits_included ?? subscription?.credits_included ?? 5000).toLocaleString()} AI credits and {subscription?.seats_included ?? 3} seats per month.
              </p>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setStatusMessage('Use the Seats tab to add seats with a saved change.')} className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-bold text-gray-700 dark:text-gray-300 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-all">Add Seats</button>
            <button type="button" onClick={() => setStatusMessage('Use the Credits tab to buy credit packs with a saved change.')} className="px-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-bold text-gray-700 dark:text-gray-300 shadow-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-all">Buy Credits</button>
          </div>
        </div>
      </section>

      {/* Plans */}
      <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Available Plans</h2>
          <div className="flex items-center bg-gray-100 dark:bg-gray-800 p-1 rounded-lg">
            <button 
              onClick={() => setIsAnnual(false)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${!isAnnual ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
            >
              Monthly
            </button>
            <button 
              onClick={() => setIsAnnual(true)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 ${isAnnual ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
            >
              Annual <span className="text-[9px] font-bold text-green-600 bg-green-100 px-1.5 py-0.5 rounded">15% OFF</span>
            </button>
          </div>
        </div>
        
        <div className="p-6">
          <div className="mb-6">
            <p className="text-sm text-gray-600 dark:text-gray-300">All plans include the core platform. What changes mainly is AI capacity, seat capacity, and scale.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {plans.map((plan, idx) => (
              <div key={idx} className={`relative flex flex-col p-6 rounded-2xl border ${plan.isRecommended ? 'border-indigo-500 shadow-md bg-indigo-50/10' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50'}`}>
                {plan.isRecommended && (
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                    <span className="bg-indigo-500 text-white text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-wide shadow-sm">Recommended</span>
                  </div>
                )}
                
                {/* Top Section: Name & Best For */}
                <div className="mb-4">
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white">{plan.name}</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 min-h-[40px]">{plan.bestFor}</p>
                </div>
                
                {/* Pricing */}
                <div className="mb-6">
                  <div className="flex items-baseline gap-1 flex-wrap">
                    {plan.monthlyPrice === 'Custom' ? (
                      <span className="text-3xl font-bold text-gray-900 dark:text-white">Custom</span>
                    ) : (
                      <>
                        {/* Original price — strikethrough always (both monthly and annual are discounted) */}
                        <span className="text-sm font-medium text-gray-400 dark:text-gray-500 line-through mr-1">
                          €{plan.originalPrice}
                        </span>
                        <span className="text-3xl font-bold text-gray-900 dark:text-white">
                          €{isAnnual ? plan.annualPrice : plan.monthlyPrice}
                        </span>
                        <span className="text-sm text-gray-500 dark:text-gray-400">/ mo</span>
                      </>
                    )}
                  </div>
                  {plan.monthlyPrice !== 'Custom' && (
                    <p className="text-xs text-gray-500 mt-1">
                      {isAnnual && typeof plan.annualPrice === 'number'
                        ? `Billed annually (€${plan.annualPrice * 12}/yr)`
                        : 'Billed monthly'}
                    </p>
                  )}
                </div>
                
                {/* Features & Models */}
                <div className="flex-1 flex flex-col">
                  {/* Included Features */}
                  <div className="mb-6">
                    <h4 className="text-sm font-bold text-gray-900 dark:text-white mb-4">Included</h4>
                    <div className="space-y-3">
                      <div className="flex items-start gap-3 text-sm">
                        <span className="material-symbols-outlined text-[16px] text-indigo-500 mt-0.5 flex-shrink-0">check_circle</span>
                        <span className="text-gray-700 dark:text-gray-300 leading-snug text-xs">{plan.capacityExplanation.split('.')[0]}</span>
                      </div>
                      {plan.bullets.map((bullet, i) => (
                        <div key={i} className="flex items-start gap-3 text-sm">
                          <span className="material-symbols-outlined text-[16px] text-indigo-500 mt-0.5 flex-shrink-0">check_circle</span>
                          <span className="text-gray-700 dark:text-gray-300 leading-snug text-xs">{bullet}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* CTA */}
                  <button
                    type="button"
                    onClick={() => plan.isCurrent ? setStatusMessage(`${plan.name} is already active.`) : void applyPlan(String(plan.name).toLowerCase())}
                    disabled={isSaving || plan.isCurrent}
                    className={`w-full py-3 rounded-xl text-sm font-bold transition-all mt-auto disabled:cursor-not-allowed disabled:opacity-50 ${
                    plan.isCurrent 
                      ? 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 cursor-default'
                      : plan.isRecommended
                      ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md'
                      : plan.name === 'Business'
                      ? 'bg-black dark:bg-white text-white dark:text-black hover:opacity-90 shadow-md'
                      : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700 shadow-sm'
                  }`}>
                    {plan.cta}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
