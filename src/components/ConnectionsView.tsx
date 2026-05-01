import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { connectorsApi } from '../api/client';
import { useApi } from '../api/hooks';
import { connectionCategories } from '../connectionsData';
import { MinimalButton, MinimalCard, MinimalPill } from './MinimalCategoryShell';

const architectureLanes = [
  {
    title: 'Intake',
    subtitle: 'Channel and webhook ingestion',
    nodes: ['Channel Ingest', 'Canonicalizer', 'Intent Router'],
  },
  {
    title: 'Planning',
    subtitle: 'Routing, truth and decisioning',
    nodes: ['Supervisor', 'Knowledge Retriever', 'Case Resolution Planner', 'Approval Gatekeeper'],
  },
  {
    title: 'Execution',
    subtitle: 'Writebacks and workflow progression',
    nodes: ['Resolution Executor', 'Workflow Runtime Agent', 'Audit & Observability Agent'],
  },
  {
    title: 'Communication',
    subtitle: 'Customer-safe messaging and helpdesk sync',
    nodes: ['Customer Communication Agent', 'Composer + Translator', 'Helpdesk Agent'],
  },
];

function normalizeConnectorStatus(connector: any) {
  const raw = String(
    connector?.status ||
      connector?.health ||
      connector?.sync_status ||
      (connector?.is_enabled ? 'connected' : 'disabled'),
  ).toLowerCase();

  if (['connected', 'healthy', 'active', 'ok', 'enabled'].includes(raw)) return 'connected';
  if (['error', 'failed', 'degraded', 'blocked'].includes(raw)) return 'attention';
  return 'disabled';
}

function findConnectorForAgent(agentName: string, connectors: any[]) {
  const normalized = agentName.toLowerCase();
  return connectors.find((connector: any) => {
    const haystack = [
      connector?.name,
      connector?.system,
      connector?.provider,
      connector?.slug,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    if (normalized.includes('shopify')) return haystack.includes('shopify');
    if (normalized.includes('stripe')) return haystack.includes('stripe');
    if (normalized.includes('recharge')) return haystack.includes('recharge');
    if (normalized.includes('returns')) return haystack.includes('return');
    if (normalized.includes('helpdesk')) return haystack.includes('zendesk') || haystack.includes('gorgias') || haystack.includes('intercom');
    if (normalized.includes('logistics')) return haystack.includes('ship') || haystack.includes('logistics') || haystack.includes('easypost');
    if (normalized.includes('oms') || normalized.includes('erp')) return haystack.includes('erp') || haystack.includes('oms') || haystack.includes('netsuite');
    if (normalized.includes('crm')) return haystack.includes('crm') || haystack.includes('hubspot') || haystack.includes('salesforce');
    return false;
  });
}

function ArchitectureCard({
  connectorCount,
  connectedCount,
}: {
  connectorCount: number;
  connectedCount: number;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <MinimalCard
      title="System Architecture"
      subtitle="How the global agent flow moves from intake to execution and customer communication."
      icon="account_tree"
      action={
        <button
          type="button"
          onClick={() => setIsExpanded((current) => !current)}
          className="inline-flex items-center gap-2 rounded-full border border-black/10 px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-black/5 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/5"
        >
          <span>{isExpanded ? 'Hide flow' : 'Show flow'}</span>
          <span className={`material-symbols-outlined text-[18px] transition-transform ${isExpanded ? 'rotate-180' : ''}`}>expand_more</span>
        </button>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-[18px] border border-black/5 px-4 py-3 dark:border-white/10">
            <p className="text-[11px] uppercase tracking-[0.18em] text-gray-400">Connected systems</p>
            <p className="mt-2 text-2xl font-semibold text-gray-950 dark:text-white">{connectedCount}/{connectorCount || 0}</p>
          </div>
          <div className="rounded-[18px] border border-black/5 px-4 py-3 dark:border-white/10">
            <p className="text-[11px] uppercase tracking-[0.18em] text-gray-400">Always-on gates</p>
            <p className="mt-2 text-2xl font-semibold text-gray-950 dark:text-white">Policy + Approval</p>
          </div>
          <div className="rounded-[18px] border border-black/5 px-4 py-3 dark:border-white/10">
            <p className="text-[11px] uppercase tracking-[0.18em] text-gray-400">Final outcome</p>
            <p className="mt-2 text-2xl font-semibold text-gray-950 dark:text-white">Writeback + Audit</p>
          </div>
        </div>

        <AnimatePresence initial={false}>
          {isExpanded ? (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="space-y-4 rounded-[24px] border border-black/5 bg-black/[0.02] p-5 dark:border-white/10 dark:bg-white/[0.03]">
                {architectureLanes.map((lane, laneIndex) => (
                  <div key={lane.title} className="space-y-3">
                    <div className="flex items-center gap-3">
                      <MinimalPill tone="active">{lane.title}</MinimalPill>
                      <span className="text-xs text-gray-500 dark:text-gray-400">{lane.subtitle}</span>
                    </div>
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-[repeat(3,minmax(0,1fr))] xl:grid-cols-[repeat(4,minmax(0,1fr))]">
                      {lane.nodes.map((node) => (
                        <div key={node} className="rounded-[18px] border border-black/5 bg-white px-4 py-4 dark:border-white/10 dark:bg-[#171717]">
                          <p className="text-sm font-semibold text-gray-950 dark:text-white">{node}</p>
                          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Participates in the canonical flow.</p>
                        </div>
                      ))}
                    </div>
                    {laneIndex < architectureLanes.length - 1 ? (
                      <div className="flex justify-center py-1">
                        <span className="material-symbols-outlined text-[18px] text-gray-400">south</span>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </MinimalCard>
  );
}

export default function ConnectionsView() {
  const [selectedAgent, setSelectedAgent] = useState<string>('Shopify Agent');
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'All' | 'Needs setup' | 'Enabled' | 'Disabled'>('All');
  const { data: connectors } = useApi(connectorsApi.list, [], []);

  const liveConnectors = Array.isArray(connectors) ? connectors : [];
  const connectedCount = liveConnectors.filter((connector: any) => normalizeConnectorStatus(connector) === 'connected').length;

  const filteredCategories = useMemo(() => {
    return connectionCategories
      .map((category) => {
        const agents = category.agents.filter((agent) => {
          const connector = findConnectorForAgent(agent.name, liveConnectors);
          const liveStatus = connector ? normalizeConnectorStatus(connector) : agent.active ? 'connected' : 'disabled';
          const matchesSearch = !search || [agent.name, agent.role, agent.summary].join(' ').toLowerCase().includes(search.toLowerCase());
          const matchesFilter =
            filter === 'All' ||
            (filter === 'Enabled' && liveStatus === 'connected') ||
            (filter === 'Disabled' && liveStatus === 'disabled') ||
            (filter === 'Needs setup' && liveStatus === 'attention');
          return matchesSearch && matchesFilter;
        });
        return { ...category, agents };
      })
      .filter((category) => category.agents.length > 0);
  }, [filter, liveConnectors, search]);

  return (
    <motion.div
      key="connections"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex gap-6 h-full"
    >
      <div className="flex-1 space-y-8 pb-12 w-full">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-gray-400 text-lg">search</span>
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search connections..."
              className="w-full rounded-[18px] border border-black/5 bg-white py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 dark:border-white/10 dark:bg-[#171717]"
            />
          </div>
          <div className="flex rounded-[18px] border border-black/5 bg-black/[0.02] p-1 dark:border-white/10 dark:bg-white/[0.03]">
            {(['All', 'Needs setup', 'Enabled', 'Disabled'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setFilter(option)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${filter === option ? 'bg-black text-white dark:bg-white dark:text-black' : 'text-gray-600 hover:bg-black/5 dark:text-gray-300 dark:hover:bg-white/5'}`}
              >
                {option}
              </button>
            ))}
          </div>
        </div>

        <ArchitectureCard connectorCount={liveConnectors.length} connectedCount={connectedCount} />

        {filteredCategories.map((category, catIdx) => (
          <div key={catIdx} className="space-y-4">
            <h3 className="px-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">{category.category}</h3>
            <div className="space-y-3">
              {category.agents.map((agent, agentIdx) => {
                const connector = findConnectorForAgent(agent.name, liveConnectors);
                const liveStatus = connector ? normalizeConnectorStatus(connector) : agent.active ? 'connected' : 'disabled';
                return (
                  <div
                    key={agentIdx}
                    onClick={() => {
                      setSelectedAgent(agent.name);
                      setExpandedAgent(expandedAgent === agent.name ? null : agent.name);
                    }}
                    className={`cursor-pointer rounded-[24px] border bg-white transition-all dark:bg-[#171717] ${
                      selectedAgent === agent.name
                        ? 'border-violet-500/40 shadow-sm'
                        : 'border-black/5 hover:border-black/10 dark:border-white/10 dark:hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-4 p-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-black/5 text-gray-700 dark:bg-white/5 dark:text-gray-200">
                            <span className="material-symbols-outlined text-[18px]">{agent.icon}</span>
                          </div>
                          <div className="min-w-0">
                            <h4 className="truncate text-sm font-semibold text-gray-950 dark:text-white">{agent.name}</h4>
                            <p className="truncate text-xs text-gray-500 dark:text-gray-400">{agent.role}</p>
                          </div>
                        </div>
                        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">{agent.summary}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <MinimalPill tone={liveStatus === 'connected' ? 'active' : 'neutral'}>
                          {liveStatus === 'connected' ? 'Connected' : liveStatus === 'attention' ? 'Needs setup' : 'Disabled'}
                        </MinimalPill>
                        <span className={`material-symbols-outlined text-gray-400 transition-transform ${expandedAgent === agent.name ? 'rotate-180' : ''}`}>expand_more</span>
                      </div>
                    </div>

                    <AnimatePresence initial={false}>
                      {expandedAgent === agent.name ? (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden border-t border-black/5 dark:border-white/10"
                        >
                          <div className="grid gap-6 bg-black/[0.02] p-5 dark:bg-white/[0.03] lg:grid-cols-[1.05fr_1fr]">
                            <div className="space-y-4">
                              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Operational Map</p>
                              <div className="space-y-3">
                                <div className="rounded-[18px] border border-black/5 bg-white px-4 py-4 dark:border-white/10 dark:bg-[#171717]">
                                  <p className="text-xs uppercase tracking-[0.18em] text-gray-400">Receives from</p>
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    {(agent.receivesFrom || []).map((source, i) => (
                                      <span key={i}>
                                        <MinimalPill tone="neutral">{source}</MinimalPill>
                                      </span>
                                    ))}
                                  </div>
                                </div>
                                <div className="rounded-[18px] border border-black/5 bg-white px-4 py-4 dark:border-white/10 dark:bg-[#171717]">
                                  <p className="text-xs uppercase tracking-[0.18em] text-gray-400">Reports to</p>
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    {(agent.reportsTo || []).map((target, i) => (
                                      <span key={i}>
                                        <MinimalPill tone="neutral">{target}</MinimalPill>
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="space-y-4">
                              <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Execution Steps</p>
                              <div className="space-y-3">
                                {(agent.steps || []).map((step, i) => (
                                  <div key={i} className="rounded-[18px] border border-black/5 bg-white px-4 py-4 dark:border-white/10 dark:bg-[#171717]">
                                    <div className="flex items-center justify-between gap-3">
                                      <p className="text-sm font-semibold text-gray-950 dark:text-white">{step.title}</p>
                                      <MinimalPill tone="neutral">{step.mode}</MinimalPill>
                                    </div>
                                    <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">{step.desc}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {!filteredCategories.length ? (
          <MinimalCard title="No matching connections" subtitle="Try a different search or filter." icon="filter_alt_off">
            <div className="flex justify-start">
              <MinimalButton variant="outline" onClick={() => {
                setSearch('');
                setFilter('All');
              }}>
                Clear filters
              </MinimalButton>
            </div>
          </MinimalCard>
        ) : null}
      </div>
    </motion.div>
  );
}
