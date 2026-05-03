#!/usr/bin/env python3
"""
Resolve all <Component variant="X" /> stubs in extracted Figma JSX.

Each <Component> in the extracted JSX is wrapped by a parent div with
data-node-id="X:Y" and data-name="..." (e.g., Discord, API, etc.). These
parent IDs are unique Figma instances we can call get_design_context on
to get the actual code for that icon/button.

Strategy:
  1. Scan all section_*.json files (raw MCP responses contain full JSX
     incl. data-node-id attributes that may have been simplified in .jsx).
  2. Build a list of unique parent node IDs whose subtree contains <Component>.
  3. Extract each in parallel (up to N workers) via the local MCP server.
  4. Save each as .figma-extract/components/<nodeId>.jsx and a manifest.
"""
import json
import re
import sys
import urllib.request
import urllib.error
import threading
import queue
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed

URL = "http://127.0.0.1:3845/mcp"
ROOT = Path(__file__).parent.parent
EXTRACT = ROOT / ".figma-extract"
CODE = EXTRACT / "code"
COMPONENTS = EXTRACT / "components"
COMPONENTS.mkdir(parents=True, exist_ok=True)
ASSETS = EXTRACT / "assets"


# --- MCP transport (local Figma desktop) ---
session_lock = threading.Lock()
session_id = None


def post(payload, sid=None, timeout=600):
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
    }
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
            return {"_raw": raw[:500]}
    try:
        return json.loads(last)
    except Exception:
        return {"_raw": last[:500]}


def init_session():
    global session_id
    with session_lock:
        if session_id:
            return session_id
        sid, body, code = post({
            "jsonrpc": "2.0", "id": 1, "method": "initialize",
            "params": {"protocolVersion": "2024-11-05", "capabilities": {},
                       "clientInfo": {"name": "figma-resolve-components.py", "version": "1.0"}},
        })
        if code != 200 or not sid:
            raise RuntimeError(f"init failed: {code}")
        post({"jsonrpc": "2.0", "method": "notifications/initialized"}, sid=sid)
        session_id = sid
        return sid


def get_design_context(node_id):
    sid = init_session()
    sid2, body, code = post({
        "jsonrpc": "2.0", "id": 100, "method": "tools/call",
        "params": {"name": "get_design_context", "arguments": {
            "nodeId": node_id,
            "clientFrameworks": "react",
            "clientLanguages": "typescript,javascript,css",
        }},
    }, sid=sid, timeout=300)
    return parse_sse(body)


# --- Asset download helper ---
ASSET_RE = re.compile(r'http://localhost:3845/assets/([a-f0-9]+)\.([a-z]+)')


def download_assets(text):
    for h, ext in set(ASSET_RE.findall(text)):
        local = ASSETS / f"{h}.{ext}"
        if local.exists():
            continue
        try:
            with urllib.request.urlopen(f"http://localhost:3845/assets/{h}.{ext}", timeout=30) as r:
                local.write_bytes(r.read())
        except Exception:
            pass


# --- Find Component parents in extracted code ---
def find_component_parents():
    """Walk all extracted .jsx files, find <div data-node-id="X:Y" data-name="...">
    that contains <Component variant="..." />. Returns set of (nodeId, name)."""
    parents = {}  # nodeId -> name (use map for dedup)
    for code_dir in sorted(CODE.iterdir()):
        if not code_dir.is_dir():
            continue
        for jf in sorted(code_dir.glob("section_*.jsx")):
            try:
                text = jf.read_text(encoding="utf-8")
            except Exception:
                continue
            # Find each <Component> ref. Walk back to find the parent div with data-node-id.
            # Pattern: parent div opening tag, then content, then <Component
            # We use a simpler regex: any `data-node-id="X:Y" data-name="..."` followed by Component before closing
            for m in re.finditer(
                r'data-node-id="([^"]+)"[^>]*data-name="([^"]+)"[^>]*>\s*\n[^<]*<Component\b',
                text,
            ):
                nid, name = m.group(1), m.group(2)
                # Skip page-section ids (they don't represent reusable components)
                if nid.startswith('I') or ':' in nid:
                    parents[nid] = name
    return parents


def extract_component(node_id, name):
    """Extract a single component. Returns dict with content."""
    try:
        result = get_design_context(node_id)
        content = result.get("result", {}).get("content", [])
        text = content[0]["text"] if content and content[0].get("type") == "text" else ""
        if not text:
            return {"id": node_id, "name": name, "ok": False, "error": "empty"}
        # Save
        safe_id = node_id.replace(":", "-")
        out_path = COMPONENTS / f"{safe_id}.jsx"
        out_path.write_text(text, encoding="utf-8")
        # Download assets
        download_assets(text)
        return {"id": node_id, "name": name, "ok": True, "size": len(text), "path": str(out_path)}
    except Exception as e:
        return {"id": node_id, "name": name, "ok": False, "error": str(e)}


def main():
    print("=== Finding component parents ===")
    parents = find_component_parents()
    print(f"Found {len(parents)} unique Figma component instances")

    if not parents:
        print("Nothing to extract.")
        return

    # Save manifest
    manifest = sorted(parents.items())
    (COMPONENTS / "_manifest.json").write_text(
        json.dumps([{"id": k, "name": v} for k, v in manifest], indent=2, ensure_ascii=False),
        encoding="utf-8")

    print(f"\n=== Extracting {len(parents)} components in parallel ===")
    init_session()  # warm up

    workers = 6  # MCP server is single-threaded but let's overlap network IO
    done, failed = 0, 0
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futures = {ex.submit(extract_component, nid, name): (nid, name) for nid, name in manifest}
        for fut in as_completed(futures):
            res = fut.result()
            nid, name = res["id"], res["name"]
            if res["ok"]:
                done += 1
                print(f"  OK  {nid:>10s} {name[:30]:<30s} ({res['size']:,} chars)")
            else:
                failed += 1
                print(f"  FAIL {nid:>10s} {name[:30]:<30s} {res.get('error','?')[:80]}")
    print(f"\nDone: {done} OK, {failed} failed")


if __name__ == "__main__":
    main()
