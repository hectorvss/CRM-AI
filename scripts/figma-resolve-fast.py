#!/usr/bin/env python3
"""
Fast & forgiving component extractor.

Strategy (different from figma-resolve-components.py):
- SEQUENTIAL (no parallel workers — MCP server can't really parallelize and they
  block each other and the server)
- Short per-call timeout (60 s). If a call hangs, abort and move on.
- Skip components already extracted. Resume from where we left off.
- Print progress AFTER EVERY CALL with explicit flush so we can monitor it.
- One MCP session reused across calls (avoid reinit overhead).
"""
import json
import re
import sys
import urllib.request
import urllib.error
from pathlib import Path

URL = "http://127.0.0.1:3845/mcp"
ROOT = Path(__file__).parent.parent
EXTRACT = ROOT / ".figma-extract"
COMPONENTS = EXTRACT / "components"
COMPONENTS.mkdir(parents=True, exist_ok=True)
ASSETS = EXTRACT / "assets"

CALL_TIMEOUT = 60  # seconds per single MCP call


def log(msg):
    print(msg, flush=True)


def post(payload, sid=None, timeout=CALL_TIMEOUT):
    headers = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream"}
    if sid:
        headers["Mcp-Session-Id"] = sid
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(URL, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            sid_out = resp.headers.get("mcp-session-id") or sid
            return sid_out, resp.read().decode("utf-8", errors="replace"), resp.getcode()
    except urllib.error.HTTPError as e:
        return sid, e.read().decode("utf-8", errors="replace"), e.code


def parse_sse(raw):
    last = None
    for line in raw.splitlines():
        if line.startswith("data: "):
            last = line[len("data: "):]
    if last is None:
        try:
            return json.loads(raw)
        except Exception:
            return None
    try:
        return json.loads(last)
    except Exception:
        return None


def init_session():
    sid, body, code = post({
        "jsonrpc": "2.0", "id": 1, "method": "initialize",
        "params": {"protocolVersion": "2024-11-05", "capabilities": {},
                   "clientInfo": {"name": "figma-resolve-fast", "version": "1.0"}},
    }, timeout=15)
    if code != 200 or not sid:
        raise RuntimeError(f"init failed: {code}")
    post({"jsonrpc": "2.0", "method": "notifications/initialized"}, sid=sid, timeout=10)
    return sid


def get_design_context(sid, node_id):
    sid2, body, code = post({
        "jsonrpc": "2.0", "id": 100, "method": "tools/call",
        "params": {"name": "get_design_context", "arguments": {
            "nodeId": node_id,
            "clientFrameworks": "react",
            "clientLanguages": "typescript,javascript,css",
        }},
    }, sid=sid)
    return parse_sse(body) if body else None


ASSET_RE = re.compile(r'http://localhost:3845/assets/([a-f0-9]+)\.([a-z]+)')


def download_assets(text):
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
    manifest_path = COMPONENTS / "_manifest.json"
    if not manifest_path.exists():
        log("ERROR: no manifest. Run figma-resolve-components.py first to generate manifest.")
        sys.exit(1)

    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    log(f"Manifest: {len(manifest)} components")

    # Skip already done
    already = {p.stem.replace("-", ":") for p in COMPONENTS.glob("*.jsx") if p.stem != "_manifest"}
    pending = [m for m in manifest if m["id"] not in already]
    log(f"Already extracted: {len(already)} — pending: {len(pending)}")

    if not pending:
        log("Nothing to do.")
        return

    sid = init_session()
    log(f"Session: {sid}")

    ok = fail = 0
    for idx, item in enumerate(pending, 1):
        nid = item["id"]
        name = item["name"]
        log(f"[{idx}/{len(pending)}] {nid:>10s} {name[:30]:<30s} ...")
        try:
            result = get_design_context(sid, nid)
            if not result or "result" not in result:
                fail += 1
                log(f"  FAIL: no result")
                continue
            content = result["result"].get("content", [])
            text = content[0]["text"] if content and content[0].get("type") == "text" else ""
            if not text:
                fail += 1
                log(f"  FAIL: empty content")
                continue
            safe = nid.replace(":", "-")
            (COMPONENTS / f"{safe}.jsx").write_text(text, encoding="utf-8")
            download_assets(text)
            ok += 1
            log(f"  OK ({len(text):,} chars)")
        except urllib.error.URLError as e:
            fail += 1
            log(f"  TIMEOUT/URLError: {e}")
            # If session died, try to reinit
            try:
                sid = init_session()
                log(f"  reinitialized session: {sid}")
            except Exception as e2:
                log(f"  could NOT reinit, aborting: {e2}")
                break
        except Exception as e:
            fail += 1
            log(f"  EXC: {e}")

    log(f"\nDone: {ok} OK, {fail} failed (of {len(pending)} attempted)")


if __name__ == "__main__":
    main()
