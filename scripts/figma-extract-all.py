#!/usr/bin/env python3
"""
End-to-end extractor: discovers ALL pages on the canvas, extracts each page's
sections, then extracts every <Component> instance referenced.

Designed to be resumable and fault-tolerant:
- Skips files that already exist with valid content
- Short timeouts per call (90 s) so a hang only loses one item
- Re-initializes session on URLError
- Continues even if individual items fail
- Logs each step with flush
"""
import json
import re
import sys
import urllib.request
import urllib.error
import time
from pathlib import Path

URL = "http://127.0.0.1:3845/mcp"
ROOT = Path(__file__).parent.parent
EXTRACT = ROOT / ".figma-extract"
CODE = EXTRACT / "code"
COMPONENTS = EXTRACT / "components"
ASSETS = EXTRACT / "assets"

CALL_TIMEOUT = 90
ASSET_RE = re.compile(r'http://localhost:3845/assets/([a-f0-9]+)\.([a-z]+)')

# We'll discover these from the canvas. But also seed known IDs we already extracted
# so we can detect new pages added by the user.
KNOWN_PAGES = {
    "home":            "2:33992",
    "ai_agent":        "2:30675",
    # NOTE: original ai_agent_slack at 2:32228 was renumbered in the user's redesign;
    # it now lives at one of the new IDs below — match by title after extraction.
    "inbox":           "2:6389",
    "omnichannel":     "2:5021",
    "how_it_works":    "2:35355",
    "tickets":         "2:1392",
    "reporting":       "2:3801",
    "startups":        "2:7722",
    # NEW pages added 2026-05-03 (names to be assigned after extraction)
    "page_2_18817":    "2:18817",
    "page_32_13227":   "32:13227",
    "page_32_13982":   "32:13982",
    "page_32_14697":   "32:14697",
    "page_32_15409":   "32:15409",
    "page_32_16407":   "32:16407",
    "page_32_17633":   "32:17633",
}


def log(msg):
    print(msg, flush=True)


def post(payload, sid=None, timeout=CALL_TIMEOUT):
    headers = {"Content-Type": "application/json", "Accept": "application/json, text/event-stream"}
    if sid: headers["Mcp-Session-Id"] = sid
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(URL, data=body, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.headers.get("mcp-session-id") or sid, resp.read().decode("utf-8", errors="replace"), resp.getcode()
    except urllib.error.HTTPError as e:
        return sid, e.read().decode("utf-8", errors="replace"), e.code


def parse_sse(raw):
    last = None
    for line in raw.splitlines():
        if line.startswith("data: "): last = line[6:]
    if last is None:
        try: return json.loads(raw)
        except: return None
    try: return json.loads(last)
    except: return None


def init_session():
    sid, body, code = post({
        "jsonrpc": "2.0", "id": 1, "method": "initialize",
        "params": {"protocolVersion": "2024-11-05", "capabilities": {},
                   "clientInfo": {"name": "extract-all", "version": "1.0"}},
    }, timeout=15)
    if code != 200 or not sid: raise RuntimeError(f"init failed: {code}")
    post({"jsonrpc": "2.0", "method": "notifications/initialized"}, sid=sid, timeout=10)
    return sid


def call_tool(sid, name, args, retries=2):
    last_err = None
    for attempt in range(retries):
        try:
            sid2, body, code = post({
                "jsonrpc": "2.0", "id": 100 + attempt, "method": "tools/call",
                "params": {"name": name, "arguments": args},
            }, sid=sid)
            if not body: return None, sid
            r = parse_sse(body)
            if r and "result" in r:
                return r, sid
            last_err = r
        except urllib.error.URLError as e:
            last_err = str(e)
            try:
                sid = init_session()
                log(f"    reinit session -> {sid}")
            except Exception as e2:
                log(f"    reinit failed: {e2}")
                return None, sid
    return None, sid


def get_text(result):
    if not result: return ""
    content = result.get("result", {}).get("content", [])
    if not content or content[0].get("type") != "text": return ""
    return content[0].get("text", "")


def is_corrupted(text):
    if not text: return True
    head = text[:300]
    return (head.startswith("Traceback") or "TimeoutError" in head
            or "MCP server is only available" in head
            or len(text) < 50)


def download_assets(text):
    for h, ext in set(ASSET_RE.findall(text)):
        local = ASSETS / f"{h}.{ext}"
        if local.exists(): continue
        try:
            with urllib.request.urlopen(f"http://localhost:3845/assets/{h}.{ext}", timeout=15) as r:
                local.write_bytes(r.read())
        except Exception:
            pass


def find_inner_frame(metadata_text):
    m = re.search(r'<frame id="([^"]+)" name="1440w default"', metadata_text)
    if m: return m.group(1)
    m = re.search(r'<frame id="([^"]+)" name="([^"]+)" x="[^"]+" y="[^"]+" width="(1\d{3})"', metadata_text)
    return m.group(1) if m else None


def find_sections(metadata_text):
    pattern = re.compile(
        r'<frame id="([^"]+)" name="(section\.[^"]+)" x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)"'
    )
    return [{"id": m.group(1), "name": m.group(2),
             "w": float(m.group(5)), "h": float(m.group(6))} for m in pattern.finditer(metadata_text)]


def find_pages_on_canvas(canvas_text):
    """Find all top-level <section> nodes on canvas — these are the page containers."""
    # Each page on the canvas should be a top-level section
    pattern = re.compile(
        r'<section id="([^"]+)" name="([^"]+)" x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)"'
    )
    pages = []
    for m in pattern.finditer(canvas_text):
        try:
            pages.append({"id": m.group(1), "name": m.group(2).strip(),
                          "w": float(m.group(5)), "h": float(m.group(6))})
        except ValueError:
            continue
    return pages


def extract_page(sid, page_name, page_id):
    page_dir = CODE / page_name
    page_dir.mkdir(parents=True, exist_ok=True)

    log(f"\n=== {page_name} (section {page_id}) ===")

    # Step 1: section metadata
    meta_path = page_dir / "_section_metadata.xml"
    if meta_path.exists() and not is_corrupted(meta_path.read_text(encoding="utf-8", errors="replace")):
        log(f"  [1/3] using cached section metadata")
        section_text = meta_path.read_text(encoding="utf-8", errors="replace")
    else:
        log(f"  [1/3] fetching section metadata...")
        result, sid = call_tool(sid, "get_design_context", {
            "nodeId": page_id, "clientFrameworks": "react", "clientLanguages": "typescript,javascript,css",
        })
        section_text = get_text(result)
        if is_corrupted(section_text):
            log(f"  FAIL: corrupted section metadata")
            return sid, False
        meta_path.write_text(section_text, encoding="utf-8")

    # Step 2: inner frame
    inner = find_inner_frame(section_text)
    if not inner:
        log(f"  FAIL: no inner frame")
        return sid, False
    log(f"    inner: {inner}")

    inner_path = page_dir / "_inner_metadata.xml"
    if inner_path.exists() and not is_corrupted(inner_path.read_text(encoding="utf-8", errors="replace")):
        inner_text = inner_path.read_text(encoding="utf-8", errors="replace")
    else:
        log(f"  [2/3] fetching inner metadata...")
        result, sid = call_tool(sid, "get_design_context", {
            "nodeId": inner, "clientFrameworks": "react", "clientLanguages": "typescript,javascript,css",
        })
        inner_text = get_text(result)
        if is_corrupted(inner_text):
            log(f"  FAIL: corrupted inner metadata")
            return sid, False
        inner_path.write_text(inner_text, encoding="utf-8")

    sections = find_sections(inner_text)
    log(f"    {len(sections)} sections")

    # Step 3: extract each section
    log(f"  [3/3] extracting {len(sections)} sections...")
    for i, s in enumerate(sections, 1):
        sf = page_dir / f"section_{i:02d}_{s['id'].replace(':','-')}.jsx"
        if sf.exists():
            existing = sf.read_text(encoding="utf-8", errors="replace")
            if not is_corrupted(existing):
                continue  # cached, skip
        log(f"    [{i}/{len(sections)}] {s['id']} {s['name']}...")
        result, sid = call_tool(sid, "get_design_context", {
            "nodeId": s["id"], "clientFrameworks": "react", "clientLanguages": "typescript,javascript,css",
        })
        text = get_text(result)
        if is_corrupted(text):
            log(f"      FAIL")
            continue
        sf.write_text(text, encoding="utf-8")
        download_assets(text)
        log(f"      OK ({len(text):,} chars)")
    return sid, True


def find_component_parents():
    """Walk all extracted .jsx files, find parents of <Component> refs."""
    parents = {}
    for code_dir in sorted(CODE.iterdir()):
        if not code_dir.is_dir(): continue
        for jf in sorted(code_dir.glob("section_*.jsx")):
            try:
                text = jf.read_text(encoding="utf-8", errors="replace")
            except: continue
            if is_corrupted(text): continue
            for m in re.finditer(
                r'data-node-id="([^"]+)"[^>]*data-name="([^"]+)"[^>]*>\s*\n?[^<]*<Component\b',
                text,
            ):
                parents[m.group(1)] = m.group(2)
    return parents


def extract_components(sid, parents):
    COMPONENTS.mkdir(exist_ok=True)
    pending = [(nid, name) for nid, name in parents.items()
               if not (COMPONENTS / f"{nid.replace(':','-')}.jsx").exists()]
    log(f"\n=== Components: {len(pending)} pending of {len(parents)} ===")
    if not pending: return sid

    for i, (nid, name) in enumerate(pending, 1):
        log(f"  [{i}/{len(pending)}] {nid} {name[:30]}...")
        result, sid = call_tool(sid, "get_design_context", {
            "nodeId": nid, "clientFrameworks": "react", "clientLanguages": "typescript,javascript,css",
        })
        text = get_text(result)
        if is_corrupted(text):
            log(f"    FAIL")
            continue
        (COMPONENTS / f"{nid.replace(':','-')}.jsx").write_text(text, encoding="utf-8")
        download_assets(text)
        log(f"    OK ({len(text):,} chars)")
    return sid


def main():
    sid = init_session()
    log(f"Session: {sid}")

    # Step 1: try to discover pages from canvas (best-effort, swallow errors)
    log("\n=== Discovering pages from canvas ===")
    canvas_path = EXTRACT / "_canvas_metadata.xml"
    canvas_text = ""
    if canvas_path.exists() and canvas_path.stat().st_size > 1000:
        canvas_text = canvas_path.read_text(encoding="utf-8", errors="replace")
        log(f"  using cached canvas metadata ({len(canvas_text):,} chars)")
    else:
        log("  fetching canvas (0:1) — may time out, that's ok...")
        try:
            result, sid = call_tool(sid, "get_design_context", {
                "nodeId": "0:1", "clientFrameworks": "react", "clientLanguages": "typescript,javascript,css",
            })
            canvas_text = get_text(result)
            if not is_corrupted(canvas_text):
                canvas_path.write_text(canvas_text, encoding="utf-8")
        except Exception as e:
            log(f"  canvas fetch failed: {e}")
            log("  falling back to KNOWN_PAGES")
            try:
                sid = init_session()
            except Exception:
                pass

    # Find all sections (pages) on canvas
    discovered = find_pages_on_canvas(canvas_text) if canvas_text else []
    log(f"  found {len(discovered)} top-level sections on canvas")
    for p in discovered[:30]:
        log(f"    - {p['id']:>10s} {p['name']:<40s} {int(p['w'])}x{int(p['h'])}")

    # Build the page map: prefer KNOWN_PAGES (named), but include any new ones found
    page_map = dict(KNOWN_PAGES)
    known_ids = set(KNOWN_PAGES.values())
    new_pages_found = []
    for p in discovered:
        if p["id"] not in known_ids:
            # New page — sanitize name
            safe = re.sub(r'[^a-z0-9]+', '_', p["name"].lower()).strip("_") or f"page_{p['id'].replace(':','_')}"
            if safe not in page_map:
                page_map[safe] = p["id"]
                new_pages_found.append((safe, p["id"], p["name"]))

    log(f"\n  total pages to process: {len(page_map)}")
    if new_pages_found:
        log("  NEW pages discovered:")
        for safe, pid, name in new_pages_found:
            log(f"    - {pid:>10s} {safe} ({name})")

    # Step 2: extract each page
    pages_to_run = sys.argv[1:] if len(sys.argv) > 1 else list(page_map.keys())
    for page_name in pages_to_run:
        if page_name not in page_map:
            log(f"WARN: unknown page '{page_name}'")
            continue
        try:
            sid, _ = extract_page(sid, page_name, page_map[page_name])
        except Exception as e:
            log(f"ERROR on {page_name}: {e}")

    # Step 3: extract all components referenced
    parents = find_component_parents()
    sid = extract_components(sid, parents)

    log("\n=== ALL DONE ===")


if __name__ == "__main__":
    main()
