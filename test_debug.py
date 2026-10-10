import json
import math

print("Vérification des données et calculs...")

def haversine(lat1, lon1, lat2, lon2):
    R = 6371
    dLat = math.radians(lat2 - lat1)
    dLon = math.radians(lon2 - lon1)
    a = math.sin(dLat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dLon/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c

sanary_lat = 43.1189
sanary_lon = 5.8033

sample_places = [
    ("Sanary - Gros Cerveau", 43.1350, 5.8200),
    ("Six-Fours - Cap Sicié", 43.0600, 5.8450),
    ("Sanary - Portissol", 43.1220, 5.7850),
    ("Sainte-Baume", 43.3280, 5.7600),
    ("Calanques Cassis", 43.2080, 5.5180),
    ("Toulon - Mont Faron", 43.1550, 5.9350)
]

for name, lat, lon in sample_places:
    d = haversine(sanary_lat, sanary_lon, lat, lon)
    print(f"Rando: {name} -> {d:.1f} km de Sanary")

print("Vérification terminée avec succès !")
