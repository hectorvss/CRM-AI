#!/usr/bin/env python3
"""Tiny HTTP server for inspecting public-landing-v2/ locally.

Serves http://localhost:8000/v2/index.html and rewrites all /v2/* requests
to public-landing-v2/*. Mirrors the production routing where Vercel
rewrites /* to dist/landing-v2/* so paths like /v2/home.jsx, /v2/assets/...
resolve identically here.
"""
import http.server
import socketserver
import os
from pathlib import Path

ROOT = Path(__file__).parent.parent
LANDING_V2 = ROOT / "public-landing-v2"
PORT = 8000


class Handler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path: str) -> str:
        # Strip query string before mapping
        clean = path.split('?', 1)[0]
        if clean == '/v2' or clean == '/v2/' or clean == '/' or clean == '':
            return str(LANDING_V2 / 'index.html')
        if clean.startswith('/v2/'):
            rel = clean[len('/v2/'):]
            target = LANDING_V2 / rel
            # SPA fallback: if the requested URL doesn't map to an actual
            # file (e.g. /v2/copilot, /v2/pricing — virtual SPA routes),
            # serve index.html so the React router can pick it up.
            if not target.is_file():
                return str(LANDING_V2 / 'index.html')
            return str(target)
        # Anything else: try same path under landing root
        target = LANDING_V2 / clean.lstrip('/')
        if not target.is_file():
            return str(LANDING_V2 / 'index.html')
        return str(target)

    def end_headers(self):
        # Disable cache so edits are picked up on refresh
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, fmt, *args):
        # Quieter log
        print(f"[serve] {self.address_string()} - {fmt % args}", flush=True)


def main():
    os.chdir(LANDING_V2)
    with socketserver.TCPServer(("0.0.0.0", PORT), Handler) as httpd:
        print(f"\n  Landing v2 -> http://localhost:{PORT}/v2/")
        print(f"  Pages: home, ai-agent, inbox, omnichannel, tickets, reporting,")
        print(f"         startups, knowledge, pricing, copilot, agent-customer,")
        print(f"         agent-trust, technology, how-it-works, ai-agent-slack")
        print(f"\n  Ctrl+C to stop.\n")
        httpd.serve_forever()


if __name__ == "__main__":
    main()
