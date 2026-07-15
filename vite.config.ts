import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 3005,
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: {
        // PostHog proxy — avoids CORS issues in dev by routing browser → vite → PostHog
        // The frontend uses '/_ph' as a prefix in dev (see src/api/posthog.ts)
        '/_ph': {
          target: env.VITE_POSTHOG_HOST || 'https://app.posthog.com',
          changeOrigin: true,
          secure: false,
          rewrite: (p) => p.replace(/^\/_ph/, ''),
        },
        '/api': {
          target: 'http://localhost:3006',
          changeOrigin: true,
          secure: false,
          // When the backend is restarting (tsx watch), return 503 so the
          // browser console shows "Service Unavailable" instead of the
          // misleading 404 that Vite's static fallback would produce.
          configure: (proxy) => {
            proxy.on('error', (_err, _req, res) => {
              if (!res.headersSent) {
                (res as any).writeHead(503, { 'Content-Type': 'application/json' });
                (res as any).end(JSON.stringify({
                  code: 'SERVICE_UNAVAILABLE',
                  message: 'Backend is restarting. Please wait a moment.',
                }));
              }
            });
          },
        },
      },
    },
  };
});
