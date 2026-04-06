import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Page } from '../types';
import TreeGraph from './TreeGraph';
import { MOCK_CASES_DATA } from '../data/mockCases';
import { casesApi } from '../api/client';
import { useApi } from '../api/hooks';

type RightTab = 'details' | 'copilot';
type ResolveTab = 'overview' | 'identifiers' | 'policy' | 'execution';

export default function CaseGraph({ onPageChange }: { onPageChange: (page: Page) => void }) {
  const [rightTab, setRightTab] = useState<RightTab>('copilot');
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);
  const [selectedId, setSelectedId] = useState<string>('1');
  const [graphView, setGraphView] = useState<'tree' | 'timeline' | 'resolve'>('tree');
  const [resolutionPath, setResolutionPath] = useState<'ai' | 'manual'>('ai');
  const [resolveTab, setResolveTab] = useState<ResolveTab>('overview');

  // Static fallback list
  const STATIC_CASES = [
    { id: '1', orderId: 'ORD-55210', customerName: 'Sarah Jenkins', summary: 'Refund conflict detected', lastUpdate: '2m ago', badges: ['Conflict', 'High Risk'] },
    { id: '2', orderId: 'ORD-55211', customerName: 'Marcus Chen', summary: 'Damaged item dispute', lastUpdate: '15m ago', badges: ['High Risk'] },
    { id: '3', orderId: 'ORD-55213', customerName: 'Elena Rodriguez', summary: 'Return label created', lastUpdate: '3h ago', badges: ['In Transit'] },
    { id: '4', orderId: 'ORD-55214', customerName: 'James Wilson', summary: 'Return blocked by policy', lastUpdate: '5m ago', badges: ['Blocked', 'Conflict'] },
  ];

  // Fetch cases from API
  const { data: apiCases } = useApi(() => casesApi.list(), [], []);

  const cases = (apiCases && apiCases.length > 0)
    ? apiCases.map((c: any) => ({
        id: c.id,
        orderId: Array.isArray(c.order_ids) && c.order_ids.length > 0 ? c.order_ids[0] : c.case_number,
        customerName: c.customer_name || c.case_number,
        summary: c.ai_diagnosis || c.type?.replace(/_/g, ' ') || 'No summary',
        lastUpdate: c.last_activity_at ? new Date(c.last_activity_at).toLocaleString('en-US', { hour: '2-digit', minute: '2-digit' }) : '-',
        badges: [
          ...(c.has_reconciliation_conflicts ? ['Conflict'] : []),
          ...(c.risk_level === 'high' ? ['High Risk'] : []),
          ...(c.status === 'blocked' ? ['Blocked'] : []),
          ...(c.tags ? (Array.isArray(c.tags) ? c.tags.filter((t: string) => t === 'In Transit') : []) : []),
        ],
      }))
    : STATIC_CASES;

  const currentCase = MOCK_CASES_DATA[selectedId] || MOCK_CASES_DATA['1'];
  const caseData = currentCase.rootData;
  const copilotData = currentCase.copilot;

  return (
    <div className="flex-1 flex flex-col h-full min-w-0 bg-background-light dark:bg-background-dark p-2 pl-0">
      <div className="flex-1 flex flex-col mx-2 my-2 bg-white dark:bg-card-dark overflow-hidden rounded-xl border border-gray-100 dark:border-gray-800 shadow-card">
        {/* Case Graph Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center space-x-4">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Case Graph</h1>
            <div className="flex space-x-1">
              {[
                { id: 'all', label: 'All cases', count: cases.length },
                { id: 'active', label: 'Active', count: cases.length },
                { id: 'resolved', label: 'Resolved', count: 0 },
              ].map(tab => (
                <span 
                  key={tab.id}
                  className={`px-3 py-1 text-sm font-medium rounded-full cursor-pointer transition-colors ${
                    tab.id === 'all' 
                      ? 'bg-black text-white' 
                      : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                  }`}
                >
                  {tab.label} ({tab.count})
                </span>
              ))}
            </div>
          </div>
          <div className="flex items-center space-x-3">
            <div className="flex items-center text-gray-500 text-sm mr-2">
              <span className="w-2 h-2 rounded-full bg-green-500 mr-2"></span>
              Sync Active
            </div>
            <button className="p-2 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
              <span className="material-symbols-outlined">filter_list</span>
            </button>
          </div>
        </div>

        {/* Main Content Area: Three Panes */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Pane: List (Identical to Returns) */}
          <div className="w-80 flex-shrink-0 border-r border-gray-100 dark:border-gray-700 flex flex-col bg-gray-50/30 dark:bg-black/5">
            <div className="overflow-y-auto flex-1 custom-scrollbar p-2 space-y-2">
              {cases.map((c) => (
                <div
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={`p-4 rounded-xl border cursor-pointer group relative transition-all duration-200 ${
                    selectedId === c.id
                      ? `bg-white dark:bg-gray-800 border-secondary shadow-card scale-[1.02] z-10`
                      : 'bg-white dark:bg-card-dark border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700 shadow-sm hover:shadow-card'
                  }`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <div className="flex flex-col">
                      <span className={`font-semibold text-sm ${selectedId === c.id ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'}`}>
                        {c.customerName}
                      </span>
                      <span className="text-xs text-gray-400 font-mono">{c.orderId}</span>
                    </div>
                    <span className="text-xs text-gray-400">{c.lastUpdate}</span>
                  </div>
                  <div className="mb-2">
                    <p className={`text-sm truncate ${selectedId === c.id ? 'text-gray-900 dark:text-gray-100 font-medium' : 'text-gray-600 dark:text-gray-300 font-normal'}`}>
                      {c.summary}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {c.badges.map(badge => (
                      <span key={badge} className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded border ${
                        badge === 'Conflict' || badge === 'High Risk' || badge === 'Blocked'
                          ? 'bg-red-50 text-red-700 border-red-200'
                          : 'bg-blue-50 text-blue-700 border-blue-200'
                      }`}>
                        {badge}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Middle Pane: Tree Graph / Timeline */}
          <div className="flex-1 flex flex-col min-w-0 bg-[#F8F9FA] dark:bg-card-dark overflow-hidden relative">
            <div className="absolute top-4 left-6 z-10">
               <div className="flex items-center bg-white/80 dark:bg-gray-800/80 backdrop-blur-sm p-1 rounded-lg border border-gray-100 dark:border-gray-700 shadow-sm">
                  <button 
                    onClick={() => setGraphView('tree')}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors ${graphView === 'tree' ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                  >
                    <span className="material-symbols-outlined text-sm">account_tree</span>
                    <span className="text-[10px] font-bold uppercase tracking-wider">Tree View</span>
                  </button>
                  <button 
                    onClick={() => setGraphView('timeline')}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors ${graphView === 'timeline' ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                  >
                    <span className="material-symbols-outlined text-sm">timeline</span>
                    <span className="text-[10px] font-bold uppercase tracking-wider">Timeline</span>
                  </button>
                  <button 
                    onClick={() => setGraphView('resolve')}
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-md transition-colors ${graphView === 'resolve' ? 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                  >
                    <span className="material-symbols-outlined text-sm">handyman</span>
                    <span className="text-[10px] font-bold uppercase tracking-wider">Resolve</span>
                  </button>
               </div>
            </div>

            <div className="absolute top-4 right-6 z-10">
              {!isRightSidebarOpen && (
                <button 
                  onClick={() => setIsRightSidebarOpen(true)}
                  className="w-10 h-10 flex items-center justify-center bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-all"
                  title="Show Sidebar"
                >
                  <span className="material-symbols-outlined">view_sidebar</span>
                </button>
              )}
            </div>

            {graphView === 'tree' ? (
              <div className="flex-1 flex items-center justify-center relative bg-white dark:bg-card-dark">
                <TreeGraph onNavigate={onPageChange} branches={currentCase.branches} rootData={currentCase.rootData} />
              </div>
            ) : graphView === 'timeline' ? (
              <div className="flex-1 overflow-y-auto custom-scrollbar p-8 pt-20 relative bg-[#F8F9FA] dark:bg-card-dark">
                <div className="w-full relative">
                  {/* Timeline vertical line */}
                  <div className="absolute left-[23px] top-4 bottom-4 w-0.5 bg-gray-200 dark:bg-gray-700"></div>
                  
                  <div className="space-y-6">
                    {currentCase.branches.flatMap(branch => 
                      branch.nodes.map(node => ({
                        ...node,
                        branchId: branch.id,
                        branchLabel: branch.label,
                        branchIcon: branch.icon,
                        branchStatus: branch.status,
                      }))
                    ).sort((a, b) => {
                      const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
                      const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
                      return timeA - timeB;
                    }).map((node, index) => {
                      const isCritical = node.status === 'critical';
                      const isWarning = node.status === 'warning';
                      const isHealthy = node.status === 'healthy';
                      
                      return (
                        <div 
                          key={`${node.id}-${index}`} 
                          className="relative flex items-start group cursor-pointer"
                          onClick={() => onPageChange(node.branchId as Page)}
                        >
                          {/* Timeline dot */}
                          <div className={`absolute left-0 w-12 h-12 flex items-center justify-center z-10`}>
                            <div className={`w-4 h-4 rounded-full border-2 border-white dark:border-gray-900 shadow-sm transition-transform group-hover:scale-125 ${
                              isCritical ? 'bg-red-500' : 
                              isWarning ? 'bg-orange-400' : 
                              'bg-green-500'
                            }`}></div>
                          </div>
                          
                          {/* Event Card */}
                          <div className={`ml-14 flex-1 p-4 rounded-xl border transition-all duration-200 ${
                            isCritical ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800/30 shadow-sm hover:shadow-md' : 
                            isWarning ? 'bg-orange-50 dark:bg-orange-900/10 border-orange-200 dark:border-orange-800/30 shadow-sm hover:shadow-md' : 
                            'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-sm hover:shadow-md hover:border-gray-300 dark:hover:border-gray-600'
                          }`}>
                            <div className="flex justify-between items-start mb-2">
                              <div className="flex items-center gap-2">
                                <span className={`material-symbols-outlined text-lg ${
                                  isCritical ? 'text-red-500' : 
                                  isWarning ? 'text-orange-500' : 
                                  'text-gray-500 dark:text-gray-400'
                                }`}>
                                  {node.icon}
                                </span>
                                <h3 className={`font-bold ${
                                  isCritical ? 'text-red-900 dark:text-red-100' : 
                                  isWarning ? 'text-orange-900 dark:text-orange-100' : 
                                  'text-gray-900 dark:text-white'
                                }`}>
                                  {node.label}
                                </h3>
                              </div>
                              {node.timestamp && (
                                <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                                  {new Date(node.timestamp).toLocaleString(undefined, {
                                    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                                  })}
                                </span>
                              )}
                            </div>
                            
                            <div className="flex items-center justify-between">
                              <div className={`text-sm ${
                                isCritical ? 'text-red-700 dark:text-red-300' : 
                                isWarning ? 'text-orange-700 dark:text-orange-300' : 
                                'text-gray-600 dark:text-gray-300'
                              }`}>
                                {node.context}
                              </div>
                              
                              <div className="flex items-center gap-2">
                                <span className={`flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-1 rounded border ${
                                  node.branchStatus === 'critical' ? 'bg-red-100/50 text-red-700 border-red-200' : 
                                  node.branchStatus === 'warning' ? 'bg-orange-100/50 text-orange-700 border-orange-200' : 
                                  'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600'
                                }`}>
                                  <span className="material-symbols-outlined text-[12px]">{node.branchIcon}</span>
                                  {node.branchLabel}
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col h-full bg-white dark:bg-card-dark relative pt-16">
                {/* Header */}
                <div className="p-6 pb-0 flex-shrink-0 z-20">
                  <div className="bg-white dark:bg-card-dark rounded-xl border border-gray-200 dark:border-gray-700 shadow-card">
                    <div className="px-6 py-4 flex items-center justify-between">
                      <div>
                        <h1 className="text-xl font-semibold text-gray-900 dark:text-white">Resolve Case</h1>
                        <p className="text-xs text-gray-500 mt-0.5">Manage conflict resolution, system identifiers, and execution.</p>
                      </div>
                    </div>
                    <div className="px-6 flex items-center space-x-8 border-t border-gray-100 dark:border-gray-800 pt-3 overflow-x-auto custom-scrollbar">
                      {[
                        { id: 'overview', label: 'Overview' },
                        { id: 'identifiers', label: 'Identifiers' },
                        { id: 'policy', label: 'Policy Blockers' },
                        { id: 'execution', label: 'Execution' },
                      ].map(tab => (
                        <button
                          key={tab.id}
                          onClick={() => setResolveTab(tab.id as ResolveTab)}
                          className={`pb-3 text-sm transition-colors border-b-2 whitespace-nowrap ${
                            resolveTab === tab.id 
                              ? 'font-bold text-gray-900 dark:text-white border-black dark:border-white' 
                              : 'font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 border-transparent hover:border-gray-300'
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                  <div className="w-full h-full">
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={resolveTab}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ duration: 0.2 }}
                        className="h-full"
                      >
                        {selectedId === '1' ? (
                          resolveTab === 'overview' ? (
                            <div className="space-y-6">
                              {/* Main Contradiction Header */}
                              <div className="bg-white dark:bg-card-dark border border-red-200 dark:border-red-900/50 rounded-2xl p-6 shadow-sm">
                                <div className="flex items-start gap-4">
                                  <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                                    <span className="material-symbols-outlined text-red-600 dark:text-red-400">sync_problem</span>
                                  </div>
                                  <div className="flex-1">
                                    <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-1">Refund State Contradiction</h2>
                                    <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
                                      Refund processed in PSP → OMS still pending → return workflow blocked
                                    </p>
                                    
                                    {/* Domain-Based Conflict Structure */}
                                    <div className="flex flex-col md:flex-row items-stretch gap-2 md:gap-3 mt-6">
                                      <div className="flex-1 bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border border-gray-100 dark:border-gray-700">
                                        <div className="flex items-center justify-between mb-2">
                                          <span className="text-xs font-bold uppercase tracking-wider text-gray-500">PSP (Stripe)</span>
                                          <span className="px-2 py-0.5 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-[10px] font-bold rounded uppercase">Processed</span>
                                        </div>
                                        <div className="text-sm font-mono text-gray-900 dark:text-white mb-1">ref_22091</div>
                                        <div className="text-xs text-gray-500 flex items-center gap-1">
                                          <span className="material-symbols-outlined text-[14px] text-green-500">check_circle</span>
                                          Source of Truth
                                        </div>
                                      </div>
                                      
                                      <div className="hidden md:flex items-center justify-center text-gray-300 dark:text-gray-600">
                                        <span className="material-symbols-outlined">arrow_forward</span>
                                      </div>
                                      
                                      <div className="flex-1 bg-red-50 dark:bg-red-900/10 rounded-xl p-4 border border-red-100 dark:border-red-800/30">
                                        <div className="flex items-center justify-between mb-2">
                                          <span className="text-xs font-bold uppercase tracking-wider text-red-700 dark:text-red-400">OMS</span>
                                          <span className="px-2 py-0.5 bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-[10px] font-bold rounded uppercase">Pending</span>
                                        </div>
                                        <div className="text-sm font-mono text-red-600 dark:text-red-400 mb-1">Missing ID</div>
                                        <div className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                                          <span className="material-symbols-outlined text-[14px]">error</span>
                                          Failed Writeback
                                        </div>
                                      </div>
                                      
                                      <div className="hidden md:flex items-center justify-center text-gray-300 dark:text-gray-600">
                                        <span className="material-symbols-outlined">arrow_forward</span>
                                      </div>
                                      
                                      <div className="flex-1 bg-orange-50 dark:bg-orange-900/10 rounded-xl p-4 border border-orange-100 dark:border-orange-800/30">
                                        <div className="flex items-center justify-between mb-2">
                                          <span className="text-xs font-bold uppercase tracking-wider text-orange-700 dark:text-orange-400">Return Flow</span>
                                          <span className="px-2 py-0.5 bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 text-[10px] font-bold rounded uppercase">Blocked</span>
                                        </div>
                                        <div className="text-sm font-mono text-gray-900 dark:text-white mb-1">RET-7731</div>
                                        <div className="text-xs text-orange-600 dark:text-orange-400 flex items-center gap-1">
                                          <span className="material-symbols-outlined text-[14px]">block</span>
                                          Downstream Impact
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Expected Post-Resolution State */}
                              <div className="bg-white dark:bg-card-dark border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm">
                                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                                  <span className="material-symbols-outlined text-gray-400">task_alt</span>
                                  Expected Post-Resolution State
                                </h3>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                  <div className="bg-green-50 dark:bg-green-900/10 p-4 rounded-xl border border-green-100 dark:border-green-800/30 flex flex-col items-center justify-center text-center">
                                    <span className="material-symbols-outlined text-green-500 mb-2">account_balance</span>
                                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">PSP</span>
                                    <span className="text-sm font-bold text-green-700 dark:text-green-400">Processed</span>
                                  </div>
                                  <div className="bg-green-50 dark:bg-green-900/10 p-4 rounded-xl border border-green-100 dark:border-green-800/30 flex flex-col items-center justify-center text-center">
                                    <span className="material-symbols-outlined text-green-500 mb-2">inventory_2</span>
                                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">OMS</span>
                                    <span className="text-sm font-bold text-green-700 dark:text-green-400">Processed</span>
                                  </div>
                                  <div className="bg-green-50 dark:bg-green-900/10 p-4 rounded-xl border border-green-100 dark:border-green-800/30 flex flex-col items-center justify-center text-center">
                                    <span className="material-symbols-outlined text-green-500 mb-2">local_shipping</span>
                                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Return Flow</span>
                                    <span className="text-sm font-bold text-green-700 dark:text-green-400">Unblocked</span>
                                  </div>
                                  <div className="bg-green-50 dark:bg-green-900/10 p-4 rounded-xl border border-green-100 dark:border-green-800/30 flex flex-col items-center justify-center text-center">
                                    <span className="material-symbols-outlined text-green-500 mb-2">verified</span>
                                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">Conflict</span>
                                    <span className="text-sm font-bold text-green-700 dark:text-green-400">Resolved</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ) : resolveTab === 'identifiers' ? (
                            <div className="space-y-6">
                              {/* System IDs */}
                              <div className="bg-white dark:bg-card-dark border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm">
                                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                                  <span className="material-symbols-outlined text-gray-400">fingerprint</span>
                                  System Identifiers
                                </h3>
                                <div className="space-y-3">
                                  <div className="flex items-center justify-between py-2 border-b border-gray-50 dark:border-gray-800">
                                    <span className="text-sm text-gray-500">Order ID</span>
                                    <span className="text-sm font-mono font-medium text-gray-900 dark:text-white">ORD-55210</span>
                                  </div>
                                  <div className="flex items-center justify-between py-2 border-b border-gray-50 dark:border-gray-800">
                                    <span className="text-sm text-gray-500">PSP Payment ID</span>
                                    <span className="text-sm font-mono font-medium text-gray-900 dark:text-white">psp_88214</span>
                                  </div>
                                  <div className="flex items-center justify-between py-2 border-b border-gray-50 dark:border-gray-800">
                                    <span className="text-sm text-gray-500">PSP Refund ID</span>
                                    <span className="text-sm font-mono font-medium text-gray-900 dark:text-white">ref_22091</span>
                                  </div>
                                  <div className="flex items-center justify-between py-2 border-b border-gray-50 dark:border-gray-800">
                                    <span className="text-sm text-gray-500">OMS Refund Ref</span>
                                    <span className="text-sm font-mono font-bold text-red-500 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded">Missing</span>
                                  </div>
                                  <div className="flex items-center justify-between py-2">
                                    <span className="text-sm text-gray-500">Return ID</span>
                                    <span className="text-sm font-mono font-medium text-gray-900 dark:text-white">RET-7731</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ) : resolveTab === 'policy' ? (
                            <div className="space-y-6">
                              {/* Policy Blockers */}
                              <div className="bg-white dark:bg-card-dark border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm">
                                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                                  <span className="material-symbols-outlined text-gray-400">gavel</span>
                                  Policy Blockers
                                </h3>
                                <div className="bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-800/30 rounded-xl p-4">
                                  <div className="flex items-start gap-3">
                                    <span className="material-symbols-outlined text-red-500 mt-0.5">policy</span>
                                    <div>
                                      <h4 className="text-sm font-bold text-red-900 dark:text-red-100 mb-1">High-value refund approval</h4>
                                      <div className="space-y-2 mt-3">
                                        <div className="flex items-start gap-2">
                                          <span className="text-xs font-bold text-red-700 dark:text-red-400 w-16 shrink-0">Blocks:</span>
                                          <span className="text-xs text-red-800 dark:text-red-200">Automatic refund propagation to OMS</span>
                                        </div>
                                        <div className="flex items-start gap-2">
                                          <span className="text-xs font-bold text-red-700 dark:text-red-400 w-16 shrink-0">Action:</span>
                                          <span className="text-xs text-red-800 dark:text-red-200">Finance Ops approval required</span>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ) : resolveTab === 'execution' ? (
                            <div className="space-y-6">
                              {/* Resolution Strategy */}
                              <div className="bg-white dark:bg-card-dark border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm">
                                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                                  <span className="material-symbols-outlined text-gray-400">strategy</span>
                                  Resolution Strategy
                                </h3>
                                <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-100 dark:border-gray-700 space-y-3">
                                  <div className="flex justify-between items-center">
                                    <span className="text-sm text-gray-500">Recommended Path</span>
                                    <span className="text-sm font-bold text-gray-900 dark:text-white">AI Agent (with Approval)</span>
                                  </div>
                                  <div className="flex justify-between items-center">
                                    <span className="text-sm text-gray-500">Reason</span>
                                    <span className="text-sm text-gray-700 dark:text-gray-300 text-right max-w-[250px]">Finance Ops approval required due to high-value refund policy</span>
                                  </div>
                                  <div className="flex justify-between items-center">
                                    <span className="text-sm text-gray-500">Risk Level</span>
                                    <span className="text-sm font-medium text-orange-600 dark:text-orange-400">Medium</span>
                                  </div>
                                  <div className="flex justify-between items-center">
                                    <span className="text-sm text-gray-500">Approval Required</span>
                                    <span className="text-sm font-medium text-orange-600 dark:text-orange-400">Yes (Finance Ops)</span>
                                  </div>
                                  <div className="flex justify-between items-center pt-3 border-t border-gray-200 dark:border-gray-700">
                                    <span className="text-sm text-gray-500">Execution Owner</span>
                                    <span className="text-sm font-medium text-secondary flex items-center gap-1">
                                      <span className="material-symbols-outlined text-[16px]">auto_awesome</span>
                                      AI Agent
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* Execution Workspace */}
                              <div className="bg-white dark:bg-card-dark border border-gray-200 dark:border-gray-800 rounded-2xl p-6 shadow-sm">
                                <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                                  <span className="material-symbols-outlined text-gray-400">play_circle</span>
                                  Execution Workspace
                                </h3>
                                <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-lg mb-6">
                                  <button
                                    onClick={() => setResolutionPath('ai')}
                                    className={`flex-1 py-2 text-sm font-bold rounded-md transition-colors flex items-center justify-center gap-2 ${resolutionPath === 'ai' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                                  >
                                    <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
                                    AI Agent
                                  </button>
                                  <button
                                    onClick={() => setResolutionPath('manual')}
                                    className={`flex-1 py-2 text-sm font-bold rounded-md transition-colors flex items-center justify-center gap-2 ${resolutionPath === 'manual' ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm' : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'}`}
                                  >
                                    <span className="material-symbols-outlined text-[18px]">list_alt</span>
                                    Manual Steps
                                  </button>
                                </div>

                                {resolutionPath === 'ai' ? (
                                  <div className="space-y-6">
                                    <div className="bg-purple-50 dark:bg-purple-900/10 p-4 rounded-xl border border-purple-100 dark:border-purple-800/30">
                                      <h4 className="text-sm font-bold text-secondary mb-3 flex items-center gap-2">
                                        <span className="material-symbols-outlined text-[18px]">smart_toy</span>
                                        AI Agent will:
                                      </h4>
                                      <ol className="list-decimal list-inside space-y-2 text-sm text-gray-700 dark:text-gray-300">
                                        <li>Confirm PSP refund state as canonical</li>
                                        <li>Create missing OMS refund reference</li>
                                        <li>Update OMS refund status to Processed</li>
                                        <li>Resume blocked return workflow</li>
                                        <li>Log reconciliation event in audit trail</li>
                                      </ol>
                                    </div>
                                    <div className="flex flex-col gap-3">
                                      <button className="w-full py-3 bg-secondary text-white rounded-xl text-sm font-bold hover:opacity-90 transition-opacity flex items-center justify-center gap-2 shadow-sm">
                                        <span className="material-symbols-outlined text-[20px]">verified_user</span>
                                        Request Approval & Execute
                                      </button>
                                      <button className="w-full py-3 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 rounded-xl text-sm font-bold hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                                        Preview AI Actions
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="space-y-6">
                                    <div className="space-y-4">
                                      {[
                                        { step: 1, title: 'Open OMS refund record', state: 'pending', action: 'Open OMS' },
                                        { step: 2, title: 'Create missing refund reference using PSP Refund ID ref_22091', state: 'pending', action: 'Copy ID' },
                                        { step: 3, title: 'Set OMS refund state to Processed', state: 'pending' },
                                        { step: 4, title: 'Re-run return workflow validation', state: 'pending' },
                                        { step: 5, title: 'Confirm return flow is unblocked', state: 'pending' },
                                      ].map((item) => (
                                        <div key={item.step} className="flex gap-4 items-start">
                                          <div className="w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center text-xs font-bold text-gray-500 shrink-0 mt-0.5">
                                            {item.step}
                                          </div>
                                          <div className="flex-1">
                                            <div className="text-sm font-medium text-gray-900 dark:text-white mb-1.5">{item.title}</div>
                                            <div className="flex items-center justify-between">
                                              <span className="text-xs font-bold uppercase text-gray-400">{item.state}</span>
                                              {item.action && (
                                                <button className="text-xs font-bold text-blue-600 dark:text-blue-400 hover:underline">
                                                  {item.action}
                                                </button>
                                              )}
                                            </div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                    <button className="w-full py-3 bg-black dark:bg-white text-white dark:text-black rounded-xl text-sm font-bold hover:opacity-90 transition-opacity shadow-sm">
                                      Begin Guided Resolution
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : null
                        ) : (
                          <div className="flex flex-col items-center justify-center h-64 text-center">
                            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/20 rounded-full flex items-center justify-center mb-4">
                              <span className="material-symbols-outlined text-3xl text-green-500">check_circle</span>
                            </div>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Systems Aligned</h2>
                            <p className="text-gray-500 max-w-md">
                              No active mismatches, blocked policies, or missing ID mappings detected for this case.
                            </p>
                            <div className="mt-6 text-xs text-gray-400 font-mono">
                              Last reconciliation check: Just now
                            </div>
                          </div>
                        )}
                      </motion.div>
                    </AnimatePresence>
                  </div>
                </div>
              </div>
            )}

            {/* Legend / Info */}
            <div className="absolute bottom-6 left-6 flex gap-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-green-500"></div>
                <span className="text-[10px] font-bold uppercase text-gray-400">Healthy</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-orange-400"></div>
                <span className="text-[10px] font-bold uppercase text-gray-400">Warning</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
                <span className="text-[10px] font-bold uppercase text-gray-400">Critical</span>
              </div>
            </div>
          </div>

          {/* Right Pane: Copilot Sidebar */}
          <div className={`transition-all duration-300 bg-white dark:bg-card-dark flex flex-col overflow-hidden ${isRightSidebarOpen ? 'w-80 lg:w-96 border-l border-gray-100 dark:border-gray-700' : 'w-0 border-none'}`}>
            {/* Tabs */}
            <div className="flex items-center border-b border-gray-100 dark:border-gray-700 px-2 flex-shrink-0">
              <button
                onClick={() => setRightTab('details')}
                className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 ${
                  rightTab === 'details'
                    ? 'text-gray-900 border-gray-900 font-bold'
                    : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 border-transparent'
                }`}
              >
                Details
              </button>
              <button
                onClick={() => setRightTab('copilot')}
                className={`flex-1 py-3 text-sm font-medium transition-colors border-b-2 flex items-center justify-center gap-2 ${
                  rightTab === 'copilot'
                    ? 'text-secondary border-secondary font-bold bg-purple-50/50 dark:bg-purple-900/10'
                    : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 border-transparent'
                }`}
              >
                <span className="material-symbols-outlined text-lg">smart_toy</span>
                Copilot
              </button>
              <div className="flex items-center gap-1 ml-auto">
                <button className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500">
                  <span className="material-symbols-outlined text-[20px]">settings</span>
                </button>
                <button 
                  onClick={() => setIsRightSidebarOpen(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400 transition-all"
                  title="Hide Sidebar"
                >
                  <span className="material-symbols-outlined text-[20px]">view_sidebar</span>
                </button>
              </div>
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              {graphView === 'resolve' ? (
                rightTab === 'copilot' ? (
                  <div className="p-4 flex flex-col gap-4">
                    {/* Copilot Resolve Mode */}
                    <div className="flex gap-2">
                      <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center text-white flex-shrink-0 mt-0.5">
                        <span className="material-symbols-outlined text-[14px]">auto_awesome</span>
                      </div>
                      <div className="flex flex-col gap-2 max-w-[85%] w-full">
                        {selectedId === '1' ? (
                          <>
                            <div className="bg-purple-50 dark:bg-purple-900/20 text-gray-800 dark:text-gray-200 text-sm py-2.5 px-3.5 rounded-2xl rounded-tl-sm border border-purple-100 dark:border-purple-800/30">
                              <h4 className="font-bold text-xs uppercase tracking-wider text-secondary mb-2">Resolution Guidance</h4>
                              <p className="leading-relaxed mb-3 text-xs">
                                {copilotData.conflict}
                              </p>
                              
                              <h4 className="font-bold text-xs uppercase tracking-wider text-secondary mb-2">Action Required</h4>
                              <p className="text-xs bg-white/50 dark:bg-black/20 p-2 rounded border border-purple-100 dark:border-purple-800/30 italic mb-3">
                                {copilotData.recommendation}
                              </p>

                              <button 
                                className="w-full py-2 bg-secondary text-white rounded-lg text-xs font-bold hover:opacity-90 flex items-center justify-center gap-2"
                              >
                                {copilotData.actionText}
                                <span className="material-symbols-outlined text-sm">arrow_forward</span>
                              </button>
                            </div>
                            
                            <div className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-xl border border-gray-100 dark:border-gray-700">
                              <h4 className="font-bold text-xs uppercase tracking-wider text-gray-500 mb-2">Suggested Reply</h4>
                              <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed italic mb-3">
                                {copilotData.reply}
                              </p>
                              <button className="w-full py-1.5 bg-secondary text-white text-xs font-bold rounded-lg hover:opacity-90 transition-opacity">
                                Apply to Composer
                              </button>
                            </div>
                          </>
                        ) : (
                          <div className="bg-purple-50 dark:bg-purple-900/20 text-gray-800 dark:text-gray-200 text-sm py-2.5 px-3.5 rounded-2xl rounded-tl-sm border border-purple-100 dark:border-purple-800/30">
                            <h4 className="font-bold text-xs uppercase tracking-wider text-secondary mb-2">All Clear</h4>
                            <p className="leading-relaxed text-xs">
                              There are no active conflicts or blocked policies for this case. Systems are fully aligned.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100 dark:divide-gray-800">
                    {/* Resolution Context - Lightweight Support Panel */}
                    {selectedId === '1' ? (
                      <>
                        <div className="p-4">
                          <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3 uppercase tracking-wider text-xs">Conflict Context</h3>
                          <div className="space-y-3">
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-gray-600 dark:text-gray-400">PSP (Stripe)</span>
                              <span className="font-mono font-medium text-green-600 dark:text-green-400">Processed</span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-gray-600 dark:text-gray-400">OMS</span>
                              <span className="font-mono font-medium text-red-600 dark:text-red-400">Pending</span>
                            </div>
                            <div className="flex justify-between items-center text-sm pt-2 border-t border-gray-100 dark:border-gray-800">
                              <span className="text-gray-600 dark:text-gray-400">Propagation Status</span>
                              <span className="text-xs font-bold text-red-600 dark:text-red-400 flex items-center gap-1">
                                <span className="material-symbols-outlined text-[14px]">error</span>
                                Failed Writeback
                              </span>
                            </div>
                            <div className="flex justify-between items-center text-sm">
                              <span className="text-gray-600 dark:text-gray-400">Downstream Impact</span>
                              <span className="text-xs font-bold text-orange-600 dark:text-orange-400 flex items-center gap-1">
                                <span className="material-symbols-outlined text-[14px]">block</span>
                                Return Flow Blocked
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="p-4">
                          <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3 uppercase tracking-wider text-xs">Related Cases</h3>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between p-2 hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-lg cursor-pointer transition-colors border border-transparent hover:border-gray-200 dark:hover:border-gray-700">
                              <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-gray-400 text-[16px]">receipt_long</span>
                                <span className="text-sm text-gray-700 dark:text-gray-300">CASE-8821</span>
                              </div>
                              <span className="text-xs text-gray-500">2 days ago</span>
                            </div>
                            <div className="flex items-center justify-between p-2 hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded-lg cursor-pointer transition-colors border border-transparent hover:border-gray-200 dark:hover:border-gray-700">
                              <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-gray-400 text-[16px]">receipt_long</span>
                                <span className="text-sm text-gray-700 dark:text-gray-300">CASE-8805</span>
                              </div>
                              <span className="text-xs text-gray-500">5 days ago</span>
                            </div>
                          </div>
                        </div>

                        <div className="p-4">
                          <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-3 uppercase tracking-wider text-xs">Quick Notes</h3>
                          <textarea 
                            className="w-full bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl p-3 text-sm text-gray-700 dark:text-gray-300 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-secondary/50 resize-none"
                            rows={4}
                            placeholder="Add operational notes here..."
                          ></textarea>
                        </div>
                      </>
                    ) : (
                      <div className="p-8 text-center text-gray-500">
                        <span className="material-symbols-outlined text-4xl mb-2 text-gray-300">verified</span>
                        <p className="text-sm">No resolution required.</p>
                      </div>
                    )}
                  </div>
                )
              ) : rightTab === 'copilot' ? (
                <div className="p-4 flex flex-col gap-4">
                  {/* Copilot Case Summary */}
                  <div className="flex gap-2">
                    <div className="w-6 h-6 rounded-full bg-secondary flex items-center justify-center text-white flex-shrink-0 mt-0.5">
                      <span className="material-symbols-outlined text-[14px]">auto_awesome</span>
                    </div>
                    <div className="flex flex-col gap-2 max-w-[85%] w-full">
                      <div className="bg-purple-50 dark:bg-purple-900/20 text-gray-800 dark:text-gray-200 text-sm py-2.5 px-3.5 rounded-2xl rounded-tl-sm border border-purple-100 dark:border-purple-800/30">
                        <h4 className="font-bold text-xs uppercase tracking-wider text-secondary mb-2">Case Intelligence</h4>
                        <p className="leading-relaxed mb-3">{copilotData.summary}</p>
                        
                        <h4 className="font-bold text-xs uppercase tracking-wider text-secondary mb-2">Root Cause Analysis</h4>
                        <p className="text-xs mb-3">
                          {copilotData.rootCause}
                        </p>

                        <h4 className="font-bold text-xs uppercase tracking-wider text-secondary mb-2">Conflict Detection</h4>
                        <div className="bg-red-50 dark:bg-red-900/20 p-2 rounded border border-red-100 dark:border-red-800/30 text-xs text-red-700 dark:text-red-400 mb-3">
                          {copilotData.conflict}
                        </div>

                        <h4 className="font-bold text-xs uppercase tracking-wider text-secondary mb-2">Recommended Action</h4>
                        <p className="text-xs bg-white/50 dark:bg-black/20 p-2 rounded border border-purple-100 dark:border-purple-800/30 italic mb-3">
                          {copilotData.recommendation}
                        </p>

                        <button 
                          onClick={() => onPageChange('payments')}
                          className="w-full py-2 bg-secondary text-white rounded-lg text-xs font-bold hover:opacity-90 flex items-center justify-center gap-2"
                        >
                          {copilotData.actionText}
                          <span className="material-symbols-outlined text-sm">arrow_forward</span>
                        </button>
                      </div>
                      
                      <div className="bg-gray-50 dark:bg-gray-800/50 p-3 rounded-xl border border-gray-100 dark:border-gray-700">
                        <h4 className="font-bold text-xs uppercase tracking-wider text-gray-500 mb-2">Suggested Reply</h4>
                        <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed italic mb-3">
                          {copilotData.reply}
                        </p>
                        <button className="w-full py-1.5 bg-secondary text-white text-xs font-bold rounded-lg hover:opacity-90 transition-opacity">
                          Apply to Composer
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {/* Case Attributes */}
                  <div className="p-4">
                    <button className="w-full py-2 flex items-center justify-between text-sm font-semibold text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-lg text-gray-600">assignment</span>
                        Case Attributes
                      </div>
                      <span className="material-symbols-outlined text-lg text-gray-400">expand_more</span>
                    </button>
                    <div className="grid grid-cols-2 gap-4 mt-3">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] uppercase tracking-wider text-gray-500 flex items-center gap-1">
                          <span className="material-symbols-outlined text-[12px]">tag</span>
                          Order ID
                        </span>
                        <span className="text-xs font-bold text-gray-900 dark:text-white">{caseData.orderId}</span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] uppercase tracking-wider text-gray-500 flex items-center gap-1">
                          <span className="material-symbols-outlined text-[12px]">person</span>
                          Customer
                        </span>
                        <span className="text-xs font-bold text-gray-900 dark:text-white">{caseData.customerName}</span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] uppercase tracking-wider text-gray-500 flex items-center gap-1">
                          <span className="material-symbols-outlined text-[12px]">info</span>
                          Status
                        </span>
                        <span className="text-xs font-bold text-red-600 dark:text-red-400">{caseData.status}</span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[10px] uppercase tracking-wider text-gray-500 flex items-center gap-1">
                          <span className="material-symbols-outlined text-[12px]">warning</span>
                          Risk Level
                        </span>
                        <span className="text-xs font-bold text-orange-600 dark:text-orange-400">{caseData.riskLevel}</span>
                      </div>
                    </div>
                    
                    <div className="mt-4">
                      <span className="text-[10px] uppercase tracking-wider text-gray-500 block mb-2">Impacted Branches</span>
                      <div className="flex flex-wrap gap-2">
                        {currentCase.branches.filter(b => b.status !== 'healthy').map(b => (
                          <span key={b.id} className={`flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-1 rounded border ${b.status === 'critical' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-orange-50 text-orange-700 border-orange-200'}`}>
                            <span className="material-symbols-outlined text-[12px]">{b.icon}</span>
                            {b.label}
                          </span>
                        ))}
                        {currentCase.branches.filter(b => b.status !== 'healthy').length === 0 && (
                          <span className="text-xs text-gray-500 italic">No impacted branches</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Operational Links */}
                  <div className="p-4">
                    <button className="w-full py-2 flex items-center justify-between text-sm font-semibold text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-lg text-gray-600">link</span>
                        Operational Links
                      </div>
                      <span className="material-symbols-outlined text-lg text-gray-400">expand_more</span>
                    </button>
                    <div className="space-y-2 mt-2">
                      <a href="#" className="flex items-center justify-between p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800 text-xs text-blue-600 dark:text-blue-400 border border-transparent hover:border-blue-100 transition-all">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-sm">hub</span>
                          OMS (Order Management)
                        </div>
                        <span className="material-symbols-outlined text-sm">open_in_new</span>
                      </a>
                      <a href="#" className="flex items-center justify-between p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800 text-xs text-blue-600 dark:text-blue-400 border border-transparent hover:border-blue-100 transition-all">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-sm">account_balance</span>
                          PSP (Payment Gateway)
                        </div>
                        <span className="material-symbols-outlined text-sm">open_in_new</span>
                      </a>
                      <a href="#" className="flex items-center justify-between p-2 rounded hover:bg-gray-50 dark:hover:bg-gray-800 text-xs text-blue-600 dark:text-blue-400 border border-transparent hover:border-blue-100 transition-all">
                        <div className="flex items-center gap-2">
                          <span className="material-symbols-outlined text-sm">warehouse</span>
                          WMS (Warehouse)
                        </div>
                        <span className="material-symbols-outlined text-sm">open_in_new</span>
                      </a>
                    </div>
                  </div>

                  {/* Related Cases */}
                  <div className="p-4">
                    <button className="w-full py-2 flex items-center justify-between text-sm font-semibold text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-lg text-gray-600">history</span>
                        Related Cases
                      </div>
                      <span className="material-symbols-outlined text-lg text-gray-400">expand_more</span>
                    </button>
                    <div className="space-y-2 mt-2">
                      <div className="p-2 rounded border border-gray-100 dark:border-gray-800 flex items-center justify-between">
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-gray-900 dark:text-white">CAS-88100</span>
                          <span className="text-[10px] text-gray-500">Previous refund inquiry</span>
                        </div>
                        <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-[9px] font-bold rounded uppercase">Closed</span>
                      </div>
                    </div>
                  </div>

                  {/* Internal Notes */}
                  <div className="p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-bold text-gray-900 dark:text-white flex items-center gap-2">
                        <span className="material-symbols-outlined text-lg text-gray-600">sticky_note_2</span>
                        Internal Notes
                      </h3>
                      <button className="text-xs text-secondary font-bold hover:underline">+ Add Note</button>
                    </div>
                    <div className="space-y-3">
                      <div className="p-3 bg-yellow-50 dark:bg-yellow-900/10 rounded-lg border border-yellow-100 dark:border-yellow-800/20">
                        <p className="text-xs text-yellow-900 dark:text-yellow-100 leading-relaxed italic">
                          "Potential sync issue between Stripe and OMS detected by Autopilot."
                        </p>
                        <div className="mt-2 flex justify-between items-center text-[10px] text-yellow-700/70">
                          <span>By System</span>
                          <span>2m ago</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Copilot Input Area (always visible at bottom) */}
            <div className="p-4 border-t border-gray-100 dark:border-gray-700 bg-white dark:bg-card-dark">
              <div className="relative bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 flex items-center p-2 focus-within:ring-2 focus-within:ring-secondary/20 focus-within:border-secondary transition-all shadow-card">
                <button className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg"><span className="material-symbols-outlined text-[20px]">auto_awesome</span></button>
                <input className="flex-1 bg-transparent border-none focus:ring-0 text-sm text-gray-800 dark:text-gray-200 px-2 h-9" placeholder="Ask a question..." type="text" />
                <div className="flex items-center gap-1">
                  <button className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg"><span className="material-symbols-outlined text-[20px]">sort</span></button>
                  <button className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg"><span className="material-symbols-outlined text-[20px]">arrow_upward</span></button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
