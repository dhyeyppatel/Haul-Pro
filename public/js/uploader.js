// Haul Pro - File Upload Controller

const Uploader = {
  activeUploads: [],

  init() {
    this.bindDropzone();
    this.bindFileInputs();
  },

  bindDropzone() {
    const overlay = document.getElementById('dropzone-overlay');
    let dragCounter = 0;

    window.addEventListener('dragenter', (e) => {
      // Do not trigger file drop overlay if dragging internal drive items
      if (Drive.draggedFileId || !e.dataTransfer.types.includes('Files')) return;
      e.preventDefault();
      dragCounter++;
      if (overlay) overlay.classList.add('active');
    });

    window.addEventListener('dragleave', (e) => {
      if (Drive.draggedFileId) return;
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0 && overlay) {
        overlay.classList.remove('active');
        dragCounter = 0;
      }
    });

    window.addEventListener('dragover', (e) => {
      if (Drive.draggedFileId || !e.dataTransfer.types.includes('Files')) return;
      e.preventDefault();
    });

    window.addEventListener('drop', (e) => {
      if (Drive.draggedFileId) return;
      e.preventDefault();
      dragCounter = 0;
      if (overlay) overlay.classList.remove('active');

      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
        this.handleFiles(e.dataTransfer.files);
      }
    });
  },

  bindFileInputs() {
    const fileInput = document.getElementById('file-upload-input');
    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length) {
          this.handleFiles(e.target.files);
          e.target.value = ''; // Reset
        }
      });
    }

    const newBtn = document.getElementById('new-btn');
    const dropdown = document.getElementById('new-dropdown-menu');

    if (newBtn && dropdown) {
      newBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isShown = dropdown.style.display === 'block';
        dropdown.style.display = isShown ? 'none' : 'block';
        const rect = newBtn.getBoundingClientRect();
        dropdown.style.top = `${rect.bottom + 6}px`;
        dropdown.style.left = `${rect.left}px`;
      });

      document.addEventListener('click', () => {
        dropdown.style.display = 'none';
      });
    }

    const menuUploadFile = document.getElementById('menu-upload-file');
    if (menuUploadFile && fileInput) {
      menuUploadFile.addEventListener('click', () => {
        fileInput.click();
      });
    }

    const menuNewFolder = document.getElementById('menu-new-folder');
    if (menuNewFolder) {
      menuNewFolder.addEventListener('click', () => {
        Drive.openNewFolderModal();
      });
    }

    const menuUploadUrl = document.getElementById('menu-upload-url');
    if (menuUploadUrl) {
      menuUploadUrl.addEventListener('click', () => {
        this.openUrlUploadModal();
      });
    }
  },

  openUrlUploadModal() {
    const modal = document.getElementById('url-upload-modal');
    const input = document.getElementById('url-upload-input');
    if (input) input.value = '';
    if (modal) modal.style.display = 'flex';
    if (input) setTimeout(() => input.focus(), 60);
  },

  closeUrlUploadModal() {
    const modal = document.getElementById('url-upload-modal');
    if (modal) modal.style.display = 'none';
  },

  async submitUrlUpload() {
    const input = document.getElementById('url-upload-input');
    const btn = document.getElementById('url-upload-submit-btn');
    const url = input ? input.value.trim() : '';

    if (!url) {
      Drive.showToast('Please enter a valid media or file URL', 'error');
      return;
    }
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      Drive.showToast('URL must start with http:// or https://', 'error');
      return;
    }

    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Hosting...';
    }

    try {
      this.closeUrlUploadModal();
      await this.handleUrlUpload(url);
    } catch (e) {
      // toast already shown in handleUrlUpload
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Upload';
      }
    }
  },

  parseLaymanReason(err, file) {
    if (!navigator.onLine) {
      return "No internet connection";
    }
    const msg = (err && err.message) ? err.message : "";
    const lower = msg.toLowerCase();

    // Check size limit: Cloudflare Edge Direct Upload supports large files
    if (file && file.size > 100 * 1024 * 1024) {
      return "File exceeds 100 MB limit";
    }
    if (lower.includes("100 mb") || lower.includes("413") || lower.includes("payload") || lower.includes("too large")) {
      return "File exceeds storage limit";
    }
    if (lower.includes("quota") || lower.includes("storage limit") || lower.includes("full")) {
      return "Storage quota full (15 GB)";
    }
    if (lower.includes("network") || lower.includes("connection")) {
      return "Connection lost during upload";
    }
    if (lower.includes("timeout") || lower.includes("504")) {
      return "Upload timed out - please retry";
    }
    if (lower.includes("busy") || lower.includes("502") || lower.includes("rejected")) {
      return "Storage server busy - please retry";
    }
    if (lower.includes("unauthorized") || lower.includes("401")) {
      return "Session expired - please log in";
    }
    if (msg && msg.length < 35 && !msg.includes("<")) {
      return msg;
    }
    return "Upload failed - please retry";
  },

  async handleFiles(fileList) {
    const drawer = document.getElementById('upload-drawer');
    const listEl = document.getElementById('upload-drawer-list');
    const countEl = document.getElementById('upload-drawer-count');

    if (drawer) drawer.style.display = 'block';

    const files = Array.from(fileList);
    if (countEl) countEl.textContent = `Uploading ${files.length} item${files.length > 1 ? 's' : ''}`;

    for (const file of files) {
      const itemEl = document.createElement('div');
      itemEl.className = 'upload-drawer-item';
      itemEl.innerHTML = `
        <div class="upload-item-header">
          <span class="upload-item-name" title="${file.name}">${file.name}</span>
          <span class="upload-item-status">0%</span>
        </div>
        <div class="upload-progress-track">
          <div class="upload-progress-fill" style="width: 0%;"></div>
        </div>
      `;
      if (listEl) listEl.appendChild(itemEl);

      const statusEl = itemEl.querySelector('.upload-item-status');
      const fillEl = itemEl.querySelector('.upload-progress-fill');

      try {
        const uploadRes = await API.uploadFileDirect(file, Drive.currentFolderId, (percent) => {
          const p = Math.min(100, Math.max(0, percent));
          if (statusEl) statusEl.textContent = `${p}%`;
          if (fillEl) fillEl.style.width = `${p}%`;
        });
        if (statusEl) {
          statusEl.innerHTML = `<span style="color: #34a853;">${Icons.check}</span>`;
        }
        if (fillEl) {
          fillEl.style.width = '100%';
          fillEl.style.backgroundColor = '#34a853';
        }
        const uploadedFile = (uploadRes && (uploadRes.file || (uploadRes.files && uploadRes.files[0])));
        if (uploadedFile && uploadedFile.hosted_url) {
          if (typeof Settings !== 'undefined' && Settings.preferences.autoCopy) {
            navigator.clipboard.writeText(uploadedFile.hosted_url).then(() => {
              Drive.showToast('Media link copied to clipboard!');
            }).catch(() => {});
          }
        }
      } catch (err) {
        const laymanReason = this.parseLaymanReason(err, file);
        if (statusEl) {
          statusEl.innerHTML = `<span class="upload-fail-badge" title="${laymanReason}">Failed: ${laymanReason}</span>`;
        }
        if (fillEl) {
          fillEl.style.width = '100%';
          fillEl.style.backgroundColor = '#ea4335';
        }
        Drive.showToast(`Upload failed for "${file.name}": ${laymanReason}`, 'error');
      }
    }

    if (countEl) countEl.textContent = 'Uploads completed';
    // Refresh drive contents and user storage usage
    Drive.reload();
    Auth.checkSession();
  },

  async handleUrlUpload(remoteUrl) {
    if (!remoteUrl || !remoteUrl.trim()) return;
    Drive.showToast('Fetching and hosting remote URL...');
    try {
      const res = await API.uploadFromUrl(remoteUrl.trim(), Drive.currentFolderId);
      Drive.showToast('Remote file hosted successfully!');
      Drive.reload();
      if (Auth && Auth.checkSession) Auth.checkSession();
      return res;
    } catch (err) {
      Drive.showToast(err.message || 'Failed to upload from remote URL', 'error');
      throw err;
    }
  }
};
