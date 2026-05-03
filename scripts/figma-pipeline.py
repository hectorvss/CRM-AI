#!/usr/bin/env python3
"""
End-to-end Figma extraction pipeline.

For each page (frame ID), it:
  1. Calls get_design_context to get the metadata (top-level frame is too big for code)
  2. Parses metadata to find all 'section.*' frames at the lowest depth
  3. Calls get_design_context on each section to get JSX + asset URLs
  4. Downloads all unique assets to .figma-extract/assets/
  5. Saves per-section JSX into .figma-extract/code/<page>/section_NN.jsx
  6. Saves a stitched page file into .figma-extract/code/<page>.jsx (commented sections concat)

The JSON-RPC calls go directly to http://127.0.0.1:3845/mcp (Figma desktop MCP),
bypassing Claude's extension.
"""
import json
import os
import re
import sys
import urllib.request
import urllib.error
from pathlib import Path

URL = "http://127.0.0.1:3845/mcp"
ROOT = Path(__file__).parent.parent
EXTRACT = ROOT / ".figma-extract"
ASSETS = EXTRACT / "assets"
CODE = EXTRACT / "code"
ASSETS.mkdir(parents=True, exist_ok=True)
CODE.mkdir(parents=True, exist_ok=True)

# Pages to extract — name → top-level frame id (NOT the section!).
# Each page is wrapped in a "1440w default" frame inside the section.
PAGES = {
    "home":          "2:32777",   # inside section "home" (2:33992)
    # The other 8 pages — frame IDs need to be looked up from metadata first.
    # We'll resolve them in --discover mode.
}

SECTION_PAGES = {
    "home":          "2:33992",
    "ai_agent":      "2:30675",
    "ai_agent_slack":"2:32228",
    "inbox":         "2:6389",
    "omnichannel":   "2:5021",
    "how_it_works":  "2:35355",
    "tickets":       "2:1392",
    "reporting":     "2:3801",
    "startups":      "2:7722",
}


def post(payload, session_id=None):
    headers = {
        "Content-Type": "application/json",
        "Accept": "application/json, text/event-stream",
    }
    if session_id:
        headers["Mcp-Session-Id"] = session_id
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(URL, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=600) as resp:
            sid = resp.headers.get("mcp-session-id") or session_id
            return sid, resp.read().decode("utf-8", errors="replace"), resp.getcode()
    except urllib.error.HTTPError as e:
        return session_id, e.read().decode("utf-8", errors="replace"), e.code


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
    sid, body, code = post({
        "jsonrpc": "2.0", "id": 1, "method": "initialize",
        "params": {"protocolVersion": "2024-11-05", "capabilities": {},
                   "clientInfo": {"name": "figma-pipeline.py", "version": "1.0"}},
    })
    if code != 200 or not sid:
        raise RuntimeError(f"initialize failed: {code} {body[:300]}")
    post({"jsonrpc": "2.0", "method": "notifications/initialized"}, session_id=sid)
    return sid


def call(sid, name, args, request_id=100):
    sid2, body, code = post({
        "jsonrpc": "2.0", "id": request_id, "method": "tools/call",
        "params": {"name": name, "arguments": args},
    }, session_id=sid)
    return parse_sse(body)


def get_design_context(sid, node_id):
    return call(sid, "get_design_context", {
        "nodeId": node_id,
        "clientFrameworks": "react",
        "clientLanguages": "typescript,javascript,css",
    })


def find_first_inner_frame(metadata_text):
    """Inside a section, find the first child frame (the actual page container)."""
    m = re.search(r'<frame id="([^"]+)" name="1440w default"', metadata_text)
    if m:
        return m.group(1)
    # Fallback: first frame after <section
    m2 = re.search(r'<section[^>]*>\s*<frame id="([^"]+)"', metadata_text)
    return m2.group(1) if m2 else None


def find_top_sections(metadata_text):
    """Find frames named 'section.*' at the shallowest depth."""
    pattern = re.compile(
        r'<frame id="([^"]+)" name="(section\.[^"]+)" x="([^"]+)" y="([^"]+)" '
        r'width="([^"]+)" height="([^"]+)"'
    )
    sections = []
    for m in pattern.finditer(metadata_text):
        pos = m.start()
        sub = metadata_text[:pos]
        depth = len(re.findall(r'<frame ', sub)) - len(re.findall(r'</frame>', sub))
        sections.append({
            "id": m.group(1), "name": m.group(2),
            "w": float(m.group(5)), "h": float(m.group(6)),
            "depth": depth,
        })
    # Return ALL section.* frames — each represents a distinct page section.
    # In sparse metadata, sections appear at different depths because the
    # tree is partially shown.
    return sections


ASSET_RE = re.compile(r'http://localhost:3845/assets/([a-f0-9]+)\.([a-z]+)')


def download_assets(text):
    """Download all unique assets referenced in the text. Returns map of url→local path."""
    found = ASSET_RE.findall(text)
    downloaded = {}
    for h, ext in set(found):
        url = f"http://localhost:3845/assets/{h}.{ext}"
        local = ASSETS / f"{h}.{ext}"
        downloaded[url] = local
        if local.exists():
            continue
        try:
            with urllib.request.urlopen(url, timeout=60) as r:
                local.write_bytes(r.read())
            print(f"   asset: {h}.{ext}")
        except Exception as e:
            print(f"   FAIL asset {h}.{ext}: {e}")
    return downloaded


def extract_page(sid, name, section_id):
    print(f"\n=== {name} (section {section_id}) ===")
    page_dir = CODE / name
    page_dir.mkdir(exist_ok=True)

    # Step 1: get metadata for the section to find inner page frame
    print(" [1/3] Section metadata…")
    section_resp = get_design_context(sid, section_id)
    section_meta = section_resp["result"]["content"][0]["text"]
    (page_dir / "_section_metadata.xml").write_text(section_meta, encoding="utf-8")

    inner_frame = find_first_inner_frame(section_meta)
    if not inner_frame:
        print(f"   FAIL: no inner frame found in section {section_id}")
        return
    print(f"   inner frame: {inner_frame}")

    # Step 2: get metadata of inner frame to find top-level sections
    print(" [2/3] Inner frame metadata…")
    inner_resp = get_design_context(sid, inner_frame)
    inner_meta = inner_resp["result"]["content"][0]["text"]
    (page_dir / "_inner_metadata.xml").write_text(inner_meta, encoding="utf-8")

    top = find_top_sections(inner_meta)
    print(f"   {len(top)} top sections found")
    for s in top:
        print(f"   - {s['id']} {s['name']} {int(s['w'])}x{int(s['h'])}")

    # Step 3: extract each section
    print(f" [3/3] Extracting {len(top)} sections…")
    all_text = []
    for i, s in enumerate(top, 1):
        print(f"   ({i}/{len(top)}) {s['id']}…")
        try:
            r = get_design_context(sid, s["id"])
            content = r["result"]["content"]
            text = content[0]["text"] if content else ""
            (page_dir / f"section_{i:02d}_{s['id'].replace(':','-')}.jsx").write_text(text, encoding="utf-8")
            (page_dir / f"section_{i:02d}_{s['id'].replace(':','-')}.json").write_text(
                json.dumps(r, indent=2, ensure_ascii=False), encoding="utf-8")
            all_text.append(text)
            download_assets(text)
        except Exception as e:
            print(f"     ERROR: {e}")

    # Combine all section texts for asset discovery
    combined = "\n\n".join(all_text)
    download_assets(combined)
    (page_dir / "_combined.jsx").write_text(combined, encoding="utf-8")
    print(f"   DONE — sections in {page_dir.name}/")


def main():
    pages = sys.argv[1:] if len(sys.argv) > 1 else list(SECTION_PAGES.keys())

    sid = init_session()
    print(f"MCP session: {sid}")

    # Get global variables once
    print("\n=== Global design tokens ===")
    vars_resp = call(sid, "get_variable_defs", {"nodeId": "0:1"}, request_id=99)
    if vars_resp.get("result"):
        text = vars_resp["result"]["content"][0]["text"]
        (EXTRACT / "design_tokens.json").write_text(text, encoding="utf-8")
        print(f"   tokens saved to design_tokens.json ({len(text)} chars)")

    for name in pages:
        if name not in SECTION_PAGES:
            print(f"WARN: unknown page '{name}'")
            continue
        try:
            extract_page(sid, name, SECTION_PAGES[name])
        except Exception as e:
            print(f"ERROR on {name}: {e}")
            import traceback
            traceback.print_exc()


if __name__ == "__main__":
    main()
