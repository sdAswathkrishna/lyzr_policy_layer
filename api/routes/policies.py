"""
Policy CRUD for the user/org gateway.
"""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from lyzr_policy import Policy, PolicyCompiler, PolicyCreate, delete_policy, get_policy, list_policies, save_policy

router = APIRouter(prefix="/api/policies", tags=["policies"])
_compiler = PolicyCompiler()


class CompilePreviewResponse(BaseModel):
    preview: Policy
    raw_nl: str


class ToggleRequest(BaseModel):
    enabled: bool


@router.get("/", response_model=list[Policy])
def list_all(enabled_only: bool = True) -> list[Policy]:
    return list_policies(enabled_only=enabled_only)


@router.post("/preview", response_model=CompilePreviewResponse)
def preview(body: PolicyCreate):
    try:
        policy = _compiler.compile(body.raw_nl)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return CompilePreviewResponse(preview=policy, raw_nl=body.raw_nl)


@router.post("/", response_model=Policy)
def create(body: PolicyCreate):
    try:
        policy = _compiler.compile(body.raw_nl)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
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
    policy = get_policy(policy_id)
    if not policy:
        raise HTTPException(status_code=404, detail="Policy not found")
    policy.enabled = body.enabled
    save_policy(policy)
    return policy
