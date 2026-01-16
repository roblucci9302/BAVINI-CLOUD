import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  // URL du site - À REMPLACER lors du déploiement
  site: 'https://example.com',
  output: 'static',
  compressHTML: true,
  integrations: [react(), sitemap()],
  vite: {
    build: {
      minify: true,
    },
  },
});
