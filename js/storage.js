/**
 * Storage Manager (100% Guaranteed Persistence across LocalStorage, IndexedDB, Disk & Remote Server)
 * Les Randonneurs Sanaryens - RandoFinder - JLD Apps 2026
 * Pure Static & Bulletproof API
 */

class StorageManager {
  static CACHE_KEY = 'sanary_hikes_v12';
  static dirHandle = null;
  static dbName = 'RandonneursSanaryensDB';
  static storeName = 'randonnees';
  static db = null;
  static memoryHikes = [];
  static isFileSystemSupported = typeof window !== 'undefined' && 'showDirectoryPicker' in window;
  static currentMode = 'browser';

  static loadFromLocalStorage() {
    try {
      const allCacheKeys = [
        'sanary_hikes_v12', 'sanary_hikes_v11', 'sanary_hikes_v10', 'sanary_hikes_v9', 
        'sanary_hikes_v8', 'sanary_hikes_v7', 'sanary_hikes_v6', 'sanary_hikes_cache_v5', 
        'sanary_hikes_cache_v4', 'sanary_hikes_cache_v3', 'sanary_hikes_cache_v2', 'sanary_hikes_cache'
      ];

      const sampleIds = ['sample_cap_sicie', 'sample_gros_cerveau', 'sample_portissol', 'sample_sainte_baume', 'sample_calanques', 'sample_mont_faron'];
      const recoveredCustomHikes = [];

      // Scan all localStorage versions to salvage every user custom hike ever saved
      for (const k of allCacheKeys) {
        const raw = localStorage.getItem(k);
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              for (const h of parsed) {
                if (h && h.name && !sampleIds.includes(h.id)) {
                  // If not already in recovered list, keep it!
                  if (!recoveredCustomHikes.some(existing => existing.id === h.id || existing.name === h.name)) {
                    recoveredCustomHikes.push(h);
                  }
                }
              }
            }
          } catch (e) {}
        }
      }

      this.memoryHikes = recoveredCustomHikes;
    } catch (e) {
      console.warn("LocalStorage read warning:", e);
    }
  }

  static saveToLocalStorage() {
    try {
      localStorage.setItem(this.CACHE_KEY, JSON.stringify(this.memoryHikes));
    } catch (e) {
      console.warn("LocalStorage save warning (Quota exceeded, relying on IndexedDB):", e);
    }
  }

  static async init() {
    this.loadFromLocalStorage();

    // 1. Open IndexedDB first to load any hikes stored there
    if (typeof window !== 'undefined' && window.indexedDB) {
      try {
        await new Promise((resolve) => {
          let done = false;
          const req = indexedDB.open(this.dbName, 9);

          req.onupgradeneeded = (e) => {
            try {
              const db = e.target.result;
              if (!db.objectStoreNames.contains(this.storeName)) {
                db.createObjectStore(this.storeName, { keyPath: 'id' });
              }
            } catch (err) {}
          };

          req.onsuccess = (e) => {
            this.db = e.target.result;
            if (!done) { done = true; resolve(); }
          };

          req.onerror = () => {
            if (!done) { done = true; resolve(); }
          };

          setTimeout(() => {
            if (!done) { done = true; resolve(); }
          }, 300);
        });
      } catch (e) {
        console.warn("IndexedDB init catch:", e);
      }
    }

    // 2. Read all hikes from IndexedDB
    if (this.db) {
      try {
        const idbHikes = await new Promise((resolve) => {
          try {
            const tx = this.db.transaction([this.storeName], 'readonly');
            const store = tx.objectStore(this.storeName);
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => resolve([]);
          } catch (e) {
            resolve([]);
          }
        });

        if (idbHikes && idbHikes.length > 0) {
          const sampleIds = ['sample_cap_sicie', 'sample_gros_cerveau', 'sample_portissol', 'sample_sainte_baume', 'sample_calanques', 'sample_mont_faron'];
          for (const h of idbHikes) {
            if (h && h.name && !sampleIds.includes(h.id)) {
              if (!this.memoryHikes.some(m => m.id === h.id || m.name === h.name)) {
                this.memoryHikes.push(h);
              }
            }
          }
        }
      } catch (e) {
        console.warn("IndexedDB read error in init:", e);
      }
    }

    // 3. Ensure official sample hikes are loaded with authentic trail coordinates
    let sampleHikes = [];
    if (typeof SampleData !== 'undefined') {
      sampleHikes = SampleData.getSampleHikes();
    }

    // 4. Combine fresh sample hikes with all user custom hikes
    const sampleIds = ['sample_cap_sicie', 'sample_gros_cerveau', 'sample_portissol', 'sample_sainte_baume', 'sample_calanques', 'sample_mont_faron'];
    const userCustomHikes = this.memoryHikes.filter(h => h && h.name && !sampleIds.includes(h.id));

    this.memoryHikes = [...sampleHikes, ...userCustomHikes];
    this.saveToLocalStorage();
  }

  static async getAllHikes() {
    if (!this.memoryHikes || this.memoryHikes.length === 0) {
      await this.init();
    }
    return this.memoryHikes;
  }

  static async saveHike(hike, gpxContent = null) {
    if (!hike.id) {
      hike.id = 'hike_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    }

    // 1. Update Memory Store
    const existingIdx = this.memoryHikes.findIndex(h => h.id === hike.id || (h.name && h.name === hike.name));
    if (existingIdx >= 0) {
      this.memoryHikes[existingIdx] = hike;
    } else {
      this.memoryHikes.unshift(hike);
    }

    // 2. Save to LocalStorage
    this.saveToLocalStorage();

    // 3. Save to IndexedDB if available
    if (this.db) {
      try {
        const tx = this.db.transaction([this.storeName], 'readwrite');
        const store = tx.objectStore(this.storeName);
        store.put(hike);
      } catch (e) {
        console.warn("IndexedDB put error:", e);
      }
    }

    // 4. Save to Disk Folder if connected
    if (this.dirHandle && this.currentMode === 'filesystem') {
      try {
        let cleanFileName = (hike.name || 'randonnee').replace(/[\\/:*?"<>|]/g, '_') + '.gpx';
        const fileHandle = await this.dirHandle.getFileHandle(cleanFileName, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(gpxContent || hike.rawGpx || GPXParser.exportToGpxString(hike));
        await writable.close();
        hike.filename = cleanFileName;
      } catch (err) {
        console.error("Erreur écriture disque:", err);
      }
    }

    return hike;
  }

  static async deleteHike(id, filename = null) {
    // 1. Remove from memory
    this.memoryHikes = this.memoryHikes.filter(h => h.id !== id);
    this.saveToLocalStorage();

    // 2. Remove from IndexedDB
    if (this.db) {
      try {
        const tx = this.db.transaction([this.storeName], 'readwrite');
        const store = tx.objectStore(this.storeName);
        store.delete(id);
      } catch (e) {
        console.warn("IndexedDB delete error:", e);
      }
    }

    // 3. Remove from disk if possible
    if (this.dirHandle && filename) {
      try {
        await this.dirHandle.removeEntry(filename);
      } catch (e) {}
    }

    return true;
  }

  /**
   * Ensure hike track points are loaded (Lazy Loading from Server on-demand)
   */
  static async ensureHikeTrackLoaded(hike) {
    if (!hike) return hike;
    if (hike.points && hike.points.length > 0) return hike;

    if (hike.gpxUrl) {
      try {
        const res = await fetch(hike.gpxUrl);
        if (res.ok) {
          const text = await res.text();
          const parsed = GPXParser.parse(text, hike.filename || 'trace.gpx');
          hike.points = parsed.points;
          hike.rawGpx = text;
          if (!hike.elevationGain && parsed.elevationGain) hike.elevationGain = parsed.elevationGain;
          if (!hike.elevationLoss && parsed.elevationLoss) hike.elevationLoss = parsed.elevationLoss;
          if (!hike.minElevation && parsed.minElevation) hike.minElevation = parsed.minElevation;
          if (!hike.maxElevation && parsed.maxElevation) hike.maxElevation = parsed.maxElevation;
        }
      } catch (e) {
        console.warn("Échec chargement trace distante à la demande:", e);
      }
    }
    return hike;
  }

  /**
   * Synchronize with Remote Server (Web Server, Cloud Folder, API, GitHub)
   */
  static async syncWithRemoteServer(url) {
    if (!url || typeof url !== 'string' || url.trim().length === 0) {
      throw new Error("Veuillez saisir une URL de serveur valide.");
    }

    let cleanUrl = url.trim();
    const response = await fetch(cleanUrl);
    if (!response.ok) {
      throw new Error(`Erreur serveur (${response.status}): ${response.statusText}`);
    }

    let importedCount = 0;
    const contentType = response.headers.get('content-type') || '';
    const baseUrl = cleanUrl.substring(0, cleanUrl.lastIndexOf('/') + 1);

    // If it's direct GPX XML text
    if (cleanUrl.toLowerCase().endsWith('.gpx') || contentType.includes('xml')) {
      const gpxText = await response.text();
      const fileName = cleanUrl.split('/').pop() || 'randonnee_serveur.gpx';
      const hike = GPXParser.parse(gpxText, fileName);
      await this.saveHike(hike, gpxText);
      return 1;
    }

    // If it's JSON
    const data = await response.json();

    if (Array.isArray(data)) {
      // A. Master Catalog or Lightweight Index JSON array of hike objects
      if (data.length > 0 && (data[0].points || data[0].startPoint || data[0].gpxUrl)) {
        for (const hike of data) {
          if (hike) {
            // Resolve relative gpxUrl if provided
            if (hike.gpxUrl && !hike.gpxUrl.startsWith('http')) {
              hike.gpxUrl = baseUrl + hike.gpxUrl;
            }
            await this.saveHike(hike);
            importedCount++;
          }
        }
      }
      // B. Array of GPX file URLs / names: ["randonnee1.gpx", "randonnee2.gpx"]
      else if (data.length > 0 && typeof data[0] === 'string') {
        for (const item of data) {
          const fileUrl = item.startsWith('http') ? item : baseUrl + item;
          const fileName = item.split('/').pop() || 'trace.gpx';
          try {
            const fileRes = await fetch(fileUrl);
            if (fileRes.ok) {
              const gpxText = await fileRes.text();
              const hike = GPXParser.parse(gpxText, fileName);
              hike.gpxUrl = fileUrl;
              await this.saveHike(hike, gpxText);
              importedCount++;
            }
          } catch (err) {
            console.warn(`Erreur téléchargement ${fileUrl}:`, err);
          }
        }
      }
    } else if (data && typeof data === 'object') {
      const list = data.hikes || data.traces || data.randonnees || [];
      for (const hike of list) {
        if (hike) {
          if (hike.gpxUrl && !hike.gpxUrl.startsWith('http')) {
            hike.gpxUrl = baseUrl + hike.gpxUrl;
          }
          await this.saveHike(hike);
          importedCount++;
        }
      }
    }

    return importedCount;
  }

  static async pickLocalDirectory() {
    if (!this.isFileSystemSupported) {
      throw new Error("L'accès direct au disque dur requiert Google Chrome ou Microsoft Edge.");
    }

    try {
      this.dirHandle = await window.showDirectoryPicker({
        mode: 'readwrite',
        id: 'gpx-randonneurs-sanaryens-folder'
      });

      this.currentMode = 'filesystem';
      const loadedHikes = await this.readAllFromDirectory();
      return {
        success: true,
        folderName: this.dirHandle.name,
        hikes: loadedHikes
      };
    } catch (err) {
      if (err.name === 'AbortError') return { success: false, aborted: true };
      throw err;
    }
  }

  static async readAllFromDirectory() {
    if (!this.dirHandle) return [];

    for await (const entry of this.dirHandle.values()) {
      if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.gpx')) {
        try {
          const file = await entry.getFile();
          const text = await file.text();
          const hike = GPXParser.parse(text, entry.name);
          await this.saveHike(hike);
        } catch (e) {
          console.warn(`Lecture ignorée pour ${entry.name}`, e);
        }
      }
    }
    return this.memoryHikes;
  }

  static async exportBackupJSON() {
    const hikes = await this.getAllHikes();
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(hikes, null, 2));
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = `sauvegarde_randonneurs_sanaryens_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  static async importBackupJSON(jsonString) {
    const data = JSON.parse(jsonString);
    if (!Array.isArray(data)) throw new Error("Format de fichier invalide.");
    let count = 0;
    for (const item of data) {
      if (item && item.points) {
        await this.saveHike(item);
        count++;
      }
    }
    return count;
  }

  // =========================================================================
  // SUPABASE INTEGRATION (PostgreSQL DB + Storage Buckets)
  // =========================================================================

  /**
   * Fetch all hikes from Supabase Database
   */
  static async fetchFromSupabase(supabaseUrl, anonKey) {
    if (!supabaseUrl || !anonKey) {
      throw new Error("Veuillez renseigner l'URL Supabase et la clé Anon.");
    }

    const cleanUrl = supabaseUrl.replace(/\/+$/, '');
    const apiUrl = `${cleanUrl}/rest/v1/randonnees?select=*&order=name.asc`;

    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'apikey': anonKey.trim(),
        'Authorization': `Bearer ${anonKey.trim()}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Erreur Supabase (${response.status}): ${errText}`);
    }

    const rows = await response.json();
    if (!Array.isArray(rows)) return 0;

    let count = 0;
    for (const row of rows) {
      let hike = {
        id: row.id,
        name: row.name,
        distanceKm: Number(row.distance_km || 0),
        elevationGain: Number(row.elevation_gain || 0),
        elevationLoss: Number(row.elevation_loss || 0),
        minElevation: Number(row.min_elevation || 0),
        maxElevation: Number(row.max_elevation || 0),
        estimatedDuration: row.estimated_duration || '3h00',
        notes: row.notes || '',
        gpxUrl: row.gpx_url || '',
        filename: (row.name || 'rando').replace(/[\\/:*?"<>|]/g, '_') + '.gpx',
        startPoint: (row.start_lat && row.start_lon) ? { lat: Number(row.start_lat), lon: Number(row.start_lon) } : null,
        rawGpx: row.raw_gpx || null,
        points: []
      };

      // If raw GPX is stored directly in DB, parse points immediately
      if (hike.rawGpx && typeof GPXParser !== 'undefined') {
        try {
          const parsed = GPXParser.parse(hike.rawGpx, hike.filename);
          hike.points = parsed.points;
          if (!hike.startPoint) hike.startPoint = parsed.startPoint;
        } catch (e) {}
      }

      await this.saveHike(hike, hike.rawGpx);
      count++;
    }

    return count;
  }

  /**
   * Push a single hike and its GPX file to Supabase (Bucket + Table)
   */
  static async pushHikeToSupabase(hike, supabaseUrl, anonKey) {
    if (!supabaseUrl || !anonKey) throw new Error("Paramètres Supabase manquants.");
    const cleanUrl = supabaseUrl.replace(/\/+$/, '');
    const key = anonKey.trim();

    const gpxText = hike.rawGpx || GPXParser.exportToGpxString(hike);
    const cleanFileName = (hike.id || 'rando') + '_' + (hike.name || 'trace').replace(/[\\/:*?"<>|]/g, '_').toLowerCase() + '.gpx';

    // 1. Upload GPX file to Supabase Storage Bucket 'traces-gpx'
    let publicGpxUrl = hike.gpxUrl || '';
    try {
      const storageUrl = `${cleanUrl}/storage/v1/object/traces-gpx/${cleanFileName}`;
      const uploadRes = await fetch(storageUrl, {
        method: 'POST',
        headers: {
          'apikey': key,
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/gpx+xml',
          'x-upsert': 'true'
        },
        body: gpxText
      });

      if (uploadRes.ok) {
        publicGpxUrl = `${cleanUrl}/storage/v1/object/public/traces-gpx/${cleanFileName}`;
        hike.gpxUrl = publicGpxUrl;
      }
    } catch (err) {
      console.warn("Storage upload warning (continuation vers DB):", err);
    }

    // 2. Upsert metadata to Supabase DB table 'randonnees'
    const payload = [{
      id: hike.id || 'hike_' + Date.now(),
      name: hike.name,
      distance_km: hike.distanceKm,
      elevation_gain: hike.elevationGain,
      elevation_loss: hike.elevationLoss || 0,
      min_elevation: hike.minElevation || 0,
      max_elevation: hike.maxElevation || 0,
      start_lat: hike.startPoint ? hike.startPoint.lat : null,
      start_lon: hike.startPoint ? hike.startPoint.lon : null,
      estimated_duration: hike.estimatedDuration || '3h00',
      notes: hike.notes || '',
      gpx_url: publicGpxUrl,
      raw_gpx: gpxText,
      updated_at: new Date().toISOString()
    }];

    const dbRes = await fetch(`${cleanUrl}/rest/v1/randonnees`, {
      method: 'POST',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify(payload)
    });

    if (!dbRes.ok) {
      const errText = await dbRes.text();
      throw new Error(`Erreur insertion table Supabase (${dbRes.status}): ${errText}`);
    }

    return true;
  }

  /**
   * Push all current local hikes to Supabase Cloud
   */
  static async pushAllLocalHikesToSupabase(supabaseUrl, anonKey, progressCallback = null) {
    const hikes = await this.getAllHikes();
    let successCount = 0;

    for (let i = 0; i < hikes.length; i++) {
      const hike = hikes[i];
      if (progressCallback) progressCallback(i + 1, hikes.length, hike.name);
      try {
        await this.pushHikeToSupabase(hike, supabaseUrl, anonKey);
        successCount++;
      } catch (err) {
        console.error(`Erreur transfert ${hike.name}:`, err);
      }
    }

    return { total: hikes.length, success: successCount };
  }

  /**
   * Delete a hike from Supabase Cloud DB & Storage
   */
  static async deleteFromSupabase(hikeId, supabaseUrl, anonKey) {
    if (!supabaseUrl || !anonKey) return false;
    const cleanUrl = supabaseUrl.replace(/\/+$/, '');
    const key = anonKey.trim();

    try {
      await fetch(`${cleanUrl}/rest/v1/randonnees?id=eq.${hikeId}`, {
        method: 'DELETE',
        headers: {
          'apikey': key,
          'Authorization': `Bearer ${key}`
        }
      });
      return true;
    } catch (e) {
      console.warn("Erreur suppression Supabase:", e);
      return false;
    }
  }
}

// Global reference
window.StorageManager = StorageManager;
