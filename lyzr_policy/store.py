"""
PostgreSQL-backed store for policies and audit logs.

Schema is created on startup with CREATE TABLE IF NOT EXISTS — no migration
framework needed for the demo. Connection settings come from .env.

Uses psycopg2 (synchronous) so it works cleanly in both the FastAPI async
context (run in a thread-pool executor) and the demo script.
"""

from __future__ import annotations

import json
import os
from datetime import datetime
from typing import Optional

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

from .models import (
    AuditEntry,
    DenyBehavior,
    Decision,
    Policy,
    PolicyAction,
    PolicyEffect,
    PolicyScope,
    Recipient,
    RecipientType,
    SubjectIdentity,
    Condition,
    ConditionType,
)

load_dotenv()

# ── Connection ─────────────────────────────────────────────────────────────────

DSN = (
    f"host={os.getenv('POSTGRES_HOST', 'localhost')} "
    f"port={os.getenv('POSTGRES_PORT', '5432')} "
    f"dbname={os.getenv('POSTGRES_DB', 'lyzr_policy')} "
    f"user={os.getenv('POSTGRES_USER', 'lyzr')} "
    f"password={os.getenv('POSTGRES_PASSWORD', 'lyzr_secret')}"
)


def _connect() -> psycopg2.extensions.connection:
    return psycopg2.connect(DSN, cursor_factory=psycopg2.extras.RealDictCursor)


# ── Schema initialisation ──────────────────────────────────────────────────────

CREATE_POLICIES_TABLE = """
CREATE TABLE IF NOT EXISTS policies (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    raw_nl          TEXT NOT NULL,
    scope           TEXT NOT NULL,
    subject         TEXT NOT NULL,
    action          TEXT NOT NULL,
    resource        TEXT NOT NULL,
    condition       JSONB NOT NULL DEFAULT '{}',
    effect          TEXT NOT NULL,
    deny_behavior   TEXT NOT NULL DEFAULT 'deny',
    compiled_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    enabled         BOOLEAN NOT NULL DEFAULT TRUE
);
"""

CREATE_AUDIT_TABLE = """
CREATE TABLE IF NOT EXISTS audit_log (
    id                   TEXT PRIMARY KEY,
    timestamp            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    request_id           TEXT NOT NULL,
    subject_identity     JSONB NOT NULL,
    destination_identity JSONB,
    layer                TEXT NOT NULL,
    action               TEXT NOT NULL,
    resource             TEXT NOT NULL,
    matched_policy_id    TEXT,
    decision             TEXT NOT NULL,
    reason               TEXT NOT NULL,
    latency_ms           INTEGER NOT NULL DEFAULT 0
);
"""


def init_db() -> None:
    """Create tables if they don't exist. Call once at app startup."""
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(CREATE_POLICIES_TABLE)
            cur.execute(CREATE_AUDIT_TABLE)
        conn.commit()


# ── Policy CRUD ────────────────────────────────────────────────────────────────


def save_policy(policy: Policy) -> Policy:
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO policies
                    (id, name, raw_nl, scope, subject, action, resource,
                     condition, effect, deny_behavior, compiled_at, enabled)
                VALUES
                    (%(id)s, %(name)s, %(raw_nl)s, %(scope)s, %(subject)s,
                     %(action)s, %(resource)s, %(condition)s, %(effect)s,
                     %(deny_behavior)s, %(compiled_at)s, %(enabled)s)
                ON CONFLICT (id) DO UPDATE SET
                    name=EXCLUDED.name, raw_nl=EXCLUDED.raw_nl,
                    scope=EXCLUDED.scope, subject=EXCLUDED.subject,
                    action=EXCLUDED.action, resource=EXCLUDED.resource,
                    condition=EXCLUDED.condition, effect=EXCLUDED.effect,
                    deny_behavior=EXCLUDED.deny_behavior,
                    compiled_at=EXCLUDED.compiled_at, enabled=EXCLUDED.enabled
                """,
                {
                    "id": policy.id,
                    "name": policy.name,
                    "raw_nl": policy.raw_nl,
                    "scope": policy.scope.value,
                    "subject": policy.subject,
                    "action": policy.action.value,
                    "resource": policy.resource,
                    "condition": json.dumps(policy.condition.model_dump()),
                    "effect": policy.effect.value,
                    "deny_behavior": policy.deny_behavior.value,
                    "compiled_at": policy.compiled_at,
                    "enabled": policy.enabled,
                },
            )
        conn.commit()
    return policy


def get_policy(policy_id: str) -> Optional[Policy]:
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM policies WHERE id = %s", (policy_id,))
            row = cur.fetchone()
    return _row_to_policy(row) if row else None


def list_policies(
    scope: Optional[PolicyScope] = None,
    enabled_only: bool = True,
) -> list[Policy]:
    clauses = []
    params: list = []
    if enabled_only:
        clauses.append("enabled = TRUE")
    if scope:
        clauses.append("scope = %s")
        params.append(scope.value)
    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(f"SELECT * FROM policies {where} ORDER BY compiled_at DESC", params)
            rows = cur.fetchall()
    return [_row_to_policy(r) for r in rows]


def delete_policy(policy_id: str) -> bool:
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM policies WHERE id = %s RETURNING id", (policy_id,))
            deleted = cur.fetchone() is not None
        conn.commit()
    return deleted


def match_policies(
    scope: PolicyScope,
    subject: str,
    action: PolicyAction,
    resource: str,
) -> list[Policy]:
    """
    Return enabled policies that could apply to this (subject, action, resource).
    Wildcard "*" matches any subject or resource.
    """
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT * FROM policies
                WHERE enabled = TRUE
                  AND scope = %s
                  AND (subject = %s OR subject = '*')
                  AND action = %s
                  AND (resource = %s OR resource = '*')
                ORDER BY compiled_at ASC
                """,
                (scope.value, subject, action.value, resource),
            )
            rows = cur.fetchall()
    return [_row_to_policy(r) for r in rows]


def _row_to_policy(row: dict) -> Policy:
    cond_data = row["condition"] if isinstance(row["condition"], dict) else json.loads(row["condition"])
    return Policy(
        id=row["id"],
        name=row["name"],
        raw_nl=row["raw_nl"],
        scope=PolicyScope(row["scope"]),
        subject=row["subject"],
        action=PolicyAction(row["action"]),
        resource=row["resource"],
        condition=Condition(
            type=ConditionType(cond_data.get("type", "always")),
            match_fields=cond_data.get("match_fields", {}),
            llm_prompt=cond_data.get("llm_prompt"),
        ),
        effect=PolicyEffect(row["effect"]),
        deny_behavior=DenyBehavior(row["deny_behavior"]),
        compiled_at=row["compiled_at"],
        enabled=row["enabled"],
    )


# ── Audit log ──────────────────────────────────────────────────────────────────


def write_audit(entry: AuditEntry) -> None:
    dest = entry.destination_identity.model_dump() if entry.destination_identity else None
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO audit_log
                    (id, timestamp, request_id, subject_identity,
                     destination_identity, layer, action, resource,
                     matched_policy_id, decision, reason, latency_ms)
                VALUES
                    (%(id)s, %(timestamp)s, %(request_id)s, %(subject_identity)s,
                     %(destination_identity)s, %(layer)s, %(action)s, %(resource)s,
                     %(matched_policy_id)s, %(decision)s, %(reason)s, %(latency_ms)s)
                """,
                {
                    "id": entry.id,
                    "timestamp": entry.timestamp,
                    "request_id": entry.request_id,
                    "subject_identity": json.dumps(entry.subject_identity.model_dump()),
                    "destination_identity": json.dumps(dest) if dest else None,
                    "layer": entry.layer.value,
                    "action": entry.action.value,
                    "resource": entry.resource,
                    "matched_policy_id": entry.matched_policy_id,
                    "decision": entry.decision.value,
                    "reason": entry.reason,
                    "latency_ms": entry.latency_ms,
                },
            )
        conn.commit()


def list_audit(
    limit: int = 100,
    offset: int = 0,
    agent_id: Optional[str] = None,
    layer: Optional[PolicyScope] = None,
    decision: Optional[Decision] = None,
) -> list[AuditEntry]:
    clauses = []
    params: list = []

    if agent_id:
        clauses.append("subject_identity->>'active_agent_id' = %s")
        params.append(agent_id)
    if layer:
        clauses.append("layer = %s")
        params.append(layer.value)
    if decision:
        clauses.append("decision = %s")
        params.append(decision.value)

    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
    params += [limit, offset]

    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT * FROM audit_log {where} ORDER BY timestamp DESC LIMIT %s OFFSET %s",
                params,
            )
            rows = cur.fetchall()
    return [_row_to_audit(r) for r in rows]


def _row_to_audit(row: dict) -> AuditEntry:
    subj = row["subject_identity"]
    if isinstance(subj, str):
        subj = json.loads(subj)
    dest_raw = row["destination_identity"]
    dest = None
    if dest_raw:
        if isinstance(dest_raw, str):
            dest_raw = json.loads(dest_raw)
        dest = Recipient(
            recipient_type=RecipientType(dest_raw["recipient_type"]),
            recipient_id=dest_raw["recipient_id"],
            trust_domain=dest_raw.get("trust_domain", "internal"),
        )
    return AuditEntry(
        id=row["id"],
        timestamp=row["timestamp"],
        request_id=row["request_id"],
        subject_identity=SubjectIdentity(**subj),
        destination_identity=dest,
        layer=PolicyScope(row["layer"]),
        action=PolicyAction(row["action"]),
        resource=row["resource"],
        matched_policy_id=row["matched_policy_id"],
        decision=Decision(row["decision"]),
        reason=row["reason"],
        latency_ms=row["latency_ms"],
    )
