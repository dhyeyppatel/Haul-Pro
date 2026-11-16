// Haul Pro - In-App File Viewer Controller

const Viewer = {
  activeFile: null,
  currentZoom: 1,

  init() {
    const closeBtn = document.getElementById('viewer-close-btn');
    const downloadBtn = document.getElementById('viewer-download-btn');
    const copyLinkBtn = document.getElementById('viewer-copy-link-btn');
    const zoomInBtn = document.getElementById('viewer-zoom-in');
    const zoomOutBtn = document.getElementById('viewer-zoom-out');
    const zoomResetBtn = document.getElementById('viewer-zoom-reset');

    if (closeBtn) closeBtn.addEventListener('click', () => this.close());
    if (downloadBtn) downloadBtn.addEventListener('click', () => this.download());
    if (copyLinkBtn) copyLinkBtn.addEventListener('click', () => this.copyLink());
    if (zoomInBtn) zoomInBtn.addEventListener('click', () => this.zoom(0.2));
    if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => this.zoom(-0.2));
    if (zoomResetBtn) zoomResetBtn.addEventListener('click', () => this.resetZoom());

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen()) {
        this.close();
      }
    });
  },

  isOpen() {
    const modal = document.getElementById('viewer-modal');
    return modal && modal.classList.contains('open');
  },

  open(file) {
    this.activeFile = file;
    this.currentZoom = 1;

    const modal = document.getElementById('viewer-modal');
    const filenameEl = document.getElementById('viewer-filename');
    const bodyEl = document.getElementById('viewer-body');
    const zoomControls = document.getElementById('viewer-zoom-controls');

    filenameEl.textContent = file.name;
    bodyEl.innerHTML = '';
    zoomControls.style.display = 'none';

    const category = file.category;
    const url = file.hosted_url;

    if (category === 'image') {
      zoomControls.style.display = 'flex';
      bodyEl.innerHTML = `<img id="viewer-img-el" class="viewer-image" src="${url}" alt="${file.name}" referrerpolicy="no-referrer">`;
    } else if (category === 'book' || file.extension === 'pdf') {
      bodyEl.innerHTML = `<iframe class="viewer-pdf-frame" src="${url}#toolbar=1&navpanes=1"></iframe>`;
    } else if (category === 'video') {
      bodyEl.innerHTML = `
        <video class="viewer-video" controls autoplay>
          <source src="${url}" type="${file.mime_type || 'video/mp4'}">
          Your browser does not support video playback.
        </video>
      `;
    } else if (category === 'audio') {
      bodyEl.innerHTML = `
        <div class="viewer-audio-card">
          <div style="font-size: 16px; font-weight: 500; color: white;">${file.name}</div>
          <audio class="viewer-audio-player" controls autoplay>
            <source src="${url}" type="${file.mime_type || 'audio/mpeg'}">
          </audio>
        </div>
      `;
    } else if (category === 'code' || ['txt', 'md', 'json', 'js', 'py', 'sh', 'bat', 'csv', 'log'].includes(file.extension)) {
      bodyEl.innerHTML = `
        <div class="viewer-code-card">
          <div class="viewer-code-header">
            <span>${file.name}</span>
            <span>${file.extension.toUpperCase()}</span>
          </div>
          <div class="viewer-code-content" id="viewer-code-content">Loading file content...</div>
        </div>
      `;
      fetch(url)
        .then(r => r.text())
        .then(text => {
          const el = document.getElementById('viewer-code-content');
          if (el) el.textContent = text;
        })
        .catch(() => {
          const el = document.getElementById('viewer-code-content');
          if (el) el.textContent = 'Could not load text preview. Click download to view the file.';
        });
    } else {
      // Generic binary
      bodyEl.innerHTML = `
        <div class="viewer-binary-card">
          ${getFileIcon(file.category, file.extension)}
          <div style="font-size: 16px; font-weight: 500;">${file.name}</div>
          <div style="font-size: 13px; color: #9aa0a6;">${Auth.formatBytes(file.size)} &bull; ${file.extension.toUpperCase()} File</div>
          <a href="${url}" download="${file.name}" style="background: #1a73e8; color: white; padding: 10px 24px; border-radius: 20px; text-decoration: none; font-size: 14px; font-weight: 500; margin-top: 12px; display: inline-block;">Download File</a>
        </div>
      `;
    }

    modal.classList.add('open');
  },

  zoom(delta) {
    this.currentZoom = Math.max(0.4, Math.min(3.5, this.currentZoom + delta));
    const img = document.getElementById('viewer-img-el');
    if (img) img.style.transform = `scale(${this.currentZoom})`;
  },

  resetZoom() {
    this.currentZoom = 1;
    const img = document.getElementById('viewer-img-el');
    if (img) img.style.transform = `scale(1)`;
  },

  close() {
    const modal = document.getElementById('viewer-modal');
    const bodyEl = document.getElementById('viewer-body');
    if (bodyEl) bodyEl.innerHTML = ''; // Stop audio/video
    if (modal) modal.classList.remove('open');
    this.activeFile = null;
  },

  download() {
    if (!this.activeFile || !this.activeFile.hosted_url) return;
    const a = document.createElement('a');
    a.href = this.activeFile.hosted_url;
    a.download = this.activeFile.name;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  },

  copyLink() {
    if (!this.activeFile || !this.activeFile.hosted_url) return;
    navigator.clipboard.writeText(this.activeFile.hosted_url).then(() => {
      alert('Link copied to clipboard: ' + this.activeFile.hosted_url);
    });
  }
};
