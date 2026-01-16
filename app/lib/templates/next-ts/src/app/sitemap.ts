import { MetadataRoute } from 'next';

/**
 * Génère automatiquement le sitemap.xml
 * Ajouter ici les nouvelles pages au fur et à mesure
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = 'https://example.com';

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },

    /*
     * Ajouter d'autres pages ici
     * {
     *   url: `${baseUrl}/about`,
     *   lastModified: new Date(),
     *   changeFrequency: 'monthly',
     *   priority: 0.8,
     * },
     */
  ];
}
