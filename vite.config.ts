import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// Absolute site URL for link-preview tags (og:image must be absolute). Set VITE_SITE_URL for a custom
// domain; on Vercel the production domain is provided automatically.
function siteUrl(): Plugin {
  const raw = process.env.VITE_SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '');
  const url = raw.replace(/\/+$/, '');
  return { name: 'site-url', transformIndexHtml: (html) => html.replaceAll('%SITE_URL%', url) };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), siteUrl()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
