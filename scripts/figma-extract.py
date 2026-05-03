#!/usr/bin/env python3
"""
Talk directly to the Figma Dev Mode MCP Server (http://127.0.0.1:3845/mcp)
using JSON-RPC over Streamable HTTP. Bypasses the broken Claude extension.

Usage:
    python figma-extract.py call get_design_context '{"nodeId":"2:33992","clientFrameworks":"react","clientLanguages":"typescript,javascript,css"}'
    python figma-extract.py call get_variable_defs '{"nodeId":"0:1"}'
    python figma-extract.py list
"""
import json
import sys
import urllib.request
import urllib.error

URL = "http://127.0.0.1:3845/mcp"


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
            text = resp.read().decode("utf-8", errors="replace")
            return sid, text, resp.getcode()
    except urllib.error.HTTPError as e:
        text = e.read().decode("utf-8", errors="replace")
        return session_id, text, e.code


def parse_sse(raw):
    """Parse a SSE stream; return the last data: payload as JSON."""
    last = None
    for line in raw.splitlines():
        if line.startswith("data: "):
            last = line[len("data: "):]
    if last is None:
        try:
            return json.loads(raw)
        except Exception:
            return {"_raw": raw}
    try:
        return json.loads(last)
    except Exception:
        return {"_raw": last}


def init_session():
    """Initialize MCP session. Returns session_id."""
    sid, body, code = post({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {"name": "figma-extract.py", "version": "1.0"},
        },
    })
    if code != 200 or not sid:
        raise RuntimeError(f"initialize failed: {code} {body[:300]}")
    # Send initialized notification (no id, no response expected)
    post({"jsonrpc": "2.0", "method": "notifications/initialized"}, session_id=sid)
    return sid


def call_tool(sid, name, args):
    sid2, body, code = post({
        "jsonrpc": "2.0",
        "id": 100,
        "method": "tools/call",
        "params": {"name": name, "arguments": args},
    }, session_id=sid)
    return parse_sse(body)


def list_tools(sid):
    sid2, body, code = post({
        "jsonrpc": "2.0",
        "id": 50,
        "method": "tools/list",
        "params": {},
    }, session_id=sid)
    return parse_sse(body)


def main():
    if len(sys.argv) < 2:
        print("Usage: figma-extract.py [list | call <tool> <json-args>]", file=sys.stderr)
        sys.exit(1)

    sid = init_session()

    cmd = sys.argv[1]
    if cmd == "list":
        result = list_tools(sid)
    elif cmd == "call":
        if len(sys.argv) < 4:
            print("Usage: call <tool_name> <json-args>", file=sys.stderr)
            sys.exit(1)
        tool_name = sys.argv[2]
        args = json.loads(sys.argv[3])
        result = call_tool(sid, tool_name, args)
    else:
        print(f"Unknown command: {cmd}", file=sys.stderr)
        sys.exit(1)

    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
