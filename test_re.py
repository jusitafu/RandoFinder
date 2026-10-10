import re

text = """<trkpt lat="43.1234" lon="5.6789">
  <ele>450.5</ele>
  <time>2026-10-09T10:00:00Z</time>
</trkpt>"""

pattern = re.compile(r'<(?:[a-zA-Z0-9_:-]+:)?trkpt\b([^>]*?)(?:\/>|>(.*?)<\/(?:[a-zA-Z0-9_:-]+:)?trkpt>)', re.IGNORECASE | re.DOTALL)
m = pattern.search(text)
print('Groups count:', len(m.groups()))
for i, g in enumerate(m.groups()):
    print(f'Group {i+1}: {repr(g)}')
