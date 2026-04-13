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

export interface CreateAgentPayload {
  name: string;
  description?: string;
  agent_role?: string;
  agent_instructions?: string;
  agent_goal?: string;
  provider_id?: string;
  model?: string;
  temperature?: number;
  top_p?: number;
}

export interface CreateAgentResponse {
  agent_id: string;
  raw_response: Record<string, unknown>;
}

export const createAgent = (payload: CreateAgentPayload) =>
  req<CreateAgentResponse>("/api/agents/", { method: "POST", body: JSON.stringify(payload) });

export interface GovernedToolCall {
  tool_name: string;
  input: Record<string, unknown>;
}

export interface RetrievalContext {
  context_id: string;
  text: string;
  classification: string;
  context_tag: string;
  org_id?: string;
  metadata?: Record<string, unknown>;
}

export interface ChatPayload {
  session_id: string;
  message: string;
  user_id: string;
  org_id?: string;
  rgid?: string;
  context_fields?: Record<string, unknown>;
  governed_tool_call?: GovernedToolCall;
  retrieval_request?: {
    query: string;
    contexts: RetrievalContext[];
  };
}

export interface EvalResult {
  decision: "allow" | "deny";
  matched_policy_ids: string[];
  matched_policy_names: string[];
  audit_id?: string;
  reason: string;
  latency_ms: number;
}

export interface ChatResponse {
  response: string;
  request_id: string;
  effective_prompt?: string;
  policy_trace: EvalResult[];
}

export interface PolicyDeniedResponse {
  denied: true;
  decision: "deny";
  action: string;
  resource: string;
  reason: string;
  matched_policy_ids: string[];
  request_id: string;
  audit_id: string;
}

export const chat = (agentId: string, payload: ChatPayload) =>
  req<ChatResponse | PolicyDeniedResponse>(`/api/agents/${agentId}/chat`, {
    method: "POST",
    body: JSON.stringify({ agent_id: agentId, ...payload }),
  });

export interface PolicyCondition {
  field: string;
  operator: string;
  value: unknown;
}

export interface Policy {
  id: string;
  name: string;
  raw_nl: string;
  principal: { user_id?: string; org_id?: string };
  action: "tool_call" | "retrieve_context" | "input_content";
  resource: string;
  conditions: PolicyCondition[];
  effect: "permit" | "forbid";
  compiled_at: string;
  enabled: boolean;
}

export const listPolicies = () => req<Policy[]>("/api/policies/");

export const previewPolicy = (raw_nl: string) =>
  req<{ preview: Policy; raw_nl: string }>("/api/policies/preview", {
    method: "POST",
    body: JSON.stringify({ raw_nl }),
  });

export const createPolicy = (raw_nl: string) =>
  req<Policy>("/api/policies/", {
    method: "POST",
    body: JSON.stringify({ raw_nl }),
  });

export const deletePolicy = (id: string) =>
  req<{ deleted: boolean }>(`/api/policies/${id}`, { method: "DELETE" });

export const togglePolicy = (id: string, enabled: boolean) =>
  req<Policy>(`/api/policies/${id}/toggle`, {
    method: "PATCH",
    body: JSON.stringify({ enabled }),
  });

export interface AuditEntry {
  id: string;
  timestamp: string;
  request_id: string;
  principal: { user_id: string; org_id: string; auth_source: string };
  action: string;
  resource: string;
  evaluated_context: Record<string, unknown>;
  matched_policy_ids: string[];
  decision: "allow" | "deny";
  reason: string;
  latency_ms: number;
}

export interface AuditStats {
  total: number;
  total_allow: number;
  total_deny: number;
  by_action: Record<string, number>;
  by_decision: Record<string, number>;
}

export const listAudit = (params?: {
  limit?: number;
  offset?: number;
  user_id?: string;
  org_id?: string;
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
