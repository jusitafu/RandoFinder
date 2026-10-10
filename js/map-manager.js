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
    this.onSearchOriginChangeCallback = null;
    this.onMapBackgroundClickCallback = null;

    // Default center: Sanary-sur-Mer (43.1189, 5.8033)
    this.searchOrigin = { lat: 43.1189, lon: 5.8033, name: 'Sanary-sur-Mer' };
    this.searchRadiusKm = 100;
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
      maxZoom: 17,
      subdomains: 'abc',
      attribution: '&copy; OpenTopoMap'
    });

    const ignSat = L.tileLayer('https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&FORMAT=image%2Fjpeg', {
      maxZoom: 19,
      attribution: '&copy; IGN France (Orthophoto HD)'
    });

    this.baseLayers = {
      "IGN Plan / Topo (Officiel)": ignPlan,
      "OpenStreetMap France": osmFr,
      "OpenTopoMap (Relief)": openTopo,
      "Satellite (Photo Aérienne HD)": ignSat
    };

    // 2. Init Map centered on Sanary-sur-Mer with official IGN Plan Topo layer
    this.map = L.map(this.containerId, {
      center: [this.searchOrigin.lat, this.searchOrigin.lon],
      zoom: 11,
      layers: [ignPlan],
      zoomControl: true
    });

    L.control.layers(this.baseLayers, null, { position: 'topright' }).addTo(this.map);
    L.control.scale({ imperial: false, metric: true, position: 'bottomleft' }).addTo(this.map);

    this.markersLayer = L.layerGroup().addTo(this.map);
    this.selectionHaloLayer = L.layerGroup().addTo(this.map);
    this.trackLayer = L.layerGroup().addTo(this.map);

    this.updateSearchRadiusVisuals(false);

    // Map Click Listener (Background click deselects or sets search origin)
    this.map.on('click', (e) => {
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

  setClickMode(active) {
    this.clickModeActive = active;
    const mapEl = document.getElementById(this.containerId);
    if (mapEl) {
      if (active) mapEl.classList.add('cursor-crosshair');
      else mapEl.classList.remove('cursor-crosshair');
    }
  }

  setSearchOrigin(lat, lon, name = 'Lieu sélectionné') {
    this.searchOrigin = { lat, lon, name };
    this.updateSearchRadiusVisuals(true);
    if (this.onSearchOriginChangeCallback) {
      this.onSearchOriginChangeCallback(this.searchOrigin);
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

  renderHikeMarkers(hikes) {
    if (!this.markersLayer) return;
    this.currentHikesList = hikes || [];
    this.markersLayer.clearLayers();

    this.currentHikesList.forEach((hike) => {
      if (!hike.startPoint || isNaN(hike.startPoint.lat) || isNaN(hike.startPoint.lon)) return;

      const isSelected = this.selectedHike && (this.selectedHike.id === hike.id || this.selectedHike.name === hike.name);

      let colorClass = 'bg-emerald-600';
      let haloColor = 'bg-emerald-500';
      if (hike.elevationGain >= 700 || hike.distanceKm > 18) {
        colorClass = 'bg-rose-600';
        haloColor = 'bg-rose-500';
      } else if (hike.elevationGain >= 350 || hike.distanceKm > 12) {
        colorClass = 'bg-amber-500';
        haloColor = 'bg-amber-500';
      }

      // If selected, pin is bright red
      if (isSelected) {
        colorClass = 'bg-red-600';
        haloColor = 'bg-red-500';
      }

      // Marker HTML - Clean and sharp pin
      const icon = L.divIcon({
        className: 'custom-hike-start-icon',
        html: `
          <div class="relative cursor-pointer -translate-x-1/2 -translate-y-full group">
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
        zIndexOffset: isSelected ? 2500 : 500
      });

      // Hover displays clean GPX track and preview card
      marker.on('mouseover', () => {
        this.hoveredHike = hike;
        this.displayTrack(hike, false);
        if (this.onHikeHoverCallback) this.onHikeHoverCallback(hike);
      });

      marker.on('mouseout', () => {
        if (this.selectedHike) {
          this.displayTrack(this.selectedHike, true);
        } else {
          this.clearTrack();
        }
        if (this.onHikeHoverCallback) this.onHikeHoverCallback(this.selectedHike || null);
      });

      marker.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
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
    if ((!hike.points || hike.points.length === 0) && typeof StorageManager !== 'undefined') {
      await StorageManager.ensureHikeTrackLoaded(hike);
    }
    if (!hike.points || hike.points.length === 0) return;

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
      lineJoin: 'round'
    }).addTo(this.trackLayer);

    // 2. Main GPS trail polyline
    this.activeTrackPolyline = L.polyline(latLngs, {
      color: trackColor,
      weight: isSelected ? 4.5 : 3.5,
      opacity: 1,
      lineCap: 'round',
      lineJoin: 'round'
    }).addTo(this.trackLayer);

    // 3. Departure Marker (Green Dot with White Halo)
    const startPt = hike.points[0];
    L.circleMarker([startPt.lat, startPt.lon], {
      radius: 6.5,
      fillColor: '#10b981',
      color: '#ffffff',
      weight: 2.5,
      fillOpacity: 1
    }).addTo(this.trackLayer);

    // 4. Arrival Marker (Red Dot) if not a closed loop
    if (!hike.isLoop && hike.points.length > 1) {
      const endPt = hike.points[hike.points.length - 1];
      L.circleMarker([endPt.lat, endPt.lon], {
        radius: 6.5,
        fillColor: '#ef4444',
        color: '#ffffff',
        weight: 2.5,
        fillOpacity: 1
      }).addTo(this.trackLayer);
    }

    // Centrage automatique du tracé si la rando est sélectionnée
    if (isSelected) {
      let b = hike.bounds;
      if (!b && hike.points && hike.points.length > 0) {
        b = L.latLngBounds(latLngs);
      }
      if (b && typeof b.isValid === 'function' && b.isValid()) {
        this.map.fitBounds(b, { padding: [50, 50], maxZoom: 15, animate: true, duration: 0.3 });
      }
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
