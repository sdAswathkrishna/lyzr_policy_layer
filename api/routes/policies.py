"""
Policy routes: CRUD for the policy store.

GET    /api/policies            — list all policies
POST   /api/policies            — compile NL rule → JSON policy → save
GET    /api/policies/{id}       — get a single policy
DELETE /api/policies/{id}       — delete a policy
PATCH  /api/policies/{id}/toggle — enable/disable a policy
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from lyzr_policy import (
    Policy,
    PolicyCompiler,
    PolicyCreate,
    PolicyScope,
    delete_policy,
    get_policy,
    list_policies,
    save_policy,
)

router = APIRouter(prefix="/api/policies", tags=["policies"])

_compiler = PolicyCompiler()


class CompilePreviewResponse(BaseModel):
    """Used to show the compiled JSON before saving (for the UI)."""
    preview: Policy
    raw_nl: str


class ToggleRequest(BaseModel):
    enabled: bool


# ── Routes ─────────────────────────────────────────────────────────────────────


@router.get("/")
def list_all(scope: Optional[str] = None, enabled_only: bool = True) -> list[Policy]:
    """List policies, optionally filtered by scope."""
    scope_enum = PolicyScope(scope) if scope else None
    return list_policies(scope=scope_enum, enabled_only=enabled_only)


@router.post("/preview", response_model=CompilePreviewResponse)
def preview(body: PolicyCreate):
    """
    Compile a natural language rule to JSON without saving.
    Use this to show the user what the compiled policy looks like
    before they commit to saving it.
    """
    try:
        policy = _compiler.compile(body.raw_nl, scope_hint=body.scope)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return CompilePreviewResponse(preview=policy, raw_nl=body.raw_nl)


@router.post("/", response_model=Policy)
def create(body: PolicyCreate):
    """Compile a natural language rule and save it to the store."""
    try:
        policy = _compiler.compile(body.raw_nl, scope_hint=body.scope)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    save_policy(policy)
    return policy


@router.get("/{policy_id}", response_model=Policy)
def get_one(policy_id: str):
    policy = get_policy(policy_id)
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    return policy


@router.delete("/{policy_id}")
def remove(policy_id: str):
    deleted = delete_policy(policy_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Policy not found")
    return {"deleted": True, "policy_id": policy_id}


@router.patch("/{policy_id}/toggle", response_model=Policy)
def toggle(policy_id: str, body: ToggleRequest):
    """Enable or disable a policy without deleting it."""
    policy = get_policy(policy_id)
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    policy.enabled = body.enabled
    save_policy(policy)
    return policy
