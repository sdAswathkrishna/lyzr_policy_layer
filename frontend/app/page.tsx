"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, CheckCircle2, ShieldCheck, XCircle, Zap } from "lucide-react";
import { AuditEntry, AuditStats, auditStats, listAudit } from "@/lib/api";

function StatCard({
  label,
  value,
  accent,
  icon,
  sublabel,
}: {
  label: string;
  value: number | string;
  accent: string;
  icon: React.ReactNode;
  sublabel?: string;
}) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "20px 22px",
        boxShadow: "var(--shadow-xs)",
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <p
          style={{
            fontSize: 11,
            color: "var(--text-muted)",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            margin: 0,
          }}
        >
          {label}
        </p>
        <span style={{ color: accent, opacity: 0.7 }}>{icon}</span>
      </div>
      <div>
        <p
          style={{
            fontSize: 30,
            fontWeight: 700,
            color: accent,
            margin: 0,
            lineHeight: 1,
            fontFamily: "Roboto, sans-serif",
          }}
        >
          {value}
        </p>
        {sublabel && (
          <p style={{ fontSize: 11.5, color: "var(--text-muted)", margin: "5px 0 0" }}>
            {sublabel}
          </p>
        )}
      </div>
    </div>
  );
}

function DecisionBadge({ decision }: { decision: "allow" | "deny" }) {
  return (
    <span className={`badge badge-${decision}`}>
      {decision === "allow" ? "ALLOW" : "DENY"}
    </span>
  );
}

function ActionBadge({ action }: { action: string }) {
  const label = action.replace(/_/g, " ");
  return (
    <span className="badge badge-neutral" style={{ fontFamily: "monospace", fontSize: 10.5 }}>
      {label}
    </span>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState<AuditStats | null>(null);
  const [recent, setRecent] = useState<AuditEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([auditStats(), listAudit({ limit: 8 })])
      .then(([s, a]) => { setStats(s); setRecent(a); })
      .catch((e) => setError(e.message));
  }, []);

  const denyRate = stats && stats.total > 0
    ? Math.round((stats.total_deny / stats.total) * 100)
    : 0;

  return (
    <div style={{ maxWidth: 1100 }}>
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <p className="page-subtitle">
          Runtime policy governance for your Lyzr agents — who can access what, under which conditions.
        </p>
      </div>

      {/* Hero banner */}
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: "20px 24px",
          marginBottom: 28,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          boxShadow: "var(--shadow-xs)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 38,
              height: 38,
              borderRadius: 9,
              background: "var(--accent-soft)",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
            }}
          >
            <ShieldCheck size={18} style={{ color: "var(--accent)" }} />
          </div>
          <div>
            <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: "var(--text-primary)" }}>
              User / Org Policy Gateway
            </p>
            <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "var(--text-muted)" }}>
              Evaluates permit/forbid rules before governed tool calls or RAG retrieval reach your model.
            </p>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <Link href="/policies" className="btn btn-secondary" style={{ fontSize: 12.5 }}>
            Manage policies
          </Link>
          <Link href="/chat" className="btn btn-primary" style={{ fontSize: 12.5 }}>
            Try it <ArrowRight size={13} />
          </Link>
        </div>
      </div>

      {error && (
        <div
          style={{
            background: "var(--red-bg)",
            border: "1px solid var(--red-border)",
            borderRadius: 8,
            padding: "10px 14px",
            color: "var(--red)",
            fontSize: 13,
            marginBottom: 20,
          }}
        >
          {error}
        </div>
      )}

      {/* Stats grid */}
      {stats && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 14,
            marginBottom: 28,
          }}
        >
          <StatCard
            label="Total Checks"
            value={stats.total}
            accent="var(--text-primary)"
            icon={<Zap size={16} />}
            sublabel="All gateway evaluations"
          />
          <StatCard
            label="Allowed"
            value={stats.total_allow}
            accent="var(--green)"
            icon={<CheckCircle2 size={16} />}
            sublabel="Permitted by policy"
          />
          <StatCard
            label="Denied"
            value={stats.total_deny}
            accent="var(--red)"
            icon={<XCircle size={16} />}
            sublabel="Blocked by policy"
          />
          <StatCard
            label="Deny Rate"
            value={`${denyRate}%`}
            accent={denyRate > 30 ? "var(--red)" : "var(--text-secondary)"}
            icon={<ShieldCheck size={16} />}
            sublabel="Of all decisions"
          />
        </div>
      )}

      {/* Recent decisions table */}
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          overflow: "hidden",
          boxShadow: "var(--shadow-xs)",
        }}
      >
        <div
          style={{
            padding: "13px 20px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <p style={{ margin: 0, fontWeight: 600, fontSize: 13.5 }}>Recent Gateway Decisions</p>
          <Link
            href="/audit"
            style={{
              fontSize: 12.5,
              color: "var(--accent)",
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            View all <ArrowRight size={12} />
          </Link>
        </div>

        <div style={{ overflowX: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                {["Time", "User", "Action", "Resource", "Decision", "Reason"].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    style={{
                      textAlign: "center",
                      color: "var(--text-muted)",
                      padding: "40px 16px",
                      fontSize: 13,
                    }}
                  >
                    No gateway decisions yet. Try sending a governed chat request.
                  </td>
                </tr>
              )}
              {recent.map((entry) => (
                <tr key={entry.id}>
                  <td style={{ color: "var(--text-muted)", whiteSpace: "nowrap", fontSize: 12 }}>
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </td>
                  <td>
                    <code style={{ fontSize: 12, color: "var(--text-primary)" }}>
                      {entry.principal.user_id}
                    </code>
                  </td>
                  <td>
                    <ActionBadge action={entry.action} />
                  </td>
                  <td>
                    <code style={{ fontSize: 12 }}>{entry.resource}</code>
                  </td>
                  <td>
                    <DecisionBadge decision={entry.decision} />
                  </td>
                  <td
                    style={{
                      maxWidth: 260,
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
    </div>
  );
}
