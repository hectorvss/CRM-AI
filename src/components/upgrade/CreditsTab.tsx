import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useApi } from '../../api/hooks';
import { billingApi, workspacesApi } from '../../api/client';

function parseSettings(settings: any) {
  if (!settings) return {};
  if (typeof settings === 'string') {
    try {
      return JSON.parse(settings);
    } catch {
      return {};
    }
  }
  return settings;
}

export default function CreditsTab() {
  const { data: workspace } = useApi(workspacesApi.currentContext);
  const orgId = workspace?.org_id;
  const { data: subscription, refetch: refetchSubscription } = useApi(() => (orgId ? billingApi.subscription(orgId) : Promise.resolve(null)), [orgId], null);
  const [isFlexibleUsageExpanded, setIsFlexibleUsageExpanded] = useState(false);
  const [isFlexibleUsageEnabled, setIsFlexibleUsageEnabled] = useState(false);
  const [spendCap, setSpendCap] = useState('100');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  // Use the ai_credits_* columns (Option A / Cluster I schema).
  // Fall back gracefully when the subscription row is still loading.
  const includedCredits = subscription?.ai_credits_included ?? subscription?.credits_included ?? 0;
  const usedCredits = subscription?.ai_credits_used_period ?? subscription?.credits_used ?? 0;
  const topupBalance = subscription?.ai_credits_topup_balance ?? 0;
  const remainingCredits = Math.max(includedCredits - usedCredits, 0) + topupBalance;
  const percentUsed = includedCredits > 0 ? Math.min(100, Math.round((usedCredits / includedCredits) * 100)) : 0;
  const workspaceSettings = useMemo(() => parseSettings(workspace?.settings), [workspace?.settings]);

  useEffect(() => {
    setSpendCap(String(workspaceSettings.billing?.monthlyBudgetCap ?? 100));
    setIsFlexibleUsageEnabled(workspaceSettings.billing?.flexibleUsageEnabled ?? false);
  }, [workspaceSettings]);

  const buyPack = async (credits: number, amountCents: number) => {
    if (!orgId) return;
    setIsSaving(true);
    setStatusMessage(null);
    try {
      await billingApi.topUp(orgId, { type: 'credits', quantity: credits, amount_cents: amountCents });
      setStatusMessage(`Purchased ${credits.toLocaleString()} credits.`);
      refetchSubscription();
    } catch (error: any) {
      setStatusMessage(error?.message || 'Unable to buy credits.');
    } finally {
      setIsSaving(false);
    }
  };

  const creditPacks = [
    { 
      credits: '5,000', 
      price: 79,
      models: ['GPT-4o mini', 'Claude 3 Haiku', 'Gemini 1.5 Flash'],
      compute: 'Up to 5M tokens / ~10k automated tasks'
    },
    { 
      credits: '20,000', 
      price: 249, 
      popular: true,
      models: ['GPT-4o', 'Claude 3.5 Sonnet', 'Gemini 1.5 Pro'],
      compute: 'Up to 20M tokens / ~40k automated tasks'
    },
    { 
      credits: '50,000', 
      price: 549,
      models: ['All models + Custom fine-tuned models'],
      compute: 'Up to 50M tokens / ~100k automated tasks'
    },
  ];

  return (
    <div className="space-y-8">
      {statusMessage && (
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/30 dark:bg-emerald-900/15 dark:text-emerald-300">
          {statusMessage}
        </div>
      )}

      {/* Current Credits */}
      <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">AI Credits Overview</h2>
          <span className="material-symbols-outlined text-gray-400">auto_awesome</span>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-3 gap-6 mb-6">
            <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Included Monthly Credits</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{includedCredits > 0 ? includedCredits.toLocaleString() : '—'}</p>
              <p className="text-[10px] text-gray-400 mt-1">
                {subscription?.ai_credits_period_end
                  ? `Resets ${new Date(subscription.ai_credits_period_end).toLocaleDateString()}`
                  : 'Per billing period'}
              </p>
            </div>
            <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Used Credits</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{usedCredits.toLocaleString()}</p>
              <p className="text-[10px] text-gray-400 mt-1">This billing cycle</p>
            </div>
            <div className="p-4 rounded-xl bg-indigo-50/50 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-800/30">
              <p className="text-xs text-indigo-600 dark:text-indigo-400 mb-1 font-medium">Available Now</p>
              <p className="text-2xl font-bold text-indigo-700 dark:text-indigo-300">{remainingCredits.toLocaleString()}</p>
              <p className="text-[10px] text-indigo-500/70 mt-1">
                {topupBalance > 0 ? `Incl. ${topupBalance.toLocaleString()} top-up` : 'Included + top-up'}
              </p>
            </div>
          </div>

          {/* Usage progress bar */}
          {includedCredits > 0 && (
            <div className="mb-6">
              <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1.5">
                <span>{usedCredits.toLocaleString()} of {includedCredits.toLocaleString()} included credits used</span>
                <span className={percentUsed >= 100 ? 'text-red-600 font-semibold' : percentUsed >= 80 ? 'text-yellow-600 font-semibold' : ''}>{percentUsed}%</span>
              </div>
              <div className="h-2.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    percentUsed >= 100 ? 'bg-red-500' : percentUsed >= 80 ? 'bg-yellow-500' : 'bg-indigo-500'
                  }`}
                  style={{ width: `${Math.min(100, percentUsed)}%` }}
                />
              </div>
              {topupBalance > 0 && (
                <p className="text-[10px] text-gray-400 mt-1.5">+ {topupBalance.toLocaleString()} top-up credits queued after included credits run out</p>
              )}
            </div>
          )}

          {isFlexibleUsageEnabled && (
            <div className="grid grid-cols-3 gap-6 mb-6 pt-6 border-t border-gray-100 dark:border-gray-800">
              <div className="p-4 rounded-xl bg-blue-50/50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-800/30">
                <div className="flex justify-between items-start mb-1">
                  <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">Extra Usage This Cycle</p>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">Active</span>
                </div>
                <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">0</p>
                <p className="text-[10px] text-blue-500/70 mt-1">Credits beyond included plan</p>
              </div>
              <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Estimated Overage</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">€0.00</p>
                <p className="text-[10px] text-gray-400 mt-1">To be billed next cycle</p>
              </div>
              <div className="p-4 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-700">
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Cap Remaining</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">€{spendCap}.00</p>
                <p className="text-[10px] text-gray-400 mt-1">Of €{spendCap}.00 monthly limit</p>
              </div>
            </div>
          )}

          <div className="bg-blue-50 dark:bg-blue-900/10 rounded-xl p-4 border border-blue-100 dark:border-blue-800/30 flex gap-3">
            <span className="material-symbols-outlined text-blue-500 text-xl">info</span>
            <div>
              <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-300 mb-1">How AI credits work</h4>
              <div className="text-xs text-blue-700 dark:text-blue-400 leading-relaxed">
                <p>AI credits power the intelligence in your workspace. Examples of usage include:</p>
                <ul className="list-disc list-inside mt-1 ml-1 space-y-0.5">
                  <li>Simple classification & tagging</li>
                  <li>Conversation summaries</li>
                  <li>Response recommendations</li>
                  <li>Complex workflow reasoning</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Buy Extra Credits */}
      <section className="bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Buy Extra AI Credits</h2>
          <span className="material-symbols-outlined text-gray-400">add_shopping_cart</span>
        </div>
        <div className="p-6">
          <p className="text-sm text-gray-600 dark:text-gray-300 mb-6">
            Top-up credits are available to all plans and are consumed only after your included monthly credits are used. They remain available as long as your subscription is active.
          </p>

          <div className="flex flex-col gap-4">
            {creditPacks.map((pack, idx) => (
              <div key={idx} className={`relative p-6 rounded-xl border flex flex-row items-center justify-between ${pack.popular ? 'border-indigo-500 shadow-md bg-indigo-50/5' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50'}`}>
                {pack.popular && (
                  <div className="absolute -top-3 left-6">
                    <span className="bg-indigo-500 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wide">Most Popular</span>
                  </div>
                )}
                
                {/* Left: Icon & Credits */}
                <div className="flex items-center gap-4 w-1/4">
                  <div className="w-12 h-12 rounded-full bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center flex-shrink-0">
                    <span className="material-symbols-outlined text-2xl text-indigo-500">toll</span>
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-gray-900 dark:text-white">{pack.credits}</h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">AI Credits</p>
                  </div>
                </div>

                {/* Middle: Bullet points */}
                <div className="flex-1 px-6 border-l border-r border-gray-100 dark:border-gray-800 mx-6">
                  <ul className="space-y-2">
                    <li className="flex items-start text-sm text-gray-600 dark:text-gray-300">
                      <span className="material-symbols-outlined text-green-500 text-base mr-2 mt-0.5">check_circle</span>
                      <div>
                        <span className="font-medium text-gray-900 dark:text-white mr-1">Models:</span> 
                        {pack.models.join(', ')}
                      </div>
                    </li>
                    <li className="flex items-start text-sm text-gray-600 dark:text-gray-300">
                      <span className="material-symbols-outlined text-green-500 text-base mr-2 mt-0.5">check_circle</span>
                      <div>
                        <span className="font-medium text-gray-900 dark:text-white mr-1">Capacity:</span> 
                        {pack.compute}
                      </div>
                    </li>
                  </ul>
                </div>

                {/* Right: Price & Button */}
                <div className="flex flex-col items-end w-1/4">
                  <div className="text-3xl font-bold text-gray-900 dark:text-white mb-3">€{pack.price}</div>
                  <button
                    type="button"
                    disabled={isSaving}
                    onClick={() => void buyPack(Number(String(pack.credits).replace(/,/g, '')), pack.price * 100)}
                    className={`w-full py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                    pack.popular
                      ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md'
                      : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700 shadow-sm'
                  }`}>
                    Buy Pack
                  </button>
                </div>
              </div>
            ))}

            {/* Flexible Usage Card */}
            <div className={`relative rounded-xl border flex flex-col border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 overflow-hidden`}>
              <div className="p-6 flex flex-row items-center justify-between">
                {/* Left: Icon & Title */}
                <div className="flex items-center gap-4 w-1/4">
                  <div className="w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0">
                    <span className="material-symbols-outlined text-2xl text-blue-500">data_usage</span>
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white">Flexible Usage</h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-tight">Pay only for extra AI credits you actually use after your included monthly capacity is consumed.</p>
                  </div>
                </div>

                {/* Middle: Bullet points */}
                <div className="flex-1 px-6 border-l border-r border-gray-100 dark:border-gray-800 mx-6">
                  <ul className="space-y-2">
                    <li className="flex items-start text-sm text-gray-600 dark:text-gray-300">
                      <span className="material-symbols-outlined text-blue-500 text-base mr-2 mt-0.5">check_circle</span>
                      <div>Starts only after included monthly credits are fully used</div>
                    </li>
                    <li className="flex items-start text-sm text-gray-600 dark:text-gray-300">
                      <span className="material-symbols-outlined text-blue-500 text-base mr-2 mt-0.5">check_circle</span>
                      <div>Billed monthly based on actual extra usage</div>
                    </li>
                    <li className="flex items-start text-sm text-gray-600 dark:text-gray-300">
                      <span className="material-symbols-outlined text-blue-500 text-base mr-2 mt-0.5">check_circle</span>
                      <div>Monthly spend cap protection & usage alerts</div>
                    </li>
                  </ul>
                </div>

                {/* Right: Price & Button */}
                <div className="flex flex-col items-end w-1/4">
                  <div className="text-lg font-bold text-gray-900 dark:text-white mb-1">€19 / 1,000 credits</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mb-3">Billed monthly by extra usage</div>
                  <button 
                    onClick={() => setIsFlexibleUsageExpanded(!isFlexibleUsageExpanded)}
                    className={`w-full py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
                      isFlexibleUsageEnabled 
                        ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800 hover:bg-green-100 dark:hover:bg-green-900/40'
                        : 'bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700 shadow-sm'
                    }`}
                  >
                    {isFlexibleUsageEnabled ? 'Manage Flexible Usage' : 'Enable Flexible Usage'}
                    <span className={`material-symbols-outlined text-lg transition-transform ${isFlexibleUsageExpanded ? 'rotate-180' : ''}`}>expand_more</span>
                  </button>
                </div>
              </div>

              {/* Expandable Settings Section */}
              <AnimatePresence>
                {isFlexibleUsageExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="border-t border-gray-100 dark:border-gray-800 bg-gray-50/30 dark:bg-gray-900/10 overflow-hidden"
                  >
                    <div className="p-6 space-y-6">
                      <div className="bg-white dark:bg-gray-800/50 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                        <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
                          Extra usage starts only after your included monthly credits are fully consumed. You will be billed monthly based on actual extra usage at <strong className="font-semibold text-gray-900 dark:text-white">€19 per 1,000 credits</strong>. Usage stops automatically when your cap is reached.
                        </p>
                      </div>

                      <div className="flex flex-col gap-8">
                        <div>
                          <div>
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">A. Monthly Spend Cap</h3>
                            <div className="grid grid-cols-4 gap-2 mb-2">
                              {['50', '100', '250', '500'].map(val => (
                                <button 
                                  key={val}
                                  onClick={() => setSpendCap(val)}
                                  className={`py-2 rounded-lg text-sm font-medium border transition-colors ${spendCap === val ? 'bg-indigo-50 border-indigo-500 text-indigo-700 dark:bg-indigo-900/30 dark:border-indigo-500 dark:text-indigo-300' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700'}`}
                                >
                                  €{val}
                                </button>
                              ))}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-gray-500 dark:text-gray-400">Custom: €</span>
                              <input 
                                type="number" 
                                value={spendCap}
                                onChange={(e) => setSpendCap(e.target.value)}
                                className="flex-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                              />
                            </div>
                          </div>
                        </div>

                        <div>
                          <div>
                            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">B. Alerts & Behavior</h3>
                            <div className="space-y-3">
                              <label className="flex items-center gap-3">
                                <input type="checkbox" defaultChecked className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                                <span className="text-sm text-gray-700 dark:text-gray-300">Notify me at 80% of monthly cap</span>
                              </label>
                              <label className="flex items-center gap-3">
                                <input type="checkbox" defaultChecked className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" />
                                <span className="text-sm text-gray-700 dark:text-gray-300">Notify me at 100% of monthly cap</span>
                              </label>
                            </div>
                            <div className="mt-4 p-3 border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 rounded-lg flex items-start gap-3">
                              <span className="material-symbols-outlined text-gray-500 text-lg mt-0.5">block</span>
                              <div>
                                <p className="text-sm font-medium text-gray-900 dark:text-white">Stop extra usage at cap</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">When your spend cap is reached, AI features will be paused until the next billing cycle or until you increase the cap.</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="pt-6 border-t border-gray-100 dark:border-gray-800 flex justify-between items-center">
                        {isFlexibleUsageEnabled ? (
                          <button 
                            onClick={() => { setIsFlexibleUsageEnabled(false); setIsFlexibleUsageExpanded(false); }}
                            className="text-sm font-medium text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300"
                          >
                            Disable Flexible Usage
                          </button>
                        ) : (
                          <div></div>
                        )}
                        <div className="flex gap-3">
                          <button onClick={() => setIsFlexibleUsageExpanded(false)} className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                            Cancel
                          </button>
                          <button 
                            onClick={() => { setIsFlexibleUsageEnabled(true); setIsFlexibleUsageExpanded(false); }}
                            className="px-4 py-2 rounded-lg text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md transition-colors"
                          >
                            {isFlexibleUsageEnabled ? 'Save Changes' : 'Activate Flexible Usage'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
