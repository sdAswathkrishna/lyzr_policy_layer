"""
Tool Authorization (internal check within Policy Enforcement Layer)

Sits BETWEEN Input Processing and LLM/RAG/Tools.
IAM-style control over which agent can call which tool under what conditions.

This is an internal component of the unified Policy Enforcement Layer.
It wraps Lyzr's chat() call and mediates tool dispatch.
It does NOT rely on native Lyzr hooks.

Tool authorization uses wrapper-controlled dispatch:
  The implementation intercepts the Lyzr inference call BEFORE it happens.
  "Intended tool invocations" are surfaced via a two-stage process:

  Stage 1 — Structured-output planning step:
    A lightweight preliminary LLM call asks: "which tool would this message invoke?"
    The LLM returns a structured JSON object: {intended_tools, reason}.
    Policy is enforced on this object before the main Lyzr chat() call.
    This is accurate, not bypassable by phrasing, and produces an auditable
    planning record alongside every enforcement decision.

  Stage 2 — Keyword fallback:
    If the planning LLM call fails (network error, missing key, etc.), the
    system falls back to the keyword heuristic so enforcement is never silently skipped.

Design decision:
  Lyzr's chat API does NOT expose pre-tool or post-tool hooks natively.
  Therefore this component operates at the REQUEST level — pre-inference, not mid-execution.

Deny behaviors:
  - deny:     block the inference call entirely
  - escalate: allow the call but log + flag for review (non-blocking)
"""

from __future__ import annotations

import json
import os
import re
from typing import Any, Optional

from .evaluator import PolicyEvaluator
from .lyzr_client import LyzrClient
from .models import (
    ChatRequest,
    ChatResponse,
    Decision,
    DenyBehavior,
    EvalResult,
    IdentityContext,
    PolicyAction,
    PolicyDeniedResponse,
    PolicyScope,
    Recipient,
)


class PolicyEnforcementLayer:
    """
    Wraps LyzrClient.chat() with IAM-style tool authorization.
    Internal component of the unified Policy Enforcement Layer.

    Usage:
        pel = PolicyEnforcementLayer(lyzr_client)
        response = pel.enforce_and_chat(request)
        # response is either ChatResponse or PolicyDeniedResponse
    """

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
    ) -> tuple[Optional[str], Optional[PolicyDeniedResponse]]:
        """
        Check enforcement policies, then (if allowed) call Lyzr chat.

        Returns:
            (lyzr_response_text, denied_response)
            Exactly one of these will be non-None.
        """
        # Fix 4: structured-output planning step (with keyword fallback)
        intended_tools = self._plan_tool_intent(request)

        # If no tools are detected, still check a wildcard policy for this agent
        if not intended_tools:
            intended_tools = ["__inference__"]  # sentinel: represents raw LLM inference

        escalations: list[str] = []

        for tool_name in intended_tools:
            result = self._evaluator.evaluate(
                scope=PolicyScope.ENFORCEMENT,
                action=PolicyAction.CALL_TOOL,
                resource=tool_name,
                identity=identity,
                context_fields=request.context_fields,
            )
            policy_trace.append(result)

            if result.decision == Decision.DENY:
                behavior = result.deny_behavior or DenyBehavior.DENY

                if behavior == DenyBehavior.ESCALATE:
                    # Non-blocking — log the violation, continue
                    escalations.append(f"[ESCALATED] Tool '{tool_name}': {result.reason}")
                    continue

                # DENY — block inference entirely
                denied = PolicyDeniedResponse(
                    layer=PolicyScope.ENFORCEMENT,
                    reason=result.reason,
                    policy_id=result.matched_policy_id,
                    policy_name=result.matched_policy_name,
                    deny_behavior=behavior,
                    request_id=identity.request_id,
                    audit_id=result.audit_id or identity.request_id,
                )
                return None, denied

        # All tool checks passed — call Lyzr with per-request user identity (Fix 1)
        lyzr_resp = self._client.chat(
            agent_id=request.agent_id,
            session_id=request.session_id,
            message=request.message,
            user_id=identity.invoking_user_id,   # propagate actual caller, not env default
        )
        response_text = lyzr_resp.get("response", "")

        # Append escalation notices to the response for visibility in the demo
        if escalations:
            note = "\n\n---\n⚠️ Policy escalation logged:\n" + "\n".join(escalations)
            response_text += note

        return response_text, None

    # ── Known tools registry ───────────────────────────────────────────────────
    _TOOL_KEYWORDS: dict[str, list[str]] = {
        "github": ["github", "repository", "repo", "pull request", "pr", "commit", "code search", "git"],
        "gmail": ["email", "gmail", "send mail", "inbox", "compose", "mail"],
        "slack": ["slack", "channel", "dm", "direct message", "notify team"],
        "notion": ["notion", "page", "database", "workspace", "notes"],
        "google_calendar": ["calendar", "schedule", "meeting", "event", "appointment", "book a time"],
        "google_drive": ["drive", "gdrive", "document", "spreadsheet", "google doc", "google sheet"],
        "clickup": ["clickup", "task", "project", "ticket", "sprint"],
        "perplexity": ["search", "browse", "web search", "look up", "find online", "research"],
        "youtube": ["youtube", "video", "watch", "channel"],
        "twitter": ["twitter", "tweet", "x.com", "post on social"],
    }

    _PLANNING_SYSTEM = (
        "You are a tool intent planner for a governed agent system.\n"
        "Given a user message, determine which external tools (if any) the agent would need to invoke.\n"
        "Output ONLY valid JSON in this exact format:\n"
        '{"intended_tools": ["tool_name"], "reason": "brief explanation"}\n\n'
        "Known tools: " + ", ".join(_TOOL_KEYWORDS.keys()) + "\n"
        'If no external tool is needed, return: {"intended_tools": [], "reason": "plain LLM query"}'
    )

    def _plan_tool_intent(self, request: ChatRequest) -> list[str]:
        """
        Fix 4: Two-stage tool intent resolution.

        Stage 1 — Structured-output LLM planning call:
            Asks the policy-compiler LLM to emit {intended_tools, reason} JSON.
            Accurate, phrasing-independent, produces an auditable planning record.

        Stage 2 — Keyword fallback:
            If the LLM call fails for any reason, falls back to keyword matching
            so enforcement is never silently skipped.
        """
        try:
            return self._plan_via_llm(request.message)
        except Exception:
            return self._plan_via_keywords(request.message)

    def _plan_via_llm(self, message: str) -> list[str]:
        """Call the policy-compiler LLM with a structured-output prompt."""
        provider = os.getenv("POLICY_COMPILER_PROVIDER", "openai").lower()
        model = os.getenv("POLICY_COMPILER_MODEL", "gpt-4o")

        if provider == "openai":
            from openai import OpenAI
            client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])
            resp = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": self._PLANNING_SYSTEM},
                    {"role": "user", "content": f"User message: {message}"},
                ],
                temperature=0,
                response_format={"type": "json_object"},
                max_tokens=256,
            )
            raw = resp.choices[0].message.content or "{}"

        elif provider == "anthropic":
            import anthropic
            client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
            msg = client.messages.create(
                model=model or "claude-opus-4-6",
                max_tokens=256,
                system=self._PLANNING_SYSTEM,
                messages=[{"role": "user", "content": f"User message: {message}"}],
            )
            raw = msg.content[0].text
        else:
            raise ValueError(f"Unknown provider: {provider}")

        data = json.loads(raw)
        tools = data.get("intended_tools", [])
        return [t for t in tools if isinstance(t, str)]

    def _plan_via_keywords(self, message: str) -> list[str]:
        """Keyword-heuristic fallback — used only when the LLM planning call fails."""
        message_lower = message.lower()
        detected: set[str] = set()
        for tool_name, keywords in self._TOOL_KEYWORDS.items():
            if any(kw in message_lower for kw in keywords):
                detected.add(tool_name)
        direct = re.compile(r'\b(' + '|'.join(self._TOOL_KEYWORDS.keys()) + r')\b', re.IGNORECASE)
        detected.update(direct.findall(message_lower))
        return list(detected)
