import re

def super_parse(text):
    pts = []
    # 1. Standard XML tag regex (lat/lon in any order, with any attribute name)
    tag_pattern = re.compile(r'<([a-zA-Z0-9_:-]+)\b([^>]*?)(?:/>|>(.*?)</\1>)', re.IGNORECASE | re.DOTALL)
    for m in tag_pattern.finditer(text):
        tag_name = m.group(1).lower()
        if 'trkpt' in tag_name or 'rtept' in tag_name or 'wpt' in tag_name or 'point' in tag_name or 'placemark' in tag_name:
            attrs = m.group(2)
            body = m.group(3) or ''
            
            lat_m = re.search(r'\blat(?:itude)?\s*=\s*["\']?([0-9.,-]+)', attrs, re.IGNORECASE)
            lon_m = re.search(r'\b(?:lon|lng|longitude)\s*=\s*["\']?([0-9.,-]+)', attrs, re.IGNORECASE)
            
            if lat_m and lon_m:
                lat = float(lat_m.group(1).replace(',', '.'))
                lon = float(lon_m.group(1).replace(',', '.'))
                ele = 0.0
                ele_m = re.search(r'<([a-zA-Z0-9_:-]+)?ele\b[^>]*>([0-9.,-]+)', body, re.IGNORECASE) or re.search(r'\bele\s*=\s*["\']?([0-9.,-]+)', attrs, re.IGNORECASE)
                if ele_m:
                    ele = float(ele_m.group(ele_m.lastindex).replace(',', '.'))
                pts.append((lat, lon, ele))
                
    # 2. Coordinates block fallback
    if not pts:
        for cm in re.finditer(r'<coordinates[^>]*>([\s\S]*?)</coordinates>', text, re.IGNORECASE):
            for token in cm.group(1).strip().split():
                parts = token.split(',')
                if len(parts) >= 2:
                    lon = float(parts[0].replace(',', '.'))
                    lat = float(parts[1].replace(',', '.'))
                    ele = float(parts[2].replace(',', '.')) if len(parts) > 2 else 0.0
                    pts.append((lat, lon, ele))
                    
    # 3. GeoJSON coordinates fallback
    if not pts:
        for gm in re.finditer(r'\[\s*([0-9.,-]+)\s*,\s*([0-9.,-]+)(?:\s*,\s*([0-9.,-]+))?\s*\]', text):
            v1 = float(gm.group(1).replace(',', '.'))
            v2 = float(gm.group(2).replace(',', '.'))
            # In GeoJSON: [lon, lat]
            if -90 <= v2 <= 90 and -180 <= v1 <= 180:
                pts.append((v2, v1, 0.0))
            elif -90 <= v1 <= 90 and -180 <= v2 <= 180:
                pts.append((v1, v2, 0.0))
                
    return pts

# Test diverse structures
test1 = '<trkpt lat="43.12" lon="5.80"><ele>100</ele></trkpt>'
test2 = '<trkpt lon="5.80" lat="43.12"><ele>100</ele></trkpt>'
test3 = '<gpx:trkpt lat="43.12" lon="5.80" />'
test4 = '<wpt lat="43.12" lon="5.80"></wpt>'
test5 = '<coordinates>5.80,43.12,100 5.81,43.13,120</coordinates>'
test6 = '{"type":"LineString","coordinates":[[5.80,43.12],[5.81,43.13]]}'

print("Test 1:", super_parse(test1))
print("Test 2:", super_parse(test2))
print("Test 3:", super_parse(test3))
print("Test 4:", super_parse(test4))
print("Test 5:", super_parse(test5))
print("Test 6:", super_parse(test6))
