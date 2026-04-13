"use client";

import { useRef, useEffect, useState } from "react";
import { ChatResponse, EvalResult, PolicyDeniedResponse, chat } from "@/lib/api";
import { Send, ShieldCheck, ShieldX, ChevronDown, ChevronUp, Bot, User } from "lucide-react";

function PolicyTrace({ trace }: { trace: EvalResult[] }) {
  const [open, setOpen] = useState(false);
  if (trace.length === 0) return null;
  const hasDeny = trace.some((t) => t.decision === "deny");
  return (
    <div style={{ marginTop: 6 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          fontSize: 11,
          color: hasDeny ? "var(--red)" : "var(--text-muted)",
          background: hasDeny ? "var(--red-bg)" : "var(--surface-hover)",
          border: `1px solid ${hasDeny ? "var(--red-border)" : "var(--border)"}`,
          borderRadius: 5,
          padding: "2px 8px",
          cursor: "pointer",
        }}
      >
        {hasDeny ? <ShieldX size={11} /> : <ShieldCheck size={11} />}
        Policy trace ({trace.length})
        {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
      </button>
      {open && (
        <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
          {trace.map((item, i) => (
            <div
              key={i}
              style={{
                borderRadius: 6,
                padding: "7px 10px",
                fontSize: 11.5,
                border: `1px solid ${item.decision === "deny" ? "var(--red-border)" : "var(--border)"}`,
                background: item.decision === "deny" ? "var(--red-bg)" : "var(--surface-muted)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                <span
                  style={{
                    fontWeight: 600,
                    fontSize: 10,
                    color: item.decision === "deny" ? "var(--red)" : "var(--green)",
                    textTransform: "uppercase",
                  }}
                >
                  {item.decision}
                </span>
                {item.matched_policy_names[0] && (
                  <span style={{ color: "var(--text-secondary)" }}>{item.matched_policy_names.join(", ")}</span>
                )}
                <span style={{ color: "var(--text-muted)", marginLeft: "auto" }}>{item.latency_ms}ms</span>
              </div>
              <p style={{ margin: 0, color: "var(--text-muted)" }}>{item.reason}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface Message {
  role: "user" | "assistant" | "denied" | "system";
  content: string;
  trace?: EvalResult[];
  deniedAction?: string;
}

const DEFAULT_AGENT_ID = process.env.NEXT_PUBLIC_DEFAULT_AGENT_ID ?? "";

export default function ChatPage() {
  const [agentId, setAgentId] = useState(DEFAULT_AGENT_ID);
  const [sessionId] = useState(() => `session-${Date.now()}`);
  const [userId, setUserId] = useState("");
  const [orgId, setOrgId] = useState("");
  const [mode, setMode] = useState<"plain" | "tool" | "retrieval">("plain");
  const [toolName, setToolName] = useState("");
  const [toolInputJson, setToolInputJson] = useState("{}");
  const [retrievalTag, setRetrievalTag] = useState("");
  const [retrievalText, setRetrievalText] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const handleSend = async () => {
    if (!agentId || !input.trim()) return;
    let parsedToolInput: Record<string, unknown> = {};
    if (mode === "tool") {
      try {
        parsedToolInput = toolInputJson.trim() ? JSON.parse(toolInputJson) : {};
      } catch {
        setMessages((m) => [...m, { role: "system", content: "Tool input must be valid JSON." }]);
        return;
      }
    }

    const payload =
      mode === "tool"
        ? {
            session_id: sessionId,
            message: input,
            user_id: userId,
            org_id: orgId || undefined,
            governed_tool_call: { tool_name: toolName, input: parsedToolInput },
          }
        : mode === "retrieval"
          ? {
              session_id: sessionId,
              message: input,
              user_id: userId,
              org_id: orgId || undefined,
              retrieval_request: {
                query: input,
                contexts: [{
                  context_id: "ctx-1",
                  text: retrievalText,
                  classification: "confidential",
                  context_tag: retrievalTag,
                  org_id: orgId || undefined,
                }],
              },
            }
          : { session_id: sessionId, message: input, user_id: userId, org_id: orgId || undefined };

    setMessages((m) => [...m, { role: "user", content: input }]);
    setInput("");
    setSending(true);

    try {
      const response = await chat(agentId, payload);
      if ("denied" in response && response.denied) {
        const denied = response as PolicyDeniedResponse;
        setMessages((m) => [
          ...m,
          { role: "denied", content: denied.reason, deniedAction: denied.action },
        ]);
      } else {
        const ok = response as ChatResponse;
        setMessages((m) => [
          ...m,
          { role: "assistant", content: ok.response, trace: ok.policy_trace },
        ]);
      }
    } catch (e: unknown) {
      setMessages((m) => [...m, { role: "system", content: e instanceof Error ? e.message : String(e) }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div style={{ maxWidth: 860, display: "flex", flexDirection: "column", height: "calc(100vh - 72px)" }}>
      {/* Header */}
      <div className="page-header" style={{ marginBottom: 16, flexShrink: 0 }}>
        <h1 className="page-title">Governed Chat</h1>
        <p className="page-subtitle">
          Messages are evaluated against active policies before reaching the Lyzr agent.
        </p>
      </div>

      {/* Config panel */}
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: "16px 18px",
          marginBottom: 14,
          boxShadow: "var(--shadow-xs)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
          {/* Agent ID */}
          <div>
            <label className="section-label">Agent ID</label>
            <input
              className="input"
              style={{ fontFamily: "monospace", fontSize: 12 }}
              placeholder="lyzr agent id…"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
            />
          </div>
          {/* User ID */}
          <div>
            <label className="section-label">User ID</label>
            <input
              className="input"
              placeholder="user-123"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            />
          </div>
          {/* Org ID */}
          <div>
            <label className="section-label">Org ID</label>
            <input
              className="input"
              placeholder="org-456"
              value={orgId}
              onChange={(e) => setOrgId(e.target.value)}
            />
          </div>
          {/* Mode */}
          <div>
            <label className="section-label">Mode</label>
            <select
              className="select"
              value={mode}
              onChange={(e) => setMode(e.target.value as "plain" | "tool" | "retrieval")}
            >
              <option value="plain">Plain chat</option>
              <option value="tool">Governed tool call</option>
              <option value="retrieval">Governed retrieval</option>
            </select>
          </div>
        </div>

        {/* Conditional: tool */}
        {mode === "tool" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10, marginTop: 10 }}>
            <div>
              <label className="section-label">Tool Name</label>
              <input
                className="input"
                style={{ fontFamily: "monospace" }}
                placeholder="notion"
                value={toolName}
                onChange={(e) => setToolName(e.target.value)}
              />
            </div>
            <div>
              <label className="section-label">Tool Input JSON</label>
              <input
                className="input"
                style={{ fontFamily: "monospace", fontSize: 12 }}
                placeholder='{"key": "value"}'
                value={toolInputJson}
                onChange={(e) => setToolInputJson(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* Conditional: retrieval */}
        {mode === "retrieval" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10, marginTop: 10 }}>
            <div>
              <label className="section-label">Context Tag</label>
              <input
                className="input"
                style={{ fontFamily: "monospace" }}
                placeholder="sensitive-data"
                value={retrievalTag}
                onChange={(e) => setRetrievalTag(e.target.value)}
              />
            </div>
            <div>
              <label className="section-label">Retrieval Context</label>
              <input
                className="input"
                placeholder="Paste retrieval context text…"
                value={retrievalText}
                onChange={(e) => setRetrievalText(e.target.value)}
              />
            </div>
          </div>
        )}
      </div>

      {/* Messages */}
      <div
        style={{
          flex: 1,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "var(--shadow-xs)",
          minHeight: 0,
        }}
      >
        {/* Scroll area */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "20px",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          {messages.length === 0 && (
            <div
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                color: "var(--text-muted)",
                padding: "40px 0",
              }}
            >
              <ShieldCheck size={28} strokeWidth={1.4} style={{ opacity: 0.4 }} />
              <p style={{ margin: 0, fontSize: 13 }}>Send a message to see policy decisions in action.</p>
              <p style={{ margin: 0, fontSize: 12 }}>
                Try asking about a password with an active content policy.
              </p>
            </div>
          )}

          {messages.map((msg, i) => {
            if (msg.role === "user") {
              return (
                <div key={i} style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <div
                    style={{
                      maxWidth: "72%",
                      background: "var(--accent)",
                      color: "#fff",
                      borderRadius: "12px 12px 3px 12px",
                      padding: "9px 14px",
                      fontSize: 13.5,
                      lineHeight: 1.5,
                    }}
                  >
                    {msg.content}
                  </div>
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      background: "var(--accent)",
                      display: "grid",
                      placeItems: "center",
                      flexShrink: 0,
                      alignSelf: "flex-end",
                    }}
                  >
                    <User size={13} color="#fff" />
                  </div>
                </div>
              );
            }

            if (msg.role === "denied") {
              return (
                <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: "50%",
                      background: "var(--red-bg)",
                      border: "1px solid var(--red-border)",
                      display: "grid",
                      placeItems: "center",
                      flexShrink: 0,
                    }}
                  >
                    <ShieldX size={13} style={{ color: "var(--red)" }} />
                  </div>
                  <div
                    style={{
                      maxWidth: "72%",
                      background: "var(--red-bg)",
                      border: "1px solid var(--red-border)",
                      borderRadius: "3px 12px 12px 12px",
                      padding: "9px 14px",
                    }}
                  >
                    <p
                      style={{
                        margin: "0 0 2px",
                        fontSize: 11,
                        fontWeight: 600,
                        color: "var(--red)",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      Policy Denied · {msg.deniedAction?.replace(/_/g, " ")}
                    </p>
                    <p style={{ margin: 0, fontSize: 13.5, color: "var(--text-primary)", lineHeight: 1.5 }}>
                      {msg.content}
                    </p>
                  </div>
                </div>
              );
            }

            if (msg.role === "system") {
              return (
                <div
                  key={i}
                  style={{
                    background: "var(--amber-bg)",
                    border: "1px solid var(--amber-border)",
                    borderRadius: 7,
                    padding: "8px 13px",
                    fontSize: 12.5,
                    color: "var(--amber)",
                    alignSelf: "center",
                  }}
                >
                  {msg.content}
                </div>
              );
            }

            return (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    background: "var(--surface-hover)",
                    border: "1px solid var(--border)",
                    display: "grid",
                    placeItems: "center",
                    flexShrink: 0,
                  }}
                >
                  <Bot size={13} style={{ color: "var(--text-secondary)" }} />
                </div>
                <div style={{ maxWidth: "72%", minWidth: 0 }}>
                  <div
                    style={{
                      background: "var(--surface-muted)",
                      border: "1px solid var(--border-soft)",
                      borderRadius: "3px 12px 12px 12px",
                      padding: "9px 14px",
                      fontSize: 13.5,
                      color: "var(--text-primary)",
                      lineHeight: 1.6,
                    }}
                  >
                    {msg.content}
                  </div>
                  {msg.trace && <PolicyTrace trace={msg.trace} />}
                </div>
              </div>
            );
          })}

          {sending && (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  background: "var(--surface-hover)",
                  border: "1px solid var(--border)",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <Bot size={13} style={{ color: "var(--text-muted)" }} />
              </div>
              <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>
                Evaluating policy…
              </p>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input bar */}
        <div
          style={{
            borderTop: "1px solid var(--border)",
            padding: "12px 14px",
            display: "flex",
            gap: 8,
            alignItems: "center",
            flexShrink: 0,
          }}
        >
          <input
            className="input"
            style={{ flex: 1 }}
            placeholder={
              !agentId
                ? "Enter an Agent ID above first…"
                : !userId
                  ? "Enter a User ID above first…"
                  : "Type a message…"
            }
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
            disabled={!agentId}
          />
          <button
            className="btn btn-primary"
            onClick={handleSend}
            disabled={!agentId || sending || !input.trim() || !userId}
            style={{ padding: "8px 16px", gap: 6 }}
          >
            <Send size={13} />
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
