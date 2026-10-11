/**
 * Main Application Controller
 * Les Randonneurs Sanaryens - RandoFinder - JLD Apps 2026
 * Comprehensive features: Search, Native Upload, Management (Edit ✏️ & Delete 🗑️ with confirmation)
 */

// Échelle de paliers de rayon de recherche (de 10 km à 20 000 km / Monde entier)
const RADIUS_STEPS = [
  10, 20, 30, 50, 75, 100, 150, 200, 300, 500, 750, 1000, 2500, 5000, 10000, 20000
];

class AppController {
  constructor() {
    this.allHikes = [];
    this.filteredHikes = [];
    this.selectedHike = null;
    this.hikeToEdit = null;
    this.hikeToDelete = null;

    this.currentViewMode = 'split';
    this.currentTab = 'explorer';
    
    this.sortColumn = 'distFromOrigin';
    this.sortAsc = true;
    this.searchQuery = '';
    this.manageSearchQuery = '';

    this.pendingUploads = [];
  }

  getRadiusLabel(km) {
    if (km >= 20000) return 'Monde entier 🌍';
    if (km >= 10000) return `${km.toLocaleString('fr-FR')} km (Monde)`;
    if (km >= 1000) return `${km.toLocaleString('fr-FR')} km`;
    return `${km} km`;
  }

  getStepIndexForKm(km) {
    const idx = RADIUS_STEPS.findIndex(s => s >= km);
    return idx === -1 ? RADIUS_STEPS.length - 1 : idx;
  }

  setRadiusStep(stepIndex, autoZoomMap = true) {
    const idx = Math.max(0, Math.min(RADIUS_STEPS.length - 1, Number(stepIndex)));
    const km = RADIUS_STEPS[idx];
    const radiusSlider = document.getElementById('radius-slider');
    const radiusDisplay = document.getElementById('radius-display');

    if (radiusSlider) radiusSlider.value = idx;
    if (radiusDisplay) radiusDisplay.textContent = this.getRadiusLabel(km);

    if (window.MapManagerInstance) {
      window.MapManagerInstance.setSearchRadius(km, autoZoomMap);
    }
    this.applyFiltersAndRender();
  }

  async init() {
    console.log("Démarrage de RandoFinder - Randonneurs Sanaryens...");

    // 0. Initialisation de l'authentification et session (Mode B2 - Accès Privé)
    if (typeof AuthManager !== 'undefined') {
      try {
        await AuthManager.init();
      } catch (err) {
        console.warn("Erreur AuthManager init :", err);
      }
    }
    this.checkAuthenticationState();

    // 1. Lancement immédiat de la marche des 3 randonneurs dès l'ouverture de la page
    this.playLogoMarch();

    // 2. Setup UI & Event Listeners
    try {
      this.setupEventListeners();
    } catch (e) {
      console.error("Erreur UI :", e);
    }

    // 2. Initialize Storage
    try {
      await StorageManager.init();
    } catch (e) {
      console.warn("Storage init warning :", e);
    }

    // 3. Initialize Map
    try {
      if (typeof L !== 'undefined' && typeof MapManager !== 'undefined') {
        window.MapManagerInstance = new MapManager('map-view');
        window.MapManagerInstance.init();

        window.MapManagerInstance.onHikeHoverCallback = (hike) => this.handleHikeHover(hike);
        window.MapManagerInstance.onHikeSelectCallback = (hike) => this.handleHikeSelect(hike);
        window.MapManagerInstance.onSearchOriginChangeCallback = (origin) => this.handleOriginChange(origin);
        window.MapManagerInstance.onMapBackgroundClickCallback = () => this.deselectHike();

        // Écouteur de zoom carte (molette de la souris sur la carte)
        window.MapManagerInstance.onMapZoomChangeCallback = (zoom) => {
          if (zoom <= 5) {
            // Vue continentale ou mondiale : bascule automatique sur Monde entier
            if (window.MapManagerInstance.searchRadiusKm < 20000) {
              this.setRadiusStep(RADIUS_STEPS.length - 1, false);
            }
          } else {
            // Expansion adaptative selon l'étendue visible
            const origin = window.MapManagerInstance.searchOrigin;
            const bounds = window.MapManagerInstance.map.getBounds();
            if (origin && bounds) {
              const d1 = GPXParser.haversineDistance(origin.lat, origin.lon, bounds.getNorthEast().lat, bounds.getNorthEast().lng);
              const d2 = GPXParser.haversineDistance(origin.lat, origin.lon, bounds.getSouthWest().lat, bounds.getSouthWest().lng);
              const visibleRadius = Math.max(d1, d2);
              if (visibleRadius > window.MapManagerInstance.searchRadiusKm) {
                const stepIdx = this.getStepIndexForKm(visibleRadius);
                this.setRadiusStep(stepIdx, false);
              }
            }
          }
        };
      }
    } catch (e) {
      console.error("Erreur map init :", e);
    }

    // 4. Initialize Elevation Profile
    try {
      if (typeof ElevationProfile !== 'undefined') {
        this.elevationProfile = new ElevationProfile('elevation-chart-container');
      }
    } catch (e) {
      console.error("Erreur profile init :", e);
    }

    // 5. Load Hikes from Storage
    try {
      let hikes = await StorageManager.getAllHikes();
      if (!hikes || hikes.length === 0) {
        if (typeof SampleData !== 'undefined') {
          console.log("Chargement initial des randonnées d'exemple...");
          const samples = SampleData.getSampleHikes();
          for (const s of samples) {
            await StorageManager.saveHike(s);
          }
          hikes = samples;
        }
      }
      this.allHikes = hikes || [];
    } catch (e) {
      console.error("Erreur chargement randonnées :", e);
      if (typeof SampleData !== 'undefined') {
        this.allHikes = SampleData.getSampleHikes();
      }
    }

    // 6. Update UI
    try {
      this.updateStorageBadge();
      this.applyFiltersAndRender();
      this.renderManagementList();
    } catch (e) {
      console.error("Erreur affichage :", e);
    }

    // 7. Initialize server sync preferences & auto-sync if active
    try {
      const serverUrlInput = document.getElementById('server-sync-url');
      const autoSyncChk = document.getElementById('chk-auto-sync-server');
      const savedServerUrl = localStorage.getItem('sanary_server_url') || '';
      const savedAutoSync = localStorage.getItem('sanary_server_autosync') === 'true';

      if (serverUrlInput && savedServerUrl) {
        serverUrlInput.value = savedServerUrl;
      }
      if (autoSyncChk) {
        autoSyncChk.checked = savedAutoSync;
      }

      if (savedAutoSync && savedServerUrl) {
        this.syncFromServer(savedServerUrl, true);
      }
    } catch (e) {
      console.warn("Erreur auto-sync serveur :", e);
    }

    // 8. Initialize Supabase preferences & auto-sync if active
    try {
      const supaUrlInput = document.getElementById('supabase-url');
      const supaKeyInput = document.getElementById('supabase-key');
      const supaAutoSyncChk = document.getElementById('chk-auto-sync-supabase');

      const defaultSupaUrl = (window.APP_CONFIG && window.APP_CONFIG.supabaseUrl) || 'https://qguseukrgsczgviuloxr.supabase.co';
      const defaultSupaKey = (window.APP_CONFIG && window.APP_CONFIG.supabaseKey) || 'sb_publishable_iy3fFv7Qo5Rc9D3gcNhXsA_72y1_j44';
      const savedSupaUrl = localStorage.getItem('sanary_supabase_url') || defaultSupaUrl;
      const savedSupaKey = localStorage.getItem('sanary_supabase_key') || defaultSupaKey;
      const savedSupaAutoSync = localStorage.getItem('sanary_supabase_autosync') !== 'false'; // true par défaut

      if (supaUrlInput) supaUrlInput.value = savedSupaUrl;
      if (supaKeyInput) supaKeyInput.value = savedSupaKey;
      if (supaAutoSyncChk) supaAutoSyncChk.checked = savedSupaAutoSync;

      this.updateSupabaseBadge();

      if (savedSupaAutoSync && savedSupaUrl && savedSupaKey) {
        this.syncFromSupabase(true);
      }
    } catch (e) {
      console.warn("Erreur auto-sync Supabase :", e);
    }

    console.log(`RandoFinder prêt ! ${this.allHikes.length} randonnées prêtes.`);
  }

  setupEventListeners() {
    // Tab switching
    document.querySelectorAll('[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.getAttribute('data-tab');
        this.switchTab(tab);
      });
    });

    // View mode switching (Map / Table / Split)
    document.querySelectorAll('[data-view-mode]').forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.getAttribute('data-view-mode');
        this.setViewMode(mode);
      });
    });

    // Distance Radius Slider with immediate map adaptation and Mouse Wheel support
    const radiusSlider = document.getElementById('radius-slider');
    const radiusContainer = document.getElementById('radius-container');
    const btnWorldView = document.getElementById('btn-world-view');

    if (radiusSlider) {
      radiusSlider.addEventListener('input', (e) => {
        const stepIdx = parseInt(e.target.value, 10);
        this.setRadiusStep(stepIdx, true);
      });
    }

    // Support de la molette de la souris sur le conteneur du rayon et le slider :
    // Molette vers le haut = agrandit le rayon jusqu'à 20 000 km (Monde entier)
    // Molette vers le bas = réduit le rayon jusqu'à 10 km
    if (radiusContainer) {
      radiusContainer.addEventListener('wheel', (e) => {
        e.preventDefault();
        const slider = document.getElementById('radius-slider');
        if (!slider) return;
        let currentStep = parseInt(slider.value, 10);
        if (e.deltaY < 0) {
          currentStep = Math.min(RADIUS_STEPS.length - 1, currentStep + 1);
        } else {
          currentStep = Math.max(0, currentStep - 1);
        }
        this.setRadiusStep(currentStep, true);
      }, { passive: false });
    }

    // Bouton d'accès rapide "Monde entier" (Canada, Chine...)
    if (btnWorldView) {
      btnWorldView.addEventListener('click', (e) => {
        e.preventDefault();
        this.setRadiusStep(RADIUS_STEPS.length - 1, true);
      });
    }

    // Search Location Input (Worldwide Autocomplete + Enter support)
    const locationInput = document.getElementById('location-input');
    if (locationInput) {
      let debounceTimer = null;
      locationInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        const query = e.target.value.trim();
        if (query.length < 2) return;
        debounceTimer = setTimeout(() => this.searchPlaces(query), 300);
      });

      locationInput.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const query = e.target.value.trim();
          if (query) {
            await this.searchAndSelectFirstPlace(query);
          }
        }
      });
    }

    // Fermer l'autocomplétion si clic à l'extérieur
    document.addEventListener('click', (e) => {
      const resultsContainer = document.getElementById('location-autocomplete-results');
      if (resultsContainer && locationInput && !locationInput.contains(e.target) && !resultsContainer.contains(e.target)) {
        resultsContainer.classList.add('hidden');
      }
    });

    // Geolocation button "Ma position"
    const geolocBtn = document.getElementById('btn-geoloc');
    if (geolocBtn) {
      geolocBtn.addEventListener('click', () => this.useCurrentLocation());
    }

    // Click map button
    const clickMapBtn = document.getElementById('btn-click-map');
    if (clickMapBtn) {
      clickMapBtn.addEventListener('click', () => {
        if (window.MapManagerInstance) {
          window.MapManagerInstance.setClickMode(true);
          this.showToast("Cliquez sur la carte pour choisir le centre de recherche", "info");
        }
      });
    }

    // Recherche synchronisée dans les randonnées (barre du haut & barre au-dessus du tableau)
    const hikeSearchInput = document.getElementById('hike-search-input');
    const tableFilterInput = document.getElementById('table-filter-input');
    const btnClearTableFilter = document.getElementById('btn-clear-table-filter');

    const handleSearchInput = (val) => {
      this.searchQuery = (val || '').trim().toLowerCase();
      if (hikeSearchInput && hikeSearchInput.value !== val) hikeSearchInput.value = val;
      if (tableFilterInput && tableFilterInput.value !== val) tableFilterInput.value = val;
      if (btnClearTableFilter) {
        if (val) btnClearTableFilter.classList.remove('hidden');
        else btnClearTableFilter.classList.add('hidden');
      }
      this.applyFiltersAndRender();
    };

    if (hikeSearchInput) {
      hikeSearchInput.addEventListener('input', (e) => handleSearchInput(e.target.value));
    }
    if (tableFilterInput) {
      tableFilterInput.addEventListener('input', (e) => handleSearchInput(e.target.value));
    }
    if (btnClearTableFilter) {
      btnClearTableFilter.addEventListener('click', () => handleSearchInput(''));
    }

    // Manage tab search input
    const manageSearchInput = document.getElementById('manage-search-input');
    if (manageSearchInput) {
      manageSearchInput.addEventListener('input', (e) => {
        this.manageSearchQuery = e.target.value.trim().toLowerCase();
        this.renderManagementList();
      });
    }

    // Pick Local Folder (Chrome / Edge PC)
    const pickFolderBtn = document.getElementById('btn-pick-folder');
    if (pickFolderBtn) {
      pickFolderBtn.addEventListener('click', () => this.handlePickFolder());
    }

    // Storage Badge click -> open Settings
    const storageBadge = document.getElementById('storage-badge');
    if (storageBadge) {
      storageBadge.addEventListener('click', () => this.switchTab('settings'));
    }

    // Close user menu dropdown when clicking outside
    document.addEventListener('click', (e) => {
      const userDropdown = document.getElementById('user-menu-dropdown');
      if (userDropdown && !userDropdown.classList.contains('hidden')) {
        if (!e.target.closest('#btn-user-badge') && !e.target.closest('#user-menu-dropdown')) {
          userDropdown.classList.add('hidden');
        }
      }
    });

    // Native File Input & Dropzone Setup
    const fileInput = document.getElementById('file-input');
    const dropzone = document.getElementById('upload-dropzone');

    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
          this.handleFilesUploaded(e.target.files);
          e.target.value = ''; // Reset to allow re-uploading same file if desired
        }
      });
    }

    if (dropzone) {
      dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.add('border-emerald-500', 'bg-emerald-50');
      });
      dropzone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove('border-emerald-500', 'bg-emerald-50');
      });
      dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropzone.classList.remove('border-emerald-500', 'bg-emerald-50');
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          this.handleFilesUploaded(e.dataTransfer.files);
        }
      });
    }

    // Paste GPX Button
    const parsePasteBtn = document.getElementById('btn-parse-paste-gpx');
    if (parsePasteBtn) {
      parsePasteBtn.addEventListener('click', () => this.handlePasteGPX());
    }

    // Cloud Reload Button
    const loadSamplesBtn = document.getElementById('btn-load-samples');
    if (loadSamplesBtn) {
      loadSamplesBtn.addEventListener('click', async () => {
        await this.syncFromSupabase(false);
      });
    }

    // Server Sync Button & Auto-sync checkbox
    const syncServerBtn = document.getElementById('btn-sync-server');
    if (syncServerBtn) {
      syncServerBtn.addEventListener('click', () => {
        const urlInput = document.getElementById('server-sync-url');
        const url = urlInput ? urlInput.value.trim() : '';
        if (!url) {
          this.showToast("Veuillez saisir une URL de serveur valide", "error");
          return;
        }
        localStorage.setItem('sanary_server_url', url);
        this.syncFromServer(url, false);
      });
    }

    const autoSyncChk = document.getElementById('chk-auto-sync-server');
    if (autoSyncChk) {
      autoSyncChk.addEventListener('change', (e) => {
        localStorage.setItem('sanary_server_autosync', e.target.checked ? 'true' : 'false');
      });
    }

    // Supabase Cloud Buttons & Inputs
    const supaUrlInput = document.getElementById('supabase-url');
    const supaKeyInput = document.getElementById('supabase-key');
    const supaAutoSyncChk = document.getElementById('chk-auto-sync-supabase');

    if (supaUrlInput) {
      supaUrlInput.addEventListener('input', (e) => {
        localStorage.setItem('sanary_supabase_url', e.target.value.trim());
        this.updateSupabaseBadge();
      });
    }

    if (supaKeyInput) {
      supaKeyInput.addEventListener('input', (e) => {
        localStorage.setItem('sanary_supabase_key', e.target.value.trim());
        this.updateSupabaseBadge();
      });
    }

    if (supaAutoSyncChk) {
      supaAutoSyncChk.addEventListener('change', (e) => {
        localStorage.setItem('sanary_supabase_autosync', e.target.checked ? 'true' : 'false');
      });
    }

    const syncSupaBtn = document.getElementById('btn-sync-supabase');
    if (syncSupaBtn) {
      syncSupaBtn.addEventListener('click', () => this.syncFromSupabase(false));
    }

    const pushSupaBtn = document.getElementById('btn-push-supabase');
    if (pushSupaBtn) {
      pushSupaBtn.addEventListener('click', () => this.pushAllToSupabase());
    }

    const testSupaBtn = document.getElementById('btn-test-supabase');
    if (testSupaBtn) {
      testSupaBtn.addEventListener('click', () => this.testSupabaseConnection());
    }

    // Export / Import Backup buttons
    const exportBackupBtn = document.getElementById('btn-export-backup');
    if (exportBackupBtn) {
      exportBackupBtn.addEventListener('click', () => StorageManager.exportBackupJSON());
    }

    const importBackupInput = document.getElementById('import-backup-file');
    if (importBackupInput) {
      importBackupInput.addEventListener('change', async (e) => {
        if (e.target.files && e.target.files[0]) {
          const text = await e.target.files[0].text();
          try {
            const count = await StorageManager.importBackupJSON(text);
            this.allHikes = await StorageManager.getAllHikes();
            this.applyFiltersAndRender();
            this.renderManagementList();
            this.showToast(`${count} randonnées restaurées depuis la sauvegarde !`, "success");
          } catch (err) {
            this.showToast("Fichier de sauvegarde invalide.", "error");
          }
        }
      });
    }

    // Logo click listener (rejouer la marche des randonneurs)
    const logoFrame = document.getElementById('logo-frame');
    if (logoFrame) {
      logoFrame.addEventListener('click', () => {
        if (this._initialMarchTimer) {
          clearTimeout(this._initialMarchTimer);
          this._initialMarchTimer = null;
        }
        this.playLogoMarch();
      });
    }

    // Close preview panel button
    const closePreviewBtn = document.getElementById('btn-close-preview');
    if (closePreviewBtn) {
      closePreviewBtn.addEventListener('click', () => this.deselectHike());
    }

    // Edit Modal: Save & Close
    const saveEditBtn = document.getElementById('btn-save-edit');
    if (saveEditBtn) {
      saveEditBtn.addEventListener('click', () => this.saveEditModal());
    }
    const closeEditBtn = document.getElementById('btn-close-edit');
    if (closeEditBtn) {
      closeEditBtn.addEventListener('click', () => this.closeEditModal());
    }

    // Delete Modal: Confirm & Close
    const confirmDeleteBtn = document.getElementById('btn-confirm-delete');
    if (confirmDeleteBtn) {
      confirmDeleteBtn.addEventListener('click', () => this.confirmDeleteModal());
    }
    const cancelDeleteBtn = document.getElementById('btn-cancel-delete');
    if (cancelDeleteBtn) {
      cancelDeleteBtn.addEventListener('click', () => this.closeDeleteModal());
    }

    // Download Modal
    const confirmDownloadBtn = document.getElementById('btn-confirm-download');
    if (confirmDownloadBtn) {
      confirmDownloadBtn.addEventListener('click', () => this.executeDownload());
    }
    const closeModalBtn = document.getElementById('btn-close-modal');
    if (closeModalBtn) {
      closeModalBtn.addEventListener('click', () => this.closeDownloadModal());
    }

    // Click on empty space in table container deselects
    const tableCol = document.getElementById('table-column');
    if (tableCol) {
      tableCol.addEventListener('click', (e) => {
        if (e.target === tableCol || e.target.tagName === 'TBODY' || e.target.id === 'table-container') {
          this.deselectHike();
        }
      });
    }
  }

  deselectHike() {
    this.selectedHike = null;
    if (window.MapManagerInstance) {
      window.MapManagerInstance.deselectHike();
    }
    this.hideHikePreviewPanel();
    this.updateTableSelection(null);
  }

  switchTab(tabName) {
    if (tabName === 'upload' && typeof AuthManager !== 'undefined' && !AuthManager.hasPermission('can_upload')) {
      this.showToast("Accès restreint : Vous n'avez pas l'autorisation de charger des randonnées.", "error");
      return;
    }

    this.currentTab = tabName;
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('[data-tab]').forEach(btn => {
      btn.classList.remove('bg-emerald-700', 'text-white', 'shadow-sm');
      btn.classList.add('text-slate-300', 'hover:bg-slate-800');
    });

    const activeContent = document.getElementById(`tab-content-${tabName}`);
    if (activeContent) activeContent.classList.remove('hidden');

    const activeBtn = document.querySelector(`[data-tab="${tabName}"]`);
    if (activeBtn) {
      activeBtn.classList.remove('text-slate-300', 'hover:bg-slate-800');
      activeBtn.classList.add('bg-emerald-700', 'text-white', 'shadow-sm');
    }

    if (tabName === 'explorer') {
      setTimeout(() => {
        if (window.MapManagerInstance && window.MapManagerInstance.map) {
          window.MapManagerInstance.map.invalidateSize();
        }
      }, 100);
      this.applyFiltersAndRender();
    } else if (tabName === 'manage') {
      this.renderManagementList();
    }
  }

  setViewMode(mode) {
    this.currentViewMode = mode;
    const mapCol = document.getElementById('map-column');
    const tableCol = document.getElementById('table-column');

    document.querySelectorAll('[data-view-mode]').forEach(btn => {
      btn.classList.remove('bg-emerald-600', 'text-white');
      btn.classList.add('bg-slate-100', 'text-slate-700');
    });

    const activeBtn = document.querySelector(`[data-view-mode="${mode}"]`);
    if (activeBtn) {
      activeBtn.classList.remove('bg-slate-100', 'text-slate-700');
      activeBtn.classList.add('bg-emerald-600', 'text-white');
    }

    if (mode === 'map') {
      if (mapCol) {
        mapCol.classList.remove('hidden', 'lg:w-1/2');
        mapCol.classList.add('w-full', 'h-full');
      }
      if (tableCol) tableCol.classList.add('hidden');
    } else if (mode === 'table') {
      if (mapCol) mapCol.classList.add('hidden');
      if (tableCol) {
        tableCol.classList.remove('hidden', 'lg:w-1/2');
        tableCol.classList.add('w-full', 'h-full');
      }
    } else {
      if (mapCol) {
        mapCol.classList.remove('hidden', 'w-full');
        mapCol.classList.add('lg:w-1/2');
      }
      if (tableCol) {
        tableCol.classList.remove('hidden', 'w-full');
        tableCol.classList.add('lg:w-1/2');
      }
    }

    setTimeout(() => {
      if (window.MapManagerInstance && window.MapManagerInstance.map) {
        window.MapManagerInstance.map.invalidateSize();
      }
    }, 150);
  }

  applyFiltersAndRender() {
    const origin = (window.MapManagerInstance && window.MapManagerInstance.searchOrigin) 
      ? window.MapManagerInstance.searchOrigin 
      : { lat: 43.1189, lon: 5.8033 };

    const radius = (window.MapManagerInstance && window.MapManagerInstance.searchRadiusKm) 
      ? window.MapManagerInstance.searchRadiusKm 
      : 100;

    const isWorldWide = radius >= 20000;

    this.filteredHikes = (this.allHikes || []).map(hike => {
      const distFromOrigin = hike.startPoint
        ? GPXParser.haversineDistance(origin.lat, origin.lon, hike.startPoint.lat, hike.startPoint.lon)
        : 9999;

      return {
        ...hike,
        distFromOrigin: Math.round(distFromOrigin * 10) / 10
      };
    }).filter(hike => {
      const matchesRadius = isWorldWide || (hike.distFromOrigin <= radius);
      const matchesQuery = !this.searchQuery || 
        hike.name.toLowerCase().includes(this.searchQuery) || 
        (hike.notes && hike.notes.toLowerCase().includes(this.searchQuery));

      // Si l'utilisateur saisit un mot-clé (ex: "Canada", "Chine", "Garibaldi"), recherche mondiale prioritaire
      if (this.searchQuery) {
        return matchesQuery;
      }

      return matchesRadius;
    });

    this.sortHikes();
    this.renderHikesTable();

    if (window.MapManagerInstance) {
      window.MapManagerInstance.renderHikeMarkers(this.filteredHikes);

      // Si recherche par mot-clé et résultats trouvés, centrer la carte sur les résultats
      if (this.searchQuery && this.filteredHikes.length > 0) {
        const validHikes = this.filteredHikes.filter(h => h.startPoint);
        if (validHikes.length > 0) {
          try {
            const bounds = L.latLngBounds(validHikes.map(h => [h.startPoint.lat, h.startPoint.lon]));
            window.MapManagerInstance.map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
          } catch (e) {}
        }
      }
    }

    const countEl = document.getElementById('results-count');
    if (countEl) {
      if (this.searchQuery) {
        countEl.textContent = `${this.filteredHikes.length} résultat${this.filteredHikes.length > 1 ? 's' : ''} pour "${this.searchQuery}"`;
      } else if (isWorldWide) {
        countEl.textContent = `${this.filteredHikes.length} randonnée${this.filteredHikes.length > 1 ? 's' : ''} (Monde entier 🌍)`;
      } else if (radius >= 1000) {
        countEl.textContent = `${this.filteredHikes.length} randonnée${this.filteredHikes.length > 1 ? 's' : ''} à moins de ${radius.toLocaleString('fr-FR')} km`;
      } else {
        countEl.textContent = `${this.filteredHikes.length} randonnée${this.filteredHikes.length > 1 ? 's' : ''} à moins de ${radius} km`;
      }
    }

    const tableBadge = document.getElementById('table-filtered-badge');
    if (tableBadge) {
      if (this.searchQuery) {
        tableBadge.textContent = `${this.filteredHikes.length} résultat(s)`;
      } else {
        tableBadge.textContent = `${this.filteredHikes.length} rando(s)`;
      }
    }

    const manageCountBadge = document.getElementById('manage-total-count');
    if (manageCountBadge) {
      manageCountBadge.textContent = `${this.allHikes.length} randonnée(s)`;
    }
  }

  sortHikes() {
    this.filteredHikes.sort((a, b) => {
      let valA = a[this.sortColumn];
      let valB = b[this.sortColumn];

      if (typeof valA === 'string') valA = valA.toLowerCase();
      if (typeof valB === 'string') valB = valB.toLowerCase();

      if (valA < valB) return this.sortAsc ? -1 : 1;
      if (valA > valB) return this.sortAsc ? 1 : -1;
      return 0;
    });
  }

  setSort(column) {
    if (this.sortColumn === column) {
      this.sortAsc = !this.sortAsc;
    } else {
      this.sortColumn = column;
      this.sortAsc = true;
    }
    this.sortHikes();
    this.renderHikesTable();
  }

  renderHikesTable() {
    const tableBody = document.getElementById('hikes-table-body');
    if (!tableBody) return;

    tableBody.innerHTML = '';

    if (this.filteredHikes.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="6" class="p-8 text-center text-slate-400">
            <div class="text-3xl mb-2">🔍</div>
            <div class="font-medium text-slate-700">Aucune randonnée dans ce rayon (${window.MapManagerInstance ? window.MapManagerInstance.searchRadiusKm : 50} km)</div>
            <div class="text-xs text-slate-500 mt-1">👉 <strong>Augmentez le curseur de rayon</strong> (ex: 200 km) ou tapez une autre ville de départ pour les voir.</div>
          </td>
        </tr>
      `;
      return;
    }

    this.filteredHikes.forEach(hike => {
      const tr = document.createElement('tr');
      tr.dataset.hikeId = hike.id;
      tr.className = 'border-b border-slate-100 hover:bg-emerald-50/70 transition-colors cursor-pointer text-sm';
      if (this.selectedHike && this.selectedHike.id === hike.id) {
        tr.classList.add('bg-emerald-50', 'border-emerald-300', 'font-semibold');
      }

      tr.innerHTML = `
        <td class="p-3 font-semibold text-slate-900 whitespace-nowrap">
          <div class="flex items-center gap-1.5 text-blue-600">
            <span class="text-xs">📍</span>
            <span>${hike.distFromOrigin} km</span>
          </div>
        </td>
        <td class="p-3">
          <div class="font-bold text-slate-800 hover:text-emerald-700 cursor-pointer group flex items-center gap-1.5 transition-colors" title="Cliquer pour afficher cette randonnée sur la carte">
            <span class="hover:underline">${hike.name}</span>
            <span class="text-xs text-emerald-600 opacity-60 group-hover:opacity-100 group-hover:scale-125 transition-all">🗺️</span>
          </div>
          ${hike.notes ? `<div class="text-xs text-slate-500 line-clamp-1 max-w-xs mt-0.5">${hike.notes}</div>` : ''}
        </td>
        <td class="p-3 text-slate-700 whitespace-nowrap">
          <span class="font-semibold">${hike.distanceKm} km</span>
        </td>
        <td class="p-3 whitespace-nowrap">
          <span class="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-emerald-100 text-emerald-800">
            +${hike.elevationGain} m
          </span>
        </td>
        <td class="p-3 text-slate-600 whitespace-nowrap text-xs">
          ${hike.minElevation}m - ${hike.maxElevation}m
        </td>
        <td class="p-3 text-right whitespace-nowrap">
          <div class="flex items-center justify-end gap-1">
            ${(typeof AuthManager !== 'undefined' && !AuthManager.hasPermission('can_edit')) ? '' : `
              <button class="btn-table-edit p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition" title="Modifier le nom et les notes">
                ✏️
              </button>
              <button class="btn-table-delete p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition" title="Supprimer cette randonnée">
                🗑️
              </button>
            `}
            <button class="btn-download-hike px-2.5 py-1 text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-md shadow-sm transition flex items-center gap-1 ml-1" title="Télécharger GPX / Fiche PDF">
              <span>📥</span>
              <span class="hidden sm:inline">Télécharger</span>
            </button>
          </div>
        </td>
      `;

      tr.addEventListener('mouseenter', () => {
        if (!this.selectedHike || this.selectedHike.id !== hike.id) {
          if (window.MapManagerInstance) window.MapManagerInstance.displayTrack(hike, false);
          this.showHikePreviewPanel(hike);
        }
      });

      tr.addEventListener('mouseleave', () => {
        if (this.selectedHike) {
          if (window.MapManagerInstance) window.MapManagerInstance.displayTrack(this.selectedHike, true);
          this.showHikePreviewPanel(this.selectedHike);
        } else {
          if (window.MapManagerInstance) window.MapManagerInstance.clearTrack();
          this.hideHikePreviewPanel();
        }
      });

      tr.addEventListener('click', (e) => {
        if (!e.target.closest('button')) {
          this.showHikeOnMap(hike);
        }
      });

      // Edit button click
      const editBtn = tr.querySelector('.btn-table-edit');
      if (editBtn) {
        editBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.openEditModal(hike);
        });
      }

      // Delete button click
      const deleteBtn = tr.querySelector('.btn-table-delete');
      if (deleteBtn) {
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.openDeleteModal(hike);
        });
      }

      // Download button click
      const dlBtn = tr.querySelector('.btn-download-hike');
      if (dlBtn) {
        dlBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          this.openDownloadModal(hike);
        });
      }

      tableBody.appendChild(tr);
    });
  }

  showHikeOnMap(hike) {
    if (!hike) return;

    // 1. Si on est en mode tableau seul, basculer vers le mode split pour afficher la carte
    const wasTableMode = (this.currentViewMode === 'table');
    if (wasTableMode) {
      this.setViewMode('split');
    }

    // 2. Si on est sur un autre onglet (ex: Gérer les randos), revenir sur l'explorateur
    if (this.currentTab !== 'explorer') {
      this.switchTab('explorer');
    }

    // 3. Adapter le curseur de rayon si la randonnée est au-delà du rayon actuel
    const origin = (window.MapManagerInstance && window.MapManagerInstance.searchOrigin) 
      ? window.MapManagerInstance.searchOrigin 
      : { lat: 43.1189, lon: 5.8033 };

    if (hike.startPoint) {
      const dist = GPXParser.haversineDistance(origin.lat, origin.lon, hike.startPoint.lat, hike.startPoint.lon);
      const currentRadius = window.MapManagerInstance ? window.MapManagerInstance.searchRadiusKm : 50;
      if (dist > currentRadius) {
        const stepIdx = this.getStepIndexForKm(dist);
        this.setRadiusStep(stepIdx, false);
      }
    }

    // 4. Délai si le conteneur de carte était masqué pour s'assurer que Leaflet a ses dimensions réelles
    const delay = wasTableMode ? 100 : 0;
    setTimeout(() => {
      if (window.MapManagerInstance && window.MapManagerInstance.map) {
        window.MapManagerInstance.map.invalidateSize();
      }
      this.handleHikeSelect(hike);

      // Sur mobile, faire défiler vers la carte
      const mapCol = document.getElementById('map-column');
      if (mapCol && window.innerWidth < 1024) {
        mapCol.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, delay);
  }

  /**
   * Render Management Tab View
   */
  renderManagementList() {
    const listContainer = document.getElementById('manage-hikes-list');
    if (!listContainer) return;

    listContainer.innerHTML = '';

    const query = this.manageSearchQuery || '';
    const filtered = (this.allHikes || []).filter(h => 
      !query || h.name.toLowerCase().includes(query) || (h.notes && h.notes.toLowerCase().includes(query))
    );

    const countBadge = document.getElementById('manage-total-count');
    if (countBadge) {
      if (query) {
        countBadge.textContent = `${filtered.length} sur ${this.allHikes.length} randonnée(s)`;
      } else {
        countBadge.textContent = `${this.allHikes.length} randonnée(s)`;
      }
    }

    if (filtered.length === 0) {
      listContainer.innerHTML = `
        <div class="p-12 text-center bg-white border border-slate-200 rounded-2xl text-slate-400">
          <div class="text-3xl mb-2">📁</div>
          <div class="font-bold text-slate-700">Aucune randonnée trouvée</div>
          <div class="text-xs text-slate-500 mt-1">Votre bibliothèque est vide ou aucun élément ne correspond à votre recherche.</div>
        </div>
      `;
      return;
    }

    const canEdit = (typeof AuthManager === 'undefined' || AuthManager.hasPermission('can_edit'));

    filtered.forEach((hike, idx) => {
      const card = document.createElement('div');
      card.className = 'bg-white border border-slate-200 hover:border-emerald-300 rounded-2xl p-4 shadow-sm transition flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3';

      card.innerHTML = `
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="text-xs font-bold text-slate-400">#${idx + 1}</span>
            <h4 class="text-sm sm:text-base font-bold text-slate-900 truncate">${hike.name}</h4>
          </div>
          <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 mt-1">
            <span class="font-medium text-emerald-700">📏 ${hike.distanceKm} km</span>
            <span class="font-medium text-emerald-700">↗️ +${hike.elevationGain}m</span>
            <span>⛰️ ${hike.minElevation}m - ${hike.maxElevation}m</span>
            <span>⏱️ ${hike.estimatedDuration || '3h30'}</span>
            ${hike.ajoutee_par ? `<span class="text-slate-500 font-medium">👤 Par : <strong class="text-slate-700">${hike.ajoutee_par}</strong></span>` : ''}
          </div>
          ${hike.notes ? `<div class="text-xs text-slate-600 line-clamp-2 mt-2 bg-slate-50 p-2 rounded-lg border border-slate-100 italic">« ${hike.notes} »</div>` : ''}
        </div>

        <div class="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto justify-end pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
          <button class="btn-manage-view px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition flex items-center gap-1" title="Voir sur la carte">
            <span>🗺️</span> <span>Voir</span>
          </button>
          ${canEdit ? `
            <button class="btn-manage-edit px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold transition flex items-center gap-1" title="Modifier nom et notes">
              <span>✏️</span> <span>Modifier</span>
            </button>
            <button class="btn-manage-delete px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs font-bold transition flex items-center gap-1" title="Supprimer">
              <span>🗑️</span> <span>Supprimer</span>
            </button>
          ` : ''}
        </div>
      `;

      card.querySelector('.btn-manage-view').onclick = () => {
        this.showHikeOnMap(hike);
      };

      const editBtn = card.querySelector('.btn-manage-edit');
      if (editBtn) {
        editBtn.onclick = () => this.openEditModal(hike);
      }

      const delBtn = card.querySelector('.btn-manage-delete');
      if (delBtn) {
        delBtn.onclick = () => this.openDeleteModal(hike);
      }

      listContainer.appendChild(card);
    });
  }

  // =========================================================================
  // EDIT MODAL (✏️ Crayon)
  // =========================================================================
  openEditModal(hike) {
    if (typeof AuthManager !== 'undefined' && !AuthManager.hasPermission('can_edit')) {
      this.showToast("Accès restreint : Vous n'avez pas l'autorisation de modifier des randonnées.", "error");
      return;
    }
    this.hikeToEdit = hike;
    const modal = document.getElementById('edit-hike-modal');
    if (!modal) return;

    document.getElementById('edit-hike-name').value = hike.name || '';
    document.getElementById('edit-hike-notes').value = hike.notes || '';
    modal.classList.remove('hidden');
  }

  closeEditModal() {
    const modal = document.getElementById('edit-hike-modal');
    if (modal) modal.classList.add('hidden');
    this.hikeToEdit = null;
  }

  async saveEditModal() {
    if (!this.hikeToEdit) return;

    const newName = document.getElementById('edit-hike-name').value.trim();
    const newNotes = document.getElementById('edit-hike-notes').value.trim();

    if (!newName) {
      this.showToast("Le nom de la randonnée ne peut pas être vide.", "error");
      return;
    }

    this.hikeToEdit.name = newName;
    this.hikeToEdit.notes = newNotes;

    const updatedGpx = GPXParser.exportToGpxString(this.hikeToEdit);
    await StorageManager.saveHike(this.hikeToEdit, updatedGpx);

    // Auto-update Supabase Cloud in background
    try {
      const cfg = (typeof window.APP_CONFIG !== 'undefined') ? window.APP_CONFIG : {};
      const supaUrl = localStorage.getItem('sanary_supabase_url') || cfg.supabaseUrl;
      const supaKey = localStorage.getItem('sanary_supabase_key') || cfg.supabaseKey;
      if (supaUrl && supaKey) {
        StorageManager.pushHikeToSupabase(this.hikeToEdit, supaUrl, supaKey).catch(e => console.warn("Supabase auto-edit error:", e));
      }
    } catch (e) {}

    this.closeEditModal();
    this.applyFiltersAndRender();
    this.renderManagementList();

    if (this.selectedHike && this.selectedHike.id === this.hikeToEdit.id) {
      this.showHikePreviewPanel(this.hikeToEdit);
    }

    this.showToast("Randonnée modifiée avec succès !", "success");
  }

  // =========================================================================
  // DELETE MODAL (🗑️ Corbeille avec confirmation)
  // =========================================================================
  openDeleteModal(hike) {
    if (typeof AuthManager !== 'undefined' && !AuthManager.hasPermission('can_edit')) {
      this.showToast("Accès restreint : Vous n'avez pas l'autorisation de supprimer des randonnées.", "error");
      return;
    }
    this.hikeToDelete = hike;
    const modal = document.getElementById('delete-hike-modal');
    if (!modal) return;

    const nameEl = document.getElementById('delete-modal-hike-name');
    if (nameEl) nameEl.textContent = hike.name || 'cette randonnée';
    modal.classList.remove('hidden');
  }

  closeDeleteModal() {
    const modal = document.getElementById('delete-hike-modal');
    if (modal) modal.classList.add('hidden');
    this.hikeToDelete = null;
  }

  async confirmDeleteModal() {
    if (!this.hikeToDelete) {
      this.closeDeleteModal();
      return;
    }

    const targetHike = this.hikeToDelete;
    const targetId = targetHike.id;
    const targetName = targetHike.name;
    const targetFilename = targetHike.filename;

    try {
      await StorageManager.deleteHike(targetId, targetFilename);
      this.allHikes = this.allHikes.filter(h => h.id !== targetId && h.name !== targetName);

      // Auto-delete from Supabase Cloud in background
      try {
        const cfg = (typeof window.APP_CONFIG !== 'undefined') ? window.APP_CONFIG : {};
        const supaUrl = localStorage.getItem('sanary_supabase_url') || cfg.supabaseUrl;
        const supaKey = localStorage.getItem('sanary_supabase_key') || cfg.supabaseKey;
        if (supaUrl && supaKey) {
          StorageManager.deleteFromSupabase(targetId, supaUrl, supaKey).catch(e => console.warn("Supabase auto-delete error:", e));
        }
      } catch (e) {}

      if (this.selectedHike && (this.selectedHike.id === targetId || this.selectedHike.name === targetName)) {
        this.deselectHike();
      }

      this.showToast(`Randonnée « ${targetName} » supprimée définitivement.`, "info");
    } catch (err) {
      console.error("Erreur suppression:", err);
      this.allHikes = this.allHikes.filter(h => h.id !== targetId && h.name !== targetName);
      this.showToast("Randonnée supprimée.", "info");
    } finally {
      this.closeDeleteModal();
      this.applyFiltersAndRender();
      this.renderManagementList();
    }
  }

  // =========================================================================
  // RESTITUTION & PREVIEWS
  // =========================================================================
  handleHikeHover(hike) {
    if (hike) {
      this.showHikePreviewPanel(hike);
    } else if (this.selectedHike) {
      this.showHikePreviewPanel(this.selectedHike);
    } else {
      this.hideHikePreviewPanel();
    }
  }

  handleHikeSelect(hike) {
    if (!hike) return;
    this.selectedHike = hike;
    if (window.MapManagerInstance) {
      window.MapManagerInstance.selectHike(hike, true, false);
    }
    this.showHikePreviewPanel(hike);
    this.updateTableSelection(hike.id);
  }

  updateTableSelection(selectedId) {
    const rows = document.querySelectorAll('#hikes-table-body tr[data-hike-id]');
    rows.forEach(tr => {
      if (selectedId && tr.dataset.hikeId === selectedId) {
        tr.classList.add('bg-emerald-50', 'border-emerald-300', 'font-semibold');
      } else {
        tr.classList.remove('bg-emerald-50', 'border-emerald-300', 'font-semibold');
      }
    });
  }

  async showHikePreviewPanel(hike) {
    const previewPanel = document.getElementById('hike-preview-panel');
    if (!previewPanel || !hike) return;

    if ((!hike.points || hike.points.length === 0) && typeof StorageManager !== 'undefined') {
      await StorageManager.ensureHikeTrackLoaded(hike);
    }

    previewPanel.classList.remove('hidden');
    document.getElementById('preview-title').textContent = hike.name;
    document.getElementById('preview-dist').textContent = `${hike.distanceKm} km`;
    document.getElementById('preview-dplus').textContent = `+${hike.elevationGain}m`;
    document.getElementById('preview-dmoins').textContent = `-${hike.elevationLoss || 0}m`;
    document.getElementById('preview-alt').textContent = `${hike.minElevation}m / ${hike.maxElevation}m`;
    document.getElementById('preview-duration').textContent = hike.estimatedDuration || '3h30';
    document.getElementById('preview-notes').textContent = hike.notes || 'Aucune note enregistrée';

    const btnDl = document.getElementById('preview-btn-download');
    if (btnDl) {
      btnDl.onclick = () => this.openDownloadModal(hike);
    }

    if (this.elevationProfile) {
      this.elevationProfile.render(hike, 
        (point) => { if (window.MapManagerInstance) window.MapManagerInstance.setCursorPosition(point); },
        () => { if (window.MapManagerInstance) window.MapManagerInstance.clearCursorPosition(); }
      );
    }
  }

  hideHikePreviewPanel() {
    const previewPanel = document.getElementById('hike-preview-panel');
    if (previewPanel && !this.selectedHike) {
      previewPanel.classList.add('hidden');
    }
  }

  async fetchPlacesList(query) {
    // 1. Photon Komoot API (mondial, ultra-rapide, reconnaît les parcs, sommets, volcans et villes)
    try {
      const pUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=8`;
      const pRes = await fetch(pUrl);
      if (pRes.ok) {
        const pData = await pRes.json();
        if (pData && pData.features && pData.features.length > 0) {
          return pData.features.map(f => {
            const props = f.properties || {};
            const coords = f.geometry ? f.geometry.coordinates : [0, 0];
            const name = props.name || props.city || '';
            const details = [props.state, props.country].filter(Boolean).join(', ');
            const fullName = details ? `${name} (${details})` : name;
            return {
              lat: coords[1],
              lon: coords[0],
              shortName: name || fullName,
              displayName: fullName
            };
          }).filter(p => p.lat && p.lon);
        }
      }
    } catch (e) {}

    // 2. Nominatim fallback
    try {
      const nUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=8`;
      const nRes = await fetch(nUrl, { headers: { 'Accept-Language': 'fr' } });
      if (nRes.ok) {
        const nData = await nRes.json();
        if (nData && nData.length > 0) {
          return nData.map(p => ({
            lat: parseFloat(p.lat),
            lon: parseFloat(p.lon),
            shortName: (p.display_name || '').split(',')[0],
            displayName: p.display_name
          }));
        }
      }
    } catch (e) {}

    return [];
  }

  async searchPlaces(query) {
    const resultsContainer = document.getElementById('location-autocomplete-results');
    if (!resultsContainer) return;

    try {
      const places = await this.fetchPlacesList(query);
      resultsContainer.innerHTML = '';
      if (!places || places.length === 0) {
        resultsContainer.classList.add('hidden');
        return;
      }

      resultsContainer.classList.remove('hidden');
      places.forEach(place => {
        const item = document.createElement('div');
        item.className = 'p-2.5 hover:bg-emerald-50 cursor-pointer border-b border-slate-100 text-xs text-slate-700 flex items-center gap-2';
        item.innerHTML = `<span>📍</span> <span class="font-medium text-slate-800">${place.displayName}</span>`;
        item.addEventListener('click', () => {
          this.applySelectedPlace(place.lat, place.lon, place.shortName);
        });
        resultsContainer.appendChild(item);
      });
    } catch (e) {
      console.warn("Erreur recherche lieu :", e);
    }
  }

  applySelectedPlace(lat, lon, label) {
    const locationInput = document.getElementById('location-input');
    const resultsContainer = document.getElementById('location-autocomplete-results');
    if (locationInput) locationInput.value = label;
    if (resultsContainer) resultsContainer.classList.add('hidden');
    if (window.MapManagerInstance) {
      window.MapManagerInstance.setSearchOrigin(lat, lon, label);
    }
    this.applyFiltersAndRender();
  }

  async searchAndSelectFirstPlace(query) {
    const places = await this.fetchPlacesList(query);
    if (places && places.length > 0) {
      this.applySelectedPlace(places[0].lat, places[0].lon, places[0].shortName);
      this.showToast(`Point de référence défini : ${places[0].displayName}`, "success");
    } else {
      this.showToast(`Aucun lieu mondial trouvé pour "${query}"`, "error");
    }
  }

  useCurrentLocation() {
    if (!navigator.geolocation) {
      this.showToast("La géolocalisation n'est pas supportée par votre navigateur", "error");
      return;
    }

    this.showToast("Recherche de votre position GPS...", "info");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        const placeName = await GPXParser.reverseGeocode(lat, lon);
        document.getElementById('location-input').value = placeName || 'Ma position';
        if (window.MapManagerInstance) {
          window.MapManagerInstance.setSearchOrigin(lat, lon, placeName || 'Ma position');
        }
        this.applyFiltersAndRender();
        this.showToast(`Position trouvée : ${placeName || 'Ma position'}`, "success");
      },
      () => {
        this.showToast("Impossible d'accéder à votre position GPS.", "error");
      }
    );
  }

  handleOriginChange(origin) {
    const locInput = document.getElementById('location-input');
    if (locInput) locInput.value = origin.name;
    this.applyFiltersAndRender();
  }

  async handlePickFolder() {
    try {
      const res = await StorageManager.pickLocalDirectory();
      if (res && res.success) {
        this.allHikes = await StorageManager.getAllHikes();
        this.updateStorageBadge();
        this.applyFiltersAndRender();
        this.renderManagementList();
        this.showToast(`Dossier connecté : ${res.folderName} (${res.hikes.length} randonnées)`, "success");
      }
    } catch (err) {
      this.showToast(err.message, "error");
    }
  }

  updateStorageBadge() {
    const badge = document.getElementById('storage-badge');
    if (!badge) return;

    if (StorageManager.currentMode === 'filesystem' && StorageManager.dirHandle) {
      badge.innerHTML = `
        <span class="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse"></span>
        <span class="font-bold text-xs text-emerald-300">📁 Disque : ${StorageManager.dirHandle.name}</span>
      `;
      badge.className = "flex items-center gap-2 px-3 py-1.5 bg-emerald-950/80 border border-emerald-500/50 rounded-full text-emerald-300 text-xs cursor-pointer hover:brightness-125 transition shadow-sm";
      badge.title = "Dossier local connecté sur votre disque dur. Cliquez pour modifier ou gérer.";
    } else {
      badge.innerHTML = `
        <span class="w-2.5 h-2.5 rounded-full bg-blue-400"></span>
        <span class="font-semibold text-xs text-slate-200">💾 Stockage Interne</span>
      `;
      badge.className = "flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-full text-slate-300 text-xs cursor-pointer transition shadow-sm";
      badge.title = "Stockage sécurisé dans le navigateur. Cliquez pour choisir un dossier sur votre disque dur.";
    }
  }

  /**
   * Helper to read file as text with encoding fallbacks (UTF-8, ISO-8859-1, Windows-1252)
   */
  async readFileAsText(file) {
    let text = '';
    try {
      text = await file.text();
    } catch (e) {
      text = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = (err) => reject(err);
        reader.readAsText(file, 'utf-8');
      });
    }

    // If text contains ISO-8859-1/Windows-1252 declaration or replacement characters, re-read with iso-8859-1
    if (text && (
      text.includes('encoding="ISO-8859-1"') || 
      text.includes('encoding="windows-1252"') || 
      text.includes('encoding="iso-8859-1"') ||
      text.includes('encoding="latin1"') ||
      text.includes('\uFFFD')
    )) {
      try {
        const isoText = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = (err) => reject(err);
          reader.readAsText(file, 'iso-8859-1');
        });
        if (isoText && !isoText.includes('\uFFFD')) {
          return isoText;
        }
      } catch (e) {}
    }

    return text;
  }

  /**
   * Handle Multi-file Upload (Instant Parse + Auto-Save + Auto-Radius Expansion)
   */
  async handleFilesUploaded(files) {
    if (typeof AuthManager !== 'undefined' && !AuthManager.hasPermission('can_upload')) {
      this.showToast("Accès restreint : Vous n'avez pas l'autorisation de charger des randonnées.", "error");
      return;
    }

    const fileList = Array.from(files);
    if (fileList.length === 0) return;

    this.showToast(`Analyse de ${fileList.length} fichier(s)...`, "info");

    const origin = (window.MapManagerInstance && window.MapManagerInstance.searchOrigin) 
      ? window.MapManagerInstance.searchOrigin 
      : { lat: 43.1189, lon: 5.8033 };

    let maxDistFound = 0;
    const newHikes = [];
    const errors = [];

    for (const file of fileList) {
      try {
        const text = await this.readFileAsText(file);
        const hike = GPXParser.parse(text, file.name);
        const proposedName = await GPXParser.generateProposedName(hike);
        hike.name = proposedName;
        hike.proposedName = proposedName;
        hike.ajoutee_par = (typeof AuthManager !== 'undefined' && AuthManager.getCurrentUser()) ? AuthManager.getCurrentUser().username : 'admin';

        // Auto-save immediately to persistent storage
        await StorageManager.saveHike(hike, text);

        // Auto-push to Supabase Cloud in background if configured
        try {
          const cfg = (typeof window.APP_CONFIG !== 'undefined') ? window.APP_CONFIG : {};
          const supaUrl = localStorage.getItem('sanary_supabase_url') || cfg.supabaseUrl;
          const supaKey = localStorage.getItem('sanary_supabase_key') || cfg.supabaseKey;
          if (supaUrl && supaKey) {
            StorageManager.pushHikeToSupabase(hike, supaUrl, supaKey).catch(e => console.warn("Supabase auto-upload error:", e));
          }
        } catch (e) {}

        // Add to main collection
        const existingIdx = this.allHikes.findIndex(h => h.id === hike.id || (h.name && h.name === hike.name));
        if (existingIdx >= 0) {
          this.allHikes[existingIdx] = hike;
        } else {
          this.allHikes.unshift(hike);
        }

        if (hike.startPoint) {
          const dist = GPXParser.haversineDistance(origin.lat, origin.lon, hike.startPoint.lat, hike.startPoint.lon);
          if (dist > maxDistFound) maxDistFound = dist;
        }

        newHikes.push(hike);
      } catch (err) {
        console.error(`Erreur lecture ${file.name} :`, err);
        errors.push(`${file.name}: ${err.message}`);
      }
    }

    if (newHikes.length === 0) {
      const errorDetail = errors.length > 0 ? errors.join("\n") : "Format de fichier non reconnu.";
      this.showToast(`Échec du chargement : ${errorDetail}`, "error");
      return;
    }

    // Auto expand radius if newly added hikes are outside current radius
    const currentRadius = window.MapManagerInstance ? window.MapManagerInstance.searchRadiusKm : 50;
    if (maxDistFound > currentRadius) {
      const stepIdx = this.getStepIndexForKm(maxDistFound);
      this.setRadiusStep(stepIdx, true);
    }

    // Automatically switch to Explorer view and select the first new hike!
    this.switchTab('explorer');
    this.applyFiltersAndRender();
    this.renderManagementList();

    if (newHikes.length > 0) {
      this.handleHikeSelect(newHikes[0]);
    }

    this.showToast(`🎉 ${newHikes.length} randonnée(s) ajoutée(s) avec succès !`, "success");
  }

  /**
   * Handle Direct GPX Text Paste
   */
  async handlePasteGPX() {
    if (typeof AuthManager !== 'undefined' && !AuthManager.hasPermission('can_upload')) {
      this.showToast("Accès restreint : Vous n'avez pas l'autorisation de charger des randonnées.", "error");
      return;
    }

    const textarea = document.getElementById('paste-gpx-text');
    const nameInput = document.getElementById('paste-gpx-name');
    if (!textarea) return;

    const rawText = textarea.value.trim();
    if (!rawText) {
      this.showToast("Veuillez d'abord coller le texte de votre trace GPX.", "error");
      return;
    }

    const customName = nameInput ? nameInput.value.trim() : '';

    try {
      this.showToast("Analyse de la trace collée...", "info");
      const hike = GPXParser.parse(rawText, customName ? customName + '.gpx' : 'Randonnee_Collee.gpx');
      if (customName) {
        hike.name = customName;
      } else {
        const proposedName = await GPXParser.generateProposedName(hike);
        hike.name = proposedName;
        hike.proposedName = proposedName;
      }

      hike.ajoutee_par = (typeof AuthManager !== 'undefined' && AuthManager.getCurrentUser()) ? AuthManager.getCurrentUser().username : 'admin';

      await StorageManager.saveHike(hike, rawText);

      const existingIdx = this.allHikes.findIndex(h => h.id === hike.id || (h.name && h.name === hike.name));
      if (existingIdx >= 0) {
        this.allHikes[existingIdx] = hike;
      } else {
        this.allHikes.unshift(hike);
      }

      // Clear input
      textarea.value = '';
      if (nameInput) nameInput.value = '';

      // Auto expand radius if needed
      const origin = (window.MapManagerInstance && window.MapManagerInstance.searchOrigin) 
        ? window.MapManagerInstance.searchOrigin 
        : { lat: 43.1189, lon: 5.8033 };

      if (hike.startPoint) {
        const dist = GPXParser.haversineDistance(origin.lat, origin.lon, hike.startPoint.lat, hike.startPoint.lon);
        const currentRadius = window.MapManagerInstance ? window.MapManagerInstance.searchRadiusKm : 50;
        if (dist > currentRadius) {
          const stepIdx = this.getStepIndexForKm(dist);
          this.setRadiusStep(stepIdx, true);
        }
      }

      this.switchTab('explorer');
      this.applyFiltersAndRender();
      this.renderManagementList();
      this.handleHikeSelect(hike);

      this.showToast(`🎉 Randonnée « ${hike.name} » ajoutée avec succès !`, "success");
    } catch (err) {
      console.error("Erreur paste GPX :", err);
      this.showToast(`Erreur d'analyse : ${err.message}`, "error");
    }
  }

  // =========================================================================
  // DOWNLOAD MODAL (GPX + PDF)
  // =========================================================================
  openDownloadModal(hike) {
    this.selectedHike = hike;
    const modal = document.getElementById('download-modal');
    if (!modal) return;

    document.getElementById('modal-hike-title').textContent = hike.name;
    document.getElementById('modal-hike-info').textContent = `${hike.distanceKm} km • D+ ${hike.elevationGain}m`;
    modal.classList.remove('hidden');
  }

  closeDownloadModal() {
    const modal = document.getElementById('download-modal');
    if (modal) modal.classList.add('hidden');
  }

  async executeDownload() {
    if (!this.selectedHike) return;

    const dlGpx = document.getElementById('opt-download-gpx').checked;
    const dlPdf = document.getElementById('opt-download-pdf').checked;
    const incMap = document.getElementById('opt-pdf-map').checked;
    const incProfile = document.getElementById('opt-pdf-profile').checked;
    const incNotes = document.getElementById('opt-pdf-notes').checked;

    this.closeDownloadModal();

    if (dlGpx) {
      const gpxContent = GPXParser.exportToGpxString(this.selectedHike);
      const blob = new Blob([gpxContent], { type: 'application/gpx+xml;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = (this.selectedHike.name || 'randonnee').replace(/[\\/:*?"<>|]/g, '_') + '.gpx';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      this.showToast("Fichier GPX téléchargé !", "success");
    }

    if (dlPdf) {
      this.showToast("Génération de la Fiche Randonnée PDF...", "info");
      try {
        await PDFExporter.exportFichePDF(this.selectedHike, {
          includeMap: incMap,
          includeProfile: incProfile,
          includeNotes: incNotes
        });
        this.showToast("Fiche Randonnée PDF téléchargée !", "success");
      } catch (err) {
        console.error("Erreur PDF :", err);
        this.showToast("Erreur lors de la génération du PDF", "error");
      }
    }
  }

  async syncFromServer(url, isSilent = false) {
    const syncBtn = document.getElementById('btn-sync-server');
    if (syncBtn) {
      syncBtn.disabled = true;
      syncBtn.innerHTML = `<span>⏳</span> Synchronisation...`;
    }

    try {
      const count = await StorageManager.syncWithRemoteServer(url);
      this.allHikes = await StorageManager.getAllHikes();
      this.applyFiltersAndRender();
      this.renderManagementList();
      this.showToast(`🎉 ${count} randonnée(s) synchronisée(s) avec succès depuis le serveur !`, "success");
    } catch (err) {
      console.error("Erreur synchronisation serveur :", err);
      if (!isSilent) {
        this.showToast(`Erreur serveur : ${err.message}`, "error");
      }
    } finally {
      if (syncBtn) {
        syncBtn.disabled = false;
        syncBtn.innerHTML = `<span>🔄</span> Synchroniser`;
      }
    }
  }

  // =========================================================================
  // SUPABASE CLOUD SYNC & PUSH METHODS
  // =========================================================================
  updateSupabaseBadge() {
    const badge = document.getElementById('supabase-status-badge');
    if (!badge) return;

    const url = localStorage.getItem('sanary_supabase_url');
    const key = localStorage.getItem('sanary_supabase_key');

    if (url && key) {
      badge.textContent = '🟢 Prêt / Configuré';
      badge.className = 'text-[11px] px-2.5 py-0.5 rounded-full font-bold bg-emerald-100 text-emerald-800 border border-emerald-300';
    } else {
      badge.textContent = 'Non configuré';
      badge.className = 'text-[11px] px-2 py-0.5 rounded-full font-bold bg-slate-100 text-slate-600';
    }
  }

  async testSupabaseConnection() {
    const url = (document.getElementById('supabase-url')?.value || '').trim();
    const key = (document.getElementById('supabase-key')?.value || '').trim();

    if (!url || !key) {
      this.showToast("Veuillez saisir votre Project URL et votre Clé Anon Supabase.", "error");
      return;
    }

    this.showToast("Test de connexion à Supabase en cours...", "info");
    try {
      const count = await StorageManager.fetchFromSupabase(url, key);
      this.showToast(`✅ Connexion réussie à Supabase ! (${count} randonnée(s) trouvée(s) dans la base)`, "success");
      this.updateSupabaseBadge();
    } catch (err) {
      this.showToast(`❌ Erreur connexion Supabase : ${err.message}`, "error");
    }
  }

  async syncFromSupabase(isSilent = false) {
    const url = (document.getElementById('supabase-url')?.value || localStorage.getItem('sanary_supabase_url') || '').trim();
    const key = (document.getElementById('supabase-key')?.value || localStorage.getItem('sanary_supabase_key') || '').trim();

    if (!url || !key) {
      if (!isSilent) this.showToast("Veuillez configurer l'URL et la clé Supabase dans les Options.", "error");
      return;
    }

    const syncBtn = document.getElementById('btn-sync-supabase');
    if (syncBtn) {
      syncBtn.disabled = true;
      syncBtn.innerHTML = `<span>⏳</span> Connexion Supabase...`;
    }

    try {
      const count = await StorageManager.fetchFromSupabase(url, key);
      this.allHikes = await StorageManager.getAllHikes();
      this.applyFiltersAndRender();
      this.renderManagementList();
      this.updateSupabaseBadge();
      this.showToast(`⚡ ${count} randonnée(s) synchronisée(s) depuis Supabase Cloud !`, "success");
    } catch (err) {
      console.error("Erreur Supabase sync:", err);
      if (!isSilent) {
        this.showToast(`Erreur Supabase : ${err.message}`, "error");
      }
    } finally {
      if (syncBtn) {
        syncBtn.disabled = false;
        syncBtn.innerHTML = `<span>🔄</span> Synchroniser depuis Supabase`;
      }
    }
  }

  async pushAllToSupabase() {
    const url = (document.getElementById('supabase-url')?.value || localStorage.getItem('sanary_supabase_url') || '').trim();
    const key = (document.getElementById('supabase-key')?.value || localStorage.getItem('sanary_supabase_key') || '').trim();

    if (!url || !key) {
      this.showToast("Veuillez d'abord renseigner l'URL et la clé Anon Supabase.", "error");
      return;
    }

    const pushBtn = document.getElementById('btn-push-supabase');
    if (pushBtn) {
      pushBtn.disabled = true;
      pushBtn.innerHTML = `<span>⏳</span> Envoi en cours...`;
    }

    try {
      this.showToast("Envoi des randonnées et fichiers GPX vers Supabase...", "info");
      const result = await StorageManager.pushAllLocalHikesToSupabase(url, key, (current, total, name) => {
        this.showToast(`Transfert vers Supabase : ${current}/${total} (${name})...`, "info");
      });

      this.showToast(`🚀 ${result.success}/${result.total} randonnée(s) sauvegardée(s) sur Supabase Cloud !`, "success");
      this.updateSupabaseBadge();
    } catch (err) {
      console.error("Erreur push Supabase:", err);
      this.showToast(`Erreur d'envoi vers Supabase : ${err.message}`, "error");
    } finally {
      if (pushBtn) {
        pushBtn.disabled = false;
        pushBtn.innerHTML = `<span>🚀</span> Envoyer mes randos locales vers Supabase`;
      }
    }
  }

  showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    if (!toast) return;

    toast.textContent = message;
    toast.className = `fixed bottom-5 right-5 z-[150] pointer-events-none px-4 py-3 rounded-xl shadow-xl text-sm font-semibold transition-all transform duration-300 ${
      type === 'success' ? 'bg-emerald-600 text-white' :
      type === 'error' ? 'bg-rose-600 text-white' :
      'bg-slate-900 text-white'
    }`;

    toast.classList.remove('opacity-0', 'translate-y-4');
    setTimeout(() => {
      toast.classList.add('opacity-0', 'translate-y-4');
    }, 4000);
  }

  playLogoMarch() {
    const frame = document.getElementById('logo-frame');
    const overlay = document.getElementById('logo-anim-overlay');
    const staticLogo = document.getElementById('app-logo');
    const hikersWrapper = document.getElementById('logo-hikers-wrapper');

    if (!frame || !overlay || !staticLogo || !hikersWrapper) return;

    // Reset previous timers and allow immediate re-trigger
    clearTimeout(this._logoMarchTimer);
    clearTimeout(this._logoMarchEndTimer);
    this._isLogoMarching = true;

    // Force hard animation reset
    frame.classList.remove('logo-march-active');
    hikersWrapper.style.animation = 'none';
    void hikersWrapper.offsetWidth;
    hikersWrapper.style.animation = '';

    // Switch view: show animated overlay, hide static base logo
    overlay.style.opacity = '1';
    overlay.style.pointerEvents = 'none';
    staticLogo.style.opacity = '0';

    // Start marching
    frame.classList.add('logo-march-active');

    // When the 3 hikers exit the frame (after 4.5s)
    this._logoMarchTimer = setTimeout(() => {
      // Revenir au logo tel qu'il est (réapparition fluide du logo d'origine)
      staticLogo.style.opacity = '1';
      overlay.style.opacity = '0';

      this._logoMarchEndTimer = setTimeout(() => {
        frame.classList.remove('logo-march-active');
        this._isLogoMarching = false;
      }, 400);
    }, 4500);
  }

  // =========================================================================
  // AUTHENTIFICATION & GESTION DES UTILISATEURS (MODE B2 - JLD APPS 2026)
  // =========================================================================

  checkAuthenticationState() {
    const lockModal = document.getElementById('login-lock-modal');
    const authContainer = document.getElementById('auth-header-container');
    const isAuthed = typeof AuthManager !== 'undefined' && AuthManager.isAuthenticated();

    if (!isAuthed) {
      if (lockModal) lockModal.classList.remove('hidden');
      if (authContainer) authContainer.classList.add('opacity-0', 'pointer-events-none');
      this.tryAutofillFromGoogleCredentials();
      return false;
    } else {
      if (lockModal) lockModal.classList.add('hidden');
      if (authContainer) authContainer.classList.remove('opacity-0', 'pointer-events-none');
      this.updateAuthHeaderUI();
      this.applyPermissionGuards();
      return true;
    }
  }

  async tryAutofillFromGoogleCredentials() {
    if (typeof navigator !== 'undefined' && navigator.credentials && navigator.credentials.get) {
      try {
        const cred = await navigator.credentials.get({
          password: true,
          mediation: 'optional'
        });
        if (cred && cred.id) {
          const userInp = document.getElementById('login-username');
          const pwdInp = document.getElementById('login-password');
          if (userInp && !userInp.value) userInp.value = cred.id;
          if (pwdInp && cred.password && !pwdInp.value) pwdInp.value = cred.password;
        }
      } catch (e) {
        // Ignorer si l'utilisateur refuse ou si non disponible
      }
    }
  }

  updateAuthHeaderUI() {
    const user = typeof AuthManager !== 'undefined' ? AuthManager.getCurrentUser() : null;
    if (!user) return;

    const usernameDisplay = document.getElementById('header-username-display');
    const roleBadge = document.getElementById('header-role-badge');
    const dropdownUsername = document.getElementById('dropdown-username-info');
    const dropdownPerms = document.getElementById('dropdown-permissions-info');

    if (usernameDisplay) usernameDisplay.textContent = user.username;
    if (roleBadge) {
      if (user.role === 'admin') {
        roleBadge.textContent = 'Admin';
        roleBadge.className = 'px-1.5 py-0.5 bg-emerald-950 text-emerald-300 text-[10px] rounded font-semibold border border-emerald-800';
      } else {
        roleBadge.textContent = 'Membre';
        roleBadge.className = 'px-1.5 py-0.5 bg-slate-800 text-slate-300 text-[10px] rounded font-semibold border border-slate-700';
      }
    }

    if (dropdownUsername) {
      dropdownUsername.textContent = `Connecté : ${user.username} (${user.role === 'admin' ? 'Administrateur' : 'Membre'})`;
    }
    if (dropdownPerms) {
      const perms = [];
      if (user.role === 'admin' || user.can_upload) perms.push('📤 Upload');
      if (user.role === 'admin' || user.can_edit) perms.push('✏️ Édition');
      dropdownPerms.textContent = perms.length > 0 ? `Droits : ${perms.join(', ')}` : 'Droits : Consultation seule';
    }
  }

  applyPermissionGuards() {
    const canUpload = typeof AuthManager !== 'undefined' && AuthManager.hasPermission('can_upload');
    const isAdmin = typeof AuthManager !== 'undefined' && AuthManager.isAdmin();

    // 1. Onglet Charger
    const uploadTabBtn = document.querySelector('[data-tab="upload"]');
    if (uploadTabBtn) {
      if (!canUpload) {
        uploadTabBtn.classList.add('opacity-40', 'cursor-not-allowed');
        uploadTabBtn.title = "Chargement désactivé (Permissions restreintes)";
      } else {
        uploadTabBtn.classList.remove('opacity-40', 'cursor-not-allowed');
        uploadTabBtn.title = "";
      }
    }

    // 2. Boutons Admin dans le menu déroulant et modal post-login
    const adminMenuBtn = document.getElementById('btn-menu-admin-users');
    if (adminMenuBtn) {
      adminMenuBtn.classList.toggle('hidden', !isAdmin);
    }
    const postLoginAdminBtn = document.getElementById('btn-post-login-manage-users');
    if (postLoginAdminBtn) {
      postLoginAdminBtn.classList.toggle('hidden', !isAdmin);
    }

    // 3. Dropzone
    const dropzone = document.getElementById('upload-dropzone');
    if (dropzone) {
      if (!canUpload) {
        dropzone.classList.add('pointer-events-none', 'opacity-50');
      } else {
        dropzone.classList.remove('pointer-events-none', 'opacity-50');
      }
    }
  }

  toggleUserDropdown() {
    const dd = document.getElementById('user-menu-dropdown');
    if (dd) dd.classList.toggle('hidden');
  }

  closeUserDropdown() {
    const dd = document.getElementById('user-menu-dropdown');
    if (dd) dd.classList.add('hidden');
  }

  togglePasswordVisibility(inputId, btnEl) {
    const input = document.getElementById(inputId);
    if (!input) return;

    if (input.type === 'password') {
      input.type = 'text';
      if (btnEl) btnEl.textContent = '🙈';
    } else {
      input.type = 'password';
      if (btnEl) btnEl.textContent = '👁️';
    }
  }

  updatePasswordCriteriaCheck(inputId, criteriaContainerId) {
    const input = document.getElementById(inputId);
    const container = document.getElementById(criteriaContainerId);
    if (!input || !container || typeof AuthManager === 'undefined') return;

    const val = input.value;
    const res = AuthManager.validatePassword(val);

    const updateEl = (rule, isValid) => {
      const el = container.querySelector(`[data-rule="${rule}"]`);
      if (el) {
        if (isValid) {
          el.classList.remove('invalid');
          el.classList.add('valid');
        } else {
          el.classList.remove('valid');
          el.classList.add('invalid');
        }
      }
    };

    updateEl('length', res.lengthOk);
    updateEl('uppercase', res.uppercaseOk);
    updateEl('lowercase', res.lowercaseOk);
    updateEl('number', res.numberOk);
    updateEl('special', res.specialOk);
  }

  async handleLoginSubmit() {
    const userInput = document.getElementById('login-username');
    const pwdInput = document.getElementById('login-password');
    const errBox = document.getElementById('login-error-msg');
    const errText = document.getElementById('login-error-text');

    if (!userInput || !pwdInput) return;

    const username = userInput.value;
    const password = pwdInput.value;

    if (errBox) errBox.classList.add('hidden');

    const result = await AuthManager.login(username, password);
    if (!result.success) {
      if (errBox && errText) {
        errText.textContent = result.error || "Identifiant ou mot de passe incorrect.";
        errBox.classList.remove('hidden');
      }
      return;
    }

    // Enregistrement auprès du gestionnaire de mots de passe Google / Navigateur
    if (typeof window !== 'undefined' && window.PasswordCredential && navigator.credentials && navigator.credentials.store) {
      try {
        const formEl = document.getElementById('form-login');
        const cred = formEl ? new PasswordCredential(formEl) : new PasswordCredential({
          id: username,
          password: password,
          name: username
        });
        if (cred) {
          navigator.credentials.store(cred).catch(e => console.info("Info stockage mot de passe :", e));
        }
      } catch (e) {
        console.info("Info Credential Management API :", e);
      }
    }

    // Succès de connexion
    this.checkAuthenticationState();
    this.openPostLoginModal(result);
    this.showToast(`Bienvenue ${result.user.username} !`, "success");

    // Nettoyage temporisé pour laisser à Google Password Manager le temps d'enregistrer les identifiants
    setTimeout(() => {
      if (pwdInput) pwdInput.value = '';
    }, 2000);
  }

  openPostLoginModal(loginResult) {
    const modal = document.getElementById('post-login-modal');
    if (!modal) return;

    const user = (loginResult && loginResult.user) || (typeof AuthManager !== 'undefined' ? AuthManager.getCurrentUser() : null);
    if (!user) return;

    const userSpan = document.getElementById('post-login-username');
    if (userSpan) userSpan.textContent = user.username;

    const roleSpan = document.getElementById('post-login-role');
    if (roleSpan) {
      if (user.role === 'admin') {
        roleSpan.textContent = 'Administrateur (Tous pouvoirs)';
        roleSpan.className = 'px-2 py-0.5 rounded-full font-bold text-[11px] bg-emerald-100 text-emerald-800 border border-emerald-300';
      } else {
        roleSpan.textContent = 'Membre du club';
        roleSpan.className = 'px-2 py-0.5 rounded-full font-bold text-[11px] bg-slate-100 text-slate-700 border border-slate-300';
      }
    }

    const uploadSpan = document.getElementById('post-login-upload-right');
    if (uploadSpan) {
      const allowed = user.role === 'admin' || user.can_upload;
      uploadSpan.textContent = allowed ? '✅ Autorisé' : '❌ Non autorisé';
      uploadSpan.className = allowed ? 'font-bold text-emerald-700' : 'font-bold text-slate-400';
    }

    const editSpan = document.getElementById('post-login-edit-right');
    if (editSpan) {
      const allowed = user.role === 'admin' || user.can_edit;
      editSpan.textContent = allowed ? '✅ Autorisé' : '❌ Non autorisé';
      editSpan.className = allowed ? 'font-bold text-emerald-700' : 'font-bold text-slate-400';
    }

    // Avertissement mot de passe admin d'origine
    const adminWarn = document.getElementById('post-login-admin-warning');
    if (adminWarn) {
      adminWarn.classList.toggle('hidden', !(loginResult && loginResult.isInitialAdminPassword));
    }

    // Bouton de gestion des utilisateurs (Admin uniquement)
    const adminManageBtn = document.getElementById('btn-post-login-manage-users');
    if (adminManageBtn) {
      adminManageBtn.classList.toggle('hidden', user.role !== 'admin');
    }

    modal.classList.remove('hidden');
  }

  closePostLoginModal() {
    const modal = document.getElementById('post-login-modal');
    if (modal) modal.classList.add('hidden');
  }

  handleLogout() {
    if (typeof AuthManager !== 'undefined') {
      AuthManager.logout();
    }
    this.closePostLoginModal();
    this.closeChangePasswordModal();
    this.closeUserManagementModal();
    this.checkAuthenticationState();
    this.showToast("Vous avez été déconnecté.", "info");
  }

  openChangePasswordModal() {
    const modal = document.getElementById('change-password-modal');
    if (!modal) return;

    const user = typeof AuthManager !== 'undefined' ? AuthManager.getCurrentUser() : null;
    const nameEl = document.getElementById('change-pwd-account-name');
    if (nameEl && user) nameEl.textContent = user.username;

    // Renseigner l'identifiant pour Google Password Manager
    const hiddenUser = document.getElementById('change-pwd-username');
    if (hiddenUser && user) hiddenUser.value = user.username;

    // Réinitialiser les champs
    const curInput = document.getElementById('change-pwd-current');
    const newInput = document.getElementById('change-pwd-new');
    const confInput = document.getElementById('change-pwd-confirm');
    const errBox = document.getElementById('change-pwd-error');

    if (curInput) curInput.value = '';
    if (newInput) newInput.value = '';
    if (confInput) confInput.value = '';
    if (errBox) errBox.classList.add('hidden');

    this.updatePasswordCriteriaCheck('change-pwd-new', 'change-pwd-criteria');
    modal.classList.remove('hidden');
  }

  closeChangePasswordModal() {
    const modal = document.getElementById('change-password-modal');
    if (modal) modal.classList.add('hidden');
  }

  async handleChangePasswordSubmit() {
    const curInput = document.getElementById('change-pwd-current');
    const newInput = document.getElementById('change-pwd-new');
    const confInput = document.getElementById('change-pwd-confirm');
    const errBox = document.getElementById('change-pwd-error');
    const errText = document.getElementById('change-pwd-error-text');

    const user = typeof AuthManager !== 'undefined' ? AuthManager.getCurrentUser() : null;
    if (!user) return;

    if (newInput.value !== confInput.value) {
      if (errBox && errText) {
        errText.textContent = "Les deux nouveaux mots de passe ne correspondent pas.";
        errBox.classList.remove('hidden');
      }
      return;
    }

    const res = await AuthManager.changePassword(user.username, curInput.value, newInput.value);
    if (!res.success) {
      if (errBox && errText) {
        errText.textContent = res.error;
        errBox.classList.remove('hidden');
      }
      return;
    }

    // Mise à jour auprès de Google Password Manager
    if (typeof window !== 'undefined' && window.PasswordCredential && navigator.credentials && navigator.credentials.store) {
      try {
        const formEl = document.getElementById('form-change-password');
        const cred = formEl ? new PasswordCredential(formEl) : new PasswordCredential({
          id: user.username,
          password: newInput.value,
          name: user.username
        });
        if (cred) {
          navigator.credentials.store(cred).catch(() => {});
        }
      } catch (e) {
        console.info("Info Credential Management API (update) :", e);
      }
    }

    this.closeChangePasswordModal();
    this.showToast("🎉 Mot de passe modifié avec succès !", "success");
  }

  openUserManagementModal() {
    if (typeof AuthManager === 'undefined' || !AuthManager.isAdmin()) {
      this.showToast("Accès réservé à l'administrateur.", "error");
      return;
    }

    const modal = document.getElementById('user-management-modal');
    if (!modal) return;

    this._customTempPwd = false;

    // Réinitialiser formulaire création
    const userInp = document.getElementById('new-user-username');
    const pwdInp = document.getElementById('new-user-password');
    const upChk = document.getElementById('new-user-can-upload');
    const edChk = document.getElementById('new-user-can-edit');
    const errBox = document.getElementById('create-user-error');

    if (userInp) userInp.value = '';
    if (pwdInp) pwdInp.value = '';
    if (upChk) upChk.checked = true;
    if (edChk) edChk.checked = false;
    if (errBox) errBox.classList.add('hidden');

    this.renderUsersTable();
    this.updateSupabaseUsersStatusBadge();

    modal.classList.remove('hidden');
  }

  handleNewUserUsernameInput(val) {
    if (this._customTempPwd) return;
    const pwdInp = document.getElementById('new-user-password');
    if (pwdInp) {
      pwdInp.value = val;
    }
  }

  onUserTempPasswordEdited() {
    this._customTempPwd = true;
  }

  closeUserManagementModal() {
    const modal = document.getElementById('user-management-modal');
    if (modal) modal.classList.add('hidden');
  }

  generateTempPasswordForCreation() {
    if (typeof AuthManager === 'undefined') return;
    const pwdInp = document.getElementById('new-user-password');
    if (!pwdInp) return;

    const temp = AuthManager.generateTemporaryPassword();
    pwdInp.value = temp;
    pwdInp.type = 'text';
    this._customTempPwd = true;
    this.showToast(`Mot de passe temporaire généré : ${temp}`, "info");
  }

  async handleCreateUserSubmit() {
    const userInp = document.getElementById('new-user-username');
    const pwdInp = document.getElementById('new-user-password');
    const upChk = document.getElementById('new-user-can-upload');
    const edChk = document.getElementById('new-user-can-edit');
    const errBox = document.getElementById('create-user-error');

    if (!userInp || !pwdInp) return;

    if (errBox) errBox.classList.add('hidden');

    const res = await AuthManager.createUser({
      username: userInp.value,
      password: pwdInp.value,
      can_upload: upChk ? upChk.checked : false,
      can_edit: edChk ? edChk.checked : false
    });

    if (!res.success) {
      if (errBox) {
        errBox.textContent = res.error;
        errBox.classList.remove('hidden');
      }
      return;
    }

    userInp.value = '';
    pwdInp.value = '';
    this._customTempPwd = false;
    this.renderUsersTable();
    this.showToast(`✅ Utilisateur « ${res.user.username} » créé avec succès !`, "success");
  }

  renderUsersTable() {
    const tbody = document.getElementById('users-table-body');
    const countBadge = document.getElementById('users-count-badge');
    if (!tbody || typeof AuthManager === 'undefined') return;

    const users = AuthManager.getAllUsers();
    if (countBadge) {
      countBadge.textContent = `${users.length} compte${users.length > 1 ? 's' : ''}`;
    }

    tbody.innerHTML = '';

    users.forEach(u => {
      const tr = document.createElement('tr');
      tr.className = 'hover:bg-slate-50 transition';

      const isAdmin = u.role === 'admin';
      const canUploadBadge = (isAdmin || u.can_upload) 
        ? `<span class="px-2 py-0.5 rounded font-bold text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-300">📤 Upload</span>`
        : `<span class="px-2 py-0.5 rounded font-medium text-[10px] bg-slate-100 text-slate-400">📤 Non</span>`;

      const canEditBadge = (isAdmin || u.can_edit)
        ? `<span class="px-2 py-0.5 rounded font-bold text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-300">✏️ Édition</span>`
        : `<span class="px-2 py-0.5 rounded font-medium text-[10px] bg-slate-100 text-slate-400">✏️ Non</span>`;

      tr.innerHTML = `
        <td class="py-3 px-4 font-bold text-slate-900">
          <div class="flex items-center gap-1.5">
            <span>👤</span>
            <span>${u.username}</span>
            ${isAdmin ? '<span class="text-[9px] text-emerald-700 font-extrabold bg-emerald-100 px-1.5 py-0.2 rounded border border-emerald-300">Principal</span>' : ''}
          </div>
        </td>
        <td class="py-3 px-3">
          <span class="px-2 py-0.5 rounded font-bold text-[10px] ${isAdmin ? 'bg-indigo-100 text-indigo-800 border border-indigo-300' : 'bg-slate-100 text-slate-700 border border-slate-200'}">
            ${isAdmin ? 'Administrateur' : 'Membre'}
          </span>
        </td>
        <td class="py-3 px-3">
          <div class="flex items-center gap-1.5">
            ${canUploadBadge}
            ${canEditBadge}
          </div>
        </td>
        <td class="py-3 px-4 text-right">
          <div class="flex items-center justify-end gap-1.5">
            <button class="btn-user-reset-pwd px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-semibold transition" title="Générer ou définir un mot de passe temporaire">
              🔑 Réinit. MDP
            </button>
            ${!isAdmin ? `
              <button class="btn-user-edit-perms px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-[11px] font-semibold transition" title="Modifier les droits">
                ⚙️ Droits
              </button>
              <button class="btn-user-delete px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-[11px] font-semibold transition" title="Supprimer cet utilisateur">
                🗑️
              </button>
            ` : ''}
          </div>
        </td>
      `;

      tr.querySelector('.btn-user-reset-pwd').onclick = () => this.promptResetUserPassword(u.id, u.username);

      const editPermsBtn = tr.querySelector('.btn-user-edit-perms');
      if (editPermsBtn) {
        editPermsBtn.onclick = () => this.promptEditUserPermissions(u);
      }

      const delBtn = tr.querySelector('.btn-user-delete');
      if (delBtn) {
        delBtn.onclick = () => this.confirmDeleteUser(u.id, u.username);
      }

      tbody.appendChild(tr);
    });
  }

  async promptResetUserPassword(userId, username) {
    if (typeof AuthManager === 'undefined') return;
    const inputPwd = prompt(
      `Réinitialisation du mot de passe pour « ${username} ».\n\nMot de passe temporaire proposé par défaut (= nom d'utilisateur) :\n(Conservez-le ou saisissez-en un autre)`,
      username
    );
    if (inputPwd === null) return;
    const chosenPwd = inputPwd.trim() || username;

    const res = await AuthManager.resetUserPassword(userId, chosenPwd);
    if (res.success) {
      this.showToast(`Mot de passe réinitialisé pour « ${username} » : ${chosenPwd}`, "success");
      this.renderUsersTable();
    } else {
      this.showToast(`Erreur : ${res.error}`, "error");
    }
  }

  async promptEditUserPermissions(user) {
    if (typeof AuthManager === 'undefined') return;
    const newUpload = confirm(`Droits pour « ${user.username} » :\n\n1. Autoriser le CHARGEMENT de nouveaux fichiers GPX ?\n\n(OK = Autoriser, Annuler = Refuser)`);
    const newEdit = confirm(`Droits pour « ${user.username} » :\n\n2. Autoriser l'ÉDITION et SUPPRESSION dans la bibliothèque ?\n\n(OK = Autoriser, Annuler = Refuser)`);

    await AuthManager.updateUserPermissions(user.id, {
      can_upload: newUpload,
      can_edit: newEdit
    });

    this.showToast(`Permissions mises à jour pour « ${user.username} »`, "success");
    this.renderUsersTable();
    this.applyPermissionGuards();
  }

  async confirmDeleteUser(userId, username) {
    if (typeof AuthManager === 'undefined') return;
    const conf = confirm(`Êtes-vous certain de vouloir supprimer définitivement le compte utilisateur « ${username} » ?`);
    if (!conf) return;

    const res = await AuthManager.deleteUser(userId);
    if (res.success) {
      this.showToast(`Utilisateur « ${username} » supprimé.`, "info");
      this.renderUsersTable();
    } else {
      this.showToast(`Erreur : ${res.error}`, "error");
    }
  }

  copySupabaseSqlScript() {
    if (typeof AuthManager === 'undefined') return;
    const sql = AuthManager.getSupabaseTableSQL();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(sql).then(() => {
        this.showToast("📋 Script SQL Supabase copié dans le presse-papier !", "success");
      }).catch(() => {
        prompt("Copiez le script SQL Supabase ci-dessous :", sql);
      });
    } else {
      prompt("Copiez le script SQL Supabase ci-dessous :", sql);
    }
  }

  async testAndSyncSupabaseUsers() {
    if (typeof AuthManager === 'undefined') return;
    this.showToast("Vérification de la table Supabase app_users...", "info");
    const ok = await AuthManager.syncFromSupabase();
    if (ok) {
      this.showToast("✅ Synchronisation réussie avec la table Cloud Supabase !", "success");
    } else {
      this.showToast("ℹ️ Table app_users non trouvée sur Supabase. Mode local actif.", "info");
    }
    this.updateSupabaseUsersStatusBadge();
    this.renderUsersTable();
  }

  updateSupabaseUsersStatusBadge() {
    const badge = document.getElementById('supa-users-status');
    if (!badge || typeof AuthManager === 'undefined') return;

    if (AuthManager.isSupabaseAvailable) {
      badge.textContent = '🟢 Cloud Supabase Connecté';
      badge.className = 'px-2 py-0.5 rounded-full font-bold text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-300';
    } else {
      badge.textContent = '💾 Stockage Local Actif';
      badge.className = 'px-2 py-0.5 rounded-full font-bold text-[10px] bg-slate-200 text-slate-700';
    }
  }
}

// Global bootstrap
function bootstrapApp() {
  if (!window.App) {
    window.App = new AppController();
    window.App.init();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrapApp);
} else {
  bootstrapApp();
}
