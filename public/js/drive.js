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

  // Multi-Selection State
  selectedFileIds: new Set(),

  // Public Profile State
  isPublicMode: false,
  profileUsername: null,
  isOwnerMode: false,
  publicProfileData: null,
  currentTab: 'public', // Default to 'public' so profiles show public files
  eventsBound: false,

  // Move Modal State
  moveTargetItem: null, // { id, type: 'file' | 'folder' | 'bulk', name }
  selectedMoveFolderId: null,

  // Share Folder State
  sharingFolderId: null,

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

  hideLoadingScreen() {
    const screen = document.getElementById('app-loading-screen');
    if (!screen) return;
    screen.classList.add('fade-out');
    setTimeout(() => {
      screen.style.display = 'none';
    }, 350);
  },

  init() {
    const username = this.getProfileUsernameFromUrl();
    if (username) {
      this.isPublicMode = true;
      this.profileUsername = username;
      this.currentTab = 'public';
    } else {
      this.isPublicMode = false;
      this.profileUsername = null;
      this.currentTab = 'private';
    }

    // Support direct folder link sharing via ?folderId=...
    const urlParams = new URLSearchParams(window.location.search);
    const urlFid = urlParams.get('folderId');
    if (urlFid) {
      this.currentFolderId = urlFid;
    }

    if (typeof Settings !== 'undefined' && Settings.preferences && Settings.preferences.defaultView) {
      this.currentView = Settings.preferences.defaultView;
    }

    try {
      if (window.innerWidth > 768 && localStorage.getItem('haul_sidebar_collapsed') === 'true') {
        document.body.classList.add('sidebar-collapsed');
      }
    } catch (e) {}

    if (!this.eventsBound) {
      this.bindEvents();
      this.bindModalEvents();
      this.eventsBound = true;
    }

    this.reload();
  },

  bindEvents() {
    // Sidebar navigation items
    document.querySelectorAll('.nav-list .nav-item').forEach(item => {
      item.addEventListener('click', () => {
        this.switchNav(item.dataset.nav || 'drive');
      });
    });

    // Sidebar Toggle Button (Desktop Rail Mode & Mobile Drawer)
    const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn') || document.getElementById('mobile-menu-btn');
    const sidebar = document.getElementById('app-sidebar');
    const backdrop = document.getElementById('sidebar-backdrop');

    const closeMobileSidebar = () => {
      if (sidebar) sidebar.classList.remove('open');
      if (backdrop) backdrop.classList.remove('active');
    };

    if (sidebarToggleBtn && sidebar) {
      sidebarToggleBtn.addEventListener('click', () => {
        if (window.innerWidth > 768) {
          document.body.classList.toggle('sidebar-collapsed');
          const isCollapsed = document.body.classList.contains('sidebar-collapsed');
          try {
            localStorage.setItem('haul_sidebar_collapsed', isCollapsed ? 'true' : 'false');
          } catch (e) {}
        } else {
          sidebar.classList.toggle('open');
          if (backdrop) backdrop.classList.toggle('active', sidebar.classList.contains('open'));
        }
      });
    }

    if (backdrop) {
      backdrop.addEventListener('click', closeMobileSidebar);
    }

    // Close mobile drawer when clicking any nav item
    document.querySelectorAll('.nav-list .nav-item').forEach(item => {
      item.addEventListener('click', closeMobileSidebar);
    });

    // Mobile Bottom Tab Bar navigation
    document.querySelectorAll('#mobile-tab-bar .mobile-tab-item').forEach(item => {
      item.addEventListener('click', () => {
        const nav = item.dataset.nav;
        if (!nav) return;
        this.switchNav(nav);
      });
    });

    // Mobile FAB button (Quick upload files)
    const mobileFabBtn = document.getElementById('mobile-fab-btn');
    if (mobileFabBtn) {
      mobileFabBtn.addEventListener('click', () => {
        const fileInput = document.getElementById('file-upload-input');
        if (fileInput) fileInput.click();
      });
    }

    // Filter Chips
    document.querySelectorAll('.chip').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.chip').forEach(el => el.classList.remove('active'));
        chip.classList.add('active');
        this.currentCategory = chip.dataset.category || 'all';
        this.clearSelection();
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
          this.clearSelection();
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
        const url = `${window.location.origin}/${this.profileUsername || Auth.currentUser?.username || ''}`;
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
        this.currentFolderId = null;
        this.clearSelection();
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
        this.clearSelection();
        this.loadPublicDrive();
      });
    }

    if (tabPublicBtn) {
      tabPublicBtn.addEventListener('click', () => {
        if (this.currentTab === 'public') return;
        this.currentTab = 'public';
        this.page = 1;
        this.currentFolderId = null;
        this.clearSelection();
        this.loadPublicDrive();
      });
    }

    // Handle browser Forward / Back buttons
    window.addEventListener('popstate', () => {
      const username = this.getProfileUsernameFromUrl();
      if (username) {
        this.isPublicMode = true;
        this.profileUsername = username;
        this.currentTab = 'public';
      } else {
        this.isPublicMode = false;
        this.profileUsername = null;
        this.isOwnerMode = false;
        this.currentTab = 'private';
      }
      this.currentFolderId = null;
      this.clearSelection();
      this.reload();
    });
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

    // Share Folder Modal events
    const shareFolderCloseBtn = document.getElementById('share-folder-close-btn');
    const shareFolderCopyBtn = document.getElementById('share-folder-copy-btn');
    const shareFolderToggleBtn = document.getElementById('share-folder-toggle-vis-btn');

    if (shareFolderCloseBtn) {
      shareFolderCloseBtn.addEventListener('click', () => this.closeShareFolderModal());
    }
    if (shareFolderCopyBtn) {
      shareFolderCopyBtn.addEventListener('click', () => this.copyFolderShareLink());
    }
    if (shareFolderToggleBtn) {
      shareFolderToggleBtn.addEventListener('click', () => this.toggleShareFolderVisibility());
    }
  },

  async reload() {
    this.page = 1;
    this.files = [];
    this.hasMore = true;
    this.selectedFile = null;
    this.clearSelection();

    const activityView = document.getElementById('activity-view');
    const foldersSection = document.getElementById('folders-section');
    const filesContainer = document.getElementById('files-container');
    const filesSectionLabel = document.getElementById('files-section-label');
    const filterChips = document.querySelector('.filter-chips');
    const toggleViewBtn = document.getElementById('toggle-view-btn');

    try {
      if (this.currentNav === 'activity') {
        this.hidePublicProfileBanner();
        if (foldersSection) foldersSection.style.display = 'none';
        if (filesContainer) filesContainer.style.display = 'none';
        if (filesSectionLabel) filesSectionLabel.style.display = 'none';
        if (filterChips) filterChips.style.display = 'none';
        if (toggleViewBtn) toggleViewBtn.style.display = 'none';
        if (activityView) activityView.style.display = 'block';
        this.renderBreadcrumbs([{ id: null, name: 'Activity & Alerts' }]);
        await this.loadActivities();
        return;
      }

      if (activityView) activityView.style.display = 'none';
      if (filesContainer) filesContainer.style.display = 'block';
      if (filterChips) filterChips.style.display = 'flex';
      if (toggleViewBtn) toggleViewBtn.style.display = 'inline-flex';

      if (this.isPublicMode) {
        await this.loadPublicDrive();
      } else {
        this.hidePublicProfileBanner();
        await this.loadFolders();
        await this.loadFiles(1);
      }
    } finally {
      this.hideLoadingScreen();
    }
  },

  async reloadFilesOnly() {
    this.page = 1;
    this.files = [];
    this.hasMore = true;
    this.clearSelection();

    try {
      if (this.isPublicMode) {
        await this.loadPublicDrive();
      } else {
        await this.loadFiles(1);
      }
    } finally {
      this.hideLoadingScreen();
    }
  },

  // ==========================================
  // MULTI-SELECTION SYSTEM
  // ==========================================
  toggleFileSelection(e, fileId) {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }

    if (this.selectedFileIds.has(fileId)) {
      this.selectedFileIds.delete(fileId);
    } else {
      this.selectedFileIds.add(fileId);
    }

    this.updateMultiSelectBar();
    this.updateSelectedElementStyles();
  },

  clearSelection() {
    this.selectedFileIds.clear();
    this.updateMultiSelectBar();
    this.updateSelectedElementStyles();
  },

  updateSelectedElementStyles() {
    document.querySelectorAll('.file-card').forEach(card => {
      const id = card.dataset.id;
      const isSelected = this.selectedFileIds.has(id);
      if (isSelected) {
        card.classList.add('selected');
      } else {
        card.classList.remove('selected');
      }
      const chk = card.querySelector('.card-select-checkbox');
      if (chk) {
        chk.classList.toggle('checked', isSelected);
        chk.innerHTML = isSelected ? Icons.check : '';
      }
    });

    document.querySelectorAll('.files-table tbody tr').forEach(row => {
      const id = row.dataset.id;
      const isSelected = this.selectedFileIds.has(id);
      if (isSelected) {
        row.classList.add('selected');
      } else {
        row.classList.remove('selected');
      }
      const chk = row.querySelector('.row-select-checkbox');
      if (chk) {
        chk.classList.toggle('checked', isSelected);
        chk.innerHTML = isSelected ? Icons.check : '';
      }
    });
  },

  updateMultiSelectBar() {
    const bar = document.getElementById('multi-select-bar');
    const countEl = document.getElementById('multi-select-count');
    if (!bar) return;

    const count = this.selectedFileIds.size;
    if (count > 0) {
      bar.style.display = 'flex';
      if (countEl) countEl.textContent = `${count} item${count > 1 ? 's' : ''} selected`;
    } else {
      bar.style.display = 'none';
    }
  },

  async bulkSetVisibility(isPublic) {
    const fileIds = Array.from(this.selectedFileIds);
    if (!fileIds.length) return;

    try {
      await API.bulkSetVisibility(fileIds, isPublic);
      this.showToast(`Set ${fileIds.length} item(s) to ${isPublic ? 'Public' : 'Private'}`);
      this.clearSelection();
      this.reload();
    } catch (err) {
      this.showToast(err.message || 'Failed to update visibility', 'error');
    }
  },

  bulkMove() {
    const fileIds = Array.from(this.selectedFileIds);
    if (!fileIds.length) return;

    this.openMoveModal(fileIds, 'bulk', `${fileIds.length} files`);
  },

  async bulkDelete() {
    const fileIds = Array.from(this.selectedFileIds);
    if (!fileIds.length) return;

    if (!confirm(`Move ${fileIds.length} item(s) to trash?`)) return;

    try {
      await API.bulkDelete(fileIds, false);
      this.showToast(`Moved ${fileIds.length} item(s) to trash`);
      this.clearSelection();
      this.reload();
      Auth.checkSession();
    } catch (err) {
      this.showToast(err.message || 'Failed to delete items', 'error');
    }
  },

  // ==========================================
  // SHARE FOLDER MODAL
  // ==========================================
  openShareFolderModal(folderId) {
    const folder = this.folders.find(f => f.id === folderId);
    if (!folder) return;

    this.sharingFolderId = folderId;
    const modal = document.getElementById('share-folder-modal');
    const titleEl = document.getElementById('share-folder-title');
    const badgeEl = document.getElementById('share-folder-badge');
    const descEl = document.getElementById('share-folder-desc');
    const inputEl = document.getElementById('share-folder-link-input');
    const toggleBtn = document.getElementById('share-folder-toggle-vis-btn');

    const uname = this.profileUsername || Auth.currentUser?.username || '';
    const shareUrl = `${window.location.origin}/${uname}?folderId=${folder.id}`;

    if (titleEl) titleEl.textContent = `Share "${folder.name}"`;
    if (inputEl) inputEl.value = shareUrl;

    const isPublic = folder.is_public === true;
    if (badgeEl) {
      badgeEl.className = `vis-badge ${isPublic ? 'public' : 'private'}`;
      badgeEl.textContent = isPublic ? 'Public folder' : 'Private folder';
    }
    if (descEl) {
      descEl.textContent = isPublic
        ? 'This folder is Public. Anyone with this link can view and download all files inside.'
        : 'This folder is currently Private. Make it Public so others can see and download files in this folder.';
    }
    if (toggleBtn) {
      toggleBtn.textContent = isPublic ? 'Make Private' : 'Make Public';
    }

    if (modal) modal.style.display = 'flex';
  },

  closeShareFolderModal() {
    const modal = document.getElementById('share-folder-modal');
    if (modal) modal.style.display = 'none';
    this.sharingFolderId = null;
  },

  copyFolderShareLink() {
    const inputEl = document.getElementById('share-folder-link-input');
    if (!inputEl) return;

    navigator.clipboard.writeText(inputEl.value).then(() => {
      this.showToast('Folder share link copied to clipboard!');
      const folder = this.folders.find(f => f.id === this.sharingFolderId);
      if (folder && API.logActivity) {
        API.logActivity('share', `Shared public link for folder '${folder.name}'`, folder.name, 'folder');
      }
      this.closeShareFolderModal();
    });
  },

  async toggleShareFolderVisibility() {
    if (!this.sharingFolderId) return;
    const folder = this.folders.find(f => f.id === this.sharingFolderId);
    if (!folder) return;

    const newPublic = !folder.is_public;
    try {
      await API.toggleFolderVisibility(this.sharingFolderId, newPublic);
      folder.is_public = newPublic;
      this.showToast(`Folder set to ${newPublic ? 'Public' : 'Private'}`);
      this.openShareFolderModal(this.sharingFolderId); // Refresh modal view
      this.renderFolders();
    } catch (err) {
      this.showToast(err.message || 'Failed to update folder', 'error');
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

    if (this.page === 1) {
      if (!this.publicProfileData) {
        this.renderProfileSkeleton();
      }
      this.renderFoldersSkeleton();
      this.renderFilesSkeleton();
    }

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

      // If viewing as guest, tab is always public
      if (!this.isOwnerMode) {
        this.currentTab = 'public';
      }

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
            bioEl.textContent = 'Add a small bio to tell visitors about yourself.';
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
      console.error('Failed to load profile:', err);
      this.showToast(err.message || 'Could not load profile.', 'error');
      const container = document.getElementById('files-container');
      const foldersEl = document.getElementById('folders-container');
      const banner = document.getElementById('public-profile-banner');
      if (banner) banner.style.display = 'none';
      if (foldersEl) foldersEl.innerHTML = '';
      if (container) {
        container.innerHTML = `
          <div style="text-align: center; padding: 64px 20px; color: #5f6368;">
            <div style="margin-bottom: 16px; color: #ea4335;">${Icons.alert_triangle || Icons.info}</div>
            <h3 style="font-size: 20px; font-weight: 600; color: #202124; margin-bottom: 8px;">User not found</h3>
            <p style="font-size: 14px; margin-bottom: 20px;">The profile @${this.profileUsername || 'user'} does not exist or has been removed.</p>
            <a href="/" class="btn btn-primary" style="display: inline-flex; align-items: center; gap: 8px; text-decoration: none; padding: 8px 18px; border-radius: 8px; background: #1a73e8; color: white; font-weight: 500;">Go to My Drive</a>
          </div>
        `;
      }
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
    const mobFab = document.getElementById('mobile-fab-btn');

    if (this.isPublicMode && !this.isOwnerMode) {
      if (newBtn) newBtn.style.display = 'none';
      if (storageBox) storageBox.style.display = 'none';
      if (mobFab) mobFab.style.display = 'none';
      navItems.forEach(item => {
        if (item.dataset.nav !== 'drive') item.style.display = 'none';
      });
    } else {
      if (newBtn) newBtn.style.display = 'flex';
      if (storageBox) storageBox.style.display = 'block';
      if (mobFab) mobFab.style.display = 'flex';
      navItems.forEach(item => item.style.display = 'flex');
    }
  },

  // ==========================================
  // SKELETON LOADERS
  // ==========================================
  renderProfileSkeleton() {
    const banner = document.getElementById('public-profile-banner');
    if (!banner) return;
    banner.style.display = 'block';

    const avatarImg = document.getElementById('public-avatar-img');
    const avatarInitial = document.getElementById('public-avatar-initial');
    const avatarWrap = document.getElementById('public-profile-avatar');
    const nameEl = document.getElementById('public-profile-name');
    const unameEl = document.getElementById('public-profile-username');
    const bioEl = document.getElementById('public-profile-bio');
    const countEl = document.getElementById('public-profile-file-count');

    if (avatarImg) avatarImg.style.display = 'none';
    if (avatarWrap) avatarWrap.style.backgroundColor = 'transparent';
    if (avatarInitial) {
      avatarInitial.textContent = '';
      avatarInitial.className = 'skeleton-shimmer';
      avatarInitial.style.display = 'block';
      avatarInitial.style.borderRadius = '50%';
      avatarInitial.style.width = '100%';
      avatarInitial.style.height = '100%';
    }
    if (nameEl) nameEl.innerHTML = '<span class="skeleton-shimmer" style="display: inline-block; width: 140px; height: 22px; border-radius: 4px;"></span>';
    if (unameEl) unameEl.innerHTML = '<span class="skeleton-shimmer" style="display: inline-block; width: 80px; height: 16px; border-radius: 12px;"></span>';
    if (bioEl) {
      bioEl.style.display = 'block';
      bioEl.innerHTML = '<span class="skeleton-shimmer" style="display: inline-block; width: 220px; height: 14px; border-radius: 4px;"></span>';
    }
    if (countEl) countEl.innerHTML = '<span class="skeleton-shimmer" style="display: inline-block; width: 60px; height: 14px; border-radius: 4px;"></span>';
  },

  renderFoldersSkeleton() {
    const foldersSection = document.getElementById('folders-section');
    const foldersGrid = document.getElementById('folders-grid');
    if (!foldersSection || !foldersGrid) return;

    foldersSection.style.display = 'block';
    foldersGrid.innerHTML = Array(4).fill(0).map(() => `
      <div class="folder-card skeleton-card">
        <div class="folder-card-main">
          <div class="skeleton-shimmer" style="width: 20px; height: 20px; border-radius: 4px; flex-shrink: 0;"></div>
          <div class="skeleton-shimmer" style="width: 100px; height: 14px; border-radius: 4px;"></div>
        </div>
      </div>
    `).join('');
  },

  renderFilesSkeleton() {
    const container = document.getElementById('files-container');
    const label = document.getElementById('files-section-label');
    if (!container) return;
    if (label) label.style.display = 'block';

    if (this.currentView === 'grid') {
      container.innerHTML = `
        <div class="files-grid">
          ${Array(8).fill(0).map(() => `
            <div class="file-card skeleton-card">
              <div class="file-card-preview skeleton-shimmer" style="height: 140px;"></div>
              <div class="file-card-footer">
                <div class="skeleton-shimmer" style="width: 20px; height: 20px; border-radius: 4px; flex-shrink: 0;"></div>
                <div class="file-card-info" style="display: flex; flex-direction: column; gap: 6px; flex: 1;">
                  <div class="skeleton-shimmer" style="width: 75%; height: 13px; border-radius: 3px;"></div>
                  <div class="skeleton-shimmer" style="width: 40%; height: 11px; border-radius: 3px;"></div>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    } else {
      container.innerHTML = `
        <table class="files-table">
          <thead>
            <tr>
              <th style="width: 38px;"></th>
              <th>Name</th>
              <th>Owner</th>
              <th>Last modified</th>
              <th>File size</th>
              <th style="width: 48px;"></th>
            </tr>
          </thead>
          <tbody>
            ${Array(6).fill(0).map(() => `
              <tr class="skeleton-row">
                <td style="width: 38px;"><div class="skeleton-shimmer" style="width: 18px; height: 18px; border-radius: 4px;"></div></td>
                <td>
                  <div style="display: flex; align-items: center; gap: 12px;">
                    <div class="skeleton-shimmer" style="width: 20px; height: 20px; border-radius: 4px; flex-shrink: 0;"></div>
                    <div class="skeleton-shimmer" style="width: 160px; height: 14px; border-radius: 4px;"></div>
                  </div>
                </td>
                <td><div class="skeleton-shimmer" style="width: 50px; height: 12px; border-radius: 4px;"></div></td>
                <td><div class="skeleton-shimmer" style="width: 70px; height: 12px; border-radius: 4px;"></div></td>
                <td><div class="skeleton-shimmer" style="width: 45px; height: 12px; border-radius: 4px;"></div></td>
                <td></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
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

    this.renderFoldersSkeleton();

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
    const isPublic = folder.is_public === true;
    const canManage = !this.isPublicMode || this.isOwnerMode;

    return `
      <div class="folder-card"
           data-id="${folder.id}"
           draggable="${canManage}"
           onclick="Drive.onFolderClick(event, '${folder.id}')"
           oncontextmenu="Drive.showFolderContextMenu(event, '${folder.id}')"
           ondragover="Drive.onFolderDragOver(event)"
           ondragleave="Drive.onFolderDragLeave(event)"
           ondrop="Drive.onFolderDrop(event, '${folder.id}')">
        <div class="folder-card-main">
          ${Icons.folder}
          <span class="folder-name" title="${folder.name}">${folder.name}</span>
        </div>
        <div class="folder-card-actions">
          <button class="icon-btn-subtle" onclick="event.stopPropagation(); Drive.openShareFolderModal('${folder.id}')" title="Share folder">
            ${Icons.share}
          </button>
          ${canManage ? `
            <button class="vis-badge ${isPublic ? 'public' : 'private'}"
                    onclick="Drive.toggleFolderVisibility(event, '${folder.id}')"
                    title="Click to toggle Public / Private">
              ${isPublic ? Icons.globe : Icons.lock}
              <span>${isPublic ? 'Public' : 'Private'}</span>
            </button>
          ` : ''}
        </div>
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

    if (page === 1) {
      this.renderFilesSkeleton();
    }

    const loader = document.getElementById('infinite-loader');
    if (loader && page > 1) loader.classList.remove('hidden');

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
          <div style="margin-bottom: 12px;">${Icons.storage_drive}</div>
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
                <th style="width: 38px;"></th>
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

    this.updateSelectedElementStyles();
  },

  // THUMBNAIL & CARD PREVIEW ENGINE (ZERO BROKEN ICONS)
  renderFileCard(file) {
    const isImg = file.category === 'image';
    const isPublic = file.is_public === true;
    const canManage = !this.isPublicMode || this.isOwnerMode;
    const isSelected = this.selectedFileIds.has(file.id);

    return `
      <div class="file-card ${isSelected ? 'selected' : ''}"
           data-id="${file.id}"
           draggable="${canManage}"
           ondragstart="Drive.onDragStart(event, '${file.id}')"
           ondragend="Drive.onDragEnd(event)"
           onclick="Drive.onFileClick(event, '${file.id}')"
           oncontextmenu="Drive.showContextMenu(event, '${file.id}')">

        <div class="file-card-preview">
          <!-- Selection Checkbox -->
          <div class="card-select-checkbox ${isSelected ? 'checked' : ''}"
               onclick="Drive.toggleFileSelection(event, '${file.id}')"
               title="Select item">
            ${isSelected ? Icons.check : ''}
          </div>

          <div class="preview-backdrop-icon">
            ${getFileIcon(file.category, file.extension)}
          </div>
          ${isImg && file.hosted_url ? `
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
    const isPublic = file.is_public === true;
    const canManage = !this.isPublicMode || this.isOwnerMode;
    const isSelected = this.selectedFileIds.has(file.id);

    return `
      <tr class="${isSelected ? 'selected' : ''}"
          data-id="${file.id}"
          draggable="${canManage}"
          ondragstart="Drive.onDragStart(event, '${file.id}')"
          ondragend="Drive.onDragEnd(event)"
          onclick="Drive.onFileClick(event, '${file.id}')"
          oncontextmenu="Drive.showContextMenu(event, '${file.id}')">
        <td style="width: 38px;" onclick="event.stopPropagation()">
          <div class="row-select-checkbox ${isSelected ? 'checked' : ''}"
               onclick="Drive.toggleFileSelection(event, '${file.id}')"
               title="Select item">
            ${isSelected ? Icons.check : ''}
          </div>
        </td>
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
    if (e.target.closest('.icon-btn') || e.target.closest('.vis-badge') || e.target.closest('.vis-badge-overlay') || e.target.closest('.card-select-checkbox') || e.target.closest('.row-select-checkbox')) return;

    if (e.ctrlKey || e.metaKey || e.shiftKey || this.selectedFileIds.size > 0) {
      this.toggleFileSelection(e, fileId);
      return;
    }

    const file = this.files.find(f => f.id === fileId);
    if (file) {
      Viewer.open(file);
    }
  },

  openFolder(folderId) {
    this.currentFolderId = folderId;
    this.clearSelection();
    this.reload();
  },

  onFolderClick(e, folderId) {
    if (e && (e.target.closest('.folder-card-actions') || e.target.closest('.vis-badge') || e.target.closest('.icon-btn-subtle'))) {
      return;
    }
    this.openFolder(folderId);
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
    const moveIds = this.selectedFileIds.has(fileId) ? Array.from(this.selectedFileIds) : [fileId];
    e.dataTransfer.setData('application/x-haul-file', JSON.stringify(moveIds));
    e.dataTransfer.effectAllowed = 'move';

    moveIds.forEach(id => {
      const el = document.querySelector(`[data-id="${id}"]`);
      if (el) el.classList.add('dragging');
    });
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

    let moveIds = [];
    try {
      const raw = e.dataTransfer.getData('application/x-haul-file');
      moveIds = JSON.parse(raw);
    } catch {
      if (this.draggedFileId) moveIds = [this.draggedFileId];
    }

    if (!moveIds || !moveIds.length || moveIds.includes(targetFolderId)) return;

    try {
      await API.moveFiles(moveIds, targetFolderId);
      this.showToast(`Moved ${moveIds.length} item(s) successfully.`);
      this.clearSelection();
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

    let moveIds = [];
    try {
      const raw = e.dataTransfer.getData('application/x-haul-file');
      moveIds = JSON.parse(raw);
    } catch {
      if (this.draggedFileId) moveIds = [this.draggedFileId];
    }

    if (!moveIds || !moveIds.length) return;

    try {
      await API.moveFiles(moveIds, targetFolderId);
      this.showToast(`Moved ${moveIds.length} item(s) successfully.`);
      this.clearSelection();
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
  async openMoveModal(itemIdOrIds, itemType = 'file', itemName = 'item') {
    this.moveTargetItem = { id: itemIdOrIds, type: itemType, name: itemName };
    this.selectedMoveFolderId = null;

    const modal = document.getElementById('move-modal');
    const titleEl = document.getElementById('move-modal-title');
    const treeEl = document.getElementById('move-folder-tree');
    const confirmBtn = document.getElementById('move-confirm-btn');

    if (titleEl) titleEl.textContent = `Move ${itemName} to...`;
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
      } else if (type === 'bulk') {
        await API.moveFiles(id, targetFolderId);
        this.clearSelection();
      } else {
        await API.moveFiles([id], targetFolderId);
      }
      this.closeMoveModal();
      this.showToast(`Moved ${name} successfully.`);
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

    const newPublic = !file.is_public;
    try {
      await API.toggleFileVisibility(fileId, newPublic);
      file.is_public = newPublic;
      this.showToast(`Set to ${newPublic ? 'Public' : 'Private'}`);
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

    const newPublic = !folder.is_public;
    try {
      await API.toggleFolderVisibility(folderId, newPublic);
      folder.is_public = newPublic;
      this.showToast(`Folder set to ${newPublic ? 'Public' : 'Private'}`);
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
    const isPublic = file.is_public === true;
    const isOwner = Boolean(this.isOwnerMode || (Auth.currentUser && this.profileUsername && Auth.currentUser.username && Auth.currentUser.username.toLowerCase() === this.profileUsername.toLowerCase()));
    const canManage = !this.isPublicMode || isOwner;

    let html = `
      <div class="context-menu-item" onclick="Viewer.open(Drive.selectedFile)">
        ${Icons.info} <span>Preview</span>
      </div>
      <div class="context-menu-item" onclick="Drive.shareFile('${file.id}')">
        ${Icons.share} <span>Share</span>
      </div>
      <div class="context-menu-item" onclick="Drive.copyDirectLink('${file.hosted_url}', '${file.name.replace(/'/g, "\\'")}')">
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
    this.positionContextMenu(e, menu);
  },

  showFolderContextMenu(e, folderId) {
    e.preventDefault();
    e.stopPropagation();

    const folder = this.folders.find(f => f.id === folderId);
    if (!folder) return;

    const menu = document.getElementById('context-menu');
    if (!menu) return;

    const isOwner = Boolean(this.isOwnerMode || (Auth.currentUser && this.profileUsername && Auth.currentUser.username && Auth.currentUser.username.toLowerCase() === this.profileUsername.toLowerCase()));
    const canManage = !this.isPublicMode || isOwner;
    const isPublic = folder.is_public === true;

    let html = `
      <div class="context-menu-item" onclick="Drive.openFolder('${folder.id}')">
        ${Icons.folder_open} <span>Open folder</span>
      </div>
      <div class="context-menu-item" onclick="Drive.openShareFolderModal('${folder.id}')">
        ${Icons.share} <span>Share folder</span>
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
    this.positionContextMenu(e, menu);
  },

  positionContextMenu(e, menu) {
    menu.style.display = 'block';
    menu.style.visibility = 'hidden';
    menu.style.top = '0px';
    menu.style.left = '0px';

    const menuRect = menu.getBoundingClientRect();
    const menuHeight = menuRect.height || 260;
    const menuWidth = menuRect.width || 210;

    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;

    let clickX = (e && typeof e.clientX === 'number') ? e.clientX : 0;
    let clickY = (e && typeof e.clientY === 'number') ? e.clientY : 0;

    if (!clickX && !clickY && e && e.currentTarget && e.currentTarget.getBoundingClientRect) {
      const rect = e.currentTarget.getBoundingClientRect();
      clickX = rect.left;
      clickY = rect.bottom;
    }

    let top = clickY;
    // Smart flip-up: If opening downward would push menu past screen bottom (or Windows taskbar), open upward
    if (top + menuHeight > viewportHeight - 16) {
      top = Math.max(16, clickY - menuHeight);
    }

    let left = clickX;
    // Keep menu within screen right boundary
    if (left + menuWidth > viewportWidth - 16) {
      left = Math.max(16, viewportWidth - menuWidth - 16);
    }

    menu.style.top = `${top}px`;
    menu.style.left = `${left}px`;
    menu.style.visibility = 'visible';
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

  shareFile(fileId) {
    const file = this.files.find(f => f.id === fileId);
    if (!file) return;
    const url = file.hosted_url || '';
    if (!url) return;
    navigator.clipboard.writeText(url).then(() => {
      this.showToast('Shareable file link copied to clipboard!');
      if (API.logActivity) {
        API.logActivity('share', `Shared link for '${file.name}'`, file.name, 'file');
      }
    }).catch(() => {
      this.showToast('Failed to copy link', 'error');
    });
  },

  copyDirectLink(url, name) {
    const fileName = name || (this.selectedFile ? this.selectedFile.name : 'file');
    navigator.clipboard.writeText(url).then(() => {
      this.showToast('Direct media link copied to clipboard!');
      if (API.logActivity) {
        API.logActivity('share', `Shared direct link for '${fileName}'`, fileName, 'file');
      }
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
  },

  // ==========================================
  // NAVIGATION & ACTIVITIES FEED
  // ==========================================
  switchNav(nav) {
    if (this.isPublicMode && !this.isOwnerMode) return;

    document.querySelectorAll('.nav-list .nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.nav === nav);
    });
    document.querySelectorAll('#mobile-tab-bar .mobile-tab-item').forEach(el => {
      el.classList.toggle('active', el.dataset.nav === nav);
    });

    this.currentNav = nav || 'drive';
    this.currentFolderId = null;
    this.searchQuery = '';
    this.clearSelection();

    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.value = '';

    if (this.isPublicMode) {
      history.pushState(null, '', '/');
      this.isPublicMode = false;
      this.profileUsername = null;
      this.isOwnerMode = false;
    }

    this.reload();
  },

  async loadActivities() {
    const listEl = document.getElementById('activity-list');
    if (!listEl) return;

    listEl.innerHTML = `
      <div style="padding: 40px 0; text-align: center; color: var(--color-text-secondary, #5f6368);">
        <div class="drive-spinner" style="margin: 0 auto 12px;"></div>
        <div>Loading activity feed...</div>
      </div>
    `;

    try {
      const res = await API.getActivities(60);
      const activities = (res && res.activities) ? res.activities : [];

      if (activities.length === 0) {
        listEl.innerHTML = `
          <div class="activity-empty-state">
            <div class="activity-empty-icon">${Icons.bell || Icons.activity}</div>
            <div class="activity-empty-title">No Recent Activity</div>
            <div class="activity-empty-desc">Your file uploads, sharing, visibility changes, moves, and deletions will be logged here in real-time.</div>
          </div>
        `;
        return;
      }

      listEl.innerHTML = activities.map(act => this.renderActivityItem(act)).join('');
    } catch (err) {
      listEl.innerHTML = `
        <div class="activity-empty-state">
          <div class="activity-empty-icon">${Icons.alert_triangle}</div>
          <div class="activity-empty-title">Unable to Load Activity</div>
          <div class="activity-empty-desc">${this.escapeHtml(err.message || 'Please check your connection and try again.')}</div>
        </div>
      `;
    }
  },

  renderActivityItem(act) {
    const action = act.action || 'activity';
    let icon = Icons.activity;
    let badgeClass = 'badge-info';
    let badgeText = 'Activity';

    switch (action) {
      case 'upload':
        icon = Icons.storage_drive || Icons.cloud || Icons.file_generic;
        badgeClass = 'badge-upload';
        badgeText = 'Upload';
        break;
      case 'public':
        icon = Icons.globe;
        badgeClass = 'badge-public';
        badgeText = 'Public';
        break;
      case 'private':
        icon = Icons.lock;
        badgeClass = 'badge-private';
        badgeText = 'Private';
        break;
      case 'share':
        icon = Icons.link || Icons.share;
        badgeClass = 'badge-share';
        badgeText = 'Shared';
        break;
      case 'delete':
        icon = Icons.trash;
        badgeClass = 'badge-delete';
        badgeText = 'Deleted';
        break;
      case 'move':
        icon = Icons.move;
        badgeClass = 'badge-move';
        badgeText = 'Moved';
        break;
      case 'folder':
        icon = Icons.folder;
        badgeClass = 'badge-folder';
        badgeText = 'Folder';
        break;
      case 'restore':
        icon = Icons.check || Icons.storage_drive;
        badgeClass = 'badge-restore';
        badgeText = 'Restored';
        break;
      case 'rename':
        icon = Icons.rename || Icons.edit;
        badgeClass = 'badge-rename';
        badgeText = 'Renamed';
        break;
      case 'empty_trash':
        icon = Icons.trash;
        badgeClass = 'badge-delete';
        badgeText = 'Cleaned';
        break;
    }

    const timeAgo = this.formatTimeAgo(act.created_at);
    const itemName = this.escapeHtml(act.item_name || 'Item');
    const details = this.escapeHtml(act.details || '');

    return `
      <div class="activity-card">
        <div class="activity-icon-bubble ${badgeClass}">
          ${icon}
        </div>
        <div class="activity-content">
          <div class="activity-title-row">
            <span class="activity-text">${details || itemName}</span>
            <span class="activity-badge ${badgeClass}">${badgeText}</span>
          </div>
          <div class="activity-meta">
            <span class="activity-time">${timeAgo}</span>
            ${act.item_type ? `<span class="activity-bullet">•</span><span class="activity-type">${this.escapeHtml(act.item_type)}</span>` : ''}
          </div>
        </div>
      </div>
    `;
  },

  async clearActivities() {
    if (!confirm('Clear all recent activity logs?')) return;
    try {
      await API.clearActivities();
      this.showToast('Activity history cleared');
      await this.loadActivities();
    } catch (err) {
      this.showToast(err.message || 'Failed to clear activity', 'error');
    }
  },

  formatTimeAgo(dateStr) {
    if (!dateStr) return 'Just now';
    const date = new Date(dateStr);
    const now = new Date();
    const diffSec = Math.floor((now - date) / 1000);

    if (diffSec < 45) return 'Just now';
    if (diffSec < 90) return '1 min ago';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)} mins ago`;
    if (diffSec < 7200) return '1 hour ago';
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} hours ago`;
    if (diffSec < 172800) return 'Yesterday';
    if (diffSec < 604800) return `${Math.floor(diffSec / 86400)} days ago`;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  },

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
};
