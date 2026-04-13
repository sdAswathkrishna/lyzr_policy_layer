const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail ?? "Request failed");
  }
  return res.json();
}

// ── Agents ────────────────────────────────────────────────────────────────────

export interface CreateAgentPayload {
  name: string;
  description?: string;
  agent_role?: string;
  agent_instructions?: string;
  agent_goal?: string;
  provider_id?: string;
  model?: string;
  temperature?: number;
  top_p?: number;   // required by Lyzr v3 API, defaults to 1.0
}

export interface CreateAgentResponse {
  agent_id: string;
  raw_response: Record<string, unknown>;
}

export const createAgent = (payload: CreateAgentPayload) =>
  req<CreateAgentResponse>("/api/agents/", { method: "POST", body: JSON.stringify(payload) });

export interface ChatPayload {
  session_id: string;
  message: string;
  invoking_user_id: string;
  tenant_id?: string;
  data_classification?: string;
  data_owner?: string;
  allowed_roles?: string[];
  recipient?: { recipient_type: string; recipient_id: string; trust_domain: string };
  context_fields?: Record<string, unknown>;
}

export interface EvalResult {
  decision: "allow" | "deny";
  matched_policy_id?: string;
  matched_policy_name?: string;
  deny_behavior?: string;
  reason: string;
  latency_ms: number;
}

export interface ChatResponse {
  response: string;
  request_id: string;
  policy_trace: EvalResult[];
  llm_eval_used: boolean;
}

export interface PolicyDeniedResponse {
  denied: true;
  layer: string;
  decision: "deny";
  reason: string;
  policy_id?: string;
  policy_name?: string;
  deny_behavior?: string;
  request_id: string;
  audit_id: string;
}

export const chat = (agentId: string, payload: ChatPayload) =>
  req<ChatResponse | PolicyDeniedResponse>(`/api/agents/${agentId}/chat`, {
    method: "POST",
    body: JSON.stringify({ agent_id: agentId, ...payload }),
  });

// ── Policies ──────────────────────────────────────────────────────────────────

export interface Policy {
  id: string;
  name: string;
  raw_nl: string;
  scope: string;
  subject: string;
  action: string;
  resource: string;
  condition: { type: string; match_fields: Record<string, unknown>; llm_prompt?: string };
  effect: "allow" | "deny";
  deny_behavior: string;
  compiled_at: string;
  enabled: boolean;
}

export const listPolicies = (scope?: string) =>
  req<Policy[]>(`/api/policies/${scope ? `?scope=${scope}` : ""}`);

export const previewPolicy = (raw_nl: string, scope?: string) =>
  req<{ preview: Policy; raw_nl: string }>("/api/policies/preview", {
    method: "POST",
    body: JSON.stringify({ raw_nl, scope }),
  });

export const createPolicy = (raw_nl: string, scope?: string) =>
  req<Policy>("/api/policies/", {
    method: "POST",
    body: JSON.stringify({ raw_nl, scope }),
  });

export const deletePolicy = (id: string) =>
  req<{ deleted: boolean }>(`/api/policies/${id}`, { method: "DELETE" });

export const togglePolicy = (id: string, enabled: boolean) =>
  req<Policy>(`/api/policies/${id}/toggle`, {
    method: "PATCH",
    body: JSON.stringify({ enabled }),
  });

// ── Audit ─────────────────────────────────────────────────────────────────────

export interface AuditEntry {
  id: string;
  timestamp: string;
  request_id: string;
  subject_identity: { invoking_user_id: string; active_agent_id: string; tenant_id: string };
  destination_identity?: { recipient_type: string; recipient_id: string; trust_domain: string };
  layer: string;
  action: string;
  resource: string;
  matched_policy_id?: string;
  decision: "allow" | "deny";
  reason: string;
  latency_ms: number;
}

export interface AuditStats {
  total: number;
  total_allow: number;
  total_deny: number;
  by_layer: Record<string, number>;
  by_decision: Record<string, number>;
}

export const listAudit = (params?: {
  limit?: number;
  offset?: number;
  agent_id?: string;
  layer?: string;
  decision?: string;
}) => {
  const qs = new URLSearchParams(
    Object.fromEntries(
      Object.entries(params ?? {})
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, String(v)])
    )
  ).toString();
  return req<AuditEntry[]>(`/api/audit/${qs ? `?${qs}` : ""}`);
};

export const auditStats = () => req<AuditStats>("/api/audit/stats");
