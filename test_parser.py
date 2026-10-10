import re

def test_parser():
    samples = [
        '<trkpt lon="5.8033" lat="43.1189"><ele>150.5</ele></trkpt>',
        '<trkpt lat="43.1189" lon="5.8033"><ele>150.5</ele></trkpt>',
        '<gpx:trkpt lon="5.8033" lat="43.1189" ele="150" />',
        '<wpt lat="43.1189" lon="5.8033"><ele>200</ele></wpt>',
        '<coordinates>5.8033,43.1189,150 5.8040,43.1200,160</coordinates>'
    ]
    
    # Generic tag scanner
    pattern = re.compile(r'<([a-zA-Z0-9_-]+:)?(trkpt|rtept|wpt|point)\b([^>]*?)(?:/>|>(.*?)</(?:\1)?\2>)', re.IGNORECASE | re.DOTALL)
    
    for idx, s in enumerate(samples):
        pts = []
        for m in pattern.finditer(s):
            attrs = m.group(3)
            body = m.group(4) or ''
            lat_m = re.search(r'\blat\s*=\s*["\']?([0-9.-]+)', attrs, re.IGNORECASE)
            lon_m = re.search(r'\b(?:lon|lng)\s*=\s*["\']?([0-9.-]+)', attrs, re.IGNORECASE)
            if lat_m and lon_m:
                pts.append((float(lat_m.group(1)), float(lon_m.group(1))))
        
        # Coordinate string scanner
        if not pts:
            coord_m = re.search(r'<coordinates>([\s\S]*?)</coordinates>', s, re.IGNORECASE)
            if coord_m:
                for line in coord_m.group(1).strip().split():
                    parts = line.split(',')
                    if len(parts) >= 2:
                        pts.append((float(parts[1]), float(parts[0])))
                        
        print(f"Sample {idx+1} result: {len(pts)} points -> {pts}")

if __name__ == '__main__':
    test_parser()
