"use client";

import { useEffect, useState } from "react";
import { auditStats, AuditStats, listAudit, AuditEntry } from "@/lib/api";
import Link from "next/link";

function StatCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div className="rounded-xl border p-5 bg-white shadow-sm">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`text-3xl font-bold mt-1 ${color}`}>{value}</p>
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [recent, setRecent] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([auditStats(), listAudit({ limit: 10 })])
      .then(([s, r]) => { setStats(s); setRecent(r); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-gray-400">
          POC control-plane — integrated with Lyzr APIs, not inside Lyzr&apos;s native runtime
        </p>
      </div>

      <div className="mb-6 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl border-2 border-indigo-200 p-6">
        <h2 className="text-lg font-bold text-indigo-900 mb-3">Policy Enforcement Layer</h2>
        <p className="text-sm text-indigo-700">
          Unified governance checkpoint for all agent actions. Controls data access, tool authorization, and output handling through simple, natural language policies.
        </p>
      </div>

      {loading && <p className="text-gray-400">Loading stats…</p>}
      {error && (
        <p className="text-red-500 bg-red-50 rounded p-3 text-sm">
          {error} — is the API server running? <code>uvicorn api.main:app --reload</code>
        </p>
      )}

      {stats && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <StatCard label="Total Policy Checks" value={stats.total} color="text-gray-800" />
            <StatCard label="Allowed" value={stats.total_allow} color="text-green-600" />
            <StatCard label="Denied" value={stats.total_deny} color="text-red-600" />
            <StatCard
              label="Deny Rate"
              value={`${stats.total > 0 ? Math.round((stats.total_deny / stats.total) * 100) : 0}%`}
              color="text-orange-600"
            />
          </div>
        </>
      )}

      <div className="bg-white rounded-xl border shadow-sm">
        <div className="px-5 py-3 border-b flex items-center justify-between">
          <h2 className="font-semibold">Recent Policy Decisions</h2>
          <Link href="/audit" className="text-xs text-indigo-600 hover:underline">View all →</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs">
              <tr>
                {["Time","Agent","Resource","Decision","Reason"].map(h => (
                  <th key={h} className="px-4 py-2 text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-400">No decisions yet — run a chat.</td></tr>
              )}
              {recent.map((entry) => (
                <tr key={entry.id} className="border-t hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-400 whitespace-nowrap">{new Date(entry.timestamp).toLocaleTimeString()}</td>
                  <td className="px-4 py-2 font-mono text-xs">{entry.subject_identity.active_agent_id.slice(0, 12)}…</td>
                  <td className="px-4 py-2 font-mono text-xs">{entry.resource}</td>
                  <td className="px-4 py-2 font-semibold"
                    style={{ color: entry.decision === "allow" ? "#16a34a" : "#dc2626" }}>
                    {entry.decision.toUpperCase()}
                  </td>
                  <td className="px-4 py-2 text-gray-500 max-w-xs truncate">{entry.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

}
