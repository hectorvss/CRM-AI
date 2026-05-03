#!/usr/bin/env python3
"""
Stitch resolved components into the section JSX files.

Takes the extracted .figma-extract/components/<id>.jsx files (which have full
JSX root) and substitutes them in place of <Component variant="X" /> stubs.

Strategy:
- Each <Component> is wrapped by a parent div with data-node-id matching the
  Figma node ID.
- Replace the entire parent div + Component pair with the extracted node's
  inner JSX (root <div>), which carries its own positioning.

Output: writes resolved versions to .figma-extract/code/<page>/section_NN_resolved.jsx
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).parent.parent
EXTRACT = ROOT / ".figma-extract"
COMPONENTS = EXTRACT / "components"
CODE = EXTRACT / "code"

# Patterns to extract content from extracted component JSX files.
# The content is the SECOND text item — first is JSX, second is metadata.
# Or sometimes the file contains const declarations + export default.
EXPORT_DEFAULT = re.compile(
    r'export default function \w+\([^)]*\)\s*\{\s*\n\s*return \(\s*\n(.+?)\n\s*\);\s*\n\s*\}',
    re.DOTALL,
)
CONST_IMG = re.compile(r'^const (img\w+) = "([^"]+)";\s*$', re.MULTILINE)
LOCALHOST = re.compile(r'http://localhost:3845/assets/')


def load_component_code(node_id):
    """Load extracted JSX for a Figma node id. Returns (img_consts, jsx_body) or None."""
    safe = node_id.replace(":", "-")
    path = COMPONENTS / f"{safe}.jsx"
    if not path.exists():
        return None
    text = path.read_text(encoding="utf-8", errors="replace")
    if not text.strip() or text.startswith("Traceback"):
        return None
    # Pull out img consts
    imgs = {m.group(1): LOCALHOST.sub('/v2/assets/', m.group(2)) for m in CONST_IMG.finditer(text)}
    # Pull out the export default body
    m = EXPORT_DEFAULT.search(text)
    if not m:
        return None
    body = m.group(1).strip()
    # Rewrite asset URLs
    body = LOCALHOST.sub('/v2/assets/', body)
    return imgs, body


# Match a <div ... data-node-id="X:Y" ...> ... <Component .../> ... </div>
# where the inner content is *only* <Component> + whitespace.
# Use [^<]* to avoid greedy matches across other tags.
PARENT_DIV_RE = re.compile(
    r'(<div\b[^>]*\bdata-node-id="([^"]+)"[^>]*>)\s*\n?\s*<Component\b[^/>]*/>\s*\n?\s*(</div>)',
    re.DOTALL,
)


def stitch_section(jsx_text, components_cache):
    """Replace <Component> stubs with resolved code. Returns (stitched_text, stats)."""
    imgs_collected = {}
    replaced = 0
    total = 0

    def replace(m):
        nonlocal replaced, total
        total += 1
        nid = m.group(2)
        loaded = components_cache.get(nid) or load_component_code(nid)
        components_cache[nid] = loaded  # cache None too to avoid retry
        if loaded is None:
            return m.group(0)  # leave stub
        imgs, body = loaded
        imgs_collected.update(imgs)
        replaced += 1
        # Wrap the body inside the parent div so positioning classes apply
        parent_open = m.group(1)
        return f"{parent_open}\n          {body}\n        </div>"

    new_text = PARENT_DIV_RE.sub(replace, jsx_text)
    return new_text, imgs_collected, replaced, total


def process_page(page_dir):
    components_cache = {}
    page_imgs = {}
    page_total = page_replaced = 0

    for sf in sorted(page_dir.glob("section_*.jsx")):
        if "_resolved" in sf.name:
            continue
        text = sf.read_text(encoding="utf-8", errors="replace")
        new_text, imgs, replaced, total = stitch_section(text, components_cache)
        if replaced > 0:
            out = page_dir / f"{sf.stem}_resolved.jsx"
            out.write_text(new_text, encoding="utf-8")
            page_imgs.update(imgs)
            page_total += total
            page_replaced += replaced
            print(f"  {sf.name}: {replaced}/{total} resolved")

    return page_imgs, page_replaced, page_total


def main():
    if not COMPONENTS.exists() or not any(COMPONENTS.glob("*.jsx")):
        print("No components extracted yet — run figma-resolve-components.py first")
        return

    print(f"Extracted components: {len(list(COMPONENTS.glob('*.jsx')))}")
    grand_replaced = grand_total = 0

    for code_dir in sorted(CODE.iterdir()):
        if not code_dir.is_dir():
            continue
        print(f"\n=== {code_dir.name} ===")
        imgs, replaced, total = process_page(code_dir)
        grand_replaced += replaced
        grand_total += total

    print(f"\n=== TOTAL: {grand_replaced}/{grand_total} components resolved ===")


if __name__ == "__main__":
    main()
