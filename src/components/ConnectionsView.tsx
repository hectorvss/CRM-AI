import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { connectionCategories } from '../connectionsData';

const AgentNode = ({ name, icon, colorClass, label }: { name: string, icon: string, colorClass: string, label?: string }) => {
  const textColor = colorClass.split(' ').find(c => c.startsWith('text-'));
  const bgColor = colorClass.split(' ').find(c => c.startsWith('bg-'));
  
  return (
    <div className="flex flex-col items-center relative z-10 w-full">
      {label && <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest text-center absolute -top-4 bg-white/80 dark:bg-gray-900/80 px-1 rounded z-20">{label}</span>}
      <div className="w-full bg-white dark:bg-card-dark rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm flex items-center p-2 gap-3">
        <div className={`w-10 h-10 rounded-xl ${bgColor} dark:bg-opacity-20 flex items-center justify-center shrink-0`}>
          <span className={`material-symbols-outlined text-[20px] ${textColor}`}>{icon}</span>
        </div>
        <div className="flex flex-col items-start overflow-hidden">
          <span className="text-[13px] font-bold text-gray-900 dark:text-white truncate w-full text-left">{name}</span>
          <span className="text-[9px] font-medium text-gray-400 uppercase tracking-wider truncate w-full text-left">Agent Node</span>
        </div>
      </div>
    </div>
  );
};

const ToolNode = ({ name, icon }: { name: string, icon: string }) => (
  <div className="px-2 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg flex items-center gap-1.5 shadow-sm">
    <span className="material-symbols-outlined text-[12px] text-gray-500">{icon}</span>
    <span className="text-[9px] font-bold text-gray-700 dark:text-gray-300">{name}</span>
  </div>
);

const CurvedLineVertical = ({ label }: { label?: string }) => (
  <div className="flex flex-col items-center relative h-10 w-12">
    {label && <span className="text-[9px] font-medium text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full z-10 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap">{label}</span>}
    <svg width="100%" height="100%" viewBox="0 0 48 40" preserveAspectRatio="none" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-gray-300 dark:text-gray-600">
      <motion.path 
        d="M24 0 C 48 10, 0 30, 24 40" 
        stroke="currentColor" 
        strokeWidth="2" 
        initial={{ pathLength: 0 }} 
        animate={{ pathLength: 1 }} 
        transition={{ duration: 0.5 }} 
      />
    </svg>
  </div>
);

const CurvedLineHorizontal = ({ label }: { label?: string }) => (
  <div className="flex items-center justify-center relative w-12 h-10">
    {label && <span className="text-[9px] font-medium text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full z-10 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap">{label}</span>}
    <svg width="100%" height="100%" viewBox="0 0 48 40" preserveAspectRatio="none" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-gray-300 dark:text-gray-600">
      <motion.path 
        d="M0 20 C 10 40, 38 0, 48 20" 
        stroke="currentColor" 
        strokeWidth="2" 
        initial={{ pathLength: 0 }} 
        animate={{ pathLength: 1 }} 
        transition={{ duration: 0.5 }} 
      />
    </svg>
  </div>
);

const CurvedLineRight = () => (
  <div className="flex items-center justify-center relative w-16 h-16">
    <svg width="64" height="24" viewBox="0 0 64 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-gray-300 dark:text-gray-600">
      <motion.path d="M0 12 C 20 12, 44 12, 64 12" stroke="currentColor" strokeWidth="2" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.5 }} />
    </svg>
  </div>
);

const CurvedLineReturn = () => (
  <div className="flex items-center justify-center w-full h-24 relative">
    <svg width="100%" height="100%" viewBox="0 0 1000 100" preserveAspectRatio="none" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-gray-300 dark:text-gray-600 overflow-visible">
      <motion.path 
        d="M 750,0 C 750,50 250,50 250,100" 
        stroke="currentColor" 
        strokeWidth="2" 
        initial={{ pathLength: 0 }} 
        animate={{ pathLength: 1 }} 
        transition={{ duration: 1 }} 
      />
    </svg>
  </div>
);

const CurvedLineCenterToLeft = () => (
  <div className="flex items-center justify-center w-full h-16 relative">
    <svg width="100%" height="100%" viewBox="0 0 1000 64" preserveAspectRatio="none" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-gray-300 dark:text-gray-600 overflow-visible">
      <motion.path 
        d="M 500,0 C 500,32 250,32 250,64" 
        stroke="currentColor" 
        strokeWidth="2" 
        initial={{ pathLength: 0 }} 
        animate={{ pathLength: 1 }} 
        transition={{ duration: 0.5 }} 
      />
    </svg>
  </div>
);

const CurvedLineRightToCenter = () => (
  <div className="flex items-center justify-center w-full h-16 relative">
    <svg width="100%" height="100%" viewBox="0 0 1000 64" preserveAspectRatio="none" fill="none" xmlns="http://www.w3.org/2000/svg" className="text-gray-300 dark:text-gray-600 overflow-visible">
      <motion.path 
        d="M 750,0 C 750,32 500,32 500,64" 
        stroke="currentColor" 
        strokeWidth="2" 
        initial={{ pathLength: 0 }} 
        animate={{ pathLength: 1 }} 
        transition={{ duration: 0.5 }} 
      />
    </svg>
  </div>
);

const ArchitectureCard = () => {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="bg-white dark:bg-card-dark border border-gray-200 dark:border-gray-800 rounded-2xl shadow-sm overflow-hidden mb-8">
      <div 
        className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors border-b border-gray-100 dark:border-gray-800"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 flex items-center justify-center">
            <span className="material-symbols-outlined text-lg">account_tree</span>
          </div>
          <div>
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">System Architecture</h2>
            <p className="text-xs text-gray-500">Global overview of the agent ecosystem</p>
          </div>
        </div>
        <button className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
          <span className={`material-symbols-outlined transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>
            expand_more
          </span>
        </button>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-6 bg-gray-50/50 dark:bg-gray-900/20 overflow-x-auto custom-scrollbar">
              <div className="min-w-[800px] w-full space-y-6 relative">
                
                {/* 1. INPUT */}
                <div className="flex justify-center">
                  <div className="px-5 py-2 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-xs font-bold text-gray-700 dark:text-gray-300 shadow-sm text-center">
                    Customer Message / Channel Event / Webhook / System Event
                  </div>
                </div>

                <div className="flex justify-center"><CurvedLineCenterToLeft /></div>

                {/* ROW 1: INTAKE & ROUTING -> RECONCILIATION & PLANNING */}
                <div className="grid grid-cols-[1fr_auto_1fr] gap-6 items-stretch w-full">
                  {/* 2. INTAKE & ROUTING */}
                  <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-6 bg-white dark:bg-card-dark relative shadow-sm h-full w-full">
                    <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">1. Intake & Routing</h4>
                    <div className="flex flex-col items-center">
                      <AgentNode name="Channel Ingest" icon="mail" colorClass="text-orange-600" label="Receives inbound events" />
                      <CurvedLineVertical />
                      <AgentNode name="Canonicalizer" icon="cleaning_services" colorClass="text-emerald-600" label="Normalizes entities & structure" />
                      <CurvedLineVertical />
                      <AgentNode name="Intent Router" icon="split_scene" colorClass="text-cyan-600" label="Classifies the task" />
                      <CurvedLineVertical />
                      <AgentNode name="Supervisor" icon="account_tree" colorClass="text-purple-600" label="Orchestrates handoff" />
                      
                      <div className="flex gap-4 mt-4 w-full">
                        <div className="flex flex-col items-center p-3 border border-dashed border-gray-300 dark:border-gray-700 rounded-xl bg-gray-50/50 dark:bg-gray-800/30 w-full">
                          <span className="text-[9px] font-medium text-gray-500 mb-2">If policy/SOP needed:</span>
                          <AgentNode name="Knowledge Retriever" icon="menu_book" colorClass="text-amber-600" />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-center">
                    <CurvedLineRight />
                  </div>

                  {/* 3. RECONCILIATION & PLANNING */}
                  <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-6 bg-white dark:bg-card-dark relative shadow-sm h-full w-full">
                    <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">2. Reconciliation & Planning</h4>
                    <div className="flex flex-col items-center">
                      <div className="flex flex-col items-center p-4 border border-dashed border-gray-300 dark:border-gray-700 rounded-xl w-full bg-gray-50/50 dark:bg-gray-800/30">
                        <span className="text-[9px] font-medium text-gray-500 mb-3">If contradiction exists:</span>
                        <AgentNode name="Reconciliation Agent" icon="compare_arrows" colorClass="text-rose-600" />
                        
                        <div className="flex gap-3 mt-4 justify-center flex-wrap">
                           <ToolNode name="Stripe" icon="credit_card" />
                           <ToolNode name="Shopify" icon="shopping_bag" />
                           <ToolNode name="OMS/ERP" icon="inventory" />
                           <ToolNode name="Returns" icon="assignment_return" />
                        </div>
                        
                        <div className="flex gap-4 mt-5 w-full justify-center">
                          <div className="flex flex-col items-center w-full">
                            <span className="text-[9px] font-medium text-gray-500 mb-2 text-center">If IDs unclear:</span>
                            <AgentNode name="Identity Mapping Agent" icon="fingerprint" colorClass="text-teal-600" />
                          </div>
                          <div className="flex flex-col items-center w-full">
                            <span className="text-[9px] font-medium text-gray-500 mb-2 text-center">If truth needed:</span>
                            <AgentNode name="CRM / Cust. ID Agent" icon="contact_page" colorClass="text-slate-600" />
                          </div>
                        </div>
                      </div>
                      
                      <CurvedLineVertical />
                      <AgentNode name="Case Resolution Planner" icon="schema" colorClass="text-fuchsia-600" label="Builds the strategy" />
                      
                      <div className="flex flex-col items-center mt-4 p-3 border border-dashed border-gray-300 dark:border-gray-700 rounded-xl bg-gray-50/50 dark:bg-gray-800/30 w-full">
                        <span className="text-[9px] font-medium text-gray-500 mb-2">If high-risk:</span>
                        <AgentNode name="Approval Gatekeeper" icon="approval_delegation" colorClass="text-indigo-600" />
                      </div>
                      
                      <CurvedLineVertical />
                      <div className="flex flex-col items-center p-3 border border-dashed border-gray-300 dark:border-gray-700 rounded-xl bg-gray-50/50 dark:bg-gray-800/30 w-full">
                        <span className="text-[9px] font-medium text-gray-500 mb-2">Before sending/executing:</span>
                        <AgentNode name="QA / Policy Check" icon="security" colorClass="text-blue-600" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex justify-center"><CurvedLineReturn /></div>

                {/* ROW 2: EXECUTION -> COMMUNICATION */}
                <div className="grid grid-cols-[1fr_auto_1fr] gap-6 items-stretch w-full">
                  {/* 4. EXECUTION */}
                  <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-6 bg-white dark:bg-card-dark relative shadow-sm h-full w-full">
                    <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">3. Execution</h4>
                    <div className="flex flex-col items-center">
                      <AgentNode name="Resolution Executor" icon="play_circle" colorClass="text-lime-600" label="Performs approved changes" />
                      
                      <div className="flex gap-3 mt-3 justify-center flex-wrap w-full">
                         <ToolNode name="Stripe" icon="credit_card" />
                         <ToolNode name="Shopify" icon="shopping_bag" />
                         <ToolNode name="OMS/ERP" icon="inventory" />
                         <ToolNode name="Returns" icon="assignment_return" />
                         <ToolNode name="Recharge" icon="autorenew" />
                         <ToolNode name="Logistics" icon="local_shipping" />
                      </div>
                      
                      <CurvedLineVertical />
                      <AgentNode name="Workflow Runtime Agent" icon="account_tree" colorClass="text-indigo-600" label="Resumes/advances workflow" />
                    </div>
                  </div>

                  <div className="flex items-center justify-center">
                    <CurvedLineRight />
                  </div>

                  {/* 5. COMMUNICATION */}
                  <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-6 bg-white dark:bg-card-dark relative shadow-sm h-full w-full">
                    <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">4. Communication</h4>
                    <div className="flex flex-col items-center">
                      <span className="text-[9px] font-medium text-gray-500 mb-2">If customer communication needed:</span>
                      <AgentNode name="Customer Communication Agent" icon="chat" colorClass="text-blue-600" />
                      <CurvedLineVertical />
                      <AgentNode name="Composer + Translator" icon="edit_note" colorClass="text-pink-600" />
                      <CurvedLineVertical />
                      <AgentNode name="Helpdesk Agent" icon="support_agent" colorClass="text-sky-600" />
                    </div>
                  </div>
                </div>

                <div className="flex justify-center"><CurvedLineRightToCenter /></div>

                {/* 6. END STATE */}
                <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-4 bg-white dark:bg-card-dark relative shadow-sm">
                  <div className="flex flex-col items-center">
                    <div className="px-6 py-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/30 rounded-lg text-xs font-bold text-green-700 dark:text-green-400 shadow-sm text-center tracking-widest uppercase">
                      End State
                    </div>
                    <p className="text-[10px] font-bold text-gray-500 mt-2 text-center uppercase tracking-wider">
                      Systems aligned • Workflow resumed • Customer updated • Audit trail recorded
                    </p>
                  </div>
                </div>

                {/* 7. CROSS-CUTTING */}
                <div className="mt-6 border border-gray-200 dark:border-gray-700 rounded-xl p-4 bg-gray-50 dark:bg-gray-800/50 relative shadow-sm">
                  <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3 text-center">Cross-Cutting / Always-On</h4>
                  <div className="flex justify-center gap-4 flex-wrap">
                    <div className="w-64">
                      <AgentNode name="SLA & Escalation Agent" icon="warning" colorClass="text-red-600" label="Monitors delays & blocks" />
                    </div>
                    <div className="w-64">
                      <AgentNode name="Audit & Observability Agent" icon="visibility" colorClass="text-gray-600" label="Records all executions" />
                    </div>
                  </div>
                </div>

              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default function ConnectionsView() {
  const [selectedAgent, setSelectedAgent] = useState<string>('Shopify Agent');
  const [expandedAgent, setExpandedAgent] = useState<string | null>(null);

  return (
    <motion.div
      key="connections"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex gap-6 h-full"
    >
      {/* Left Side: Agent List */}
      <div className="flex-1 space-y-8 pb-12 w-full">
        {/* Search & Filters */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-gray-400 text-lg">search</span>
            <input 
              type="text" 
              placeholder="Search connections..." 
              className="w-full pl-10 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
            />
          </div>
          <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-xl border border-gray-200 dark:border-gray-700">
            {['All', 'Needs setup', 'Enabled', 'Disabled'].map(filter => (
              <button 
                key={filter}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  filter === 'All' 
                    ? 'bg-black dark:bg-white text-white dark:text-black shadow-sm' 
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                {filter}
              </button>
            ))}
          </div>
        </div>

        {/* System Architecture Card */}
        <ArchitectureCard />

        {/* Categories */}
        {connectionCategories.map((category, catIdx) => (
          <div key={catIdx} className="space-y-4">
            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1">{category.category}</h3>
            <div className="space-y-3">
              {category.agents.map((agent, agentIdx) => (
                <div 
                  key={agentIdx} 
                  onClick={() => {
                    setSelectedAgent(agent.name);
                    setExpandedAgent(expandedAgent === agent.name ? null : agent.name);
                  }}
                  className={`bg-white dark:bg-card-dark border rounded-2xl transition-all cursor-pointer ${
                    selectedAgent === agent.name 
                      ? 'border-indigo-500 ring-1 ring-indigo-500/20 shadow-md' 
                      : 'border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700 shadow-sm'
                  }`}
                >
                  <div className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-xl ${agent.iconColor} flex items-center justify-center`}>
                        <span className="material-symbols-outlined text-xl">{agent.icon}</span>
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-gray-900 dark:text-white">{agent.name}</h4>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{agent.role}</p>
                        <p className="text-[10px] text-indigo-500 font-medium mt-0.5">{agent.summary}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      {agent.locked ? (
                        <div className="flex items-center gap-1.5 text-gray-400">
                          <span className="material-symbols-outlined text-sm">lock</span>
                          <span className="text-[10px] font-bold uppercase tracking-wider">Locked ON</span>
                        </div>
                      ) : (
                        <div className={`w-8 h-4 rounded-full relative transition-colors ${agent.active ? 'bg-green-500' : 'bg-gray-300 dark:bg-gray-700'}`}>
                          <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${agent.active ? 'right-0.5' : 'left-0.5'}`}></div>
                        </div>
                      )}
                      <span className={`material-symbols-outlined text-gray-400 transition-transform ${expandedAgent === agent.name ? 'rotate-180' : ''}`}>expand_more</span>
                    </div>
                  </div>
                  
                  {/* Expanded Details */}
                  <AnimatePresence>
                    {expandedAgent === agent.name && (
                      <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden border-t border-gray-50 dark:border-gray-800"
                      >
                        <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-8 bg-gray-50/50 dark:bg-gray-900/20">
                          {/* LEFT SIDE: Visual connection diagram */}
                          <div className="space-y-4">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">Operational Map</p>
                            <div className="flex flex-col items-center">
                              {/* Inputs */}
                              <div className="flex flex-wrap justify-center gap-2 w-full">
                                {(agent.receivesFrom || []).map((source, i) => (
                                  <div key={i} className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-[10px] font-medium text-gray-600 dark:text-gray-300 shadow-sm text-center">
                                    {source}
                                  </div>
                                ))}
                              </div>
                              
                              {/* Arrow down */}
                              <CurvedLineVertical />
                              
                              {/* Agent Node */}
                              <div className={`px-6 py-3 rounded-xl ${agent.iconColor.replace('text-', 'bg-opacity-10 text-')} border border-current shadow-sm flex items-center gap-2`}>
                                <span className="material-symbols-outlined text-sm">{agent.icon}</span>
                                <span className="text-xs font-bold">{agent.name}</span>
                              </div>
                              
                              {/* Arrow down */}
                              <CurvedLineVertical />
                              
                              {/* Outputs */}
                              <div className="flex flex-wrap justify-center gap-2 w-full">
                                {(agent.reportsTo || []).map((target, i) => (
                                  <div key={i} className="px-3 py-1.5 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-[10px] font-medium text-gray-600 dark:text-gray-300 shadow-sm text-center">
                                    {target}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                          
                          {/* RIGHT SIDE: Structured step-by-step roadmap */}
                          <div className="space-y-4">
                            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">Execution Steps</p>
                            <div className="space-y-3 relative before:absolute before:inset-0 before:ml-3.5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-gray-200 dark:before:via-gray-700 before:to-transparent">
                              {(agent.steps || []).map((step, i) => (
                                <div key={i} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                                  <div className="flex items-center justify-center w-7 h-7 rounded-full border-2 border-white dark:border-gray-900 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 shadow shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                                    <span className="text-[10px] font-bold">{step.num}</span>
                                  </div>
                                  <div className="w-[calc(100%-2.5rem)] md:w-[calc(50%-1.5rem)] p-3 rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-card-dark shadow-sm">
                                    <div className="flex items-center justify-between mb-1">
                                      <h4 className="text-[11px] font-bold text-gray-900 dark:text-white">{step.title}</h4>
                                      <span className={`text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${step.mode === 'Automatic' ? 'bg-green-100 text-green-600' : step.mode === 'Write-enabled' ? 'bg-red-100 text-red-600' : 'bg-orange-100 text-orange-600'}`}>
                                        {step.mode}
                                      </span>
                                    </div>
                                    <p className="text-[10px] text-gray-500 dark:text-gray-400 mb-2">{step.desc}</p>
                                    <div className="flex items-center gap-2 text-[9px] font-mono text-gray-400">
                                      <span className="bg-gray-50 dark:bg-gray-800 px-1 rounded border border-gray-100 dark:border-gray-700">{step.output}</span>
                                      <span className="material-symbols-outlined text-[10px]">arrow_forward</span>
                                      <span className="bg-gray-50 dark:bg-gray-800 px-1 rounded border border-gray-100 dark:border-gray-700">{step.reportsTo}</span>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
