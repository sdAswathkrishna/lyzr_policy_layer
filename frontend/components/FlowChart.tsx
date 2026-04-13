"use client";

import { useCallback, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  Connection,
  Edge,
  Node,
  NodeProps,
  Handle,
  Position,
  MarkerType,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AgentDetail {
  id?: string;   // lives on Node.id; optional in data payload
  label: string;
  type: "trigger" | "agent" | "policy" | "lyzr-native" | "output" | "tool";
  description?: string;
  role?: string;
  goal?: string;
  instructions?: string;
  model?: string;
  temperature?: number;
  top_p?: number;
  tools?: string[];
  policies?: { scope: string; name: string; effect: string; raw_nl: string }[];
  meta?: Record<string, string>;
  [key: string]: unknown; // required by ReactFlow Node.data typing
}

// ── Custom Node: Trigger ───────────────────────────────────────────────────────

function TriggerNode({ data }: NodeProps) {
  const d = data as unknown as AgentDetail;
  return (
    <div
      className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-stone-300 bg-stone-100 shadow-sm cursor-pointer select-none min-w-[160px]"
      style={{ fontFamily: "inherit" }}
    >
      <span className="text-stone-500 text-xs">▶</span>
      <span className="text-sm font-medium text-stone-700">{d.label}</span>
      <Handle type="source" position={Position.Right} className="!bg-stone-400 !w-2.5 !h-2.5" />
    </div>
  );
}

// ── Custom Node: Output ────────────────────────────────────────────────────────

function OutputNode({ data }: NodeProps) {
  const d = data as unknown as AgentDetail;
  return (
    <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-stone-300 bg-stone-100 shadow-sm select-none min-w-[160px]">
      <Handle type="target" position={Position.Left} className="!bg-stone-400 !w-2.5 !h-2.5" />
      <span className="text-stone-500 text-xs">■</span>
      <span className="text-sm font-medium text-stone-700">{d.label}</span>
    </div>
  );
}

// ── Custom Node: Lyzr Native ───────────────────────────────────────────────────

function LyzrNativeNode({ data }: NodeProps) {
  const d = data as unknown as AgentDetail;
  return (
    <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-amber-300 bg-amber-50 shadow-sm select-none min-w-[160px]">
      <Handle type="target" position={Position.Left} className="!bg-amber-400 !w-2.5 !h-2.5" />
      <span className="text-amber-600 text-xs">◆</span>
      <span className="text-sm font-medium text-amber-800">{d.label}</span>
      <span className="ml-auto text-[10px] text-amber-500 bg-amber-100 px-1.5 rounded">Lyzr</span>
      <Handle type="source" position={Position.Right} className="!bg-amber-400 !w-2.5 !h-2.5" />
    </div>
  );
}

// ── Custom Node: Policy Layer (POC) ───────────────────────────────────────────

function PolicyNode({ data, selected }: NodeProps) {
  const d = data as unknown as AgentDetail;
  return (
    <div
      className={`px-4 py-2.5 rounded-xl border-2 border-indigo-400 bg-indigo-50 text-indigo-800 shadow-sm cursor-pointer select-none min-w-[200px] transition-all ${selected ? "ring-2 ring-offset-1 ring-indigo-400" : ""}`}
    >
      <Handle type="target" position={Position.Left} className="!bg-current !w-2.5 !h-2.5" />
      <p className="text-sm font-semibold">{d.label}</p>
      {d.description && <p className="text-[11px] opacity-70 mt-0.5">{d.description}</p>}
      <span className="text-[10px] mt-1 inline-block bg-white/60 px-1.5 rounded font-medium">POC control-plane</span>
      <Handle type="source" position={Position.Right} className="!bg-current !w-2.5 !h-2.5" />
    </div>
  );
}

// ── Custom Node: Agent ────────────────────────────────────────────────────────

function AgentNode({ data, selected }: NodeProps) {
  const d = data as unknown as AgentDetail;
  return (
    <div
      className={`px-4 py-3 rounded-xl border-2 border-stone-700 bg-white shadow-md cursor-pointer select-none min-w-[200px] transition-all ${selected ? "ring-2 ring-offset-2 ring-indigo-400" : ""}`}
    >
      <Handle type="target" position={Position.Left} className="!bg-stone-600 !w-2.5 !h-2.5" />
      <div className="flex items-center gap-2">
        <span className="flex items-center justify-center w-6 h-6 rounded bg-stone-900 text-white text-xs font-bold">L</span>
        <span className="text-sm font-semibold text-stone-800">{d.label}</span>
      </div>
      {d.model && <p className="text-[11px] text-stone-400 mt-1">{d.model} · temp {d.temperature}</p>}
      <Handle type="source" position={Position.Right} className="!bg-stone-600 !w-2.5 !h-2.5" />
      <Handle type="source" position={Position.Bottom} id="tool-out" className="!bg-stone-400 !w-2 !h-2" />
    </div>
  );
}

// ── Custom Node: Tool chip ────────────────────────────────────────────────────

function ToolNode({ data }: NodeProps) {
  const d = data as unknown as AgentDetail;
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-stone-300 bg-white shadow-sm text-xs text-stone-600 select-none">
      <Handle type="target" position={Position.Top} className="!bg-stone-300 !w-2 !h-2" />
      <span>🔧</span>
      <span>{d.label}</span>
    </div>
  );
}

// ── Node type registry ────────────────────────────────────────────────────────

const nodeTypes = {
  trigger: TriggerNode,
  output: OutputNode,
  "lyzr-native": LyzrNativeNode,
  policy: PolicyNode,
  agent: AgentNode,
  tool: ToolNode,
};

// ── Initial graph ─────────────────────────────────────────────────────────────

const EDGE_LINE_STYLE = {
  stroke: "#a8a29e",
  strokeWidth: 1.5,
};

const EDGE_MARKER = { type: MarkerType.ArrowClosed, color: "#a8a29e", width: 14, height: 14 };

const initialNodes: Node[] = [
  // Trigger
  {
    id: "trigger",
    type: "trigger",
    position: { x: 0, y: 200 },
    data: { label: "User Prompt", type: "trigger" } as AgentDetail,
  },
  // Policy Enforcement Layer (unified)
  {
    id: "policy",
    type: "policy",
    position: { x: 220, y: 180 },
    data: {
      label: "Policy Enforcement Layer",
      description: "Unified governance checkpoint",
      type: "policy",
      meta: { scope: "all" },
      role: "Controls data access, tool authorization, and output sanitization.",
      instructions:
        "Data access: Checks classification, owner, tenant, allowed_roles.\nTool authorization: Structured LLM planning + policy enforcement.\nOutput sanitization: Automatic PII/sensitive data masking.\n\nDeny behaviors: deny, redact, filter, escalate, strip, mask, block.",
    } as AgentDetail,
  },
  // Lyzr native: Safe AI Input
  {
    id: "safe-ai-input",
    type: "lyzr-native",
    position: { x: 500, y: 180 },
    data: {
      label: "Safe AI (Input)",
      description: "PII · Toxicity · Prompt injection",
      type: "lyzr-native",
      meta: { scope: "" },
    } as AgentDetail,
  },
  // Lyzr Agent
  {
    id: "lyzr-agent",
    type: "agent",
    position: { x: 780, y: 180 },
    data: {
      label: "Lyzr Agent",
      description: "LLM / RAG / Tools",
      type: "agent",
      model: "gpt-4o",
      temperature: 0.7,
      top_p: 1.0,
    } as AgentDetail,
  },
  // Lyzr native: Output processing
  {
    id: "output-processing",
    type: "lyzr-native",
    position: { x: 1060, y: 180 },
    data: {
      label: "Output Processing",
      description: "Memory · Humanizer · Sentiment",
      type: "lyzr-native",
      meta: { scope: "" },
    } as AgentDetail,
  },
  // Output
  {
    id: "output",
    type: "output",
    position: { x: 1340, y: 200 },
    data: { label: "Output", type: "output" } as AgentDetail,
  },
];

const initialEdges: Edge[] = [
  { id: "e-trigger-policy", source: "trigger", target: "policy", style: EDGE_LINE_STYLE, markerEnd: EDGE_MARKER },
  { id: "e-policy-safeai", source: "policy", target: "safe-ai-input", style: EDGE_LINE_STYLE, markerEnd: EDGE_MARKER },
  { id: "e-safeai-agent", source: "safe-ai-input", target: "lyzr-agent", style: EDGE_LINE_STYLE, markerEnd: EDGE_MARKER },
  { id: "e-agent-output-proc", source: "lyzr-agent", target: "output-processing", style: EDGE_LINE_STYLE, markerEnd: EDGE_MARKER },
  { id: "e-output-proc-output", source: "output-processing", target: "output", style: EDGE_LINE_STYLE, markerEnd: EDGE_MARKER },
];

// ── Side overlay ──────────────────────────────────────────────────────────────

function SideOverlay({ node, onClose }: { node: Node; onClose: () => void }) {
  const d = node.data as AgentDetail;

  return (
    <div className="fixed top-0 right-0 h-full w-[420px] bg-white border-l border-stone-200 shadow-2xl z-50 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between px-6 py-4 border-b border-stone-100">
        <div>
          <p className="text-xs text-stone-400 mb-0.5">
            {d.type === "agent" ? "Lyzr Agent" : d.type === "policy" ? "Policy Enforcement Layer (POC)" : d.type === "lyzr-native" ? "Lyzr Native" : d.type}
          </p>
          <h2 className="text-base font-semibold text-stone-800">{d.label}</h2>
        </div>
        <button onClick={onClose} className="text-stone-400 hover:text-stone-700 text-lg leading-none mt-0.5">✕</button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 text-sm">
        {d.description && (
          <Section label="Description">
            <p className="text-stone-600">{d.description}</p>
          </Section>
        )}

        {d.role && (
          <Section label="Agent Role">
            <p className="text-stone-600 font-mono text-xs leading-relaxed bg-stone-50 rounded p-3 border">{d.role}</p>
          </Section>
        )}

        {d.goal && (
          <Section label="Agent Goal">
            <p className="text-stone-600">{d.goal}</p>
          </Section>
        )}

        {d.instructions && (
          <Section label={d.type === "agent" ? "Agent Instructions" : "How it works"}>
            <p className="text-stone-600 font-mono text-xs leading-relaxed whitespace-pre-wrap bg-stone-50 rounded p-3 border">
              {d.instructions}
            </p>
          </Section>
        )}

        {(d.model || d.temperature !== undefined) && (
          <Section label="Model Parameters">
            <div className="grid grid-cols-2 gap-2">
              {d.model && <Param label="Model" value={d.model} />}
              {d.temperature !== undefined && <Param label="Temperature" value={String(d.temperature)} />}
              {d.top_p !== undefined && <Param label="top_p" value={String(d.top_p)} />}
            </div>
          </Section>
        )}

        {d.tools && d.tools.length > 0 && (
          <Section label="Configured Tools">
            <div className="flex flex-wrap gap-2">
              {d.tools.map((t) => (
                <span key={t} className="px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 text-xs border">🔧 {t}</span>
              ))}
            </div>
          </Section>
        )}

        {d.policies && d.policies.length > 0 && (
          <Section label="Active Policies">
            <div className="space-y-2">
              {d.policies.map((p, i) => (
                <div key={i} className={`rounded-lg border px-3 py-2 text-xs ${p.effect === "deny" ? "border-red-200 bg-red-50" : "border-green-200 bg-green-50"}`}>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className={`font-bold ${p.effect === "deny" ? "text-red-600" : "text-green-600"}`}>{p.effect.toUpperCase()}</span>
                    <span className="text-stone-500">{p.name}</span>
                  </div>
                  <p className="text-stone-500 italic">&quot;{p.raw_nl}&quot;</p>
                </div>
              ))}
            </div>
          </Section>
        )}

        {d.meta && Object.keys(d.meta).filter((k) => k !== "scope").length > 0 && (
          <Section label="Metadata">
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(d.meta)
                .filter(([k]) => k !== "scope")
                .map(([k, v]) => (
                  <Param key={k} label={k} value={v} />
                ))}
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-stone-400 uppercase tracking-wide mb-2">{label}</p>
      {children}
    </div>
  );
}

function Param({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-stone-50 border rounded px-2.5 py-2">
      <p className="text-[10px] text-stone-400 mb-0.5">{label}</p>
      <p className="text-stone-700 font-mono text-xs">{value}</p>
    </div>
  );
}

// ── Legend ────────────────────────────────────────────────────────────────────

function Legend() {
  const items = [
    { color: "bg-stone-100 border-stone-300", label: "Trigger / Output" },
    { color: "bg-amber-50 border-amber-300", label: "Lyzr Native" },
    { color: "bg-indigo-50 border-indigo-400", label: "Policy Enforcement Layer (POC)" },
    { color: "bg-white border-stone-700", label: "Lyzr Agent" },
  ];
  return (
    <div className="absolute bottom-4 left-4 z-10 bg-white border border-stone-200 rounded-xl shadow px-4 py-3 flex flex-col gap-1.5">
      <p className="text-[10px] font-semibold text-stone-400 uppercase tracking-wide mb-1">Legend</p>
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-2">
          <span className={`w-4 h-4 rounded border-2 shrink-0 ${item.color}`} />
          <span className="text-xs text-stone-600">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function FlowChart({
  agentId,
  agentDetails,
  policies,
}: {
  agentId?: string;
  agentDetails?: Partial<AgentDetail>;
  policies?: AgentDetail["policies"];
}) {
  const enrichedNodes = initialNodes.map((n) => {
    // Enrich the Lyzr agent node with live data if provided
    if (n.id === "lyzr-agent" && agentDetails) {
      return { ...n, data: { ...n.data, ...agentDetails, label: agentDetails.label ?? "Lyzr Agent" } };
    }
    // Enrich policy node with all active policies
    if (n.type === "policy" && policies) {
      return { ...n, data: { ...n.data, policies } };
    }
    return n;
  });

  const [nodes, , onNodesChange] = useNodesState(enrichedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    const d = node.data as AgentDetail;
    if (d.type === "tool") return; // no overlay for tool chips
    setSelectedNode((prev) => (prev?.id === node.id ? null : node));
  }, []);

  const onPaneClick = useCallback(() => setSelectedNode(null), []);

  return (
    <div className="relative w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.4}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#e7e5e4" gap={20} size={1} />
        <Controls className="!shadow-md !border !border-stone-200 !rounded-xl" />
        <MiniMap nodeStrokeWidth={2} className="!border !border-stone-200 !rounded-xl !shadow" />
      </ReactFlow>

      <Legend />

      {selectedNode && (
        <SideOverlay node={selectedNode} onClose={() => setSelectedNode(null)} />
      )}
    </div>
  );
}
