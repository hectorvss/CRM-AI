/**
 * AgentNetworkGraph.tsx
 *
 * n8n-style network visualization for AI Studio agents.
 * Renders the real connections (receivesFrom / reportsTo / uses / steps)
 * as a node graph with curved SVG bezier connections.
 *
 * Layout (responsive — fills the parent container width):
 *   ┌────────────┐                                    ┌────────────┐
 *   │ Source 1   │──╮                              ╭──│ Target 1   │
 *   ├────────────┤  │      ┌──────────────────┐    │  ├────────────┤
 *   │ Source 2   │──┼─────▶│   AGENT (big)    │────┼──│ Target 2   │
 *   ├────────────┤  │      │   icon + name    │    │  ├────────────┤
 *   │ Source 3   │──╯      └─────────┬────────┘    ╰──│ Target N   │
 *   └────────────┘                   │                └────────────┘
 *                          ┌──────────┴──────────┐
 *                          ▼                     ▼
 *                    [Tool 1] [Tool 2] [Tool 3]   (uses — dashed)
 *
 *   Execution path (sub-flow):  [Step 1] ─▶ [Step 2] ─▶ [Step 3] ─▶ ...
 *
 * Pure visual component — no data fetching.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AgentRoadmap {
  receivesFrom: string[];
  uses: string[];
  reportsTo: string[];
  writesTo: string[];
  blockedBy: string[];
  steps: Array<{
    num?: number;
    title: string;
    desc?: string;
    output?: string;
    reportsTo?: string;
    mode?: string;
  }>;
  summary: string;
  role: string;
}

export interface AgentMeta {
  name: string;
  icon: string;
  iconColor: string;
  active?: boolean;
}

interface Props {
  agent: AgentMeta;
  roadmap: AgentRoadmap;
}

// ─── Layout constants (node sizes stay fixed; column gaps are dynamic) ─────

const NODE_W = 184;
const NODE_H = 54;
const NODE_GAP_Y = 14;

const AGENT_W = 240;
const AGENT_H = 96;

const TOOL_GAP_Y = 70;
const TOOL_W = 130;
const TOOL_H = 56;
const TOOL_GAP_X = 14;

const PADDING_X = 24;
const PADDING_Y = 32;

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Cubic Bezier path between two points, n8n-style smooth horizontal curve. */
function bezierH(x1: number, y1: number, x2: number, y2: number) {
  const dx = Math.max(40, Math.abs(x2 - x1) * 0.5);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

/** Cubic Bezier path top-down (vertical), used for tool dangling connections. */
function bezierV(x1: number, y1: number, x2: number, y2: number) {
  const dy = Math.max(28, Math.abs(y2 - y1) * 0.5);
  return `M ${x1} ${y1} C ${x1} ${y1 + dy}, ${x2} ${y2 - dy}, ${x2} ${y2}`;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function AgentNetworkGraph({ agent, roadmap }: Props) {
  const sources = roadmap.receivesFrom.slice(0, 6);
  const targets = roadmap.reportsTo.slice(0, 6);
  const tools = roadmap.uses.slice(0, 6);
  const steps = roadmap.steps;

  // ─── Track container width so the graph fills available horizontal space ──

  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(1200);

  useEffect(() => {
    if (!containerRef.current) return;
    const update = () => {
      if (containerRef.current) {
        // subtract internal padding (p-4 = 16px on each side = 32px total)
        const w = containerRef.current.offsetWidth - 32;
        if (w > 0) setContainerWidth(w);
      }
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // ─── Compute coordinates ──────────────────────────────────────────────────

  const layout = useMemo(() => {
    const usableW = Math.max(900, containerWidth);

    const lanesH = Math.max(sources.length, targets.length, 1) * (NODE_H + NODE_GAP_Y) - NODE_GAP_Y;
    const canvasH = Math.max(lanesH, AGENT_H) + TOOL_GAP_Y + TOOL_H + 60;

    // x columns (responsive)
    const sourceX = PADDING_X;
    const targetX = usableW - PADDING_X - NODE_W;
    const agentX = (sourceX + NODE_W + targetX) / 2 - AGENT_W / 2;

    // y center for agent
    const agentY = PADDING_Y + Math.max(0, (lanesH - AGENT_H) / 2);

    // source positions (vertical center within lanes block)
    const sourceTotalH = sources.length * (NODE_H + NODE_GAP_Y) - NODE_GAP_Y;
    const sourceStartY = PADDING_Y + Math.max(0, (Math.max(lanesH, AGENT_H) - sourceTotalH) / 2);
    const sourcePos = sources.map((label, i) => ({
      label,
      x: sourceX,
      y: sourceStartY + i * (NODE_H + NODE_GAP_Y),
    }));

    // target positions
    const targetTotalH = targets.length * (NODE_H + NODE_GAP_Y) - NODE_GAP_Y;
    const targetStartY = PADDING_Y + Math.max(0, (Math.max(lanesH, AGENT_H) - targetTotalH) / 2);
    const targetPos = targets.map((label, i) => ({
      label,
      x: targetX,
      y: targetStartY + i * (NODE_H + NODE_GAP_Y),
    }));

    // tool positions (centered under agent)
    const toolsRowW = tools.length * (TOOL_W + TOOL_GAP_X) - TOOL_GAP_X;
    const toolsStartX = agentX + AGENT_W / 2 - toolsRowW / 2;
    const toolY = agentY + AGENT_H + TOOL_GAP_Y;
    const toolPos = tools.map((label, i) => ({
      label,
      x: toolsStartX + i * (TOOL_W + TOOL_GAP_X),
      y: toolY,
    }));

    return {
      canvasW: usableW,
      canvasH,
      agentX,
      agentY,
      sourceX,
      targetX,
      sourcePos,
      targetPos,
      toolPos,
      toolY,
    };
  }, [sources, targets, tools, containerWidth]);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      className="relative mt-5 w-full overflow-hidden rounded-[18px] border border-[#e9eae6] bg-white p-4"
    >
      {/* dotted grid background */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.18] [background-image:radial-gradient(circle,#d1d5db_1px,transparent_1px)] [background-size:18px_18px] dark:opacity-[0.10]" />

      <div
        className="relative w-full"
        style={{ height: `${layout.canvasH}px`, minWidth: '900px' }}
      >
        {/* ─── SVG connectors layer ───────────────────────────────────────── */}
        <svg
          width={layout.canvasW}
          height={layout.canvasH}
          className="absolute inset-0 pointer-events-none"
          style={{ zIndex: 1 }}
        >
          <defs>
            <marker id="agArrowIn" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#a78bfa" />
            </marker>
            <marker id="agArrowOut" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#60a5fa" />
            </marker>
            <marker id="agArrowTool" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#9ca3af" />
            </marker>
          </defs>

          {/* sources → agent */}
          {layout.sourcePos.map((s, i) => {
            const x1 = s.x + NODE_W;
            const y1 = s.y + NODE_H / 2;
            const x2 = layout.agentX;
            const y2 = layout.agentY + AGENT_H / 2;
            return (
              <path
                key={`src-${i}`}
                d={bezierH(x1, y1, x2, y2)}
                stroke="#a78bfa"
                strokeWidth="2"
                fill="none"
                strokeLinecap="round"
                markerEnd="url(#agArrowIn)"
                opacity="0.85"
              />
            );
          })}

          {/* agent → targets */}
          {layout.targetPos.map((t, i) => {
            const x1 = layout.agentX + AGENT_W;
            const y1 = layout.agentY + AGENT_H / 2;
            const x2 = t.x;
            const y2 = t.y + NODE_H / 2;
            return (
              <path
                key={`tgt-${i}`}
                d={bezierH(x1, y1, x2, y2)}
                stroke="#60a5fa"
                strokeWidth="2"
                fill="none"
                strokeLinecap="round"
                markerEnd="url(#agArrowOut)"
                opacity="0.85"
              />
            );
          })}

          {/* agent → tools (dashed) */}
          {layout.toolPos.map((tool, i) => {
            const x1 = layout.agentX + AGENT_W / 2;
            const y1 = layout.agentY + AGENT_H;
            const x2 = tool.x + TOOL_W / 2;
            const y2 = tool.y;
            return (
              <path
                key={`tool-${i}`}
                d={bezierV(x1, y1, x2, y2)}
                stroke="#9ca3af"
                strokeWidth="1.5"
                fill="none"
                strokeDasharray="4 4"
                strokeLinecap="round"
                markerEnd="url(#agArrowTool)"
                opacity="0.7"
              />
            );
          })}
        </svg>

        {/* ─── Source nodes (Receives From) ───────────────────────────────── */}
        {layout.sourcePos.map((s, i) => (
          <div
            key={`src-${i}`}
            className="absolute group"
            style={{ left: `${s.x}px`, top: `${s.y}px`, width: `${NODE_W}px`, height: `${NODE_H}px`, zIndex: 2 }}
          >
            <div className="flex h-full items-center gap-2 rounded-[8px] border border-[#e9eae6]/60 bg-white px-3 py-2 shadow-[0px_1px_2px_rgba(20,20,20,0.04)] transition-all hover:border-[#e9eae6] hover:shadow-[0px_1px_4px_rgba(20,20,20,0.08)] dark:border-[#e9eae6] dark:bg-[#1d1d1d]">
              <div className="flex h-6 w-6 flex-none items-center justify-center rounded-[6px] bg-[#ededea] text-[#1a1a1a] dark:bg-[#dc2626]/20 dark:text-violet-300">
                <span className="material-symbols-outlined text-[14px]">input</span>
              </div>
              <p className="line-clamp-2 text-[11px] font-semibold text-[#1a1a1a] leading-tight">
                {s.label}
              </p>
              <span className="absolute -right-1 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full border border-[#e9eae6] bg-white dark:bg-[#1d1d1d]" />
            </div>
          </div>
        ))}

        {sources.length > 0 && (
          <div
            className="absolute text-[9px] font-bold uppercase tracking-[0.2em] text-[#1a1a1a]/80"
            style={{ left: `${layout.sourceX}px`, top: `${PADDING_Y - 16}px` }}
          >
            Receives from
          </div>
        )}

        {/* ─── Agent node ─────────────────────────────────────────────────── */}
        <div
          className="absolute"
          style={{ left: `${layout.agentX}px`, top: `${layout.agentY}px`, width: `${AGENT_W}px`, height: `${AGENT_H}px`, zIndex: 3 }}
        >
          <div className="relative flex h-full flex-col items-center justify-center rounded-[12px] border-2 border-[#e9eae6] bg-gradient-to-b from-white to-violet-50/40 px-4 py-3 text-center shadow-lg shadow-violet-500/10 ring-1 ring-violet-500/20 dark:border-[#e9eae6]/60 dark:from-[#1f1b2e] dark:to-[#1d1d1d]">
            <div className={`flex h-10 w-10 items-center justify-center rounded-[12px] bg-white/70 ${agent.iconColor} shadow-[0px_1px_2px_rgba(20,20,20,0.04)] dark:bg-white/10`}>
              <span className="material-symbols-outlined text-[22px]">{agent.icon}</span>
            </div>
            <h4 className="mt-1.5 text-[13px] font-bold text-[#1a1a1a] leading-tight">
              {agent.name}
            </h4>
            <p className="mt-0.5 px-1 text-[9px] font-medium uppercase tracking-wider text-[#1a1a1a]/80 dark:text-violet-300/80">
              {agent.active ? '● Live' : '○ Paused'}
            </p>
            <span className="absolute -left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-[#e9eae6] bg-white dark:bg-[#1d1d1d]" />
            <span className="absolute -right-1.5 top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border-2 border-[#e9eae6] bg-white dark:bg-[#1d1d1d]" />
            {tools.length > 0 && (
              <span className="absolute -bottom-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rounded-full border-2 border-gray-400 bg-white dark:bg-[#1d1d1d]" />
            )}
          </div>
        </div>

        {/* ─── Target nodes (Reports To) ──────────────────────────────────── */}
        {layout.targetPos.map((t, i) => (
          <div
            key={`tgt-${i}`}
            className="absolute group"
            style={{ left: `${t.x}px`, top: `${t.y}px`, width: `${NODE_W}px`, height: `${NODE_H}px`, zIndex: 2 }}
          >
            <div className="flex h-full items-center gap-2 rounded-[8px] border border-[#e9eae6]/60 bg-white px-3 py-2 shadow-[0px_1px_2px_rgba(20,20,20,0.04)] transition-all hover:border-[#e9eae6] hover:shadow-[0px_1px_4px_rgba(20,20,20,0.08)] dark:border-[#e9eae6]/30 dark:bg-[#1d1d1d]">
              <span className="absolute -left-1 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full border border-[#e9eae6] bg-white dark:bg-[#1d1d1d]" />
              <div className="flex h-6 w-6 flex-none items-center justify-center rounded-[6px] bg-[#ededea] text-[#1a1a1a] dark:bg-[#1a1a1a]/20 dark:text-blue-300">
                <span className="material-symbols-outlined text-[14px]">output</span>
              </div>
              <p className="line-clamp-2 text-[11px] font-semibold text-[#1a1a1a] leading-tight">
                {t.label}
              </p>
            </div>
          </div>
        ))}

        {targets.length > 0 && (
          <div
            className="absolute text-[9px] font-bold uppercase tracking-[0.2em] text-[#1a1a1a]/80"
            style={{ left: `${layout.targetX}px`, top: `${PADDING_Y - 16}px` }}
          >
            Reports to
          </div>
        )}

        {/* ─── Tool nodes (Uses — dangling under agent) ───────────────────── */}
        {layout.toolPos.map((tool, i) => (
          <div
            key={`tool-${i}`}
            className="absolute"
            style={{ left: `${tool.x}px`, top: `${tool.y}px`, width: `${TOOL_W}px`, height: `${TOOL_H}px`, zIndex: 2 }}
          >
            <div className="flex h-full flex-col items-center justify-center rounded-[8px] border border-dashed border-[#dcdcd9] bg-[#f8f8f7] px-2 py-1 text-center shadow-[0px_1px_2px_rgba(20,20,20,0.04)] transition-all hover:border-gray-500 hover:shadow-[0px_1px_4px_rgba(20,20,20,0.08)] dark:border-gray-600 dark:bg-[#1d1d1d]">
              <span className="material-symbols-outlined text-[14px] text-[#646462] dark:text-[#a4a4a2]">
                build_circle
              </span>
              <p className="mt-0.5 line-clamp-2 text-[10px] font-medium leading-tight text-[#646462] dark:text-[#a4a4a2]">
                {tool.label}
              </p>
              <span className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full border border-gray-400 bg-white dark:bg-[#1d1d1d]" />
            </div>
          </div>
        ))}

        {tools.length > 0 && (
          <div
            className="absolute text-[9px] font-bold uppercase tracking-[0.2em] text-[#a4a4a2]"
            style={{ left: `${layout.toolPos[0].x}px`, top: `${layout.toolY + TOOL_H + 8}px` }}
          >
            Uses (tools / state)
          </div>
        )}
      </div>

      {/* ─── Execution path (sub-flow) ────────────────────────────────────── */}
      {steps.length > 0 && (
        <div className="relative mt-6 rounded-[12px] border border-[#e9eae6] bg-gradient-to-br from-gray-50 to-white p-4 dark:from-[#1a1a1a] dark:to-[#1d1d1d]">
          <p className="text-center text-[10px] font-bold uppercase tracking-widest text-[#a4a4a2]">Execution path</p>
          <div className="mt-3 overflow-x-auto custom-scrollbar">
            <div className="flex min-w-max items-center justify-center mx-auto">
            {steps.map((step, index) => (
              <React.Fragment key={`${step.num}-${step.title}`}>
                <div className="relative w-[200px] flex-none rounded-[8px] border border-[#e9eae6] bg-white p-3 shadow-[0px_1px_2px_rgba(20,20,20,0.04)] dark:border-[#e9eae6] dark:bg-[#242424]">
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-[#dc2626] text-[10px] font-bold text-white">
                      {step.num ?? index + 1}
                    </span>
                    {step.mode && (
                      <span className="rounded-full bg-[#ededea] px-2 py-0.5 text-[8px] font-mono uppercase tracking-[0.6px] text-[#646462] dark:text-[#a4a4a2]">
                        {step.mode}
                      </span>
                    )}
                  </div>
                  <p className="text-[12px] font-bold text-[#1a1a1a] leading-snug">
                    {step.title}
                  </p>
                  {step.desc && (
                    <p className="mt-1 text-[10px] leading-snug text-[#646462] dark:text-[#a4a4a2]">
                      {step.desc}
                    </p>
                  )}
                </div>
                {index < steps.length - 1 && (
                  <div className="relative flex h-12 w-10 flex-none items-center justify-center">
                    <svg width="40" height="48" className="overflow-visible">
                      <path
                        d="M 4 24 C 16 24, 24 24, 36 24"
                        stroke="#a78bfa"
                        strokeWidth="2"
                        fill="none"
                        strokeLinecap="round"
                        markerEnd="url(#agArrowIn)"
                      />
                    </svg>
                  </div>
                )}
              </React.Fragment>
            ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── Legend ───────────────────────────────────────────────────────── */}
      <div className="relative mt-4 flex flex-wrap items-center gap-3 text-[10px] text-[#646462] dark:text-[#a4a4a2]">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-5 bg-violet-400"></span> Receives
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-5 bg-[#1a1a1a]"></span> Reports
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-5 border-t border-dashed border-gray-400"></span> Uses (tools)
        </span>
        <span className="ml-auto text-[10px] font-medium">
          {sources.length} input{sources.length !== 1 ? 's' : ''} · {targets.length} output{targets.length !== 1 ? 's' : ''} · {tools.length} tool{tools.length !== 1 ? 's' : ''} · {steps.length} step{steps.length !== 1 ? 's' : ''}
        </span>
      </div>
    </div>
  );
}
