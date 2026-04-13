"use client";

import { useEffect, useState } from "react";
import {
  Policy,
  createPolicy,
  deletePolicy,
  listPolicies,
  previewPolicy,
  togglePolicy,
} from "@/lib/api";
import { ChevronDown, ChevronUp, Eye, Plus, Trash2, ToggleLeft, ToggleRight, Sparkles } from "lucide-react";

function EffectBadge({ effect }: { effect: string }) {
  return (
    <span className={`badge ${effect === "forbid" ? "badge-forbid" : "badge-permit"}`}>
      {effect === "forbid" ? "FORBID" : "PERMIT"}
    </span>
  );
}

function ActionBadge({ action }: { action: string }) {
  return (
    <span className="badge badge-neutral" style={{ fontFamily: "monospace", fontSize: 10.5 }}>
      {action.replace(/_/g, " ")}
    </span>
  );
}

function PolicyCard({
  policy,
  onToggle,
  onDelete,
}: {
  policy: Policy;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      style={{
        borderBottom: "1px solid var(--border-soft)",
        padding: "14px 20px",
        opacity: policy.enabled ? 1 : 0.45,
        transition: "opacity 0.15s",
      }}
    >
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12, justifyContent: "space-between" }}>
        {/* Left: badges + name */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
            <EffectBadge effect={policy.effect} />
            <ActionBadge action={policy.action} />
            {!policy.enabled && (
              <span className="badge badge-neutral" style={{ fontSize: 10 }}>disabled</span>
            )}
          </div>
          <p
            style={{
              margin: 0,
              fontWeight: 500,
              fontSize: 13.5,
              color: "var(--text-primary)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {policy.name}
          </p>
          <p
            style={{
              margin: "3px 0 0",
              fontSize: 12,
              color: "var(--text-muted)",
              fontStyle: "italic",
            }}
          >
            &ldquo;{policy.raw_nl}&rdquo;
          </p>
        </div>

        {/* Right: actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          <button
            className="btn btn-ghost"
            style={{ padding: "5px 8px", fontSize: 12, gap: 4 }}
            onClick={() => setExpanded((v) => !v)}
            title="Details"
          >
            {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <button
            className="btn btn-ghost"
            style={{ padding: "5px 8px", fontSize: 12, gap: 4, color: policy.enabled ? "var(--text-muted)" : "var(--accent)" }}
            onClick={onToggle}
            title={policy.enabled ? "Disable" : "Enable"}
          >
            {policy.enabled ? <ToggleRight size={15} /> : <ToggleLeft size={15} />}
          </button>
          <button
            className="btn btn-ghost"
            style={{ padding: "5px 8px", fontSize: 12, color: "var(--red)" }}
            onClick={onDelete}
            title="Delete"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div
          style={{
            marginTop: 12,
            padding: "12px 14px",
            background: "var(--surface-muted)",
            borderRadius: 7,
            border: "1px solid var(--border-soft)",
            fontSize: 12,
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
            <Detail label="Resource" value={policy.resource} mono />
            <Detail label="Principal: user" value={policy.principal.user_id || "any"} mono />
            <Detail label="Principal: org" value={policy.principal.org_id || "any"} mono />
          </div>
          {policy.conditions.length > 0 && (
            <div style={{ marginTop: 10 }}>
              <p className="section-label">Conditions</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {policy.conditions.map((c, i) => (
                  <code
                    key={i}
                    style={{
                      fontSize: 11,
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: 5,
                      padding: "2px 8px",
                      color: "var(--text-secondary)",
                    }}
                  >
                    {c.field} {c.operator} {JSON.stringify(c.value)}
                  </code>
                ))}
              </div>
            </div>
          )}
          <p style={{ marginTop: 8, marginBottom: 0, color: "var(--text-muted)", fontSize: 11 }}>
            Compiled {new Date(policy.compiled_at).toLocaleString()}
          </p>
        </div>
      )}
    </div>
  );
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="section-label" style={{ marginBottom: 3 }}>{label}</p>
      <p
        style={{
          margin: 0,
          fontSize: mono ? 11.5 : 12.5,
          color: "var(--text-primary)",
          fontFamily: mono ? "monospace" : undefined,
        }}
      >
        {value}
      </p>
    </div>
  );
}

const EXAMPLES = [
  "Forbid user blocked-user-123 from calling notion",
  "Forbid all users from asking about password",
  "Forbid all users from asking about credentials",
];

export default function PoliciesPage() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [nlRule, setNlRule] = useState("");
  const [preview, setPreview] = useState<Policy | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => listPolicies().then(setPolicies).catch(() => null);

  useEffect(() => { refresh(); }, []);

  const handlePreview = async () => {
    if (!nlRule.trim()) return;
    setLoading(true);
    setError(null);
    setPreview(null);
    try {
      const resp = await previewPolicy(nlRule);
      setPreview(resp.preview);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!nlRule.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await createPolicy(nlRule);
      setNlRule("");
      setPreview(null);
      refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ maxWidth: 860 }}>
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">Policies</h1>
        <p className="page-subtitle">
          Write natural-language rules. The compiler converts them into structured permit/forbid policies.
        </p>
      </div>

      {/* Composer */}
      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 10,
          padding: "20px 22px",
          marginBottom: 24,
          boxShadow: "var(--shadow-xs)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
          <Sparkles size={15} style={{ color: "var(--accent)" }} />
          <p style={{ margin: 0, fontWeight: 600, fontSize: 13.5, color: "var(--text-primary)" }}>
            New Policy
          </p>
        </div>

        {/* Examples */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => setNlRule(ex)}
              style={{
                background: "var(--surface-muted)",
                border: "1px solid var(--border)",
                borderRadius: 5,
                padding: "3px 9px",
                fontSize: 11.5,
                color: "var(--text-muted)",
                cursor: "pointer",
                fontFamily: "monospace",
                transition: "background 0.12s, color 0.12s",
              }}
              onMouseEnter={(e) => {
                (e.target as HTMLElement).style.color = "var(--text-primary)";
                (e.target as HTMLElement).style.background = "var(--surface-hover)";
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLElement).style.color = "var(--text-muted)";
                (e.target as HTMLElement).style.background = "var(--surface-muted)";
              }}
            >
              {ex}
            </button>
          ))}
        </div>

        <textarea
          className="textarea"
          style={{
            width: "100%",
            minHeight: 96,
            resize: "vertical",
            fontFamily: "monospace",
            fontSize: 13,
            background: "var(--surface-muted)",
          }}
          placeholder="e.g. Forbid user alice from calling notion&#10;e.g. Forbid all users from asking about password"
          value={nlRule}
          onChange={(e) => setNlRule(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && e.metaKey && handleSave()}
        />

        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10 }}>
          <button
            className="btn btn-secondary"
            onClick={handlePreview}
            disabled={loading || !nlRule.trim()}
            style={{ gap: 6 }}
          >
            <Eye size={13} />
            {loading ? "Compiling…" : "Preview"}
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving || !nlRule.trim()}
            style={{ gap: 6 }}
          >
            <Plus size={13} />
            {saving ? "Saving…" : "Compile & Save"}
          </button>
          <span style={{ fontSize: 11.5, color: "var(--text-muted)", marginLeft: 4 }}>
            ⌘ + Enter to save
          </span>
        </div>

        {error && (
          <div
            style={{
              marginTop: 12,
              background: "var(--red-bg)",
              border: "1px solid var(--red-border)",
              borderRadius: 7,
              padding: "9px 13px",
              color: "var(--red)",
              fontSize: 12.5,
            }}
          >
            {error}
          </div>
        )}

        {/* Preview */}
        {preview && (
          <div style={{ marginTop: 14 }}>
            <p className="section-label">Compiled Preview</p>
            <div
              style={{
                background: "#101010",
                borderRadius: 8,
                padding: "14px 16px",
                overflow: "auto",
                border: "1px solid #2a2a2a",
              }}
            >
              <pre
                style={{
                  margin: 0,
                  color: "#6ee7b7",
                  fontFamily: "monospace",
                  fontSize: 12,
                  lineHeight: 1.65,
                }}
              >
                {JSON.stringify(preview, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>

      {/* Policies list */}
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
            padding: "12px 20px",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <p style={{ margin: 0, fontWeight: 600, fontSize: 13.5 }}>
            Active Policies
          </p>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              background: policies.length > 0 ? "var(--accent-soft)" : "var(--surface-hover)",
              color: policies.length > 0 ? "var(--accent)" : "var(--text-muted)",
              border: `1px solid ${policies.length > 0 ? "var(--accent-border)" : "var(--border)"}`,
              borderRadius: 99,
              padding: "2px 9px",
            }}
          >
            {policies.length}
          </span>
        </div>

        {policies.length === 0 ? (
          <div
            style={{
              padding: "48px 20px",
              textAlign: "center",
              color: "var(--text-muted)",
              fontSize: 13,
            }}
          >
            <p style={{ margin: 0 }}>No policies yet.</p>
            <p style={{ margin: "4px 0 0", fontSize: 12 }}>
              Write your first rule above to govern tool access or block content.
            </p>
          </div>
        ) : (
          policies.map((policy) => (
            <PolicyCard
              key={policy.id}
              policy={policy}
              onToggle={() => togglePolicy(policy.id, !policy.enabled).then(refresh)}
              onDelete={() => deletePolicy(policy.id).then(refresh)}
            />
          ))
        )}
      </div>
    </div>
  );
}
