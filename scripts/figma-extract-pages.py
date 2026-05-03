#!/usr/bin/env python3
"""
Direct page extractor for tickets/reporting/startups using sequential approach.
Bypasses figma-pipeline.py's timeout issues.

For each page section ID, recursively dive: section → first inner frame → list sections.
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
CODE = EXTRACT / "code"
ASSETS = EXTRACT / "assets"

CALL_TIMEOUT = 90  # generous for big page-level frames

PAGES = {
    "tickets": "2:1392",
    "reporting": "2:3801",
    "startups": "2:7722",
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
                   "clientInfo": {"name": "extract-pages", "version": "1.0"}},
    }, timeout=15)
    if code != 200 or not sid: raise RuntimeError(f"init failed: {code}")
    post({"jsonrpc": "2.0", "method": "notifications/initialized"}, sid=sid, timeout=10)
    return sid


def call(sid, name, args):
    sid2, body, code = post({
        "jsonrpc": "2.0", "id": 100, "method": "tools/call",
        "params": {"name": name, "arguments": args},
    }, sid=sid)
    return parse_sse(body) if body else None


ASSET_RE = re.compile(r'http://localhost:3845/assets/([a-f0-9]+)\.([a-z]+)')


def download_assets(text):
    for h, ext in set(ASSET_RE.findall(text)):
        local = ASSETS / f"{h}.{ext}"
        if local.exists(): continue
        try:
            with urllib.request.urlopen(f"http://localhost:3845/assets/{h}.{ext}", timeout=15) as r:
                local.write_bytes(r.read())
        except: pass


def find_sections(metadata_text):
    pattern = re.compile(
        r'<frame id="([^"]+)" name="(section\.[^"]+)" x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)"'
    )
    return [{"id": m.group(1), "name": m.group(2), "w": float(m.group(5)), "h": float(m.group(6))}
            for m in pattern.finditer(metadata_text)]


def find_first_inner_frame(metadata_text):
    """Find the first frame name='1440w default' or any first frame after the section."""
    m = re.search(r'<frame id="([^"]+)" name="1440w default"', metadata_text)
    if m: return m.group(1)
    # Fallback: any frame inside
    m = re.search(r'<frame id="([^"]+)" name="([^"]+)" x="[^"]+" y="[^"]+" width="([^"]+)"', metadata_text)
    if m and float(m.group(3)) >= 1200:
        return m.group(1)
    return None


def extract_page(sid, page_name, section_id):
    log(f"\n=== {page_name} (section {section_id}) ===")
    page_dir = CODE / page_name
    page_dir.mkdir(parents=True, exist_ok=True)

    # Step 1: section metadata
    log(f"  [1/3] section metadata...")
    r = call(sid, "get_design_context", {"nodeId": section_id, "clientFrameworks": "react", "clientLanguages": "typescript,javascript,css"})
    if not r or "result" not in r:
        log(f"  FAIL: no result for section")
        return False
    section_text = r["result"]["content"][0]["text"]
    (page_dir / "_section_metadata.xml").write_text(section_text, encoding="utf-8")

    inner = find_first_inner_frame(section_text)
    if not inner:
        log(f"  FAIL: no inner frame found in section metadata")
        return False
    log(f"    inner frame: {inner}")

    # Step 2: inner frame metadata
    log(f"  [2/3] inner metadata...")
    r2 = call(sid, "get_design_context", {"nodeId": inner, "clientFrameworks": "react", "clientLanguages": "typescript,javascript,css"})
    if not r2 or "result" not in r2:
        log(f"  FAIL: no result for inner frame")
        return False
    inner_text = r2["result"]["content"][0]["text"]
    (page_dir / "_inner_metadata.xml").write_text(inner_text, encoding="utf-8")

    sections = find_sections(inner_text)
    log(f"    sections: {len(sections)}")
    for s in sections:
        log(f"      - {s['id']} {s['name']} {int(s['w'])}x{int(s['h'])}")

    if not sections:
        log(f"  WARN: no section.* frames inside")
        return True

    # Step 3: extract each section
    log(f"  [3/3] extracting {len(sections)} sections...")
    for i, s in enumerate(sections, 1):
        log(f"    [{i}/{len(sections)}] {s['id']} {s['name']}...")
        try:
            r3 = call(sid, "get_design_context", {"nodeId": s["id"], "clientFrameworks": "react", "clientLanguages": "typescript,javascript,css"})
            if not r3 or "result" not in r3:
                log(f"      FAIL")
                continue
            text = r3["result"]["content"][0]["text"]
            (page_dir / f"section_{i:02d}_{s['id'].replace(':','-')}.jsx").write_text(text, encoding="utf-8")
            download_assets(text)
            log(f"      OK ({len(text):,} chars)")
        except urllib.error.URLError as e:
            log(f"      TIMEOUT: {e}")
        except Exception as e:
            log(f"      EXC: {e}")

    return True


def main():
    sid = init_session()
    log(f"Session: {sid}")
    pages = sys.argv[1:] if len(sys.argv) > 1 else list(PAGES.keys())
    for p in pages:
        if p in PAGES:
            try:
                extract_page(sid, p, PAGES[p])
            except Exception as e:
                log(f"ERROR on {p}: {e}")


if __name__ == "__main__":
    main()
