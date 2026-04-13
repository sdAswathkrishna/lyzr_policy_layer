"""
Audit log routes.

GET /api/audit — paginated audit log with filters
GET /api/audit/stats — summary statistics for the dashboard
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

from lyzr_policy import list_audit
from lyzr_policy.models import AuditEntry, Decision, PolicyScope
from lyzr_policy.store import _connect

router = APIRouter(prefix="/api/audit", tags=["audit"])


class AuditStats(BaseModel):
    total: int
    total_allow: int
    total_deny: int
    by_layer: dict[str, int]
    by_decision: dict[str, int]


@router.get("/", response_model=list[AuditEntry])
def get_audit_log(
    limit: int = 100,
    offset: int = 0,
    agent_id: Optional[str] = None,
    layer: Optional[str] = None,
    decision: Optional[str] = None,
):
    """Return paginated audit log entries with optional filters."""
    layer_enum = PolicyScope(layer) if layer else None
    decision_enum = Decision(decision) if decision else None
    return list_audit(
        limit=limit,
        offset=offset,
        agent_id=agent_id,
        layer=layer_enum,
        decision=decision_enum,
    )


@router.get("/stats", response_model=AuditStats)
def get_stats():
    """Return summary statistics for the dashboard."""
    with _connect() as conn:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) as total FROM audit_log")
            total = (cur.fetchone() or {}).get("total", 0)

            cur.execute("SELECT COUNT(*) as n FROM audit_log WHERE decision = 'allow'")
            total_allow = (cur.fetchone() or {}).get("n", 0)

            cur.execute("SELECT COUNT(*) as n FROM audit_log WHERE decision = 'deny'")
            total_deny = (cur.fetchone() or {}).get("n", 0)

            cur.execute("SELECT layer, COUNT(*) as n FROM audit_log GROUP BY layer")
            by_layer = {row["layer"]: row["n"] for row in cur.fetchall()}

            cur.execute("SELECT decision, COUNT(*) as n FROM audit_log GROUP BY decision")
            by_decision = {row["decision"]: row["n"] for row in cur.fetchall()}

    return AuditStats(
        total=total,
        total_allow=total_allow,
        total_deny=total_deny,
        by_layer=by_layer,
        by_decision=by_decision,
    )
