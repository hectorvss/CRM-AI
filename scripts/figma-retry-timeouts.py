#!/usr/bin/env python3
"""Retry specific section IDs that timed out, with a longer per-call deadline.

Designed to run in parallel with figma-extract-missing.py — they share the
filesystem so each writes its own section file. Idempotent: skips files
that already exist.
"""
import json
import re
import urllib.request
from pathlib import Path

URL = "http://127.0.0.1:3845/mcp"
ROOT = Path(__file__).parent.parent
EXTRACT = ROOT / ".figma-extract"
CODE = EXTRACT / "code"
ASSETS = EXTRACT / "assets"

# (page_dir, section_index, node_id, name)
TARGETS = [
    ("page_2_18817", 6, "2:29856", "section#ai-team"),
    ("page_2_18817", 7, "2:30006", "section#pricing"),
    ("page_32_13227", 1, "32:13250", "section#partnership"),
    ("page_32_13227", 3, "32:13374", "section#trust"),
    ("page_32_13227", 4, "32:13409", "section#security-and-privacy"),
    ("page_32_13227", 5, "32:13506", "section#reliability-and-scale"),
    ("page_32_13227", 6, "32:13543", "section#guarantee"),
    ("page_32_15409", 1, "32:15466", "section#train"),
    ("page_32_15409", 2, "32:15549", "section#test"),
    ("page_32_15409", 3, "32:15629", "section#deploy"),
    ("page_32_15409", 4, "32:15780", "section#analyze"),
    ("page_32_15409", 5, "32:15854", "section#faqs"),
]

ASSET_RE = re.compile(r'http://localhost:3845/assets/([a-f0-9]+)\.([a-z]+)')


def post(payload, sid=None, timeout=360):
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
    sid, _ = post({
        "jsonrpc": "2.0", "id": 1, "method": "initialize",
        "params": {"protocolVersion": "2024-11-05", "capabilities": {},
                   "clientInfo": {"name": "x", "version": "1"}},
    }, timeout=15)
    post({"jsonrpc": "2.0", "method": "notifications/initialized"}, sid=sid, timeout=10)
    return sid


def call(sid, node_id, timeout=360):
    _, body = post({
        "jsonrpc": "2.0", "id": 100, "method": "tools/call",
        "params": {"name": "get_design_context", "arguments": {
            "nodeId": node_id, "clientFrameworks": "react", "clientLanguages": "typescript,javascript,css"
        }},
    }, sid=sid, timeout=timeout)
    r = parse_sse(body) if body else None
    if r and "result" in r:
        c = r["result"].get("content", [])
        if c and c[0].get("type") == "text":
            return c[0].get("text", "")
    return ""


def get_assets(text):
    for h, ext in set(ASSET_RE.findall(text)):
        local = ASSETS / f"{h}.{ext}"
        if local.exists(): continue
        try:
            with urllib.request.urlopen(f"http://localhost:3845/assets/{h}.{ext}", timeout=15) as r:
                local.write_bytes(r.read())
        except: pass


def log(m): print(m, flush=True)


def main():
    sid = init()
    log(f"sid={sid}")
    for page_dir, idx, node_id, name in TARGETS:
        sf = CODE / page_dir / f"section_{idx:02d}_{node_id.replace(':','-')}.jsx"
        if sf.exists() and sf.stat().st_size > 200:
            log(f"SKIP {page_dir}/{sf.name}")
            continue
        log(f"FETCH {page_dir} #{idx} {node_id} ({name}) timeout=360s")
        try:
            text = call(sid, node_id, timeout=360)
        except Exception as e:
            log(f"  EXC: {e}")
            try:
                sid = init(); log(f"  reinit: {sid}")
                text = call(sid, node_id, timeout=360)
            except Exception as e2:
                log(f"  EXC2: {e2}")
                continue
        if not text or len(text) < 50:
            log("  FAIL (empty)")
            continue
        sf.write_text(text, encoding="utf-8")
        get_assets(text)
        log(f"  OK ({len(text):,} chars) → {sf.name}")
    log("DONE")


if __name__ == "__main__":
    main()
