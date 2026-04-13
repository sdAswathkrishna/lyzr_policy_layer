"""
Hybrid Policy Evaluator

Two evaluation modes per rule (from the implementation decisions):
  1. Deterministic (condition.type == "always" or "context_match"):
     Pure Python, ~1ms, no LLM cost.
  2. LLM-assisted (condition.type == "llm_eval"):
     Only for soft/ambiguous rules where flexibility matters more than
     strict determinism. LLM is called with the full context + rule.

Evaluation semantics:
  - Deny-override: any matching DENY policy wins, regardless of order.
  - No matching policy → default ALLOW (open-by-default, matches Lyzr's existing posture).
  - All decisions are written to the audit log (C9).
"""

from __future__ import annotations

import os
import time
from typing import Any, Optional

from dotenv import load_dotenv

from .models import (
    AuditEntry,
    Condition,
    ConditionType,
    Decision,
    DenyBehavior,
    EvalResult,
    IdentityContext,
    Policy,
    PolicyAction,
    PolicyEffect,
    PolicyScope,
    Recipient,
    SubjectIdentity,
)
from .store import find_policies, write_audit

load_dotenv()

# ── LLM soft evaluator prompt ──────────────────────────────────────────────────

_SOFT_EVAL_SYSTEM = """You are a policy enforcement engine.
Given a policy rule and a request context, answer with exactly one word: ALLOW or DENY.
Do not explain. Do not add punctuation. Output only ALLOW or DENY."""


class PolicyEvaluator:
    def __init__(self, provider: Optional[str] = None, model: Optional[str] = None):
        self.provider = (provider or os.getenv("POLICY_COMPILER_PROVIDER", "openai")).lower()
        self.model = model or os.getenv("POLICY_COMPILER_MODEL", "gpt-4o")

    def evaluate(
        self,
        scope: PolicyScope,
        action: PolicyAction,
        resource: str,
        identity: IdentityContext,
        context_fields: dict[str, Any],
        recipient: Optional[Recipient] = None,
    ) -> EvalResult:
        """
        Evaluate all matching policies for (scope, subject, action, resource).

        Returns an EvalResult. If any deny policy fires, that wins.
        If no policies match, the default is ALLOW.
        """
        t0 = time.monotonic()

        policies = find_policies(
            scope=scope,
            subject=identity.active_agent_id,
            action=action,
        )

        result = self._evaluate_policies(policies, resource, identity, context_fields)

        latency_ms = int((time.monotonic() - t0) * 1000)
        result.latency_ms = latency_ms

        # Write audit entry (C9 — all fields required)
        audit = AuditEntry(
            request_id=identity.request_id,
            subject_identity=SubjectIdentity(
                invoking_user_id=identity.invoking_user_id,
                active_agent_id=identity.active_agent_id,
                tenant_id=identity.tenant_id,
            ),
            destination_identity=recipient,
            layer=scope,
            action=action,
            resource=resource,
            matched_policy_id=result.matched_policy_id,
            decision=result.decision,
            reason=result.reason,
            latency_ms=latency_ms,
        )
        result.audit_id = write_audit(audit)

        return result

    def _evaluate_policies(
        self,
        policies: list[Policy],
        resource: str,
        identity: IdentityContext,
        context_fields: dict[str, Any],
    ) -> EvalResult:
        applicable = [p for p in policies if self._resource_matches(p.resource, resource)]

        if not applicable and not policies:
            return EvalResult(
                decision=Decision.ALLOW,
                reason="No matching policy — default allow",
            )

        allow_policies = [p for p in policies if p.effect == PolicyEffect.ALLOW]
        has_allow_list = len(allow_policies) > 0

        applicable_deny = [p for p in applicable if p.effect == PolicyEffect.DENY]
        applicable_allow = [p for p in applicable if p.effect == PolicyEffect.ALLOW]

        for policy in self._ordered_policies(applicable_deny):
            result, matched = self._evaluate_single_policy(policy, identity, context_fields)
            if matched and result.decision == Decision.DENY:
                return result

        matched_allow: Optional[EvalResult] = None
        for policy in self._ordered_policies(applicable_allow):
            result, matched = self._evaluate_single_policy(policy, identity, context_fields)
            if matched:
                matched_allow = result
                break

        if has_allow_list:
            if matched_allow:
                return matched_allow
            return EvalResult(
                decision=Decision.DENY,
                reason="No allow policy matched — request denied by allow-list enforcement",
                deny_behavior=DenyBehavior.DENY,
            )

        return EvalResult(
            decision=Decision.ALLOW,
            reason="No matching deny policy — default allow",
        )

    @staticmethod
    def _resource_matches(policy_resource: str, resource: str) -> bool:
        return policy_resource == "*" or policy_resource == resource

    @staticmethod
    def _ordered_policies(policies: list[Policy]) -> list[Policy]:
        deterministic = [p for p in policies if p.condition.type != ConditionType.LLM_EVAL]
        llm_policies = [p for p in policies if p.condition.type == ConditionType.LLM_EVAL]
        return deterministic + llm_policies

    def _evaluate_single_policy(
        self,
        policy: Policy,
        identity: IdentityContext,
        context_fields: dict[str, Any],
    ) -> tuple[EvalResult, bool]:
        if policy.condition.type == ConditionType.LLM_EVAL:
            return self._eval_llm(policy, identity, context_fields)
        return self._eval_deterministic(policy, identity, context_fields)

    @staticmethod
    def _eval_deterministic(
        policy: Policy,
        identity: IdentityContext,
        context_fields: dict[str, Any],
    ) -> tuple[EvalResult, bool]:
        condition = policy.condition

        if condition.type == ConditionType.ALWAYS:
            # Unconditional rule — effect applies always
            matched = True

        elif condition.type == ConditionType.CONTEXT_MATCH:
            # All match_fields must be present and equal in the merged context
            merged = {
                "invoking_user_id": identity.invoking_user_id,
                "active_agent_id": identity.active_agent_id,
                "tenant_id": identity.tenant_id,
                "session_id": identity.session_id,
                **context_fields,
            }
            matched = all(merged.get(k) == v for k, v in condition.match_fields.items())
        else:
            # Should not reach here for LLM_EVAL policies
            matched = False

        if not matched:
            return EvalResult(
                decision=Decision.ALLOW,
                reason=f"Policy '{policy.name}' condition not matched — pass-through",
            ), False

        if policy.effect == PolicyEffect.DENY:
            return EvalResult(
                decision=Decision.DENY,
                matched_policy_id=policy.id,
                matched_policy_name=policy.name,
                deny_behavior=policy.deny_behavior,
                reason=f"Policy '{policy.name}' denied: {policy.raw_nl}",
            ), True

        return EvalResult(
            decision=Decision.ALLOW,
            matched_policy_id=policy.id,
            matched_policy_name=policy.name,
            reason=f"Policy '{policy.name}' explicitly allowed",
        ), True

    def _eval_llm(
        self,
        policy: Policy,
        identity: IdentityContext,
        context_fields: dict[str, Any],
    ) -> tuple[EvalResult, bool]:
        """
        Use an LLM to evaluate a soft/ambiguous policy.
        Only called for condition.type == "llm_eval" policies.
        """
        prompt = policy.condition.llm_prompt or policy.raw_nl
        context_summary = (
            f"Agent: {identity.active_agent_id}\n"
            f"User: {identity.invoking_user_id}\n"
            f"Tenant: {identity.tenant_id}\n"
            f"Additional context: {context_fields}"
        )
        user_message = f"Policy rule: {prompt}\n\nRequest context:\n{context_summary}"

        try:
            raw = self._call_llm(user_message)
            decision_str = raw.strip().upper()
            if "DENY" in decision_str:
                decision = Decision.DENY
            else:
                decision = Decision.ALLOW
        except Exception as e:
            # LLM failure → fail-safe to ALLOW to avoid false denials
            return EvalResult(
                decision=Decision.ALLOW,
                reason=f"LLM eval failed ({e}), defaulting to allow",
            ), False

        return EvalResult(
            decision=decision,
            matched_policy_id=policy.id,
            matched_policy_name=policy.name,
            deny_behavior=policy.deny_behavior if decision == Decision.DENY else None,
            reason=f"LLM eval for policy '{policy.name}': {decision.value}",
        ), True

    def _call_llm(self, user_message: str) -> str:
        if self.provider == "openai":
            from openai import OpenAI

            client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
            resp = client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": _SOFT_EVAL_SYSTEM},
                    {"role": "user", "content": user_message},
                ],
                temperature=0,
                max_tokens=5,
            )
            return resp.choices[0].message.content or "ALLOW"

        elif self.provider == "anthropic":
            import anthropic

            client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
            msg = client.messages.create(
                model=self.model or "claude-opus-4-6",
                max_tokens=5,
                system=_SOFT_EVAL_SYSTEM,
                messages=[{"role": "user", "content": user_message}],
            )
            return msg.content[0].text

        raise ValueError(f"Unknown provider: {self.provider}")
