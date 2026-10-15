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
    this.currentBaseLayer = 'ign';
    this.areaSelectionActive = false;
    this.areaSelectionCorner1 = null;
    this.areaSelectionLayer = null;
    this.areaSelectionRect = null;
    this.areaSelectionOnComplete = null;
    this.areaSelectionOnCancel = null;
  }

  init() {
    if (this.map) return;

    // 1. Define 100% Free & Unrestricted French & Global Base Layers (No API Key Required)
    const ignPlan = L.tileLayer('https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image%2Fpng', {
      maxZoom: 19,
      attribution: '&copy; IGN France - Géoplateforme'
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
      "IGN Plan / Topo (Officiel)": ignPlan,
      "OpenStreetMap France": osmFr,
      "OpenTopoMap (Relief)": openTopo,
      "Satellite Mondial (Esri 🌍)": esriSat,
      "Satellite France (IGN Ortho)": ignSat
    };

    // 2. Init Map centered on Sanary-sur-Mer with official IGN Plan Topo layer
    this.map = L.map(this.containerId, {
      center: [this.searchOrigin.lat, this.searchOrigin.lon],
      zoom: 11,
      maxZoom: 19,
      layers: [ignPlan],
      zoomControl: true
    });

    L.control.layers(this.baseLayers, null, { position: 'topright' }).addTo(this.map);
    L.control.scale({ imperial: false, metric: true, position: 'bottomleft' }).addTo(this.map);

    this.markersLayer = L.layerGroup().addTo(this.map);
    this.selectionHaloLayer = L.layerGroup().addTo(this.map);
    this.trackLayer = L.layerGroup().addTo(this.map);

    this.updateSearchRadiusVisuals(false);

    // Track active base layer
    this.map.on('baselayerchange', (e) => {
      const name = (e.name || '').toLowerCase();
      if (name.includes('ign') || name.includes('topo')) this.currentBaseLayer = 'ign';
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

    // Map Zoom Listener (e.g. mouse wheel zoom/dezoom on map)
    this.map.on('zoomend', () => {
      if (this.onMapZoomChangeCallback) {
        this.onMapZoomChangeCallback(this.map.getZoom());
      }
    });

    setTimeout(() => {
      if (this.map) this.map.invalidateSize();
    }, 200);
  }

  getCurrentBaseLayerKey() {
    return this.currentBaseLayer || 'ign';
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
    
    // GPS Track Colors: Electric Royal Blue (#2563eb) when selected, Emerald (#059669) when hovered
    const trackColor = isSelected ? '#2563eb' : '#059669';

    // 1. White casing background line for maximum contrast against any map background
    L.polyline(latLngs, {
      color: '#ffffff',
      weight: isSelected ? 7.5 : 5.5,
      opacity: 0.95,
      lineCap: 'round',
      lineJoin: 'round',
      interactive: false
    }).addTo(this.trackLayer);

    // 2. Main GPS trail polyline
    this.activeTrackPolyline = L.polyline(latLngs, {
      color: trackColor,
      weight: isSelected ? 4.5 : 3.5,
      opacity: 1,
      lineCap: 'round',
      lineJoin: 'round',
      interactive: false
    }).addTo(this.trackLayer);

    // 3. Departure Marker (Green Dot with White Halo)
    const startPt = hike.points[0];
    L.circleMarker([startPt.lat, startPt.lon], {
      radius: 6.5,
      fillColor: '#10b981',
      color: '#ffffff',
      weight: 2.5,
      fillOpacity: 1,
      interactive: false
    }).addTo(this.trackLayer);

    // 4. Arrival Marker (Red Dot) if not a closed loop
    if (!hike.isLoop && hike.points.length > 1) {
      const endPt = hike.points[hike.points.length - 1];
      L.circleMarker([endPt.lat, endPt.lon], {
        radius: 6.5,
        fillColor: '#ef4444',
        color: '#ffffff',
        weight: 2.5,
        fillOpacity: 1,
        interactive: false
      }).addTo(this.trackLayer);
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
}

window.MapManager = MapManager;
