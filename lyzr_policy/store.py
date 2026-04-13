"""
PostgreSQL-backed store for V1 gateway policies and audit records.
"""

from __future__ import annotations

import json
import os
from typing import Optional

import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

from .models import (
    AuditEntry,
    AuditPrincipal,
    ComparisonOperator,
    Decision,
    Policy,
    PolicyAction,
    PolicyCondition,
    PolicyEffect,
    Principal,
)

load_dotenv()

DSN = (
    f"host={os.getenv('POSTGRES_HOST', 'localhost')} "
    f"port={os.getenv('POSTGRES_PORT', '5432')} "
    f"dbname={os.getenv('POSTGRES_DB', 'lyzr_policy')} "
    f"user={os.getenv('POSTGRES_USER', 'lyzr')} "
    f"password={os.getenv('POSTGRES_PASSWORD', 'lyzr_secret')}"
)


def _connect() -> psycopg2.extensions.connection:
    return psycopg2.connect(DSN, cursor_factory=psycopg2.extras.RealDictCursor)


def init_db() -> None:
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS policies (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    raw_nl TEXT NOT NULL,
                    scope TEXT NOT NULL DEFAULT 'gateway',
                    subject TEXT NOT NULL DEFAULT '*',
                    condition JSONB NOT NULL DEFAULT '{}',
                    principal JSONB NOT NULL DEFAULT '{}',
                    action TEXT NOT NULL,
                    resource TEXT NOT NULL,
                    conditions JSONB NOT NULL DEFAULT '[]',
                    effect TEXT NOT NULL,
                    deny_behavior TEXT NOT NULL DEFAULT 'deny',
                    compiled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    enabled BOOLEAN NOT NULL DEFAULT TRUE
                );
                """
            )
            cur.execute(
                """
                ALTER TABLE policies
                ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'gateway';
                """
            )
            cur.execute(
                """
                ALTER TABLE policies
                ADD COLUMN IF NOT EXISTS subject TEXT NOT NULL DEFAULT '*';
                """
            )
            cur.execute(
                """
                ALTER TABLE policies
                ADD COLUMN IF NOT EXISTS condition JSONB NOT NULL DEFAULT '{}';
                """
            )
            cur.execute(
                """
                ALTER TABLE policies
                ADD COLUMN IF NOT EXISTS principal JSONB NOT NULL DEFAULT '{}';
                """
            )
            cur.execute(
                """
                ALTER TABLE policies
                ADD COLUMN IF NOT EXISTS conditions JSONB NOT NULL DEFAULT '[]';
                """
            )
            cur.execute(
                """
                ALTER TABLE policies
                ADD COLUMN IF NOT EXISTS deny_behavior TEXT NOT NULL DEFAULT 'deny';
                """
            )
            cur.execute(
                """
                CREATE TABLE IF NOT EXISTS audit_log (
                    id TEXT PRIMARY KEY,
                    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    request_id TEXT NOT NULL,
                    subject_identity JSONB NOT NULL DEFAULT '{}',
                    destination_identity JSONB,
                    layer TEXT NOT NULL DEFAULT 'gateway',
                    principal JSONB NOT NULL,
                    action TEXT NOT NULL,
                    resource TEXT NOT NULL,
                    evaluated_context JSONB NOT NULL DEFAULT '{}',
                    matched_policy_id TEXT,
                    matched_policy_ids JSONB NOT NULL DEFAULT '[]',
                    decision TEXT NOT NULL,
                    reason TEXT NOT NULL,
                    latency_ms INTEGER NOT NULL DEFAULT 0
                );
                """
            )
            cur.execute(
                """
                ALTER TABLE audit_log
                ADD COLUMN IF NOT EXISTS subject_identity JSONB NOT NULL DEFAULT '{}';
                """
            )
            cur.execute(
                """
                ALTER TABLE audit_log
                ADD COLUMN IF NOT EXISTS destination_identity JSONB;
                """
            )
            cur.execute(
                """
                ALTER TABLE audit_log
                ADD COLUMN IF NOT EXISTS layer TEXT NOT NULL DEFAULT 'gateway';
                """
            )
            cur.execute(
                """
                ALTER TABLE audit_log
                ADD COLUMN IF NOT EXISTS principal JSONB NOT NULL DEFAULT '{}';
                """
            )
            cur.execute(
                """
                ALTER TABLE audit_log
                ADD COLUMN IF NOT EXISTS evaluated_context JSONB NOT NULL DEFAULT '{}';
                """
            )
            cur.execute(
                """
                ALTER TABLE audit_log
                ADD COLUMN IF NOT EXISTS matched_policy_id TEXT;
                """
            )
            cur.execute(
                """
                ALTER TABLE audit_log
                ADD COLUMN IF NOT EXISTS matched_policy_ids JSONB NOT NULL DEFAULT '[]';
                """
            )
        conn.commit()


def save_policy(policy: Policy) -> Policy:
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO policies
                    (id, name, raw_nl, scope, subject, condition, principal, action, resource,
                     conditions, effect, deny_behavior, compiled_at, enabled)
                VALUES
                    (%(id)s, %(name)s, %(raw_nl)s, %(scope)s, %(subject)s, %(condition)s, %(principal)s, %(action)s,
                     %(resource)s, %(conditions)s, %(effect)s, %(deny_behavior)s, %(compiled_at)s, %(enabled)s)
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    raw_nl = EXCLUDED.raw_nl,
                    scope = EXCLUDED.scope,
                    subject = EXCLUDED.subject,
                    condition = EXCLUDED.condition,
                    principal = EXCLUDED.principal,
                    action = EXCLUDED.action,
                    resource = EXCLUDED.resource,
                    conditions = EXCLUDED.conditions,
                    effect = EXCLUDED.effect,
                    deny_behavior = EXCLUDED.deny_behavior,
                    compiled_at = EXCLUDED.compiled_at,
                    enabled = EXCLUDED.enabled
                """,
                {
                    "id": policy.id,
                    "name": policy.name,
                    "raw_nl": policy.raw_nl,
                    "scope": "gateway",
                    "subject": policy.principal.user_id or policy.principal.org_id or "*",
                    "condition": json.dumps({}),
                    "principal": json.dumps(policy.principal.model_dump(exclude_none=True)),
                    "action": policy.action.value,
                    "resource": policy.resource,
                    "conditions": json.dumps([cond.model_dump() for cond in policy.conditions]),
                    "effect": policy.effect.value,
                    "deny_behavior": "deny",
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


def list_policies(enabled_only: bool = True) -> list[Policy]:
    clauses = []
    params: list[object] = []
    if enabled_only:
        clauses.append("enabled = TRUE")
    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(f"SELECT * FROM policies {where} ORDER BY compiled_at DESC", params)
            rows = cur.fetchall()
    return [_row_to_policy(row) for row in rows]


def delete_policy(policy_id: str) -> bool:
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM policies WHERE id = %s RETURNING id", (policy_id,))
            deleted = cur.fetchone() is not None
        conn.commit()
    return deleted


def find_policies(action: PolicyAction, resource: str) -> list[Policy]:
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT * FROM policies
                WHERE enabled = TRUE
                  AND action = %s
                  AND (resource = %s OR resource = '*')
                ORDER BY compiled_at ASC
                """,
                (action.value, resource),
            )
            rows = cur.fetchall()
    return [_row_to_policy(row) for row in rows]


def write_audit(entry: AuditEntry) -> str:
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO audit_log
                    (id, timestamp, request_id, subject_identity, destination_identity, layer, principal, action, resource,
                     evaluated_context, matched_policy_id, matched_policy_ids, decision, reason, latency_ms)
                VALUES
                    (%(id)s, %(timestamp)s, %(request_id)s, %(subject_identity)s, %(destination_identity)s, %(layer)s, %(principal)s, %(action)s,
                     %(resource)s, %(evaluated_context)s, %(matched_policy_id)s, %(matched_policy_ids)s,
                     %(decision)s, %(reason)s, %(latency_ms)s)
                """,
                {
                    "id": entry.id,
                    "timestamp": entry.timestamp,
                    "request_id": entry.request_id,
                    "subject_identity": json.dumps({}),
                    "destination_identity": None,
                    "layer": "gateway",
                    "principal": json.dumps(entry.principal.model_dump()),
                    "action": entry.action.value,
                    "resource": entry.resource,
                    "evaluated_context": json.dumps(entry.evaluated_context),
                    "matched_policy_id": entry.matched_policy_ids[0] if entry.matched_policy_ids else None,
                    "matched_policy_ids": json.dumps(entry.matched_policy_ids),
                    "decision": entry.decision.value,
                    "reason": entry.reason,
                    "latency_ms": entry.latency_ms,
                },
            )
        conn.commit()
    return entry.id


def list_audit(
    limit: int = 100,
    offset: int = 0,
    user_id: Optional[str] = None,
    org_id: Optional[str] = None,
    decision: Optional[Decision] = None,
) -> list[AuditEntry]:
    clauses = []
    params: list[object] = []
    if user_id:
        clauses.append("principal->>'user_id' = %s")
        params.append(user_id)
    if org_id:
        clauses.append("principal->>'org_id' = %s")
        params.append(org_id)
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
    return [_row_to_audit(row) for row in rows]


def _row_to_policy(row: dict) -> Policy:
    principal_raw = row["principal"]
    conditions_raw = row["conditions"]
    if isinstance(principal_raw, str):
        principal_raw = json.loads(principal_raw)
    if isinstance(conditions_raw, str):
        conditions_raw = json.loads(conditions_raw)
    return Policy(
        id=row["id"],
        name=row["name"],
        raw_nl=row["raw_nl"],
        principal=Principal(**principal_raw),
        action=PolicyAction(row["action"]),
        resource=row["resource"],
        conditions=[
            PolicyCondition(
                field=item["field"],
                operator=ComparisonOperator(item["operator"]),
                value=item["value"],
            )
            for item in conditions_raw
        ],
        effect=PolicyEffect(row["effect"]),
        compiled_at=row["compiled_at"],
        enabled=row["enabled"],
    )


def _row_to_audit(row: dict) -> AuditEntry:
    principal_raw = row["principal"]
    evaluated_context = row["evaluated_context"]
    matched_ids = row["matched_policy_ids"]
    if isinstance(principal_raw, str):
        principal_raw = json.loads(principal_raw)
    if isinstance(evaluated_context, str):
        evaluated_context = json.loads(evaluated_context)
    if isinstance(matched_ids, str):
        matched_ids = json.loads(matched_ids)
    return AuditEntry(
        id=row["id"],
        timestamp=row["timestamp"],
        request_id=row["request_id"],
        principal=AuditPrincipal(**principal_raw),
        action=PolicyAction(row["action"]),
        resource=row["resource"],
        evaluated_context=evaluated_context,
        matched_policy_ids=matched_ids,
        decision=Decision(row["decision"]),
        reason=row["reason"],
        latency_ms=row["latency_ms"],
    )
