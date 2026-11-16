// Haul Pro - Google Drive File Manager Controller

const Drive = {
  currentFolderId: null,
  currentNav: 'drive',
  currentCategory: 'all',
  currentView: 'grid',
  searchQuery: '',
  page: 1,
  hasMore: true,
  isLoading: false,
  files: [],
  folders: [],
  selectedFile: null,

  init() {
    this.bindEvents();
    this.reload();
  },

  bindEvents() {
    // Navigation items (Sidebar)
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        item.classList.add('active');
        this.currentNav = item.dataset.nav || 'drive';
        this.currentFolderId = null;
        this.searchQuery = '';
        const searchInput = document.getElementById('search-input');
        if (searchInput) searchInput.value = '';
        this.reload();
      });
    });

    // Filter Chips
    document.querySelectorAll('.chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.chip').forEach(el => el.classList.remove('active'));
        chip.classList.add('active');
        this.currentCategory = chip.dataset.category || 'all';
        this.reload();
      });
    });

    // Search input with debounce
    const searchInput = document.getElementById('search-input');
    let searchTimeout = null;
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
          this.searchQuery = e.target.value.trim();
          this.reload();
        }, 300);
      });
    }

    // View toggle (Grid / List)
    const toggleViewBtn = document.getElementById('toggle-view-btn');
    if (toggleViewBtn) {
      toggleViewBtn.addEventListener('click', () => {
        this.currentView = this.currentView === 'grid' ? 'list' : 'grid';
        toggleViewBtn.innerHTML = this.currentView === 'grid' ? Icons.view_list : Icons.view_grid;
        this.renderFiles();
      });
    }

    // Infinite Scroll on explorer view container
    const explorerEl = document.getElementById('explorer-view');
    if (explorerEl) {
      explorerEl.addEventListener('scroll', () => {
        if (this.isLoading || !this.hasMore) return;
        const scrollBottom = explorerEl.scrollHeight - explorerEl.scrollTop - explorerEl.clientHeight;
        if (scrollBottom < 250) {
          this.loadMoreFiles();
        }
      });
    }

    // Document click to hide context menu
    document.addEventListener('click', () => {
      const ctxMenu = document.getElementById('context-menu');
      if (ctxMenu) ctxMenu.style.display = 'none';
    });
  },

  async reload() {
    this.page = 1;
    this.files = [];
    this.hasMore = true;
    this.selectedFile = null;

    await this.loadFolders();
    await this.loadFiles(1);
  },

  async loadFolders() {
    const foldersSection = document.getElementById('folders-section');
    const foldersGrid = document.getElementById('folders-grid');
    if (!foldersSection || !foldersGrid) return;

    if (this.searchQuery || this.currentCategory !== 'all') {
      foldersSection.style.display = 'none';
      return;
    }

    const params = {
      parentId: this.currentFolderId || 'root',
      starred: this.currentNav === 'starred',
      trashed: this.currentNav === 'trash'
    };

    try {
      const data = await API.getFolders(params);
      this.folders = data.folders || [];
      this.renderBreadcrumbs(data.breadcrumbs || []);

      if (this.folders.length === 0) {
        foldersSection.style.display = 'none';
      } else {
        foldersSection.style.display = 'block';
        foldersGrid.innerHTML = this.folders.map(f => `
          <div class="folder-card" data-id="${f.id}" ondblclick="Drive.openFolder('${f.id}')" onclick="Drive.selectFolder(this, '${f.id}')">
            ${Icons.folder}
            <span class="folder-name">${f.name}</span>
          </div>
        `).join('');
      }
    } catch (e) {
      foldersSection.style.display = 'none';
    }
  },

  renderBreadcrumbs(trail) {
    const breadcrumbsEl = document.getElementById('breadcrumbs');
    if (!breadcrumbsEl) return;

    if (this.currentNav === 'recent') {
      breadcrumbsEl.innerHTML = '<span class="breadcrumb-item">Recent</span>';
      return;
    }
    if (this.currentNav === 'starred') {
      breadcrumbsEl.innerHTML = '<span class="breadcrumb-item">Starred</span>';
      return;
    }
    if (this.currentNav === 'trash') {
      breadcrumbsEl.innerHTML = '<span class="breadcrumb-item">Trash</span>';
      return;
    }

    breadcrumbsEl.innerHTML = trail.map((crumb, idx) => `
      <div class="breadcrumb-item" onclick="Drive.openFolder(${crumb.id ? `'${crumb.id}'` : 'null'})">
        ${crumb.name}
      </div>
      ${idx < trail.length - 1 ? Icons.chevron_right : ''}
    `).join('');
  },

  async loadFiles(page = 1) {
    if (this.isLoading) return;
    this.isLoading = true;

    const loader = document.getElementById('infinite-loader');
    if (loader) loader.classList.remove('hidden');

    const params = {
      page: page,
      limit: 20, // 20 per scroll as requested
      folderId: this.currentFolderId || 'root',
      category: this.currentCategory,
      starred: this.currentNav === 'starred',
      trashed: this.currentNav === 'trash',
      search: this.searchQuery
    };

    try {
      const data = await API.getFiles(params);
      if (page === 1) {
        this.files = data.files || [];
      } else {
        this.files = this.files.concat(data.files || []);
      }
      this.hasMore = data.has_more;
      this.page = page;
      this.renderFiles();
    } catch (e) {
      console.error('Failed to load files:', e);
    } finally {
      this.isLoading = false;
      if (loader) loader.classList.add('hidden');
    }
  },

  loadMoreFiles() {
    if (!this.hasMore || this.isLoading) return;
    this.loadFiles(this.page + 1);
  },

  renderFiles() {
    const container = document.getElementById('files-container');
    const label = document.getElementById('files-section-label');
    if (!container) return;

    if (this.files.length === 0) {
      if (label) label.style.display = 'none';
      container.innerHTML = `
        <div style="text-align: center; padding: 48px 16px; color: #5f6368;">
          <div style="margin-bottom: 12px;">${Icons.upload_cloud}</div>
          <p style="font-size: 16px; font-weight: 500;">No files here yet</p>
          <p style="font-size: 13px; margin-top: 4px;">Drag and drop files to upload, or click "+ New"</p>
        </div>
      `;
      return;
    }

    if (label) label.style.display = 'block';

    if (this.currentView === 'grid') {
      container.innerHTML = `
        <div class="files-grid">
          ${this.files.map(f => this.renderFileCard(f)).join('')}
        </div>
      `;
    } else {
      container.innerHTML = `
        <div class="files-table-container">
          <table class="files-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th>File Size</th>
                <th>Modified</th>
                <th style="width: 40px;"></th>
              </tr>
            </thead>
            <tbody>
              ${this.files.map(f => this.renderFileRow(f)).join('')}
            </tbody>
          </table>
        </div>
      `;
    }
  },

  renderFileCard(file) {
    const isImg = file.category === 'image';
    const previewContent = isImg
      ? `<img class="file-card-img" src="${file.hosted_url}" alt="${file.name}" loading="lazy" onerror="this.style.display='none'; if(this.nextElementSibling) this.nextElementSibling.style.display='flex';" /><div class="file-fallback-icon" style="display:none; width:100%; height:100%; align-items:center; justify-content:center;">${getFileIcon(file.category, file.extension)}</div>`
      : getFileIcon(file.category, file.extension);

    return `
      <div class="file-card" data-id="${file.id}" onclick="Drive.onFileClick(event, '${file.id}')" oncontextmenu="Drive.showContextMenu(event, '${file.id}')">
        <div class="file-card-preview">
          ${previewContent}
        </div>
        <div class="file-card-footer">
          ${getFileIcon(file.category, file.extension)}
          <div class="file-card-info">
            <div class="file-card-title">${file.name}</div>
            <div class="file-card-size">${Auth.formatBytes(file.size)}</div>
          </div>
          <button class="icon-btn" onclick="Drive.showContextMenu(event, '${file.id}')">
            ${Icons.more_vert}
          </button>
        </div>
      </div>
    `;
  },

  renderFileRow(file) {
    const dateStr = file.created_at ? new Date(file.created_at).toLocaleDateString() : '';
    return `
      <tr data-id="${file.id}" onclick="Drive.onFileClick(event, '${file.id}')" oncontextmenu="Drive.showContextMenu(event, '${file.id}')">
        <td>
          <div class="table-name-cell">
            ${getFileIcon(file.category, file.extension)}
            <span>${file.name}</span>
          </div>
        </td>
        <td style="text-transform: capitalize;">${file.category}</td>
        <td>${Auth.formatBytes(file.size)}</td>
        <td>${dateStr}</td>
        <td>
          <button class="icon-btn" onclick="Drive.showContextMenu(event, '${file.id}')">
            ${Icons.more_vert}
          </button>
        </td>
      </tr>
    `;
  },

  onFileClick(e, fileId) {
    if (e.target.closest('.icon-btn')) return;
    const file = this.files.find(f => f.id === fileId);
    if (file) {
      Viewer.open(file);
    }
  },

  openFolder(folderId) {
    this.currentFolderId = folderId;
    this.reload();
  },

  selectFolder(el, folderId) {
    document.querySelectorAll('.folder-card').forEach(c => c.classList.remove('selected'));
    el.classList.add('selected');
  },

  async promptNewFolder() {
    const name = prompt('New Folder Name:');
    if (!name || !name.trim()) return;

    try {
      await API.createFolder(name.trim(), this.currentFolderId);
      this.loadFolders();
    } catch (e) {
      alert(e.message || 'Failed to create folder');
    }
  },

  showContextMenu(e, fileId) {
    e.preventDefault();
    e.stopPropagation();

    const file = this.files.find(f => f.id === fileId);
    if (!file) return;

    this.selectedFile = file;
    const menu = document.getElementById('context-menu');
    if (!menu) return;

    const isStarred = Boolean(file.is_starred);
    const isTrashed = Boolean(file.is_trashed);

    menu.innerHTML = `
      <div class="context-menu-item" onclick="Viewer.open(Drive.selectedFile)">
        ${Icons.info} <span>Preview</span>
      </div>
      <div class="context-menu-item" onclick="Drive.toggleStar('${file.id}', ${!isStarred})">
        ${isStarred ? Icons.star_filled : Icons.star} <span>${isStarred ? 'Remove from Starred' : 'Add to Starred'}</span>
      </div>
      <div class="context-menu-item" onclick="Drive.promptRename('${file.id}', '${file.name}')">
        ${Icons.rename} <span>Rename</span>
      </div>
      <div class="context-menu-item" onclick="Drive.copyDirectLink('${file.hosted_url}')">
        ${Icons.link} <span>Copy link</span>
      </div>
      <div class="context-menu-item" onclick="Viewer.download()">
        ${Icons.download} <span>Download</span>
      </div>
      <div style="height: 1px; background: #e8eaed; margin: 4px 0;"></div>
      ${isTrashed ? `
        <div class="context-menu-item" onclick="Drive.restoreFile('${file.id}')">
          ${Icons.check} <span>Restore</span>
        </div>
        <div class="context-menu-item" style="color: #ea4335;" onclick="Drive.deletePermanently('${file.id}')">
          ${Icons.trash} <span>Delete forever</span>
        </div>
      ` : `
        <div class="context-menu-item" style="color: #ea4335;" onclick="Drive.trashFile('${file.id}')">
          ${Icons.trash} <span>Move to trash</span>
        </div>
      `}
    `;

    menu.style.display = 'block';
    menu.style.top = `${e.clientY}px`;
    menu.style.left = `${Math.min(e.clientX, window.innerWidth - 200)}px`;
  },

  async toggleStar(fileId, newStarred) {
    try {
      await API.updateFile(fileId, { isStarred: newStarred });
      const f = this.files.find(item => item.id === fileId);
      if (f) f.is_starred = newStarred;
      this.renderFiles();
    } catch (e) {
      alert('Failed to update star');
    }
  },

  async promptRename(fileId, oldName) {
    const newName = prompt('Rename file:', oldName);
    if (!newName || !newName.trim() || newName.trim() === oldName) return;

    try {
      await API.updateFile(fileId, { name: newName.trim() });
      this.reload();
    } catch (e) {
      alert('Failed to rename file');
    }
  },

  copyDirectLink(url) {
    navigator.clipboard.writeText(url).then(() => {
      alert('Direct link copied to clipboard: ' + url);
    });
  },

  async trashFile(fileId) {
    try {
      await API.deleteFile(fileId, false);
      this.reload();
      Auth.checkSession();
    } catch (e) {
      alert('Failed to move to trash');
    }
  },

  async restoreFile(fileId) {
    try {
      await API.updateFile(fileId, { isTrashed: false });
      this.reload();
    } catch (e) {
      alert('Failed to restore file');
    }
  },

  async deletePermanently(fileId) {
    if (!confirm('Delete forever? This file will be removed permanently.')) return;
    try {
      await API.deleteFile(fileId, true);
      this.reload();
      Auth.checkSession();
    } catch (e) {
      alert('Failed to delete file');
    }
  }
};
