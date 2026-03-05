import axios from 'axios';

const BASE = '';  // relative URLs — Vite proxy forwards /manage/* → localhost:9090

const apiClient = axios.create({
  baseURL: BASE,
  timeout: 30000,
});

// Request interceptor for logging
apiClient.interceptors.request.use(
  (config) => {
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for error normalization
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response) {
      const message = error.response.data?.message || error.response.data || error.message;
      error.displayMessage = typeof message === 'string' ? message : JSON.stringify(message);
    } else if (error.request) {
      error.displayMessage = 'Network error: Unable to reach the ESB server.';
    } else {
      error.displayMessage = error.message;
    }
    return Promise.reject(error);
  }
);

export const esbApi = {
  // Route management
  getRoutes: () => apiClient.get('/manage/routes'),

  validateSpec: (yaml: string) =>
    apiClient.post('/manage/routes/validate', yaml, {
      headers: { 'Content-Type': 'text/plain' },
    }),

  deployRoute: (yaml: string) =>
    apiClient.post('/manage/routes', yaml, {
      headers: { 'Content-Type': 'text/plain' },
    }),

  getRoute: (name: string) => apiClient.get(`/manage/routes/${name}`),

  deleteRoute: (name: string) => apiClient.delete(`/manage/routes/${name}`),

  reloadRoute: (name: string) => apiClient.put(`/manage/routes/${name}/reload`),

  persistRoute: (name: string, yaml: string) =>
    apiClient.post(`/manage/routes/${name}/persist`, yaml, {
      headers: { 'Content-Type': 'text/plain' },
    }),

  // Health check
  getHealth: () => apiClient.get('/manage/health'),

  // Registered component types — drives the UI palette
  getComponents: () => apiClient.get('/manage/components'),

  // Transform live preview
  previewTransform: (payload: { type: string; spec: string; input: string }) =>
    apiClient.post<{ success: boolean; output?: string; error?: string }>(
      '/manage/transforms/preview', payload
    ),
};

export default esbApi;
