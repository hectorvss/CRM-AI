import React, { useState } from 'react';
import { Page } from '../types';
import { motion, AnimatePresence } from 'motion/react';

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

export default function TreeGraph({ onNavigate, branches, rootData }: TreeGraphProps) {
  const [hoveredBranch, setHoveredBranch] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy': return '#22c55e'; // green-500
      case 'warning': return '#fbbf24'; // amber-400
      case 'critical': return '#ef4444'; // red-500
      default: return '#94a3b8'; // slate-400
    }
  };

  const getStatusBg = (status: string) => {
    switch (status) {
      case 'healthy': return '#f0fdf4'; // green-50
      case 'warning': return '#fffbeb'; // amber-50
      case 'critical': return '#fef2f2'; // red-50
      default: return '#f8fafc'; // slate-50
    }
  };

  const getStatusBorder = (status: string) => {
    switch (status) {
      case 'healthy': return '#bbf7d0'; // green-200
      case 'warning': return '#fde68a'; // amber-200
      case 'critical': return '#fecaca'; // red-200
      default: return '#e2e8f0'; // slate-200
    }
  };

  // Layout constants
  const startX = 60;
  const branchX = 320;
  const nodeX = 620;
  const nodeSpacing = 48;
  const verticalGap = 40;

  let currentY = 50;
  const branchLayouts = branches.map((branch) => {
    const nodesHeight = branch.nodes.length * nodeSpacing;
    const blockHeight = Math.max(110, nodesHeight);
    const bY = currentY + blockHeight / 2;
    currentY += blockHeight + verticalGap;
    return { ...branch, bY, nodesHeight };
  });

  const totalHeight = currentY;
  const midY = totalHeight / 2;

  const [scale, setScale] = useState(0.8);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const containerRef = React.useRef<HTMLDivElement>(null);

  const handleZoomIn = () => setScale(prev => Math.min(prev + 0.1, 2));
  const handleZoomOut = () => setScale(prev => Math.max(prev - 0.1, 0.2));
  const handleReset = () => {
    setScale(0.8);
    setPosition({ x: 0, y: 0 });
  };

  React.useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.05 : 0.05;
        setScale(prev => Math.min(Math.max(prev + delta, 0.2), 2));
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  return (
    <div 
      ref={containerRef}
      className="w-full h-full bg-gray-50 dark:bg-black/20 overflow-hidden relative cursor-grab active:cursor-grabbing select-none"
    >
      {/* Grid Background */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-[0.03] dark:opacity-[0.05]"
        style={{
          backgroundImage: `radial-gradient(circle, currentColor 1px, transparent 1px)`,
          backgroundSize: `${40 * scale}px ${40 * scale}px`,
          backgroundPosition: `${position.x}px ${position.y}px`,
          color: 'inherit'
        }}
      />

      {/* Zoom Controls */}
      <div className="absolute bottom-6 right-6 z-20 flex flex-col gap-2">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 p-1 flex flex-col gap-1">
          <button 
            onClick={handleZoomIn}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all"
            title="Zoom In"
          >
            <span className="material-symbols-outlined text-xl">add</span>
          </button>
          <div className="h-px bg-gray-100 dark:bg-gray-700 mx-1" />
          <button 
            onClick={handleZoomOut}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all"
            title="Zoom Out"
          >
            <span className="material-symbols-outlined text-xl">remove</span>
          </button>
          <div className="h-px bg-gray-100 dark:bg-gray-700 mx-1" />
          <button 
            onClick={handleReset}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all"
            title="Reset View"
          >
            <span className="material-symbols-outlined text-xl">restart_alt</span>
          </button>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-[10px] font-bold text-gray-400 uppercase tracking-widest text-center">
          {Math.round(scale * 100)}%
        </div>
      </div>

      <motion.div
        drag
        dragMomentum={false}
        animate={{ x: position.x, y: position.y, scale }}
        onDragEnd={(_, info) => {
          setPosition({
            x: position.x + info.offset.x,
            y: position.y + info.offset.y
          });
        }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className="w-full h-full flex items-center justify-center origin-center"
      >
        <svg 
          viewBox={`0 0 1000 ${totalHeight + 100}`} 
          className="w-full h-full max-w-[1400px] overflow-visible drop-shadow-2xl"
        >
          {/* Connection Lines from Root to Branches */}
          {branchLayouts.map((branch) => {
          const bY = branch.bY;
          const isCritical = branch.status === 'critical';
          const isHovered = hoveredBranch === branch.id;

          return (
            <g key={`line-root-${branch.id}`}>
              <motion.path
                d={`M ${startX + 200} ${midY} C ${startX + 260} ${midY}, ${branchX - 60} ${bY}, ${branchX} ${bY}`}
                fill="none"
                stroke={isCritical ? '#fecaca' : '#f1f5f9'}
                strokeWidth={isCritical ? 3 : 2}
                strokeDasharray={isCritical ? "8,4" : "0"}
                initial={{ pathLength: 0 }}
                animate={{ 
                  pathLength: 1,
                  stroke: isHovered ? getStatusBorder(branch.status) : (isCritical ? '#fecaca' : '#f1f5f9'),
                  strokeWidth: isHovered || isCritical ? 3 : 2
                }}
              />
            </g>
          );
        })}

        {/* Connection Lines from Branches to Nodes */}
        {branchLayouts.map((branch) => {
          const bY = branch.bY;
          const startY = bY - (branch.nodes.length * nodeSpacing) / 2 + (nodeSpacing / 2);
          return branch.nodes.map((node, nIndex) => {
            const nY = startY + (nIndex * nodeSpacing);
            const isHovered = hoveredNode === node.id || hoveredBranch === branch.id;

            return (
              <g key={`line-node-${node.id}`}>
                <motion.path
                  d={`M ${branchX + 220} ${bY} C ${branchX + 260} ${bY}, ${nodeX - 40} ${nY}, ${nodeX} ${nY}`}
                  fill="none"
                  stroke={isHovered ? getStatusBorder(node.status) : '#f8fafc'}
                  strokeWidth={1.5}
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                />
              </g>
            );
          });
        })}

        {/* Root Node: Order */}
        <g className="cursor-default">
          <rect
            x={startX}
            y={midY - 60}
            width={200}
            height={120}
            rx={16}
            fill="white"
            stroke="#ef4444"
            strokeWidth={2}
            className="shadow-lg"
          />
          <text x={startX + 100} y={midY - 30} textAnchor="middle" className="text-[10px] font-bold fill-gray-400 uppercase tracking-widest">Case Root</text>
          <text x={startX + 100} y={midY - 5} textAnchor="middle" className="text-[18px] font-black fill-gray-900">{rootData.orderId}</text>
          <text x={startX + 100} y={midY + 20} textAnchor="middle" className="text-[12px] font-bold fill-gray-800">{rootData.customerName}</text>
          <text x={startX + 100} y={midY + 38} textAnchor="middle" className="text-[9px] font-medium fill-gray-400 uppercase tracking-wider">{rootData.riskLevel}</text>
        </g>

        {/* Branch Nodes */}
        {branchLayouts.map((branch) => {
          const bY = branch.bY;
          const isHovered = hoveredBranch === branch.id;
          const startY = bY - (branch.nodes.length * nodeSpacing) / 2 + (nodeSpacing / 2);

          return (
            <g 
              key={branch.id} 
              className="cursor-pointer"
              onMouseEnter={() => setHoveredBranch(branch.id)}
              onMouseLeave={() => setHoveredBranch(null)}
              onClick={() => onNavigate(branch.page)}
            >
              <motion.g animate={{ scale: isHovered ? 1.02 : 1 }}>
                <rect
                  x={branchX}
                  y={bY - 48}
                  width={220}
                  height={96}
                  rx={16}
                  fill={isHovered ? getStatusBg(branch.status) : "white"}
                  stroke={getStatusBorder(branch.status)}
                  strokeWidth={isHovered || branch.status === 'critical' ? 2 : 1}
                  className="shadow-sm"
                />
                
                {/* Icon Box */}
                <rect
                  x={branchX + 16}
                  y={bY - 24}
                  width={48}
                  height={48}
                  rx={12}
                  fill={getStatusBg(branch.status)}
                  className="opacity-50"
                />
                <foreignObject x={branchX + 20} y={bY - 20} width={40} height={40} className="pointer-events-none">
                   <div className="flex items-center justify-center w-full h-full">
                      <span className="material-symbols-outlined text-[24px]" style={{ color: getStatusColor(branch.status), fontVariationSettings: '"wght" 200' }}>
                        {branch.icon}
                      </span>
                   </div>
                </foreignObject>

                <text
                  x={branchX + 80}
                  y={bY - 5}
                  textAnchor="start"
                  className="text-[15px] font-bold fill-gray-900 dark:fill-white pointer-events-none"
                >
                  {branch.label}
                </text>
                <text
                  x={branchX + 80}
                  y={bY + 14}
                  textAnchor="start"
                  className="text-[11px] font-medium fill-gray-400 pointer-events-none uppercase tracking-wider"
                >
                  {branch.status} · {branch.nodes.length} nodes
                </text>
              </motion.g>

              {/* Sub-nodes (Mini cards next to branch) */}
              {branch.nodes.map((node, nIndex) => {
                const nY = startY + (nIndex * nodeSpacing);
                const isNodeHovered = hoveredNode === node.id;

                return (
                  <g 
                    key={node.id}
                    onMouseEnter={(e) => {
                      e.stopPropagation();
                      setHoveredNode(node.id);
                    }}
                    onMouseLeave={() => setHoveredNode(null)}
                  >
                    <rect
                      x={nodeX}
                      y={nY - 16}
                      width={200}
                      height={32}
                      rx={8}
                      fill={isNodeHovered ? getStatusBg(node.status) : "white"}
                      stroke={getStatusBorder(node.status)}
                      strokeWidth={node.status === 'critical' ? 1.5 : 0.5}
                      className="shadow-sm"
                    />
                    <foreignObject x={nodeX + 8} y={nY - 8} width={16} height={16}>
                      <div className="flex items-center justify-center w-full h-full">
                        <span 
                          className="material-symbols-outlined text-[12px] opacity-70" 
                          style={{ 
                            color: getStatusColor(node.status),
                            fontVariationSettings: '"wght" 200'
                          }}
                        >
                          {node.icon || 'circle'}
                        </span>
                      </div>
                    </foreignObject>
                    <text
                      x={nodeX + 30}
                      y={nY + 4}
                      className="text-[11px] font-medium fill-gray-700"
                    >
                      {node.label.length > 26 ? node.label.substring(0, 24) + '...' : node.label}
                    </text>
                    
                    {/* Tooltip on hover */}
                    <AnimatePresence>
                      {isNodeHovered && (
                        <motion.g
                          initial={{ opacity: 0, x: 10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 10 }}
                        >
                          <rect
                            x={nodeX + 210}
                            y={nY - 16}
                            width={120}
                            height={32}
                            rx={4}
                            fill="#111827"
                            className="shadow-xl"
                          />
                          <text x={nodeX + 220} y={nY + 4} className="text-[10px] fill-white font-medium">
                            {node.context}
                          </text>
                        </motion.g>
                      )}
                    </AnimatePresence>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </motion.div>
  </div>
);
}
