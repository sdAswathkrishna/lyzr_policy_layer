"""
Thin wrapper around the Lyzr REST API.

This is a POC control-plane component. It wraps Lyzr's external REST endpoints
and does NOT assume any native hooks or plugin points inside Lyzr's runtime.
All policy checks happen in our orchestration layer AROUND these calls.

Lyzr API base: https://agent-prod.studio.lyzr.ai
RAI API base:  https://rai-prod.studio.lyzr.ai
"""

import os
from typing import Any, Optional

import httpx
from dotenv import load_dotenv

load_dotenv()

AGENT_BASE_URL = "https://agent-prod.studio.lyzr.ai"
RAI_BASE_URL = "https://rai-prod.studio.lyzr.ai"

_DEFAULT_TIMEOUT = 60.0


class LyzrAPIError(Exception):
    """Raised when the Lyzr API returns a non-2xx response."""

    def __init__(self, status_code: int, detail: Any):
        self.status_code = status_code
        self.detail = detail
        super().__init__(f"Lyzr API error {status_code}: {detail}")


class LyzrClient:
    """
    Synchronous Lyzr API client.

    All methods raise LyzrAPIError on non-2xx responses so callers can
    distinguish API failures from policy denials.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        user_id: Optional[str] = None,
        timeout: float = _DEFAULT_TIMEOUT,
    ):
        self.api_key = api_key or os.environ["LYZR_API_KEY"]
        self.user_id = user_id or os.environ["LYZR_USER_ID"]
        self._headers = {
            "x-api-key": self.api_key,
            "Content-Type": "application/json",
        }
        self._timeout = timeout

    # ------------------------------------------------------------------
    # Agent management
    # ------------------------------------------------------------------

    def create_agent(
        self,
        name: str,
        description: str = "",
        agent_role: str = "",
        agent_instructions: str = "",
        agent_goal: str = "",
        provider_id: str = "openai",
        model: str = "gpt-4o",
        temperature: float = 0.7,
        top_p: float = 1.0,          # REQUIRED by Lyzr v3 API (not optional despite docs)
        tools: Optional[list] = None,
        features: Optional[list] = None,
        store_messages: bool = True,
        **extra,
    ) -> dict:
        """
        POST /v3/agents/
        Returns the full response dict (contains 'agent_id').

        NOTE: top_p is required by the Lyzr API — omitting it returns 422.
        Discovered in Step 1 baseline run (lyzr-failures.md).
        """
        payload = {
            "name": name,
            "description": description,
            "agent_role": agent_role,
            "agent_instructions": agent_instructions,
            "agent_goal": agent_goal,
            "provider_id": provider_id,
            "model": model,
            "temperature": temperature,
            "top_p": top_p,
            "tools": tools or [],
            "features": features or [],
            "store_messages": store_messages,
            **extra,
        }
        return self._post(f"{AGENT_BASE_URL}/v3/agents/", payload)

    def get_agent(self, agent_id: str) -> dict:
        """GET /v3/agents/{agent_id}"""
        return self._get(f"{AGENT_BASE_URL}/v3/agents/{agent_id}")

    def update_agent(self, agent_id: str, updates: dict) -> dict:
        """PUT /v3/agents/{agent_id}"""
        return self._put(f"{AGENT_BASE_URL}/v3/agents/{agent_id}", updates)

    def delete_agent(self, agent_id: str) -> dict:
        """DELETE /v3/agents/{agent_id}"""
        return self._delete(f"{AGENT_BASE_URL}/v3/agents/{agent_id}")

    # ------------------------------------------------------------------
    # Inference
    # ------------------------------------------------------------------

    def chat(
        self,
        agent_id: str,
        session_id: str,
        message: str,
        user_id: Optional[str] = None,          # per-request identity (Fix 1)
        system_prompt_variables: Optional[dict] = None,
        filter_variables: Optional[dict] = None,
        features: Optional[list] = None,
    ) -> dict:
        """
        POST /v3/inference/chat/
        Returns {'response': '<agent reply>'}.

        user_id: if provided, overrides the env-level LYZR_USER_ID for this
        specific call, preserving per-request identity in Lyzr's session history.
        """
        payload = {
            "user_id": user_id or self.user_id,   # per-request > env fallback (Fix 1)
            "agent_id": agent_id,
            "session_id": session_id,
            "message": message,
            "system_prompt_variables": system_prompt_variables or {},
            "filter_variables": filter_variables or {},
            "features": features or [],
        }
        return self._post(f"{AGENT_BASE_URL}/v3/inference/chat/", payload)

    # ------------------------------------------------------------------
    # Tools
    # ------------------------------------------------------------------

    def list_tools(self) -> list:
        """GET /v3/tools/ — returns all tools for this API key."""
        result = self._get(f"{AGENT_BASE_URL}/v3/tools/")
        # API may return a list or a dict with a 'tools' key
        if isinstance(result, list):
            return result
        return result.get("tools", result.get("data", []))

    # ------------------------------------------------------------------
    # RAI policies (Lyzr native — content safety)
    # ------------------------------------------------------------------

    def create_rai_policy(self, policy: dict) -> dict:
        """POST /v1/rai/policies — create a native Lyzr RAI policy."""
        return self._post(f"{RAI_BASE_URL}/v1/rai/policies", policy)

    def list_rai_policies(self) -> list:
        """GET /v1/rai/policies"""
        result = self._get(f"{RAI_BASE_URL}/v1/rai/policies")
        if isinstance(result, list):
            return result
        return result.get("policies", [])

    def check_toxicity(self, text: str) -> dict:
        """POST /v1/rai/toxicity"""
        return self._post(f"{RAI_BASE_URL}/v1/rai/toxicity", {"text": text})

    def check_prompt_injection(self, text: str) -> dict:
        """POST /v1/rai/prompt-injection"""
        return self._post(f"{RAI_BASE_URL}/v1/rai/prompt-injection", {"text": text})

    # ------------------------------------------------------------------
    # Session history
    # ------------------------------------------------------------------

    def get_session_history(self, session_id: str) -> dict:
        """GET /v3/sessions/{session_id}/history"""
        return self._get(f"{AGENT_BASE_URL}/v3/sessions/{session_id}/history")

    # ------------------------------------------------------------------
    # Internal HTTP helpers
    # ------------------------------------------------------------------

    def _post(self, url: str, payload: dict) -> Any:
        with httpx.Client(timeout=self._timeout) as client:
            resp = client.post(url, json=payload, headers=self._headers)
        return self._handle(resp)

    def _get(self, url: str) -> Any:
        with httpx.Client(timeout=self._timeout) as client:
            resp = client.get(url, headers=self._headers)
        return self._handle(resp)

    def _put(self, url: str, payload: dict) -> Any:
        with httpx.Client(timeout=self._timeout) as client:
            resp = client.put(url, json=payload, headers=self._headers)
        return self._handle(resp)

    def _delete(self, url: str) -> Any:
        with httpx.Client(timeout=self._timeout) as client:
            resp = client.delete(url, headers=self._headers)
        return self._handle(resp)

    @staticmethod
    def _handle(resp: httpx.Response) -> Any:
        try:
            body = resp.json()
        except Exception:
            body = resp.text
        if resp.status_code >= 400:
            raise LyzrAPIError(resp.status_code, body)
        return body
