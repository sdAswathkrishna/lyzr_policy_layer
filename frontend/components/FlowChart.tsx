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
import { X } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AgentDetail {
  id?: string;
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
  [key: string]: unknown;
}

// ── Node: Trigger / Output ────────────────────────────────────────────────────

function TriggerNode({ data }: NodeProps) {
  const d = data as unknown as AgentDetail;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 14px",
        borderRadius: 10,
        border: "1px solid #d4d0ca",
        background: "#f7f6f3",
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
        minWidth: 140,
        fontFamily: "Roboto, sans-serif",
        cursor: "default",
        userSelect: "none",
      }}
    >
      <span style={{ color: "#9c9791", fontSize: 10 }}>▶</span>
      <span style={{ fontSize: 13, fontWeight: 500, color: "#1a1917" }}>{d.label}</span>
      <Handle type="source" position={Position.Right} style={{ background: "#9c9791", width: 8, height: 8 }} />
    </div>
  );
}

function OutputNode({ data }: NodeProps) {
  const d = data as unknown as AgentDetail;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "8px 14px",
        borderRadius: 10,
        border: "1px solid #d4d0ca",
        background: "#f7f6f3",
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
        minWidth: 140,
        fontFamily: "Roboto, sans-serif",
        userSelect: "none",
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: "#9c9791", width: 8, height: 8 }} />
      <span style={{ color: "#9c9791", fontSize: 10 }}>■</span>
      <span style={{ fontSize: 13, fontWeight: 500, color: "#1a1917" }}>{d.label}</span>
    </div>
  );
}

// ── Node: Lyzr Native ────────────────────────────────────────────────────────

function LyzrNativeNode({ data }: NodeProps) {
  const d = data as unknown as AgentDetail;
  return (
    <div
      style={{
        padding: "8px 14px",
        borderRadius: 10,
        border: "1px solid #e8c878",
        background: "#fffbeb",
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
        minWidth: 160,
        fontFamily: "Roboto, sans-serif",
        userSelect: "none",
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: "#d4aa3f", width: 8, height: 8 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ color: "#92600a", fontSize: 10 }}>◆</span>
        <span style={{ fontSize: 13, fontWeight: 500, color: "#1a1917" }}>{d.label}</span>
        <span
          style={{
            marginLeft: "auto",
            fontSize: 9,
            fontWeight: 600,
            color: "#92600a",
            background: "#fef3c7",
            border: "1px solid #e8c878",
            borderRadius: 3,
            padding: "1px 5px",
            letterSpacing: "0.04em",
          }}
        >
          LYZR
        </span>
      </div>
      {d.description && (
        <p style={{ margin: "3px 0 0 16px", fontSize: 10.5, color: "#92600a", opacity: 0.8 }}>
          {d.description}
        </p>
      )}
      <Handle type="source" position={Position.Right} style={{ background: "#d4aa3f", width: 8, height: 8 }} />
    </div>
  );
}

// ── Node: Policy Layer ───────────────────────────────────────────────────────

function PolicyNode({ data, selected }: NodeProps) {
  const d = data as unknown as AgentDetail;
  return (
    <div
      style={{
        padding: "10px 14px",
        borderRadius: 10,
        border: `2px solid ${selected ? "#2383e2" : "#93c5fd"}`,
        background: "#eff6ff",
        boxShadow: selected
          ? "0 0 0 3px rgba(35,131,226,0.15), 0 2px 6px rgba(0,0,0,0.08)"
          : "0 1px 3px rgba(0,0,0,0.06)",
        minWidth: 210,
        fontFamily: "Roboto, sans-serif",
        cursor: "pointer",
        userSelect: "none",
        transition: "border-color 0.15s, box-shadow 0.15s",
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: "#2383e2", width: 8, height: 8 }} />
      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#1e40af" }}>{d.label}</p>
      {d.description && (
        <p style={{ margin: "2px 0 0", fontSize: 10.5, color: "#3b82f6", opacity: 0.8 }}>
          {d.description}
        </p>
      )}
      <span
        style={{
          display: "inline-block",
          marginTop: 6,
          fontSize: 9,
          fontWeight: 600,
          color: "#1d4ed8",
          background: "rgba(219,234,254,0.8)",
          border: "1px solid #bfdbfe",
          borderRadius: 4,
          padding: "1px 6px",
          letterSpacing: "0.04em",
        }}
      >
        POLICY ENFORCEMENT
      </span>
      <Handle type="source" position={Position.Right} style={{ background: "#2383e2", width: 8, height: 8 }} />
    </div>
  );
}

// ── Node: Agent ──────────────────────────────────────────────────────────────

function AgentNode({ data, selected }: NodeProps) {
  const d = data as unknown as AgentDetail;
  return (
    <div
      style={{
        padding: "10px 14px",
        borderRadius: 10,
        border: `2px solid ${selected ? "#1a1917" : "#5c5852"}`,
        background: "#ffffff",
        boxShadow: selected
          ? "0 0 0 3px rgba(26,25,23,0.1), 0 2px 8px rgba(0,0,0,0.12)"
          : "0 2px 6px rgba(0,0,0,0.1)",
        minWidth: 200,
        fontFamily: "Roboto, sans-serif",
        cursor: "pointer",
        userSelect: "none",
        transition: "border-color 0.15s, box-shadow 0.15s",
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: "#5c5852", width: 8, height: 8 }} />
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: d.model ? 4 : 0 }}>
        <span
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            background: "#1a1917",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 11,
            fontWeight: 700,
            color: "#fff",
            fontFamily: "Bentham, Georgia, serif",
            flexShrink: 0,
          }}
        >
          L
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: "#1a1917" }}>{d.label}</span>
      </div>
      {d.model && (
        <p style={{ margin: 0, fontSize: 10.5, color: "#9c9791" }}>
          {d.model} · temp {d.temperature}
        </p>
      )}
      <Handle type="source" position={Position.Right} style={{ background: "#5c5852", width: 8, height: 8 }} />
      <Handle
        type="source"
        position={Position.Bottom}
        id="tool-out"
        style={{ background: "#9c9791", width: 7, height: 7 }}
      />
    </div>
  );
}

// ── Node: Tool chip ──────────────────────────────────────────────────────────

function ToolNode({ data }: NodeProps) {
  const d = data as unknown as AgentDetail;
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "4px 10px",
        borderRadius: 99,
        border: "1px solid #e8e3dc",
        background: "#ffffff",
        boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
        fontSize: 11.5,
        color: "#5c5852",
        userSelect: "none",
        fontFamily: "Roboto, sans-serif",
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: "#d4d0ca", width: 6, height: 6 }} />
      <span>🔧</span>
      <span>{d.label}</span>
    </div>
  );
}

// ── Registry ─────────────────────────────────────────────────────────────────

const nodeTypes = {
  trigger: TriggerNode,
  output: OutputNode,
  "lyzr-native": LyzrNativeNode,
  policy: PolicyNode,
  agent: AgentNode,
  tool: ToolNode,
};

// ── Graph data ────────────────────────────────────────────────────────────────

const EDGE_STYLE = { stroke: "#c7c3bd", strokeWidth: 1.5 };
const EDGE_MARKER = { type: MarkerType.ArrowClosed, color: "#c7c3bd", width: 13, height: 13 };

const initialNodes: Node[] = [
  {
    id: "trigger",
    type: "trigger",
    position: { x: 0, y: 200 },
    data: { label: "User Prompt", type: "trigger" } as AgentDetail,
  },
  {
    id: "safe-ai-input",
    type: "lyzr-native",
    position: { x: 220, y: 178 },
    data: {
      label: "Safe AI (Input)",
      description: "PII · Toxicity · Prompt injection",
      type: "lyzr-native",
    } as AgentDetail,
  },
  {
    id: "policy",
    type: "policy",
    position: { x: 500, y: 172 },
    data: {
      label: "User/Org Policy Gateway",
      description: "Permit/forbid before governed actions",
      type: "policy",
      role: "Controls who can access which governed tools or retrieval contexts.",
      instructions:
        "Principal: user_id + org_id.\nGoverned retrieval: blocks confidential context before prompt assembly.\nGoverned tool calls: checks input parameters before execution.\nInput content: blocks messages matching keyword policies.\nSemantics: default allow, forbid wins.",
    } as AgentDetail,
  },
  {
    id: "lyzr-agent",
    type: "agent",
    position: { x: 780, y: 175 },
    data: {
      label: "Lyzr Agent",
      description: "LLM / RAG / Tools",
      type: "agent",
      model: "gpt-4o",
      temperature: 0.7,
      top_p: 1.0,
    } as AgentDetail,
  },
  {
    id: "output-processing",
    type: "lyzr-native",
    position: { x: 1060, y: 178 },
    data: {
      label: "Output Processing",
      description: "Memory · Humanizer · Sentiment",
      type: "lyzr-native",
    } as AgentDetail,
  },
  {
    id: "output",
    type: "output",
    position: { x: 1340, y: 200 },
    data: { label: "Output", type: "output" } as AgentDetail,
  },
];

const initialEdges: Edge[] = [
  { id: "e1", source: "trigger", target: "safe-ai-input", style: EDGE_STYLE, markerEnd: EDGE_MARKER },
  { id: "e2", source: "safe-ai-input", target: "policy", style: EDGE_STYLE, markerEnd: EDGE_MARKER },
  { id: "e3", source: "policy", target: "lyzr-agent", style: EDGE_STYLE, markerEnd: EDGE_MARKER },
  { id: "e4", source: "lyzr-agent", target: "output-processing", style: EDGE_STYLE, markerEnd: EDGE_MARKER },
  { id: "e5", source: "output-processing", target: "output", style: EDGE_STYLE, markerEnd: EDGE_MARKER },
];

// ── Side overlay ──────────────────────────────────────────────────────────────

function SideOverlay({ node, onClose }: { node: Node; onClose: () => void }) {
  const d = node.data as AgentDetail;
  const typeLabel =
    d.type === "agent" ? "Lyzr Agent"
    : d.type === "policy" ? "Policy Enforcement Layer"
    : d.type === "lyzr-native" ? "Lyzr Native"
    : String(d.type);

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        right: 0,
        height: "100%",
        width: 400,
        background: "var(--surface)",
        borderLeft: "1px solid var(--border)",
        boxShadow: "var(--shadow-md)",
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        fontFamily: "Roboto, sans-serif",
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: "16px 20px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
        }}
      >
        <div>
          <p style={{ margin: 0, fontSize: 10.5, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            {typeLabel}
          </p>
          <h2
            style={{
              margin: "3px 0 0",
              fontSize: 16,
              fontFamily: "Bentham, Georgia, serif",
              fontWeight: 400,
              color: "var(--text-primary)",
              letterSpacing: "-0.01em",
            }}
          >
            {d.label}
          </h2>
        </div>
        <button
          style={{
            background: "transparent",
            border: 0,
            cursor: "pointer",
            color: "var(--text-muted)",
            padding: 4,
            borderRadius: 5,
            display: "grid",
            placeItems: "center",
          }}
          onClick={onClose}
        >
          <X size={16} />
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "18px 20px", display: "flex", flexDirection: "column", gap: 18 }}>
        {d.description && (
          <OverlaySection label="Description">
            <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: 13, lineHeight: 1.6 }}>{d.description}</p>
          </OverlaySection>
        )}

        {d.role && (
          <OverlaySection label="Agent Role">
            <CodeBlock>{d.role}</CodeBlock>
          </OverlaySection>
        )}

        {d.goal && (
          <OverlaySection label="Agent Goal">
            <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: 13, lineHeight: 1.6 }}>{d.goal}</p>
          </OverlaySection>
        )}

        {d.instructions && (
          <OverlaySection label={d.type === "agent" ? "Instructions" : "How it works"}>
            <CodeBlock>{d.instructions}</CodeBlock>
          </OverlaySection>
        )}

        {(d.model || d.temperature !== undefined) && (
          <OverlaySection label="Model Parameters">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {d.model && <Param label="Model" value={d.model} />}
              {d.temperature !== undefined && <Param label="Temperature" value={String(d.temperature)} />}
              {d.top_p !== undefined && <Param label="top_p" value={String(d.top_p)} />}
            </div>
          </OverlaySection>
        )}

        {d.tools && d.tools.length > 0 && (
          <OverlaySection label="Tools">
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {d.tools.map((t) => (
                <span
                  key={t}
                  style={{
                    fontSize: 11.5,
                    background: "var(--surface-muted)",
                    border: "1px solid var(--border)",
                    borderRadius: 5,
                    padding: "3px 9px",
                    color: "var(--text-secondary)",
                  }}
                >
                  🔧 {t}
                </span>
              ))}
            </div>
          </OverlaySection>
        )}

        {d.policies && d.policies.length > 0 && (
          <OverlaySection label={`Active Policies (${d.policies.length})`}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {d.policies.map((p, i) => (
                <div
                  key={i}
                  style={{
                    borderRadius: 7,
                    border: `1px solid ${p.effect === "forbid" ? "var(--red-border)" : "var(--green-border)"}`,
                    background: p.effect === "forbid" ? "var(--red-bg)" : "var(--green-bg)",
                    padding: "8px 11px",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                    <span
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        color: p.effect === "forbid" ? "var(--red)" : "var(--green)",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      {p.effect}
                    </span>
                    <span style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>{p.name}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 11, color: "var(--text-muted)", fontStyle: "italic" }}>
                    &ldquo;{p.raw_nl}&rdquo;
                  </p>
                </div>
              ))}
            </div>
          </OverlaySection>
        )}

        {d.meta && Object.keys(d.meta).filter((k) => k !== "scope").length > 0 && (
          <OverlaySection label="Metadata">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {Object.entries(d.meta)
                .filter(([k]) => k !== "scope")
                .map(([k, v]) => <Param key={k} label={k} value={v} />)}
            </div>
          </OverlaySection>
        )}
      </div>
    </div>
  );
}

function OverlaySection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p
        style={{
          margin: "0 0 8px",
          fontSize: 10.5,
          fontWeight: 600,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {label}
      </p>
      {children}
    </div>
  );
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  return (
    <pre
      style={{
        margin: 0,
        background: "var(--surface-muted)",
        border: "1px solid var(--border-soft)",
        borderRadius: 7,
        padding: "10px 12px",
        fontFamily: "monospace",
        fontSize: 11.5,
        color: "var(--text-secondary)",
        lineHeight: 1.65,
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        overflowX: "auto",
      }}
    >
      {children}
    </pre>
  );
}

function Param({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        background: "var(--surface-muted)",
        border: "1px solid var(--border-soft)",
        borderRadius: 6,
        padding: "7px 10px",
      }}
    >
      <p style={{ margin: "0 0 2px", fontSize: 10, color: "var(--text-muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
        {label}
      </p>
      <p style={{ margin: 0, fontSize: 12, color: "var(--text-primary)", fontFamily: "monospace" }}>{value}</p>
    </div>
  );
}

// ── Legend ────────────────────────────────────────────────────────────────────

function Legend() {
  const items = [
    { bg: "#f7f6f3", border: "#d4d0ca", label: "Trigger / Output" },
    { bg: "#fffbeb", border: "#e8c878", label: "Lyzr Native" },
    { bg: "#eff6ff", border: "#93c5fd", label: "Policy Enforcement" },
    { bg: "#ffffff", border: "#5c5852", label: "Lyzr Agent" },
  ];
  return (
    <div
      style={{
        position: "absolute",
        bottom: 16,
        left: 16,
        zIndex: 10,
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 9,
        boxShadow: "var(--shadow-sm)",
        padding: "10px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 6,
      }}
    >
      <p
        style={{
          margin: "0 0 4px",
          fontSize: 9.5,
          fontWeight: 600,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.09em",
        }}
      >
        Legend
      </p>
      {items.map((item) => (
        <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              width: 14,
              height: 14,
              borderRadius: 4,
              background: item.bg,
              border: `1.5px solid ${item.border}`,
              flexShrink: 0,
            }}
          />
          <span style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>{item.label}</span>
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
    if (n.id === "lyzr-agent" && agentDetails) {
      return { ...n, data: { ...n.data, ...agentDetails, label: agentDetails.label ?? "Lyzr Agent" } };
    }
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
    if (d.type === "tool") return;
    setSelectedNode((prev) => (prev?.id === node.id ? null : node));
  }, []);

  const onPaneClick = useCallback(() => setSelectedNode(null), []);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
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
        fitViewOptions={{ padding: 0.25 }}
        minZoom={0.3}
        maxZoom={1.6}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="var(--border)" gap={22} size={1} />
        <Controls
          style={{
            boxShadow: "var(--shadow-sm)",
            border: "1px solid var(--border)",
            borderRadius: 9,
            overflow: "hidden",
          }}
        />
        <MiniMap
          nodeStrokeWidth={2}
          style={{
            border: "1px solid var(--border)",
            borderRadius: 9,
            boxShadow: "var(--shadow-sm)",
          }}
        />
      </ReactFlow>

      <Legend />

      {selectedNode && (
        <SideOverlay node={selectedNode} onClose={() => setSelectedNode(null)} />
      )}
    </div>
  );
}
