#!/usr/bin/env python3
"""Extract the Figma `header#shared-header` node (2:33898) into nav.jsx."""
import json
import re
import urllib.request
from pathlib import Path

URL = "http://127.0.0.1:3845/mcp"
ROOT = Path(__file__).parent.parent
EXTRACT = ROOT / ".figma-extract"
OUT = EXTRACT / "code" / "_nav.jsx"
NODE_ID = "2:33898"


def post(payload, sid=None, timeout=240):
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


def main():
    sid, _ = post({
        "jsonrpc": "2.0", "id": 1, "method": "initialize",
        "params": {"protocolVersion": "2024-11-05", "capabilities": {},
                   "clientInfo": {"name": "x", "version": "1"}},
    }, timeout=15)
    post({"jsonrpc": "2.0", "method": "notifications/initialized"}, sid=sid, timeout=10)
    print(f"sid={sid}")

    print(f"FETCH {NODE_ID}")
    _, body = post({
        "jsonrpc": "2.0", "id": 100, "method": "tools/call",
        "params": {"name": "get_design_context", "arguments": {
            "nodeId": NODE_ID, "clientFrameworks": "react",
            "clientLanguages": "typescript,javascript,css"
        }},
    }, sid=sid, timeout=240)
    r = parse_sse(body) if body else None
    if not r or "result" not in r:
        print("FAIL: no result")
        return
    text = r["result"].get("content", [{}])[0].get("text", "")
    if not text or len(text) < 100:
        print(f"FAIL: short response: {text[:200]}")
        return
    OUT.write_text(text, encoding="utf-8")
    print(f"OK -> {OUT} ({len(text):,} chars)")


if __name__ == "__main__":
    main()
