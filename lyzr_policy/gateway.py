"""
Gateway orchestration for governed tool calls and governed retrieval.
"""

from __future__ import annotations

import base64
import json
from typing import Any, Optional

from .evaluator import PolicyEvaluator
from .lyzr_client import LyzrClient
from .models import (
    ChatRequest,
    ChatResponse,
    Decision,
    EvalResult,
    IdentityContext,
    PolicyAction,
    PolicyDeniedResponse,
    RetrievalContext,
)


class PolicyGateway:
    def __init__(
        self,
        lyzr_client: LyzrClient,
        evaluator: Optional[PolicyEvaluator] = None,
    ):
        self._client = lyzr_client
        self._evaluator = evaluator or PolicyEvaluator()

    def enforce_and_chat(
        self,
        request: ChatRequest,
        identity: IdentityContext,
        policy_trace: list[EvalResult],
    ) -> ChatResponse | PolicyDeniedResponse:
        effective_message = request.message

        if request.retrieval_request:
            retrieval_result, approved_contexts = self._evaluate_retrieval(request.retrieval_request.contexts, identity)
            policy_trace.extend(retrieval_result)
            denied = next((item for item in retrieval_result if item.decision == Decision.DENY), None)
            if denied:
                return PolicyDeniedResponse(
                    action=PolicyAction.RETRIEVE_CONTEXT,
                    resource=request.retrieval_request.contexts[0].context_tag if request.retrieval_request.contexts else "unknown",
                    reason=denied.reason,
                    matched_policy_ids=denied.matched_policy_ids,
                    request_id=identity.request_id,
                    audit_id=denied.audit_id or identity.request_id,
                )
            if approved_contexts:
                context_blob = "\n\n".join(
                    f"[Context {ctx.context_id} | {ctx.context_tag}]\n{ctx.text}" for ctx in approved_contexts
                )
                effective_message = f"{request.message}\n\nApproved retrieval context:\n{context_blob}"

        if request.governed_tool_call:
            tool_context = {
                **request.governed_tool_call.input,
                **request.context_fields,
                "tool_name": request.governed_tool_call.tool_name,
            }
            tool_result = self._evaluator.evaluate(
                action=PolicyAction.TOOL_CALL,
                resource=request.governed_tool_call.tool_name,
                identity=identity,
                input_context=tool_context,
            )
            policy_trace.append(tool_result)
            if tool_result.decision == Decision.DENY:
                return PolicyDeniedResponse(
                    action=PolicyAction.TOOL_CALL,
                    resource=request.governed_tool_call.tool_name,
                    reason=tool_result.reason,
                    matched_policy_ids=tool_result.matched_policy_ids,
                    request_id=identity.request_id,
                    audit_id=tool_result.audit_id or identity.request_id,
                )

        # Message content policy check — runs before every Lyzr call
        content_result = self._evaluator.evaluate(
            action=PolicyAction.INPUT_CONTENT,
            resource="message",
            identity=identity,
            input_context={"message_text": effective_message},
        )
        if content_result.decision == Decision.DENY:
            policy_trace.append(content_result)
            return PolicyDeniedResponse(
                action=PolicyAction.INPUT_CONTENT,
                resource="message",
                reason=content_result.reason,
                matched_policy_ids=content_result.matched_policy_ids,
                request_id=identity.request_id,
                audit_id=content_result.audit_id or identity.request_id,
            )

        lyzr_resp = self._client.chat(
            agent_id=request.agent_id,
            session_id=request.session_id,
            message=effective_message,
            user_id=identity.user_id,
        )
        return ChatResponse(
            response=lyzr_resp.get("response", ""),
            request_id=identity.request_id,
            effective_prompt=effective_message,
            policy_trace=policy_trace,
        )

    def _evaluate_retrieval(
        self,
        contexts: list[RetrievalContext],
        identity: IdentityContext,
    ) -> tuple[list[EvalResult], list[RetrievalContext]]:
        results: list[EvalResult] = []
        approved: list[RetrievalContext] = []
        for item in contexts:
            input_context: dict[str, Any] = {
                "classification": item.classification,
                "context_tag": item.context_tag,
                "context_org_id": item.org_id,
                **item.metadata,
            }
            result = self._evaluator.evaluate(
                action=PolicyAction.RETRIEVE_CONTEXT,
                resource=item.context_tag,
                identity=identity,
                input_context=input_context,
            )
            results.append(result)
            if result.decision == Decision.DENY:
                return results, approved
            approved.append(item)
        return results, approved


def resolve_identity(request: ChatRequest, headers: dict[str, str], request_id: str) -> IdentityContext:
    jwt_user, jwt_org = _identity_from_bearer(headers.get("authorization"))
    header_user = headers.get("x-user-id")
    header_org = headers.get("x-org-id") or headers.get("x-rgid")

    user_id = jwt_user or header_user or request.user_id
    org_id = jwt_org or header_org or request.org_id or request.rgid or "default-org"
    auth_source = "jwt" if jwt_user or jwt_org else "headers" if header_user or header_org else "body"
    if not user_id:
        raise ValueError("user_id is required for policy evaluation")

    return IdentityContext(
        request_id=request_id,
        user_id=user_id,
        org_id=org_id,
        session_id=request.session_id,
        agent_id=request.agent_id,
        auth_source=auth_source,
    )


def _identity_from_bearer(authorization: Optional[str]) -> tuple[Optional[str], Optional[str]]:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None, None
    token = authorization.split(" ", 1)[1]
    parts = token.split(".")
    if len(parts) < 2:
        return None, None
    try:
        payload = parts[1] + "=" * (-len(parts[1]) % 4)
        decoded = base64.urlsafe_b64decode(payload.encode("utf-8"))
        claims = json.loads(decoded)
    except Exception:
        return None, None
    user_id = claims.get("user_id") or claims.get("sub")
    org_id = claims.get("org_id") or claims.get("rgid")
    return user_id, org_id
