#!/usr/bin/env python3
"""Minimal extractor for tickets/reporting/startups. No canvas, no fluff."""
import json
import re
import sys
import urllib.request
import urllib.error
from pathlib import Path

URL = "http://127.0.0.1:3845/mcp"
ROOT = Path(__file__).parent.parent
EXTRACT = ROOT / ".figma-extract"
CODE = EXTRACT / "code"
ASSETS = EXTRACT / "assets"

PAGES = {
    # Already extracted but partial / failed — re-run for completeness
    "ai_agent":        "2:30675",  # The #1 AI Agent (failed timeout previously)
    # NOTE: the old 2:32228 (ai_agent_slack) is gone; renumbered as one of the
    # new 2:18817 / 32:XXXXX entries below.
    # NOTE: original ai_agent_slack at 2:32228 was renumbered in the redesign;
    # user confirmed it lives at one of the new IDs below (likely 2:18817).
    # We'll match it by title metadata after extraction.
    "how_it_works":    "2:35355",  # AI tools that maximize productivity (only 1 section last time)
    "tickets":         "2:1392",   # Tickets that continue the conversation (4 sections failed at end of rate limit)
    # Rate-limited yesterday
    "reporting":       "2:3801",   # Get instant insights with AI reporting
    "startups":        "2:7722",   # Startups get 90% off
    # NEW pages user added (names TBD — run extract first then rename based on title in metadata)
    "page_2_18817":    "2:18817",
    "page_32_13227":   "32:13227",
    "page_32_13982":   "32:13982",
    "page_32_14697":   "32:14697",
    "page_32_15409":   "32:15409",
    "page_32_16407":   "32:16407",
    "page_32_17633":   "32:17633",
}
ASSET_RE = re.compile(r'http://localhost:3845/assets/([a-f0-9]+)\.([a-z]+)')


def log(m):
    print(m, flush=True)


def post(payload, sid=None, timeout=120):
    headers = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream"}
    if sid: headers["Mcp-Session-Id"] = sid
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(URL, data=body, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.headers.get("mcp-session-id") or sid, resp.read().decode("utf-8", errors="replace")


def parse_sse(raw):
    last = None
    for line in raw.splitlines():
        if line.startswith("data: "): last = line[6:]
    if last is None:
        try: return json.loads(raw)
        except: return None
    try: return json.loads(last)
    except: return None


def init():
    sid, body = post({
        "jsonrpc": "2.0", "id": 1, "method": "initialize",
        "params": {"protocolVersion": "2024-11-05", "capabilities": {},
                   "clientInfo": {"name": "x", "version": "1"}},
    }, timeout=15)
    post({"jsonrpc": "2.0", "method": "notifications/initialized"}, sid=sid, timeout=10)
    return sid


def call(sid, node_id):
    sid2, body = post({
        "jsonrpc": "2.0", "id": 100, "method": "tools/call",
        "params": {"name": "get_design_context", "arguments": {
            "nodeId": node_id, "clientFrameworks": "react", "clientLanguages": "typescript,javascript,css"
        }},
    }, sid=sid)
    r = parse_sse(body) if body else None
    if r and "result" in r:
        c = r["result"].get("content", [])
        if c and c[0].get("type") == "text":
            return c[0].get("text", "")
    return ""


def is_bad(t): return not t or len(t) < 50 or "MCP server is only available" in t[:300]


def get_assets(text):
    for h, ext in set(ASSET_RE.findall(text)):
        local = ASSETS / f"{h}.{ext}"
        if local.exists(): continue
        try:
            with urllib.request.urlopen(f"http://localhost:3845/assets/{h}.{ext}", timeout=15) as r:
                local.write_bytes(r.read())
        except: pass


def main():
    sid = init()
    log(f"sid={sid}")
    for page_name, page_id in PAGES.items():
        page_dir = CODE / page_name
        page_dir.mkdir(parents=True, exist_ok=True)

        log(f"\n=== {page_name} ({page_id}) ===")

        # Section metadata
        try:
            log(f"  [1/3] section metadata...")
            sec_text = call(sid, page_id)
        except Exception as e:
            log(f"    EXC: {e}")
            try: sid = init(); log(f"    reinit: {sid}")
            except: continue
            continue
        if is_bad(sec_text):
            log(f"  FAIL section: {sec_text[:200] if sec_text else 'empty'}")
            continue
        (page_dir / "_section_metadata.xml").write_text(sec_text, encoding="utf-8")

        # Find inner frame
        m = re.search(r'<frame id="([^"]+)" name="1440w default"', sec_text)
        if not m:
            log("  FAIL: no inner frame")
            continue
        inner = m.group(1)
        log(f"    inner: {inner}")

        # Inner metadata
        try:
            log(f"  [2/3] inner metadata...")
            inner_text = call(sid, inner)
        except Exception as e:
            log(f"    EXC: {e}")
            continue
        if is_bad(inner_text):
            log(f"  FAIL inner")
            continue
        (page_dir / "_inner_metadata.xml").write_text(inner_text, encoding="utf-8")

        # Find sections
        sections = re.findall(
            r'<frame id="([^"]+)" name="(section\.[^"]+)" x="[^"]+" y="[^"]+" width="([^"]+)" height="([^"]+)"',
            inner_text)
        log(f"    {len(sections)} sections found")

        log(f"  [3/3] extracting {len(sections)} sections...")
        for i, (sid_node, sname, w, h) in enumerate(sections, 1):
            log(f"    [{i}/{len(sections)}] {sid_node} {sname} {int(float(w))}x{int(float(h))}")
            try:
                text = call(sid, sid_node)
            except Exception as e:
                log(f"      EXC: {e}")
                try: sid = init(); log(f"      reinit: {sid}")
                except: pass
                continue
            if is_bad(text):
                log(f"      FAIL")
                continue
            sf = page_dir / f"section_{i:02d}_{sid_node.replace(':','-')}.jsx"
            sf.write_text(text, encoding="utf-8")
            get_assets(text)
            log(f"      OK ({len(text):,} chars)")

    log("\nDONE")


if __name__ == "__main__":
    main()
