import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth
export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }),
  register: (email: string, password: string, name: string) =>
    api.post('/auth/register', { email, password, name }),
  me: () => api.get('/auth/me'),
};

// Streams
export const streamsApi = {
  list: () => api.get('/streams'),
  get: (id: string) => api.get(`/streams/${id}`),
  create: (data: { title: string; description?: string; socialAccounts?: string[] }) =>
    api.post('/streams', data),
  update: (id: string, data: { title?: string; description?: string }) =>
    api.put(`/streams/${id}`, data),
  delete: (id: string) => api.delete(`/streams/${id}`),
  start: (id: string) => api.post(`/streams/${id}/start`),
  stop: (id: string) => api.post(`/streams/${id}/stop`),
  regenerateKey: (id: string) => api.post(`/streams/${id}/regenerate-key`),
};

// Social Accounts
export const socialApi = {
  list: () => api.get('/social'),
  getConnectUrl: (platform: string) => api.get(`/social/connect/${platform}`),
  disconnect: (id: string) => api.delete(`/social/${id}`),
  toggle: (id: string) => api.patch(`/social/${id}/toggle`),
  addCustom: (data: { name: string; rtmpUrl: string; streamKey: string }) =>
    api.post('/social/custom', data),
};

// VOD
export const vodApi = {
  list: (params?: { status?: string; page?: number; limit?: number }) =>
    api.get('/vod', { params }),
  get: (id: string) => api.get(`/vod/${id}`),
  upload: (formData: FormData, onProgress?: (percent: number) => void) =>
    api.post('/vod/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => {
        if (onProgress && e.total) {
          onProgress(Math.round((e.loaded * 100) / e.total));
        }
      },
    }),
  update: (id: string, data: { title?: string; description?: string }) =>
    api.put(`/vod/${id}`, data),
  delete: (id: string) => api.delete(`/vod/${id}`),
  getPlayback: (id: string) => api.get(`/vod/${id}/playback`),
};

// Linear Channels
export const linearApi = {
  list: () => api.get('/linear'),
  get: (id: string) => api.get(`/linear/${id}`),
  create: (data: { name: string; description?: string; loopPlaylist?: boolean }) =>
    api.post('/linear', data),
  update: (id: string, data: { name?: string; description?: string; loopPlaylist?: boolean }) =>
    api.put(`/linear/${id}`, data),
  delete: (id: string) => api.delete(`/linear/${id}`),
  addToPlaylist: (id: string, vodId: string, position?: number) =>
    api.post(`/linear/${id}/playlist`, { vodId, position }),
  removeFromPlaylist: (id: string, itemId: string) =>
    api.delete(`/linear/${id}/playlist/${itemId}`),
  reorderPlaylist: (id: string, items: { id: string; position: number }[]) =>
    api.put(`/linear/${id}/playlist/reorder`, { items }),
  start: (id: string) => api.post(`/linear/${id}/start`),
  stop: (id: string) => api.post(`/linear/${id}/stop`),
  skip: (id: string) => api.post(`/linear/${id}/skip`),
};

// Restream
export const restreamApi = {
  getDestinations: (streamId: string) => api.get(`/restream/stream/${streamId}`),
  addDestination: (streamId: string, socialAccountId: string) =>
    api.post(`/restream/stream/${streamId}`, { socialAccountId }),
  removeDestination: (id: string) => api.delete(`/restream/${id}`),
  start: (id: string) => api.post(`/restream/${id}/start`),
  stop: (id: string) => api.post(`/restream/${id}/stop`),
  getActive: () => api.get('/restream/active'),
};

// Analytics
export const analyticsApi = {
  dashboard: (period?: string) => api.get('/analytics/dashboard', { params: { period } }),
  stream: (id: string, period?: string) =>
    api.get(`/analytics/stream/${id}`, { params: { period } }),
};

export default api;
