// Haul Pro - API Client & Predictive Prefetching Engine

const API = {
  baseUrl: '',
  prefetchCache: new Map(),
  preloadedImages: new Set(),

  async request(endpoint, options = {}) {
    const defaultHeaders = {};
    if (options.body && !(options.body instanceof FormData)) {
      defaultHeaders['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }

    options.headers = Object.assign(defaultHeaders, options.headers || {});
    options.credentials = 'include'; // Send HTTP-only auth cookies

    const response = await fetch(this.baseUrl + endpoint, options);
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (response.status === 401 && !endpoint.includes('/auth/')) {
        Auth.showLogin();
      }
      throw new Error(data.error || `HTTP error ${response.status}`);
    }

    return data;
  },

  // Auth APIs
  async register(name, email, password) {
    return this.request('/api/auth/register', { method: 'POST', body: { name, email, password } });
  },

  async login(email, password) {
    return this.request('/api/auth/login', { method: 'POST', body: { email, password } });
  },

  async logout() {
    return this.request('/api/auth/logout', { method: 'POST' });
  },

  async getMe() {
    return this.request('/api/auth/me');
  },

  async updateProfile(updates) {
    return this.request('/api/auth/profile', { method: 'PATCH', body: updates });
  },

  async uploadAvatar(file) {
    const formData = new FormData();
    formData.append('avatar', file);
    return this.request('/api/auth/profile/avatar', {
      method: 'POST',
      body: formData
    });
  },

  // Folder APIs
  async getFolders(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/api/folders?${query}`);
  },

  async createFolder(name, parentId = null) {
    return this.request('/api/folders', { method: 'POST', body: { name, parentId } });
  },

  async updateFolder(folderId, updates) {
    return this.request(`/api/folders/${folderId}`, { method: 'PATCH', body: updates });
  },

  async deleteFolder(folderId) {
    return this.request(`/api/folders/${folderId}`, { method: 'DELETE' });
  },

  // File APIs with Predictive Lookahead Prefetching
  async getFiles(params = {}, usePrefetch = true) {
    const cacheKey = JSON.stringify(params);

    if (usePrefetch && this.prefetchCache.has(cacheKey)) {
      const cachedData = this.prefetchCache.get(cacheKey);
      this.prefetchCache.delete(cacheKey);

      // Trigger prefetch for next page (N + 1)
      this.triggerPrefetchNext(params);
      return cachedData;
    }

    const query = new URLSearchParams(params).toString();
    const data = await this.request(`/api/files?${query}`);

    // Pre-warm browser cache for media/image items
    if (data.files && data.files.length) {
      this.prewarmMedia(data.files);
    }

    // Trigger prefetch for next page
    if (data.has_more) {
      this.triggerPrefetchNext(params);
    }

    return data;
  },

  triggerPrefetchNext(params) {
    const nextPage = (parseInt(params.page, 10) || 1) + 1;
    const nextParams = Object.assign({}, params, { page: nextPage });
    const cacheKey = JSON.stringify(nextParams);

    if (this.prefetchCache.has(cacheKey)) return;

    // Use idle callback or request next batch with delay
    setTimeout(async () => {
      try {
        const query = new URLSearchParams(nextParams).toString();
        const data = await this.request(`/api/files?${query}`);
        this.prefetchCache.set(cacheKey, data);
        
        // Also pre-warm images in the prefetched batch
        if (data.files) {
          this.prewarmMedia(data.files);
        }
      } catch (e) {
        // Silent failure for prefetch
      }
    }, 200);
  },

  prewarmMedia(files) {
    files.forEach(file => {
      if (file.category === 'image' && file.hosted_url && !this.preloadedImages.has(file.hosted_url)) {
        this.preloadedImages.add(file.hosted_url);
        const img = new Image();
        img.src = file.hosted_url;
      }
    });
  },

  async uploadFiles(files, folderId = null, onProgress = null) {
    const formData = new FormData();
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i]);
    }
    if (folderId && folderId !== 'root') {
      formData.append('folderId', folderId);
    }

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/files/upload');
      xhr.withCredentials = true;

      if (onProgress && xhr.upload) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100);
            onProgress(percent);
          }
        };
      }

      xhr.onload = () => {
        try {
          const res = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(res);
          } else {
            reject(new Error(res.error || 'Upload failed'));
          }
        } catch (err) {
          reject(new Error('Invalid response'));
        }
      };

      xhr.onerror = () => reject(new Error('Network error during upload'));
      xhr.send(formData);
    });
  },

  async updateFile(fileId, updates) {
    return this.request(`/api/files/${fileId}`, { method: 'PATCH', body: updates });
  },

  async deleteFile(fileId, permanent = false) {
    return this.request(`/api/files/${fileId}?permanent=${permanent}`, { method: 'DELETE' });
  },

  // Move APIs
  async moveFiles(fileIds, targetFolderId = null) {
    return this.request('/api/files/move', {
      method: 'POST',
      body: { fileIds: Array.isArray(fileIds) ? fileIds : [fileIds], targetFolderId }
    });
  },

  async moveFolder(folderId, targetParentId = null) {
    return this.request('/api/folders/move', {
      method: 'POST',
      body: { folderId, targetParentId }
    });
  },

  // Visibility APIs (Public Profile Toggle)
  async toggleFileVisibility(fileId, isPublic) {
    return this.request(`/api/files/${fileId}/visibility`, {
      method: 'PATCH',
      body: { isPublic }
    });
  },

  async toggleFolderVisibility(folderId, isPublic) {
    return this.request(`/api/folders/${folderId}/visibility`, {
      method: 'PATCH',
      body: { isPublic }
    });
  },

  // Public Profile API (/<username>)
  async getPublicProfile(username, params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.request(`/api/public/${encodeURIComponent(username)}?${query}`);
  }
};
