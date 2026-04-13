"use client";

import { useEffect, useState } from "react";
import { listAudit, AuditEntry } from "@/lib/api";

export default function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [agentFilter, setAgentFilter] = useState("");
  const [layerFilter, setLayerFilter] = useState("");
  const [decisionFilter, setDecisionFilter] = useState("");
  const [selected, setSelected] = useState<AuditEntry | null>(null);

  const refresh = () => {
    setLoading(true);
    listAudit({
      limit: 200,
      agent_id: agentFilter || undefined,
      layer: layerFilter || undefined,
      decision: decisionFilter || undefined,
    })
      .then(setEntries)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Audit Log</h1>

      {/* Filters */}
      <div className="bg-white rounded-xl border shadow-sm p-4 mb-6 flex gap-3 items-end flex-wrap">
        <div>
          <label className="text-xs text-gray-500 block mb-1">Agent ID</label>
          <input
            className="border rounded px-2 py-1.5 text-sm font-mono w-52"
            placeholder="Filter by agent ID…"
            value={agentFilter}
            onChange={(e) => setAgentFilter(e.target.value)}
          />
        </div>
        <div>
          <label className="text-xs text-gray-500 block mb-1">Decision</label>
          <select className="border rounded px-2 py-1.5 text-sm" value={decisionFilter} onChange={(e) => setDecisionFilter(e.target.value)}>
            <option value="">All</option>
            <option value="allow">Allow</option>
            <option value="deny">Deny</option>
          </select>
        </div>
        <button
          onClick={refresh}
          className="px-4 py-1.5 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
        >
          Apply
        </button>
      </div>

      {error && <p className="text-red-500 bg-red-50 rounded p-3 text-sm mb-4">{error}</p>}
      {loading && <p className="text-gray-400 text-sm">Loading…</p>}

      <div className="flex gap-6">
        {/* Table */}
        <div className="flex-1 bg-white rounded-xl border shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs">
              <tr>
                {["Timestamp","Agent","User","Action","Resource","Policy","Decision","Latency","Reason"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 && !loading && (
                <tr>
                  <td colSpan={9} className="px-4 py-8 text-center text-gray-400">
                    No audit entries found. Run a chat to generate policy decisions.
                  </td>
                </tr>
              )}
              {entries.map((entry) => (
                <tr
                  key={entry.id}
                  className={`border-t hover:bg-gray-50 cursor-pointer ${selected?.id === entry.id ? "bg-indigo-50" : ""}`}
                  onClick={() => setSelected(entry)}
                >
                  <td className="px-3 py-2 whitespace-nowrap text-gray-400">
                    {new Date(entry.timestamp).toLocaleString()}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {entry.subject_identity.active_agent_id.slice(0, 10)}…
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500">
                    {entry.subject_identity.invoking_user_id}
                  </td>
                  <td className="px-3 py-2 text-xs">{entry.action}</td>
                  <td className="px-3 py-2 font-mono text-xs">{entry.resource}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">
                    {entry.matched_policy_id ? entry.matched_policy_id.slice(0, 8) + "…" : "—"}
                  </td>
                  <td className="px-3 py-2 font-semibold"
                    style={{ color: entry.decision === "allow" ? "#16a34a" : "#dc2626" }}>
                    {entry.decision.toUpperCase()}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-400">{entry.latency_ms}ms</td>
                  <td className="px-3 py-2 text-xs text-gray-500 max-w-xs truncate">{entry.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Detail panel */}
        {selected && (
          <div className="w-80 bg-white rounded-xl border shadow-sm p-4 shrink-0 self-start sticky top-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm">Audit Detail</h3>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-700 text-xs">✕</button>
            </div>
            <pre className="text-xs bg-gray-900 text-green-300 rounded p-3 overflow-x-auto whitespace-pre-wrap break-all">
              {JSON.stringify(selected, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
