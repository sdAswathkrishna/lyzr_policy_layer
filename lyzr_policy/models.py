"""
Pydantic models for the Lyzr Policy Enforcement Layer.

The Policy Enforcement Layer presents a unified governance interface to users,
while internally managing three types of checks: data access control, tool
authorization, and output sanitization. The identity context is resolved once
per request and threaded through all checks so policy evaluation is consistent.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field


# ── Enumerations ───────────────────────────────────────────────────────────────


class PolicyScope(str, Enum):
    """
    Scope of policy enforcement within the unified Policy Enforcement Layer.
    All policies operate under a single enforcement scope.
    """
    ENFORCEMENT = "enforcement"          # Policy enforcement scope


class PolicyAction(str, Enum):
    ACCESS_DATA = "access_data"          # Control access to classified data
    CALL_TOOL = "call_tool"              # Control tool invocation
    SEND_OUTPUT = "send_output"          # Control output delivery


class PolicyEffect(str, Enum):
    ALLOW = "allow"
    DENY = "deny"


class ConditionType(str, Enum):
    ALWAYS = "always"                    # unconditional — pure deterministic
    CONTEXT_MATCH = "context_match"      # deterministic field comparison
    LLM_EVAL = "llm_eval"               # soft/fuzzy — LLM decides at runtime


class DenyBehavior(str, Enum):
    # Policy enforcement behaviors
    DENY = "deny"                        # Hard block, return error
    REDACT = "redact"                    # Strip classified fields, pass sanitized
    FILTER = "filter"                    # Remove classified content, continue
    ESCALATE = "escalate"               # Log + notify, do NOT block
    STRIP = "strip"                      # Remove sensitive output fields
    MASK = "mask"                        # Redact values in place
    REROUTE = "reroute"                  # Send to a different recipient
    BLOCK = "block"                      # Drop output entirely


class Decision(str, Enum):
    ALLOW = "allow"
    DENY = "deny"


class RecipientType(str, Enum):
    USER = "user"
    AGENT = "agent"
    EXTERNAL_SERVICE = "external_service"
    WEBHOOK = "webhook"
    DATASTORE = "datastore"


class DataClassification(str, Enum):
    PUBLIC = "public"
    INTERNAL = "internal"
    INTERNAL_FINANCE = "internal-finance"
    INTERNAL_HR = "internal-hr"
    CONFIDENTIAL = "confidential"
    RESTRICTED = "restricted"


# ── Identity context ───────────────────────────────────────────────────────────


class IdentityContext(BaseModel):
    """
    Resolved once per request and passed through all policy checks within the
    unified Policy Enforcement Layer. Every check type (data access, tool
    authorization, output sanitization) uses this context for policy evaluation.
    """
    request_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    invoking_user_id: str
    active_agent_id: str
    downstream_agent_id: Optional[str] = None
    tenant_id: str = "default"
    session_id: str = ""


# ── Recipient (normalised — not just user_id) ──────────────────────────────────


class Recipient(BaseModel):
    """
    Internal destination model used by output sanitization checks.
    Captures recipient type and trust domain for automatic output handling.
    Not exposed as a user-configurable concept.
    """
    recipient_type: RecipientType
    recipient_id: str
    trust_domain: str = "internal"      # e.g. "internal", "external", "partner"


# ── Policy condition ───────────────────────────────────────────────────────────


class Condition(BaseModel):
    type: ConditionType = ConditionType.ALWAYS

    # For CONTEXT_MATCH: key-value pairs that must all match the request context
    match_fields: dict[str, Any] = Field(default_factory=dict)
    # Example: {"user_role": "admin", "tenant_id": "acme"}

    # For LLM_EVAL: a natural language description of the condition
    llm_prompt: Optional[str] = None
    # Example: "Is the request from a user with an elevated risk score?"


# ── Core policy model ──────────────────────────────────────────────────────────


class Policy(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    raw_nl: str                          # original natural language rule as written
    scope: PolicyScope
    subject: str                         # agent_id or "*" (wildcard)
    action: PolicyAction
    resource: str                        # tool_name | data_class | recipient_id | "*"
    condition: Condition = Field(default_factory=Condition)
    effect: PolicyEffect
    deny_behavior: DenyBehavior = DenyBehavior.DENY
    compiled_at: datetime = Field(default_factory=datetime.utcnow)
    enabled: bool = True


class PolicyCreate(BaseModel):
    """Request body for creating a policy from a natural language rule."""
    raw_nl: str
    scope: Optional[PolicyScope] = None  # if None, compiler infers it


# ── Audit entry ────────────────────────────────────────────────────────────────


class SubjectIdentity(BaseModel):
    invoking_user_id: str
    active_agent_id: str
    tenant_id: str


class AuditEntry(BaseModel):
    """
    Every policy decision within the unified Policy Enforcement Layer writes one AuditEntry.
    All fields are required — no optional shortcuts.
    """
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    request_id: str
    subject_identity: SubjectIdentity
    destination_identity: Optional[Recipient] = None  # None for data access checks
    layer: PolicyScope  # Policy enforcement layer that made the decision
    action: PolicyAction
    resource: str
    matched_policy_id: Optional[str] = None   # None = no matching policy (default allow)
    decision: Decision
    reason: str
    latency_ms: int


# ── Evaluation result ──────────────────────────────────────────────────────────


class EvalResult(BaseModel):
    decision: Decision
    matched_policy_id: Optional[str] = None
    matched_policy_name: Optional[str] = None
    deny_behavior: Optional[DenyBehavior] = None
    audit_id: Optional[str] = None
    reason: str
    latency_ms: int = 0


# ── Request/response wrappers used by FastAPI ──────────────────────────────────


class ChatRequest(BaseModel):
    """Incoming chat request with full identity + metadata context."""
    agent_id: str = ""
    session_id: str
    message: str
    invoking_user_id: str
    tenant_id: str = "default"
    downstream_agent_id: Optional[str] = None

    # Data access control metadata: explicit labels on the request, not just prompt scanning
    data_classification: DataClassification = DataClassification.PUBLIC
    data_owner: Optional[str] = None
    allowed_roles: list[str] = Field(default_factory=list)

    # Output handling: where is the response going? (internal use only)
    recipient: Optional[Recipient] = None

    # Optional: extra context fields used by CONTEXT_MATCH conditions
    context_fields: dict[str, Any] = Field(default_factory=dict)


class PolicyDeniedResponse(BaseModel):
    """Returned when the Policy Enforcement Layer denies a request."""
    denied: bool = True
    layer: PolicyScope  # Policy enforcement layer
    decision: Decision = Decision.DENY
    reason: str
    policy_id: Optional[str] = None
    policy_name: Optional[str] = None
    deny_behavior: Optional[DenyBehavior] = None
    request_id: str
    audit_id: str


class ChatResponse(BaseModel):
    """Successful chat response with policy trace."""
    response: str
    request_id: str
    policy_trace: list[EvalResult] = Field(default_factory=list)
    # Was any layer's LLM evaluator invoked? (indicates cost)
    llm_eval_used: bool = False
