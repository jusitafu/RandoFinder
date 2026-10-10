import math
import json

def haversine(lat1, lon1, lat2, lon2):
    R = 6371
    dLat = math.radians(lat2 - lat1)
    dLon = math.radians(lon2 - lon1)
    a = math.sin(dLat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dLon/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

def build_circuit(anchors, steps_per_seg=14):
    dense = []
    for i in range(len(anchors) - 1):
        p1 = anchors[i]
        p2 = anchors[i + 1]
        for s in range(steps_per_seg):
            t = s / float(steps_per_seg)
            # subtle natural trail curve
            wave = math.sin(t * math.pi)
            perp_lat = -(p2[1] - p1[1])
            perp_lon = (p2[0] - p1[0])
            length = math.sqrt(perp_lat**2 + perp_lon**2) or 1.0
            curve = (0.00008 if i % 2 == 0 else -0.00008) * wave
            
            lat = p1[0] + (p2[0] - p1[0]) * t + (perp_lat / length) * curve
            lon = p1[1] + (p2[1] - p1[1]) * t + (perp_lon / length) * curve
            ele = round(p1[2] + (p2[2] - p1[2]) * t + wave * 1.5)
            dense.append((round(lat, 6), round(lon, 6), ele))
    dense.append((round(anchors[-1][0], 6), round(anchors[-1][1], 6), anchors[-1][2]))
    
    # Calculate exact distance and D+
    tot_dist = 0
    dplus = 0
    dmoins = 0
    last_ele = dense[0][2]
    now = 1728500000000
    points = []
    
    for i, p in enumerate(dense):
        if i > 0:
            d = haversine(dense[i-1][0], dense[i-1][1], p[0], p[1])
            tot_dist += d
            diff = p[2] - last_ele
            if abs(diff) >= 1.5:
                if diff > 0: dplus += diff
                else: dmoins += abs(diff)
                last_ele = p[2]
        points.append({
            'lat': p[0],
            'lon': p[1],
            'ele': p[2],
            'dist': round(tot_dist, 2),
            'time': f'2026-10-09T{10 + int(tot_dist//4):02d}:{int((tot_dist%4)*15):02d}:00Z'
        })
        
    return points, round(tot_dist, 1), int(dplus), int(dmoins)

# 1. Cap Sicié (Janas -> ND du Mai -> Deux Freres -> Fabregas -> Janas)
anchors_cap_sicie = [
    (43.0762, 5.8315, 60),   # Janas
    (43.0750, 5.8335, 80),
    (43.0735, 5.8360, 110),
    (43.0718, 5.8390, 145),
    (43.0700, 5.8420, 180),  # Carrefour des Maures
    (43.0680, 5.8450, 215),
    (43.0660, 5.8485, 255),
    (43.0640, 5.8515, 290),  # Peyras
    (43.0615, 5.8540, 320),
    (43.0585, 5.8565, 345),
    (43.0560, 5.8575, 352),
    (43.0545, 5.8582, 356),  # ND du Mai
    (43.0555, 5.8610, 340),  # Table orientation
    (43.0575, 5.8635, 320),  # Balcon Sud
    (43.0600, 5.8650, 290),  # Falaises
    (43.0630, 5.8640, 250),  # Vue Deux Freres
    (43.0665, 5.8615, 205),  # Sentier douanier
    (43.0695, 5.8575, 160),  # Jonction GR51
    (43.0725, 5.8525, 120),  # Piste DFCI
    (43.0745, 5.8460, 95),   # Vallon
    (43.0760, 5.8390, 75),   # Retour sous-bois
    (43.0762, 5.8315, 60)    # Janas
]

# 2. Gros Cerveau (Sanary -> Ouest -> Sommet Fort -> Crete Est -> Ouvrage Pointe -> Nord -> Sanary)
anchors_gros_cerveau = [
    (43.1285, 5.8080, 65),   # Depart Sanary
    (43.1298, 5.8115, 95),   # Sentier Oliviers
    (43.1315, 5.8155, 140),
    (43.1335, 5.8200, 195),
    (43.1358, 5.8245, 255),  # Arete Ouest
    (43.1382, 5.8295, 315),
    (43.1410, 5.8350, 375),
    (43.1435, 5.8405, 420),
    (43.1448, 5.8450, 442),  # Fort Sommet
    (43.1455, 5.8500, 435),  # Crete Est
    (43.1442, 5.8550, 410),  # Ouvrage de la Pointe
    (43.1420, 5.8585, 365),  # Panorama Gorges Ollioules
    (43.1395, 5.8540, 315),  # Descente Sud
    (43.1370, 5.8475, 260),  # Piste des Pins
    (43.1345, 5.8400, 205),
    (43.1320, 5.8315, 150),  # Vallon
    (43.1300, 5.8210, 100),
    (43.1288, 5.8135, 75),
    (43.1285, 5.8080, 65)    # Arrivee
]

# 3. Portissol (Port Sanary -> Pitié -> Portissol -> Cride -> Gorguette -> Lido -> Bandol -> Pinedes -> Sanary)
anchors_portissol = [
    (43.1189, 5.8033, 5),    # Port Sanary
    (43.1175, 5.8005, 35),   # Chapelle Pitie
    (43.1160, 5.7975, 2),    # Portissol Plage
    (43.1152, 5.7940, 24),   # Pointe Cride
    (43.1165, 5.7905, 4),    # Gorguette Anse
    (43.1180, 5.7870, 32),   # Sentier Douanier
    (43.1205, 5.7830, 15),   # Rouveau
    (43.1235, 5.7785, 22),   # Lido
    (43.1265, 5.7735, 12),
    (43.1300, 5.7680, 5),    # Bandol
    (43.1330, 5.7620, 2),    # Port Bandol
    (43.1315, 5.7665, 25),   # Colline Beaucours
    (43.1280, 5.7725, 45),   # Pinedes
    (43.1245, 5.7790, 35),
    (43.1215, 5.7845, 38),   # Voie verte
    (43.1185, 5.7895, 22),
    (43.1168, 5.7945, 12),
    (43.1172, 5.7990, 8),
    (43.1189, 5.8033, 5)     # Port Sanary
]

# 4. Sainte-Baume (Hostellerie -> Chemin des Roys -> Grotte -> Saint-Pilon -> Cretes GR9 -> Pas Cabre -> Hostellerie)
anchors_baume = [
    (43.3320, 5.7590, 670),  # Hostellerie
    (43.3305, 5.7610, 705),  # Foret royale
    (43.3288, 5.7635, 755),
    (43.3270, 5.7660, 820),  # Oratoire
    (43.3250, 5.7680, 890),  # Canape
    (43.3235, 5.7685, 940),  # Sanctuaire Grotte
    (43.3220, 5.7690, 985),  # Marches
    (43.3210, 5.7685, 994),  # Saint-Pilon
    (43.3200, 5.7730, 1030), # Cretes GR9
    (43.3188, 5.7790, 1075), # Falaises Sud
    (43.3175, 5.7860, 1120),
    (43.3160, 5.7940, 1147), # Signal Beguines
    (43.3180, 5.7910, 1060), # Pas de la Cabre
    (43.3210, 5.7830, 950),  # Descente Nord
    (43.3245, 5.7750, 850),  # Sous-bois
    (43.3280, 5.7670, 760),  # Pelerins
    (43.3308, 5.7615, 695),
    (43.3320, 5.7590, 670)   # Hostellerie
]

# 5. Calanques (Port-Miou -> Port-Pin -> Cadeiron -> Belvedere -> Plage En-Vau -> Vallon En-Vau -> Port-Miou)
anchors_calanques = [
    (43.2130, 5.5250, 20),   # Port-Miou
    (43.2115, 5.5235, 12),
    (43.2095, 5.5215, 25),
    (43.2075, 5.5190, 18),
    (43.2060, 5.5165, 4),    # Port-Pin Plage
    (43.2045, 5.5135, 60),   # Plateau Cadeiron
    (43.2028, 5.5100, 105),
    (43.2010, 5.5065, 145),  # Crete
    (43.1985, 5.5015, 175),  # Belvedere En-Vau
    (43.1995, 5.4985, 90),   # Pierrier descente
    (43.1992, 5.5030, 2),    # Plage En-Vau
    (43.2015, 5.5065, 65),   # Vallon En-Vau
    (43.2040, 5.5110, 95),   # Piste DFCI
    (43.2070, 5.5160, 60),
    (43.2095, 5.5205, 30),
    (43.2130, 5.5250, 20)    # Port-Miou
]

# 6. Mont Faron (Telepherique -> Tour Blanche -> Point de Vue -> Memorial -> Fort Faron -> Saint-Antoine -> Faron bas)
anchors_faron = [
    (43.1420, 5.9280, 180),  # Telepherique bas
    (43.1435, 5.9295, 225),  # Tour Blanche
    (43.1455, 5.9315, 280),
    (43.1478, 5.9340, 345),
    (43.1502, 5.9365, 410),  # Point de Vue
    (43.1528, 5.9390, 475),
    (43.1552, 5.9415, 530),
    (43.1570, 5.9450, 584),  # Sommet Faron
    (43.1585, 5.9495, 565),  # Fort Croix Faron
    (43.1595, 5.9540, 540),  # Panorama Rade
    (43.1575, 5.9580, 495),  # Fort Faron
    (43.1540, 5.9595, 445),
    (43.1505, 5.9560, 390),  # Piste Est
    (43.1480, 5.9500, 335),
    (43.1495, 5.9430, 375),  # Piste Nord
    (43.1525, 5.9380, 435),  # Fort Saint-Antoine
    (43.1540, 5.9330, 470),
    (43.1515, 5.9290, 410),  # Descente Nord-Ouest
    (43.1480, 5.9265, 330),  # Vallon Dardennes
    (43.1445, 5.9260, 245),  # Pins
    (43.1420, 5.9280, 180)   # Telepherique bas
]

circuits = [
    ("Cap Sicié", anchors_cap_sicie, "Six-Fours-les-Plages - Cap Sicié & Notre-Dame du Mai", "Six_Fours_Cap_Sicie.gpx", "sample_cap_sicie"),
    ("Gros Cerveau", anchors_gros_cerveau, "Sanary-sur-Mer - Le Gros Cerveau & Fort de la Cride", "Sanary_Gros_Cerveau.gpx", "sample_gros_cerveau"),
    ("Portissol", anchors_portissol, "Sanary-sur-Mer - Sentier Littoral & Baie de Portissol", "Sanary_Portissol_Littoral.gpx", "sample_portissol"),
    ("Sainte-Baume", anchors_baume, "Plan-d'Aups-Sainte-Baume - Crêtes & Grotte Sacrée", "Sainte_Baume_Cretes.gpx", "sample_sainte_baume"),
    ("Calanques", anchors_calanques, "Cassis - Calanques de Port-Pin & En-Vau", "Cassis_Calanques_En_Vau.gpx", "sample_calanques"),
    ("Mont Faron", anchors_faron, "Toulon - Mont Faron & Sentier des Forts", "Toulon_Mont_Faron.gpx", "sample_mont_faron")
]

for name, anchors, full_name, filename, sid in circuits:
    pts, dist, dp, dm = build_circuit(anchors, 14)
    print(f'{name:15s} -> {dist:4.1f} km | D+ {dp:3d}m | D- {dm:3d}m | {len(pts)} GPS points')
