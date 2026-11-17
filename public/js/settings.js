// Haul Pro - Apple Style Settings, Guide, Help, Localization & Account Controller
// Pure Vanilla JavaScript (ES6+), Zero Emojis

const Settings = {
  preferences: {
    defaultView: 'grid',
    defaultVisibility: 'private',
    autoCopy: true,
    language: 'en',
    theme: 'system'
  },
  currentTab: 'general',

  i18n: {
    en: {
      drive: "My Drive",
      recent: "Recent",
      starred: "Starred",
      trash: "Trash",
      storage: "Storage",
      guide: "Guide & Help",
      settings: "Settings",
      signout: "Sign Out",
      activity: "Activity",
      activity_log: "Activity & Alerts",
      general: "General",
      security: "Security",
      legal: "Legal",
      help: "Help",
      default_layout: "Default Layout",
      default_layout_sub: "Choose how your files are displayed by default",
      default_vis: "Default Upload Visibility",
      default_vis_sub: "Uploaded files will be private unless you publish them",
      autocopy: "Auto-Copy Link",
      autocopy_sub: "Automatically copy direct media link to clipboard upon upload",
      language: "Display Language",
      language_sub: "Choose interface display language"
    },
    es: {
      drive: "Mi Unidad",
      recent: "Recientes",
      starred: "Destacados",
      trash: "Papelera",
      storage: "Almacenamiento",
      guide: "Guía y Ayuda",
      settings: "Ajustes",
      signout: "Cerrar Sesión",
      activity: "Actividad",
      activity_log: "Actividad y Alertas",
      general: "General",
      security: "Seguridad",
      legal: "Legal",
      help: "Ayuda",
      default_layout: "Diseño Predeterminado",
      default_layout_sub: "Elige cómo se muestran tus archivos por defecto",
      default_vis: "Visibilidad Predeterminada",
      default_vis_sub: "Los archivos subidos serán privados a menos que los publiques",
      autocopy: "Copiar Enlace Automático",
      autocopy_sub: "Copiar enlace directo al portapapeles al subir",
      language: "Idioma de la Interfaz",
      language_sub: "Selecciona el idioma de visualización"
    },
    fr: {
      drive: "Mon Drive",
      recent: "Récents",
      starred: "Favoris",
      trash: "Corbeille",
      storage: "Stockage",
      guide: "Guide et Aide",
      settings: "Paramètres",
      signout: "Déconnexion",
      activity: "Activité",
      activity_log: "Activité et Alertes",
      general: "Général",
      security: "Sécurité",
      legal: "Légal",
      help: "Aide",
      default_layout: "Disposition par Défaut",
      default_layout_sub: "Choisissez le mode d'affichage de vos fichiers",
      default_vis: "Visibilité par Défaut",
      default_vis_sub: "Les fichiers envoyés restent privés jusqu'à publication",
      autocopy: "Copie Automatique du Lien",
      autocopy_sub: "Copier automatiquement le lien direct après téléversement",
      language: "Langue d'Affichage",
      language_sub: "Choisissez la langue de l'interface"
    },
    de: {
      drive: "Mein Drive",
      recent: "Zuletzt",
      starred: "Markiert",
      trash: "Papierkorb",
      storage: "Speicherplatz",
      guide: "Anleitung & Hilfe",
      settings: "Einstellungen",
      signout: "Abmelden",
      activity: "Aktivität",
      activity_log: "Aktivität & Benachrichtigungen",
      general: "Allgemein",
      security: "Sicherheit",
      legal: "Rechtliches",
      help: "Hilfe",
      default_layout: "Standardlayout",
      default_layout_sub: "Wählen Sie das Standard-Dateiformat",
      default_vis: "Standard-Sichtbarkeit",
      default_vis_sub: "Hochgeladene Dateien sind standardmäßig privat",
      autocopy: "Link Automatisch Kopieren",
      autocopy_sub: "Direktlink nach dem Hochladen kopieren",
      language: "Sprache",
      language_sub: "Wählen Sie die Anzeigesprache"
    },
    hi: {
      drive: "माई ड्राइव",
      recent: "हाल ही के",
      starred: "पसंदीदा",
      trash: "ट्रैश",
      storage: "स्टोरेज",
      guide: "गाइड और सहायता",
      settings: "सेटिंग्स",
      signout: "लॉग आउट",
      activity: "गतिविधि",
      activity_log: "गतिविधि व अलर्ट",
      general: "सामान्य",
      security: "सुरक्षा",
      legal: "नियम व शर्तें",
      help: "सहायता",
      default_layout: "डिफ़ॉल्ट लेआउट",
      default_layout_sub: "चुनें कि आपकी फ़ाइलें कैसे दिखाई दें",
      default_vis: "डिफ़ॉल्ट दृश्यता",
      default_vis_sub: "अपलोड की गई फाइलें निजी रहेंगी जब तक आप उन्हें सार्वजनिक न करें",
      autocopy: "ऑटो-कॉपी लिंक",
      autocopy_sub: "अपलोड होने पर डायरेक्ट मीडिया लिंक क्लिपबोर्ड में कॉपी करें",
      language: "भाषा",
      language_sub: "इंटरफ़ेस भाषा चुनें"
    },
    ja: {
      drive: "マイドライブ",
      recent: "最近",
      starred: "スター付き",
      trash: "ゴミ箱",
      storage: "ストレージ",
      guide: "ガイドとヘルプ",
      settings: "設定",
      signout: "ログアウト",
      activity: "アクティビティ",
      activity_log: "アクティビティと通知",
      general: "一般",
      security: "セキュリティ",
      legal: "利用規約",
      help: "ヘルプ",
      default_layout: "デフォルト表示",
      default_layout_sub: "ファイルのデフォルト表示形式を選択",
      default_vis: "デフォルトの公開設定",
      default_vis_sub: "アップロードされたファイルは公開するまで非公開です",
      autocopy: "自動リンクコピー",
      autocopy_sub: "アップロード時に直接リンクを自動コピー",
      language: "表示言語",
      language_sub: "インターフェースの言語を選択"
    }
  },

  init() {
    this.loadLocalPreferences();
    this.initThemeListener();
    this.bindEvents();
  },

  loadLocalPreferences() {
    try {
      const saved = localStorage.getItem('haul_preferences');
      if (saved) {
        this.preferences = Object.assign(this.preferences, JSON.parse(saved));
      }
      const explicitTheme = localStorage.getItem('haul_theme');
      if (explicitTheme) {
        this.preferences.theme = explicitTheme;
      }
    } catch (e) {
      // Ignore storage errors
    }
    this.applyTheme(this.preferences.theme || 'system');
    this.applyPreferencesUI();
    this.applyLanguage(this.preferences.language || 'en');
  },

  applyTheme(theme) {
    const t = theme || this.preferences.theme || 'system';
    let resolved = t;
    if (t === 'system') {
      resolved = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', resolved);
    try {
      localStorage.setItem('haul_theme', t);
    } catch (e) {}
  },

  initThemeListener() {
    if (!window.matchMedia) return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e) => {
      if ((this.preferences.theme || 'system') === 'system') {
        document.documentElement.setAttribute('data-theme', e.matches ? 'dark' : 'light');
      }
    };
    if (media.addEventListener) {
      media.addEventListener('change', handler);
    } else if (media.addListener) {
      media.addListener(handler);
    }
  },

  savePreferences(updates) {
    this.preferences = Object.assign(this.preferences, updates);
    try {
      localStorage.setItem('haul_preferences', JSON.stringify(this.preferences));
    } catch (e) {
      // Ignore storage errors
    }
    this.applyPreferencesUI();
    if (API && API.updatePreferences) {
      API.updatePreferences(this.preferences).catch(() => {});
    }
  },

  applyPreferencesUI() {
    // View mode segmented control
    const viewBtns = document.querySelectorAll('#pref-view-segmented .apple-segmented-btn');
    viewBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.value === this.preferences.defaultView);
    });

    // Visibility segmented control
    const visBtns = document.querySelectorAll('#pref-vis-segmented .apple-segmented-btn');
    visBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.value === this.preferences.defaultVisibility);
    });

    // Auto copy toggle
    const autoCopyInput = document.getElementById('pref-autocopy-toggle');
    if (autoCopyInput) {
      autoCopyInput.checked = Boolean(this.preferences.autoCopy);
    }

    // Theme segmented control
    const themeBtns = document.querySelectorAll('#pref-theme-segmented .apple-segmented-btn');
    themeBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.value === (this.preferences.theme || 'system'));
    });

    // Language dropdown
    const langSelect = document.getElementById('pref-language-select');
    if (langSelect && this.preferences.language) {
      langSelect.value = this.preferences.language;
    }
  },

  applyLanguage(lang) {
    const dict = this.i18n[lang] || this.i18n['en'];
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.dataset.i18n;
      if (dict[key]) {
        el.textContent = dict[key];
      }
    });
    const langSelect = document.getElementById('pref-language-select');
    if (langSelect) langSelect.value = lang;
  },

  bindEvents() {
    // Topbar & Profile dropdown buttons to open settings
    const topbarSettingsBtn = document.getElementById('topbar-settings-btn');
    const profileSettingsBtn = document.getElementById('profile-settings-btn');
    const closeBtn = document.getElementById('settings-close-btn');
    const modal = document.getElementById('settings-modal');

    if (topbarSettingsBtn) {
      topbarSettingsBtn.addEventListener('click', () => this.open());
    }

    if (profileSettingsBtn) {
      profileSettingsBtn.addEventListener('click', () => {
        const dropdown = document.getElementById('profile-dropdown');
        if (dropdown) dropdown.style.display = 'none';
        this.open();
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.close());
    }

    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) this.close();
      });
    }

    // Tab navigation buttons
    document.querySelectorAll('.settings-nav-item').forEach(item => {
      item.addEventListener('click', () => {
        const tab = item.dataset.tab;
        if (tab) this.switchTab(tab);
      });
    });

    // Preferences controls
    document.querySelectorAll('#pref-view-segmented .apple-segmented-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.dataset.value;
        this.savePreferences({ defaultView: val });
        if (Drive && Drive.currentView !== val) {
          Drive.toggleView();
        }
      });
    });

    document.querySelectorAll('#pref-vis-segmented .apple-segmented-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.dataset.value;
        this.savePreferences({ defaultVisibility: val });
        Drive.showToast(`Default upload visibility set to ${val === 'public' ? 'Public' : 'Private'}`);
      });
    });

    const autoCopyInput = document.getElementById('pref-autocopy-toggle');
    if (autoCopyInput) {
      autoCopyInput.addEventListener('change', (e) => {
        this.savePreferences({ autoCopy: e.target.checked });
        Drive.showToast(`Auto-copy link ${e.target.checked ? 'enabled' : 'disabled'}`);
      });
    }

    document.querySelectorAll('#pref-theme-segmented .apple-segmented-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const val = btn.dataset.value;
        this.savePreferences({ theme: val });
        this.applyTheme(val);
        Drive.showToast(`Theme set to ${val.charAt(0).toUpperCase() + val.slice(1)}`);
      });
    });

    const langSelect = document.getElementById('pref-language-select');
    if (langSelect) {
      langSelect.addEventListener('change', (e) => {
        const lang = e.target.value;
        this.savePreferences({ language: lang });
        this.applyLanguage(lang);
        Drive.showToast(`Language updated`);
      });
    }

    // Change password form
    const pwForm = document.getElementById('change-password-form');
    if (pwForm) {
      pwForm.addEventListener('submit', (e) => this.handlePasswordSubmit(e));
    }

    // Empty trash button
    const emptyTrashBtn = document.getElementById('empty-trash-btn');
    if (emptyTrashBtn) {
      emptyTrashBtn.addEventListener('click', () => this.handleEmptyTrash());
    }

    // FAQ Accordion clicks
    document.querySelectorAll('.faq-question').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = btn.closest('.faq-item');
        if (item) {
          const isOpen = item.classList.contains('active');
          document.querySelectorAll('.faq-item').forEach(other => other.classList.remove('active'));
          if (!isOpen) item.classList.add('active');
        }
      });
    });
  },

  async open(tabName = 'general') {
    const modal = document.getElementById('settings-modal');
    if (!modal) return;
    modal.style.display = 'flex';
    this.switchTab(tabName);
    if (tabName === 'storage') {
      await this.loadStats();
    } else if (tabName === 'webhooks') {
      await this.loadWebhooks();
    }
  },

  close() {
    const modal = document.getElementById('settings-modal');
    if (modal) modal.style.display = 'none';
    const err = document.getElementById('change-pw-error');
    if (err) err.style.display = 'none';
    const succ = document.getElementById('change-pw-success');
    if (succ) succ.style.display = 'none';
  },

  switchTab(tabName) {
    this.currentTab = tabName;
    document.querySelectorAll('.settings-nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.tab === tabName);
    });
    document.querySelectorAll('.settings-tab-pane').forEach(pane => {
      pane.classList.toggle('active', pane.id === `settings-tab-${tabName}`);
    });
    if (tabName === 'storage') {
      this.loadStats();
    } else if (tabName === 'webhooks') {
      this.loadWebhooks();
    }
  },

  switchLegalDoc(docType) {
    document.querySelectorAll('.legal-seg-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.legal === docType);
    });
    const privDoc = document.getElementById('legal-doc-privacy');
    const termsDoc = document.getElementById('legal-doc-terms');
    if (privDoc) privDoc.style.display = docType === 'privacy' ? 'block' : 'none';
    if (termsDoc) termsDoc.style.display = docType === 'terms' ? 'block' : 'none';
  },

  openDeleteModal() {
    const modal = document.getElementById('delete-account-modal');
    if (modal) {
      modal.style.display = 'flex';
      const pwInput = document.getElementById('delete-acc-password');
      if (pwInput) {
        pwInput.value = '';
        setTimeout(() => pwInput.focus(), 100);
      }
      const err = document.getElementById('delete-acc-error');
      if (err) err.style.display = 'none';
    }
  },

  closeDeleteModal() {
    const modal = document.getElementById('delete-account-modal');
    if (modal) modal.style.display = 'none';
    const pwInput = document.getElementById('delete-acc-password');
    if (pwInput) pwInput.value = '';
    const err = document.getElementById('delete-acc-error');
    if (err) err.style.display = 'none';
  },

  async handleDeleteAccountConfirm(e) {
    if (e) e.preventDefault();
    const pwInput = document.getElementById('delete-acc-password');
    const errEl = document.getElementById('delete-acc-error');
    const btn = document.getElementById('confirm-delete-acc-btn');
    if (!pwInput || !pwInput.value) return;

    if (errEl) errEl.style.display = 'none';
    if (btn) btn.disabled = true;

    try {
      const res = await API.deleteAccount(pwInput.value);
      if (res.success) {
        this.closeDeleteModal();
        this.close();
        Drive.showToast('Account and all files deleted permanently.', 'info');
        setTimeout(() => {
          window.location.href = '/';
        }, 1200);
      } else {
        if (errEl) {
          errEl.textContent = res.error || 'Failed to delete account.';
          errEl.style.display = 'block';
        }
      }
    } catch (err) {
      if (errEl) {
        errEl.textContent = err.message || 'Error deleting account.';
        errEl.style.display = 'block';
      }
    } finally {
      if (btn) btn.disabled = false;
    }
  },

  async loadStats() {
    try {
      const data = await API.getStorageStats();
      if (!data.success) return;

      const usedBytes = data.storage_used || 0;
      const limitBytes = data.storage_limit || 15 * 1024 * 1024 * 1024;
      const pct = Math.min(100, Math.max(0, (usedBytes / limitBytes) * 100));

      const usedEl = document.getElementById('storage-detail-used');
      if (usedEl) usedEl.textContent = Auth.formatBytes(usedBytes);

      const bd = data.breakdown || {};
      const imgBytes = bd.image || 0;
      const vidBytes = bd.video || 0;
      const docBytes = bd.document || 0;
      const audBytes = bd.audio || 0;
      const othBytes = (bd.archive || 0) + (bd.code || 0) + (bd.other || 0);

      // Update segment widths proportionally
      const denom = Math.max(usedBytes, 1);
      const setSeg = (id, bytes) => {
        const el = document.getElementById(id);
        if (el) {
          const w = (bytes / denom) * pct;
          el.style.width = `${w}%`;
        }
      };

      setSeg('seg-bar-image', imgBytes);
      setSeg('seg-bar-video', vidBytes);
      setSeg('seg-bar-doc', docBytes);
      setSeg('seg-bar-audio', audBytes);
      setSeg('seg-bar-other', othBytes);

      // Update legend sizes
      const setLeg = (id, bytes) => {
        const el = document.getElementById(id);
        if (el) el.textContent = Auth.formatBytes(bytes);
      };
      setLeg('leg-image-size', imgBytes);
      setLeg('leg-video-size', vidBytes);
      setLeg('leg-doc-size', docBytes);
      setLeg('leg-audio-size', audBytes);
      setLeg('leg-other-size', othBytes);

      // Update sidebar storage meter in sync
      if (typeof Auth !== 'undefined' && Auth.updateStorageMeter) {
        Auth.updateStorageMeter(usedBytes, limitBytes);
      }

      // Update trash info
      const trashInfo = document.getElementById('settings-trash-info');
      if (trashInfo) {
        const trashBytes = data.trashed_bytes || 0;
        const trashCount = data.trashed_count || 0;
        trashInfo.textContent = trashCount > 0
          ? `${trashCount} item${trashCount === 1 ? '' : 's'} (${Auth.formatBytes(trashBytes)}) in trash ready to be purged.`
          : 'Trash is empty. No storage to reclaim.';
      }
    } catch (e) {
      console.error('Failed to load storage stats:', e);
    }
  },

  async handlePasswordSubmit(e) {
    e.preventDefault();
    const currInput = document.getElementById('pw-current');
    const newInput = document.getElementById('pw-new');
    const confInput = document.getElementById('pw-confirm');
    const errEl = document.getElementById('change-pw-error');
    const succEl = document.getElementById('change-pw-success');
    const saveBtn = document.getElementById('save-password-btn');

    if (errEl) errEl.style.display = 'none';
    if (succEl) succEl.style.display = 'none';

    const curr = currInput.value;
    const next = newInput.value;
    const conf = confInput.value;

    if (next !== conf) {
      if (errEl) {
        errEl.textContent = 'New passwords do not match.';
        errEl.style.display = 'block';
      }
      return;
    }

    if (saveBtn) saveBtn.disabled = true;

    try {
      const res = await API.changePassword(curr, next);
      if (res.success) {
        if (succEl) {
          succEl.textContent = 'Password updated successfully!';
          succEl.style.display = 'block';
        }
        currInput.value = '';
        newInput.value = '';
        confInput.value = '';
        Drive.showToast('Password updated successfully!');
      } else {
        if (errEl) {
          errEl.textContent = res.error || 'Failed to update password.';
          errEl.style.display = 'block';
        }
      }
    } catch (err) {
      if (errEl) {
        errEl.textContent = err.message || 'Failed to update password.';
        errEl.style.display = 'block';
      }
    } finally {
      if (saveBtn) saveBtn.disabled = false;
    }
  },

  async handleEmptyTrash() {
    if (!confirm('Are you sure you want to permanently delete all items in Trash? This cannot be undone.')) {
      return;
    }

    try {
      const res = await API.emptyTrash();
      if (res.success) {
        Drive.showToast(`Trash emptied! Purged ${res.deleted_count || 0} item(s).`);
        await this.loadStats();
        if (Drive.currentNav === 'trash') {
          Drive.reload();
        }
      } else {
        Drive.showToast(res.error || 'Failed to empty trash', 'error');
      }
    } catch (err) {
      Drive.showToast(err.message || 'Failed to empty trash', 'error');
    }
  },

  async loadWebhooks() {
    const listEl = document.getElementById('webhooks-list');
    if (!listEl) return;
    listEl.innerHTML = '<div class="empty-state-sm" style="color: var(--text-secondary); font-size: 13px; padding: 12px 0;">Loading webhooks...</div>';

    try {
      const res = await API.getWebhooks();
      if (!res.success || !res.webhooks || !res.webhooks.length) {
        listEl.innerHTML = `
          <div style="text-align: center; padding: 24px 12px; color: var(--text-secondary); font-size: 13px;">
            No webhooks configured yet. Register a Discord or Slack endpoint above to receive event alerts.
          </div>
        `;
        return;
      }

      listEl.innerHTML = res.webhooks.map(wh => {
        const events = (wh.events || []).map(e => `<span class="webhook-event-pill">${this.escapeHtml(e)}</span>`).join(' ');
        const secretDisplay = wh.secret ? 'Signed HMAC' : 'No Secret';
        return `
          <div class="webhook-item-card" data-id="${wh.id}">
            <div class="webhook-item-header">
              <div class="webhook-item-name">${this.escapeHtml(wh.name || 'Webhook')}</div>
              <div class="webhook-item-status">Active</div>
            </div>
            <div class="webhook-item-url" title="${this.escapeHtml(wh.url)}">${this.escapeHtml(wh.url)}</div>
            <div class="webhook-item-footer">
              <div class="webhook-item-events">${events} &bull; <span style="font-size: 11px; color: var(--text-secondary);">${secretDisplay}</span></div>
              <div class="webhook-item-actions">
                <button type="button" class="btn-text" style="font-size: 12px; padding: 4px 10px;" onclick="Settings.testWebhook('${wh.id}')">Test Ping</button>
                <button type="button" class="btn-text" style="font-size: 12px; padding: 4px 10px; color: #ea4335;" onclick="Settings.deleteWebhook('${wh.id}')">Delete</button>
              </div>
            </div>
          </div>
        `;
      }).join('');
    } catch (err) {
      listEl.innerHTML = `<div style="color: #ea4335; font-size: 13px; padding: 12px 0;">Failed to load webhooks: ${this.escapeHtml(err.message)}</div>`;
    }
  },

  async saveWebhook() {
    const nameInput = document.getElementById('webhook-name-input');
    const urlInput = document.getElementById('webhook-url-input');
    const secretInput = document.getElementById('webhook-secret-input');
    const evtUpload = document.getElementById('wh-evt-upload');
    const evtDelete = document.getElementById('wh-evt-delete');
    const evtShare = document.getElementById('wh-evt-share');

    const name = nameInput ? nameInput.value.trim() : '';
    const url = urlInput ? urlInput.value.trim() : '';
    const secret = secretInput ? secretInput.value.trim() : '';

    if (!url) {
      Drive.showToast('Please enter a payload URL', 'error');
      return;
    }
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      Drive.showToast('Payload URL must start with http:// or https://', 'error');
      return;
    }

    const events = [];
    if (evtUpload && evtUpload.checked) events.push('file.uploaded');
    if (evtDelete && evtDelete.checked) events.push('file.deleted');
    if (evtShare && evtShare.checked) events.push('file.shared');
    if (!events.length) events.push('file.uploaded');

    try {
      const res = await API.createWebhook(name || 'Webhook Endpoint', url, secret, events);
      if (res.success) {
        Drive.showToast('Webhook integration registered successfully!');
        if (nameInput) nameInput.value = '';
        if (urlInput) urlInput.value = '';
        if (secretInput) secretInput.value = '';
        await this.loadWebhooks();
      } else {
        Drive.showToast(res.error || 'Failed to save webhook', 'error');
      }
    } catch (err) {
      Drive.showToast(err.message || 'Failed to save webhook', 'error');
    }
  },

  async testWebhook(webhookId) {
    Drive.showToast('Dispatching test ping to webhook...');
    try {
      const res = await API.testWebhook(webhookId);
      if (res.success) {
        Drive.showToast('Test ping sent successfully!');
      } else {
        Drive.showToast(res.error || 'Test ping failed', 'error');
      }
    } catch (err) {
      Drive.showToast(err.message || 'Failed to ping webhook', 'error');
    }
  },

  async deleteWebhook(webhookId) {
    if (!confirm('Are you sure you want to delete this webhook integration?')) return;
    try {
      const res = await API.deleteWebhook(webhookId);
      if (res.success) {
        Drive.showToast('Webhook deleted.');
        await this.loadWebhooks();
      } else {
        Drive.showToast(res.error || 'Failed to delete webhook', 'error');
      }
    } catch (err) {
      Drive.showToast(err.message || 'Failed to delete webhook', 'error');
    }
  },

  escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
};
