import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';

// URL du site pour la génération du sitemap et des liens canoniques
// IMPORTANT: Remplacez cette valeur par l'URL de production de votre site
const SITE_URL = process.env.SITE_URL || 'https://your-domain.com';

export default defineConfig({
  site: SITE_URL,
  output: 'static',
  compressHTML: true,
  integrations: [react(), sitemap()],
  vite: {
    build: {
      minify: true,
    },
  },
});
