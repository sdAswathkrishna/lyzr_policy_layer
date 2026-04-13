"use client";

import { useState } from "react";
import { chat, ChatResponse, PolicyDeniedResponse, EvalResult, createAgent, CreateAgentResponse } from "@/lib/api";

function PolicyTrace({ trace }: { trace: EvalResult[] }) {
  const [open, setOpen] = useState(false);
  if (trace.length === 0) return null;
  const hasDeny = trace.some((r) => r.decision === "deny");
  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`text-xs px-2 py-0.5 rounded border font-medium ${hasDeny ? "border-red-300 text-red-700 bg-red-50" : "border-gray-200 text-gray-500"}`}
      >
        {open ? "▲" : "▼"} Policy Trace ({trace.length} check{trace.length !== 1 ? "s" : ""})
        {hasDeny && " · DENIED"}
      </button>
      {open && (
        <div className="mt-2 space-y-1">
          {trace.map((r, i) => (
            <div key={i} className={`rounded px-3 py-2 text-xs border ${r.decision === "deny" ? "border-red-200 bg-red-50" : "border-gray-100 bg-gray-50"}`}>
              <div className="flex items-center gap-2 mb-0.5">
                <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${r.decision === "deny" ? "bg-red-200 text-red-800" : "bg-green-100 text-green-700"}`}>
                  {r.decision.toUpperCase()}
                </span>
                {r.matched_policy_name && (
                  <span className="text-gray-600">policy: <em>{r.matched_policy_name}</em></span>
                )}
                {r.deny_behavior && (
                  <span className="text-orange-600">behavior: {r.deny_behavior}</span>
                )}
                <span className="text-gray-400 ml-auto">{r.latency_ms}ms</span>
              </div>
              <p className="text-gray-600">{r.reason}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  trace?: EvalResult[];
  denied?: boolean;
  deniedLayer?: string;
}

export default function ChatPage() {
  const [agentId, setAgentId] = useState("");
  const [sessionId, setSessionId] = useState(() => `session-${Date.now()}`);
  const [userId, setUserId] = useState("demo@example.com");
  const [classification, setClassification] = useState("public");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [creating, setCreating] = useState(false);
  const [agentCreated, setAgentCreated] = useState<CreateAgentResponse | null>(null);

  const handleCreateAgent = async () => {
    setCreating(true);
    try {
      const resp = await createAgent({
        name: "Lyzr Policy Agent",
        description: "Agent integrated with the Lyzr Policy Enforcement Layer.",
        agent_role: "You are a helpful assistant demonstrating policy enforcement.",
        agent_instructions: "Answer questions concisely and helpfully.",
        agent_goal: "Demonstrate the Lyzr Policy Enforcement Layer.",
        provider_id: "openai",
        model: "gpt-4o",
        temperature: 0.7,
      });
      setAgentId(resp.agent_id);
      setAgentCreated(resp);
      setMessages([{ role: "system", content: `Agent created: ${resp.agent_id}` }]);
    } catch (e: unknown) {
      setMessages([{ role: "system", content: `Error: ${e instanceof Error ? e.message : String(e)}` }]);
    } finally {
      setCreating(false);
    }
  };

  const handleSend = async () => {
    if (!input.trim() || !agentId) return;
    const userMsg = input.trim();
    setInput("");
    setMessages((m) => [...m, { role: "user", content: userMsg }]);
    setSending(true);

    try {
      const resp = await chat(agentId, {
        session_id: sessionId,
        message: userMsg,
        invoking_user_id: userId,
        tenant_id: "demo",
        data_classification: classification,
      });

      if ("denied" in resp && resp.denied) {
        const denied = resp as PolicyDeniedResponse;
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: `[Policy Denied]\n${denied.reason}`,
            denied: true,
            deniedLayer: denied.layer,
          },
        ]);
      } else {
        const ok = resp as ChatResponse;
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: ok.response,
            trace: ok.policy_trace,
          },
        ]);
      }
    } catch (e: unknown) {
      setMessages((m) => [...m, { role: "system", content: `Error: ${e instanceof Error ? e.message : String(e)}` }]);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Agent Chat</h1>

      {/* Setup panel */}
      <div className="bg-white rounded-xl border shadow-sm p-5 mb-6">
        <h2 className="font-semibold mb-3 text-sm">Configuration</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Agent ID</label>
            <input
              className="w-full border rounded px-2 py-1.5 text-sm font-mono"
              placeholder="Enter existing agent ID or create one →"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Invoking User ID</label>
            <input
              className="w-full border rounded px-2 py-1.5 text-sm"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Data Classification</label>
            <select
              className="w-full border rounded px-2 py-1.5 text-sm"
              value={classification}
              onChange={(e) => setClassification(e.target.value)}
            >
              {["public","internal","internal-finance","internal-hr","confidential","restricted"].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={handleCreateAgent}
              disabled={creating}
              className="w-full px-4 py-1.5 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {creating ? "Creating…" : "Create New Agent"}
            </button>
          </div>
        </div>
        {agentCreated && (
          <p className="text-xs text-green-600 mt-2 font-mono">
            ✓ Agent created: {agentCreated.agent_id}
          </p>
        )}
      </div>

      {/* Chat window */}
      <div className="bg-white rounded-xl border shadow-sm flex flex-col" style={{ minHeight: 400 }}>
        <div className="flex-1 overflow-y-auto p-5 space-y-4" style={{ maxHeight: 480 }}>
          {messages.length === 0 && (
            <p className="text-gray-400 text-sm text-center mt-16">
              Create or enter an agent ID, then send a message. Policy trace will appear under each response.
            </p>
          )}
          {messages.map((msg, i) => (
            <div key={i}>
              {msg.role === "system" ? (
                <p className="text-xs text-gray-400 text-center italic">{msg.content}</p>
              ) : msg.role === "user" ? (
                <div className="flex justify-end">
                  <div className="bg-indigo-600 text-white rounded-2xl rounded-br-sm px-4 py-2 text-sm max-w-xs">
                    {msg.content}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col max-w-lg">
                  <div className={`rounded-2xl rounded-bl-sm px-4 py-2 text-sm ${msg.denied ? "bg-red-50 border border-red-200 text-red-800" : "bg-gray-100 text-gray-900"}`}>
                    {msg.content}
                  </div>
                  {msg.trace && <PolicyTrace trace={msg.trace} />}
                </div>
              )}
            </div>
          ))}
          {sending && (
            <p className="text-xs text-gray-400 italic">Agent thinking + policy checks…</p>
          )}
        </div>

        {/* Input */}
        <div className="border-t px-4 py-3 flex gap-2">
          <input
            className="flex-1 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
            placeholder={agentId ? "Send a message…" : "Enter an agent ID first"}
            value={input}
            disabled={!agentId || sending}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
          />
          <button
            onClick={handleSend}
            disabled={!agentId || sending || !input.trim()}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-700 disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
