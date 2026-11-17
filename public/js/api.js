// Haul Pro - API Client & Predictive Prefetching Engine

const API = {
  baseUrl: '',
  uploadHostUrl: 'https://media-hosting.dhyeyp254.workers.dev',
  uploadApiKey: null,
  prefetchCache: new Map(),
  preloadedImages: new Set(),

  getUploadUrl() {
    const host = (this.uploadHostUrl || 'https://media-hosting.dhyeyp254.workers.dev').replace(/\/+$/, '');
    return `${host}/upload`;
  },

  getHostUrlEndpoint() {
    const host = (this.uploadHostUrl || 'https://media-hosting.dhyeyp254.workers.dev').replace(/\/+$/, '');
    return `${host}/hosturl`;
  },

  async initConfig() {
    try {
      const res = await this.request('/api/config');
      if (res && res.media_host_url) {
        this.uploadHostUrl = res.media_host_url;
      }
      if (res && res.api_key) {
        this.uploadApiKey = res.api_key;
      }
    } catch (e) {}
  },

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

  async uploadFileDirect(file, folderId = null, onProgress = null) {
    const defaultVis = typeof Settings !== 'undefined' ? Settings.preferences.defaultVisibility : 'private';
    const isPublic = defaultVis === 'public';

    // 1. Direct Multipart upload to Cloudflare storage worker (Bypasses Vercel 4.5MB limit entirely)
    const uploadUrl = this.getUploadUrl();
    const formData = new FormData();
    formData.append('file', file);

    const cloudflareRes = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', uploadUrl);
      if (this.uploadApiKey) {
        xhr.setRequestHeader('X-API-Key', this.uploadApiKey);
        xhr.setRequestHeader('X-Shelfie-Token', this.uploadApiKey);
      }
      xhr.setRequestHeader('X-Shelfie-Origin', 'shelfie-platform');

      if (onProgress && xhr.upload) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            // Map raw byte upload to 0% - 90%
            const percent = Math.min(90, Math.round((e.loaded / e.total) * 90));
            onProgress(percent);
          }
        };
      }

      xhr.onload = () => {
        try {
          const res = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300 && res.success !== false) {
            resolve(res);
          } else {
            const err = new Error(res.error || `Storage error (${xhr.status})`);
            err.status = xhr.status;
            reject(err);
          }
        } catch (e) {
          reject(new Error(`Storage service error (${xhr.status})`));
        }
      };

      xhr.onerror = () => reject(new Error('Network connection failed to media storage server'));
      xhr.ontimeout = () => reject(new Error('Upload to storage timed out'));
      xhr.send(formData);
    });

    if (onProgress) onProgress(95);

    const hostedUrl = cloudflareRes.url || cloudflareRes.data;
    if (!hostedUrl) {
      throw new Error('Storage service returned invalid URL');
    }

    // 2. Fast lightweight JSON metadata save to Vercel MongoDB
    const recordPayload = {
      name: file.name,
      size: cloudflareRes.size || file.size,
      mime_type: cloudflareRes.media_type || file.type || 'application/octet-stream',
      hosted_url: hostedUrl,
      folder_id: folderId && folderId !== 'root' ? folderId : null,
      is_public: isPublic
    };

    const savedRes = await this.request('/api/files/record', {
      method: 'POST',
      body: recordPayload
    });

    if (onProgress) onProgress(100);

    return savedRes;
  },

  async uploadFiles(files, folderId = null, onProgress = null) {
    const results = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const res = await this.uploadFileDirect(file, folderId, onProgress);
      if (res && res.file) {
        results.push(res.file);
      }
    }
    return { success: true, files: results };
  },

  async uploadFromUrl(remoteUrl, folderId = null) {
    if (!remoteUrl) throw new Error('Remote URL is required');
    const defaultVis = typeof Settings !== 'undefined' ? Settings.preferences.defaultVisibility : 'private';
    const isPublic = defaultVis === 'public';

    // 1. Fetch & host via Cloudflare Worker
    const hostEndpoint = this.getHostUrlEndpoint();
    const targetUrl = `${hostEndpoint}?url=${encodeURIComponent(remoteUrl.trim())}`;
    const headers = {
      'X-Shelfie-Origin': 'shelfie-platform'
    };
    if (this.uploadApiKey) {
      headers['X-API-Key'] = this.uploadApiKey;
      headers['X-Shelfie-Token'] = this.uploadApiKey;
    }
    const res = await fetch(targetUrl, { headers });
    if (!res.ok) {
      throw new Error(`Remote download failed (${res.status})`);
    }
    const data = await res.json();
    const hostedUrl = data.url || data.data;
    if (!hostedUrl) {
      throw new Error('Storage service failed to mirror remote URL');
    }

    // 2. Record metadata in MongoDB
    const recordPayload = {
      name: data.filename || 'remote_file',
      size: data.size || 0,
      mime_type: data.media_type || 'application/octet-stream',
      hosted_url: hostedUrl,
      folder_id: folderId && folderId !== 'root' ? folderId : null,
      is_public: isPublic
    };

    return this.request('/api/files/record', {
      method: 'POST',
      body: recordPayload
    });
  },

  async getActivities() {
    return this.request('/api/activities');
  },

  async clearActivities() {
    return this.request('/api/activities/clear', { method: 'POST' });
  },

  async logActivity(action, details, itemName = 'Item', itemType = 'file', metadata = {}) {
    return this.request('/api/activities/log', {
      method: 'POST',
      body: { action, details, item_name: itemName, item_type: itemType, metadata }
    }).catch(() => {});
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

  async bulkSetVisibility(fileIds, isPublic) {
    return this.request('/api/files/bulk-visibility', {
      method: 'POST',
      body: { fileIds: Array.isArray(fileIds) ? fileIds : [fileIds], isPublic }
    });
  },

  async bulkDelete(fileIds, permanent = false) {
    return this.request('/api/files/bulk-delete', {
      method: 'POST',
      body: { fileIds: Array.isArray(fileIds) ? fileIds : [fileIds], permanent }
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
  },

  // Settings & Account APIs
  async changePassword(current_password, new_password) {
    return this.request('/api/auth/change-password', {
      method: 'POST',
      body: { current_password, new_password }
    });
  },

  async deleteAccount(password) {
    return this.request('/api/auth/delete-account', {
      method: 'POST',
      body: { password }
    });
  },

  async getStorageStats() {
    return this.request('/api/user/storage-stats');
  },

  async emptyTrash() {
    return this.request('/api/files/empty-trash', {
      method: 'POST'
    });
  },

  async updatePreferences(preferences) {
    return this.request('/api/user/preferences', {
      method: 'PATCH',
      body: preferences
    });
  }
};
