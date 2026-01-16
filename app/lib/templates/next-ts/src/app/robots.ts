import { MetadataRoute } from 'next';

/**
 * Génère automatiquement le robots.txt
 * Configure les directives de crawling pour les moteurs de recherche
 */
export default function robots(): MetadataRoute.Robots {
  const baseUrl = 'https://example.com';

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/admin/'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
