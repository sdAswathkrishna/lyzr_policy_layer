"""
Agent routes: create Lyzr agents and run policy-enforced chat.

POST /api/agents         — create a new Lyzr agent
GET  /api/agents/{id}   — get agent details from Lyzr
POST /api/agents/{id}/chat — run a chat request through the unified Policy Enforcement Layer
"""

from __future__ import annotations

import uuid
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from lyzr_policy import (
    ChatRequest,
    ChatResponse,
    DataAccessControl,
    EvalResult,
    IdentityContext,
    LyzrAPIError,
    LyzrClient,
    PolicyDeniedResponse,
    PolicyEnforcementLayer,
    OutputSanitizer,
)

router = APIRouter(prefix="/api/agents", tags=["agents"])


# ── Request/response schemas ───────────────────────────────────────────────────


class CreateAgentRequest(BaseModel):
    name: str
    description: str = ""
    agent_role: str = ""
    agent_instructions: str = ""
    agent_goal: str = ""
    provider_id: str = "openai"
    model: str = "gpt-4o"
    temperature: float = 0.7
    top_p: float = 1.0   # required by Lyzr v3 API
    tools: list = []
    features: list = []


class CreateAgentResponse(BaseModel):
    agent_id: str
    raw_response: dict


# ── Shared layer instances ─────────────────────────────────────────────────────

_data_access = DataAccessControl()
_output_sanitizer = OutputSanitizer()


def _get_client() -> LyzrClient:
    return LyzrClient()


# ── Routes ─────────────────────────────────────────────────────────────────────


@router.post("/", response_model=CreateAgentResponse)
def create_agent(body: CreateAgentRequest):
    """Create a new Lyzr agent via the Lyzr REST API."""
    client = _get_client()
    try:
        resp = client.create_agent(
            name=body.name,
            description=body.description,
            agent_role=body.agent_role,
            agent_instructions=body.agent_instructions,
            agent_goal=body.agent_goal,
            provider_id=body.provider_id,
            model=body.model,
            temperature=body.temperature,
            top_p=body.top_p,
            tools=body.tools,
            features=body.features,
        )
    except LyzrAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e.detail))

    agent_id = resp.get("agent_id") or resp.get("id", "")
    return CreateAgentResponse(agent_id=agent_id, raw_response=resp)


@router.get("/{agent_id}")
def get_agent(agent_id: str):
    """Fetch agent details from Lyzr."""
    client = _get_client()
    try:
        return client.get_agent(agent_id)
    except LyzrAPIError as e:
        raise HTTPException(status_code=e.status_code, detail=str(e.detail))


@router.post("/{agent_id}/chat")
def chat(agent_id: str, body: ChatRequest) -> Any:
    """
    Run a chat request through the unified Policy Enforcement Layer, then call Lyzr.

    The Policy Enforcement Layer performs multiple checks:
      1. Data access control (input metadata check)
      2. Tool authorization (tool dispatch check)
      3. [Lyzr inference]
      4. Output sanitization (automatic PII/sensitive data masking)

    Returns either a ChatResponse or a PolicyDeniedResponse.
    """
    client = _get_client()
    pel = PolicyEnforcementLayer(lyzr_client=client)

    # Override agent_id from path parameter
    body = body.model_copy(update={"agent_id": agent_id})

    # Resolve identity context once — threaded through all layers (C5)
    request_id = str(uuid.uuid4())
    identity = IdentityContext(
        request_id=request_id,
        invoking_user_id=body.invoking_user_id,
        active_agent_id=agent_id,
        downstream_agent_id=body.downstream_agent_id,
        tenant_id=body.tenant_id,
        session_id=body.session_id,
    )

    policy_trace: list[EvalResult] = []
    llm_eval_used = False

    # ── Check 1: Data Access Control ──────────────────────────────────────────
    # Pass the route-level identity so all checks share one request_id
    data_result, denied = _data_access.check(body, identity=identity)
    policy_trace.append(data_result)

    if denied:
        return denied

    # If REDACT or FILTER behavior, sanitize before proceeding
    if data_result.deny_behavior is not None:
        body = DataAccessControl.sanitize_request(body, data_result.deny_behavior)

    # ── Check 2: Tool Authorization ───────────────────────────────────────────
    response_text, denied = pel.enforce_and_chat(body, identity, policy_trace)

    if denied:
        return denied

    llm_eval_used = any(
        r.matched_policy_id is not None and "llm eval" in (r.reason or "").lower()
        for r in policy_trace
    )

    # ── Check 3: Output Sanitization ──────────────────────────────────────────
    final_text, denied = _output_sanitizer.check(response_text, body, identity, policy_trace)

    if denied:
        return denied

    return ChatResponse(
        response=final_text or "",
        request_id=request_id,
        policy_trace=policy_trace,
        llm_eval_used=llm_eval_used,
    )
