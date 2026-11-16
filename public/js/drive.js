// Haul Pro - Google Drive Style File Manager & Public Profile Engine
// Pure Vanilla JavaScript (ES6+), Zero Emojis

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

  // Public Profile State
  isPublicMode: false,
  profileUsername: null,
  isOwnerMode: false,
  publicProfileData: null,
  currentTab: 'public', // 'public' | 'private' (Matches Instagram wireframe)

  // Move Modal State
  moveTargetItem: null, // { id, type: 'file' | 'folder', name }
  selectedMoveFolderId: null,

  // Drag & Drop State
  draggedFileId: null,

  getProfileUsernameFromUrl() {
    const rawPath = window.location.pathname.replace(/^\/+|\/+$/g, '');
    if (!rawPath) return null;
    const firstSegment = rawPath.split('/')[0].toLowerCase();
    const systemRoutes = ['api', 'css', 'js', 'public', 'index.html', 'favicon.ico'];
    if (systemRoutes.includes(firstSegment)) return null;
    return firstSegment;
  },

  init() {
    const username = this.getProfileUsernameFromUrl();
    if (username) {
      this.isPublicMode = true;
      this.profileUsername = username;
    } else {
      this.isPublicMode = false;
      this.profileUsername = null;
    }

    this.bindEvents();
    this.bindModalEvents();
    this.reload();
  },

  bindEvents() {
    // Sidebar navigation items
    document.querySelectorAll('.nav-list .nav-item').forEach(item => {
      item.addEventListener('click', () => {
        if (this.isPublicMode && !this.isOwnerMode) return;
        document.querySelectorAll('.nav-list .nav-item').forEach(el => el.classList.remove('active'));
        item.classList.add('active');
        this.currentNav = item.dataset.nav || 'drive';
        this.currentFolderId = null;
        this.searchQuery = '';
        const searchInput = document.getElementById('search-input');
        if (searchInput) searchInput.value = '';

        // If user was in public profile and clicks sidebar, return to root personal drive
        if (this.isPublicMode) {
          history.pushState(null, '', '/');
          this.isPublicMode = false;
          this.profileUsername = null;
          this.isOwnerMode = false;
        }

        this.reload();
      });
    });

    // Filter Chips
    document.querySelectorAll('.chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.chip').forEach(el => el.classList.remove('active'));
        chip.classList.add('active');
        this.currentCategory = chip.dataset.category || 'all';
        this.reloadFilesOnly();
      });
    });

    // Search input with debouncing
    const searchInput = document.getElementById('search-input');
    let searchTimeout = null;
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
          this.searchQuery = e.target.value.trim();
          this.reloadFilesOnly();
        }, 300);
      });
    }

    // View layout toggle (Grid / List)
    const toggleViewBtn = document.getElementById('toggle-view-btn');
    if (toggleViewBtn) {
      toggleViewBtn.addEventListener('click', () => {
        this.currentView = this.currentView === 'grid' ? 'list' : 'grid';
        toggleViewBtn.innerHTML = this.currentView === 'grid' ? Icons.view_list : Icons.view_grid;
        this.renderFiles();
      });
    }

    // Infinite Scroll trigger on explorer container
    const explorerEl = document.getElementById('explorer-view');
    if (explorerEl) {
      explorerEl.addEventListener('scroll', () => {
        if (this.isLoading || !this.hasMore) return;
        const scrollBottom = explorerEl.scrollHeight - explorerEl.scrollTop - explorerEl.clientHeight;
        if (scrollBottom < 260) {
          this.loadMoreFiles();
        }
      });
    }

    // Global document click to close context menu
    document.addEventListener('click', () => {
      const ctxMenu = document.getElementById('context-menu');
      if (ctxMenu) ctxMenu.style.display = 'none';
    });

    // Public Profile Share & Back buttons
    const shareProfileBtn = document.getElementById('copy-public-profile-link-btn');
    if (shareProfileBtn) {
      shareProfileBtn.addEventListener('click', () => {
        const url = window.location.href;
        navigator.clipboard.writeText(url).then(() => {
          this.showToast('Public profile link copied to clipboard!');
        });
      });
    }

    const backDriveBtn = document.getElementById('owner-back-drive-btn');
    if (backDriveBtn) {
      backDriveBtn.addEventListener('click', () => {
        history.pushState(null, '', '/');
        this.isPublicMode = false;
        this.profileUsername = null;
        this.isOwnerMode = false;
        this.reload();
      });
    }

    // Instagram-style [ PRIVATE | PUBLIC ] tab buttons
    const tabPrivateBtn = document.getElementById('profile-tab-private');
    const tabPublicBtn = document.getElementById('profile-tab-public');

    if (tabPrivateBtn) {
      tabPrivateBtn.addEventListener('click', () => {
        if (this.currentTab === 'private') return;
        this.currentTab = 'private';
        this.page = 1;
        this.currentFolderId = null;
        this.loadPublicDrive();
      });
    }

    if (tabPublicBtn) {
      tabPublicBtn.addEventListener('click', () => {
        if (this.currentTab === 'public') return;
        this.currentTab = 'public';
        this.page = 1;
        this.currentFolderId = null;
        this.loadPublicDrive();
      });
    }
  },

  bindModalEvents() {
    // New Folder Modal events
    const newFolderInput = document.getElementById('new-folder-input');
    const newFolderCreateBtn = document.getElementById('new-folder-create-btn');
    const newFolderCancelBtn = document.getElementById('new-folder-cancel-btn');

    if (newFolderCreateBtn) {
      newFolderCreateBtn.addEventListener('click', () => this.submitNewFolder());
    }
    if (newFolderCancelBtn) {
      newFolderCancelBtn.addEventListener('click', () => this.closeNewFolderModal());
    }
    if (newFolderInput) {
      newFolderInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this.submitNewFolder();
        if (e.key === 'Escape') this.closeNewFolderModal();
      });
    }

    // Move Modal events
    const moveConfirmBtn = document.getElementById('move-confirm-btn');
    const moveCancelBtn = document.getElementById('move-cancel-btn');
    const moveCloseBtn = document.getElementById('move-modal-close-btn');

    if (moveConfirmBtn) {
      moveConfirmBtn.addEventListener('click', () => this.submitMove());
    }
    if (moveCancelBtn) {
      moveCancelBtn.addEventListener('click', () => this.closeMoveModal());
    }
    if (moveCloseBtn) {
      moveCloseBtn.addEventListener('click', () => this.closeMoveModal());
    }
  },

  async reload() {
    this.page = 1;
    this.files = [];
    this.hasMore = true;
    this.selectedFile = null;

    if (this.isPublicMode) {
      await this.loadPublicDrive();
    } else {
      this.hidePublicProfileBanner();
      await this.loadFolders();
      await this.loadFiles(1);
    }
  },

  async reloadFilesOnly() {
    this.page = 1;
    this.files = [];
    this.hasMore = true;

    if (this.isPublicMode) {
      await this.loadPublicDrive();
    } else {
      await this.loadFiles(1);
    }
  },

  // ==========================================
  // PUBLIC PROFILE DRIVE LOADER (/<username>)
  // ==========================================
  async loadPublicDrive() {
    const banner = document.getElementById('public-profile-banner');
    const ownerBar = document.getElementById('owner-mode-bar');
    const backBtn = document.getElementById('owner-back-drive-btn');
    const loader = document.getElementById('infinite-loader');

    if (loader) loader.classList.remove('hidden');

    const params = {
      parentId: this.currentFolderId || 'root',
      category: this.currentCategory,
      search: this.searchQuery,
      tab: this.currentTab,
      page: this.page,
      limit: 20
    };

    try {
      const data = await API.getPublicProfile(this.profileUsername, params);
      this.publicProfileData = data;
      this.isOwnerMode = Boolean(data.is_owner);

      // Render Instagram-style Profile Card
      if (banner && data.profile) {
        banner.style.display = 'block';

        // Avatar: Image or Initials
        const avatarInitial = document.getElementById('public-avatar-initial');
        const avatarImg = document.getElementById('public-avatar-img');
        const avatarWrap = document.getElementById('public-profile-avatar');
        const initial = (data.profile.name || 'U').charAt(0).toUpperCase();

        if (data.profile.avatar_url && avatarImg && avatarInitial) {
          avatarImg.src = data.profile.avatar_url;
          avatarImg.style.display = 'block';
          avatarInitial.style.display = 'none';
          if (avatarWrap) avatarWrap.style.backgroundColor = 'transparent';
        } else if (avatarInitial && avatarImg) {
          avatarImg.style.display = 'none';
          avatarInitial.textContent = initial;
          avatarInitial.style.display = 'block';
          if (avatarWrap) avatarWrap.style.backgroundColor = data.profile.avatar_color || '#1a73e8';
        }

        // Name and Username
        const nameEl = document.getElementById('public-profile-name');
        const unameEl = document.getElementById('public-profile-username');
        if (nameEl) nameEl.textContent = data.profile.name;
        if (unameEl) unameEl.textContent = `@${data.profile.username}`;

        // Small Bio (Wireframe feature)
        const bioEl = document.getElementById('public-profile-bio');
        if (bioEl) {
          if (data.profile.bio) {
            bioEl.textContent = data.profile.bio;
            bioEl.style.display = 'block';
            bioEl.classList.remove('empty-bio');
          } else if (this.isOwnerMode) {
            bioEl.textContent = 'Add a bio to introduce yourself to your visitors.';
            bioEl.style.display = 'block';
            bioEl.classList.add('empty-bio');
          } else {
            bioEl.style.display = 'none';
          }
        }

        // Stats & Owner Controls
        const countEl = document.getElementById('public-profile-file-count');
        const bannerEditBtn = document.getElementById('banner-edit-profile-btn');
        const instaChangeAvatarBtn = document.getElementById('insta-change-avatar-btn');
        const tabsBar = document.getElementById('profile-tabs-bar');
        const tabPrivateBtn = document.getElementById('profile-tab-private');
        const tabPublicBtn = document.getElementById('profile-tab-public');
        const tabPrivateCount = document.getElementById('tab-private-count');
        const tabPublicCount = document.getElementById('tab-public-count');

        if (countEl) {
          const shownCount = this.currentTab === 'private' ? (data.profile.total_private_files || 0) : (data.profile.total_public_files || 0);
          countEl.textContent = `${shownCount} ${this.currentTab} file${shownCount === 1 ? '' : 's'}`;
        }

        if (this.isOwnerMode) {
          if (bannerEditBtn) bannerEditBtn.style.display = 'inline-flex';
          if (instaChangeAvatarBtn) instaChangeAvatarBtn.style.display = 'flex';
          if (tabsBar) tabsBar.style.display = 'flex';
          if (tabPrivateCount) tabPrivateCount.textContent = data.profile.total_private_files || 0;
          if (tabPublicCount) tabPublicCount.textContent = data.profile.total_public_files || 0;

          if (tabPrivateBtn && tabPublicBtn) {
            if (this.currentTab === 'private') {
              tabPrivateBtn.classList.add('active');
              tabPublicBtn.classList.remove('active');
            } else {
              tabPublicBtn.classList.add('active');
              tabPrivateBtn.classList.remove('active');
            }
          }
        } else {
          if (bannerEditBtn) bannerEditBtn.style.display = 'none';
          if (instaChangeAvatarBtn) instaChangeAvatarBtn.style.display = 'none';
          if (tabsBar) tabsBar.style.display = 'none';
        }
      }

      // Owner Mode indicator and back button
      if (ownerBar) {
        ownerBar.style.display = this.isOwnerMode ? 'flex' : 'none';
      }
      if (backBtn) {
        backBtn.style.display = this.isOwnerMode ? 'flex' : 'none';
      }

      // Configure sidebar for public guest vs owner
      this.configureSidebarForView();

      // Set folders and files
      this.folders = data.folders || [];
      this.renderFolders();
      this.renderBreadcrumbs(data.breadcrumbs || []);

      if (this.page === 1) {
        this.files = data.files || [];
      } else {
        this.files = this.files.concat(data.files || []);
      }
      this.hasMore = data.has_more;
      this.renderFiles();

    } catch (err) {
      console.error('Failed to load public profile:', err);
      this.showToast(err.message || 'Could not load profile.', 'error');
    } finally {
      if (loader) loader.classList.add('hidden');
    }
  },

  hidePublicProfileBanner() {
    const banner = document.getElementById('public-profile-banner');
    const ownerBar = document.getElementById('owner-mode-bar');
    if (banner) banner.style.display = 'none';
    if (ownerBar) ownerBar.style.display = 'none';
    this.configureSidebarForView();
  },

  configureSidebarForView() {
    const newBtn = document.getElementById('new-btn');
    const storageBox = document.querySelector('.sidebar-storage');
    const navItems = document.querySelectorAll('.nav-list .nav-item');

    if (this.isPublicMode && !this.isOwnerMode) {
      // Read-only guest mode: hide upload button & personal storage meter
      if (newBtn) newBtn.style.display = 'none';
      if (storageBox) storageBox.style.display = 'none';
      navItems.forEach(item => {
        if (item.dataset.nav !== 'drive') item.style.display = 'none';
      });
    } else {
      // Normal owner or authenticated drive mode
      if (newBtn) newBtn.style.display = 'flex';
      if (storageBox) storageBox.style.display = 'block';
      navItems.forEach(item => item.style.display = 'flex');
    }
  },

  // ==========================================
  // STANDARD FOLDERS & FILES LOADER
  // ==========================================
  async loadFolders() {
    const foldersSection = document.getElementById('folders-section');
    if (!foldersSection) return;

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
      this.renderFolders();
    } catch (e) {
      foldersSection.style.display = 'none';
    }
  },

  renderFolders() {
    const foldersSection = document.getElementById('folders-section');
    const foldersGrid = document.getElementById('folders-grid');
    if (!foldersSection || !foldersGrid) return;

    if (!this.folders || this.folders.length === 0) {
      foldersSection.style.display = 'none';
      foldersGrid.innerHTML = '';
      return;
    }

    foldersSection.style.display = 'block';
    foldersGrid.innerHTML = this.folders.map(f => this.renderFolderCard(f)).join('');
  },

  renderFolderCard(folder) {
    const isPublic = folder.is_public !== false;
    const canManage = !this.isPublicMode || this.isOwnerMode;

    return `
      <div class="folder-card"
           data-id="${folder.id}"
           draggable="${canManage}"
           ondblclick="Drive.openFolder('${folder.id}')"
           onclick="Drive.selectFolder(this, '${folder.id}')"
           oncontextmenu="Drive.showFolderContextMenu(event, '${folder.id}')"
           ondragover="Drive.onFolderDragOver(event)"
           ondragleave="Drive.onFolderDragLeave(event)"
           ondrop="Drive.onFolderDrop(event, '${folder.id}')">
        <div class="folder-card-main">
          ${Icons.folder}
          <span class="folder-name" title="${folder.name}">${folder.name}</span>
        </div>
        ${canManage ? `
          <button class="vis-badge ${isPublic ? 'public' : 'private'}"
                  onclick="Drive.toggleFolderVisibility(event, '${folder.id}')"
                  title="Click to toggle Public / Private">
            ${isPublic ? Icons.globe : Icons.lock}
            <span>${isPublic ? 'Public' : 'Private'}</span>
          </button>
        ` : ''}
      </div>
    `;
  },

  renderBreadcrumbs(trail) {
    const breadcrumbsEl = document.getElementById('breadcrumbs');
    if (!breadcrumbsEl) return;

    if (!this.isPublicMode) {
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
    } else {
      if (trail && trail.length > 0) {
        trail[0].name = this.isOwnerMode
          ? `${this.publicProfileData?.profile?.name || 'My'}'s ${this.currentTab.toUpperCase()} files`
          : `${this.publicProfileData?.profile?.name || 'User'}'s Drive`;
      }
    }

    breadcrumbsEl.innerHTML = trail.map((crumb, idx) => `
      <div class="breadcrumb-item"
           onclick="Drive.openFolder(${crumb.id ? `'${crumb.id}'` : 'null'})"
           ondragover="Drive.onBreadcrumbDragOver(event)"
           ondragleave="Drive.onBreadcrumbDragLeave(event)"
           ondrop="Drive.onBreadcrumbDrop(event, ${crumb.id ? `'${crumb.id}'` : 'null'})">
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
      limit: 20,
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
    if (this.isPublicMode) {
      this.page++;
      this.loadPublicDrive();
    } else {
      this.loadFiles(this.page + 1);
    }
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
          <p style="font-size: 16px; font-weight: 500;">No ${this.isPublicMode ? this.currentTab : ''} files here</p>
          <p style="font-size: 13px; margin-top: 4px;">${this.isPublicMode && !this.isOwnerMode ? 'This profile has no public files shared in this folder.' : 'Drag and drop files to upload, or click "+ New"'}</p>
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
                ${(!this.isPublicMode || this.isOwnerMode) ? '<th style="width: 90px;">Visibility</th>' : ''}
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

  // THUMBNAIL & CARD PREVIEW ENGINE (ZERO BROKEN ICONS)
  renderFileCard(file) {
    const isImg = file.category === 'image';
    const isPublic = file.is_public !== false;
    const canManage = !this.isPublicMode || this.isOwnerMode;

    return `
      <div class="file-card"
           data-id="${file.id}"
           draggable="${canManage}"
           ondragstart="Drive.onDragStart(event, '${file.id}')"
           ondragend="Drive.onDragEnd(event)"
           onclick="Drive.onFileClick(event, '${file.id}')"
           oncontextmenu="Drive.showContextMenu(event, '${file.id}')">

        <div class="file-card-preview">
          <div class="preview-backdrop-icon">
            ${getFileIcon(file.category, file.extension)}
          </div>
          ${isImg ? `
            <img class="file-card-img"
                 src="${file.hosted_url}"
                 alt=""
                 referrerpolicy="no-referrer"
                 loading="lazy"
                 onload="this.classList.add('loaded')"
                 onerror="this.style.display='none'" />
          ` : ''}
          ${canManage ? `
            <button class="vis-badge-overlay ${isPublic ? 'public' : 'private'}"
                    onclick="Drive.toggleFileVisibility(event, '${file.id}')"
                    title="Click to toggle Public / Private">
              ${isPublic ? Icons.globe : Icons.lock}
              <span>${isPublic ? 'Public' : 'Private'}</span>
            </button>
          ` : ''}
        </div>

        <div class="file-card-footer">
          ${getFileIcon(file.category, file.extension)}
          <div class="file-card-info">
            <div class="file-card-title" title="${file.name}">${file.name}</div>
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
    const isPublic = file.is_public !== false;
    const canManage = !this.isPublicMode || this.isOwnerMode;

    return `
      <tr data-id="${file.id}"
          draggable="${canManage}"
          ondragstart="Drive.onDragStart(event, '${file.id}')"
          ondragend="Drive.onDragEnd(event)"
          onclick="Drive.onFileClick(event, '${file.id}')"
          oncontextmenu="Drive.showContextMenu(event, '${file.id}')">
        <td>
          <div class="table-name-cell">
            ${getFileIcon(file.category, file.extension)}
            <span title="${file.name}">${file.name}</span>
          </div>
        </td>
        <td style="text-transform: capitalize;">${file.category}</td>
        <td>${Auth.formatBytes(file.size)}</td>
        <td>${dateStr}</td>
        ${canManage ? `
          <td>
            <button class="vis-badge ${isPublic ? 'public' : 'private'}"
                    onclick="Drive.toggleFileVisibility(event, '${file.id}')"
                    title="Click to toggle Public / Private">
              ${isPublic ? Icons.globe : Icons.lock}
              <span>${isPublic ? 'Public' : 'Private'}</span>
            </button>
          </td>
        ` : ''}
        <td>
          <button class="icon-btn" onclick="Drive.showContextMenu(event, '${file.id}')">
            ${Icons.more_vert}
          </button>
        </td>
      </tr>
    `;
  },

  onFileClick(e, fileId) {
    if (e.target.closest('.icon-btn') || e.target.closest('.vis-badge') || e.target.closest('.vis-badge-overlay')) return;
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

  // ==========================================
  // DRAG & DROP MOVING BETWEEN FOLDERS
  // ==========================================
  onDragStart(e, fileId) {
    this.draggedFileId = fileId;
    e.dataTransfer.setData('application/x-haul-file', fileId);
    e.dataTransfer.effectAllowed = 'move';
    const card = document.querySelector(`[data-id="${fileId}"]`);
    if (card) card.classList.add('dragging');
  },

  onDragEnd(e) {
    this.draggedFileId = null;
    document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
  },

  onFolderDragOver(e) {
    if (!this.draggedFileId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const card = e.currentTarget;
    if (card) card.classList.add('drag-over');
  },

  onFolderDragLeave(e) {
    const card = e.currentTarget;
    if (card) card.classList.remove('drag-over');
  },

  async onFolderDrop(e, targetFolderId) {
    e.preventDefault();
    e.stopPropagation();
    const card = e.currentTarget;
    if (card) card.classList.remove('drag-over');

    const fileId = this.draggedFileId || e.dataTransfer.getData('application/x-haul-file');
    if (!fileId || fileId === targetFolderId) return;

    try {
      await API.moveFiles([fileId], targetFolderId);
      this.showToast('Item moved successfully.');
      this.reload();
    } catch (err) {
      this.showToast(err.message || 'Failed to move file', 'error');
    }
  },

  onBreadcrumbDragOver(e) {
    if (!this.draggedFileId) return;
    e.preventDefault();
    e.currentTarget.classList.add('drag-over');
  },

  onBreadcrumbDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
  },

  async onBreadcrumbDrop(e, targetFolderId) {
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.classList.remove('drag-over');

    const fileId = this.draggedFileId || e.dataTransfer.getData('application/x-haul-file');
    if (!fileId) return;

    try {
      await API.moveFiles([fileId], targetFolderId);
      this.showToast('Item moved successfully.');
      this.reload();
    } catch (err) {
      this.showToast(err.message || 'Failed to move file', 'error');
    }
  },

  // ==========================================
  // NEW FOLDER MODAL
  // ==========================================
  openNewFolderModal() {
    const modal = document.getElementById('new-folder-modal');
    const input = document.getElementById('new-folder-input');
    if (modal && input) {
      input.value = 'Untitled folder';
      modal.style.display = 'flex';
      setTimeout(() => {
        input.focus();
        input.select();
      }, 50);
    }
  },

  closeNewFolderModal() {
    const modal = document.getElementById('new-folder-modal');
    if (modal) modal.style.display = 'none';
  },

  async submitNewFolder() {
    const input = document.getElementById('new-folder-input');
    const name = input ? input.value.trim() : '';
    if (!name) return;

    try {
      await API.createFolder(name, this.currentFolderId);
      this.closeNewFolderModal();
      this.showToast(`Created folder "${name}"`);
      this.reload();
    } catch (e) {
      this.showToast(e.message || 'Failed to create folder', 'error');
    }
  },

  // ==========================================
  // MOVE TO MODAL DIALOG
  // ==========================================
  async openMoveModal(itemId, itemType = 'file', itemName = 'item') {
    this.moveTargetItem = { id: itemId, type: itemType, name: itemName };
    this.selectedMoveFolderId = null;

    const modal = document.getElementById('move-modal');
    const titleEl = document.getElementById('move-modal-title');
    const treeEl = document.getElementById('move-folder-tree');
    const confirmBtn = document.getElementById('move-confirm-btn');

    if (titleEl) titleEl.textContent = `Move "${itemName}" to...`;
    if (confirmBtn) confirmBtn.disabled = true;

    if (treeEl) {
      treeEl.innerHTML = '<div class="picker-loading">Loading destinations...</div>';
    }
    if (modal) modal.style.display = 'flex';

    try {
      const data = await API.getFolders({ parentId: 'root' });
      const allFolders = data.folders || [];
      this.renderMoveFolderTree(allFolders);
    } catch (err) {
      if (treeEl) treeEl.innerHTML = '<div class="picker-error">Could not load folder list.</div>';
    }
  },

  renderMoveFolderTree(folders) {
    const treeEl = document.getElementById('move-folder-tree');
    if (!treeEl) return;

    const currentFid = this.currentFolderId;
    const filterSelf = this.moveTargetItem && this.moveTargetItem.type === 'folder' ? this.moveTargetItem.id : null;

    let html = `
      <div class="folder-picker-item ${currentFid === null ? 'current-location' : ''}"
           onclick="Drive.selectMoveFolder(this, null)">
        ${Icons.haul_logo}
        <span class="picker-folder-name">My Drive (Root)</span>
        ${currentFid === null ? '<span class="picker-current-tag">Current</span>' : ''}
      </div>
    `;

    folders.forEach(f => {
      if (f.id === filterSelf) return; // Cannot move a folder into itself
      const isCurrent = currentFid === f.id;
      html += `
        <div class="folder-picker-item ${isCurrent ? 'current-location' : ''}"
             onclick="Drive.selectMoveFolder(this, '${f.id}')">
          ${Icons.folder}
          <span class="picker-folder-name">${f.name}</span>
          ${isCurrent ? '<span class="picker-current-tag">Current</span>' : ''}
        </div>
      `;
    });

    treeEl.innerHTML = html;
  },

  selectMoveFolder(el, folderId) {
    document.querySelectorAll('.folder-picker-item').forEach(item => item.classList.remove('selected'));
    el.classList.add('selected');
    this.selectedMoveFolderId = folderId;

    const confirmBtn = document.getElementById('move-confirm-btn');
    if (confirmBtn) confirmBtn.disabled = false;
  },

  closeMoveModal() {
    const modal = document.getElementById('move-modal');
    if (modal) modal.style.display = 'none';
    this.moveTargetItem = null;
    this.selectedMoveFolderId = null;
  },

  async submitMove() {
    if (!this.moveTargetItem) return;

    const { id, type, name } = this.moveTargetItem;
    const targetFolderId = this.selectedMoveFolderId;

    try {
      if (type === 'folder') {
        await API.moveFolder(id, targetFolderId);
      } else {
        await API.moveFiles([id], targetFolderId);
      }
      this.closeMoveModal();
      this.showToast(`Moved "${name}" successfully.`);
      this.reload();
    } catch (err) {
      this.showToast(err.message || 'Failed to move item', 'error');
    }
  },

  // ==========================================
  // VISIBILITY TOGGLE (PUBLIC / PRIVATE)
  // ==========================================
  async toggleFileVisibility(e, fileId) {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    const file = this.files.find(f => f.id === fileId);
    if (!file) return;

    const newPublic = file.is_public === false ? true : false;
    try {
      await API.toggleFileVisibility(fileId, newPublic);
      file.is_public = newPublic;
      this.showToast(`Moved to ${newPublic ? 'Public' : 'Private'}`);
      if (this.isPublicMode) {
        this.loadPublicDrive();
      } else {
        this.renderFiles();
      }
    } catch (err) {
      this.showToast(err.message || 'Failed to update visibility', 'error');
    }
  },

  async toggleFolderVisibility(e, folderId) {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    const folder = this.folders.find(f => f.id === folderId);
    if (!folder) return;

    const newPublic = folder.is_public === false ? true : false;
    try {
      await API.toggleFolderVisibility(folderId, newPublic);
      folder.is_public = newPublic;
      this.showToast(`Folder moved to ${newPublic ? 'Public' : 'Private'}`);
      if (this.isPublicMode) {
        this.loadPublicDrive();
      } else {
        this.renderFolders();
      }
    } catch (err) {
      this.showToast(err.message || 'Failed to update folder visibility', 'error');
    }
  },

  // ==========================================
  // CONTEXT MENUS (FILES & FOLDERS)
  // ==========================================
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
    const isPublic = file.is_public !== false;
    const canManage = !this.isPublicMode || this.isOwnerMode;

    let html = `
      <div class="context-menu-item" onclick="Viewer.open(Drive.selectedFile)">
        ${Icons.info} <span>Preview</span>
      </div>
      <div class="context-menu-item" onclick="Drive.copyDirectLink('${file.hosted_url}')">
        ${Icons.link} <span>Copy direct link</span>
      </div>
      <div class="context-menu-item" onclick="Viewer.download()">
        ${Icons.download} <span>Download</span>
      </div>
    `;

    if (canManage) {
      html += `
        <div style="height: 1px; background: #e8eaed; margin: 4px 0;"></div>
        <div class="context-menu-item" onclick="Drive.openMoveModal('${file.id}', 'file', '${file.name.replace(/'/g, "\\'")}')">
          ${Icons.move} <span>Move to...</span>
        </div>
        <div class="context-menu-item" onclick="Drive.toggleFileVisibility(null, '${file.id}')">
          ${isPublic ? Icons.lock : Icons.globe} <span>${isPublic ? 'Make Private' : 'Make Public'}</span>
        </div>
        <div class="context-menu-item" onclick="Drive.toggleStar('${file.id}', ${!isStarred})">
          ${isStarred ? Icons.star_filled : Icons.star} <span>${isStarred ? 'Remove from Starred' : 'Add to Starred'}</span>
        </div>
        <div class="context-menu-item" onclick="Drive.promptRename('${file.id}', '${file.name.replace(/'/g, "\\'")}')">
          ${Icons.rename} <span>Rename</span>
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
    }

    menu.innerHTML = html;
    menu.style.display = 'block';
    menu.style.top = `${e.clientY}px`;
    menu.style.left = `${Math.min(e.clientX, window.innerWidth - 220)}px`;
  },

  showFolderContextMenu(e, folderId) {
    e.preventDefault();
    e.stopPropagation();

    const folder = this.folders.find(f => f.id === folderId);
    if (!folder) return;

    const menu = document.getElementById('context-menu');
    if (!menu) return;

    const canManage = !this.isPublicMode || this.isOwnerMode;
    const isPublic = folder.is_public !== false;

    let html = `
      <div class="context-menu-item" onclick="Drive.openFolder('${folder.id}')">
        ${Icons.folder_open} <span>Open folder</span>
      </div>
    `;

    if (canManage) {
      html += `
        <div style="height: 1px; background: #e8eaed; margin: 4px 0;"></div>
        <div class="context-menu-item" onclick="Drive.openMoveModal('${folder.id}', 'folder', '${folder.name.replace(/'/g, "\\'")}')">
          ${Icons.move} <span>Move to...</span>
        </div>
        <div class="context-menu-item" onclick="Drive.toggleFolderVisibility(null, '${folder.id}')">
          ${isPublic ? Icons.lock : Icons.globe} <span>${isPublic ? 'Make Private' : 'Make Public'}</span>
        </div>
        <div class="context-menu-item" onclick="Drive.promptRenameFolder('${folder.id}', '${folder.name.replace(/'/g, "\\'")}')">
          ${Icons.rename} <span>Rename</span>
        </div>
        <div style="height: 1px; background: #e8eaed; margin: 4px 0;"></div>
        <div class="context-menu-item" style="color: #ea4335;" onclick="Drive.deleteFolder('${folder.id}')">
          ${Icons.trash} <span>Delete folder</span>
        </div>
      `;
    }

    menu.innerHTML = html;
    menu.style.display = 'block';
    menu.style.top = `${e.clientY}px`;
    menu.style.left = `${Math.min(e.clientX, window.innerWidth - 220)}px`;
  },

  // ==========================================
  // FILE ACTIONS & HELPERS
  // ==========================================
  async toggleStar(fileId, newStarred) {
    try {
      await API.updateFile(fileId, { isStarred: newStarred });
      const f = this.files.find(item => item.id === fileId);
      if (f) f.is_starred = newStarred;
      this.renderFiles();
      this.showToast(newStarred ? 'Added to Starred' : 'Removed from Starred');
    } catch (e) {
      this.showToast('Failed to update star', 'error');
    }
  },

  async promptRename(fileId, oldName) {
    const newName = prompt('Rename file:', oldName);
    if (!newName || !newName.trim() || newName.trim() === oldName) return;

    try {
      await API.updateFile(fileId, { name: newName.trim() });
      this.showToast('File renamed');
      this.reload();
    } catch (e) {
      this.showToast('Failed to rename file', 'error');
    }
  },

  async promptRenameFolder(folderId, oldName) {
    const newName = prompt('Rename folder:', oldName);
    if (!newName || !newName.trim() || newName.trim() === oldName) return;

    try {
      await API.updateFolder(folderId, { name: newName.trim() });
      this.showToast('Folder renamed');
      this.reload();
    } catch (e) {
      this.showToast('Failed to rename folder', 'error');
    }
  },

  async deleteFolder(folderId) {
    if (!confirm('Delete this folder and its contents?')) return;
    try {
      await API.deleteFolder(folderId);
      this.showToast('Folder deleted');
      this.reload();
      Auth.checkSession();
    } catch (e) {
      this.showToast(e.message || 'Failed to delete folder', 'error');
    }
  },

  copyDirectLink(url) {
    navigator.clipboard.writeText(url).then(() => {
      this.showToast('Direct media link copied to clipboard!');
    });
  },

  async trashFile(fileId) {
    try {
      await API.deleteFile(fileId, false);
      this.showToast('Moved to trash');
      this.reload();
      Auth.checkSession();
    } catch (e) {
      this.showToast('Failed to move to trash', 'error');
    }
  },

  async restoreFile(fileId) {
    try {
      await API.updateFile(fileId, { isTrashed: false });
      this.showToast('Restored from trash');
      this.reload();
    } catch (e) {
      this.showToast('Failed to restore file', 'error');
    }
  },

  async deletePermanently(fileId) {
    if (!confirm('Delete forever? This file will be permanently removed from storage.')) return;
    try {
      await API.deleteFile(fileId, true);
      this.showToast('Permanently deleted');
      this.reload();
      Auth.checkSession();
    } catch (e) {
      this.showToast('Failed to delete file', 'error');
    }
  },

  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast-item ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('visible');
    }, 10);

    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }
};
