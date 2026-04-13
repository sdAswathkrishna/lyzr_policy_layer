"use client";

import { useEffect, useState } from "react";
import { X, Filter, RefreshCw } from "lucide-react";
import { AuditEntry, listAudit } from "@/lib/api";

function DecisionBadge({ decision }: { decision: "allow" | "deny" }) {
  return (
    <span className={`badge badge-${decision}`}>
      {decision === "allow" ? "ALLOW" : "DENY"}
    </span>
  );
}

function ActionBadge({ action }: { action: string }) {
  return (
    <span className="badge badge-neutral" style={{ fontFamily: "monospace", fontSize: 10 }}>
      {action.replace(/_/g, " ")}
    </span>
  );
}

export default function AuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [userFilter, setUserFilter] = useState("");
  const [orgFilter, setOrgFilter] = useState("");
  const [decisionFilter, setDecisionFilter] = useState("");
  const [selected, setSelected] = useState<AuditEntry | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = () => {
    setLoading(true);
    listAudit({
      limit: 200,
      user_id: userFilter || undefined,
      org_id: orgFilter || undefined,
      decision: decisionFilter || undefined,
    })
      .then(setEntries)
      .catch(() => null)
      .finally(() => setLoading(false));
  };

  useEffect(() => { refresh(); }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 72px)", maxWidth: 1200 }}>
      {/* Header */}
      <div className="page-header" style={{ marginBottom: 16, flexShrink: 0 }}>
        <h1 className="page-title">Audit Log</h1>
        <p className="page-subtitle">
          Every policy evaluation — permit and forbid — is recorded here in real time.
        </p>
      </div>

      {/* Filter bar */}
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: "13px 16px",
          marginBottom: 14,
          display: "flex",
          gap: 10,
          alignItems: "flex-end",
          flexWrap: "wrap",
          boxShadow: "var(--shadow-xs)",
          flexShrink: 0,
        }}
      >
        <Filter size={14} style={{ color: "var(--text-muted)", alignSelf: "center", flexShrink: 0 }} />
        <div>
          <label className="section-label">User ID</label>
          <input
            className="input"
            style={{ width: 180, fontFamily: "monospace", fontSize: 12 }}
            placeholder="any"
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && refresh()}
          />
        </div>
        <div>
          <label className="section-label">Org ID</label>
          <input
            className="input"
            style={{ width: 160, fontFamily: "monospace", fontSize: 12 }}
            placeholder="any"
            value={orgFilter}
            onChange={(e) => setOrgFilter(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && refresh()}
          />
        </div>
        <div>
          <label className="section-label">Decision</label>
          <select
            className="select"
            style={{ width: 120 }}
            value={decisionFilter}
            onChange={(e) => setDecisionFilter(e.target.value)}
          >
            <option value="">All</option>
            <option value="allow">Allow</option>
            <option value="deny">Deny</option>
          </select>
        </div>
        <button className="btn btn-secondary" onClick={refresh} style={{ gap: 6 }}>
          <RefreshCw size={13} className={loading ? "spin" : ""} />
          Apply
        </button>
        {entries.length > 0 && (
          <span style={{ fontSize: 12, color: "var(--text-muted)", alignSelf: "center", marginLeft: 4 }}>
            {entries.length} entries
          </span>
        )}
      </div>

      {/* Table + detail panel */}
      <div style={{ display: "flex", gap: 14, flex: 1, minHeight: 0 }}>
        {/* Table */}
        <div
          style={{
            flex: 1,
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            overflow: "hidden",
            display: "flex",
            flexDirection: "column",
            boxShadow: "var(--shadow-xs)",
            minWidth: 0,
          }}
        >
          <div style={{ overflowX: "auto", flex: 1, overflowY: "auto" }}>
            <table className="data-table" style={{ minWidth: 700 }}>
              <thead style={{ position: "sticky", top: 0, zIndex: 1 }}>
                <tr>
                  {["Timestamp", "User", "Org", "Action", "Resource", "Decision", "Latency", "Reason"].map(
                    (h) => <th key={h}>{h}</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {entries.length === 0 && (
                  <tr>
                    <td
                      colSpan={8}
                      style={{ textAlign: "center", color: "var(--text-muted)", padding: "48px 0", fontSize: 13 }}
                    >
                      {loading ? "Loading…" : "No audit entries found."}
                    </td>
                  </tr>
                )}
                {entries.map((entry) => (
                  <tr
                    key={entry.id}
                    style={{
                      cursor: "pointer",
                      background: selected?.id === entry.id ? "var(--accent-soft)" : undefined,
                    }}
                    onClick={() => setSelected((p) => (p?.id === entry.id ? null : entry))}
                  >
                    <td style={{ color: "var(--text-muted)", whiteSpace: "nowrap", fontSize: 12 }}>
                      {new Date(entry.timestamp).toLocaleString()}
                    </td>
                    <td>
                      <code style={{ fontSize: 11.5, color: "var(--text-primary)" }}>
                        {entry.principal.user_id}
                      </code>
                    </td>
                    <td>
                      <code style={{ fontSize: 11.5, color: "var(--text-secondary)" }}>
                        {entry.principal.org_id}
                      </code>
                    </td>
                    <td><ActionBadge action={entry.action} /></td>
                    <td>
                      <code style={{ fontSize: 11.5 }}>{entry.resource}</code>
                    </td>
                    <td><DecisionBadge decision={entry.decision} /></td>
                    <td style={{ color: "var(--text-muted)", fontSize: 12, whiteSpace: "nowrap" }}>
                      {entry.latency_ms}ms
                    </td>
                    <td
                      style={{
                        maxWidth: 220,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        fontSize: 12,
                        color: "var(--text-muted)",
                      }}
                    >
                      {entry.reason}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Detail panel */}
        {selected && (
          <div
            style={{
              width: 320,
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              boxShadow: "var(--shadow-xs)",
              flexShrink: 0,
              alignSelf: "flex-start",
              maxHeight: "100%",
            }}
          >
            {/* Panel header */}
            <div
              style={{
                padding: "12px 16px",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <DecisionBadge decision={selected.decision} />
                <p style={{ margin: 0, fontWeight: 600, fontSize: 13 }}>Audit Detail</p>
              </div>
              <button
                className="btn btn-ghost"
                onClick={() => setSelected(null)}
                style={{ padding: "4px 6px" }}
              >
                <X size={14} />
              </button>
            </div>

            {/* Detail rows */}
            <div
              style={{
                overflowY: "auto",
                padding: "14px 16px",
                display: "flex",
                flexDirection: "column",
                gap: 12,
              }}
            >
              {[
                { label: "Request ID", value: selected.request_id },
                { label: "Timestamp", value: new Date(selected.timestamp).toLocaleString() },
                { label: "User", value: selected.principal.user_id },
                { label: "Org", value: selected.principal.org_id },
                { label: "Auth Source", value: selected.principal.auth_source },
                { label: "Action", value: selected.action },
                { label: "Resource", value: selected.resource },
                { label: "Reason", value: selected.reason },
                { label: "Latency", value: `${selected.latency_ms}ms` },
              ].map(({ label, value }) => (
                <div key={label}>
                  <p className="section-label" style={{ marginBottom: 2 }}>{label}</p>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 12.5,
                      color: "var(--text-primary)",
                      wordBreak: "break-all",
                      fontFamily: ["Request ID", "User", "Org", "Resource"].includes(label) ? "monospace" : undefined,
                    }}
                  >
                    {value}
                  </p>
                </div>
              ))}

              {selected.matched_policy_ids.length > 0 && (
                <div>
                  <p className="section-label" style={{ marginBottom: 4 }}>Matched Policies</p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {selected.matched_policy_ids.map((id) => (
                      <code
                        key={id}
                        style={{
                          fontSize: 11,
                          color: "var(--text-secondary)",
                          background: "var(--surface-muted)",
                          border: "1px solid var(--border-soft)",
                          borderRadius: 5,
                          padding: "3px 8px",
                          display: "block",
                          wordBreak: "break-all",
                        }}
                      >
                        {id}
                      </code>
                    ))}
                  </div>
                </div>
              )}

              {Object.keys(selected.evaluated_context).length > 0 && (
                <div>
                  <p className="section-label" style={{ marginBottom: 4 }}>Evaluated Context</p>
                  <pre
                    style={{
                      margin: 0,
                      background: "#101010",
                      color: "#6ee7b7",
                      fontSize: 11,
                      borderRadius: 7,
                      padding: "10px 12px",
                      overflow: "auto",
                      fontFamily: "monospace",
                      lineHeight: 1.6,
                    }}
                  >
                    {JSON.stringify(selected.evaluated_context, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
