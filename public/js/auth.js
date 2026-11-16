// Haul Pro - Authentication Controller

const Auth = {
  currentUser: null,
  isRegisterMode: false,

  init() {
    this.bindEvents();
    this.checkSession();
  },

  bindEvents() {
    const authForm = document.getElementById('auth-form');
    const switchModeBtn = document.getElementById('auth-switch-mode-btn');
    const profileBtn = document.getElementById('user-profile-btn');
    const logoutBtn = document.getElementById('profile-logout-btn');

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

    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => this.handleLogout());
    }

    document.addEventListener('click', () => {
      const dropdown = document.getElementById('profile-dropdown');
      if (dropdown) dropdown.style.display = 'none';
    });
  },

  async checkSession() {
    try {
      const data = await API.getMe();
      if (data.success && data.user) {
        this.setCurrentUser(data.user);
        this.hideModal();
        Drive.init();
      } else {
        this.showLogin();
      }
    } catch (e) {
      this.showLogin();
    }
  },

  setCurrentUser(user) {
    this.currentUser = user;
    const initial = (user.name || user.email || 'U').charAt(0).toUpperCase();

    const profileBtn = document.getElementById('user-profile-btn');
    if (profileBtn) {
      profileBtn.textContent = initial;
      if (user.avatar_color) profileBtn.style.backgroundColor = user.avatar_color;
    }

    const dropdownAvatar = document.getElementById('profile-avatar-lg');
    const dropdownName = document.getElementById('profile-name');
    const dropdownEmail = document.getElementById('profile-email');

    if (dropdownAvatar) dropdownAvatar.textContent = initial;
    if (dropdownName) dropdownName.textContent = user.name || 'User';
    if (dropdownEmail) dropdownEmail.textContent = user.email || '';

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
