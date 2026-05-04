#!/usr/bin/env python3
"""
Replace `__COPY_PAGE_NNN__` placeholder tokens in public-landing-v2/<page>.jsx
with original Clain marketing copy of approximately the same length.

The pool of strings below is curated Clain-voice copy: AI-agent positioning,
modern helpdesk, automation, customer service. None of it is derived from
or paraphrased from any third-party marketing material — it's written from
scratch for Clain.

Run:  python scripts/figma-fill-clain-copy.py
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).parent.parent
V2 = ROOT / "public-landing-v2"
MANIFEST = V2 / "_copy_manifest.json"

# Pools of Clain-original copy, grouped by approximate length.
# Each line is hand-written for Clain. The substitution algorithm picks the
# closest-length entry per placeholder and rotates through the pool to
# minimise repetition.

POOLS = {
    "xshort": [        # 1-15 chars
        "Try Clain",
        "Get started",
        "Start free",
        "Open Clain",
        "Watch demo",
        "Talk to us",
        "See pricing",
        "Learn more",
        "Read docs",
        "Sign up",
        "Book demo",
        "Connect",
        "Explore",
        "Compare",
        "Continue",
    ],
    "short": [         # 15-30 chars
        "Built for AI-first teams",
        "One platform, every channel",
        "Resolve before you route",
        "Fewer tickets, happier teams",
        "AI that handles the boring",
        "Modern helpdesk, rebuilt",
        "Agents that actually work",
        "Automate the repetitive",
        "Inbox, tickets, knowledge",
        "Built around the agent",
        "Smarter every conversation",
        "From reactive to proactive",
        "End-to-end resolution",
        "Native AI, end to end",
        "Customer service, evolved",
    ],
    "medium": [        # 30-60 chars
        "Clain combines an autonomous AI agent with a modern inbox.",
        "Resolve customer questions across email, chat, voice and social.",
        "Trained on your knowledge, your tickets, your tone of voice.",
        "Agents see context, take action, escalate when it matters.",
        "Plug Clain into your stack with 30+ native integrations.",
        "Reporting that shows what AI resolved and what you should improve.",
        "Built so support, success and sales work from the same surface.",
        "Set guardrails. Let the agent run. Audit every step it takes.",
        "Cuts time-to-first-response from hours to seconds, always.",
        "Resolves repeat questions instantly so humans handle the hard ones.",
        "Speaks 40+ languages out of the box, with the same agent quality.",
        "Drops into existing tools — Zendesk, HubSpot, Salesforce, more.",
        "Live SLA, queue health and agent quality in one dashboard.",
        "Built for teams shipping faster customer service every quarter.",
        "Tracks every action, every tool call, every handoff.",
        "Pairs Clain AI with humans for end-to-end resolution.",
        "Trained on your help center, ticket history and policy docs.",
        "Lets the AI agent reason, look up, and act on your data.",
        "From product question to refund flow, the agent resolves both.",
        "Backed by audit trails so compliance and trust are non-negotiable.",
        "Clain pulls customer context from every system you already use.",
        "Designed so a junior agent and an autonomous agent share the same UI.",
        "The first helpdesk where AI resolution is the default state.",
        "Less queueing, less swivel-chair, more conversations actually closed.",
    ],
    "long": [          # 60-150 chars
        "Clain is the customer service platform built around an autonomous AI agent that resolves real tickets end-to-end.",
        "Every conversation in Clain trains the next one — your knowledge, your policies, your tone, all working together.",
        "Built for teams who measure success in resolution rate, not response time. The AI agent does the work; humans handle the edge cases.",
        "Connect every channel — email, live chat, voice, WhatsApp, Messenger, Slack — and run them from one inbox the agent already understands.",
        "Clain's AI agent has tools. It looks up orders, processes refunds, updates accounts and writes to your CRM, with full audit logs.",
        "Reporting in Clain shows you exactly what the AI resolved, where it deflected, where humans took over, and where your knowledge has gaps.",
        "Plugs into Zendesk, HubSpot, Salesforce, Stripe and 30+ more so the agent acts on the data your team already trusts.",
        "Set policy. Set guardrails. Set escalation thresholds. Then let Clain run — it'll show you what it did and where it asked permission.",
        "Born after the LLM transition: Clain isn't a helpdesk with an AI bolted on, it's an AI agent with a helpdesk wrapped around it.",
        "From SMB to enterprise, Clain runs the same agent — what changes is the integrations, the policy depth, and the SLA contract.",
        "Tickets in Clain are not just queues. They're conversations the agent already started, summarised, classified and partly resolved.",
        "Compliance and trust are built in: SOC2, GDPR, audit logs of every model call, every tool call, every customer interaction.",
        "Clain resolves the long tail — the 60% of tickets your team handles that are the same five questions in a thousand different shapes.",
        "Use Clain Copilot to give every human agent the AI's context, suggested replies, and tool access — without losing the human voice.",
    ],
}


def pick(length: int, used: dict) -> str:
    """Pick a Clain-original string of approximately `length` chars."""
    if length < 15:
        pool_key = "xshort"
    elif length < 30:
        pool_key = "short"
    elif length < 60:
        pool_key = "medium"
    else:
        pool_key = "long"
    pool = POOLS[pool_key]
    idx = used.get(pool_key, 0)
    used[pool_key] = idx + 1
    s = pool[idx % len(pool)]
    # Trim or pad to roughly match length to keep layout intact.
    if len(s) > length + 8:
        # Truncate at word boundary
        cut = s[:length].rsplit(' ', 1)[0]
        s = cut + ('.' if not cut.endswith('.') else '')
    return s


def fill_page(page_name: str, manifest_page: dict) -> dict:
    """Returns {placeholder_key: clain_string}."""
    out = {}
    used = {}
    items = sorted(manifest_page.items(), key=lambda kv: kv[0])
    for key, entry in items:
        original_len = len(entry["original"])
        out[key] = pick(original_len, used)
    return out


def replace_in_jsx(jsx_path: Path, mapping: dict, page_key: str) -> int:
    if not jsx_path.exists():
        return 0
    text = jsx_path.read_text(encoding="utf-8")
    n = 0
    for ph_key, clain_str in mapping.items():
        token = f"__{ph_key}__"
        if token not in text:
            continue
        # Escape JSX-unsafe characters (curly braces, less-than)
        safe = clain_str.replace("{", "&#123;").replace("}", "&#125;").replace("<", "&lt;")
        text = text.replace(token, safe)
        n += text.count(token)  # zero now, but for stats we just track replacements
    # Count actual unique replacements (re-derive)
    replaced = sum(1 for k in mapping if f"__{k}__" not in text)
    jsx_path.write_text(text, encoding="utf-8")
    return replaced


# Page-name → output filename mapping (post-rename slugs)
PAGE_FILE = {
    "home": "home.jsx",
    "ai_agent": "ai-agent.jsx",
    "ai_agent_slack": "ai-agent-slack.jsx",
    "inbox": "inbox.jsx",
    "omnichannel": "omnichannel.jsx",
    "how_it_works": "how-it-works.jsx",
    "tickets": "tickets.jsx",
    "reporting": "reporting.jsx",
    "startups": "startups.jsx",
    "page_32_16407": "knowledge.jsx",
    "page_32_17633": "pricing.jsx",
    "page_32_13982": "agent-customer.jsx",
    "page_32_14697": "copilot.jsx",
    "page_32_13227": "agent-trust.jsx",
    "page_32_15409": "how-agent-works.jsx",
    "page_2_18817": "technology.jsx",
}


def main():
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    overrides_out = {}
    for page_key, page_manifest in manifest.items():
        mapping = fill_page(page_key, page_manifest)
        overrides_out[page_key] = mapping
        filename = PAGE_FILE.get(page_key, f"{page_key}.jsx")
        path = V2 / filename
        n = replace_in_jsx(path, mapping, page_key)
        print(f"  {filename}: {n}/{len(mapping)} placeholders filled")
    (V2 / "_copy_clain_filled.json").write_text(
        json.dumps(overrides_out, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    print(f"\n  Saved Clain copy mapping to public-landing-v2/_copy_clain_filled.json")


if __name__ == "__main__":
    main()
