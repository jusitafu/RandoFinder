/**
 * PDF Exporter for "Fiche Randonnée"
 * Includes IGN / Topo Map snapshot, Elevation Profile & Notes
 * Les Randonneurs Sanaryens - JLD Apps 2026
 */

class PDFExporter {
  /**
   * Generate and download the Fiche Randonnée PDF
   * @param {Object} hike - Hike data
   * @param {Object} options - { includeMap: bool, includeProfile: bool, includeNotes: bool }
   */
  static async exportFichePDF(hike, options = { includeMap: true, includeProfile: true, includeNotes: true }) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const pageWidth = 210;
    const pageHeight = 297;
    const margin = 14;
    const contentWidth = pageWidth - (margin * 2);

    let currentY = margin;

    // 1. Header Banner
    doc.setFillColor(15, 23, 42); // Slate 900
    doc.rect(margin, currentY, contentWidth, 22, 'F');

    // Club Logo or Text
    try {
      const logoImg = document.getElementById('app-logo');
      if (logoImg && logoImg.complete && logoImg.naturalWidth > 0) {
        // Draw logo
        const logoAspect = logoImg.naturalWidth / logoImg.naturalHeight;
        const logoH = 14;
        const logoW = logoH * logoAspect;
        doc.addImage(logoImg, 'PNG', margin + 4, currentY + 4, Math.min(logoW, 60), logoH);
      }
    } catch (e) {
      console.warn("Logo non disponible pour le PDF", e);
    }

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text("FICHE RANDONNÉE", pageWidth - margin - 6, currentY + 11, { align: 'right' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(203, 213, 225); // Slate 300
    doc.text("RandoFinder - JLDApps 2026", pageWidth - margin - 6, currentY + 17, { align: 'right' });

    currentY += 28;

    // 2. Hike Title & Place
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    
    // Split long titles if needed
    const titleLines = doc.splitTextToSize(hike.name || "Randonnée", contentWidth);
    doc.text(titleLines, margin, currentY);
    currentY += (titleLines.length * 6) + 4;

    // 3. Metrics Summary Box (Grid of 4 badges)
    const boxH = 18;
    const colW = (contentWidth - 6) / 4;

    const metrics = [
      { label: "DISTANCE", val: `${hike.distanceKm} km`, icon: "📏" },
      { label: "DÉNIVELÉ D+", val: `+${hike.elevationGain} m`, icon: "↗️" },
      { label: "ALTITUDE", val: `${hike.minElevation}m / ${hike.maxElevation}m`, icon: "⛰️" },
      { label: "DURÉE ESTIMÉE", val: hike.estimatedDuration || "3h30", icon: "⏱️" }
    ];

    metrics.forEach((m, idx) => {
      const bx = margin + (idx * (colW + 2));
      doc.setFillColor(248, 250, 252); // Slate 50
      doc.setDrawColor(226, 232, 240); // Slate 200
      doc.roundedRect(bx, currentY, colW, boxH, 2, 2, 'FD');

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(100, 116, 139); // Slate 500
      doc.text(m.label, bx + (colW / 2), currentY + 5.5, { align: 'center' });

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42); // Slate 900
      doc.text(m.val, bx + (colW / 2), currentY + 13, { align: 'center' });
    });

    currentY += boxH + 8;

    // 4. GPS Coordinates Departure Info
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    const startCoord = `Point de départ GPS : Lat ${hike.startPoint.lat.toFixed(5)}°, Lon ${hike.startPoint.lon.toFixed(5)}° (${hike.isLoop ? 'Boucle' : 'Aller simple / Traversée'})`;
    doc.text(startCoord, margin, currentY);
    currentY += 6;

    // 5. Option 1: Map Snapshot with Route (IGN / OpenTopoMap / OSM)
    if (options.includeMap) {
      const mapLayer = options.mapLayer || 'ign';
      const layerLabels = {
        'ign': "FOND OFFICIEL IGN TOP 25 / GÉOPLATEFORME",
        'opentopo': "FOND OPENTOPOMAP (RELIEF MONDIAL)",
        'osmfr': "FOND OPENSTREETMAP FRANCE (SENTIERS)",
        'satellite': "FOND SATELLITE HAUTE DÉFINITION (IGN / ESRI)"
      };
      const layerLabel = layerLabels[mapLayer] || "FOND TOPOGRAPHIQUE";

      doc.setFillColor(241, 245, 249);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text(`1. CARTE DE L'ITINÉRAIRE (${layerLabel})`, margin, currentY);
      currentY += 4;

      try {
        const mapImgData = await this.renderStaticMap(hike, 720, 420, mapLayer);
        if (mapImgData) {
          const mapH = 75; // mm
          doc.addImage(mapImgData, 'JPEG', margin, currentY, contentWidth, mapH);
          doc.setDrawColor(203, 213, 225);
          doc.rect(margin, currentY, contentWidth, mapH);
          currentY += mapH + 8;
        }
      } catch (err) {
        console.warn("Erreur lors de la génération de l'image de carte :", err);
      }
    }

    // 6. Option 2: Elevation Profile
    if (options.includeProfile) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text("2. PROFIL ALTIMÉTRIQUE", margin, currentY);
      currentY += 4;

      try {
        const profileObj = new ElevationProfile('dummy');
        profileObj.currentHike = hike;
        const profileImgData = profileObj.generateChartImage(900, 320);
        if (profileImgData) {
          const profH = 45; // mm
          doc.addImage(profileImgData, 'PNG', margin, currentY, contentWidth, profH);
          doc.setDrawColor(203, 213, 225);
          doc.rect(margin, currentY, contentWidth, profH);
          currentY += profH + 8;
        }
      } catch (err) {
        console.warn("Erreur génération profil PDF :", err);
      }
    }

    // 7. Option 3: Free Notes & Practical Info
    if (options.includeNotes) {
      // Check if page overflow, create page 2 if needed
      if (currentY > pageHeight - 45) {
        doc.addPage();
        currentY = margin + 5;
      }

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text("3. NOTES LIBRES & CONSEILS PRATIQUES", margin, currentY);
      currentY += 5;

      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      const notesH = Math.min(45, pageHeight - currentY - margin - 15);
      doc.roundedRect(margin, currentY, contentWidth, notesH, 2, 2, 'FD');

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(51, 65, 85);

      const notesText = hike.notes && hike.notes.trim().length > 0 
        ? hike.notes 
        : "Aucune note particulière pour cette randonnée. Pensez à emporter de l'eau en quantité suffisante, de bonnes chaussures de marche et à vérifier la météo avant le départ.";

      const splitNotes = doc.splitTextToSize(notesText, contentWidth - 8);
      doc.text(splitNotes, margin + 4, currentY + 6);
      currentY += notesH + 6;
    }

    // Footer on all pages
    const totalPages = doc.internal.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184); // Slate 400
      doc.text(`RandoFinder - ${hike.name} | Page ${p}/${totalPages}`, margin, pageHeight - 8);
      doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')}`, pageWidth - margin, pageHeight - 8, { align: 'right' });
    }

    // Clean filename for PDF
    const safeName = (hike.name || 'Fiche_Randonnee').replace(/[\\/:*?"<>|]/g, '_');
    doc.save(`Fiche_${safeName}.pdf`);
  }

  /**
   * Render a static raster map with IGN Top 25 / OpenTopoMap / OSM tiles and GPX track vector
   */
  static async renderStaticMap(hike, imgWidth = 720, imgHeight = 420, mapLayer = 'ign') {
    const canvas = document.createElement('canvas');
    canvas.width = imgWidth;
    canvas.height = imgHeight;
    const ctx = canvas.getContext('2d');

    // 1. Fond immédiat avant tout chargement
    ctx.fillStyle = '#e2e8f0'; // Fond neutre terre/mer
    ctx.fillRect(0, 0, imgWidth, imgHeight);

    if (!hike) return null;

    // 2. Assurer que les points de trace existent
    if ((!hike.points || hike.points.length === 0) && hike.rawGpx && typeof GPXParser !== 'undefined') {
      try {
        const parsed = GPXParser.parse(hike.rawGpx, hike.filename || 'trace.gpx');
        if (parsed.points && parsed.points.length > 0) {
          hike.points = parsed.points;
          hike.bounds = parsed.bounds;
        }
      } catch (e) {}
    }

    // 3. Calculer ou sécuriser les bounds
    let bounds = hike.bounds;
    if ((!bounds || !bounds[0] || !bounds[1]) && hike.points && hike.points.length > 0) {
      let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
      for (const p of hike.points) {
        if (p.lat < minLat) minLat = p.lat;
        if (p.lat > maxLat) maxLat = p.lat;
        if (p.lon < minLon) minLon = p.lon;
        if (p.lon > maxLon) maxLon = p.lon;
      }
      bounds = [[minLat, minLon], [maxLat, maxLon]];
      hike.bounds = bounds;
    }

    if (!bounds || !bounds[0] || !bounds[1]) {
      const sp = hike.startPoint || { lat: 43.1189, lon: 5.8033 };
      bounds = [[sp.lat - 0.015, sp.lon - 0.015], [sp.lat + 0.015, sp.lon + 0.015]];
    }

    const minLat = bounds[0][0];
    const minLon = bounds[0][1];
    const maxLat = bounds[1][0];
    const maxLon = bounds[1][1];

    const centerLat = (minLat + maxLat) / 2;
    const centerLon = (minLon + maxLon) / 2;

    // Calcul précis du zoom optimal pour cadrer la trace avec une marge esthétique
    const lonDiff = Math.max(0.002, maxLon - minLon);
    const latToY = (lat) => {
      const s = Math.sin((lat * Math.PI) / 180);
      return Math.log((1 + s) / (1 - s)) / 2;
    };
    const yDiff = Math.max(0.001, Math.abs(latToY(maxLat) - latToY(minLat)));
    const padding = 0.80; // 20% de marge autour du tracé
    const zoomX = Math.log2((imgWidth * padding * 360) / (lonDiff * 256));
    const zoomY = Math.log2((imgHeight * padding * 2 * Math.PI) / (yDiff * 256));
    let zoom = Math.floor(Math.min(zoomX, zoomY));
    zoom = Math.max(8, Math.min(16, zoom));

    // Convertisseurs lat/lon vers coordonnées de tuiles
    const lon2tile = (lon, z) => ((lon + 180) / 360) * Math.pow(2, z);
    const lat2tile = (lat, z) =>
      ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) *
      Math.pow(2, z);

    const centerTileX = lon2tile(centerLon, zoom);
    const centerTileY = lat2tile(centerLat, zoom);

    const centerPixelX = imgWidth / 2;
    const centerPixelY = imgHeight / 2;

    const tilesAcross = Math.ceil(imgWidth / 256) + 2;
    const tilesDown = Math.ceil(imgHeight / 256) + 2;

    const startTileX = Math.floor(centerTileX - tilesAcross / 2);
    const startTileY = Math.floor(centerTileY - tilesDown / 2);

    // Détection si la randonnée est en France (IGN dessert la France métropolitaine + DOM)
    const isInsideFrance = (centerLat >= 41.0 && centerLat <= 51.5 && centerLon >= -5.5 && centerLon <= 10.0);

    // URLs des serveurs de tuiles cartographiques
    const ignPlanUrl = (x, y, z) => `https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX=${z}&TILEROW=${y}&TILECOL=${x}&FORMAT=image%2Fpng`;
    
    const openTopoUrl = (x, y, z) => {
      const sub = ['a', 'b', 'c'][Math.abs(x + y) % 3];
      return `https://${sub}.tile.opentopomap.org/${z}/${x}/${y}.png`;
    };
    
    const osmFrUrl = (x, y, z) => {
      const sub = ['a', 'b', 'c'][Math.abs(x + y) % 3];
      return `https://${sub}.tile.openstreetmap.fr/osmfr/${z}/${x}/${y}.png`;
    };
    
    const osmStdUrl = (x, y, z) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;

    const esriSatUrl = (x, y, z) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;

    // Établir la cascade de fournisseurs selon le choix demandé
    let primaryUrlFn, fallbackUrlFn1, fallbackUrlFn2;
    let attributionText = '© IGN France / OpenStreetMap';

    if (mapLayer === 'opentopo') {
      primaryUrlFn = openTopoUrl;
      fallbackUrlFn1 = isInsideFrance ? ignPlanUrl : osmFrUrl;
      fallbackUrlFn2 = osmStdUrl;
      attributionText = '© OpenTopoMap / OpenStreetMap';
    } else if (mapLayer === 'osmfr') {
      primaryUrlFn = osmFrUrl;
      fallbackUrlFn1 = isInsideFrance ? ignPlanUrl : openTopoUrl;
      fallbackUrlFn2 = osmStdUrl;
      attributionText = '© OpenStreetMap France';
    } else if (mapLayer === 'satellite') {
      primaryUrlFn = esriSatUrl;
      fallbackUrlFn1 = isInsideFrance ? ignPlanUrl : osmStdUrl;
      fallbackUrlFn2 = osmStdUrl;
      attributionText = '© Esri World Imagery / IGN';
    } else {
      // 'ign' par défaut : Plan IGN v2 officiel pour la France, OpenTopo/OSM pour l'étranger
      if (isInsideFrance) {
        primaryUrlFn = ignPlanUrl;
        fallbackUrlFn1 = osmFrUrl;   // Très utile pour la mer en bord de côte où IGN retourne 404
        fallbackUrlFn2 = openTopoUrl;
        attributionText = '© IGN France - Géoplateforme (Top 25)';
      } else {
        primaryUrlFn = openTopoUrl;
        fallbackUrlFn1 = osmFrUrl;
        fallbackUrlFn2 = osmStdUrl;
        attributionText = '© OpenTopoMap / OpenStreetMap';
      }
    }

    // Fonction de chargement résiliente pour chaque tuile
    const loadTile = (tileX, tileY) => {
      return new Promise((resolve) => {
        const px = centerPixelX + (tileX - centerTileX) * 256;
        const py = centerPixelY + (tileY - centerTileY) * 256;

        const tryImg = (urlFn, nextFallback) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            try {
              ctx.drawImage(img, px, py, 256, 256);
            } catch (e) {}
            resolve();
          };
          img.onerror = () => {
            if (nextFallback) {
              nextFallback();
            } else {
              resolve(); // Ne jamais bloquer les autres tuiles
            }
          };
          img.src = urlFn(tileX, tileY, zoom);
        };

        // Cascade : Primaire -> Repli 1 -> Repli 2
        tryImg(primaryUrlFn, () => {
          tryImg(fallbackUrlFn1, () => {
            tryImg(fallbackUrlFn2, () => resolve());
          });
        });
      });
    };

    // Lancer tous les téléchargements de tuiles en parallèle
    const tilePromises = [];
    for (let tx = 0; tx < tilesAcross; tx++) {
      for (let ty = 0; ty < tilesDown; ty++) {
        tilePromises.push(loadTile(startTileX + tx, startTileY + ty));
      }
    }

    // Attendre jusqu'à 6 secondes max
    await Promise.race([
      Promise.all(tilePromises),
      new Promise(r => setTimeout(r, 6000))
    ]);

    // Helper: conversion (lat, lon) vers pixels canvas
    const latLonToPixel = (lat, lon) => {
      const tx = lon2tile(lon, zoom);
      const ty = lat2tile(lat, zoom);
      return {
        x: centerPixelX + (tx - centerTileX) * 256,
        y: centerPixelY + (ty - centerTileY) * 256
      };
    };

    // Dessiner le tracé GPX avec contraste élevé
    if (hike.points && hike.points.length > 0) {
      // 1. Bordure blanche extérieure pour détacher la trace de tout fond cartographique
      ctx.beginPath();
      let first = latLonToPixel(hike.points[0].lat, hike.points[0].lon);
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < hike.points.length; i++) {
        const pt = latLonToPixel(hike.points[i].lat, hike.points[i].lon);
        ctx.lineTo(pt.x, pt.y);
      }
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();

      // 2. Trait rouge vif (rose-red) haute visibilité
      ctx.beginPath();
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < hike.points.length; i++) {
        const pt = latLonToPixel(hike.points[i].lat, hike.points[i].lon);
        ctx.lineTo(pt.x, pt.y);
      }
      ctx.strokeStyle = '#e11d48'; // Rose red
      ctx.lineWidth = 3.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();

      // 3. Marqueur de départ (vert émeraude avec halo blanc)
      const startPix = latLonToPixel(hike.startPoint.lat, hike.startPoint.lon);
      ctx.beginPath();
      ctx.arc(startPix.x, startPix.y, 8, 0, Math.PI * 2);
      ctx.fillStyle = '#10b981';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // 4. Marqueur d'arrivée (si hors boucle)
      if (!hike.isLoop && hike.endPoint) {
        const endPix = latLonToPixel(hike.endPoint.lat, hike.endPoint.lon);
        ctx.beginPath();
        ctx.arc(endPix.x, endPix.y, 8, 0, Math.PI * 2);
        ctx.fillStyle = '#ef4444';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
    }

    // 5. Légende élégante en bas à gauche
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    if (ctx.roundRect) {
      ctx.roundRect(10, imgHeight - 30, 255, 22, 5);
    } else {
      ctx.rect(10, imgHeight - 30, 255, 22);
    }
    ctx.fill();

    // Pastille verte Départ
    ctx.beginPath();
    ctx.arc(22, imgHeight - 19, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = '#10b981';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Pastille rouge Arrivée
    ctx.beginPath();
    ctx.arc(92, imgHeight - 19, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = '#ef4444';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // Trait rose Tracé GPS
    ctx.beginPath();
    ctx.moveTo(162, imgHeight - 19);
    ctx.lineTo(180, imgHeight - 19);
    ctx.strokeStyle = '#e11d48';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText("Départ", 32, imgHeight - 16);
    ctx.fillText("Arrivée", 102, imgHeight - 16);
    ctx.fillText("Tracé GPS", 188, imgHeight - 16);

    // 6. Mention de copyright en bas à droite
    ctx.fillStyle = 'rgba(15, 23, 42, 0.65)';
    const textWidth = ctx.measureText(attributionText).width;
    if (ctx.roundRect) {
      ctx.roundRect(imgWidth - textWidth - 22, imgHeight - 22, textWidth + 16, 16, 3);
    } else {
      ctx.rect(imgWidth - textWidth - 22, imgHeight - 22, textWidth + 16, 16);
    }
    ctx.fill();

    ctx.fillStyle = '#f8fafc';
    ctx.font = '9px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.fillText(attributionText, imgWidth - textWidth - 14, imgHeight - 10);

    return canvas.toDataURL('image/jpeg', 0.92);
  }
}

window.PDFExporter = PDFExporter;
