"""
Lyzr Policy Enforcement Layer

A POC control-plane library that adds IAM-style governance to Lyzr agents.

The unified Policy Enforcement Layer internally manages three types of checks
(integrated with Lyzr REST APIs — NOT native Lyzr hooks):
  - DataAccessControl: data access control
  - PolicyEnforcementLayer: tool authorization
  - OutputSanitizer: automatic output sanitization

Users interact with a single policy concept that governs all concerns.

Quick start:
    from lyzr_policy import LyzrClient, PolicyEnforcementLayer, PolicyCompiler
    from lyzr_policy.store import init_db, save_policy

    init_db()
    compiler = PolicyCompiler()
    policy = compiler.compile("agent support-bot cannot call github")
    save_policy(policy)
"""

from .compiler import PolicyCompiler
from .evaluator import PolicyEvaluator
from .gateway import DataAccessControl
from .enforcement import PolicyEnforcementLayer
from .trust import OutputSanitizer
from .lyzr_client import LyzrClient, LyzrAPIError
from .models import (
    ChatRequest,
    ChatResponse,
    DataClassification,
    EvalResult,
    IdentityContext,
    Policy,
    PolicyCreate,
    PolicyDeniedResponse,
    PolicyScope,
    Recipient,
    RecipientType,
)
from .store import init_db, save_policy, get_policy, list_policies, delete_policy, list_audit

__all__ = [
    "PolicyCompiler",
    "PolicyEvaluator",
    "DataAccessControl",
    "PolicyEnforcementLayer",
    "OutputSanitizer",
    "LyzrClient",
    "LyzrAPIError",
    "ChatRequest",
    "ChatResponse",
    "DataClassification",
    "EvalResult",
    "IdentityContext",
    "Policy",
    "PolicyCreate",
    "PolicyDeniedResponse",
    "PolicyScope",
    "Recipient",
    "RecipientType",
    "init_db",
    "save_policy",
    "get_policy",
    "list_policies",
    "delete_policy",
    "list_audit",
]
