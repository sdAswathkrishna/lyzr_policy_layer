"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { listPolicies, Policy } from "@/lib/api";
import type { AgentDetail } from "@/components/FlowChart";

// Dynamically import ReactFlow (no SSR — uses browser APIs)
const FlowChart = dynamic(() => import("@/components/FlowChart"), { ssr: false });

const AGENT_ID_KEY = "lyzr_policy_agent_id";

export default function FlowPage() {
  const [agentId, setAgentId] = useState("");
  const [agentDetails, setAgentDetails] = useState<Partial<AgentDetail> | undefined>(undefined);
  const [policies, setPolicies] = useState<AgentDetail["policies"]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-load agent ID from localStorage (set from Chat page)
  useEffect(() => {
    const stored = localStorage.getItem(AGENT_ID_KEY);
    if (stored) setAgentId(stored);
  }, []);

  useEffect(() => {
    // Load active policies
    listPolicies()
      .then((ps: Policy[]) => {
        const mapped = ps.map((p) => ({
          scope: p.scope,
          name: p.name,
          effect: p.effect,
          raw_nl: p.raw_nl,
        }));
        setPolicies(mapped);
      })
      .catch(() => null);
  }, []);

  const loadAgent = async () => {
    if (!agentId.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/agents/${agentId}`
      );
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data = await res.json();
      setAgentDetails({
        label: data.name ?? "Lyzr Agent",
        description: data.description,
        role: data.agent_role,
        goal: data.agent_goal,
        instructions: data.agent_instructions,
        model: data.model,
        temperature: data.temperature,
        top_p: data.top_p,
        tools: Array.isArray(data.tools) && data.tools.length > 0
          ? data.tools.map((t: { name?: string } | string) =>
              typeof t === "string" ? t : t.name ?? JSON.stringify(t)
            )
          : undefined,
        meta: {
          agent_id: data._id ?? agentId,
          version: data.version ?? "3",
          provider: data.provider_id ?? "openai",
          created_at: data.created_at ? new Date(data.created_at).toLocaleDateString() : "",
        },
      });
      localStorage.setItem(AGENT_ID_KEY, agentId);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col" style={{ height: "calc(100vh - 56px)" }}>
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-5 py-2.5 bg-white border-b border-stone-200 shrink-0 flex-wrap">
        <span className="text-sm font-semibold text-stone-700">Agent Flow</span>
        <span className="text-xs text-stone-400 border border-stone-200 rounded px-2 py-0.5">
          POC — integrated with Lyzr APIs
        </span>
        <div className="flex items-center gap-2 ml-auto">
          <input
            className="border border-stone-200 rounded-lg px-3 py-1.5 text-sm font-mono w-64 focus:outline-none focus:ring-2 focus:ring-indigo-300"
            placeholder="Enter Lyzr agent ID…"
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadAgent()}
          />
          <button
            onClick={loadAgent}
            disabled={loading || !agentId.trim()}
            className="px-4 py-1.5 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? "Loading…" : "Load"}
          </button>
          {agentDetails && (
            <span className="text-xs text-green-600 font-medium">✓ {agentDetails.label}</span>
          )}
          {error && <span className="text-xs text-red-500">{error}</span>}
        </div>
        <div className="flex items-center gap-3 text-xs text-stone-500">
          <span className="flex items-center gap-1">
            <span className="w-3 h-1.5 inline-block bg-stone-400 rounded" />
            Lyzr native
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-1.5 inline-block bg-indigo-400 rounded" />
            Policy layer (POC)
          </span>
        </div>
      </div>

      {/* Flow canvas */}
      <div className="flex-1 overflow-hidden bg-stone-50">
        <FlowChart
          agentId={agentId}
          agentDetails={agentDetails}
          policies={policies}
        />
      </div>
    </div>
  );
}
