import re

gpx_sample = """<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Visorando">
  <wpt lat="43.1800" lon="5.6500"><name>Parking depart</name></wpt>
  <wpt lat="43.1100" lon="5.8200"><name>Point de vue</name></wpt>
  <trk>
    <name>La superbe rando</name>
    <trkseg>
      <trkpt lat="43.1200" lon="5.8000"><ele>100</ele></trkpt>
      <trkpt lat="43.1210" lon="5.8010"><ele>105</ele></trkpt>
      <trkpt lat="43.1220" lon="5.8020"><ele>110</ele></trkpt>
    </trkseg>
  </trk>
</gpx>"""

# 1. Ancien comportement (mélange les wpt et trkpt)
old_regex = re.compile(r'<(?:[a-zA-Z0-9_:-]+:)?(trkpt|rtept|wpt|point)\b([^>]*?)(?:/>|>(.*?)</(?:[a-zA-Z0-9_:-]+:)?\1>)', re.IGNORECASE | re.DOTALL)
old_pts = []
for m in old_regex.finditer(gpx_sample):
    attrs = m.group(2)
    lat_m = re.search(r'lat=["\']?([0-9.]+)', attrs)
    lon_m = re.search(r'lon=["\']?([0-9.]+)', attrs)
    if lat_m and lon_m:
        old_pts.append((float(lat_m.group(1)), float(lon_m.group(1))))

print("Ancien comportement (Mélange des WPT et TRKPT) :")
for p in old_pts:
    print(" ", p)

# 2. Nouveau comportement ferme et strict
def extract_strict_track(text):
    # Etape 1: Chercher d'abord strictement les <trkpt>
    trkpt_regex = re.compile(r'<(?:[a-zA-Z0-9_:-]+:)?trkpt\b([^>]*?)(?:/>|>(.*?)</(?:[a-zA-Z0-9_:-]+:)?trkpt>)', re.IGNORECASE | re.DOTALL)
    pts = []
    for m in trkpt_regex.finditer(text):
        attrs = m.group(1)
        lat_m = re.search(r'lat=["\']?([0-9.]+)', attrs)
        lon_m = re.search(r'lon=["\']?([0-9.]+)', attrs)
        if lat_m and lon_m:
            pts.append((float(lat_m.group(1)), float(lon_m.group(1))))
    
    # Etape 2: Si aucun trkpt, chercher les <rtept>
    if not pts:
        rtept_regex = re.compile(r'<(?:[a-zA-Z0-9_:-]+:)?rtept\b([^>]*?)(?:/>|>(.*?)</(?:[a-zA-Z0-9_:-]+:)?rtept>)', re.IGNORECASE | re.DOTALL)
        for m in rtept_regex.finditer(text):
            attrs = m.group(1)
            lat_m = re.search(r'lat=["\']?([0-9.]+)', attrs)
            lon_m = re.search(r'lon=["\']?([0-9.]+)', attrs)
            if lat_m and lon_m:
                pts.append((float(lat_m.group(1)), float(lon_m.group(1))))
                
    return pts

new_pts = extract_strict_track(gpx_sample)
print("\nNouveau comportement STRICT (Uniquement la trace continue) :")
for p in new_pts:
    print(" ", p)
