import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const designerUrl = env.VITE_DESIGNER_URL || 'http://localhost:9191';
  const runtimeUrl  = env.VITE_RUNTIME_URL  || 'http://localhost:9090';

  return {
    plugins: [react()],
    server: {
      port: 3000,
      proxy: {
        // Designer-only endpoints → esb-designer (port 9191)
        '/manage/transforms': { target: designerUrl, changeOrigin: true },
        '/manage/routes/validate': { target: designerUrl, changeOrigin: true },
        '/manage/routes/save': { target: designerUrl, changeOrigin: true },
        // All other /manage/** and /api/** → esb-runtime (port 9090)
        '/manage': { target: runtimeUrl, changeOrigin: true },
        '/api':    { target: runtimeUrl, changeOrigin: true },
      },
    },
    resolve: {
      alias: {
        '@': '/src',
      },
    },
  };
});
