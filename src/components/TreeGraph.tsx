import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Page } from '../types';

export interface GraphNode {
  id: string;
  label: string;
  status: 'healthy' | 'warning' | 'critical';
  context?: string;
  icon?: string;
  timestamp?: string;
}

export interface GraphBranch {
  id: string;
  label: string;
  icon: string;
  page: Page;
  nodes: GraphNode[];
  status: 'healthy' | 'warning' | 'critical';
}

interface TreeGraphProps {
  onNavigate: (page: Page) => void;
  branches: GraphBranch[];
  rootData: {
    orderId: string;
    customerName: string;
    riskLevel: string;
  };
}

const statusColor = (s: string) =>
  s === 'critical' ? '#ef4444' : s === 'warning' ? '#fbbf24' : '#22c55e';
const statusBg = (s: string) =>
  s === 'critical' ? '#fef2f2' : s === 'warning' ? '#fffbeb' : '#f0fdf4';
const statusBorder = (s: string) =>
  s === 'critical' ? '#fecaca' : s === 'warning' ? '#fde68a' : '#bbf7d0';

export default function TreeGraph({ onNavigate, branches, rootData }: TreeGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredBranch, setHoveredBranch] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [scale, setScale] = useState(0.75);
  const [pan, setPan] = useState({ x: 40, y: 0 });
  const isPanning = useRef(false);
  const lastPointer = useRef({ x: 0, y: 0 });

  // ── Layout constants ──────────────────────────────────────────────
  const rootX = 30, rootW = 190, rootH = 110;
  const branchX = 290, branchW = 210, branchH = 86;
  const nodeX = 570, nodeW = 195, nodeH = 30;
  const nodeSpacing = 38;
  const blockGap = 32;

  let curY = 20;
  const layout = branches.map(branch => {
    const nodesH = Math.max(1, branch.nodes.length) * nodeSpacing;
    const blockH = Math.max(branchH + 20, nodesH + 20);
    const bY = curY + blockH / 2;
    curY += blockH + blockGap;
    return { ...branch, bY, blockH };
  });

  const svgH = Math.max(300, curY + 20);
  const svgW = nodeX + nodeW + 40;
  const rootMidY = svgH / 2;

  // ── Pointer-based pan ────────────────────────────────────────────
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    isPanning.current = true;
    lastPointer.current = { x: e.clientX, y: e.clientY };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isPanning.current) return;
    const dx = e.clientX - lastPointer.current.x;
    const dy = e.clientY - lastPointer.current.y;
    lastPointer.current = { x: e.clientX, y: e.clientY };
    setPan(p => ({ x: p.x + dx, y: p.y + dy }));
  }, []);

  const onPointerUp = useCallback(() => {
    isPanning.current = false;
  }, []);

  // ── Wheel zoom ───────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.06 : 0.06;
      setScale(s => Math.min(Math.max(s + delta, 0.25), 2));
    };
    el.addEventListener('wheel', handler, { passive: false });
    return () => el.removeEventListener('wheel', handler);
  }, []);

  // ── Reset on branches change ─────────────────────────────────────
  useEffect(() => {
    setScale(0.75);
    setPan({ x: 40, y: 0 });
  }, [branches.length]);

  return (
    <div
      ref={containerRef}
      className="w-full h-full overflow-hidden relative bg-gray-50 dark:bg-black/20 select-none cursor-grab active:cursor-grabbing"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* Dot-grid background */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.04]"
        style={{
          backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)',
          backgroundSize: `${32 * scale}px ${32 * scale}px`,
          backgroundPosition: `${pan.x}px ${pan.y}px`,
        }}
      />

      {/* Zoom controls */}
      <div className="absolute bottom-4 right-4 z-20 flex flex-col gap-1">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow border border-gray-200 dark:border-gray-700 p-1 flex flex-col gap-1">
          <button onClick={() => setScale(s => Math.min(s + 0.1, 2))} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">
            <span className="material-symbols-outlined text-[18px]">add</span>
          </button>
          <div className="h-px bg-gray-100 dark:bg-gray-700 mx-1" />
          <button onClick={() => setScale(s => Math.max(s - 0.1, 0.25))} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">
            <span className="material-symbols-outlined text-[18px]">remove</span>
          </button>
          <div className="h-px bg-gray-100 dark:bg-gray-700 mx-1" />
          <button onClick={() => { setScale(0.75); setPan({ x: 40, y: 0 }); }} className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">
            <span className="material-symbols-outlined text-[18px]">restart_alt</span>
          </button>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700 px-2 py-1 text-[10px] font-bold text-gray-400 text-center">
          {Math.round(scale * 100)}%
        </div>
      </div>

      {/* Transformable canvas */}
      <div
        style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`, transformOrigin: '0 0', willChange: 'transform' }}
        className="absolute top-0 left-0"
      >
        <svg
          width={svgW}
          height={svgH}
          viewBox={`0 0 ${svgW} ${svgH}`}
          style={{ overflow: 'visible' }}
        >
          {/* ── Lines root → branch (color = branch status) ──── */}
          {layout.map(branch => (
            <path
              key={`r-${branch.id}`}
              d={`M ${rootX + rootW} ${rootMidY} C ${rootX + rootW + 60} ${rootMidY}, ${branchX - 60} ${branch.bY}, ${branchX} ${branch.bY}`}
              fill="none"
              stroke={statusColor(branch.status)}
              strokeWidth={branch.status === 'critical' ? 2.5 : branch.status === 'warning' ? 2 : 1.5}
              strokeDasharray={branch.status === 'critical' ? '6,3' : '0'}
              opacity={0.45}
            />
          ))}

          {/* ── Lines branch → nodes (color = node status) ───── */}
          {layout.map(branch => {
            const startY = branch.bY - ((branch.nodes.length - 1) * nodeSpacing) / 2;
            return branch.nodes.map((node, ni) => {
              const nY = startY + ni * nodeSpacing;
              return (
                <path
                  key={`n-${node.id}`}
                  d={`M ${branchX + branchW} ${branch.bY} C ${branchX + branchW + 40} ${branch.bY}, ${nodeX - 40} ${nY}, ${nodeX} ${nY + nodeH / 2}`}
                  fill="none"
                  stroke={statusColor(node.status)}
                  strokeWidth={node.status === 'critical' ? 2 : node.status === 'warning' ? 1.5 : 1}
                  strokeDasharray={node.status === 'critical' ? '5,3' : '0'}
                  opacity={0.5}
                />
              );
            });
          })}

          {/* ── Root node ─────────────────────────────────────── */}
          <g>
            <rect x={rootX} y={rootMidY - rootH / 2} width={rootW} height={rootH} rx={14} fill="white" stroke="#ef4444" strokeWidth={2} />
            <text x={rootX + rootW / 2} y={rootMidY - 26} textAnchor="middle" fontSize={9} fontWeight="700" fill="#9ca3af" letterSpacing="1">CASE ROOT</text>
            <text x={rootX + rootW / 2} y={rootMidY - 4} textAnchor="middle" fontSize={15} fontWeight="800" fill="#111827">{rootData.orderId}</text>
            <text x={rootX + rootW / 2} y={rootMidY + 16} textAnchor="middle" fontSize={12} fontWeight="600" fill="#374151">{rootData.customerName}</text>
            <text x={rootX + rootW / 2} y={rootMidY + 32} textAnchor="middle" fontSize={9} fill="#9ca3af" letterSpacing="0.5">{rootData.riskLevel}</text>
          </g>

          {/* ── Branch nodes ──────────────────────────────────── */}
          {layout.map(branch => {
            const isHovered = hoveredBranch === branch.id;
            const startY = branch.bY - ((branch.nodes.length - 1) * nodeSpacing) / 2;

            return (
              <g key={branch.id}>
                {/* Branch card */}
                <g
                  style={{ cursor: 'pointer' }}
                  onMouseEnter={() => setHoveredBranch(branch.id)}
                  onMouseLeave={() => setHoveredBranch(null)}
                  onPointerDown={e => e.stopPropagation()}
                  onClick={() => onNavigate(branch.page)}
                >
                  <rect
                    x={branchX} y={branch.bY - branchH / 2}
                    width={branchW} height={branchH} rx={14}
                    fill={isHovered ? statusBg(branch.status) : 'white'}
                    stroke={statusBorder(branch.status)}
                    strokeWidth={isHovered || branch.status === 'critical' ? 2 : 1}
                  />
                  {/* Icon pill */}
                  <rect x={branchX + 12} y={branch.bY - 20} width={40} height={40} rx={10} fill={statusBg(branch.status)} opacity={0.7} />
                  <foreignObject x={branchX + 14} y={branch.bY - 18} width={36} height={36} style={{ pointerEvents: 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 20, color: statusColor(branch.status) }}>{branch.icon}</span>
                    </div>
                  </foreignObject>
                  <text x={branchX + 62} y={branch.bY - 8} fontSize={13} fontWeight="700" fill="#111827">{branch.label}</text>
                  <text x={branchX + 62} y={branch.bY + 11} fontSize={10} fill="#9ca3af" letterSpacing="0.3">
                    {branch.status.toUpperCase()} · {branch.nodes.length} node{branch.nodes.length !== 1 ? 's' : ''}
                  </text>
                </g>

                {/* Sub-nodes */}
                {branch.nodes.map((node, ni) => {
                  const nY = startY + ni * nodeSpacing;
                  const isNodeHovered = hoveredNode === node.id;

                  return (
                    <g key={node.id}
                      onMouseEnter={e => { e.stopPropagation(); setHoveredNode(node.id); }}
                      onMouseLeave={() => setHoveredNode(null)}
                      onPointerDown={e => e.stopPropagation()}
                    >
                      <rect
                        x={nodeX} y={nY}
                        width={nodeW} height={nodeH} rx={7}
                        fill={isNodeHovered ? statusBg(node.status) : 'white'}
                        stroke={statusBorder(node.status)}
                        strokeWidth={node.status === 'critical' ? 1.5 : 0.75}
                      />
                      <foreignObject x={nodeX + 7} y={nY + 6} width={18} height={18} style={{ pointerEvents: 'none' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', height: '100%' }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 12, color: statusColor(node.status) }}>{node.icon || 'circle'}</span>
                        </div>
                      </foreignObject>
                      <text x={nodeX + 30} y={nY + nodeH / 2 + 4} fontSize={11} fill="#374151">
                        {node.label.length > 24 ? node.label.slice(0, 22) + '…' : node.label}
                      </text>

                      {/* Tooltip */}
                      {isNodeHovered && node.context && (
                        <g>
                          <rect x={nodeX + nodeW + 8} y={nY - 4} width={160} height={38} rx={6} fill="#111827" />
                          <foreignObject x={nodeX + nodeW + 12} y={nY} width={152} height={30} style={{ pointerEvents: 'none' }}>
                            <div style={{ fontSize: 10, color: 'white', lineHeight: '1.3' }}>{node.context}</div>
                          </foreignObject>
                        </g>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
