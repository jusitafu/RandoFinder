/**
 * Screen Calibration Manager - RandoFinder
 * Permet d'étalonner l'écran pour que 1 cm mesuré à la règle sur la vitre
 * corresponde exactement à l'échelle métrique sur le terrain (ex : 1 : 25 000 ou 1 : 125 000).
 * JLDApps 2026
 */

(function () {
  const STORAGE_KEY = 'randofinder_screen_calibration';

  // Base de données des modèles d'écrans les plus fréquents
  const SCREEN_PRESETS = [
    // PC Portables Windows
    { id: 'win_13_fhd', group: 'PC Portables Windows', name: 'PC Portable 13,3" Full HD (1920×1080)', diagInch: 13.3, resW: 1920, resH: 1080 },
    { id: 'win_14_fhd', group: 'PC Portables Windows', name: 'PC Portable 14,0" Full HD (1920×1080)', diagInch: 14.0, resW: 1920, resH: 1080 },
    { id: 'win_15_fhd', group: 'PC Portables Windows', name: 'PC Portable 15,6" Full HD (1920×1080) ⭐ (Standard)', diagInch: 15.6, resW: 1920, resH: 1080, isRecommendedPC: true },
    { id: 'win_16_1610', group: 'PC Portables Windows', name: 'PC Portable 16,0" format 16:10 (1920×1200)', diagInch: 16.0, resW: 1920, resH: 1200 },
    { id: 'win_16_qhd', group: 'PC Portables Windows', name: 'PC Portable 16,0" QHD+ (2560×1600)', diagInch: 16.0, resW: 2560, resH: 1600 },
    { id: 'win_17_fhd', group: 'PC Portables Windows', name: 'PC Portable 17,3" Full HD (1920×1080)', diagInch: 17.3, resW: 1920, resH: 1080 },

    // Écrans fixes de bureau (Moniteurs)
    { id: 'mon_21_fhd', group: 'Moniteurs fixes (Bureau)', name: 'Moniteur 21,5" Full HD (1920×1080)', diagInch: 21.5, resW: 1920, resH: 1080 },
    { id: 'mon_24_fhd', group: 'Moniteurs fixes (Bureau)', name: 'Moniteur 24,0" Full HD (1920×1080) ⭐ (Standard bureau)', diagInch: 24.0, resW: 1920, resH: 1080, isRecommendedDesktop: true },
    { id: 'mon_27_fhd', group: 'Moniteurs fixes (Bureau)', name: 'Moniteur 27,0" Full HD (1920×1080)', diagInch: 27.0, resW: 1920, resH: 1080 },
    { id: 'mon_27_qhd', group: 'Moniteurs fixes (Bureau)', name: 'Moniteur 27,0" QHD (2560×1440) ⭐', diagInch: 27.0, resW: 2560, resH: 1440 },
    { id: 'mon_27_4k', group: 'Moniteurs fixes (Bureau)', name: 'Moniteur 27,0" 4K UHD (3840×2160)', diagInch: 27.0, resW: 3840, resH: 2160 },
    { id: 'mon_32_4k', group: 'Moniteurs fixes (Bureau)', name: 'Moniteur 32,0" 4K UHD (3840×2160)', diagInch: 32.0, resW: 3840, resH: 2160 },

    // Apple (Mac & iPad)
    { id: 'mac_air_13', group: 'Apple (Mac & iPad)', name: 'MacBook Air 13,3" / 13,6" Retina', diagInch: 13.6, resW: 2560, resH: 1664, forcedPpi: 224, isMacDefault: true },
    { id: 'mac_air_15', group: 'Apple (Mac & iPad)', name: 'MacBook Air 15,3" Retina', diagInch: 15.3, resW: 2880, resH: 1864, forcedPpi: 224 },
    { id: 'mac_pro_14', group: 'Apple (Mac & iPad)', name: 'MacBook Pro 14,2" Liquid Retina XDR', diagInch: 14.2, resW: 3024, resH: 1964, forcedPpi: 254 },
    { id: 'mac_pro_16', group: 'Apple (Mac & iPad)', name: 'MacBook Pro 16,2" Liquid Retina XDR', diagInch: 16.2, resW: 3456, resH: 2234, forcedPpi: 254 },
    { id: 'mac_imac_24', group: 'Apple (Mac & iPad)', name: 'iMac 24" 4.5K Retina', diagInch: 23.5, resW: 4480, resH: 2520, forcedPpi: 218 },
    { id: 'apple_ipad_10', group: 'Apple (Mac & iPad)', name: 'iPad 10,2" / 10,9"', diagInch: 10.9, resW: 2360, resH: 1640, forcedPpi: 264 },
    { id: 'apple_ipad_13', group: 'Apple (Mac & iPad)', name: 'iPad Pro 12,9" / 13"', diagInch: 12.9, resW: 2732, resH: 2048, forcedPpi: 264 },

    // Référence standard non étalonnée
    { id: 'standard_96', group: 'Générique', name: 'Écran standard générique (96 DPI web non étalonné)', diagInch: null, forcedPpi: 96 }
  ];

  class ScreenCalibManager {
    constructor() {
      this.currentMode = 'preset'; // 'preset' | 'custom' | 'card'
      this.activeCalib = this.loadCalibration();
      this.tempCalib = { ...this.activeCalib };
    }

    /**
     * Charge le profil enregistré ou crée un profil par défaut
     */
    loadCalibration() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed.cssPxPerCm === 'number' && parsed.cssPxPerCm > 10) {
            return parsed;
          }
        }
      } catch (_) {}

      // Profil par défaut (non étalonné)
      return {
        type: 'preset',
        presetId: 'standard_96',
        name: 'Standard Web (96 DPI)',
        cssPxPerCm: 37.795275,
        isCalibrated: false
      };
    }

    /**
     * Sauvegarde le profil actuel
     */
    saveCalibration(calib) {
      this.activeCalib = { ...calib };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.activeCalib));
      } catch (_) {}

      if (window.MapManagerInstance) {
        window.MapManagerInstance._screenCalib = this.activeCalib;
        window.MapManagerInstance.updateMapHud();
      }

      if (window.App && typeof window.App.showToast === 'function') {
        const msg = this.activeCalib.isCalibrated
          ? `📏 Écran étalonné : ${this.activeCalib.name}. 1 cm sur la vitre = mesure exacte !`
          : `📏 Étalonnage réinitialisé (96 DPI standard).`;
        window.App.showToast(msg, "success");
      }
    }

    /**
     * Calcule le nombre de CSS pixels par cm pour un preset
     */
    computeCssPxPerCmForPreset(preset) {
      const dpr = window.devicePixelRatio || 1;
      let ppi = 96;

      if (preset.forcedPpi) {
        ppi = preset.forcedPpi;
      } else if (preset.diagInch && preset.resW && preset.resH) {
        const diagPx = Math.sqrt(preset.resW * preset.resW + preset.resH * preset.resH);
        ppi = diagPx / preset.diagInch;
      }

      // Nombre de pixels physiques par cm = ppi / 2.54
      // Nombre de pixels CSS par cm = pixels physiques / dpr
      const cssPxPerCm = ppi / (2.54 * dpr);
      return cssPxPerCm;
    }

    /**
     * Calcule le nombre de CSS pixels par cm pour une diagonale personnalisée
     */
    computeCssPxPerCmForCustom(diagInch) {
      const dpr = window.devicePixelRatio || 1;
      const screenW = window.screen.width * dpr;
      const screenH = window.screen.height * dpr;
      const diagPx = Math.sqrt(screenW * screenW + screenH * screenH);
      const ppi = diagPx / diagInch;
      return ppi / (2.54 * dpr);
    }

    /**
     * Calcule le nombre de CSS pixels par cm à partir de la largeur d'une carte bancaire (85.60 mm = 8.56 cm)
     */
    computeCssPxPerCmForCardWidth(cardWidthCssPx) {
      return cardWidthCssPx / 8.56;
    }

    /**
     * Détecte le preset le plus probable selon l'environnement
     */
    suggestPreset() {
      const isMac = /Macintosh|Mac OS X/i.test(navigator.userAgent);
      const isIPad = /iPad/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

      if (isIPad) return SCREEN_PRESETS.find(p => p.id === 'apple_ipad_10') || SCREEN_PRESETS[0];
      if (isMac) return SCREEN_PRESETS.find(p => p.id === 'mac_air_13') || SCREEN_PRESETS[0];

      // Sur Windows / PC : suggérer le 15.6" portable par défaut
      return SCREEN_PRESETS.find(p => p.id === 'win_15_fhd') || SCREEN_PRESETS[0];
    }

    /**
     * Ouvre la boîte modale d'étalonnage
     */
    openModal() {
      const modal = document.getElementById('screen-calib-modal');
      if (!modal) return;

      this.tempCalib = { ...this.activeCalib };

      this.populatePresetsDropdown();
      this.setupEventListeners();
      this.updateRulerPreview();

      modal.classList.remove('hidden');
    }

    closeModal() {
      const modal = document.getElementById('screen-calib-modal');
      if (modal) modal.classList.add('hidden');
    }

    populatePresetsDropdown() {
      const select = document.getElementById('select-screen-preset');
      if (!select) return;

      select.innerHTML = '';
      const groups = {};

      SCREEN_PRESETS.forEach(p => {
        if (!groups[p.group]) groups[p.group] = [];
        groups[p.group].push(p);
      });

      const suggested = this.suggestPreset();

      for (const [groupName, presets] of Object.entries(groups)) {
        const optgroup = document.createElement('optgroup');
        optgroup.label = groupName;
        presets.forEach(p => {
          const opt = document.createElement('option');
          opt.value = p.id;
          opt.textContent = p.name;
          if (this.tempCalib.presetId === p.id || (!this.tempCalib.isCalibrated && p.id === suggested.id)) {
            opt.selected = true;
          }
          optgroup.appendChild(opt);
        });
        select.appendChild(optgroup);
      }
    }

    setupEventListeners() {
      if (this._hasBoundEvents) return;
      this._hasBoundEvents = true;

      // Onglets
      const tabPreset = document.getElementById('tab-calib-preset');
      const tabCustom = document.getElementById('tab-calib-custom');
      const tabCard = document.getElementById('tab-calib-card');

      const secPreset = document.getElementById('section-calib-preset');
      const secCustom = document.getElementById('section-calib-custom');
      const secCard = document.getElementById('section-calib-card');

      const setTab = (mode) => {
        this.currentMode = mode;
        const tabs = [
          { btn: tabPreset, sec: secPreset, active: mode === 'preset' },
          { btn: tabCustom, sec: secCustom, active: mode === 'custom' },
          { btn: tabCard, sec: secCard, active: mode === 'card' }
        ];

        tabs.forEach(t => {
          if (!t.btn || !t.sec) return;
          if (t.active) {
            t.btn.className = 'py-2 px-1 rounded-xl border-2 transition cursor-pointer border-emerald-600 bg-emerald-50 text-emerald-800 font-bold';
            t.sec.classList.remove('hidden');
          } else {
            t.btn.className = 'py-2 px-1 rounded-xl border-2 transition cursor-pointer border-slate-200 bg-white text-slate-600 hover:bg-slate-50 font-medium';
            t.sec.classList.add('hidden');
          }
        });

        this.recalculateTempFromCurrentMode();
      };

      if (tabPreset) tabPreset.addEventListener('click', () => setTab('preset'));
      if (tabCustom) tabCustom.addEventListener('click', () => setTab('custom'));
      if (tabCard) tabCard.addEventListener('click', () => setTab('card'));

      // Sélecteur de preset
      const selectPreset = document.getElementById('select-screen-preset');
      if (selectPreset) {
        selectPreset.addEventListener('change', () => {
          this.recalculateTempFromCurrentMode();
        });
      }

      // Input custom
      const inputCustom = document.getElementById('input-custom-diag');
      if (inputCustom) {
        inputCustom.addEventListener('input', () => {
          this.recalculateTempFromCurrentMode();
        });
      }

      // Slider carte bancaire
      const sliderCard = document.getElementById('slider-calib-card');
      const cardBox = document.getElementById('calib-card-box');
      if (sliderCard) {
        sliderCard.addEventListener('input', () => {
          const w = parseFloat(sliderCard.value);
          if (cardBox) cardBox.style.width = `${w}px`;
          this.recalculateTempFromCurrentMode();
        });
      }

      // Boutons modal
      const btnClose = document.getElementById('btn-close-screen-calib');
      const btnCancel = document.getElementById('btn-cancel-screen-calib');
      const btnSave = document.getElementById('btn-save-screen-calib');
      const btnReset = document.getElementById('btn-reset-screen-calib');

      if (btnClose) btnClose.addEventListener('click', () => this.closeModal());
      if (btnCancel) btnCancel.addEventListener('click', () => this.closeModal());

      if (btnReset) {
        btnReset.addEventListener('click', () => {
          const defaultCalib = {
            type: 'preset',
            presetId: 'standard_96',
            name: 'Standard Web (96 DPI)',
            cssPxPerCm: 37.795275,
            isCalibrated: false
          };
          this.saveCalibration(defaultCalib);
          this.closeModal();
        });
      }

      if (btnSave) {
        btnSave.addEventListener('click', () => {
          this.tempCalib.isCalibrated = (this.tempCalib.presetId !== 'standard_96');
          this.saveCalibration(this.tempCalib);
          this.closeModal();
        });
      }
    }

    recalculateTempFromCurrentMode() {
      if (this.currentMode === 'preset') {
        const select = document.getElementById('select-screen-preset');
        const pid = select ? select.value : 'win_15_fhd';
        const preset = SCREEN_PRESETS.find(p => p.id === pid) || SCREEN_PRESETS[0];
        const cssPxPerCm = this.computeCssPxPerCmForPreset(preset);

        this.tempCalib = {
          type: 'preset',
          presetId: preset.id,
          name: preset.name.replace(' ⭐ (Standard)', '').replace(' ⭐ (Standard bureau)', '').replace(' ⭐', ''),
          cssPxPerCm: cssPxPerCm,
          isCalibrated: (preset.id !== 'standard_96')
        };
      } else if (this.currentMode === 'custom') {
        const input = document.getElementById('input-custom-diag');
        const diag = parseFloat(input ? input.value : 15.6) || 15.6;
        const cssPxPerCm = this.computeCssPxPerCmForCustom(diag);

        this.tempCalib = {
          type: 'custom',
          diagInch: diag,
          name: `Écran ${diag}" personnalisé`,
          cssPxPerCm: cssPxPerCm,
          isCalibrated: true
        };
      } else if (this.currentMode === 'card') {
        const slider = document.getElementById('slider-calib-card');
        const cardWidthPx = parseFloat(slider ? slider.value : 323) || 323;
        const cssPxPerCm = this.computeCssPxPerCmForCardWidth(cardWidthPx);

        this.tempCalib = {
          type: 'card',
          cardWidthPx: cardWidthPx,
          name: 'Calibrage Carte Bancaire',
          cssPxPerCm: cssPxPerCm,
          isCalibrated: true
        };
      }

      this.updateRulerPreview();
    }

    /**
     * Génère le SVG de la réglette témoin de 5 cm avec graduations au millimètre
     */
    updateRulerPreview() {
      const container = document.getElementById('calib-ruler-container');
      const calcInfo = document.getElementById('calib-calc-info');
      if (!container) return;

      const pxPerCm = this.tempCalib.cssPxPerCm || 37.795275;
      const totalWidth = 5 * pxPerCm;

      if (calcInfo) {
        calcInfo.textContent = `1 cm = ${pxPerCm.toFixed(1)} px • 5 cm = ${Math.round(totalWidth)} px`;
      }

      let lines = '';
      for (let mm = 0; mm <= 50; mm++) {
        const x = mm * (pxPerCm / 10);
        let h = 8;
        let strokeWidth = 1;
        let label = '';

        if (mm % 10 === 0) {
          h = 24;
          strokeWidth = 2;
          const cmVal = mm / 10;
          const offsetX = (cmVal === 0 ? 3 : (cmVal === 5 ? -10 : -4));
          label = `<text x="${x + offsetX}" y="40" font-size="12" font-weight="900" fill="#0f172a" font-family="monospace">${cmVal}</text>`;
        } else if (mm % 5 === 0) {
          h = 16;
          strokeWidth = 1.5;
        }

        lines += `<line x1="${x.toFixed(2)}" y1="0" x2="${x.toFixed(2)}" y2="${h}" stroke="#1e293b" stroke-width="${strokeWidth}" />${label}`;
      }

      container.innerHTML = `
        <svg width="${Math.ceil(totalWidth) + 12}" height="48" style="display:block; overflow:visible; margin: 0 auto;">
          <rect x="0" y="0" width="${totalWidth.toFixed(2)}" height="48" fill="#fef3c7" stroke="#334155" stroke-width="1.5" rx="5" />
          ${lines}
          <text x="${(totalWidth / 2) - 12}" y="20" font-size="10" font-weight="bold" fill="#059669" font-family="sans-serif">cm</text>
        </svg>
      `;
    }
  }

  window.ScreenCalibManager = new ScreenCalibManager();
})();
