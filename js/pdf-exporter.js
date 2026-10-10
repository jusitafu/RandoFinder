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
    doc.text("Les Randonneurs Sanaryens &bull; JLD Apps - 2026", pageWidth - margin - 6, currentY + 17, { align: 'right' });

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

    // 5. Option 1: Map Snapshot with Route (IGN / OpenTopoMap)
    if (options.includeMap) {
      doc.setFillColor(241, 245, 249);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(15, 23, 42);
      doc.text("1. CARTE DE L'ITINÉRAIRE (FOND IGN TOP 25 / OPENTOPOMAP)", margin, currentY);
      currentY += 4;

      try {
        const mapImgData = await this.renderStaticMap(hike, 720, 420);
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
      doc.text(`Les Randonneurs Sanaryens - ${hike.name} | Page ${p}/${totalPages}`, margin, pageHeight - 8);
      doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')}`, pageWidth - margin, pageHeight - 8, { align: 'right' });
    }

    // Clean filename for PDF
    const safeName = (hike.name || 'Fiche_Randonnee').replace(/[\\/:*?"<>|]/g, '_');
    doc.save(`Fiche_${safeName}.pdf`);
  }

  /**
   * Render a static raster map with OpenTopoMap / IGN tiles and GPX track vector
   */
  static async renderStaticMap(hike, imgWidth = 720, imgHeight = 420) {
    const canvas = document.createElement('canvas');
    canvas.width = imgWidth;
    canvas.height = imgHeight;
    const ctx = canvas.getContext('2d');

    const bounds = hike.bounds;
    const minLat = bounds[0][0];
    const minLon = bounds[0][1];
    const maxLat = bounds[1][0];
    const maxLon = bounds[1][1];

    // Compute appropriate zoom level
    const centerLat = (minLat + maxLat) / 2;
    const centerLon = (minLon + maxLon) / 2;

    const latDiff = Math.max(0.005, maxLat - minLat);
    const lonDiff = Math.max(0.005, maxLon - minLon);

    let zoom = 14;
    const maxSpan = Math.max(latDiff * 1.3, lonDiff * 1.3);
    if (maxSpan > 0.6) zoom = 9;
    else if (maxSpan > 0.3) zoom = 10;
    else if (maxSpan > 0.15) zoom = 11;
    else if (maxSpan > 0.08) zoom = 12;
    else if (maxSpan > 0.04) zoom = 13;
    else if (maxSpan > 0.02) zoom = 14;
    else zoom = 15;

    // Convert lat/lon to tile coords
    const lon2tile = (lon, z) => ((lon + 180) / 360) * Math.pow(2, z);
    const lat2tile = (lat, z) =>
      ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) *
      Math.pow(2, z);

    const tile2lon = (x, z) => (x / Math.pow(2, z)) * 360 - 180;
    const tile2lat = (y, z) => {
      const n = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
      return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    };

    const centerTileX = lon2tile(centerLon, zoom);
    const centerTileY = lat2tile(centerLat, zoom);

    const tilesAcross = Math.ceil(imgWidth / 256) + 2;
    const tilesDown = Math.ceil(imgHeight / 256) + 2;

    const startTileX = Math.floor(centerTileX - tilesAcross / 2);
    const startTileY = Math.floor(centerTileY - tilesDown / 2);

    // Pixel offset from canvas center
    const centerPixelX = imgWidth / 2;
    const centerPixelY = imgHeight / 2;

    // Tile server template (OpenTopoMap with fallback to OSM)
    const tileUrl = (x, y, z) => `https://a.tile.opentopomap.org/${z}/${x}/${y}.png`;
    const fallbackUrl = (x, y, z) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;

    const tilePromises = [];

    for (let tx = 0; tx < tilesAcross; tx++) {
      for (let ty = 0; ty < tilesDown; ty++) {
        const tileX = startTileX + tx;
        const tileY = startTileY + ty;

        const p = new Promise((resolve) => {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.onload = () => {
            const px = centerPixelX + (tileX - centerTileX) * 256;
            const py = centerPixelY + (tileY - centerTileY) * 256;
            ctx.drawImage(img, px, py, 256, 256);
            resolve();
          };
          img.onerror = () => {
            // Try fallback OSM tile
            const fImg = new Image();
            fImg.crossOrigin = 'anonymous';
            fImg.onload = () => {
              const px = centerPixelX + (tileX - centerTileX) * 256;
              const py = centerPixelY + (tileY - centerTileY) * 256;
              ctx.drawImage(fImg, px, py, 256, 256);
              resolve();
            };
            fImg.onerror = () => resolve(); // continue even if tile missing
            fImg.src = fallbackUrl(tileX, tileY, zoom);
          };
          img.src = tileUrl(tileX, tileY, zoom);
        });

        tilePromises.push(p);
      }
    }

    // Fill white background first
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(0, 0, imgWidth, imgHeight);

    // Wait max 3.5 seconds for tiles to load
    await Promise.race([
      Promise.all(tilePromises),
      new Promise(r => setTimeout(r, 3500))
    ]);

    // Helper: convert (lat, lon) to canvas (x, y)
    const latLonToPixel = (lat, lon) => {
      const tx = lon2tile(lon, zoom);
      const ty = lat2tile(lat, zoom);
      return {
        x: centerPixelX + (tx - centerTileX) * 256,
        y: centerPixelY + (ty - centerTileY) * 256
      };
    };

    // Draw GPX track with high contrast
    if (hike.points && hike.points.length > 0) {
      // 1. White border casing
      ctx.beginPath();
      let first = latLonToPixel(hike.points[0].lat, hike.points[0].lon);
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < hike.points.length; i++) {
        const pt = latLonToPixel(hike.points[i].lat, hike.points[i].lon);
        ctx.lineTo(pt.x, pt.y);
      }
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();

      // 2. Red track line
      ctx.beginPath();
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < hike.points.length; i++) {
        const pt = latLonToPixel(hike.points[i].lat, hike.points[i].lon);
        ctx.lineTo(pt.x, pt.y);
      }
      ctx.strokeStyle = '#e11d48'; // Rose red for high visibility
      ctx.lineWidth = 4;
      ctx.stroke();

      // 3. Start Point Marker (Green Flag)
      const startPix = latLonToPixel(hike.startPoint.lat, hike.startPoint.lon);
      ctx.beginPath();
      ctx.arc(startPix.x, startPix.y, 8, 0, Math.PI * 2);
      ctx.fillStyle = '#10b981'; // Emerald
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // 4. End Point Marker (if not loop)
      if (!hike.isLoop && hike.endPoint) {
        const endPix = latLonToPixel(hike.endPoint.lat, hike.endPoint.lon);
        ctx.beginPath();
        ctx.arc(endPix.x, endPix.y, 8, 0, Math.PI * 2);
        ctx.fillStyle = '#ef4444'; // Red
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }
    }

    // Add map legend badge
    ctx.fillStyle = 'rgba(15, 23, 42, 0.75)';
    ctx.roundRect 
      ? ctx.roundRect(12, imgHeight - 32, 210, 22, 4)
      : ctx.rect(12, imgHeight - 32, 210, 22);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = '10px Inter, sans-serif';
    ctx.fillText("🟢 Départ   🔴 Arrivée   — Itinéraire", 20, imgHeight - 18);

    return canvas.toDataURL('image/jpeg', 0.92);
  }
}

window.PDFExporter = PDFExporter;
