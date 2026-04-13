"""
Data Access Control (internal component of Policy Enforcement Layer)

Controls what data an agent is allowed to see or use before the prompt reaches Lyzr.

Primary control: explicit metadata on the request:
  - data_classification: public | internal | internal-finance | internal-hr | confidential | restricted
  - data_owner: who owns this data
  - allowed_roles: which roles may access this data

Fallback: basic prompt scanning for data-class keywords (not the primary mechanism).

Deny behaviors per policy:
  - deny:   hard block, return PolicyDeniedResponse immediately
  - redact: strip classified fields from the request, continue with sanitized prompt
  - filter: remove classified content inline, continue

This is an internal component of the unified Policy Enforcement Layer.
It wraps the Lyzr API call — it is NOT a native Lyzr hook.
"""

from __future__ import annotations

from typing import Any, Optional

from .evaluator import PolicyEvaluator
from .models import (
    ChatRequest,
    DataClassification,
    Decision,
    DenyBehavior,
    EvalResult,
    IdentityContext,
    PolicyAction,
    PolicyDeniedResponse,
    PolicyScope,
)

# Data classifications that require explicit policy checks (escalating sensitivity)
_SENSITIVE_CLASSIFICATIONS = {
    DataClassification.INTERNAL,
    DataClassification.INTERNAL_FINANCE,
    DataClassification.INTERNAL_HR,
    DataClassification.CONFIDENTIAL,
    DataClassification.RESTRICTED,
}

# Fallback: keyword patterns that suggest specific data classes
_KEYWORD_CLASSIFICATION_MAP = {
    DataClassification.INTERNAL_FINANCE: [
        "revenue", "profit", "loss", "budget", "financial", "invoice",
        "payroll", "salary", "fiscal", "accounting", "ledger",
    ],
    DataClassification.INTERNAL_HR: [
        "employee", "headcount", "performance review", "termination",
        "salary band", "compensation", "pii", "ssn", "social security",
    ],
    DataClassification.CONFIDENTIAL: [
        "confidential", "nda", "trade secret", "proprietary",
    ],
    DataClassification.RESTRICTED: [
        "restricted", "classified", "top secret",
    ],
}


class DataAccessControl:
    """
    Evaluates data access control policies before a request reaches Lyzr.
    Internal component of the unified Policy Enforcement Layer.

    Usage:
        control = DataAccessControl()
        result, denied_response = control.check(request)
        if denied_response:
            return denied_response   # don't call Lyzr
        # Use result.deny_behavior == DenyBehavior.REDACT → sanitize request
        # Use result.deny_behavior == DenyBehavior.FILTER → strip content
    """

    def __init__(self, evaluator: Optional[PolicyEvaluator] = None):
        self._evaluator = evaluator or PolicyEvaluator()

    def check(
        self,
        request: ChatRequest,
        identity: Optional[IdentityContext] = None,
    ) -> tuple[EvalResult, Optional[PolicyDeniedResponse]]:
        """
        Run data access control checks.

        Args:
            request:  the incoming chat request with metadata labels
            identity: shared IdentityContext generated once in the route.
                      If None, a local one is built from the request (backward-compat).

        Returns:
            (eval_result, denied_response)
            If denied_response is not None, the request must be blocked.
            If denied_response is None, inspect eval_result.deny_behavior
            to decide whether to redact/filter the request or pass as-is.
        """
        if identity is None:
            identity = IdentityContext(
                request_id=request.session_id,
                invoking_user_id=request.invoking_user_id,
                active_agent_id=request.agent_id,
                tenant_id=request.tenant_id,
            )

        # Determine effective classification (explicit label takes precedence)
        classification = request.data_classification

        # Fallback: scan prompt for data-class keywords if classification is PUBLIC
        if classification == DataClassification.PUBLIC:
            classification = self._infer_classification(request.message)

        # PUBLIC data with no sensitive classification → skip policy check, always allow
        if classification == DataClassification.PUBLIC:
            return (
                EvalResult(
                    decision=Decision.ALLOW,
                    reason="Data classification: public — no policy check required",
                ),
                None,
            )

        # Build context fields for CONTEXT_MATCH conditions
        context_fields: dict[str, Any] = {
            "data_classification": classification.value,
            "data_owner": request.data_owner or "",
            "allowed_roles": request.allowed_roles,
            **request.context_fields,
        }

        result = self._evaluator.evaluate(
            scope=PolicyScope.ENFORCEMENT,
            action=PolicyAction.ACCESS_DATA,
            resource=classification.value,
            identity=identity,
            context_fields=context_fields,
        )

        if result.decision == Decision.DENY:
            behavior = result.deny_behavior or DenyBehavior.DENY

            if behavior == DenyBehavior.DENY:
                denied = PolicyDeniedResponse(
                    layer=PolicyScope.ENFORCEMENT,
                    reason=result.reason,
                    policy_id=result.matched_policy_id,
                    policy_name=result.matched_policy_name,
                    deny_behavior=behavior,
                    request_id=identity.request_id,
                    audit_id=identity.request_id,
                )
                return result, denied

            # REDACT / FILTER: do not hard-block — caller must sanitize
            return result, None

        return result, None

    @staticmethod
    def _infer_classification(message: str) -> DataClassification:
        """
        Keyword-based fallback classification. Returns the most sensitive
        classification found, or PUBLIC if none match.
        Only used when the caller did not set an explicit classification.
        """
        lower = message.lower()
        # Check in order of sensitivity (most restrictive first)
        for cls in [
            DataClassification.RESTRICTED,
            DataClassification.CONFIDENTIAL,
            DataClassification.INTERNAL_FINANCE,
            DataClassification.INTERNAL_HR,
            DataClassification.INTERNAL,
        ]:
            keywords = _KEYWORD_CLASSIFICATION_MAP.get(cls, [])
            if any(kw in lower for kw in keywords):
                return cls
        return DataClassification.PUBLIC

    @staticmethod
    def sanitize_request(request: ChatRequest, deny_behavior: DenyBehavior) -> ChatRequest:
        """
        Apply REDACT or FILTER behavior to the request.
        Returns a modified copy of the request with sensitive content removed.

        FILTER surgically strips individual sentences that contain classified keywords,
        ensuring classified content does not reach the Lyzr model context.
        """
        if deny_behavior == DenyBehavior.REDACT:
            # Hard redact: replace entire message body
            return request.model_copy(
                update={
                    "data_classification": DataClassification.PUBLIC,
                    "data_owner": None,
                    "message": "[REDACTED: classified content removed by policy enforcement layer]",
                }
            )
        elif deny_behavior == DenyBehavior.FILTER:
            # Fix 3: scan for sentences containing classified keywords and strip them.
            # Build a flat set of all sensitive keywords from _KEYWORD_CLASSIFICATION_MAP.
            all_sensitive_keywords: set[str] = set()
            for kws in _KEYWORD_CLASSIFICATION_MAP.values():
                all_sensitive_keywords.update(kws)

            # Split into sentences (naive split on . ! ? and newlines)
            import re
            sentences = re.split(r'(?<=[.!?\n])\s+', request.message)
            clean_sentences: list[str] = []
            filtered_count = 0
            for sentence in sentences:
                lower = sentence.lower()
                if any(kw in lower for kw in all_sensitive_keywords):
                    clean_sentences.append("[FILTERED]")
                    filtered_count += 1
                else:
                    clean_sentences.append(sentence)

            filtered_message = " ".join(clean_sentences)
            # If everything was filtered, make it explicit
            if filtered_count == len(sentences):
                filtered_message = "[FILTERED: all content contained classified data]"

            return request.model_copy(
                update={
                    "data_classification": DataClassification.PUBLIC,
                    "data_owner": None,
                    "message": filtered_message,
                }
            )
        return request
