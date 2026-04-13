"""
Output Sanitization (internal component of Policy Enforcement Layer)

Automatically sanitizes outputs after Lyzr inference returns a response.
Evaluates output classification against destination and applies sanitization
transparently without user configuration.

This is an internal component of the unified Policy Enforcement Layer.
It post-processes Lyzr's output and does NOT rely on native Lyzr hooks.

Internal implementation details:
  - Automatically masks PII patterns in external-bound responses
  - Evaluates output classification against destination
  - Applies sanitization transparently without user configuration

Output stages checked (in order):
  1. Raw model output (response text)
  2. Structured output fields (if present)
  3. Final rendered response

Deny behaviors:
  - allow:   pass through unchanged
  - strip:   remove sensitive fields from structured output
  - mask:    redact specific values in the response text
  - reroute: change the destination recipient (demo: log the reroute)
  - block:   drop the output entirely, return empty/placeholder
"""

from __future__ import annotations

import re
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
    Recipient,
    RecipientType,
)

# Patterns used by the MASK behavior
_PII_PATTERNS = {
    "email": re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'),
    "phone": re.compile(r'\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)?\d{3}[-.\s]?\d{4}\b'),
    "ssn": re.compile(r'\b\d{3}-\d{2}-\d{4}\b'),
    "credit_card": re.compile(r'\b(?:\d{4}[-\s]?){3}\d{4}\b'),
    "api_key": re.compile(r'\b(?:sk|pk|api)[_-][A-Za-z0-9]{20,}\b', re.IGNORECASE),
}

# Output classifications that trigger mandatory policy checks
_SENSITIVE_OUTPUT_CLASSIFICATIONS = {
    DataClassification.INTERNAL_FINANCE,
    DataClassification.INTERNAL_HR,
    DataClassification.CONFIDENTIAL,
    DataClassification.RESTRICTED,
}


class OutputSanitizer:
    """
    Applies automatic output sanitization on Lyzr responses.
    Internal component of the unified Policy Enforcement Layer.

    Usage:
        sanitizer = OutputSanitizer()
        final_text, denied_response = sanitizer.check(
            response_text=lyzr_response,
            request=original_request,
            identity=identity,
            policy_trace=policy_trace,
        )
        if denied_response:
            return denied_response
        return final_text
    """

    def __init__(self, evaluator: Optional[PolicyEvaluator] = None):
        self._evaluator = evaluator or PolicyEvaluator()

    def check(
        self,
        response_text: str,
        request: ChatRequest,
        identity: IdentityContext,
        policy_trace: list[EvalResult],
    ) -> tuple[Optional[str], Optional[PolicyDeniedResponse]]:
        """
        Apply output sanitization checks to the response.

        Returns:
            (final_text, denied_response)
            If denied_response is not None, the output was blocked.
            If denied_response is None, final_text contains the (possibly
            sanitized) response to send to the recipient.
        """
        recipient = request.recipient or self._default_recipient(request)

        # Check 1: output classification against destination
        output_classification = self._classify_output(response_text, request)

        # Only check non-public output
        if output_classification in _SENSITIVE_OUTPUT_CLASSIFICATIONS:
            result = self._evaluator.evaluate(
                scope=PolicyScope.ENFORCEMENT,
                action=PolicyAction.SEND_OUTPUT,
                resource=recipient.recipient_id,
                identity=identity,
                context_fields={
                    "output_classification": output_classification.value,
                    "trust_domain": recipient.trust_domain,
                    "recipient_type": recipient.recipient_type.value,
                    **request.context_fields,
                },
                recipient=recipient,
            )
            policy_trace.append(result)

            if result.decision == Decision.DENY:
                behavior = result.deny_behavior or DenyBehavior.BLOCK
                final, denied = self._apply_deny_behavior(
                    behavior, response_text, result, identity, recipient
                )
                return final, denied
        else:
            # Check 2: wildcard policy — does any policy govern output to this recipient?
            result = self._evaluator.evaluate(
                scope=PolicyScope.ENFORCEMENT,
                action=PolicyAction.SEND_OUTPUT,
                resource=recipient.recipient_id,
                identity=identity,
                context_fields={
                    "output_classification": output_classification.value,
                    "trust_domain": recipient.trust_domain,
                    "recipient_type": recipient.recipient_type.value,
                    **request.context_fields,
                },
                recipient=recipient,
            )
            policy_trace.append(result)

            if result.decision == Decision.DENY:
                behavior = result.deny_behavior or DenyBehavior.BLOCK
                final, denied = self._apply_deny_behavior(
                    behavior, response_text, result, identity, recipient
                )
                return final, denied

        # No policy denied — pass through (possibly PII-masked for external recipients)
        if recipient.trust_domain == "external":
            response_text = self._mask_pii(response_text)

        return response_text, None

    def _apply_deny_behavior(
        self,
        behavior: DenyBehavior,
        response_text: str,
        result: EvalResult,
        identity: IdentityContext,
        recipient: Recipient,
    ) -> tuple[Optional[str], Optional[PolicyDeniedResponse]]:
        if behavior == DenyBehavior.BLOCK:
            denied = PolicyDeniedResponse(
                layer=PolicyScope.ENFORCEMENT,
                reason=result.reason,
                policy_id=result.matched_policy_id,
                policy_name=result.matched_policy_name,
                deny_behavior=behavior,
                request_id=identity.request_id,
                audit_id=identity.request_id,
            )
            return None, denied

        elif behavior == DenyBehavior.STRIP:
            # Strip sensitive structured data — remove lines that look like key:value pairs
            stripped = re.sub(r'(?m)^.*?:.*$', '[STRIPPED]', response_text)
            return stripped, None

        elif behavior == DenyBehavior.MASK:
            masked = self._mask_pii(response_text)
            return masked, None

        elif behavior == DenyBehavior.REROUTE:
            # In the demo: log the reroute and return the response with a header
            header = (
                f"[REROUTED: Output originally addressed to {recipient.recipient_id} "
                f"({recipient.trust_domain}) was redirected per policy '{result.matched_policy_name}']\n\n"
            )
            return header + response_text, None

        # Fallback: treat as BLOCK
        denied = PolicyDeniedResponse(
            layer=PolicyScope.ENFORCEMENT,
            reason=result.reason,
            policy_id=result.matched_policy_id,
            policy_name=result.matched_policy_name,
            deny_behavior=behavior,
            request_id=identity.request_id,
            audit_id=identity.request_id,
        )
        return None, denied

    @staticmethod
    def _classify_output(
        response_text: str,
        request: ChatRequest,
    ) -> DataClassification:
        """
        Determine output classification.
        Inherits from the request classification if set;
        otherwise infers from response content keywords.
        """
        # If the request had a classification, the output inherits it
        if request.data_classification != DataClassification.PUBLIC:
            return request.data_classification

        lower = response_text.lower()
        if any(kw in lower for kw in ["confidential", "nda", "proprietary", "trade secret"]):
            return DataClassification.CONFIDENTIAL
        if any(kw in lower for kw in ["restricted", "classified"]):
            return DataClassification.RESTRICTED
        if any(kw in lower for kw in ["revenue", "profit", "payroll", "fiscal", "budget"]):
            return DataClassification.INTERNAL_FINANCE
        if any(kw in lower for kw in ["employee", "ssn", "salary band", "termination"]):
            return DataClassification.INTERNAL_HR
        return DataClassification.PUBLIC

    @staticmethod
    def _mask_pii(text: str) -> str:
        """Replace detected PII patterns with [REDACTED] placeholders."""
        for label, pattern in _PII_PATTERNS.items():
            text = pattern.sub(f"[{label.upper()}_REDACTED]", text)
        return text

    @staticmethod
    def _default_recipient(request: ChatRequest) -> Recipient:
        """
        If no explicit recipient is set on the request, assume the invoking user
        in the internal domain.
        """
        return Recipient(
            recipient_type=RecipientType.USER,
            recipient_id=request.invoking_user_id,
            trust_domain="internal",
        )
