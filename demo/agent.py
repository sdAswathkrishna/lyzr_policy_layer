"""
Customer Support Agent — Lyzr ADK Demo
========================================
Creates a customer support agent using the Lyzr ADK with:
  - Knowledge base (RAG) built from customer support docs via ADK
  - Notion tool               (built-in, OAuth connected in Studio)
  - Composio Search tool      (built-in, OAuth connected in Studio)
  - Custom tool: Escalate to Human   (Python function via agent.add_tool)
  - Custom tool: Process Refund      (Python function via agent.add_tool)

Run (first time — creates agent and KB):
    /opt/homebrew/Caskroom/miniconda/base/envs/lyzr-policy/bin/python demo/agent.py

Run (subsequent times — reuses existing agent and KB):
    /opt/homebrew/Caskroom/miniconda/base/envs/lyzr-policy/bin/python demo/agent.py

Force recreate (deletes state file and creates fresh agent + KB):
    /opt/homebrew/Caskroom/miniconda/base/envs/lyzr-policy/bin/python demo/agent.py --recreate

State is persisted in demo/.agent_state.json
Delete that file manually to force recreation without the flag.

Requirements:
    pip install lyzr-adk   (do NOT have lyzr 0.1.x installed alongside it)

Environment (.env):
    LYZR_API_KEY
    LYZR_USER_ID
    OPENAI_API_KEY
"""

from __future__ import annotations

import asyncio
import json
import os
import random
import string
import sys
from datetime import datetime, timedelta
from pathlib import Path

from dotenv import load_dotenv

from lyzr import Studio, Tool

# ── Environment ────────────────────────────────────────────────────────────────

ROOT      = Path(__file__).parent.parent
DEMO_DIR  = Path(__file__).parent
DOCS_DIR  = Path(os.getenv("DOCS_DIR", "/Users/aswathkrishna.sd/Downloads/customer_support_docs"))
STATE_FILE = DEMO_DIR / ".agent_state.json"

load_dotenv(ROOT / ".env")

LYZR_API_KEY = os.environ["LYZR_API_KEY"]

FORCE_RECREATE = "--recreate" in sys.argv


# ── State helpers ──────────────────────────────────────────────────────────────

def load_state() -> dict:
    """Load persisted agent/KB IDs from disk."""
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text())
    return {}


def save_state(state: dict) -> None:
    """Persist agent/KB IDs to disk so subsequent runs skip creation."""
    STATE_FILE.write_text(json.dumps(state, indent=2))
    print(f"  ✓  State saved to {STATE_FILE}")


# ── Custom tool implementations ────────────────────────────────────────────────

def escalate_to_human(
    customer_id: str,
    issue_summary: str,
    priority: str,
    conversation_context: str = "",
) -> dict:
    """
    Escalate a customer issue to a human support agent.

    Use when the issue is too complex for automated resolution, the customer
    is frustrated or explicitly requests a human, or the matter involves
    security, legal concerns, or a refund above $500.

    Args:
        customer_id:          Customer's unique ID or email address.
        issue_summary:        2–3 sentence summary of the issue.
        priority:             One of: low, medium, high, urgent.
        conversation_context: Key context from the conversation so the human
                              agent does not need to ask the customer to repeat.

    Returns:
        Escalation confirmation with ticket ID, assigned agent, and ETA.
    """
    valid_priorities = {"low", "medium", "high", "urgent"}
    if priority not in valid_priorities:
        priority = "medium"

    ticket_id    = "ESC-" + "".join(random.choices(string.ascii_uppercase + string.digits, k=8))
    assigned_to  = random.choice(["Sarah K.", "James T.", "Priya M.", "Leo R."])
    created_at   = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")

    eta_minutes = {"low": 240, "medium": 60, "high": 20, "urgent": 5}[priority]
    eta_time    = (datetime.utcnow() + timedelta(minutes=eta_minutes)).strftime("%H:%M UTC")

    return {
        "status":        "escalated",
        "ticket_id":     ticket_id,
        "customer_id":   customer_id,
        "priority":      priority,
        "assigned_to":   assigned_to,
        "created_at":    created_at,
        "estimated_response": f"within {eta_minutes} minutes (by {eta_time})",
        "issue_summary": issue_summary,
        "message": (
            f"Ticket {ticket_id} created and assigned to {assigned_to}. "
            f"A human agent will reach out to {customer_id} within {eta_minutes} minutes."
        ),
    }


def process_refund(
    customer_id: str,
    order_id: str,
    refund_amount: float,
    reason: str,
    notes: str = "",
) -> dict:
    """
    Process a refund for a customer order.

    Applicable when the product was defective, order was not delivered,
    customer was incorrectly charged, or the return is within 30 days.
    Do NOT use for amounts over $500 — escalate to a human agent instead.

    Args:
        customer_id:    Customer's unique ID or email address.
        order_id:       Order ID to be refunded (e.g. ORD-00123456).
        refund_amount:  Amount to refund in USD. Must be > 0 and ≤ 500.
        reason:         One of: defective_product, not_delivered,
                        incorrect_charge, customer_changed_mind,
                        duplicate_order, other.
        notes:          Optional additional context.

    Returns:
        Refund confirmation with reference number and processing timeline.
    """
    if refund_amount <= 0:
        return {
            "status":  "rejected",
            "reason":  "Refund amount must be greater than $0.",
            "order_id": order_id,
        }

    if refund_amount > 500:
        return {
            "status":  "rejected",
            "reason":  (
                f"Refund of ${refund_amount:.2f} exceeds the $500 automated limit. "
                "Please escalate to a human agent using escalate_to_human."
            ),
            "order_id": order_id,
        }

    valid_reasons = {
        "defective_product", "not_delivered", "incorrect_charge",
        "customer_changed_mind", "duplicate_order", "other",
    }
    if reason not in valid_reasons:
        reason = "other"

    refund_ref   = "REF-" + "".join(random.choices(string.digits, k=10))
    initiated_at = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")

    processing_days = {"defective_product": 3, "not_delivered": 2, "incorrect_charge": 1}.get(reason, 5)
    expected_date   = (datetime.utcnow() + timedelta(days=processing_days)).strftime("%Y-%m-%d")

    return {
        "status":          "approved",
        "refund_ref":      refund_ref,
        "order_id":        order_id,
        "customer_id":     customer_id,
        "refund_amount":   f"${refund_amount:.2f}",
        "reason":          reason,
        "initiated_at":    initiated_at,
        "expected_by":     expected_date,
        "processing_days": processing_days,
        "message": (
            f"Refund of ${refund_amount:.2f} for order {order_id} has been approved "
            f"(ref: {refund_ref}). Funds will be returned to the original payment method "
            f"within {processing_days} business days (by {expected_date})."
        ),
    }


# ── Tool definitions ───────────────────────────────────────────────────────────

escalate_tool = Tool(
    name="escalate_to_human",
    description=(
        "Escalate a customer issue to a human support agent. Use when the issue is "
        "too complex for automated resolution, the customer is frustrated or requests "
        "a human, or the matter involves security, legal concerns, or a refund > $500."
    ),
    parameters={
        "type": "object",
        "properties": {
            "customer_id": {
                "type": "string",
                "description": "Customer's unique ID or email address",
            },
            "issue_summary": {
                "type": "string",
                "description": "2–3 sentence summary of the issue requiring human attention",
            },
            "priority": {
                "type": "string",
                "enum": ["low", "medium", "high", "urgent"],
                "description": (
                    "Escalation priority. Use 'urgent' for security issues, "
                    "payment failures, or data concerns."
                ),
            },
            "conversation_context": {
                "type": "string",
                "description": (
                    "Relevant context from the conversation so the human agent "
                    "does not need to ask the customer to repeat themselves"
                ),
            },
        },
        "required": ["customer_id", "issue_summary", "priority"],
    },
    function=escalate_to_human,
)

refund_tool = Tool(
    name="process_refund",
    description=(
        "Process a refund for a customer order. Use for defective products, "
        "undelivered orders, incorrect charges, or returns within 30 days. "
        "Refund amounts must be $500 or less — escalate larger amounts to a human agent."
    ),
    parameters={
        "type": "object",
        "properties": {
            "customer_id": {
                "type": "string",
                "description": "Customer's unique ID or email address",
            },
            "order_id": {
                "type": "string",
                "description": "The order ID to be refunded (e.g. ORD-00123456)",
            },
            "refund_amount": {
                "type": "number",
                "description": "Refund amount in USD. Must be > 0 and ≤ $500.",
            },
            "reason": {
                "type": "string",
                "enum": [
                    "defective_product",
                    "not_delivered",
                    "incorrect_charge",
                    "customer_changed_mind",
                    "duplicate_order",
                    "other",
                ],
                "description": "Reason category for the refund",
            },
            "notes": {
                "type": "string",
                "description": "Optional additional context about the refund",
            },
        },
        "required": ["customer_id", "order_id", "refund_amount", "reason"],
    },
    function=process_refund,
)


# ── Main setup ─────────────────────────────────────────────────────────────────

async def main():
    print("=" * 60)
    print("  Lyzr Customer Support Agent — ADK Setup")
    print("=" * 60)

    # Handle --recreate flag
    if FORCE_RECREATE and STATE_FILE.exists():
        STATE_FILE.unlink()
        print("\n  [--recreate] Cleared existing state. Creating fresh resources.\n")

    state  = load_state()
    studio = Studio(api_key=LYZR_API_KEY)

    # ── 1. Knowledge Base ──────────────────────────────────────────────────────
    if "kb_id" in state:
        print(f"\n[1/3] Reusing existing knowledge base: {state['kb_id']}")
        kb = await studio.aget_knowledge_base(state["kb_id"])
        print(f"  ✓  Knowledge base loaded.")
    else:
        print("\n[1/3] Creating knowledge base from customer support docs...")

        kb = await studio.acreate_knowledge_base(
            name="customer_support_kb",
            vector_store="qdrant",
            embedding_model="text-embedding-3-large",
            description=(
                "Customer support documentation: FAQ, product manual, "
                "getting started guide, troubleshooting guide, and release notes."
            ),
        )
        print(f"  ✓  Knowledge base created: {kb.id}")

        md_files = sorted(DOCS_DIR.glob("*.md"))
        if not md_files:
            raise FileNotFoundError(
                f"No .md files found in {DOCS_DIR}. "
                "Set DOCS_DIR env var to the correct path."
            )

        for md_path in md_files:
            content = md_path.read_text(encoding="utf-8")
            success = kb.add_text(content, source=md_path.stem)
            status  = "✓" if success else "✗"
            print(f"  {status}  Added: {md_path.name}")

        state["kb_id"] = kb.id
        save_state(state)

    # ── 2. Agent ───────────────────────────────────────────────────────────────
    if "agent_id" in state:
        print(f"\n[2/3] Reusing existing agent: {state['agent_id']}")
        agent = await studio.aget_agent(state["agent_id"])
        print(f"  ✓  Agent loaded.")
    else:
        print("\n[2/3] Creating customer support agent...")

        agent = await studio.acreate_agent(
            name="Customer Support Agent",
            provider="gpt-4o",
            description=(
                "AI-powered customer support agent. Answers product questions from "
                "documentation, processes refunds, escalates complex issues to human "
                "agents, and logs tickets in Notion."
            ),
            role=(
                "You are a knowledgeable, empathetic customer support specialist. "
                "You have access to full product documentation, can process refunds "
                "for eligible orders, escalate complex issues to human agents, create "
                "and manage support tickets in Notion, and search for information "
                "using Composio."
            ),
            goal=(
                "Resolve customer issues efficiently on the first contact. Use the "
                "knowledge base to answer product questions accurately. Process "
                "straightforward refunds directly. Escalate to a human agent when "
                "the issue is complex, the customer is frustrated, or the refund "
                "exceeds $500. Be transparent about every action you take."
            ),
            instructions=(
                "1. Fully understand the customer's issue before taking any action.\n"
                "2. For product or feature questions: always search the knowledge base first.\n"
                "3. For refund requests under $500: verify the reason qualifies, then "
                "call process_refund with the order ID and amount.\n"
                "4. For refund requests over $500 or disputed charges: call "
                "escalate_to_human with priority 'high' or 'urgent'.\n"
                "5. For unresolved technical issues: call escalate_to_human after "
                "exhausting knowledge base answers.\n"
                "6. After every escalation: create a Notion ticket logging the issue, "
                "customer ID, and escalation reason.\n"
                "7. Use composio_search to look up order history or account details.\n"
                "8. Always confirm with the customer before processing a refund or escalating.\n"
                "9. Keep responses concise, warm, and solution-focused."
            ),
            temperature=0.4,
            top_p=1.0,
            # Built-in ready tools (OAuth connected in Lyzr Studio)
            tools=["notion", "composio_search"],
            # tool_usage_description must be a JSON string mapping tool name → purpose.
            # Plain text causes Studio to render it as the first tool's description.
            tool_usage_description=json.dumps({
                "notion": (
                    "Create and manage support tickets. Log every escalated issue as a "
                    "Notion page with customer ID, issue summary, and escalation reason."
                ),
                "composio_search": (
                    "Search for order history, account information, and past support "
                    "tickets across connected applications."
                ),
            }),
            # Only specify tool_configs for tools whose tool_source is known.
            # Notion is OAuth-resolved server-side — omitting it here lets Studio
            # handle it automatically (adding it with wrong tool_source makes it vanish).
            tool_configs=[
                {
                    "tool_name": "composio_search",
                    "tool_source": "composio",
                    "action_names": [
                        "COMPOSIO_SEARCH_SEARCH",
                        "COMPOSIO_SEARCH_DUCK_DUCK_GO_SEARCH",
                        "COMPOSIO_SEARCH_NEWS_SEARCH",
                    ],
                },
            ],
        )
        print(f"  ✓  Agent created: {agent.id}")

        state["agent_id"] = agent.id
        save_state(state)

    # ── 3. Attach local tools ──────────────────────────────────────────────────
    print("\n[3/3] Attaching custom tools (local/in-process)...")

    agent.add_tool(escalate_tool)
    print(f"  ✓  Tool added: escalate_to_human")

    agent.add_tool(refund_tool)
    print(f"  ✓  Tool added: process_refund")

    # ── Summary ────────────────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("  Setup complete.")
    print("=" * 60)
    print(f"\n  Knowledge Base ID : {kb.id}")
    print(f"  Agent ID          : {agent.id}")
    print(f"\n  Server-side tools : {agent.tools}")
    print(f"  Local tools       : {[t.name for t in agent.get_tools()]}")
    print(
        "\n  NOTE: escalate_to_human and process_refund are local Python tools.\n"
        "  They only execute when called via agent.run_with_local_tools() in\n"
        "  this same process. They are not registered on Lyzr's servers and\n"
        "  will not be invoked through the Lyzr REST API or Studio chat UI.\n"
        "  To use them, extend this script with agent.run_with_local_tools()."
    )
    print()


if __name__ == "__main__":
    asyncio.run(main())
