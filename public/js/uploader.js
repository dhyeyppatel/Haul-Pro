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
      e.preventDefault();
      dragCounter++;
      if (overlay) overlay.classList.add('active');
    });

    window.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0 && overlay) {
        overlay.classList.remove('active');
        dragCounter = 0;
      }
    });

    window.addEventListener('dragover', (e) => {
      e.preventDefault();
    });

    window.addEventListener('drop', (e) => {
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
        Drive.promptNewFolder();
      });
    }
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
        <span class="upload-item-name">${file.name}</span>
        <span class="upload-item-status" style="font-size: 12px; color: #1a73e8;">0%</span>
      `;
      if (listEl) listEl.appendChild(itemEl);

      const statusEl = itemEl.querySelector('.upload-item-status');

      try {
        await API.uploadFiles([file], Drive.currentFolderId, (percent) => {
          if (statusEl) statusEl.textContent = `${percent}%`;
        });
        if (statusEl) {
          statusEl.innerHTML = `<span style="color: #34a853;">${Icons.check}</span>`;
        }
      } catch (err) {
        if (statusEl) {
          statusEl.innerHTML = `<span style="color: #ea4335; font-size: 11px;">Failed</span>`;
        }
      }
    }

    if (countEl) countEl.textContent = 'Uploads completed';
    // Refresh drive contents and user storage usage
    Drive.reload();
    Auth.checkSession();
  }
};
