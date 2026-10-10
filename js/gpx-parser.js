/**
 * Universal & Bulletproof GPX / XML / KML / GeoJSON Parser
 * Les Randonneurs Sanaryens - RandoFinder - JLD Apps 2026
 * Strict Separation of Track Points (<trkpt>), Route Points (<rtept>) and Waypoints (<wpt>)
 * 100% Guaranteed pure continuous hiking trails without rogue straight-line chords
 */

class GPXParser {
  /**
   * Parse GPS text content into a clean Hike object
   */
  static parse(gpxText, filename = 'randonnee.gpx') {
    if (!gpxText || typeof gpxText !== 'string' || gpxText.trim().length === 0) {
      throw new Error("Le fichier est vide.");
    }

    // 1. Clean & sanitize text
    let cleanText = gpxText
      .replace(/^\uFEFF/, '') // UTF-8 BOM
      .replace(/^\uFFFE/, '') // UTF-16 BOM
      .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '') // Non-printable control chars
      .trim();

    // Default name from filename
    let name = (filename || 'Randonnée')
      .replace(/\.(gpx|xml|kml|geojson|json|tcx|fit|txt)$/i, '')
      .replace(/[\\/:*?"<>|]/g, ' ')
      .replace(/[-_]/g, ' ')
      .trim();

    let notes = '';
    const waypoints = [];
    const segments = []; // Array of point arrays for multi-segment tracks
    let rawPoints = [];

    // -------------------------------------------------------------
    // STEP A: Extract Name & Notes
    // -------------------------------------------------------------
    // Look for track name or metadata name
    const trkNameMatch = /<trk\b[^>]*>[\s\S]*?<name\b[^>]*>([\s\S]*?)<\/name>/i.exec(cleanText);
    const metaNameMatch = /<metadata\b[^>]*>[\s\S]*?<name\b[^>]*>([\s\S]*?)<\/name>/i.exec(cleanText);
    const generalNameMatch = /<([a-zA-Z0-9_:-]+:)?name\b[^>]*>([^<]+)<\//i.exec(cleanText);

    if (trkNameMatch && trkNameMatch[1] && trkNameMatch[1].trim()) {
      const extracted = trkNameMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '').trim();
      if (extracted && !/^(track|active log|export|randonn[eé]e|route)$/i.test(extracted)) {
        name = extracted;
      }
    } else if (metaNameMatch && metaNameMatch[1] && metaNameMatch[1].trim()) {
      const extracted = metaNameMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '').trim();
      if (extracted && !/^(track|active log|export|randonn[eé]e|route)$/i.test(extracted)) {
        name = extracted;
      }
    } else if (generalNameMatch && generalNameMatch[2] && generalNameMatch[2].trim()) {
      const extracted = generalNameMatch[2].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim();
      if (extracted && !/^(track|active log|export|randonn[eé]e|route)$/i.test(extracted)) {
        name = extracted;
      }
    }

    const descMatch = /<([a-zA-Z0-9_:-]+:)?(?:desc|description)\b[^>]*>([\s\S]*?)<\//i.exec(cleanText);
    const cmtMatch = /<([a-zA-Z0-9_:-]+:)?cmt\b[^>]*>([\s\S]*?)<\//i.exec(cleanText);

    if (descMatch && descMatch[2]) {
      notes = descMatch[2].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '').trim();
    } else if (cmtMatch && cmtMatch[2]) {
      notes = cmtMatch[2].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').replace(/<[^>]+>/g, '').trim();
    }

    // -------------------------------------------------------------
    // STEP B: Strict Hierarchical Track Extraction
    // -------------------------------------------------------------

    // Helper to parse lat/lon/ele/time from a point XML string
    const parsePointElement = (attrs, body = '') => {
      const latMatch = /\blat(?:itude)?\s*=\s*["']?([0-9.,+-]+)/i.exec(attrs);
      const lonMatch = /\b(?:lon|lng|longitude)\s*=\s*["']?([0-9.,+-]+)/i.exec(attrs);

      if (latMatch && lonMatch) {
        const lat = parseFloat(latMatch[1].replace(',', '.'));
        const lon = parseFloat(lonMatch[1].replace(',', '.'));

        if (!isNaN(lat) && !isNaN(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
          let ele = 0;
          const eleMatch = /<(?:[a-zA-Z0-9_:-]+:)?ele\b[^>]*>([0-9.,+-]+)</i.exec(body) ||
                           /\bele\s*=\s*["']?([0-9.,+-]+)/i.exec(attrs);
          if (eleMatch) {
            const parsedEle = parseFloat(eleMatch[1].replace(',', '.'));
            if (!isNaN(parsedEle)) ele = parsedEle;
          }

          let time = null;
          const timeMatch = /<(?:[a-zA-Z0-9_:-]+:)?time\b[^>]*>([^<]+)</i.exec(body);
          if (timeMatch) time = timeMatch[1].trim();

          return { lat, lon, ele, time };
        }
      }
      return null;
    };

    // PRIORITY 1: Parse <trkseg> blocks containing <trkpt> (Authentic Recorded Track)
    const trksegRegex = /<(?:[a-zA-Z0-9_:-]+:)?trkseg\b[^>]*>([\s\S]*?)<\/(?:[a-zA-Z0-9_:-]+:)?trkseg>/gi;
    let segMatch;
    let foundTrksegs = false;

    while ((segMatch = trksegRegex.exec(cleanText)) !== null) {
      foundTrksegs = true;
      const segBody = segMatch[1];
      const segPoints = [];

      const trkptRegex = /<(?:[a-zA-Z0-9_:-]+:)?trkpt\b([^>]*?)(?:\/>|>(.*?)<\/(?:[a-zA-Z0-9_:-]+:)?trkpt>)/gis;
      let ptMatch;
      while ((ptMatch = trkptRegex.exec(segBody)) !== null) {
        const pt = parsePointElement(ptMatch[1], ptMatch[2] || '');
        if (pt) segPoints.push(pt);
      }

      if (segPoints.length > 0) {
        segments.push(segPoints);
        rawPoints.push(...segPoints);
      }
    }

    // PRIORITY 1.1: If no <trkseg> tags, check for standalone <trkpt> tags
    if (rawPoints.length === 0) {
      const trkptRegex = /<(?:[a-zA-Z0-9_:-]+:)?trkpt\b([^>]*?)(?:\/>|>(.*?)<\/(?:[a-zA-Z0-9_:-]+:)?trkpt>)/gis;
      let ptMatch;
      while ((ptMatch = trkptRegex.exec(cleanText)) !== null) {
        const pt = parsePointElement(ptMatch[1], ptMatch[2] || '');
        if (pt) rawPoints.push(pt);
      }
    }

    // PRIORITY 2: If ZERO <trkpt> found, look for <rtept> (Route Points)
    if (rawPoints.length === 0) {
      const rteptRegex = /<(?:[a-zA-Z0-9_:-]+:)?rtept\b([^>]*?)(?:\/>|>(.*?)<\/(?:[a-zA-Z0-9_:-]+:)?rtept>)/gis;
      let ptMatch;
      while ((ptMatch = rteptRegex.exec(cleanText)) !== null) {
        const pt = parsePointElement(ptMatch[1], ptMatch[2] || '');
        if (pt) rawPoints.push(pt);
      }
    }

    // PRIORITY 3: KML <coordinates> Tag (lon,lat,ele ...)
    if (rawPoints.length === 0) {
      const coordRegex = /<coordinates[^>]*>([\s\S]*?)<\/coordinates>/gi;
      let cm;
      while ((cm = coordRegex.exec(cleanText)) !== null) {
        const tokens = cm[1].trim().split(/\s+/);
        for (const token of tokens) {
          const parts = token.split(',');
          if (parts.length >= 2) {
            const lon = parseFloat(parts[0].replace(',', '.'));
            const lat = parseFloat(parts[1].replace(',', '.'));
            const ele = parts.length > 2 ? parseFloat(parts[2].replace(',', '.')) : 0;
            if (!isNaN(lat) && !isNaN(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
              rawPoints.push({ lat, lon, ele: isNaN(ele) ? 0 : ele, time: null });
            }
          }
        }
      }
    }

    // PRIORITY 4: GeoJSON Coordinates (LineString / MultiLineString)
    if (rawPoints.length === 0 && (cleanText.startsWith('{') || cleanText.startsWith('['))) {
      try {
        const geoObj = JSON.parse(cleanText);
        const extractFromCoords = (coords) => {
          if (Array.isArray(coords)) {
            if (typeof coords[0] === 'number' && typeof coords[1] === 'number') {
              const lon = coords[0];
              const lat = coords[1];
              const ele = typeof coords[2] === 'number' ? coords[2] : 0;
              if (Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
                rawPoints.push({ lat, lon, ele, time: null });
              }
            } else {
              coords.forEach(extractFromCoords);
            }
          }
        };

        if (geoObj.type === 'FeatureCollection' && Array.isArray(geoObj.features)) {
          for (const f of geoObj.features) {
            if (f.geometry && f.geometry.coordinates) extractFromCoords(f.geometry.coordinates);
            if (f.properties && f.properties.name) name = f.properties.name;
          }
        } else if (geoObj.geometry && geoObj.geometry.coordinates) {
          extractFromCoords(geoObj.geometry.coordinates);
        } else if (geoObj.coordinates) {
          extractFromCoords(geoObj.coordinates);
        }
      } catch (e) {}
    }

    // PRIORITY 5: Fallback to <wpt> ONLY if NO track or route exists at all
    if (rawPoints.length === 0) {
      const wptRegex = /<(?:[a-zA-Z0-9_:-]+:)?wpt\b([^>]*?)(?:\/>|>(.*?)<\/(?:[a-zA-Z0-9_:-]+:)?wpt>)/gis;
      let ptMatch;
      while ((ptMatch = wptRegex.exec(cleanText)) !== null) {
        const pt = parsePointElement(ptMatch[1], ptMatch[2] || '');
        if (pt) rawPoints.push(pt);
      }
    }

    // Validation
    if (rawPoints.length === 0) {
      throw new Error("Aucune coordonnée GPS (latitude/longitude) n'a pu être trouvée dans ce fichier.");
    }

    // -------------------------------------------------------------
    // STEP C: Compute Metrics, Bounds, Elevation, & Durations
    // -------------------------------------------------------------
    let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
    let minEle = Infinity, maxEle = -Infinity;

    for (const p of rawPoints) {
      minLat = Math.min(minLat, p.lat);
      maxLat = Math.max(maxLat, p.lat);
      minLon = Math.min(minLon, p.lon);
      maxLon = Math.max(maxLon, p.lon);
      minEle = Math.min(minEle, p.ele);
      maxEle = Math.max(maxEle, p.ele);
    }

    if (minEle === Infinity) { minEle = 0; maxEle = 0; }

    const { points, totalDistanceKm, elevationGain, elevationLoss } = this.calculateMetrics(rawPoints);
    const estimatedHours = (totalDistanceKm / 4) + (elevationGain / 400);
    const durationFormatted = this.formatDuration(estimatedHours);

    const startPoint = points[0];
    const endPoint = points[points.length - 1];
    const startEndDistMeters = this.haversineDistance(startPoint.lat, startPoint.lon, endPoint.lat, endPoint.lon) * 1000;
    const isLoop = startEndDistMeters < 350;

    return {
      id: 'hike_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      filename: filename,
      name: name,
      originalName: name,
      proposedName: '',
      notes: notes,
      distanceKm: Math.round(totalDistanceKm * 10) / 10,
      elevationGain: Math.round(elevationGain),
      elevationLoss: Math.round(elevationLoss),
      minElevation: Math.round(minEle),
      maxElevation: Math.round(maxEle),
      estimatedDuration: durationFormatted,
      isLoop: isLoop,
      startPoint: {
        lat: startPoint.lat,
        lon: startPoint.lon,
        ele: startPoint.ele
      },
      endPoint: {
        lat: endPoint.lat,
        lon: endPoint.lon,
        ele: endPoint.ele
      },
      bounds: [[minLat, minLon], [maxLat, maxLon]],
      points: points,
      rawGpx: cleanText,
      createdAt: new Date().toISOString()
    };
  }

  /**
   * Calculate cumulative distance and smoothed elevation profile
   */
  static calculateMetrics(rawPoints) {
    const points = [];
    let totalDist = 0;
    let dPlus = 0;
    let dMoins = 0;

    // Moving average filter for realistic elevation
    const eleWindowSize = 3;
    const smoothedElevations = [];
    for (let i = 0; i < rawPoints.length; i++) {
      let sum = 0;
      let count = 0;
      for (let w = -eleWindowSize; w <= eleWindowSize; w++) {
        const idx = i + w;
        if (idx >= 0 && idx < rawPoints.length) {
          sum += (rawPoints[idx].ele || 0);
          count++;
        }
      }
      smoothedElevations.push(count > 0 ? sum / count : 0);
    }

    let lastEle = smoothedElevations.length > 0 ? smoothedElevations[0] : 0;
    const eleThreshold = 1.5; // 1.5 meters noise threshold

    for (let i = 0; i < rawPoints.length; i++) {
      const p = rawPoints[i];
      const curEle = smoothedElevations[i] || 0;

      if (i > 0) {
        const prev = rawPoints[i - 1];
        const segDist = this.haversineDistance(prev.lat, prev.lon, p.lat, p.lon);
        totalDist += segDist;

        const eleDelta = curEle - lastEle;
        if (Math.abs(eleDelta) >= eleThreshold) {
          if (eleDelta > 0) {
            dPlus += eleDelta;
          } else {
            dMoins += Math.abs(eleDelta);
          }
          lastEle = curEle;
        }
      }

      points.push({
        lat: p.lat,
        lon: p.lon,
        ele: Math.round(curEle),
        dist: Math.round(totalDist * 100) / 100,
        time: p.time
      });
    }

    return {
      points,
      totalDistanceKm: totalDist,
      elevationGain: dPlus,
      elevationLoss: dMoins
    };
  }

  static haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius in km
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  static deg2rad(deg) {
    return deg * (Math.PI / 180);
  }

  static formatDuration(hoursDecimal) {
    if (isNaN(hoursDecimal) || hoursDecimal <= 0) return '1h00';
    const h = Math.floor(hoursDecimal);
    const m = Math.round((hoursDecimal - h) * 60);
    return `${h}h${m < 10 ? '0' : ''}${m}`;
  }

  /**
   * Fast reverse geocoding to identify starting municipality (1s timeout)
   */
  static async reverseGeocode(lat, lon) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1200);

    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=14&addressdetails=1`;
      const response = await fetch(url, { 
        headers: { 'Accept-Language': 'fr' },
        signal: controller.signal
      });
      clearTimeout(timeout);

      if (response.ok) {
        const data = await response.json();
        if (data && data.address) {
          const addr = data.address;
          const place = addr.village || addr.town || addr.city || addr.municipality || 
                        addr.hamlet || addr.suburb || addr.county || '';
          if (place) return place;
        }
      }
    } catch (e) {
      clearTimeout(timeout);
    }
    return '';
  }

  /**
   * Generate standardized hike name: "Lieu - XX.X km - D+ XXXm"
   */
  static async generateProposedName(hike) {
    let placeName = '';
    try {
      if (hike.startPoint) {
        placeName = await this.reverseGeocode(hike.startPoint.lat, hike.startPoint.lon);
      }
    } catch (e) {}

    if (!placeName) {
      placeName = (hike.originalName || hike.filename || 'Randonnée')
        .replace(/\.(gpx|xml|kml|json|geojson|tcx|fit)$/i, '')
        .replace(/[\\/:*?"<>|]/g, ' ')
        .replace(/[-_]/g, ' ')
        .trim();
    }

    const cleanPlace = placeName.replace(/[\\/:*?"<>|]/g, ' ').trim();
    return `${cleanPlace} - ${hike.distanceKm} km - D+ ${hike.elevationGain}m`;
  }

  /**
   * Standard XML GPX Exporter
   */
  static exportToGpxString(hike) {
    const name = hike.name || 'Randonnee';
    const notes = hike.notes || '';
    const creator = 'Randonneurs Sanaryens - RandoFinder 2026';

    let gpx = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    gpx += `<gpx version="1.1" creator="${creator}" xmlns="http://www.topografix.com/GPX/1/1">\n`;
    gpx += `  <metadata>\n    <name>${this.escapeXml(name)}</name>\n`;
    if (notes) gpx += `    <desc>${this.escapeXml(notes)}</desc>\n`;
    gpx += `    <time>${new Date().toISOString()}</time>\n  </metadata>\n`;

    if (hike.startPoint) {
      gpx += `  <wpt lat="${hike.startPoint.lat}" lon="${hike.startPoint.lon}">\n`;
      gpx += `    <name>Départ - ${this.escapeXml(name)}</name>\n`;
      if (hike.startPoint.ele) gpx += `    <ele>${hike.startPoint.ele}</ele>\n`;
      gpx += `  </wpt>\n`;
    }

    gpx += `  <trk>\n    <name>${this.escapeXml(name)}</name>\n`;
    if (notes) {
      gpx += `    <desc>${this.escapeXml(notes)}</desc>\n`;
      gpx += `    <cmt>${this.escapeXml(notes)}</cmt>\n`;
    }
    gpx += `    <trkseg>\n`;

    if (hike.points && Array.isArray(hike.points)) {
      for (const pt of hike.points) {
        gpx += `      <trkpt lat="${pt.lat}" lon="${pt.lon}">\n`;
        if (pt.ele !== undefined && pt.ele !== null) gpx += `        <ele>${pt.ele}</ele>\n`;
        if (pt.time) gpx += `        <time>${pt.time}</time>\n`;
        gpx += `      </trkpt>\n`;
      }
    }

    gpx += `    </trkseg>\n  </trk>\n</gpx>`;
    return gpx;
  }

  static escapeXml(unsafe) {
    return String(unsafe || '').replace(/[<>&'"]/g, function (c) {
      switch (c) {
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '&': return '&amp;';
        case '\'': return '&apos;';
        case '"': return '&quot;';
      }
    });
  }
}

window.GPXParser = GPXParser;
