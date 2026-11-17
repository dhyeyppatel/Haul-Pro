// Haul Pro - In-App File Viewer Controller & Universal File Engine

const Viewer = {
  activeFile: null,
  activeRawText: '',
  activeMode: 'preview', // 'preview' or 'raw'
  isWordWrapped: false,
  currentZoom: 1,
  panX: 0,
  panY: 0,
  isPanning: false,
  startX: 0,
  startY: 0,

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

    // Close on clicking backdrop outside card
    const modal = document.getElementById('viewer-modal');
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal || e.target.id === 'viewer-body') {
          this.close();
        }
      });
    }
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
    this.activeFile = file;
    this.activeRawText = '';
    this.activeMode = 'preview';
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

    if (filenameEl) filenameEl.textContent = file.name || 'File Preview';
    if (bodyEl) bodyEl.innerHTML = '';
    if (zoomControls) zoomControls.style.display = 'none';
    if (metaBadge) metaBadge.style.display = 'none';
    if (modeSwitch) {
      modeSwitch.style.display = 'none';
      modeSwitch.innerHTML = '';
    }

    const ext = (file.extension || (file.name ? file.name.split('.').pop() : '')).toLowerCase();
    const url = file.hosted_url || '';

    // Extension & Type Classification
    const isImage = file.category === 'image' || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif', 'tiff'].includes(ext);
    const isPdf = ext === 'pdf' || file.category === 'book';
    const isOffice = ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'rtf'].includes(ext);
    const isMarkdown = ['md', 'markdown', 'mdown'].includes(ext);
    const isCsv = ['csv', 'tsv'].includes(ext);
    const isCode = ['js', 'jsx', 'ts', 'tsx', 'html', 'htm', 'css', 'scss', 'json', 'py', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'go', 'rs', 'php', 'sh', 'bash', 'bat', 'cmd', 'ps1', 'sql', 'xml', 'yaml', 'yml', 'toml'].includes(ext);
    const isPlainText = ['txt', 'log', 'env', 'ini', 'conf', 'cfg', 'reg'].includes(ext);
    const isVideo = file.category === 'video' || ['mp4', 'webm', 'mkv', 'mov', 'avi', 'flv', 'wmv'].includes(ext);
    const isAudio = file.category === 'audio' || ['mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'opus'].includes(ext);

    // Update Header Metadata Badge
    if (metaBadge) {
      metaBadge.style.display = 'inline-flex';
      metaBadge.textContent = `${ext.toUpperCase()} • ${Auth.formatBytes(file.size || 0)}`;
    }

    // 1. IMAGE PREVIEW
    if (isImage) {
      if (zoomControls) zoomControls.style.display = 'flex';
      bodyEl.innerHTML = `
        <img id="viewer-img-el" class="viewer-image" src="${url}" alt="${this.escapeHtml(file.name)}" referrerpolicy="no-referrer">
      `;
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
    // 9. AUDIO PLAYER
    else if (isAudio) {
      bodyEl.innerHTML = `
        <div class="viewer-audio-card">
          <div class="viewer-audio-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>
          </div>
          <div class="viewer-audio-title">${this.escapeHtml(file.name)}</div>
          <audio class="viewer-audio-player" controls autoplay>
            <source src="${url}" type="${file.mime_type || 'audio/mpeg'}">
            Your browser does not support audio playback.
          </audio>
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
    let esc = this.escapeHtml(text);

    // Simple robust tokenizer for syntax highlights
    // 1. Strings
    esc = esc.replace(/(&quot;[\s\S]*?&quot;|&#39;[\s\S]*?&#39;|`[\s\S]*?`)/g, '<span class="tok-str">$1</span>');

    // 2. Comments
    esc = esc.replace(/(\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*)/g, '<span class="tok-com">$1</span>');

    // 3. Keywords
    const keywords = ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'import', 'export', 'from', 'as', 'class', 'default', 'async', 'await', 'def', 'class', 'self', 'lambda', 'public', 'private', 'static', 'void', 'true', 'false', 'null', 'None', 'try', 'except', 'catch', 'finally', 'while', 'for', 'in', 'switch', 'case'];
    const kwRegex = new RegExp(`\\b(${keywords.join('|')})\\b`, 'g');
    esc = esc.replace(kwRegex, '<span class="tok-kw">$1</span>');

    // 4. Numbers
    esc = esc.replace(/\b(\d+(\.\d+)?)\b/g, '<span class="tok-num">$1</span>');

    return esc;
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
    img.addEventListener('mousedown', (e) => {
      if (this.currentZoom <= 1) return;
      e.preventDefault();
      this.isPanning = true;
      this.startX = e.clientX - this.panX;
      this.startY = e.clientY - this.panY;
    });

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
    if (bodyEl) bodyEl.innerHTML = ''; // Stop any audio/video
    if (modal) modal.classList.remove('open');
    this.activeFile = null;
    this.activeRawText = '';
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
  }
};
