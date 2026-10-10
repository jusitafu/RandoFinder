# Randonneurs Sanaryens - Gestionnaire GPX & Fiches Randonnée
*Application conçue pour Les Randonneurs Sanaryens &bull; JLD Apps - 2026*

---

## 🌟 Fonctionnalités Principales

### 1. 🔍 Restitution & Recherche Géographique
* **Sélection du lieu de référence** :
  * Recherche par nom de ville / lieu (autocomplétion OpenStreetMap / Nominatim).
  * Bouton **Position GPS** (« Ma position »).
  * Clic direct n'importe où sur la carte pour déplacer le centre de recherche.
  * Par défaut centré sur **Sanary-sur-Mer**.
* **Curseur de rayon interactif** : de **10 à 1000 km** avec cercle visuel dynamique sur la carte.
* **Affichage cartographique multi-fonds** :
  * **IGN Plan & Topo (Géoplateforme libre)**
  * **OpenTopoMap (Relief & courbes de niveau)**
  * **OpenStreetMap standard**
  * **Satellite / Orthophoto**
* **Interactivité au survol & clic** :
  * Par défaut : affichage fluide des points de départ uniquement.
  * Au survol d'un marqueur ou d'une ligne du tableau : tracé complet instantané et ouverture du **profil altimétrique interactif**.
  * Synchronisation en temps réel : glisser sur le profil d'altitude déplace le pointeur sur la carte.
* **Tableau triable** : distance au lieu choisi, nom, longueur (km), dénivelé D+ (m), altitudes min/max, notes.

---

### 2. 📤 Chargement & Renommage Automatique
* **Import unitaire ou par lot** (glisser-déposer ou sélection multiple de fichiers `.gpx`).
* **Calcul automatique des métriques** : distance cumulée, filtrage du bruit GPS pour le dénivelé positif D+, altitudes min/max.
* **Géocodage inverse** : proposition automatique du nom normalisé : `[Lieu ou Ville] - [XX.X km] - [D+ XXXm]`.
* **Édition personnalisée** : modification libre du nom proposé et champ de **notes libres** (conseils, balisage, passages remarquables).
* **Enregistrement double** : direct dans le dossier de votre disque dur (Chrome PC) et dans la base interne de l'appareil (IndexedDB).

---

### 3. 📥 Téléchargement & Fiche Randonnée (PDF Haute Définition)
Fenêtre modale avec options à la carte :
* [x] **Fichier GPX brut** (avec notes intégrées, compatible Garmin, montres GPS, smartphones).
* [x] **Fiche Randonnée PDF / Impression A4** incluant au choix :
  * **Option 1** : Carte de l'itinéraire sur fond IGN Top 25 / OpenTopoMap avec points de départ/arrivée et échelle.
  * **Option 2** : Profil altimétrique vectoriel haute résolution avec repères d'altitude.
  * **Option 3** : Notes libres saisies à l'upload et données techniques (coordonnées GPS du départ, durée estimée).

---

### 4. 📱 Compatibilité Multi-Appareils
* **Sur PC (Chrome / Edge)** : Connexion directe à votre dossier sur disque dur via l'API *File System Access*.
* **Sur Smartphone & Tablette (iOS / Android / Safari / Firefox)** : Fonctionne 100% hors-ligne avec la base de données interne du navigateur (*IndexedDB*), avec fonction d'export/import de sauvegarde JSON.

---

## 🚀 Démarrage rapide

1. Double-cliquez sur `Lancer_Application.bat` ou ouvrez directement `index.html` dans Google Chrome.
2. Pour tester immédiatement, 6 randonnées emblématiques du club (Gros Cerveau, Cap Sicié, Sainte-Baume, Portissol, Calanques...) sont préchargées !
