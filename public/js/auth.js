// Haul Pro - Authentication & Profile Controller
// Instagram-style Profile Updates, Avatar Upload, and Auth State

const Auth = {
  currentUser: null,
  isRegisterMode: false,

  init() {
    this.bindEvents();
    this.bindEditProfileEvents();
    this.checkSession();
  },

  bindEvents() {
    const authForm = document.getElementById('auth-form');
    const switchModeBtn = document.getElementById('auth-switch-mode-btn');
    const profileBtn = document.getElementById('user-profile-btn');
    const logoutBtn = document.getElementById('profile-logout-btn');
    const topbarSigninBtn = document.getElementById('topbar-signin-btn');
    const profilePublicBtn = document.getElementById('profile-public-link-btn');
    const profileCopyBtn = document.getElementById('profile-copy-url-btn');

    if (authForm) {
      authForm.addEventListener('submit', (e) => this.handleSubmit(e));
    }

    if (switchModeBtn) {
      switchModeBtn.addEventListener('click', () => this.toggleMode());
    }

    if (profileBtn) {
      profileBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.toggleProfileDropdown();
      });
    }

    if (topbarSigninBtn) {
      topbarSigninBtn.addEventListener('click', () => {
        this.showLogin();
      });
    }

    if (profilePublicBtn) {
      profilePublicBtn.addEventListener('click', () => {
        const dropdown = document.getElementById('profile-dropdown');
        if (dropdown) dropdown.style.display = 'none';
        if (this.currentUser && this.currentUser.username) {
          history.pushState(null, '', `/${this.currentUser.username}`);
          Drive.isPublicMode = true;
          Drive.profileUsername = this.currentUser.username;
          Drive.currentTab = 'public';
          Drive.currentFolderId = null;
          Drive.page = 1;
          Drive.clearSelection();
          Drive.reload();
        }
      });
    }

    if (profileCopyBtn) {
      profileCopyBtn.addEventListener('click', () => {
        const dropdown = document.getElementById('profile-dropdown');
        if (dropdown) dropdown.style.display = 'none';
        if (this.currentUser && this.currentUser.username) {
          const publicUrl = `${window.location.origin}/${this.currentUser.username}`;
          navigator.clipboard.writeText(publicUrl).then(() => {
            Drive.showToast('Public profile link copied to clipboard!');
          });
        }
      });
    }

    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => this.handleLogout());
    }

    document.addEventListener('click', () => {
      const dropdown = document.getElementById('profile-dropdown');
      if (dropdown) dropdown.style.display = 'none';
    });
  },

  bindEditProfileEvents() {
    const editBtn = document.getElementById('profile-edit-btn');
    const bannerEditBtn = document.getElementById('banner-edit-profile-btn');
    const closeBtn = document.getElementById('edit-profile-close-btn');
    const cancelBtn = document.getElementById('edit-profile-cancel-btn');
    const editForm = document.getElementById('edit-profile-form');
    const avatarInput = document.getElementById('edit-modal-avatar-input');
    const instaAvatarInput = document.getElementById('insta-avatar-file-input');
    const instaChangeAvatarBtn = document.getElementById('insta-change-avatar-btn');
    const bioInput = document.getElementById('edit-bio-input');
    const unameInput = document.getElementById('edit-username-input');

    if (editBtn) {
      editBtn.addEventListener('click', () => {
        const dropdown = document.getElementById('profile-dropdown');
        if (dropdown) dropdown.style.display = 'none';
        this.openEditProfileModal();
      });
    }

    if (bannerEditBtn) {
      bannerEditBtn.addEventListener('click', () => this.openEditProfileModal());
    }

    if (closeBtn) closeBtn.addEventListener('click', () => this.closeEditProfileModal());
    if (cancelBtn) cancelBtn.addEventListener('click', () => this.closeEditProfileModal());

    if (editForm) {
      editForm.addEventListener('submit', (e) => this.handleProfileSubmit(e));
    }

    if (avatarInput) {
      avatarInput.addEventListener('change', (e) => this.handleAvatarFileChange(e));
    }

    if (instaChangeAvatarBtn && instaAvatarInput) {
      instaChangeAvatarBtn.addEventListener('click', () => instaAvatarInput.click());
      instaAvatarInput.addEventListener('change', (e) => this.handleAvatarFileChange(e));
    }

    if (bioInput) {
      bioInput.addEventListener('input', (e) => {
        const countEl = document.getElementById('bio-char-count');
        if (countEl) countEl.textContent = e.target.value.length;
      });
    }

    if (unameInput) {
      unameInput.addEventListener('input', (e) => {
        const hintEl = document.getElementById('edit-profile-url-hint');
        const clean = e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '');
        if (hintEl) hintEl.textContent = `${window.location.host}/${clean || 'username'}`;
      });
    }
  },

  openEditProfileModal() {
    if (!this.currentUser) return;

    const modal = document.getElementById('edit-profile-modal');
    const nameInput = document.getElementById('edit-name-input');
    const unameInput = document.getElementById('edit-username-input');
    const bioInput = document.getElementById('edit-bio-input');
    const countEl = document.getElementById('bio-char-count');
    const hintEl = document.getElementById('edit-profile-url-hint');
    const nameDisplay = document.getElementById('edit-photo-name-display');
    const errBox = document.getElementById('edit-profile-error');

    if (nameInput) nameInput.value = this.currentUser.name || '';
    if (unameInput) unameInput.value = this.currentUser.username || '';
    if (bioInput) bioInput.value = this.currentUser.bio || '';
    if (countEl) countEl.textContent = (this.currentUser.bio || '').length;
    if (hintEl) hintEl.textContent = `${window.location.host}/${this.currentUser.username || 'username'}`;
    if (nameDisplay) nameDisplay.textContent = this.currentUser.name || 'User';
    if (errBox) errBox.style.display = 'none';

    this.renderAvatarPreviewInModal(this.currentUser);

    if (modal) modal.style.display = 'flex';
  },

  closeEditProfileModal() {
    const modal = document.getElementById('edit-profile-modal');
    if (modal) modal.style.display = 'none';
  },

  renderAvatarPreviewInModal(user) {
    const initialEl = document.getElementById('edit-modal-avatar-initial');
    const imgEl = document.getElementById('edit-modal-avatar-img');
    const initial = (user.name || user.email || 'U').charAt(0).toUpperCase();

    if (user.avatar_url && imgEl && initialEl) {
      imgEl.src = user.avatar_url;
      imgEl.style.display = 'block';
      initialEl.style.display = 'none';
    } else if (imgEl && initialEl) {
      imgEl.style.display = 'none';
      initialEl.textContent = initial;
      initialEl.style.display = 'block';
    }
  },

  async handleAvatarFileChange(e) {
    const files = e.target.files;
    if (!files || !files.length) return;

    const file = files[0];
    Drive.showToast('Uploading profile photo...');

    try {
      const res = await API.uploadAvatar(file);
      if (res.success && res.avatar_url) {
        if (this.currentUser) {
          this.currentUser.avatar_url = res.avatar_url;
        }
        this.setCurrentUser(this.currentUser);
        this.renderAvatarPreviewInModal(this.currentUser);
        Drive.showToast('Profile photo updated successfully!');

        // If currently in public profile view, refresh banner
        if (Drive.isPublicMode) {
          Drive.reload();
        }
      }
    } catch (err) {
      Drive.showToast(err.message || 'Failed to upload photo', 'error');
    }
  },

  async handleProfileSubmit(e) {
    e.preventDefault();
    const errBox = document.getElementById('edit-profile-error');
    const saveBtn = document.getElementById('edit-profile-save-btn');
    if (errBox) errBox.style.display = 'none';

    const name = document.getElementById('edit-name-input').value.trim();
    const username = document.getElementById('edit-username-input').value.trim().toLowerCase();
    const bio = document.getElementById('edit-bio-input').value.trim();

    if (!name) {
      if (errBox) {
        errBox.textContent = 'Name is required.';
        errBox.style.display = 'block';
      }
      return;
    }

    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving...';
    }

    try {
      const oldUsername = this.currentUser ? this.currentUser.username : '';
      const res = await API.updateProfile({ name, username, bio });

      if (res.success && res.user) {
        this.setCurrentUser(res.user);
        this.closeEditProfileModal();
        Drive.showToast('Profile saved successfully!');

        // If username changed and currently viewing old profile URL, update URL
        if (Drive.isPublicMode && oldUsername !== res.user.username) {
          history.pushState(null, '', `/${res.user.username}`);
          Drive.profileUsername = res.user.username;
        }

        if (Drive.isPublicMode) {
          Drive.reload();
        }
      }
    } catch (err) {
      if (errBox) {
        errBox.textContent = err.message || 'Failed to update profile.';
        errBox.style.display = 'block';
      }
    } finally {
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save';
      }
    }
  },

  async checkSession() {
    const isProfilePath = Drive.getProfileUsernameFromUrl();
    try {
      const data = await API.getMe();
      if (data.success && data.user) {
        this.setCurrentUser(data.user);
        this.hideModal();
        Drive.init();
      } else {
        if (isProfilePath) {
          this.setGuestMode();
          Drive.init();
        } else {
          Drive.hideLoadingScreen();
          this.showLogin();
        }
      }
    } catch (e) {
      if (isProfilePath) {
        this.setGuestMode();
        Drive.init();
      } else {
        Drive.hideLoadingScreen();
        this.showLogin();
      }
    }
  },

  setGuestMode() {
    this.currentUser = null;
    const profileBtn = document.getElementById('user-profile-btn');
    const signinBtn = document.getElementById('topbar-signin-btn');
    if (profileBtn) profileBtn.style.display = 'none';
    if (signinBtn) signinBtn.style.display = 'block';
    this.hideModal();
  },

  setCurrentUser(user) {
    this.currentUser = user;
    const initial = (user.name || user.email || 'U').charAt(0).toUpperCase();

    // Topbar Profile Button
    const profileBtn = document.getElementById('user-profile-btn');
    const signinBtn = document.getElementById('topbar-signin-btn');
    if (profileBtn) {
      profileBtn.style.display = 'flex';
      if (user.avatar_url) {
        profileBtn.innerHTML = `<img src="${user.avatar_url}" class="user-avatar-topbar-img" alt="" referrerpolicy="no-referrer">`;
        profileBtn.style.backgroundColor = 'transparent';
      } else {
        profileBtn.textContent = initial;
        profileBtn.style.backgroundColor = user.avatar_color || '#1a73e8';
      }
    }
    if (signinBtn) signinBtn.style.display = 'none';

    // Dropdown elements
    const dropdownAvatarInitial = document.getElementById('profile-dropdown-initial');
    const dropdownAvatarImg = document.getElementById('profile-dropdown-img');
    const dropdownAvatarWrap = document.getElementById('profile-avatar-lg');
    const dropdownName = document.getElementById('profile-name');
    const dropdownEmail = document.getElementById('profile-email');
    const dropdownUserTag = document.getElementById('profile-username-tag');
    const dropdownBio = document.getElementById('profile-dropdown-bio');
    const dropdownUrlPreview = document.getElementById('profile-public-url-preview');

    if (user.avatar_url && dropdownAvatarImg && dropdownAvatarInitial) {
      dropdownAvatarImg.src = user.avatar_url;
      dropdownAvatarImg.style.display = 'block';
      dropdownAvatarInitial.style.display = 'none';
      if (dropdownAvatarWrap) dropdownAvatarWrap.style.backgroundColor = 'transparent';
    } else if (dropdownAvatarInitial && dropdownAvatarImg) {
      dropdownAvatarImg.style.display = 'none';
      dropdownAvatarInitial.textContent = initial;
      dropdownAvatarInitial.style.display = 'block';
      if (dropdownAvatarWrap) dropdownAvatarWrap.style.backgroundColor = user.avatar_color || '#1a73e8';
    }

    if (dropdownName) dropdownName.textContent = user.name || 'User';
    if (dropdownEmail) dropdownEmail.textContent = user.email || '';
    if (dropdownUserTag) dropdownUserTag.textContent = `@${user.username || 'user'}`;

    if (dropdownBio) {
      if (user.bio) {
        dropdownBio.textContent = user.bio;
        dropdownBio.style.display = 'block';
      } else {
        dropdownBio.style.display = 'none';
      }
    }

    if (dropdownUrlPreview) {
      dropdownUrlPreview.textContent = `${window.location.origin}/${user.username || 'user'}`;
    }

    this.updateStorageMeter(user.storage_used_bytes, user.storage_limit_bytes);
  },

  updateStorageMeter(usedBytes = 0, limitBytes = 16106127360) {
    const fill = document.getElementById('storage-bar-fill');
    const text = document.getElementById('storage-text');
    if (!fill || !text) return;

    const usedFormatted = this.formatBytes(usedBytes);
    const limitFormatted = this.formatBytes(limitBytes);
    const percent = Math.min(100, Math.round((usedBytes / limitBytes) * 100));

    fill.style.width = `${percent}%`;
    text.textContent = `${usedFormatted} of ${limitFormatted} used`;
  },

  toggleMode() {
    this.isRegisterMode = !this.isRegisterMode;
    const title = document.getElementById('auth-title');
    const subtitle = document.getElementById('auth-subtitle');
    const submitBtn = document.getElementById('auth-submit-btn');
    const switchBtn = document.getElementById('auth-switch-mode-btn');
    const nameGroup = document.getElementById('auth-name-group');
    const errorBox = document.getElementById('auth-error');

    if (errorBox) errorBox.style.display = 'none';

    if (this.isRegisterMode) {
      title.textContent = 'Create an account';
      subtitle.textContent = 'Sign up to manage your files with Haul Pro';
      submitBtn.textContent = 'Sign up';
      switchBtn.textContent = 'Sign in instead';
      nameGroup.style.display = 'flex';
    } else {
      title.textContent = 'Sign in';
      subtitle.textContent = 'Continue to Haul Pro';
      submitBtn.textContent = 'Sign in';
      switchBtn.textContent = 'Create account';
      nameGroup.style.display = 'none';
    }
  },

  async handleSubmit(e) {
    e.preventDefault();
    const errorBox = document.getElementById('auth-error');
    errorBox.style.display = 'none';

    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;
    const name = document.getElementById('auth-name').value.trim();

    try {
      let res;
      if (this.isRegisterMode) {
        if (!name) throw new Error('Please enter your full name.');
        res = await API.register(name, email, password);
      } else {
        res = await API.login(email, password);
      }

      if (res.success && res.user) {
        this.setCurrentUser(res.user);
        this.hideModal();
        Drive.init();
      }
    } catch (err) {
      errorBox.textContent = err.message || 'Authentication failed.';
      errorBox.style.display = 'block';
    }
  },

  async handleLogout() {
    try {
      await API.logout();
    } catch (e) {}
    this.currentUser = null;
    this.showLogin();
  },

  showLogin() {
    const backdrop = document.getElementById('auth-backdrop');
    if (backdrop) backdrop.classList.remove('hidden');
  },

  hideModal() {
    const backdrop = document.getElementById('auth-backdrop');
    if (backdrop) backdrop.classList.add('hidden');
  },

  toggleProfileDropdown() {
    const dropdown = document.getElementById('profile-dropdown');
    if (!dropdown) return;
    const isVisible = dropdown.style.display === 'flex';
    dropdown.style.display = isVisible ? 'none' : 'flex';
  },

  formatBytes(bytes, decimals = 1) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }
};
