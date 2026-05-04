#!/usr/bin/env python3
"""
Build the public-landing-v2/ pages from extracted Figma JSX, but replace
long-form marketing text with placeholder tokens (`__COPY_NNN__`).

Visual structure stays 1:1 with the Figma extraction: layout, classes,
spacing, assets, components, attributes — everything is preserved. Only
JSX text-node content longer than 25 characters is swapped for a
deterministic placeholder so the user can paste their own copy in later.

A manifest at `public-landing-v2/_copy_manifest.json` maps each placeholder
to the original text + page + section so the user has a clear shopping
list of what needs replacing.

Does NOT deploy.
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
    "page_32_16407":  ("KnowledgePage",     "/knowledge"),
    "page_32_17633":  ("PricingPage",       "/pricing"),
    "page_32_13982":  ("AgentCustomerPage", "/agent-customer"),
    "page_32_14697":  ("CopilotPage",       "/copilot"),
    "page_32_13227":  ("AgentTrustPage",    "/agent-trust"),
    "page_32_15409":  ("HowAgentWorksPage", "/how-agent-works"),
    "page_2_18817":   ("TechnologyPage",    "/technology"),
}

LOCALHOST_ASSETS = re.compile(r'http://localhost:3845/assets/')

# Babel standalone (used for in-browser JSX) does NOT understand TypeScript.
# Figma's MCP often emits `style={{...} as React.CSSProperties}` and similar.
# Strip the type assertions so plain JSX remains.
TS_AS_CAST = re.compile(r'\s+as\s+(?:React\.CSSProperties|const|any|unknown|[A-Z][A-Za-z0-9_]*(?:\.[A-Z][A-Za-z0-9_]*)*(?:\[\])?)')
# `<Component prop={value satisfies Type}>` — drop the satisfies clause
TS_SATISFIES = re.compile(r'\s+satisfies\s+[A-Za-z_][A-Za-z0-9_.]*(?:<[^>]+>)?')
EXPORT_DEFAULT = re.compile(r'^\s*export default function \w+\(\)\s*\{\s*\n\s*return \(\s*\n', re.MULTILINE)
EXPORT_END = re.compile(r'\n\s*\);\s*\n\}\s*$', re.MULTILINE)
CONST_IMG = re.compile(r'^const (img\w+) = "([^"]+)";\s*$', re.MULTILINE)

# JSX text content: matches `>...<` on a single segment, NOT attribute values
# (those are inside `=" ... "`). We deliberately don't match `{` or `}` to
# avoid eating JSX expressions.
JSX_TEXT = re.compile(r'(>)([^<>{}\n][^<>{}]*?)(<)')

# Long string literals inside JSX expressions, e.g. `{"Some long marketing"}`
# or `{`Some long marketing`}`
JSX_STRING_LITERAL = re.compile(r'(\{)\s*([\"`])([^\"`\n]{25,})([\"`])\s*(\})')

# Threshold: text shorter than this stays (button labels, single words, "→").
TEXT_THRESHOLD = 25

# Page-level counter manifest. Each page gets its own series so placeholders
# don't collide between pages.
manifest_global = {}


def copy_assets():
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


def is_replaceable(text: str) -> bool:
    """Decide whether a piece of text content should become a placeholder."""
    stripped = text.strip()
    if len(stripped) < TEXT_THRESHOLD:
        return False
    # Pure numbers / symbols
    if not any(c.isalpha() for c in stripped):
        return False
    # Looks like a className / utility chain ("rounded-2xl bg-blue-500")
    if re.match(r'^[a-z0-9\-:_/\[\]\(\) ]+$', stripped) and ' ' in stripped and ('-' in stripped or ':' in stripped):
        # Unless it has actual sentence-like structure
        if not any(c.isupper() for c in stripped) and stripped.count('.') == 0:
            return False
    return True


def sanitize_jsx(jsx_text: str, page_name: str, section_name: str, manifest: dict, counter: list) -> str:
    """Replace JSX text nodes + long string literals with placeholders."""
    def repl_text(m: re.Match) -> str:
        content = m.group(2)
        if not is_replaceable(content):
            return m.group(0)
        counter[0] += 1
        key = f"COPY_{page_name.upper()}_{counter[0]:03d}"
        manifest[key] = {
            "page": page_name,
            "section": section_name,
            "kind": "jsx-text",
            "original": content.strip(),
        }
        return f"{m.group(1)}__{key}__{m.group(3)}"

    def repl_strlit(m: re.Match) -> str:
        content = m.group(3)
        if not is_replaceable(content):
            return m.group(0)
        counter[0] += 1
        key = f"COPY_{page_name.upper()}_{counter[0]:03d}"
        manifest[key] = {
            "page": page_name,
            "section": section_name,
            "kind": "string-literal",
            "original": content.strip(),
        }
        return f'{m.group(1)}{m.group(2)}__{key}__{m.group(4)}{m.group(5)}'

    out = JSX_TEXT.sub(repl_text, jsx_text)
    out = JSX_STRING_LITERAL.sub(repl_strlit, out)
    return out


def process_section(jsx_text: str, page_name: str, section_name: str, manifest: dict, counter: list):
    """Strip export wrapper, return (img_consts, jsx_body) with placeholders."""
    imgs = {}
    for m in CONST_IMG.finditer(jsx_text):
        imgs[m.group(1)] = m.group(2)

    body = CONST_IMG.sub('', jsx_text).strip()

    m1 = EXPORT_DEFAULT.search(body)
    if m1:
        body = body[m1.end():]
    m2 = EXPORT_END.search(body)
    if m2:
        body = body[:m2.start()]
    body = body.strip()

    body = LOCALHOST_ASSETS.sub('/v2/assets/', body)
    body = TS_AS_CAST.sub('', body)
    body = TS_SATISFIES.sub('', body)
    body = sanitize_jsx(body, page_name, section_name, manifest, counter)

    rewritten_imgs = {k: LOCALHOST_ASSETS.sub('/v2/assets/', v) for k, v in imgs.items()}
    return rewritten_imgs, body


def build_page(page_name: str, component_name: str) -> bool:
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
    page_manifest = {}
    counter = [0]

    for sf in section_files:
        text = sf.read_text(encoding="utf-8", errors="replace")
        if text.startswith("Traceback") or "TimeoutError" in text[:500] or "MCP server is only available" in text[:500]:
            print(f"   SKIP corrupted: {sf.name}")
            continue
        imgs, body = process_section(text, page_name, sf.stem, page_manifest, counter)
        all_imgs.update(imgs)
        section_bodies.append(body)

    img_lines = "\n".join(f'  const {k} = "{v}";' for k, v in all_imgs.items())
    sections_jsx = "\n        ".join(section_bodies)

    output = f"""/* global React, ClainV2 */
/* AUTO-GENERATED from Figma extraction with placeholder copy.
   See scripts/figma-build-placeholders.py
   Long-form marketing text has been replaced by `__COPY_PAGE_NNN__`
   tokens. Source-of-truth mapping in public-landing-v2/_copy_manifest.json */
(function () {{
  const {{ PageShell }} = ClainV2;
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
    out_path = V2 / f"{page_name.replace('_', '-')}.jsx"
    out_path.write_text(output, encoding="utf-8")
    manifest_global[page_name] = page_manifest
    print(f"OK   {page_name} -> {out_path.name}  ({len(section_bodies)} sections, {len(all_imgs)} imgs, {len(page_manifest)} placeholders)")
    return True


def build_tokens_css():
    tokens_file = EXTRACT / "design_tokens.json"
    if not tokens_file.exists():
        return
    raw = tokens_file.read_text(encoding="utf-8", errors="replace")
    try:
        tokens = json.loads(raw)
    except Exception:
        return
    lines = [":root {"]
    for k, v in tokens.items():
        if not isinstance(v, str):
            continue
        var_name = "--" + k.replace("/", "-").replace(" ", "_").replace("%", "pct").replace(",", "_")
        lines.append(f"  {var_name}: {v.strip()};")
    lines.append("}")
    (V2 / "tokens.css").write_text("\n".join(lines), encoding="utf-8")


def main():
    print("=== Copying assets ===")
    n = copy_assets()
    print(f"  {n} new assets copied")

    print("\n=== Building tokens.css ===")
    build_tokens_css()

    print("\n=== Building pages ===")
    for page_name, (component_name, _route) in PAGES.items():
        build_page(page_name, component_name)

    print("\n=== Writing copy manifest ===")
    total = sum(len(m) for m in manifest_global.values())
    (V2 / "_copy_manifest.json").write_text(
        json.dumps(manifest_global, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    print(f"  {total} placeholders across {len(manifest_global)} pages")
    print(f"  manifest at public-landing-v2/_copy_manifest.json")


if __name__ == "__main__":
    main()
