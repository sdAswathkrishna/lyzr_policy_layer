"""
Core models for the user/org policy gateway.

This V1 mirrors the AgentCore policy shape at a high level:
- policies live outside agent code
- authorization evaluates against principal identity and request context
- governed actions use permit/forbid semantics
"""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field, model_validator


class PolicyAction(str, Enum):
    TOOL_CALL = "tool_call"
    RETRIEVE_CONTEXT = "retrieve_context"
    INPUT_CONTENT = "input_content"


class PolicyEffect(str, Enum):
    PERMIT = "permit"
    FORBID = "forbid"


class Decision(str, Enum):
    ALLOW = "allow"
    DENY = "deny"


class ComparisonOperator(str, Enum):
    EQ = "eq"
    NEQ = "neq"
    LT = "lt"
    LTE = "lte"
    GT = "gt"
    GTE = "gte"
    CONTAINS = "contains"
    IN = "in"


class Principal(BaseModel):
    user_id: Optional[str] = None
    org_id: Optional[str] = None


class PolicyCondition(BaseModel):
    field: str
    operator: ComparisonOperator
    value: Any


class Policy(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    raw_nl: str
    principal: Principal = Field(default_factory=Principal)
    action: PolicyAction
    resource: str
    conditions: list[PolicyCondition] = Field(default_factory=list)
    effect: PolicyEffect
    compiled_at: datetime = Field(default_factory=datetime.utcnow)
    enabled: bool = True


class PolicyCreate(BaseModel):
    raw_nl: str


class IdentityContext(BaseModel):
    request_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    org_id: str = "default-org"
    session_id: str = ""
    agent_id: str = ""
    auth_source: str = "body"


class GovernedToolCall(BaseModel):
    tool_name: str
    input: dict[str, Any] = Field(default_factory=dict)


class RetrievalContext(BaseModel):
    context_id: str
    text: str
    classification: str = "public"
    context_tag: str
    org_id: Optional[str] = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class RetrievalRequest(BaseModel):
    query: str
    contexts: list[RetrievalContext] = Field(default_factory=list)


class ChatRequest(BaseModel):
    agent_id: str = ""
    session_id: str
    message: str
    user_id: Optional[str] = None
    org_id: Optional[str] = None
    rgid: Optional[str] = None
    context_fields: dict[str, Any] = Field(default_factory=dict)
    governed_tool_call: Optional[GovernedToolCall] = None
    retrieval_request: Optional[RetrievalRequest] = None

    @model_validator(mode="after")
    def normalize_identity(self) -> "ChatRequest":
        if self.org_id is None and self.rgid:
            self.org_id = self.rgid
        return self


class AuditPrincipal(BaseModel):
    user_id: str
    org_id: str
    auth_source: str


class AuditEntry(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    request_id: str
    principal: AuditPrincipal
    action: PolicyAction
    resource: str
    evaluated_context: dict[str, Any] = Field(default_factory=dict)
    matched_policy_ids: list[str] = Field(default_factory=list)
    decision: Decision
    reason: str
    latency_ms: int


class EvalResult(BaseModel):
    decision: Decision
    matched_policy_ids: list[str] = Field(default_factory=list)
    matched_policy_names: list[str] = Field(default_factory=list)
    audit_id: Optional[str] = None
    reason: str
    latency_ms: int = 0


class PolicyDeniedResponse(BaseModel):
    denied: bool = True
    decision: Decision = Decision.DENY
    action: PolicyAction
    resource: str
    reason: str
    matched_policy_ids: list[str] = Field(default_factory=list)
    request_id: str
    audit_id: str


class ChatResponse(BaseModel):
    response: str
    request_id: str
    effective_prompt: Optional[str] = None
    policy_trace: list[EvalResult] = Field(default_factory=list)
