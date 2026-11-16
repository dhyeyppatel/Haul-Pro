// Haul Pro - Apple Style Settings & Preferences Controller
// Pure Vanilla JavaScript (ES6+), Zero Emojis

const Settings = {
  preferences: {
    defaultView: 'grid',
    defaultVisibility: 'private',
    autoCopy: true
  },
  currentTab: 'general',

  init() {
    this.loadLocalPreferences();
    this.bindEvents();
  },

  loadLocalPreferences() {
    try {
      const saved = localStorage.getItem('haul_preferences');
      if (saved) {
        this.preferences = Object.assign(this.preferences, JSON.parse(saved));
      }
    } catch (e) {
      // Ignore storage errors
    }
    this.applyPreferencesUI();
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

    // Developer copy buttons
    const copyApiKeyBtn = document.getElementById('copy-api-key-btn');
    if (copyApiKeyBtn) {
      copyApiKeyBtn.addEventListener('click', () => {
        const keyEl = document.getElementById('dev-api-key');
        if (keyEl) {
          navigator.clipboard.writeText(keyEl.textContent.trim()).then(() => {
            Drive.showToast('Developer API key copied to clipboard!');
          });
        }
      });
    }

    const copySharexBtn = document.getElementById('copy-sharex-url-btn');
    if (copySharexBtn) {
      copySharexBtn.addEventListener('click', () => {
        const url = `${window.location.origin}/api/1/upload`;
        navigator.clipboard.writeText(url).then(() => {
          Drive.showToast('ShareX endpoint URL copied to clipboard!');
        });
      });
    }
  },

  async open() {
    const modal = document.getElementById('settings-modal');
    if (!modal) return;
    modal.style.display = 'flex';
    this.switchTab(this.currentTab || 'general');
    await this.loadStats();
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

      // Update trash info
      const trashInfo = document.getElementById('settings-trash-info');
      if (trashInfo) {
        const trashBytes = data.trashed_bytes || 0;
        const trashCount = data.trashed_count || 0;
        trashInfo.textContent = trashCount > 0
          ? `${trashCount} item${trashCount === 1 ? '' : 's'} (${Auth.formatBytes(trashBytes)}) in trash ready to be purged.`
          : 'Trash is empty. No storage to reclaim.';
      }

      // Update API Key & Media Server URL if returned
      if (data.api_key) {
        const keyEl = document.getElementById('dev-api-key');
        if (keyEl) keyEl.textContent = data.api_key;
      }
      if (data.media_host_url) {
        const srvEl = document.getElementById('dev-server-url');
        if (srvEl) srvEl.textContent = data.media_host_url;
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
  }
};
