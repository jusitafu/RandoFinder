/**
 * Leaflet Map Manager with IGN, OpenStreetMap, Clean GPX Polylines & Selection Halo
 * Les Randonneurs Sanaryens - RandoFinder - JLD Apps 2026
 */

class MapManager {
  constructor(mapContainerId) {
    this.containerId = mapContainerId;
    this.map = null;
    this.baseLayers = {};
    this.markersLayer = null;
    this.selectionHaloLayer = null;
    this.trackLayer = null;
    this.activeTrackPolyline = null;
    this.searchCircle = null;
    this.searchOriginMarker = null;
    this.cursorMarker = null;
    this.clickModeActive = false;

    this.selectedHike = null;
    this.hoveredHike = null;
    this.currentHikesList = [];
    this.onHikeSelectCallback = null;
    this.onHikeHoverCallback = null;
    this.onHikeHoverEndCallback = null;
    this.onSearchOriginChangeCallback = null;
    this.onMapBackgroundClickCallback = null;

    // Default center: Sanary-sur-Mer (43.1189, 5.8033)
    this.searchOrigin = { lat: 43.1189, lon: 5.8033, name: 'Sanary-sur-Mer' };
    this.searchRadiusKm = 100;

    // Area selection state (2-click rectangle print mode)
    this.currentBaseLayer = 'igntop25';
    this.areaSelectionActive = false;
    this.areaSelectionCorner1 = null;
    this.areaSelectionLayer = null;
    this.areaSelectionRect = null;
    this.areaSelectionOnComplete = null;
    this.areaSelectionOnCancel = null;

    // Carroyage UTM & HUD
    this.utmGridLayer = null;
    this._lastCoords = null;
  }

  init() {
    if (this.map) return;

    // 1. Define Base Layers
    // Véritable IGN TOP 25 officiel (Scan 25 Touristique papier avec balisages GR® roses et rochers)
    const ignTop25 = L.tileLayer('https://data.geopf.fr/private/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.MAPS&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image%2Fjpeg&apikey=ign_scan_ws', {
      maxZoom: 19,
      maxNativeZoom: 18,
      attribution: '&copy; IGN France - Carte TOPO 25 (SCAN 25®)'
    });

    const ignPlan = L.tileLayer('https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image%2Fpng', {
      maxZoom: 19,
      attribution: '&copy; IGN France - Plan Numérique v2'
    });

    const osmFr = L.tileLayer('https://{s}.tile.openstreetmap.fr/osmfr/{z}/{x}/{y}.png', {
      maxZoom: 19,
      subdomains: 'abc',
      attribution: '&copy; OpenStreetMap France'
    });

    const openTopo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      maxNativeZoom: 17,
      subdomains: 'abc',
      attribution: '&copy; OpenTopoMap'
    });

    const esriSat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      maxNativeZoom: 18,
      attribution: '&copy; Esri World Imagery (Monde 🌍 & France)'
    });

    const ignSat = L.tileLayer('https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image%2Fjpeg', {
      maxZoom: 19,
      attribution: '&copy; IGN France (Orthophoto HD)'
    });

    this.baseLayers = {
      "IGN TOP 25 (Carte papier officielle)": ignTop25,
      "IGN Plan (Numérique moderne)": ignPlan,
      "OpenTopoMap (Relief mondial)": openTopo,
      "OpenStreetMap France (Sentiers)": osmFr,
      "Satellite Mondial (Esri 🌍)": esriSat,
      "Satellite France (IGN Ortho)": ignSat
    };

    // 2. Init Map centered on Sanary-sur-Mer with official IGN Top 25 layer
    this.map = L.map(this.containerId, {
      center: [this.searchOrigin.lat, this.searchOrigin.lon],
      zoom: 11,
      maxZoom: 19,
      layers: [ignTop25],
      zoomControl: true
    });

    this.utmGridLayer = L.layerGroup();
    const overlayLayers = {
      "🌐 Carroyage UTM (Grille kilométrique)": this.utmGridLayer
    };

    this.layerControl = L.control.layers(this.baseLayers, overlayLayers, { position: 'topright' }).addTo(this.map);
    L.control.scale({ imperial: false, metric: true, position: 'bottomleft' }).addTo(this.map);

    this.markersLayer = L.layerGroup().addTo(this.map);
    this.selectionHaloLayer = L.layerGroup().addTo(this.map);
    this.trackLayer = L.layerGroup().addTo(this.map);

    // Activer la grille kilométrique UTM par défaut (conforme carte papier IGN Top 25)
    this.utmGridLayer.addTo(this.map);

    this.updateSearchRadiusVisuals(false);

    // Track active base layer
    this.map.on('baselayerchange', (e) => {
      const name = (e.name || '').toLowerCase();
      if (name.includes('top 25') || name.includes('top25')) this.currentBaseLayer = 'igntop25';
      else if (name.includes('plan')) this.currentBaseLayer = 'ignplan';
      else if (name.includes('opentopo')) this.currentBaseLayer = 'opentopo';
      else if (name.includes('france') || name.includes('openstreetmap')) this.currentBaseLayer = 'osmfr';
      else if (name.includes('satellite')) this.currentBaseLayer = 'satellite';
    });

    // Map Click Listener (Background click deselects or sets search origin)
    this.map.on('click', (e) => {
      if (this.areaSelectionActive) {
        this.handleAreaSelectionClick(e.latlng);
        return;
      }
      if (this.clickModeActive) {
        this.setSearchOrigin(e.latlng.lat, e.latlng.lng, 'Point choisi sur carte');
        this.setClickMode(false);
      } else {
        if (this.onMapBackgroundClickCallback) {
          this.onMapBackgroundClickCallback();
        }
      }
    });

    // Map Zoom & Pan Listeners : mise à jour dynamique du Carroyage UTM et de l'Échelle
    this.map.on('moveend zoomend', () => {
      if (this.map.hasLayer(this.utmGridLayer)) {
        this.renderUtmGrid();
      }
      this.updateMapHud();
      if (this.onMapZoomChangeCallback) {
        this.onMapZoomChangeCallback(this.map.getZoom());
      }
    });

    this.map.on('overlayadd', (e) => {
      if (e.layer === this.utmGridLayer) {
        this.renderUtmGrid();
      }
    });

    this.map.on('overlayremove', (e) => {
      if (e.layer === this.utmGridLayer) {
        this.utmGridLayer.clearLayers();
      }
    });

    // Écouteur de position du curseur en direct sur la carte
    this.map.on('mousemove', (e) => {
      this.updateCursorCoords(e.latlng);
    });

    this.map.on('mouseout', () => {
      this.updateCursorCoords(null);
    });

    setTimeout(() => {
      if (this.map) {
        this.map.invalidateSize();
        this.renderUtmGrid();
        this.updateMapHud();
        this.updateCursorCoords(null);
      }
    }, 250);
  }

  getCurrentBaseLayerKey() {
    return this.currentBaseLayer || 'igntop25';
  }

  /**
   * Start 2-click rectangular area selection on the map
   * @param {Function} onComplete - Callback with final bounds [[minLat, minLon], [maxLat, maxLon]]
   * @param {Function} onCancel - Callback on cancel
   */
  startAreaSelection(onComplete, onCancel) {
    this.areaSelectionActive = true;
    this.areaSelectionCorner1 = null;
    this.areaSelectionOnComplete = onComplete;
    this.areaSelectionOnCancel = onCancel;

    // Change cursor to crosshair
    L.DomUtil.addClass(this.map.getContainer(), 'area-selection-cursor');

    // Layer group for selection rectangle and corner markers
    if (!this.areaSelectionLayer) {
      this.areaSelectionLayer = L.layerGroup().addTo(this.map);
    }
    this.areaSelectionLayer.clearLayers();
    this.areaSelectionRect = null;

    // Show banner & update button in UI
    const banner = document.getElementById('map-selection-banner');
    const msg = document.getElementById('map-selection-msg');
    const btnText = document.getElementById('btn-map-area-print-text');
    if (banner) banner.classList.remove('hidden');
    if (msg) msg.innerHTML = '<span class="font-bold text-emerald-300">Étape 1 sur 2 :</span> Cliquez sur la carte pour poser le premier coin.';
    if (btnText) btnText.textContent = 'Annuler la sélection';

    // Mouse move handler
    this._onAreaMouseMove = (e) => {
      if (!this.areaSelectionCorner1) return;
      const corner2 = e.latlng;
      const bounds = L.latLngBounds(this.areaSelectionCorner1, corner2);

      if (!this.areaSelectionRect) {
        this.areaSelectionRect = L.rectangle(bounds, {
          color: '#10b981',
          weight: 2,
          dashArray: '5, 5',
          fillColor: '#10b981',
          fillOpacity: 0.2
        }).addTo(this.areaSelectionLayer);
      } else {
        this.areaSelectionRect.setBounds(bounds);
      }

      // Calculate approximate dimensions in km
      const dKmWidth = GPXParser.haversineDistance(
        this.areaSelectionCorner1.lat, this.areaSelectionCorner1.lng,
        this.areaSelectionCorner1.lat, corner2.lng
      );
      const dKmHeight = GPXParser.haversineDistance(
        this.areaSelectionCorner1.lat, this.areaSelectionCorner1.lng,
        corner2.lat, this.areaSelectionCorner1.lng
      );
      if (msg) {
        msg.innerHTML = `<span class="font-bold text-emerald-300">Étape 2 sur 2 :</span> Cliquez pour le coin opposé • <span class="bg-slate-800 px-2 py-0.5 rounded text-white font-mono">${dKmWidth.toFixed(1)} km × ${dKmHeight.toFixed(1)} km</span>`;
      }
    };
    this.map.on('mousemove', this._onAreaMouseMove);

    // Escape key handler
    this._onAreaKeyDown = (e) => {
      if (e.key === 'Escape') {
        this.cancelAreaSelection();
      }
    };
    window.addEventListener('keydown', this._onAreaKeyDown);
  }

  cancelAreaSelection() {
    this.areaSelectionActive = false;
    this.areaSelectionCorner1 = null;
    L.DomUtil.removeClass(this.map.getContainer(), 'area-selection-cursor');

    if (this._onAreaMouseMove) {
      this.map.off('mousemove', this._onAreaMouseMove);
      this._onAreaMouseMove = null;
    }
    if (this._onAreaKeyDown) {
      window.removeEventListener('keydown', this._onAreaKeyDown);
      this._onAreaKeyDown = null;
    }

    if (this.areaSelectionLayer) {
      this.areaSelectionLayer.clearLayers();
    }
    this.areaSelectionRect = null;

    const banner = document.getElementById('map-selection-banner');
    const btnText = document.getElementById('btn-map-area-print-text');
    if (banner) banner.classList.add('hidden');
    if (btnText) btnText.textContent = 'Imprimer une zone';

    if (this.areaSelectionOnCancel) {
      this.areaSelectionOnCancel();
    }
  }

  handleAreaSelectionClick(latlng) {
    if (!this.areaSelectionCorner1) {
      // 1st click: set Corner 1
      this.areaSelectionCorner1 = latlng;

      // Marker at corner 1
      L.circleMarker(latlng, {
        radius: 6,
        color: '#ffffff',
        weight: 2,
        fillColor: '#10b981',
        fillOpacity: 1
      }).addTo(this.areaSelectionLayer);

      const msg = document.getElementById('map-selection-msg');
      if (msg) {
        msg.innerHTML = '<span class="font-bold text-emerald-300">Étape 2 sur 2 :</span> Déplacez la souris et cliquez pour figer le coin opposé.';
      }
    } else {
      // 2nd click: finish selection
      const corner2 = latlng;
      const bounds = L.latLngBounds(this.areaSelectionCorner1, corner2);

      // Lock rectangle style (solid border)
      if (this.areaSelectionRect) {
        this.areaSelectionRect.setBounds(bounds);
        this.areaSelectionRect.setStyle({
          dashArray: null,
          weight: 3,
          color: '#059669',
          fillOpacity: 0.15
        });
      }

      // Marker at corner 2
      L.circleMarker(corner2, {
        radius: 6,
        color: '#ffffff',
        weight: 2,
        fillColor: '#059669',
        fillOpacity: 1
      }).addTo(this.areaSelectionLayer);

      // Clean up event listeners & cursor
      L.DomUtil.removeClass(this.map.getContainer(), 'area-selection-cursor');
      if (this._onAreaMouseMove) {
        this.map.off('mousemove', this._onAreaMouseMove);
        this._onAreaMouseMove = null;
      }
      if (this._onAreaKeyDown) {
        window.removeEventListener('keydown', this._onAreaKeyDown);
        this._onAreaKeyDown = null;
      }

      const banner = document.getElementById('map-selection-banner');
      const btnText = document.getElementById('btn-map-area-print-text');
      if (banner) banner.classList.add('hidden');
      if (btnText) btnText.textContent = 'Imprimer une zone';

      const finalBounds = [
        [Math.min(bounds.getSouth(), bounds.getNorth()), Math.min(bounds.getWest(), bounds.getEast())],
        [Math.max(bounds.getSouth(), bounds.getNorth()), Math.max(bounds.getWest(), bounds.getEast())]
      ];

      this.areaSelectionActive = false;
      this.areaSelectionCorner1 = null;

      if (this.areaSelectionOnComplete) {
        this.areaSelectionOnComplete(finalBounds);
      }
    }
  }

  clearAreaSelectionVisuals() {
    if (this.areaSelectionLayer) {
      this.areaSelectionLayer.clearLayers();
    }
    this.areaSelectionRect = null;
  }

  setClickMode(active) {
    this.clickModeActive = active;
    const mapEl = document.getElementById(this.containerId);
    if (mapEl) {
      if (active) mapEl.classList.add('cursor-crosshair');
      else mapEl.classList.remove('cursor-crosshair');
    }
  }

  setSearchOrigin(lat, lon, name = 'Lieu sélectionné', autoZoom = false) {
    this.searchOrigin = { lat, lon, name };
    this.updateSearchRadiusVisuals(autoZoom);
    if (this.onSearchOriginChangeCallback) {
      this.onSearchOriginChangeCallback(this.searchOrigin);
    }
  }

  zoomToLocation(lat, lon, zoom = null) {
    if (!this.map) return;
    this.map.invalidateSize();
    const targetZoom = (zoom !== null) 
      ? zoom 
      : ((this.map.getMaxZoom && this.map.getMaxZoom() !== Infinity) ? this.map.getMaxZoom() : 19);
    this.map.setView([lat, lon], targetZoom, { animate: true });
    if (this.searchOriginMarker) {
      this.searchOriginMarker.openTooltip();
    }
  }

  setSearchRadius(radiusKm, autoZoom = true) {
    this.searchRadiusKm = Number(radiusKm);
    this.updateSearchRadiusVisuals(autoZoom);
  }

  updateSearchRadiusVisuals(autoZoom = false) {
    if (!this.map) return;

    if (this.searchOriginMarker) {
      this.searchOriginMarker.remove();
    }

    const originIcon = L.divIcon({
      className: 'custom-origin-icon',
      html: `
        <div class="relative flex items-center justify-center w-8 h-8 -translate-x-1/2 -translate-y-1/2">
          <div class="absolute w-8 h-8 bg-blue-500 rounded-full opacity-30 animate-ping"></div>
          <div class="w-6 h-6 bg-blue-600 border-2 border-white rounded-full shadow-lg flex items-center justify-center text-white text-xs font-bold">
            📍
          </div>
        </div>
      `,
      iconSize: [0, 0]
    });

    this.searchOriginMarker = L.marker([this.searchOrigin.lat, this.searchOrigin.lon], {
      icon: originIcon,
      zIndexOffset: 1000
    }).addTo(this.map);

    this.searchOriginMarker.bindTooltip(`<b>Centre :</b> ${this.searchOrigin.name}`, {
      direction: 'top',
      offset: [0, -15]
    });

    if (this.searchCircle) {
      this.searchCircle.remove();
      this.searchCircle = null;
    }

    if (this.searchRadiusKm < 2500) {
      this.searchCircle = L.circle([this.searchOrigin.lat, this.searchOrigin.lon], {
        radius: this.searchRadiusKm * 1000,
        color: '#2563eb',
        weight: 1.5,
        dashArray: '5, 5',
        fillColor: '#3b82f6',
        fillOpacity: 0.05,
        interactive: false
      }).addTo(this.map);

      if (autoZoom && this.searchCircle) {
        this.map.fitBounds(this.searchCircle.getBounds(), { padding: [30, 30], maxZoom: 14 });
      }
    } else {
      // Rayon Continental / Mondial (>= 2500 km et jusqu'à 20 000 km / Monde entier)
      if (autoZoom) {
        this.fitBoundsToAllMarkers();
      }
    }
  }

  fitBoundsToAllMarkers() {
    if (this.markersLayer && this.markersLayer.getLayers().length > 0) {
      try {
        this.map.fitBounds(this.markersLayer.getBounds(), { padding: [40, 40], maxZoom: 6 });
      } catch (e) {
        this.map.setView([25, 10], 2);
      }
    } else {
      this.map.setView([25, 10], 2);
    }
  }

  clearMarkers() {
    if (this.markersLayer) {
      this.markersLayer.clearLayers();
    }
    this.currentHikesList = [];
    this.clearTrack();
    this.clearCursorPosition();
  }

  renderHikeMarkers(hikes) {
    if (!this.markersLayer) return;
    this.currentHikesList = hikes || [];
    this.markersLayer.clearLayers();

    this.currentHikesList.forEach((hike) => {
      if (!hike.startPoint || isNaN(hike.startPoint.lat) || isNaN(hike.startPoint.lon)) return;

      const isSelected = this.selectedHike && (this.selectedHike.id === hike.id || this.selectedHike.name === hike.name);

      let difficultyLabel = 'Facile (<350m D+)';
      let colorClass = 'bg-emerald-600';
      let haloColor = 'bg-emerald-500';
      if (hike.elevationGain >= 700 || hike.distanceKm > 18) {
        colorClass = 'bg-rose-600';
        haloColor = 'bg-rose-500';
        difficultyLabel = 'Sportif (≥700m D+ ou >18km)';
      } else if (hike.elevationGain >= 350 || hike.distanceKm > 12) {
        colorClass = 'bg-amber-500';
        haloColor = 'bg-amber-500';
        difficultyLabel = 'Moyen (350-700m D+)';
      }

      // If selected, pin is bright red
      if (isSelected) {
        colorClass = 'bg-red-600';
        haloColor = 'bg-red-500';
      }

      const pinTooltip = `${hike.name} (${hike.distanceKm} km, +${hike.elevationGain}m) - Niveau : ${difficultyLabel}`;

      // Marker HTML - Clean and sharp pin
      const icon = L.divIcon({
        className: 'custom-hike-start-icon',
        html: `
          <div class="relative cursor-pointer -translate-x-1/2 -translate-y-full group" title="${pinTooltip}">
            <!-- Pin Body -->
            <div class="relative ${isSelected ? 'w-8 h-8 scale-110 ring-4 ring-red-400 shadow-2xl' : 'w-7 h-7 shadow-lg'} ${colorClass} text-white rounded-full flex items-center justify-center border-2 border-white text-xs font-black transition-transform duration-150 transform group-hover:scale-125">
              ▲
            </div>
            <!-- Bottom Anchor Shadow -->
            <div class="w-1.5 h-1.5 bg-slate-900 rounded-full mx-auto -mt-0.5 opacity-80"></div>
          </div>
        `,
        iconSize: [0, 0]
      });

      const marker = L.marker([hike.startPoint.lat, hike.startPoint.lon], { 
        icon: icon,
        title: pinTooltip,
        zIndexOffset: isSelected ? 2500 : 500
      });

      // Hover displays clean GPX track and preview card
      marker.on('mouseover', () => {
        this.hoveredHike = hike;
        if (this.onHikeHoverCallback) {
          this.onHikeHoverCallback(hike);
        } else {
          this.displayTrack(hike, false);
        }
      });

      marker.on('mouseout', () => {
        if (this.onHikeHoverEndCallback) {
          this.onHikeHoverEndCallback(hike);
        } else if (this.onHikeHoverCallback) {
          this.onHikeHoverCallback(this.selectedHike || null);
        } else {
          if (this.selectedHike) {
            this.displayTrack(this.selectedHike, true);
          } else {
            this.clearTrack();
          }
        }
      });

      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        if (this.areaSelectionActive) {
          this.handleAreaSelectionClick(e.latlng);
          return;
        }
        this.selectHike(hike, true, true);
      });

      this.markersLayer.addLayer(marker);
    });
  }

  /**
   * Display High-Contrast Clean GPX Polyline (Authentic GPS Track)
   */
  async displayTrack(hike, isSelected = false) {
    if (!hike) return;
    if ((!hike.points || hike.points.length < 5) && typeof StorageManager !== 'undefined') {
      await StorageManager.ensureHikeTrackLoaded(hike);
    }
    if (!hike.points || hike.points.length < 5) {
      this.clearTrack();
      return;
    }

    this.clearTrack();

    const latLngs = hike.points.map(p => [p.lat, p.lon]);
    
    // GPS Track Colors: Bleu Roi Électrique (#1d4ed8 / #2563eb) pour un contraste absolu sur le fond Top 25
    const trackColor = isSelected ? '#1d4ed8' : '#2563eb';

    // 1. Bordure d'ombre externe sombre (détache le halo blanc des zones claires/falaises)
    L.polyline(latLngs, {
      color: '#0f172a',
      weight: isSelected ? 10 : 8,
      opacity: 0.35,
      lineCap: 'round',
      lineJoin: 'round',
      interactive: false
    }).addTo(this.trackLayer);

    // 2. Halo blanc pur très contrasté (détache la trace des forêts vertes et sentiers GR roses)
    L.polyline(latLngs, {
      color: '#ffffff',
      weight: isSelected ? 8 : 6,
      opacity: 0.95,
      lineCap: 'round',
      lineJoin: 'round',
      interactive: false
    }).addTo(this.trackLayer);

    // 3. Tracé GPS principal en Bleu Roi Électrique
    this.activeTrackPolyline = L.polyline(latLngs, {
      color: trackColor,
      weight: isSelected ? 5 : 4,
      opacity: 1,
      lineCap: 'round',
      lineJoin: 'round',
      interactive: false
    }).addTo(this.trackLayer);

    // 4. Marqueur de départ (Pastille verte 'D' avec halo blanc)
    const startPt = hike.points[0];
    const startIcon = L.divIcon({
      className: 'custom-start-marker',
      html: '<div style="width:20px;height:20px;background:#10b981;border:2.5px solid #ffffff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.4);color:#ffffff;font-size:11px;font-weight:900;display:flex;align-items:center;justify-content:center;line-height:1;">D</div>',
      iconSize: [20, 20],
      iconAnchor: [10, 10]
    });
    L.marker([startPt.lat, startPt.lon], { icon: startIcon, interactive: false }).addTo(this.trackLayer);

    // 5. Marqueur d'arrivée (si hors boucle : Pastille rouge 'A')
    if (!hike.isLoop && hike.points.length > 1) {
      const endPt = hike.points[hike.points.length - 1];
      const endIcon = L.divIcon({
        className: 'custom-end-marker',
        html: '<div style="width:20px;height:20px;background:#ef4444;border:2.5px solid #ffffff;border-radius:50%;box-shadow:0 2px 6px rgba(0,0,0,0.4);color:#ffffff;font-size:11px;font-weight:900;display:flex;align-items:center;justify-content:center;line-height:1;">A</div>',
        iconSize: [20, 20],
        iconAnchor: [10, 10]
      });
      L.marker([endPt.lat, endPt.lon], { icon: endIcon, interactive: false }).addTo(this.trackLayer);
    }

  }

  clearTrack() {
    if (this.trackLayer) {
      this.trackLayer.clearLayers();
    }
    this.activeTrackPolyline = null;
  }

  /**
   * Select a hike: draw GPX track, zoom into track, and surround start marker with flashing red circle
   */
  selectHike(hike, fitBounds = true, triggerCallback = true) {
    if (!hike) return;

    this.selectedHike = hike;
    this.displayTrack(hike, true);

    // 1. Nettoyage de l'ancien calque de sélection
    if (this.selectionHaloLayer) {
      this.selectionHaloLayer.clearLayers();
    }

    // 2. Re-render markers so the selected one has highlighted pin styling
    this.renderHikeMarkers(this.currentHikesList);

    // 3. Centrage fluide sur le tracé ou le point de départ de la randonnée
    if (fitBounds && hike) {
      let b = hike.bounds;
      if (!b && hike.points && hike.points.length > 0) {
        b = L.latLngBounds(hike.points.map(p => [p.lat, p.lon]));
      }
      if (b && typeof b.isValid === 'function' && b.isValid()) {
        this.map.fitBounds(b, { padding: [50, 50], maxZoom: 15, animate: true, duration: 0.3 });
      } else if (hike.startPoint) {
        this.map.setView([hike.startPoint.lat, hike.startPoint.lon], 13);
      }
    }

    if (triggerCallback && this.onHikeSelectCallback) {
      this.onHikeSelectCallback(hike);
    }
  }

  deselectHike() {
    this.selectedHike = null;
    this.clearTrack();
    this.clearCursorPosition();
    if (this.selectionHaloLayer) {
      this.selectionHaloLayer.clearLayers();
    }
    this.renderHikeMarkers(this.currentHikesList);
  }

  setCursorPosition(point) {
    if (!this.map || !point) return;

    if (!this.cursorMarker) {
      this.cursorMarker = L.circleMarker([point.lat, point.lon], {
        radius: 6,
        fillColor: '#dc2626',
        color: '#ffffff',
        weight: 2,
        fillOpacity: 1,
        zIndexOffset: 2000
      }).addTo(this.map);
    } else {
      this.cursorMarker.setLatLng([point.lat, point.lon]);
    }
  }

  clearCursorPosition() {
    if (this.cursorMarker) {
      this.cursorMarker.remove();
      this.cursorMarker = null;
    }
  }

  // =========================================================================
  // CARROYAGE UTM & OUTILS CARTOGRAPHIQUES (TOP 25)
  // =========================================================================

  /**
   * Conversion WGS84 (Lat, Lon) vers UTM (Zone, Band, Easting, Northing)
   * Précision sub-millimétrique basée sur l'ellipsoïde WGS84 standard IGN/OTAN
   */
  static latLonToUtm(lat, lon) {
    const a = 6378137.0;
    const f = 1 / 298.257223563;
    const b = a * (1 - f);
    const e2 = (a * a - b * b) / (a * a);
    const e_prime2 = (a * a - b * b) / (b * b);
    const k0 = 0.9996;

    let zone = Math.floor((lon + 180) / 6) + 1;
    if (lat >= 56.0 && lat < 64.0 && lon >= 3.0 && lon < 12.0) zone = 32;

    const lon0 = (zone - 1) * 6 - 180 + 3;
    const lon0_rad = (lon0 * Math.PI) / 180;
    const lat_rad = (lat * Math.PI) / 180;
    const lon_rad = (lon * Math.PI) / 180;

    const N = a / Math.sqrt(1 - e2 * Math.sin(lat_rad) * Math.sin(lat_rad));
    const T = Math.tan(lat_rad) * Math.tan(lat_rad);
    const C = e_prime2 * Math.cos(lat_rad) * Math.cos(lat_rad);
    const A = (lon_rad - lon0_rad) * Math.cos(lat_rad);

    const M = a * (
      (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * Math.pow(e2, 3) / 256) * lat_rad
      - (3 * e2 / 8 + 3 * e2 * e2 / 32 + 45 * Math.pow(e2, 3) / 1024) * Math.sin(2 * lat_rad)
      + (15 * e2 * e2 / 256 + 45 * Math.pow(e2, 3) / 1024) * Math.sin(4 * lat_rad)
      - (35 * Math.pow(e2, 3) / 3072) * Math.sin(6 * lat_rad)
    );

    const easting = k0 * N * (
      A + (1 - T + C) * Math.pow(A, 3) / 6
      + (5 - 18 * T + T * T + 72 * C - 58 * e_prime2) * Math.pow(A, 5) / 120
    ) + 500000.0;

    let northing = k0 * (
      M + N * Math.tan(lat_rad) * (
        (A * A) / 2
        + (5 - T + 9 * C + 4 * C * C) * Math.pow(A, 4) / 24
        + (61 - 58 * T + T * T + 600 * C - 330 * e_prime2) * Math.pow(A, 6) / 720
      )
    );

    if (lat < 0) {
      northing += 10000000.0;
    }

    const bands = 'CDEFGHJKLMNPQRSTUVWX';
    let band = 'N';
    if (lat >= -80 && lat <= 84) {
      const idx = Math.floor((lat + 80) / 8);
      band = bands[Math.min(idx, bands.length - 1)];
    }

    return {
      zone,
      band,
      easting: Math.round(easting),
      northing: Math.round(northing),
      formatted: `${zone}${band} ${Math.round(easting)} E  ${Math.round(northing)} N`
    };
  }

  /**
   * Conversion Inverse UTM vers WGS84 (Lat, Lon)
   */
  static utmToLatLon(easting, northing, zone, isNorthern = true) {
    const a = 6378137.0;
    const f = 1 / 298.257223563;
    const b = a * (1 - f);
    const e2 = (a * a - b * b) / (a * a);
    const e_prime2 = (a * a - b * b) / (b * b);
    const k0 = 0.9996;

    const x = easting - 500000.0;
    const y = isNorthern ? northing : northing - 10000000.0;
    const lon0 = (zone - 1) * 6 - 180 + 3;
    const lon0_rad = (lon0 * Math.PI) / 180;

    const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
    const M = y / k0;
    const mu = M / (a * (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * Math.pow(e2, 3) / 256));

    const phi1_rad = mu
      + (3 * e1 / 2 - 27 * Math.pow(e1, 3) / 32) * Math.sin(2 * mu)
      + (21 * e1 * e1 / 16 - 55 * Math.pow(e1, 4) / 32) * Math.sin(4 * mu)
      + (151 * Math.pow(e1, 3) / 96) * Math.sin(6 * mu);

    const N1 = a / Math.sqrt(1 - e2 * Math.sin(phi1_rad) * Math.sin(phi1_rad));
    const T1 = Math.tan(phi1_rad) * Math.tan(phi1_rad);
    const C1 = e_prime2 * Math.cos(phi1_rad) * Math.cos(phi1_rad);
    const R1 = a * (1 - e2) / Math.pow(1 - e2 * Math.sin(phi1_rad) * Math.sin(phi1_rad), 1.5);
    const D = x / (N1 * k0);

    const lat_rad = phi1_rad - (N1 * Math.tan(phi1_rad) / R1) * (
      (D * D) / 2
      - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * e_prime2) * Math.pow(D, 4) / 24
      + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * e_prime2 - 3 * C1 * C1) * Math.pow(D, 6) / 720
    );

    const lon_rad = lon0_rad + (
      D
      - (1 + 2 * T1 + C1) * Math.pow(D, 3) / 6
      + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * e_prime2 + 24 * T1 * T1) * Math.pow(D, 5) / 120
    ) / Math.cos(phi1_rad);

    return {
      lat: (lat_rad * 180) / Math.PI,
      lon: (lon_rad * 180) / Math.PI
    };
  }

  /**
   * Rendu dynamique du Carroyage UTM kilométrique sur la carte
   */
  renderUtmGrid() {
    if (!this.map || !this.utmGridLayer || !this.map.hasLayer(this.utmGridLayer)) return;
    this.utmGridLayer.clearLayers();

    const zoom = this.map.getZoom();
    if (zoom < 8) return; // Trop dézoomé pour afficher la grille

    // Intervalle métrique adapté selon le zoom
    let step = 1000; // 1 km par défaut (authentique Top 25)
    if (zoom <= 8) step = 20000;
    else if (zoom <= 10) step = 10000;
    else if (zoom <= 12) step = 5000;
    else step = 1000; // Zoom >= 13 : Carroyage 1 km officiel

    const bounds = this.map.getBounds();
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    const center = bounds.getCenter();

    const centerUtm = MapManager.latLonToUtm(center.lat, center.lng);
    const zone = centerUtm.zone;

    const utmSW = MapManager.latLonToUtm(sw.lat, sw.lng);
    const utmNE = MapManager.latLonToUtm(ne.lat, ne.lng);
    const utmNW = MapManager.latLonToUtm(ne.lat, sw.lng);
    const utmSE = MapManager.latLonToUtm(sw.lat, ne.lng);

    const minE = Math.min(utmSW.easting, utmNE.easting, utmNW.easting, utmSE.easting);
    const maxE = Math.max(utmSW.easting, utmNE.easting, utmNW.easting, utmSE.easting);
    const minN = Math.min(utmSW.northing, utmNE.northing, utmNW.northing, utmSE.northing);
    const maxN = Math.max(utmSW.northing, utmNE.northing, utmNW.northing, utmSE.northing);

    const startE = Math.floor(minE / step) * step;
    const endE = Math.ceil(maxE / step) * step;
    const startN = Math.floor(minN / step) * step;
    const endN = Math.ceil(maxN / step) * step;

    // Protection surcharge
    const countE = Math.round((endE - startE) / step);
    const countN = Math.round((endN - startN) / step);
    if (countE > 60 || countN > 60 || countE < 1 || countN < 1) return;

    // Lignes verticales de carroyage (Easting constant)
    const nSteps = 6;
    for (let e = startE; e <= endE; e += step) {
      const linePts = [];
      for (let s = 0; s <= nSteps; s++) {
        const currN = startN + (s / nSteps) * (endN - startN);
        const ll = MapManager.utmToLatLon(e, currN, zone, center.lat >= 0);
        linePts.push([ll.lat, ll.lon]);
      }
      L.polyline(linePts, {
        color: '#0284c7', // Bleu Top 25
        weight: 1,
        opacity: 0.55,
        dashArray: '3, 4',
        interactive: false
      }).addTo(this.utmGridLayer);

      // Étiquette kilométrique
      const km = Math.round(e / 1000);
      const botPt = linePts[0];
      const icon = L.divIcon({
        className: 'utm-grid-label',
        html: `<span>${km}</span>`,
        iconSize: [26, 14],
        iconAnchor: [13, 7]
      });
      L.marker(botPt, { icon, interactive: false }).addTo(this.utmGridLayer);
    }

    // Lignes horizontales de carroyage (Northing constant)
    for (let n = startN; n <= endN; n += step) {
      const linePts = [];
      for (let s = 0; s <= nSteps; s++) {
        const currE = startE + (s / nSteps) * (endE - startE);
        const ll = MapManager.utmToLatLon(currE, n, zone, center.lat >= 0);
        linePts.push([ll.lat, ll.lon]);
      }
      L.polyline(linePts, {
        color: '#0284c7',
        weight: 1,
        opacity: 0.55,
        dashArray: '3, 4',
        interactive: false
      }).addTo(this.utmGridLayer);

      // Étiquette kilométrique
      const km = Math.round(n / 1000);
      const leftPt = linePts[0];
      const icon = L.divIcon({
        className: 'utm-grid-label',
        html: `<span>${km}</span>`,
        iconSize: [36, 14],
        iconAnchor: [18, 7]
      });
      L.marker(leftPt, { icon, interactive: false }).addTo(this.utmGridLayer);
    }
  }

  /**
   * Calcul du ratio d'échelle cartographique dynamique selon le zoom et la latitude
   */
  getNumericScaleRatio() {
    if (!this.map) return 25000;
    const center = this.map.getCenter();
    const zoom = this.map.getZoom();
    const metersPerPixel = (40075016.686 * Math.cos((center.lat * Math.PI) / 180)) / (256 * Math.pow(2, zoom));
    const scale = metersPerPixel * 3779.5275;
    return Math.round(scale);
  }

  /**
   * Mise à jour du bandeau HUD sur la carte (Échelle dynamique)
   */
  updateMapHud() {
    const scaleEl = document.getElementById('map-hud-scale');
    if (!scaleEl || !this.map) return;
    const scale = this.getNumericScaleRatio();
    let label = `Échelle ~ 1 : ${scale.toLocaleString('fr-FR')}`;
    if (scale >= 21000 && scale <= 29000) {
      label = `Échelle 1 : 25 000 (TOP 25)`;
    }
    scaleEl.innerHTML = `<span>🔍</span> <span>${label}</span>`;
  }

  /**
   * Mise à jour des coordonnées GPS et UTM du curseur en direct
   */
  updateCursorCoords(latlng) {
    const wgsEl = document.getElementById('map-hud-wgs84');
    const utmEl = document.getElementById('map-hud-utm');
    if (!wgsEl || !utmEl) return;

    const pt = latlng || (this.map ? this.map.getCenter() : { lat: 43.1189, lng: 5.8033 });
    const lat = pt.lat;
    const lon = pt.lng;

    const latStr = `${Math.abs(lat).toFixed(4)}° ${lat >= 0 ? 'N' : 'S'}`;
    const lonStr = `${Math.abs(lon).toFixed(4)}° ${lon >= 0 ? 'E' : 'O'}`;
    wgsEl.innerHTML = `<span>📍</span> <span>${latStr}, ${lonStr}</span>`;

    const utm = MapManager.latLonToUtm(lat, lon);
    utmEl.innerHTML = `<span>🌐</span> <span>${utm.zone}${utm.band} ${utm.easting} E  ${utm.northing} N</span>`;

    this._lastCoords = {
      lat,
      lon,
      latStr,
      lonStr,
      utm
    };
  }

  /**
   * Copie dans le presse-papier des coordonnées actuelles
   */
  copyCurrentCoordsToClipboard() {
    const c = this._lastCoords;
    if (!c) return;
    const text = `GPS WGS84 : ${c.lat.toFixed(5)}°, ${c.lon.toFixed(5)}° (${c.latStr}, ${c.lonStr}) | Carroyage UTM : ${c.utm.zone}${c.utm.band} ${c.utm.easting} m E, ${c.utm.northing} m N`;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        if (window.App && window.App.showToast) {
          window.App.showToast(`📋 Coordonnées copiées : ${c.latStr}, ${c.lonStr} (UTM ${c.utm.zone}${c.utm.band} ${c.utm.easting}E ${c.utm.northing}N)`, "success");
        }
      }).catch(() => {
        prompt("Coordonnées GPS & UTM :", text);
      });
    } else {
      prompt("Coordonnées GPS & UTM :", text);
    }
  }
}

window.MapManager = MapManager;
