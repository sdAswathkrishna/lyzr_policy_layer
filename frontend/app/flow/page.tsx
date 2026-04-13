"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { listPolicies, Policy } from "@/lib/api";
import type { AgentDetail } from "@/components/FlowChart";
import { GitBranch, RefreshCw } from "lucide-react";

const FlowChart = dynamic(() => import("@/components/FlowChart"), { ssr: false });

const AGENT_ID_KEY = "lyzr_policy_agent_id";
const DEFAULT_AGENT_ID = process.env.NEXT_PUBLIC_DEFAULT_AGENT_ID ?? "";

export default function FlowPage() {
  const [agentId, setAgentId] = useState(DEFAULT_AGENT_ID);
  const [agentDetails, setAgentDetails] = useState<Partial<AgentDetail> | undefined>(undefined);
  const [policies, setPolicies] = useState<AgentDetail["policies"]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(AGENT_ID_KEY);
    if (stored && !DEFAULT_AGENT_ID) setAgentId(stored);
  }, []);

  useEffect(() => {
    listPolicies()
      .then((ps: Policy[]) =>
        setPolicies(ps.map((p) => ({ scope: p.action, name: p.name, effect: p.effect, raw_nl: p.raw_nl })))
      )
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
        tools:
          Array.isArray(data.tools) && data.tools.length > 0
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
    <div className="flex flex-col" style={{ height: "calc(100vh - 0px)" }}>
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "10px 20px",
          background: "var(--surface)",
          borderBottom: "1px solid var(--border)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <GitBranch size={14} style={{ color: "var(--text-muted)" }} />
          <span
            style={{
              fontFamily: "Bentham, Georgia, serif",
              fontSize: 14,
              color: "var(--text-primary)",
              letterSpacing: "-0.01em",
            }}
          >
            Agent Flow
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" }}>
          <input
            style={{
              border: "1px solid var(--border)",
              borderRadius: 7,
              padding: "6px 11px",
              fontSize: 12.5,
              fontFamily: "monospace",
              width: 280,
              outline: "none",
              background: "var(--surface-muted)",
              color: "var(--text-primary)",
              transition: "border-color 0.15s",
            }}
            placeholder="Enter Lyzr agent ID…"
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadAgent()}
            onFocus={(e) => (e.target.style.borderColor = "var(--accent)")}
            onBlur={(e) => (e.target.style.borderColor = "var(--border)")}
          />
          <button
            className="btn btn-primary"
            onClick={loadAgent}
            disabled={loading || !agentId.trim()}
            style={{ fontSize: 12.5, gap: 5, padding: "6px 14px" }}
          >
            {loading ? <RefreshCw size={12} className="spin" /> : null}
            {loading ? "Loading…" : "Load Agent"}
          </button>
          {agentDetails && !error && (
            <span
              style={{
                fontSize: 12,
                color: "var(--green)",
                fontWeight: 500,
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              ✓ {agentDetails.label}
            </span>
          )}
          {error && (
            <span style={{ fontSize: 12, color: "var(--red)" }}>{error}</span>
          )}
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 overflow-hidden" style={{ background: "var(--bg)" }}>
        <FlowChart agentId={agentId} agentDetails={agentDetails} policies={policies} />
      </div>
    </div>
  );
}
