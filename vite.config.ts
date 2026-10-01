import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';

// The same security headers Vercel sends (vercel.json), so `vite preview` tests the production policy.
const vercelHeaders: Record<string, string> = Object.fromEntries(
  (JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8')).headers[0].headers as { key: string; value: string }[]).map((h) => [h.key, h.value]),
);

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
  // Never publish source maps: they would hand out the original source.
  build: { sourcemap: false },
  preview: { headers: vercelHeaders },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
