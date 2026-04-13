"""
Lyzr agent routes with a user/org policy gateway in front of governed actions.
"""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from lyzr_policy import (
    ChatRequest,
    LyzrAPIError,
    LyzrClient,
    PolicyGateway,
    resolve_identity,
)

router = APIRouter(prefix="/api/agents", tags=["agents"])


class CreateAgentRequest(BaseModel):
    name: str
    description: str = ""
    agent_role: str = ""
    agent_instructions: str = ""
    agent_goal: str = ""
    provider_id: str = "openai"
    model: str = "gpt-4o"
    temperature: float = 0.7
    top_p: float = 1.0
    tools: list = Field(default_factory=list)
    features: list = Field(default_factory=list)


class CreateAgentResponse(BaseModel):
    agent_id: str
    raw_response: dict


def _get_client() -> LyzrClient:
    return LyzrClient()


@router.post("/", response_model=CreateAgentResponse)
def create_agent(body: CreateAgentRequest):
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
    except LyzrAPIError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc.detail))
    agent_id = resp.get("agent_id") or resp.get("id", "")
    return CreateAgentResponse(agent_id=agent_id, raw_response=resp)


@router.get("/{agent_id}")
def get_agent(agent_id: str):
    client = _get_client()
    try:
        return client.get_agent(agent_id)
    except LyzrAPIError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc.detail))


@router.post("/{agent_id}/chat")
def chat(agent_id: str, body: ChatRequest, request: Request) -> Any:
    client = _get_client()
    gateway = PolicyGateway(lyzr_client=client)
    body = body.model_copy(update={"agent_id": agent_id})

    request_id = str(uuid.uuid4())
    try:
        identity = resolve_identity(body, dict(request.headers), request_id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    try:
        result = gateway.enforce_and_chat(body, identity, policy_trace=[])
    except LyzrAPIError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc.detail))

    return result
