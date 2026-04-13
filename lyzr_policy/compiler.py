"""
Natural-language compiler for the user/org policy gateway.

The parser is intentionally deterministic for the V1 patterns we support in
the UI and demos. If a rule falls outside the supported shape, an optional LLM
fallback can still be used when API keys are configured.
"""

from __future__ import annotations

import json
import os
import re
from typing import Any, Optional

from dotenv import load_dotenv

from .models import (
    ComparisonOperator,
    Policy,
    PolicyAction,
    PolicyCondition,
    PolicyCreate,
    PolicyEffect,
    Principal,
)

load_dotenv()

_SYSTEM_PROMPT = """You convert natural-language authorization rules into JSON.
Output ONLY valid JSON using this schema:
{
  "name": "short title",
  "principal": {"user_id": null, "org_id": null},
  "action": "tool_call | retrieve_context",
  "resource": "tool_or_context_name",
  "conditions": [{"field": "refund_amount", "operator": "lte", "value": 60000}],
  "effect": "permit | forbid"
}
Use permit/forbid semantics. Supported principal fields are only user_id and org_id.
Supported actions are only tool_call and retrieve_context.
"""


class PolicyCompiler:
    def __init__(self, provider: Optional[str] = None, model: Optional[str] = None):
        self.provider = (provider or os.getenv("POLICY_COMPILER_PROVIDER", "openai")).lower()
        self.model = model or os.getenv("POLICY_COMPILER_MODEL", "gpt-4o")

    def compile(self, raw_nl: str) -> Policy:
        parsed = self._parse_supported_rule(raw_nl)
        if parsed is not None:
            return parsed
        raw_json = self._call_llm(raw_nl)
        return self._parse_json(raw_nl, raw_json)

    def _parse_supported_rule(self, raw_nl: str) -> Optional[Policy]:
        text = self._normalize_text(raw_nl)
        effect = self._extract_effect(text)
        if effect is None:
            return None

        principal = Principal(
            user_id=self._extract_user_id(text),
            org_id=self._extract_org_id(text),
        )

        action, resource = self._extract_action_and_resource(text)
        if action is None or resource is None:
            return None

        # For input_content, resource is the keyword; convert to fixed "message" + condition
        if action == PolicyAction.INPUT_CONTENT:
            keyword = resource
            resource = "message"
            conditions = [
                PolicyCondition(
                    field="message_text",
                    operator=ComparisonOperator.CONTAINS,
                    value=keyword,
                )
            ]
        else:
            conditions = self._extract_conditions(text)

        name = self._build_name(effect, principal, action, resource)
        return Policy(
            name=name,
            raw_nl=raw_nl,
            principal=principal,
            action=action,
            resource=resource,
            conditions=conditions,
            effect=effect,
        )

    @staticmethod
    def _normalize_text(raw_nl: str) -> str:
        text = raw_nl.strip()
        text = text.replace("₹", "")
        text = text.replace(",", "")
        return re.sub(r"\s+", " ", text)

    @staticmethod
    def _extract_effect(text: str) -> Optional[PolicyEffect]:
        lower = text.lower()
        if re.search(r"\b(permit|allow)\b", lower):
            return PolicyEffect.PERMIT
        if re.search(r"\b(forbid|deny|block|must not|cannot|should not|not allow)\b", lower):
            return PolicyEffect.FORBID
        return None

    @staticmethod
    def _extract_user_id(text: str) -> Optional[str]:
        # Allow optional single or double quotes around the ID
        patterns = [
            r"\buser\s+['\"]?([A-Za-z0-9_.:@/-]+)['\"]?",
            r"\busers with id\s+['\"]?([A-Za-z0-9_.:@/-]+)['\"]?",
        ]
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                return match.group(1)
        return None

    @staticmethod
    def _extract_org_id(text: str) -> Optional[str]:
        patterns = [
            r"\bin\s+org\s+['\"]?([A-Za-z0-9_.:@/-]+)['\"]?",
            r"\bfrom\s+org\s+['\"]?([A-Za-z0-9_.:@/-]+)['\"]?",
            r"\borg\s+['\"]?([A-Za-z0-9_.:@/-]+)['\"]?",
            r"\brgid\s+['\"]?([A-Za-z0-9_.:@/-]+)['\"]?",
        ]
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                return match.group(1)
        return None

    @staticmethod
    def _extract_action_and_resource(text: str) -> tuple[Optional[PolicyAction], Optional[str]]:
        lower = text.lower()
        tool_match = re.search(
            r"(?:call(?:ing)?|access(?:ing)?)\s+(?:the\s+tool\s+)?([A-Za-z0-9_.:-]+)",
            lower,
            re.IGNORECASE,
        )
        if tool_match:
            return PolicyAction.TOOL_CALL, tool_match.group(1)

        retrieve_tag_match = re.search(
            r"retriev(?:e|ing)\s+context\s+tagged\s+([A-Za-z0-9_.:-]+)",
            lower,
            re.IGNORECASE,
        )
        if retrieve_tag_match:
            return PolicyAction.RETRIEVE_CONTEXT, retrieve_tag_match.group(1)

        retrieve_match = re.search(
            r"retriev(?:e|ing)\s+([A-Za-z0-9_.:-]+)\s+context",
            lower,
            re.IGNORECASE,
        )
        if retrieve_match:
            return PolicyAction.RETRIEVE_CONTEXT, retrieve_match.group(1)

        # Input content check: "asking about X", "queries about X", "related to X", etc.
        content_match = re.search(
            r"(?:ask(?:s|ing)?|quer(?:y|ies|ying)|question(?:s)?|message(?:s)?|request(?:s)?|data)\s+"
            r"(?:about|related to|regarding|mentioning|containing|on)\s+([A-Za-z0-9_.:-]+)",
            lower,
        )
        if content_match:
            return PolicyAction.INPUT_CONTENT, content_match.group(1)

        # "related to X" or "about X" at end of rule
        related_match = re.search(
            r"\b(?:related to|about|mentioning|containing|regarding)\s+([A-Za-z0-9_.:-]+)\s*$",
            lower,
        )
        if related_match:
            return PolicyAction.INPUT_CONTENT, related_match.group(1)

        return None, None

    @classmethod
    def _extract_conditions(cls, text: str) -> list[PolicyCondition]:
        conditions: list[PolicyCondition] = []
        lower = text.lower()

        amount_pattern = re.search(
            r"(refund_amount|refund amount|amount)\s*(<=|>=|<|>|==|=)\s*(\d+(?:\.\d+)?)",
            lower,
        )
        if amount_pattern:
            conditions.append(
                PolicyCondition(
                    field=cls._normalize_field_name(amount_pattern.group(1)),
                    operator=cls._operator_from_symbol(amount_pattern.group(2)),
                    value=cls._coerce_numeric(amount_pattern.group(3)),
                )
            )

        verbal_amount = re.search(
            r"(refund_amount|refund amount|amount).{0,20}\b(less than or equal to|greater than or equal to|less than|greater than)\s*(\d+(?:\.\d+)?)",
            lower,
        )
        if verbal_amount:
            conditions.append(
                PolicyCondition(
                    field=cls._normalize_field_name(verbal_amount.group(1)),
                    operator=cls._operator_from_phrase(verbal_amount.group(2)),
                    value=cls._coerce_numeric(verbal_amount.group(3)),
                )
            )

        classification_match = re.search(
            r"classification\s*(?:==|=|is)\s*([A-Za-z0-9_.:-]+)",
            lower,
        )
        if classification_match:
            conditions.append(
                PolicyCondition(
                    field="classification",
                    operator=ComparisonOperator.EQ,
                    value=classification_match.group(1),
                )
            )

        tag_match = re.search(r"context(?:_tag)?\s*(?:==|=|is)\s*([A-Za-z0-9_.:-]+)", lower)
        if tag_match:
            conditions.append(
                PolicyCondition(
                    field="context_tag",
                    operator=ComparisonOperator.EQ,
                    value=tag_match.group(1),
                )
            )

        return conditions

    @staticmethod
    def _normalize_field_name(field: str) -> str:
        return field.strip().lower().replace(" ", "_")

    @staticmethod
    def _operator_from_symbol(symbol: str) -> ComparisonOperator:
        return {
            "=": ComparisonOperator.EQ,
            "==": ComparisonOperator.EQ,
            "<": ComparisonOperator.LT,
            "<=": ComparisonOperator.LTE,
            ">": ComparisonOperator.GT,
            ">=": ComparisonOperator.GTE,
        }[symbol]

    @staticmethod
    def _operator_from_phrase(phrase: str) -> ComparisonOperator:
        normalized = phrase.lower()
        if normalized == "less than":
            return ComparisonOperator.LT
        if normalized == "less than or equal to":
            return ComparisonOperator.LTE
        if normalized == "greater than":
            return ComparisonOperator.GT
        return ComparisonOperator.GTE

    @staticmethod
    def _coerce_numeric(raw: str) -> Any:
        return float(raw) if "." in raw else int(raw)

    @staticmethod
    def _build_name(
        effect: PolicyEffect,
        principal: Principal,
        action: PolicyAction,
        resource: str,
    ) -> str:
        principal_bits: list[str] = []
        if principal.user_id:
            principal_bits.append(principal.user_id)
        if principal.org_id:
            principal_bits.append(principal.org_id)
        principal_label = " / ".join(principal_bits) if principal_bits else "all principals"
        verb = "Permit" if effect == PolicyEffect.PERMIT else "Forbid"
        return f"{verb} {principal_label} {action.value} {resource}"[:80]

    def _call_llm(self, raw_nl: str) -> str:
        if self.provider == "openai":
            return self._call_openai(raw_nl)
        if self.provider == "anthropic":
            return self._call_anthropic(raw_nl)
        raise ValueError(f"Unknown POLICY_COMPILER_PROVIDER: {self.provider!r}")

    def _call_openai(self, raw_nl: str) -> str:
        from openai import OpenAI

        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            raise ValueError("Unsupported policy syntax and OPENAI_API_KEY not set")

        client = OpenAI(api_key=api_key)
        response = client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": raw_nl},
            ],
            temperature=0,
            response_format={"type": "json_object"},
        )
        return response.choices[0].message.content or ""

    def _call_anthropic(self, raw_nl: str) -> str:
        import anthropic

        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            raise ValueError("Unsupported policy syntax and ANTHROPIC_API_KEY not set")

        client = anthropic.Anthropic(api_key=api_key)
        message = client.messages.create(
            model=self.model or "claude-opus-4-6",
            max_tokens=1024,
            system=_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": raw_nl}],
        )
        return message.content[0].text

    def _parse_json(self, raw_nl: str, raw_json: str) -> Policy:
        try:
            data = json.loads(raw_json)
        except json.JSONDecodeError as exc:
            raise ValueError(f"Policy compiler returned invalid JSON: {exc}") from exc

        conditions = [
            PolicyCondition(
                field=item["field"],
                operator=ComparisonOperator(item["operator"]),
                value=item["value"],
            )
            for item in data.get("conditions", [])
        ]
        return Policy(
            name=data["name"],
            raw_nl=raw_nl,
            principal=Principal(**data.get("principal", {})),
            action=PolicyAction(data["action"]),
            resource=data["resource"],
            conditions=conditions,
            effect=PolicyEffect(data["effect"]),
        )
