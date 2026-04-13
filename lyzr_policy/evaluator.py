"""
Policy evaluator for governed gateway actions.

Governed actions follow AgentCore-style semantics:
- default deny
- at least one permit required
- any matching forbid wins
"""

from __future__ import annotations

import time
from typing import Any

from .models import (
    AuditEntry,
    AuditPrincipal,
    ComparisonOperator,
    Decision,
    EvalResult,
    IdentityContext,
    Policy,
    PolicyAction,
    PolicyEffect,
)
from .store import find_policies, write_audit


class PolicyEvaluator:
    def evaluate(
        self,
        action: PolicyAction,
        resource: str,
        identity: IdentityContext,
        input_context: dict[str, Any],
    ) -> EvalResult:
        t0 = time.monotonic()
        policies = find_policies(action=action, resource=resource)

        permit_matches: list[Policy] = []
        forbid_matches: list[Policy] = []
        for policy in policies:
            if self._principal_matches(policy, identity) and self._conditions_match(policy, input_context):
                if policy.effect == PolicyEffect.PERMIT:
                    permit_matches.append(policy)
                else:
                    forbid_matches.append(policy)

        if forbid_matches:
            result = EvalResult(
                decision=Decision.DENY,
                matched_policy_ids=[policy.id for policy in forbid_matches],
                matched_policy_names=[policy.name for policy in forbid_matches],
                reason=f"Forbidden by policy: {forbid_matches[0].name}",
            )
        elif permit_matches:
            result = EvalResult(
                decision=Decision.ALLOW,
                matched_policy_ids=[policy.id for policy in permit_matches],
                matched_policy_names=[policy.name for policy in permit_matches],
                reason=f"Permitted by policy: {permit_matches[0].name}",
            )
        else:
            result = EvalResult(
                decision=Decision.ALLOW,
                reason="No applicable policy — passthrough",
            )

        result.latency_ms = int((time.monotonic() - t0) * 1000)
        result.audit_id = write_audit(
            AuditEntry(
                request_id=identity.request_id,
                principal=AuditPrincipal(
                    user_id=identity.user_id,
                    org_id=identity.org_id,
                    auth_source=identity.auth_source,
                ),
                action=action,
                resource=resource,
                evaluated_context=input_context,
                matched_policy_ids=result.matched_policy_ids,
                decision=result.decision,
                reason=result.reason,
                latency_ms=result.latency_ms,
            )
        )
        return result

    @staticmethod
    def _principal_matches(policy: Policy, identity: IdentityContext) -> bool:
        principal = policy.principal
        if principal.user_id and principal.user_id != identity.user_id:
            return False
        if principal.org_id and principal.org_id != identity.org_id:
            return False
        return True

    def _conditions_match(self, policy: Policy, input_context: dict[str, Any]) -> bool:
        return all(self._match_condition(condition.field, condition.operator, input_context.get(condition.field), condition.value)
                   for condition in policy.conditions)

    @staticmethod
    def _match_condition(
        field: str,
        operator: ComparisonOperator,
        actual: Any,
        expected: Any,
    ) -> bool:
        if actual is None:
            return False
        if operator == ComparisonOperator.EQ:
            return actual == expected
        if operator == ComparisonOperator.NEQ:
            return actual != expected
        if operator == ComparisonOperator.LT:
            return actual < expected
        if operator == ComparisonOperator.LTE:
            return actual <= expected
        if operator == ComparisonOperator.GT:
            return actual > expected
        if operator == ComparisonOperator.GTE:
            return actual >= expected
        if operator == ComparisonOperator.CONTAINS:
            return str(expected) in str(actual)
        if operator == ComparisonOperator.IN:
            return actual in expected
        return False
