#!/usr/bin/env python3
"""
Process extracted Figma JSX into the public-landing-v2/ structure.

For each extracted page (.figma-extract/code/<name>/section_*.jsx):
  1. Read all section JSX files
  2. Strip the `export default function ...` boilerplate, keep the JSX body
  3. Rewrite localhost:3845/assets/ URLs to /v2/assets/
  4. Combine sections into a single React component
  5. Output to public-landing-v2/<name>.jsx with global registration pattern

Also copies .figma-extract/assets/ -> public-landing-v2/assets/ (for serving).
Generates a CSS variables file at public-landing-v2/tokens.css from design_tokens.json.
"""
import json
import re
import shutil
from pathlib import Path

ROOT = Path(__file__).parent.parent
EXTRACT = ROOT / ".figma-extract"
CODE = EXTRACT / "code"
ASSETS_SRC = EXTRACT / "assets"
V2 = ROOT / "public-landing-v2"
V2_ASSETS = V2 / "assets"

# Page name -> component name + window global
PAGES = {
    "home":           ("HomePage",          "/"),
    "ai_agent":       ("AiAgentPage",       "/ai-agent"),
    "ai_agent_slack": ("AiAgentSlackPage",  "/ai-agent/slack"),
    "inbox":          ("InboxPage",         "/inbox"),
    "omnichannel":    ("OmnichannelPage",   "/omnichannel"),
    "how_it_works":   ("HowItWorksPage",    "/how-it-works"),
    "tickets":        ("TicketsPage",       "/tickets"),
    "reporting":      ("ReportingPage",     "/reporting"),
    "startups":       ("StartupsPage",      "/startups"),
    # New pages from the recent extraction
    "page_32_16407":  ("KnowledgePage",       "/knowledge"),
    "page_32_17633":  ("PricingPage",         "/pricing"),
    "page_32_13982":  ("AgentCustomerPage",   "/agent-customer"),
    "page_32_14697":  ("CopilotPage",         "/copilot"),
    "page_32_13227":  ("AgentTrustPage",      "/agent-trust"),
    "page_32_15409":  ("HowAgentWorksPage",   "/how-agent-works"),
    "page_2_18817":   ("TechnologyPage",      "/technology"),
}

LOCALHOST_ASSETS = re.compile(r'http://localhost:3845/assets/')
EXPORT_DEFAULT = re.compile(r'^\s*export default function \w+\(\)\s*\{\s*\n\s*return \(\s*\n', re.MULTILINE)
EXPORT_END = re.compile(r'\n\s*\);\s*\n\}\s*$', re.MULTILINE)
CONST_IMG = re.compile(r'^const (img\w+) = "([^"]+)";\s*$', re.MULTILINE)


def copy_assets():
    """Copy all extracted assets to v2/assets/."""
    V2_ASSETS.mkdir(exist_ok=True, parents=True)
    n = 0
    if not ASSETS_SRC.exists():
        return 0
    for src in ASSETS_SRC.iterdir():
        dst = V2_ASSETS / src.name
        if not dst.exists() or src.stat().st_size != dst.stat().st_size:
            shutil.copy2(src, dst)
            n += 1
    return n


def process_section(jsx_text):
    """Strip export wrapper, return (img_consts_dict, jsx_body)."""
    imgs = {}
    for m in CONST_IMG.finditer(jsx_text):
        imgs[m.group(1)] = m.group(2)

    # Remove const declarations
    body = CONST_IMG.sub('', jsx_text).strip()

    # Strip "export default function X() { return (" and trailing "); }"
    m = EXPORT_DEFAULT.search(body)
    if m:
        body = body[m.end():]
    m2 = EXPORT_END.search(body)
    if m2:
        body = body[:m2.start()]
    body = body.strip()

    # Rewrite asset URLs to local /v2/assets/
    body = LOCALHOST_ASSETS.sub('/v2/assets/', body)
    rewritten_imgs = {}
    for k, v in imgs.items():
        rewritten_imgs[k] = LOCALHOST_ASSETS.sub('/v2/assets/', v)

    return rewritten_imgs, body


def build_page(page_name, component_name):
    page_dir = CODE / page_name
    if not page_dir.exists():
        print(f"SKIP {page_name}: no extracted code")
        return False

    section_files = sorted(page_dir.glob("section_*.jsx"))
    if not section_files:
        print(f"SKIP {page_name}: no sections")
        return False

    all_imgs = {}
    section_bodies = []

    for sf in section_files:
        text = sf.read_text(encoding="utf-8", errors="replace")
        # Skip broken files that contain Python tracebacks or MCP errors
        if text.startswith("Traceback") or "TimeoutError" in text[:500] or "MCP server is only available" in text[:500]:
            print(f"   SKIP corrupted: {sf.name}")
            continue
        imgs, body = process_section(text)
        all_imgs.update(imgs)
        section_bodies.append(body)

    # Build the final .jsx file
    img_lines = "\n".join(f'  const {k} = "{v}";' for k, v in all_imgs.items())
    sections_jsx = "\n        ".join(section_bodies)

    output = f"""/* global React, ClainV2 */
/* AUTO-GENERATED from Figma extraction. See scripts/figma-build-pages.py */
(function () {{
  const {{ PageShell }} = ClainV2;
  // Stub for unresolved Figma component instances
  const Component = ({{ className, variant, ...rest }}) => (
    <div className={{className}} data-figma-component={{variant ?? 'default'}} {{...rest}} />
  );
{img_lines}

  function {component_name}() {{
    return (
      <PageShell>
        <div className="figma-page">
          {sections_jsx}
        </div>
      </PageShell>
    );
  }}

  window.{component_name} = {component_name};
}})();
"""
    out_path = V2 / f"{page_name.replace('_','-')}.jsx"
    out_path.write_text(output, encoding="utf-8")
    print(f"OK   {page_name} -> {out_path.name}  ({len(section_bodies)} sections, {len(all_imgs)} images)")
    return True


def build_tokens_css():
    """Convert design_tokens.json into CSS variables."""
    tokens_file = EXTRACT / "design_tokens.json"
    if not tokens_file.exists():
        print("WARN: no design_tokens.json")
        return
    raw = tokens_file.read_text(encoding="utf-8", errors="replace")
    try:
        tokens = json.loads(raw)
    except Exception:
        print("WARN: tokens not JSON, treating as raw")
        return

    lines = [":root {"]
    for k, v in tokens.items():
        # Convert "color/blue/40" -> "--color-blue-40"
        var_name = "--" + k.replace("/", "-").replace(" ", "_").replace("%", "pct").replace(",", "_")
        # Skip mostly-broken entries
        if not isinstance(v, str):
            continue
        # Filter out obvious garbage
        v_clean = v.strip()
        lines.append(f"  {var_name}: {v_clean};")
    lines.append("}")

    out = V2 / "tokens.css"
    out.write_text("\n".join(lines), encoding="utf-8")
    print(f"OK   tokens.css ({len(lines)-2} variables)")


def main():
    print("=== Copying assets ===")
    n = copy_assets()
    print(f"  {n} new assets copied to {V2_ASSETS}")

    print("\n=== Building tokens.css ===")
    build_tokens_css()

    print("\n=== Building pages ===")
    for page_name, (component_name, _route) in PAGES.items():
        build_page(page_name, component_name)


if __name__ == "__main__":
    main()
