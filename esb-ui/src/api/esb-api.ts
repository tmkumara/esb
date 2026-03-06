import axios, { AxiosInstance } from 'axios';

// In dev mode Vite proxy handles routing (VITE_*_URL not set → '' → proxy kicks in).
// In production each variable is set to the deployed server URL, e.g.:
//   VITE_RUNTIME_URL=https://esb-runtime.example.com
//   VITE_DESIGNER_URL=https://esb-designer.example.com
const RUNTIME_BASE  = import.meta.env.VITE_RUNTIME_URL  ?? '';
const DESIGNER_BASE = import.meta.env.VITE_DESIGNER_URL ?? '';

function createClient(baseURL: string): AxiosInstance {
  const client = axios.create({ baseURL, timeout: 30_000 });

  client.interceptors.response.use(
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

  return client;
}

// Routes execution, health, hot-reload → ESB Runtime (port 9090)
const runtimeClient = createClient(RUNTIME_BASE);

// Validation, transform preview, route save, adapter palette → ESB Designer (port 9191)
const designerClient = createClient(DESIGNER_BASE);

const TEXT_PLAIN = { headers: { 'Content-Type': 'text/plain' } };

export const esbApi = {
  // ── Runtime endpoints ─────────────────────────────────────────────────────
  getRoutes:    ()                         => runtimeClient.get('/manage/routes'),
  getRoute:     (name: string)             => runtimeClient.get(`/manage/routes/${name}`),
  deployRoute:  (yaml: string)             => runtimeClient.post('/manage/routes', yaml, TEXT_PLAIN),
  deleteRoute:  (name: string)             => runtimeClient.delete(`/manage/routes/${name}`),
  reloadRoute:  (name: string)             => runtimeClient.put(`/manage/routes/${name}/reload`),
  persistRoute: (name: string, yaml: string) =>
    runtimeClient.post(`/manage/routes/${name}/persist`, yaml, TEXT_PLAIN),
  getHealth:    ()                         => runtimeClient.get('/manage/health'),

  // ── Designer endpoints ────────────────────────────────────────────────────
  validateSpec:     (yaml: string) =>
    designerClient.post('/manage/routes/validate', yaml, TEXT_PLAIN),
  saveRoute:        (yaml: string) =>
    designerClient.post('/manage/routes/save', yaml, TEXT_PLAIN),
  getSavedRoutes:   ()             => designerClient.get('/manage/routes'),
  getComponents:    ()             => designerClient.get('/manage/components'),
  previewTransform: (payload: { type: string; spec: string; input: string; headers?: Record<string, string> }) =>
    designerClient.post<{ success: boolean; output?: string; error?: string }>(
      '/manage/transforms/preview', payload
    ),
};

export default esbApi;
