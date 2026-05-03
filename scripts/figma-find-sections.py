"""Parse Figma MCP metadata XML to find top-level section.container frames."""
import json, re, sys

infile = sys.argv[1]
with open(infile) as f:
    data = json.load(f)

text = data['result']['content'][0]['text']

# Regex: find frames named "section.*"
pattern = re.compile(r'<frame id="([^"]+)" name="(section\.[^"]+)" x="([^"]+)" y="([^"]+)" width="([^"]+)" height="([^"]+)"')
sections = []
for m in pattern.finditer(text):
    sections.append({
        'id': m.group(1),
        'name': m.group(2),
        'x': float(m.group(3)),
        'y': float(m.group(4)),
        'w': float(m.group(5)),
        'h': float(m.group(6)),
        'pos': m.start(),
    })

# Also find the frame structure depth by counting opening tags before each match
# This helps identify TOP-LEVEL sections (depth=2 or 3 from frame root)
def depth_at(pos):
    """Count net <frame opens before position."""
    sub = text[:pos]
    opens = len(re.findall(r'<frame ', sub))
    closes = len(re.findall(r'</frame>', sub))
    return opens - closes

for s in sections:
    s['depth'] = depth_at(s['pos'])

# Show all sections
print(f"Found {len(sections)} 'section.*' frames in {infile}")
print(f"{'ID':<12} {'depth':<6} {'name':<32} {'WxH':<20}")
for s in sections:
    print(f"{s['id']:<12} {s['depth']:<6} {s['name']:<32} {int(s['w'])}x{int(s['h'])}")

# The top-level page sections — at lowest depth values
min_depth = min(s['depth'] for s in sections) if sections else 0
top = [s for s in sections if s['depth'] == min_depth]
print(f"\nTop-level sections (depth={min_depth}): {len(top)}")
for s in top:
    print(f"  {s['id']}  {s['name']}  {int(s['w'])}x{int(s['h'])}")
