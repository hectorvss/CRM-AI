#!/usr/bin/env python3
"""Re-extract pages that came out incomplete or empty.

Fixes from `figma-extract-3pages.py`:
  - Section regex now matches `section#name` AND `section.class` (the new
    pages use `#` instead of `.`).
  - Reuses cached metadata if present (skips MCP calls already done).
  - Skips section JSX files already extracted (idempotent).
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

# Pages that need full or partial re-extraction
PAGES = {
    "ai_agent":        "2:30675",
    "ai_agent_slack":  "2:32228",
    "how_it_works":    "2:35355",
    "page_2_18817":    "2:18817",
    "page_32_13227":   "32:13227",  # agent_trust
    "page_32_13982":   "32:13982",  # agent_customer
    "page_32_14697":   "32:14697",  # copilot
    "page_32_15409":   "32:15409",  # how agent works
}

ASSET_RE = re.compile(r'http://localhost:3845/assets/([a-f0-9]+)\.([a-z]+)')
# Match section.foo OR section#foo
SECTION_RE = re.compile(
    r'<frame id="([^"]+)" name="(section[#.][^"]+)" x="[^"]+" y="[^"]+" width="([^"]+)" height="([^"]+)"'
)


def log(m):
    print(m, flush=True)


def post(payload, sid=None, timeout=120):
    headers = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream"}
    if sid:
        headers["Mcp-Session-Id"] = sid
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(URL, data=body, headers=headers, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        return resp.headers.get("mcp-session-id") or sid, resp.read().decode("utf-8", errors="replace")


def parse_sse(raw):
    last = None
    for line in raw.splitlines():
        if line.startswith("data: "):
            last = line[6:]
    if last is None:
        try:
            return json.loads(raw)
        except Exception:
            return None
    try:
        return json.loads(last)
    except Exception:
        return None


def init():
    sid, _ = post({
        "jsonrpc": "2.0", "id": 1, "method": "initialize",
        "params": {"protocolVersion": "2024-11-05", "capabilities": {},
                   "clientInfo": {"name": "x", "version": "1"}},
    }, timeout=15)
    post({"jsonrpc": "2.0", "method": "notifications/initialized"}, sid=sid, timeout=10)
    return sid


def call(sid, node_id):
    _, body = post({
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


def is_bad(t):
    return not t or len(t) < 50 or "MCP server is only available" in t[:300]


def get_assets(text):
    for h, ext in set(ASSET_RE.findall(text)):
        local = ASSETS / f"{h}.{ext}"
        if local.exists():
            continue
        try:
            with urllib.request.urlopen(f"http://localhost:3845/assets/{h}.{ext}", timeout=15) as r:
                local.write_bytes(r.read())
        except Exception:
            pass


def main():
    sid = init()
    log(f"sid={sid}")
    for page_name, page_id in PAGES.items():
        page_dir = CODE / page_name
        page_dir.mkdir(parents=True, exist_ok=True)

        log(f"\n=== {page_name} ({page_id}) ===")

        # Section metadata — reuse cache if exists
        sec_path = page_dir / "_section_metadata.xml"
        if sec_path.exists() and sec_path.stat().st_size > 200:
            sec_text = sec_path.read_text(encoding="utf-8")
            log("  [1/3] using cached section metadata")
        else:
            try:
                log("  [1/3] section metadata...")
                sec_text = call(sid, page_id)
            except Exception as e:
                log(f"    EXC: {e}")
                try:
                    sid = init()
                    log(f"    reinit: {sid}")
                except Exception:
                    pass
                continue
            if is_bad(sec_text):
                log(f"  FAIL section: {sec_text[:200] if sec_text else 'empty'}")
                continue
            sec_path.write_text(sec_text, encoding="utf-8")

        # Find inner frame
        m = re.search(r'<frame id="([^"]+)" name="1440w default"', sec_text)
        if not m:
            log("  FAIL: no inner frame")
            continue
        inner = m.group(1)
        log(f"    inner: {inner}")

        # Inner metadata — reuse cache
        inner_path = page_dir / "_inner_metadata.xml"
        if inner_path.exists() and inner_path.stat().st_size > 200:
            inner_text = inner_path.read_text(encoding="utf-8")
            log("  [2/3] using cached inner metadata")
        else:
            try:
                log("  [2/3] inner metadata...")
                inner_text = call(sid, inner)
            except Exception as e:
                log(f"    EXC: {e}")
                continue
            if is_bad(inner_text):
                log("  FAIL inner")
                continue
            inner_path.write_text(inner_text, encoding="utf-8")

        # Find sections (handles both `section.foo` and `section#foo`)
        sections = SECTION_RE.findall(inner_text)
        log(f"    {len(sections)} sections found")

        log(f"  [3/3] extracting {len(sections)} sections...")
        for i, (sid_node, sname, w, h) in enumerate(sections, 1):
            sf = page_dir / f"section_{i:02d}_{sid_node.replace(':', '-')}.jsx"
            if sf.exists() and sf.stat().st_size > 200:
                log(f"    [{i}/{len(sections)}] SKIP (already extracted) {sname}")
                continue
            log(f"    [{i}/{len(sections)}] {sid_node} {sname} {int(float(w))}x{int(float(h))}")
            try:
                text = call(sid, sid_node)
            except Exception as e:
                log(f"      EXC: {e}")
                try:
                    sid = init()
                    log(f"      reinit: {sid}")
                except Exception:
                    pass
                continue
            if is_bad(text):
                log("      FAIL")
                continue
            sf.write_text(text, encoding="utf-8")
            get_assets(text)
            log(f"      OK ({len(text):,} chars)")

    log("\nDONE")


if __name__ == "__main__":
    main()
