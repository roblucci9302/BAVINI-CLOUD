/**
 * API Route: /api/templates/:id
 * Charge les fichiers pré-construits d'un template
 */

import type { LoaderFunctionArgs } from '@remix-run/cloudflare';
import { json } from '@remix-run/cloudflare';
import { loadTemplate, listAvailableTemplates } from '~/lib/.server/templates';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('api.templates');

/**
 * GET /api/templates/:id
 * Retourne les fichiers du template spécifié
 *
 * @param id - L'identifiant du template (ex: "supabase-fullstack")
 *
 * @returns {TemplateFilesResponse} - Les fichiers du template
 * @returns {TemplateErrorResponse} - Erreur si template non trouvé
 *
 * @example
 * // Charger le template supabase-fullstack
 * fetch('/api/templates/supabase-fullstack')
 *   .then(res => res.json())
 *   .then(data => {
 *     if (data.success) {
 *       console.log(data.files); // Array<{path, content}>
 *     }
 *   });
 */
export async function loader({ params }: LoaderFunctionArgs) {
  const { id } = params;

  // Cas spécial: lister tous les templates disponibles
  if (id === 'list') {
    const templates = listAvailableTemplates();

    logger.info(`Listed ${templates.length} available templates`);

    return json({
      success: true,
      templates,
    });
  }

  // Valider l'ID du template
  if (!id || typeof id !== 'string') {
    logger.error('Invalid template ID');

    return json(
      {
        success: false,
        error: 'Template ID is required',
        code: 'INVALID_ID',
      },
      { status: 400 },
    );
  }

  logger.info(`Loading template: ${id}`);

  // Charger le template
  const result = loadTemplate(id);

  if (!result.success) {
    const status = result.code === 'NOT_FOUND' ? 404 : 500;

    return json(result, { status });
  }

  // Ajouter des headers de cache pour les templates (ils changent rarement)
  return json(result, {
    headers: {
      'Cache-Control': 'public, max-age=3600, s-maxage=86400',
    },
  });
}
