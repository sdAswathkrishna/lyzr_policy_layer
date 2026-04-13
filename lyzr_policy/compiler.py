"""
Policy Compiler: Natural Language → Structured JSON Policy

Converts a natural language rule string into a validated Policy object.
This is a one-time operation at policy-definition time — zero LLM cost
at runtime for deterministic rules.

Design:
- Uses OpenAI or Anthropic (configurable via POLICY_COMPILER_PROVIDER env var)
- The LLM output is parsed and validated against the Policy Pydantic model
- If the LLM output is invalid, a ValueError is raised with the raw output
  so the user can correct their natural language rule
"""

from __future__ import annotations

import json
import os
import re
from typing import Optional

from dotenv import load_dotenv

from .models import (
    Condition,
    ConditionType,
    DenyBehavior,
    Policy,
    PolicyAction,
    PolicyEffect,
    PolicyScope,
)

load_dotenv()

# ── System prompt ──────────────────────────────────────────────────────────────

_SYSTEM_PROMPT = """You are a policy compiler for an IAM-style enforcement layer.
Your job is to convert a natural language rule into a structured JSON policy object.

Output ONLY valid JSON. No markdown, no explanation, just the JSON object.

The JSON must follow this schema exactly:

{
  "name": "<short descriptive name, max 60 chars>",
  "scope": "enforcement",
  "subject": "<agent_id or * for all agents>",
  "action": "<access_data | call_tool | send_output>",
  "resource": "<tool_name | data_class | recipient_id | * for all>",
  "condition": {
    "type": "<always | context_match | llm_eval>",
    "match_fields": {},
    "llm_prompt": null
  },
  "effect": "<allow | deny>",
  "deny_behavior": "<deny | redact | filter | escalate | strip | mask | reroute | block>"
}

Rules:
- scope: always set to "enforcement" (unified policy enforcement layer)
- action maps to:
    access_data    → control access to classified data
    call_tool      → control tool invocation
    send_output    → control output delivery
- deny_behavior choices by action:
    access_data    → deny, redact, filter
    call_tool      → deny, escalate
    send_output    → strip, mask, reroute, block
- condition.type:
    always         → unconditional rule (no match_fields needed)
    context_match  → rule applies only if specific context fields match
                     (populate match_fields, e.g. {"user_role": "admin"})
    llm_eval       → ambiguous rule that needs LLM judgement at runtime
                     (populate llm_prompt with a yes/no question)
- If the rule mentions "cannot", "must not", "is not allowed" → effect: deny
- If the rule mentions "can only", "is allowed", "may" → effect: allow
- subject: use * if the rule applies to all agents; otherwise use the agent name as-is
- resource: use * if the rule applies to all tools/data/recipients; otherwise use the specific name
"""


# ── Compiler ───────────────────────────────────────────────────────────────────


class PolicyCompiler:
    def __init__(
        self,
        provider: Optional[str] = None,
        model: Optional[str] = None,
    ):
        self.provider = (provider or os.getenv("POLICY_COMPILER_PROVIDER", "openai")).lower()
        self.model = model or os.getenv("POLICY_COMPILER_MODEL", "gpt-4o")

    def compile(self, raw_nl: str, scope_hint: Optional[PolicyScope] = None) -> Policy:
        """
        Convert a natural language rule to a Policy.

        Args:
            raw_nl:     The rule as written by the user.
            scope_hint: If provided, added to the prompt to guide the LLM.

        Returns:
            A validated Policy object ready to be saved to the store.

        Raises:
            ValueError: If the LLM output cannot be parsed or validated.
        """
        user_message = raw_nl
        if scope_hint:
            user_message = f"[Scope hint: {scope_hint.value}]\n{raw_nl}"

        raw_json = self._call_llm(user_message)
        policy = self._parse(raw_nl, raw_json)
        return policy

    def _call_llm(self, user_message: str) -> str:
        if self.provider == "openai":
            return self._call_openai(user_message)
        elif self.provider == "anthropic":
            return self._call_anthropic(user_message)
        else:
            raise ValueError(f"Unknown POLICY_COMPILER_PROVIDER: {self.provider!r}. Use 'openai' or 'anthropic'.")

    def _call_openai(self, user_message: str) -> str:
        from openai import OpenAI

        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            raise EnvironmentError("OPENAI_API_KEY not set")

        client = OpenAI(api_key=api_key)
        response = client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": user_message},
            ],
            temperature=0,
            response_format={"type": "json_object"},
        )
        return response.choices[0].message.content or ""

    def _call_anthropic(self, user_message: str) -> str:
        import anthropic

        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            raise EnvironmentError("ANTHROPIC_API_KEY not set")

        client = anthropic.Anthropic(api_key=api_key)
        message = client.messages.create(
            model=self.model or "claude-opus-4-6",
            max_tokens=1024,
            system=_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_message}],
        )
        raw = message.content[0].text
        # Strip any accidental markdown fences
        raw = re.sub(r"```(?:json)?\s*", "", raw).strip()
        return raw

    @staticmethod
    def _parse(raw_nl: str, raw_json: str) -> Policy:
        try:
            data = json.loads(raw_json)
        except json.JSONDecodeError as e:
            raise ValueError(
                f"Policy compiler returned invalid JSON.\n"
                f"Raw output:\n{raw_json}\n"
                f"JSON error: {e}"
            )

        required = ["name", "scope", "subject", "action", "resource", "condition", "effect", "deny_behavior"]
        missing = [k for k in required if k not in data]
        if missing:
            raise ValueError(f"Compiled policy missing fields: {missing}\nRaw output:\n{raw_json}")

        try:
            condition_data = data.get("condition", {})
            condition = Condition(
                type=ConditionType(condition_data.get("type", "always")),
                match_fields=condition_data.get("match_fields", {}),
                llm_prompt=condition_data.get("llm_prompt"),
            )
            policy = Policy(
                name=data["name"],
                raw_nl=raw_nl,
                scope=PolicyScope(data["scope"]),
                subject=data["subject"],
                action=PolicyAction(data["action"]),
                resource=data["resource"],
                condition=condition,
                effect=PolicyEffect(data["effect"]),
                deny_behavior=DenyBehavior(data["deny_behavior"]),
            )
        except (ValueError, KeyError) as e:
            raise ValueError(
                f"Compiled policy has invalid field values.\n"
                f"Raw output:\n{raw_json}\n"
                f"Validation error: {e}"
            )

        return policy
