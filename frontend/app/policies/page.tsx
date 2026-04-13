"use client";

import { useEffect, useState } from "react";
import {
  listPolicies,
  previewPolicy,
  createPolicy,
  deletePolicy,
  togglePolicy,
  Policy,
} from "@/lib/api";

export default function PoliciesPage() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [nlRule, setNlRule] = useState("");
  const [scopeHint, setScopeHint] = useState("");
  const [preview, setPreview] = useState<Policy | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const refresh = () => listPolicies().then(setPolicies).catch(() => null);

  useEffect(() => { refresh(); }, []);

  const handlePreview = async () => {
    if (!nlRule.trim()) return;
    setLoading(true);
    setError(null);
    setPreview(null);
    try {
      const resp = await previewPolicy(nlRule, scopeHint || undefined);
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
      await createPolicy(nlRule, scopeHint || undefined);
      setNlRule("");
      setScopeHint("");
      setPreview(null);
      setSuccess("Policy saved.");
      setTimeout(() => setSuccess(null), 3000);
      refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await deletePolicy(id);
    refresh();
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    await togglePolicy(id, !enabled);
    refresh();
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Policies</h1>

      {/* Rule editor */}
      <div className="bg-white rounded-xl border shadow-sm p-6 mb-8">
        <h2 className="font-semibold mb-3">Write a Policy Rule</h2>
        <p className="text-sm text-gray-500 mb-4">
          Describe a rule in plain language. The system compiles it to a structured JSON policy.
        </p>
        <textarea
          className="w-full border rounded-lg px-3 py-2 text-sm font-mono min-h-[80px] focus:outline-none focus:ring-2 focus:ring-indigo-300"
          placeholder='e.g. "agent support-bot cannot call github" or "output from agent finance-bot cannot be sent to external users"'
          value={nlRule}
          onChange={(e) => setNlRule(e.target.value)}
        />
        <div className="flex items-center gap-3 mt-3">
          <button
            onClick={handlePreview}
            disabled={loading || !nlRule.trim()}
            className="px-4 py-1.5 text-sm rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 disabled:opacity-50"
          >
            {loading ? "Compiling…" : "Preview"}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !nlRule.trim()}
            className="px-4 py-1.5 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Compile & Save"}
          </button>
        </div>

        {error && <p className="mt-3 text-red-600 text-sm bg-red-50 rounded p-2">{error}</p>}
        {success && <p className="mt-3 text-green-600 text-sm bg-green-50 rounded p-2">{success}</p>}

        {/* Compiled JSON preview */}
        {preview && (
          <div className="mt-4">
            <p className="text-xs font-semibold text-gray-500 mb-1">Compiled Policy (preview — not yet saved)</p>
            <pre className="bg-gray-900 text-green-300 text-xs rounded-lg p-4 overflow-x-auto">
              {JSON.stringify(preview, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* Policy list */}
      <div className="bg-white rounded-xl border shadow-sm">
        <div className="px-5 py-3 border-b font-semibold">Active Policies ({policies.length})</div>
        {policies.length === 0 && (
          <p className="px-5 py-6 text-gray-400 text-sm">No policies yet. Write one above.</p>
        )}
        {policies.map((p) => (
          <div key={p.id} className={`border-b px-5 py-4 ${!p.enabled ? "opacity-50" : ""}`}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs px-2 py-0.5 rounded font-medium ${p.effect === "deny" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`}>
                    {p.effect}
                  </span>
                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                    {p.deny_behavior}
                  </span>
                  {!p.enabled && <span className="text-xs text-gray-400">(disabled)</span>}
                </div>
                <p className="font-medium text-sm">{p.name}</p>
                <p className="text-xs text-gray-500 mt-0.5 italic">&quot;{p.raw_nl}&quot;</p>
                <p className="text-xs text-gray-400 mt-1">
                  subject: <code>{p.subject}</code> · resource: <code>{p.resource}</code> · condition: <code>{p.condition.type}</code>
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleToggle(p.id, p.enabled)}
                  className="text-xs px-3 py-1 rounded border hover:bg-gray-50"
                >
                  {p.enabled ? "Disable" : "Enable"}
                </button>
                <button
                  onClick={() => handleDelete(p.id)}
                  className="text-xs px-3 py-1 rounded border border-red-200 text-red-600 hover:bg-red-50"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
