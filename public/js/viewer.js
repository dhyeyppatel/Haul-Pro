// Haul Pro - In-App File Viewer Controller & Universal File Engine

const Viewer = {
  activeFile: null,
  activeRawText: '',
  activeMode: 'preview', // 'preview' or 'raw'
  isEditMode: false,
  isWordWrapped: false,
  currentZoom: 1,
  panX: 0,
  panY: 0,
  isPanning: false,
  startX: 0,
  startY: 0,
  isAudioPlaying: false,

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

    // Audio element global events
    const audioEl = document.getElementById('global-audio-element');
    if (audioEl) {
      audioEl.addEventListener('timeupdate', () => this.onAudioTimeUpdate());
      audioEl.addEventListener('ended', () => this.onAudioEnded());
      audioEl.addEventListener('play', () => this.onAudioPlayState(true));
      audioEl.addEventListener('pause', () => this.onAudioPlayState(false));
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen()) {
        this.close();
      }
    });

    // Close on clicking backdrop outside card
    const modal = document.getElementById('viewer-modal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal || e.target.id === 'viewer-body' || e.target.classList.contains('viewer-image-wrapper')) {
          this.close();
        }
      });
    }

    // Window mouse pan events (registered once)
    window.addEventListener('mousemove', (e) => {
      if (!this.isPanning) return;
      this.panX = e.clientX - this.startX;
      this.panY = e.clientY - this.startY;
      this.applyImageTransform();
    });

    window.addEventListener('mouseup', () => {
      this.isPanning = false;
    });
  },

  isOpen() {
    const modal = document.getElementById('viewer-modal');
    return modal && modal.classList.contains('open');
  },

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  open(file) {
    if (!file) return;

    // Check if file is E2EE encrypted
    if (file.is_encrypted) {
      Drive.promptE2EEDecrypt(file);
      return;
    }

    this.activeFile = file;
    this.activeRawText = '';
    this.activeMode = 'preview';
    this.isEditMode = false;
    this.isWordWrapped = false;
    this.currentZoom = 1;
    this.panX = 0;
    this.panY = 0;

    const modal = document.getElementById('viewer-modal');
    const filenameEl = document.getElementById('viewer-filename');
    const metaBadge = document.getElementById('viewer-meta-badge');
    const modeSwitch = document.getElementById('viewer-mode-switch');
    const bodyEl = document.getElementById('viewer-body');
    const zoomControls = document.getElementById('viewer-zoom-controls');
    const editBtn = document.getElementById('viewer-edit-btn');
    const saveBtn = document.getElementById('viewer-save-btn');

    if (filenameEl) filenameEl.textContent = file.name || 'File Preview';
    if (bodyEl) {
      bodyEl.innerHTML = '';
      bodyEl.scrollTop = 0;
      bodyEl.scrollLeft = 0;
      bodyEl.style.overflow = '';
    }
    if (zoomControls) zoomControls.style.display = 'none';
    if (metaBadge) metaBadge.style.display = 'none';
    if (modeSwitch) {
      modeSwitch.style.display = 'none';
      modeSwitch.innerHTML = '';
    }
    if (editBtn) {
      editBtn.style.display = 'none';
      const lbl = editBtn.querySelector('span:not([id])');
      if (lbl) lbl.textContent = 'Edit';
    }
    if (saveBtn) saveBtn.style.display = 'none';

    const ext = (file.extension || (file.name ? file.name.split('.').pop() : '')).toLowerCase();
    const url = file.hosted_url || '';

    // Extension & Type Classification
    const isImage = file.category === 'image' || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif', 'tiff'].includes(ext);
    const isPdf = ext === 'pdf' || file.category === 'book';
    const isOffice = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'rtf'].includes(ext);
    const isMarkdown = ['md', 'markdown', 'mdown'].includes(ext);
    const isCsv = ['csv', 'tsv'].includes(ext);
    const isCode = file.category === 'code' || ['js', 'jsx', 'ts', 'tsx', 'html', 'htm', 'css', 'scss', 'json', 'json5', 'jsonc', 'py', 'pyw', 'java', 'c', 'cpp', 'cc', 'cxx', 'h', 'hpp', 'cs', 'go', 'rs', 'php', 'rb', 'lua', 'swift', 'kt', 'kts', 'dart', 'scala', 'r', 'pl', 'pm', 'sh', 'bash', 'zsh', 'fish', 'bat', 'cmd', 'ps1', 'psm1', 'vbs', 'sql', 'xml', 'yaml', 'yml', 'toml', 'dockerfile', 'makefile', 'graphql', 'vue', 'svelte'].includes(ext);
    const isPlainText = ['txt', 'log', 'out', 'err', 'diff', 'patch', 'env', 'ini', 'conf', 'cfg', 'reg', 'properties', 'gitignore', 'gitattributes', 'editorconfig'].includes(ext);
    const isVideo = file.category === 'video' || ['mp4', 'webm', 'mkv', 'mov', 'avi', 'flv', 'wmv'].includes(ext);
    const isAudio = file.category === 'audio' || ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'opus'].includes(ext);

    // Update Header Metadata Badge
    if (metaBadge) {
      metaBadge.style.display = 'inline-flex';
      metaBadge.textContent = `${ext.toUpperCase()} • ${Auth.formatBytes(file.size || 0)}`;
    }

    // Allow inline editing for text/markdown/code if owner
    const canEdit = !Drive.isPublicMode || Drive.isOwnerMode;
    if (editBtn && canEdit && (isMarkdown || isCode || isPlainText)) {
      editBtn.style.display = 'inline-flex';
    }

    // 1. IMAGE PREVIEW
    if (isImage) {
      if (zoomControls) zoomControls.style.display = 'flex';
      bodyEl.style.overflow = 'hidden';
      bodyEl.innerHTML = `
        <div class="viewer-image-wrapper">
          <img id="viewer-img-el" class="viewer-image" src="${url}" alt="${this.escapeHtml(file.name)}" referrerpolicy="no-referrer">
        </div>
      `;
      this.resetZoom();
      this.attachImagePan(bodyEl.querySelector('#viewer-img-el'));
    } 
    // 2. PDF VIEWER
    else if (isPdf) {
      bodyEl.innerHTML = `
        <iframe class="viewer-pdf-frame" src="${url}#toolbar=1&navpanes=1" frameborder="0"></iframe>
      `;
    } 
    // 3. OFFICE DOCUMENT VIEWER (Word, Excel, PowerPoint)
    else if (isOffice) {
      this.renderOfficeDocument(bodyEl, file, url, ext);
    } 
    // 4. MARKDOWN DOCUMENT VIEWER (Formatted Document vs Raw Source)
    else if (isMarkdown) {
      this.setupModeSwitch(modeSwitch, [
        { id: 'preview', label: 'Preview Document', active: true },
        { id: 'raw', label: 'Raw Markdown', active: false }
      ]);
      this.loadTextContent(url, (text) => {
        this.activeRawText = text;
        this.renderMarkdownView(bodyEl, text, file);
      });
    } 
    // 5. CSV / TSV DATA TABLE VIEWER (Table View vs Raw Data)
    else if (isCsv) {
      this.setupModeSwitch(modeSwitch, [
        { id: 'preview', label: 'Table View', active: true },
        { id: 'raw', label: 'Raw CSV', active: false }
      ]);
      this.loadTextContent(url, (text) => {
        this.activeRawText = text;
        this.renderCsvTableView(bodyEl, text, file, ext);
      });
    } 
    // 6. CODE & SCRIPT VIEWER (Syntax Highlights & Line Numbers)
    else if (isCode) {
      this.loadTextContent(url, (text) => {
        this.activeRawText = text;
        this.renderCodeView(bodyEl, text, file, ext);
      });
    } 
    // 7. PLAIN TEXT & LOG VIEWER (Document Paper View)
    else if (isPlainText || file.category === 'document') {
      this.loadTextContent(url, (text) => {
        this.activeRawText = text;
        this.renderPlainTextView(bodyEl, text, file, ext);
      });
    } 
    // 8. VIDEO PLAYER
    else if (isVideo) {
      bodyEl.innerHTML = `
        <video class="viewer-video" controls autoplay playsinline>
          <source src="${url}" type="${file.mime_type || 'video/mp4'}">
          Your browser does not support video playback.
        </video>
      `;
    } 
    // 9. AUDIO PLAYER & FLOATING MINI PLAYER
    else if (isAudio) {
      this.audioPlay(file);
      bodyEl.innerHTML = `
        <div class="viewer-audio-card" style="text-align: center; padding: 40px 24px; max-width: 440px; margin: auto; background: rgba(255,255,255,0.06); border-radius: 18px; border: 1px solid rgba(255,255,255,0.12); box-shadow: 0 16px 40px rgba(0,0,0,0.5);">
          <div class="viewer-audio-icon" style="background: rgba(26, 115, 232, 0.2); color: #60a5fa; width: 68px; height: 68px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 16px;">
            ${Icons.music}
          </div>
          <div class="viewer-audio-title" style="font-size: 16px; font-weight: 700; margin-bottom: 6px; color: #fff;">${this.escapeHtml(file.name)}</div>
          <div style="font-size: 12px; color: #9aa0a6; margin-bottom: 24px;">Active in Floating Audio Mini Player</div>
          <button type="button" class="btn-filled" onclick="Viewer.close()" style="border-radius: 20px; padding: 10px 28px; font-size: 13px;">Dock & Continue Browsing</button>
        </div>
      `;
    } 
    // 10. GENERIC BINARY / ARCHIVES
    else {
      bodyEl.innerHTML = `
        <div class="viewer-binary-card">
          <div style="transform: scale(1.6); margin-bottom: 8px;">
            ${getFileIcon(file.category, ext)}
          </div>
          <div class="viewer-binary-title">${this.escapeHtml(file.name)}</div>
          <div class="viewer-binary-meta">${Auth.formatBytes(file.size || 0)} &bull; ${ext.toUpperCase()} File</div>
          <a href="${url}" download="${this.escapeHtml(file.name)}" class="viewer-btn primary" style="padding: 10px 24px; height: auto; border-radius: 20px; font-size: 14px; text-decoration: none; margin-top: 8px;">
            Download File
          </a>
        </div>
      `;
    }

    if (modal) modal.classList.add('open');
  },

  // Setup Center Mode Switcher Tabs
  setupModeSwitch(container, tabs) {
    if (!container) return;
    container.style.display = 'flex';
    container.innerHTML = tabs.map(t => `
      <button class="viewer-mode-btn ${t.active ? 'active' : ''}" onclick="Viewer.switchMode('${t.id}')">
        <span>${t.label}</span>
      </button>
    `).join('');
  },

  switchMode(mode) {
    this.activeMode = mode;
    const btns = document.querySelectorAll('.viewer-mode-btn');
    btns.forEach(b => {
      b.classList.toggle('active', b.textContent.toLowerCase().includes(mode.toLowerCase()));
    });

    const bodyEl = document.getElementById('viewer-body');
    if (!bodyEl || !this.activeRawText || !this.activeFile) return;

    const ext = (this.activeFile.extension || '').toLowerCase();
    if (['md', 'markdown'].includes(ext)) {
      if (mode === 'preview') {
        this.renderMarkdownView(bodyEl, this.activeRawText, this.activeFile);
      } else {
        this.renderCodeView(bodyEl, this.activeRawText, this.activeFile, 'markdown');
      }
    } else if (['csv', 'tsv'].includes(ext)) {
      if (mode === 'preview') {
        this.renderCsvTableView(bodyEl, this.activeRawText, this.activeFile, ext);
      } else {
        this.renderCodeView(bodyEl, this.activeRawText, this.activeFile, 'csv');
      }
    }
  },

  loadTextContent(url, callback) {
    const bodyEl = document.getElementById('viewer-body');
    if (bodyEl) {
      bodyEl.innerHTML = `
        <div class="viewer-loading-state">
          <div class="viewer-spinner"></div>
          <div>Loading file content...</div>
        </div>
      `;
    }

    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then(text => {
        callback(text);
      })
      .catch(err => {
        if (bodyEl) {
          bodyEl.innerHTML = `
            <div class="viewer-binary-card">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ea4335" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <div class="viewer-binary-title">Could not load preview</div>
              <div class="viewer-binary-meta">${err.message || 'Network error fetching file content'}</div>
              <a href="${url}" download="${this.escapeHtml(this.activeFile?.name || 'file')}" class="viewer-btn primary" style="padding: 8px 20px; height: auto; border-radius: 20px; text-decoration: none;">Download File</a>
            </div>
          `;
        }
      });
  },

  // ==========================================
  // 1. MARKDOWN DOCUMENT FORMATTER & RENDERER
  // ==========================================
  renderMarkdownView(container, text, file) {
    const renderedHtml = this.parseMarkdown(text);
    container.innerHTML = `
      <div class="viewer-markdown-card">
        <div class="viewer-markdown-header">
          <div style="font-weight: 600; color: #1f2328;">${this.escapeHtml(file.name)}</div>
          <div style="display: flex; align-items: center; gap: 12px;">
            <span>${text.split('\n').length} lines</span>
            <span>&bull;</span>
            <span>${text.length.toLocaleString()} characters</span>
            <button class="viewer-btn" style="height: 28px; padding: 0 10px; font-size: 11px;" onclick="Viewer.copyAllText()">Copy Markdown</button>
          </div>
        </div>
        <div class="viewer-markdown-body" id="viewer-markdown-body">
          ${renderedHtml}
        </div>
      </div>
    `;
  },

  parseMarkdown(md) {
    if (!md) return '';

    // Safe HTML escape map
    let src = this.escapeHtml(md);

    // 1. Code blocks with ```lang
    const codeBlocks = [];
    src = src.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (match, lang, code) => {
      const idx = codeBlocks.length;
      codeBlocks.push({ lang: lang || 'text', code: code.trim() });
      return `@@@CODEBLOCK_${idx}@@@`;
    });

    // 2. Inline code
    src = src.replace(/`([^`\n]+)`/g, '<code>$1</code>');

    // 3. Headers
    src = src.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
    src = src.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
    src = src.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
    src = src.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
    src = src.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
    src = src.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');

    // 4. Horizontal rules
    src = src.replace(/^(?:---|\*\*\*|___)\s*$/gm, '<hr>');

    // 5. Blockquotes
    src = src.replace(/^>\s+(.+)$/gm, '<blockquote>$1</blockquote>');

    // 6. Bold, Italic, Strikethrough
    src = src.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    src = src.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    src = src.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    src = src.replace(/_([^_]+)_/g, '<em>$1</em>');
    src = src.replace(/~~([^~]+)~~/g, '<del>$1</del>');

    // 7. Markdown Tables
    src = src.replace(/((?:\|.+?\|\r?\n)+)/g, (tableMatch) => {
      const rows = tableMatch.trim().split('\n').map(r => r.trim());
      if (rows.length < 2) return tableMatch;

      let html = '<table>';
      let isHeader = true;

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (row.match(/^\|?\s*[-:]+[-| :]*\|?$/)) {
          isHeader = false;
          continue;
        }

        const cells = row.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
        if (isHeader) {
          html += '<thead><tr>' + cells.map(c => `<th>${c}</th>`).join('') + '</tr></thead><tbody>';
        } else {
          html += '<tr>' + cells.map(c => `<td>${c}</td>`).join('') + '</tr>';
        }
      }
      html += '</tbody></table>';
      return html;
    });

    // 8. Task lists and list items
    src = src.replace(/^\s*-\s+\[x\]\s+(.+)$/gm, '<li style="list-style:none;"><input type="checkbox" checked disabled> $1</li>');
    src = src.replace(/^\s*-\s+\[\s\]\s+(.+)$/gm, '<li style="list-style:none;"><input type="checkbox" disabled> $1</li>');
    src = src.replace(/^\s*[-*+]\s+(.+)$/gm, '<li>$1</li>');
    src = src.replace(/^\s*\d+\.\s+(.+)$/gm, '<li>$1</li>');

    // Wrap adjacent list items in <ul>
    src = src.replace(/((?:<li>.+?<\/li>\s*)+)/g, '<ul>$1</ul>');

    // 9. Links & Images
    src = src.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%; border-radius:6px; margin:12px 0;">');
    src = src.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');

    // 10. Paragraphs: double line breaks
    src = src.split(/\n\n+/).map(para => {
      para = para.trim();
      if (!para) return '';
      if (para.startsWith('<h') || para.startsWith('<table') || para.startsWith('<ul') || para.startsWith('<blockquote') || para.startsWith('<hr') || para.startsWith('@@@CODEBLOCK_')) {
        return para;
      }
      return `<p>${para.replace(/\n/g, '<br>')}</p>`;
    }).join('\n');

    // Restore Codeblocks
    codeBlocks.forEach((cb, idx) => {
      const codeHtml = `<pre><div class="code-header"><span>${cb.lang || 'code'}</span><button onclick="Viewer.copyCodeSnippet(this)">Copy</button></div><code>${cb.code}</code></pre>`;
      src = src.replace(`@@@CODEBLOCK_${idx}@@@`, codeHtml);
    });

    return src;
  },

  // ==========================================
  // 2. CSV / TSV INTERACTIVE DATA TABLE VIEWER
  // ==========================================
  renderCsvTableView(container, text, file, ext) {
    const separator = ext === 'tsv' ? '\t' : ',';
    const lines = text.trim().split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) {
      container.innerHTML = '<div style="color:white;">File is empty.</div>';
      return;
    }

    const parseRow = (line) => {
      if (separator === '\t') return line.split('\t');
      const cells = [];
      let inQuote = false;
      let cur = '';
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
          inQuote = !inQuote;
        } else if (c === ',' && !inQuote) {
          cells.push(cur.trim());
          cur = '';
        } else {
          cur += c;
        }
      }
      cells.push(cur.trim());
      return cells;
    };

    const headerCells = parseRow(lines[0]);
    const totalCols = headerCells.length;
    const totalRows = lines.length - 1;

    let tableRows = '';
    const maxRender = Math.min(lines.length, 500); // Render up to 500 rows smoothly

    for (let i = 1; i < maxRender; i++) {
      const cells = parseRow(lines[i]);
      tableRows += `
        <tr>
          <td class="row-idx">${i}</td>
          ${cells.map(c => `<td>${this.escapeHtml(c.replace(/^"|"$/g, ''))}</td>`).join('')}
        </tr>
      `;
    }

    container.innerHTML = `
      <div class="viewer-table-card">
        <div class="viewer-table-toolbar">
          <div style="font-weight: 600; font-size: 13px; color: #1f2328;">
            ${this.escapeHtml(file.name)} 
            <span style="font-weight: 400; color: #5f6368; margin-left: 8px;">(${totalRows.toLocaleString()} rows &bull; ${totalCols} columns)</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px;">
            <input type="text" class="viewer-table-search" placeholder="Filter rows..." oninput="Viewer.filterTableRows(this.value)">
            <button class="viewer-btn" onclick="Viewer.copyAllText()" style="height: 30px; font-size: 11px; padding: 0 10px;">Copy CSV</button>
          </div>
        </div>
        <div class="viewer-table-wrapper">
          <table class="viewer-data-table" id="viewer-active-table">
            <thead>
              <tr>
                <th class="row-idx">#</th>
                ${headerCells.map(h => `<th>${this.escapeHtml(h.replace(/^"|"$/g, ''))}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
          ${lines.length > 500 ? `<div style="padding: 12px; font-size: 12px; color: #70757a; text-align: center; background: #fafafa;">Showing first 500 rows of ${lines.length.toLocaleString()} total rows. Download file for complete dataset.</div>` : ''}
        </div>
      </div>
    `;
  },

  filterTableRows(query) {
    const q = (query || '').toLowerCase();
    const rows = document.querySelectorAll('#viewer-active-table tbody tr');
    rows.forEach(r => {
      const text = r.textContent.toLowerCase();
      r.style.display = text.includes(q) ? '' : 'none';
    });
  },

  // ==========================================
  // 3. CODE & SCRIPT VIEWER (With Line Numbers)
  // ==========================================
  renderCodeView(container, text, file, ext) {
    const lines = text.split('\n');
    const gutterHtml = lines.map((_, i) => `<div>${i + 1}</div>`).join('');
    const highlightedCode = this.colorizeCode(text, ext);

    container.innerHTML = `
      <div class="viewer-code-card">
        <div class="viewer-code-toolbar">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="color: #fff; font-weight: 600;">${this.escapeHtml(file.name)}</span>
            <span style="background: rgba(255,255,255,0.1); padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 700; color: #61afef;">${ext.toUpperCase()}</span>
          </div>
          <div style="display: flex; align-items: center; gap: 12px;">
            <span>${lines.length.toLocaleString()} lines</span>
            <span>&bull;</span>
            <span>${text.length.toLocaleString()} characters</span>
            <button id="viewer-wrap-btn" class="viewer-btn" style="height: 28px; padding: 0 10px; font-size: 11px;" onclick="Viewer.toggleWordWrap()">Wrap Lines</button>
            <button class="viewer-btn primary" style="height: 28px; padding: 0 12px; font-size: 11px;" onclick="Viewer.copyAllText(this)">Copy Code</button>
          </div>
        </div>
        <div class="viewer-code-container">
          <div class="viewer-code-gutter">${gutterHtml}</div>
          <pre id="viewer-code-content" class="viewer-code-content ${this.isWordWrapped ? 'wrap-lines' : ''}">${highlightedCode}</pre>
        </div>
      </div>
    `;
  },

  colorizeCode(text, ext) {
    if (!text) return '';
    const pythonKeywords = new Set([
      'def', 'class', 'import', 'from', 'as', 'return', 'if', 'elif', 'else', 'while',
      'for', 'in', 'try', 'except', 'finally', 'raise', 'with', 'pass', 'lambda', 'yield',
      'self', 'cls', 'True', 'False', 'None', 'async', 'await', 'global', 'nonlocal', 'assert', 'break', 'continue', 'del', 'is', 'not', 'and', 'or'
    ]);
    const generalKeywords = new Set([
      'const', 'let', 'var', 'function', 'return', 'if', 'else', 'import', 'export', 'from',
      'as', 'class', 'default', 'async', 'await', 'public', 'private', 'protected', 'static',
      'void', 'true', 'false', 'null', 'undefined', 'try', 'catch', 'finally', 'while', 'for',
      'in', 'of', 'switch', 'case', 'new', 'this', 'super', 'interface', 'type', 'extends', 'implements',
      'struct', 'enum', 'package', 'func', 'mut', 'impl', 'trait', 'val', 'when'
    ]);
    const isPy = ext === 'py' || ext === 'python';
    const kwSet = isPy ? pythonKeywords : generalKeywords;

    const lines = text.split('\n');
    const processedLines = lines.map(line => {
      let result = '';
      let i = 0;
      const len = line.length;

      while (i < len) {
        // Comments & docstrings
        if ((isPy && (line.startsWith('"""', i) || line.startsWith("'''", i))) ||
            line.startsWith('//', i) || (isPy && line[i] === '#') ||
            (!isPy && line[i] === '#' && ['sh', 'bash', 'zsh', 'yaml', 'yml', 'toml', 'ini', 'conf'].includes(ext))) {
          result += `<span class="tok-com">${this.escapeHtml(line.slice(i))}</span>`;
          break;
        }

        // Strings: single, double, backtick
        const ch = line[i];
        if (ch === '"' || ch === "'" || ch === '`') {
          let strEnd = i + 1;
          while (strEnd < len) {
            if (line[strEnd] === '\\') {
              strEnd += 2;
              continue;
            }
            if (line[strEnd] === ch) {
              strEnd++;
              break;
            }
            strEnd++;
          }
          result += `<span class="tok-str">${this.escapeHtml(line.slice(i, strEnd))}</span>`;
          i = strEnd;
          continue;
        }

        // Identifiers & Keywords
        if (/[a-zA-Z_$]/.test(ch)) {
          let idEnd = i + 1;
          while (idEnd < len && /[a-zA-Z0-9_$]/.test(line[idEnd])) {
            idEnd++;
          }
          const word = line.slice(i, idEnd);
          if (kwSet.has(word)) {
            result += `<span class="tok-kw">${this.escapeHtml(word)}</span>`;
          } else if (idEnd < len && line.slice(idEnd).trimStart().startsWith('(')) {
            result += `<span class="tok-fn">${this.escapeHtml(word)}</span>`;
          } else {
            result += this.escapeHtml(word);
          }
          i = idEnd;
          continue;
        }

        // Numbers
        if (/\d/.test(ch) && (i === 0 || !/[a-zA-Z0-9_$]/.test(line[i - 1]))) {
          let numEnd = i + 1;
          while (numEnd < len && /[\d.xXa-fA-F_]/.test(line[numEnd])) {
            numEnd++;
          }
          result += `<span class="tok-num">${this.escapeHtml(line.slice(i, numEnd))}</span>`;
          i = numEnd;
          continue;
        }

        result += this.escapeHtml(ch);
        i++;
      }
      return result;
    });

    return processedLines.join('\n');
  },

  // ==========================================
  // 4. PLAIN TEXT & LOG VIEWER (Clean Paper Layout)
  // ==========================================
  renderPlainTextView(container, text, file, ext) {
    const lines = text.split('\n');
    const gutterHtml = lines.map((_, i) => `<div>${i + 1}</div>`).join('');

    container.innerHTML = `
      <div class="viewer-code-card">
        <div class="viewer-code-toolbar">
          <div style="font-weight: 600; color: #fff;">${this.escapeHtml(file.name)}</div>
          <div style="display: flex; align-items: center; gap: 12px;">
            <span>${lines.length.toLocaleString()} lines</span>
            <span>&bull;</span>
            <span>${text.length.toLocaleString()} characters</span>
            <button id="viewer-wrap-btn" class="viewer-btn" style="height: 28px; padding: 0 10px; font-size: 11px;" onclick="Viewer.toggleWordWrap()">Wrap Lines</button>
            <button class="viewer-btn" style="height: 28px; padding: 0 10px; font-size: 11px;" onclick="Viewer.copyAllText(this)">Copy Text</button>
          </div>
        </div>
        <div class="viewer-code-container">
          <div class="viewer-code-gutter">${gutterHtml}</div>
          <pre id="viewer-code-content" class="viewer-code-content ${this.isWordWrapped ? 'wrap-lines' : ''}">${this.escapeHtml(text)}</pre>
        </div>
      </div>
    `;
  },

  // ==========================================
  // 5. OFFICE DOCUMENT VIEWER (Word, Excel, PowerPoint)
  // ==========================================
  renderOfficeDocument(container, file, url, ext) {
    const encodedUrl = encodeURIComponent(url);
    const gdocsUrl = `https://docs.google.com/viewer?url=${encodedUrl}&embedded=true`;

    container.innerHTML = `
      <iframe class="viewer-doc-frame" src="${gdocsUrl}" frameborder="0" allowfullscreen></iframe>
    `;
  },

  // ==========================================
  // IMAGE PAN & ZOOM CONTROLS
  // ==========================================
  attachImagePan(img) {
    if (!img) return;

    let lastTap = 0;

    const handleDoubleTap = (e) => {
      e.preventDefault();
      if (this.currentZoom > 1.05) {
        this.resetZoom();
      } else {
        this.currentZoom = 2;
        this.panX = 0;
        this.panY = 0;
        const btnReset = document.getElementById('viewer-zoom-reset');
        if (btnReset) btnReset.textContent = '200%';
        this.applyImageTransform();
      }
    };

    img.addEventListener('dblclick', handleDoubleTap);

    // Mouse drag start
    img.addEventListener('mousedown', (e) => {
      if (this.currentZoom <= 1) return;
      e.preventDefault();
      this.isPanning = true;
      this.startX = e.clientX - this.panX;
      this.startY = e.clientY - this.panY;
    });

    // Touch drag & double-tap for mobile
    img.addEventListener('touchstart', (e) => {
      const now = Date.now();
      if (now - lastTap < 300) {
        handleDoubleTap(e);
        lastTap = 0;
        return;
      }
      lastTap = now;

      if (e.touches.length === 1 && this.currentZoom > 1) {
        this.isPanning = true;
        this.startX = e.touches[0].clientX - this.panX;
        this.startY = e.touches[0].clientY - this.panY;
      }
    }, { passive: false });

    img.addEventListener('touchmove', (e) => {
      if (!this.isPanning || e.touches.length !== 1) return;
      e.preventDefault();
      this.panX = e.touches[0].clientX - this.startX;
      this.panY = e.touches[0].clientY - this.startY;
      this.applyImageTransform();
    }, { passive: false });

    const endTouch = () => {
      this.isPanning = false;
    };
    img.addEventListener('touchend', endTouch);
    img.addEventListener('touchcancel', endTouch);
  },

  zoom(delta) {
    this.currentZoom = Math.max(0.4, Math.min(3.5, this.currentZoom + delta));
    const btnReset = document.getElementById('viewer-zoom-reset');
    if (btnReset) btnReset.textContent = `${Math.round(this.currentZoom * 100)}%`;
    this.applyImageTransform();
  },

  resetZoom() {
    this.currentZoom = 1;
    this.panX = 0;
    this.panY = 0;
    const btnReset = document.getElementById('viewer-zoom-reset');
    if (btnReset) btnReset.textContent = '100%';
    this.applyImageTransform();
  },

  applyImageTransform() {
    const img = document.getElementById('viewer-img-el');
    if (img) {
      img.style.transform = `translate(${this.panX}px, ${this.panY}px) scale(${this.currentZoom})`;
    }
  },

  toggleWordWrap() {
    this.isWordWrapped = !this.isWordWrapped;
    const content = document.getElementById('viewer-code-content');
    const wrapBtn = document.getElementById('viewer-wrap-btn');
    if (content) content.classList.toggle('wrap-lines', this.isWordWrapped);
    if (wrapBtn) wrapBtn.style.color = this.isWordWrapped ? '#61afef' : '#abb2bf';
  },

  copyCodeSnippet(btn) {
    const codeEl = btn.closest('pre')?.querySelector('code');
    if (!codeEl) return;
    navigator.clipboard.writeText(codeEl.textContent || '').then(() => {
      const orig = btn.textContent;
      btn.textContent = 'Copied!';
      btn.style.color = '#34a853';
      setTimeout(() => {
        btn.textContent = orig;
        btn.style.color = '';
      }, 1500);
    });
  },

  copyAllText(btn) {
    if (!this.activeRawText) return;
    navigator.clipboard.writeText(this.activeRawText).then(() => {
      if (btn) {
        const orig = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => {
          btn.textContent = orig;
        }, 1500);
      } else {
        alert('File content copied to clipboard.');
      }
    });
  },

  close() {
    const modal = document.getElementById('viewer-modal');
    const bodyEl = document.getElementById('viewer-body');
    if (bodyEl) {
      bodyEl.innerHTML = ''; // Stop any audio/video
      bodyEl.style.overflow = '';
    }
    if (modal) modal.classList.remove('open');
    this.activeFile = null;
    this.activeRawText = '';
    this.isPanning = false;
  },

  download() {
    if (!this.activeFile || !this.activeFile.hosted_url) return;
    const a = document.createElement('a');
    a.href = this.activeFile.hosted_url;
    a.download = this.activeFile.name || 'file';
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  },

  copyLink() {
    if (!this.activeFile || !this.activeFile.hosted_url) return;
    navigator.clipboard.writeText(this.activeFile.hosted_url).then(() => {
      alert('Direct link copied to clipboard: ' + this.activeFile.hosted_url);
    });
  },

  // ==========================================
  // INLINE CODE & DOCUMENT EDITING
  // ==========================================
  toggleEditMode() {
    this.isEditMode = !this.isEditMode;
    const editBtn = document.getElementById('viewer-edit-btn');
    const saveBtn = document.getElementById('viewer-save-btn');
    const bodyEl = document.getElementById('viewer-body');
    const lbl = editBtn?.querySelector('span:not([id])');

    if (this.isEditMode) {
      if (lbl) lbl.textContent = 'Cancel';
      if (saveBtn) saveBtn.style.display = 'inline-flex';

      bodyEl.innerHTML = `
        <div class="viewer-editor-container">
          <div class="editor-gutter" id="editor-gutter"></div>
          <textarea class="editor-textarea" id="editor-textarea" spellcheck="false"></textarea>
        </div>
      `;

      const textarea = document.getElementById('editor-textarea');
      const gutter = document.getElementById('editor-gutter');
      textarea.value = this.activeRawText || '';
      this.updateGutter();

      textarea.addEventListener('input', () => this.updateGutter());
      textarea.addEventListener('scroll', () => {
        gutter.scrollTop = textarea.scrollTop;
      });

      // Handle Tab & Save hotkey (Ctrl+S / Cmd+S)
      textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
          e.preventDefault();
          const start = textarea.selectionStart;
          const end = textarea.selectionEnd;
          textarea.value = textarea.value.substring(0, start) + '  ' + textarea.value.substring(end);
          textarea.selectionStart = textarea.selectionEnd = start + 2;
          this.updateGutter();
        } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
          e.preventDefault();
          this.saveEditedContent();
        }
      });
      textarea.focus();
    } else {
      if (lbl) lbl.textContent = 'Edit';
      if (saveBtn) saveBtn.style.display = 'none';

      // Re-render view mode
      const ext = (this.activeFile.extension || '').toLowerCase();
      if (['md', 'markdown'].includes(ext)) {
        this.renderMarkdownView(bodyEl, this.activeRawText, this.activeFile);
      } else if (this.activeFile.category === 'code' || ['js', 'ts', 'py', 'json', 'html', 'css', 'sql', 'sh'].includes(ext)) {
        this.renderCodeView(bodyEl, this.activeRawText, this.activeFile, ext);
      } else {
        this.renderPlainTextView(bodyEl, this.activeRawText, this.activeFile, ext);
      }
    }
  },

  updateGutter() {
    const textarea = document.getElementById('editor-textarea');
    const gutter = document.getElementById('editor-gutter');
    if (!textarea || !gutter) return;
    const lines = (textarea.value || '').split('\n').length;
    let numbers = '';
    for (let i = 1; i <= lines; i++) {
      numbers += i + '\n';
    }
    gutter.textContent = numbers;
  },

  async saveEditedContent() {
    const textarea = document.getElementById('editor-textarea');
    const saveBtn = document.getElementById('viewer-save-btn');
    if (!textarea || !this.activeFile) return;

    const newText = textarea.value;
    const origHtml = saveBtn?.innerHTML;
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';
    }

    try {
      const res = await API.post('/api/files/save-content', {
        file_id: this.activeFile.id,
        content: newText
      });

      if (res && res.file) {
        this.activeFile = res.file;
        this.activeRawText = newText;
        Drive.showToast('File content saved successfully!');
        this.toggleEditMode(); // Reverts to preview
        Drive.reload(); // Refresh drive storage and modified date
      } else {
        throw new Error(res.error || 'Failed to save changes.');
      }
    } catch (err) {
      console.error('Save error:', err);
      Drive.showToast(err.message || 'Error saving file', 'error');
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.innerHTML = origHtml || 'Save';
      }
    }
  },

  // ==========================================
  // FLOATING AUDIO WAVEFORM MINI PLAYER
  // ==========================================
  audioPlay(file) {
    if (!file || !file.hosted_url) return;
    const player = document.getElementById('audio-mini-player');
    const audioEl = document.getElementById('global-audio-element');
    const titleEl = document.getElementById('mini-player-title');
    if (!player || !audioEl) return;

    titleEl.textContent = file.name || 'Audio Track';
    audioEl.src = file.hosted_url;
    audioEl.play().catch(e => console.warn('Autoplay prevented:', e));
    player.style.display = 'flex';
  },

  audioTogglePlay() {
    const audioEl = document.getElementById('global-audio-element');
    if (!audioEl) return;
    if (audioEl.paused) {
      audioEl.play();
    } else {
      audioEl.pause();
    }
  },

  audioRewind(sec = 10) {
    const audioEl = document.getElementById('global-audio-element');
    if (audioEl) audioEl.currentTime = Math.max(0, audioEl.currentTime - sec);
  },

  audioForward(sec = 10) {
    const audioEl = document.getElementById('global-audio-element');
    if (audioEl) audioEl.currentTime = Math.min(audioEl.duration || 0, audioEl.currentTime + sec);
  },

  audioSeek(val) {
    const audioEl = document.getElementById('global-audio-element');
    if (audioEl && audioEl.duration) {
      audioEl.currentTime = (val / 100) * audioEl.duration;
    }
  },

  audioToggleMute() {
    const audioEl = document.getElementById('global-audio-element');
    const volIcon = document.getElementById('mini-icon-volume');
    if (!audioEl) return;
    audioEl.muted = !audioEl.muted;
    if (volIcon) volIcon.innerHTML = audioEl.muted ? Icons.volume_mute : Icons.volume;
  },

  audioClose() {
    const player = document.getElementById('audio-mini-player');
    const audioEl = document.getElementById('global-audio-element');
    if (audioEl) {
      audioEl.pause();
      audioEl.src = '';
    }
    if (player) player.style.display = 'none';
  },

  onAudioTimeUpdate() {
    const audioEl = document.getElementById('global-audio-element');
    const timeEl = document.getElementById('mini-player-time');
    const scrubber = document.getElementById('mini-player-scrubber');
    if (!audioEl || !timeEl || !scrubber) return;

    const cur = audioEl.currentTime || 0;
    const dur = audioEl.duration || 0;
    timeEl.textContent = `${this.formatTime(cur)} / ${this.formatTime(dur)}`;

    if (dur > 0) {
      scrubber.value = (cur / dur) * 100;
    }
  },

  onAudioPlayState(isPlaying) {
    this.isAudioPlaying = isPlaying;
    const player = document.getElementById('audio-mini-player');
    const playIcon = document.getElementById('mini-icon-play');
    if (player) player.classList.toggle('is-playing', isPlaying);
    if (playIcon) playIcon.innerHTML = isPlaying ? Icons.pause : Icons.play;
  },

  onAudioEnded() {
    this.onAudioPlayState(false);
  },

  formatTime(sec) {
    if (isNaN(sec) || sec === 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  }
};
