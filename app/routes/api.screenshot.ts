/**
 * API Endpoint pour les captures d'écran
 *
 * POST /api/screenshot
 * Body: { url: string, options?: ScreenshotOptions }
 *
 * Retourne l'image en base64 ou une URL vers l'image stockée
 */

import { type ActionFunctionArgs, json } from '@remix-run/cloudflare';
import { createScreenshotServiceFromEnv, type ScreenshotOptions } from '~/lib/services/screenshot';
import { createScopedLogger } from '~/utils/logger';
import { handleRouteError } from '~/lib/errors/error-handler';

const logger = createScopedLogger('api.screenshot');

/**
 * Corps de la requête
 */
interface ScreenshotRequest {
  /** URL à capturer */
  url: string;

  /** URLs multiples à capturer */
  urls?: string[];

  /** Options de capture */
  options?: Omit<ScreenshotOptions, 'url'>;
}

/**
 * Valider une URL
 */
function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * Convertir localhost en URL de preview (si applicable)
 */
function normalizeUrl(url: string, previewBaseUrl?: string): string {
  if (!url) {
    return url;
  }

  // Si c'est une URL localhost et qu'on a une URL de preview
  if (previewBaseUrl && (url.includes('localhost') || url.includes('127.0.0.1'))) {
    try {
      const parsed = new URL(url);
      const previewParsed = new URL(previewBaseUrl);
      parsed.hostname = previewParsed.hostname;
      parsed.port = previewParsed.port;
      parsed.protocol = previewParsed.protocol;

      return parsed.toString();
    } catch {
      // Ignorer les erreurs de parsing
    }
  }

  return url;
}

export async function action({ context, request }: ActionFunctionArgs) {
  // Vérifier la méthode
  if (request.method !== 'POST') {
    return json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const body = (await request.json()) as ScreenshotRequest;

    // Valider les URLs
    const urls = body.urls || (body.url ? [body.url] : []);

    if (urls.length === 0) {
      return json({ error: 'Au moins une URL est requise' }, { status: 400 });
    }

    if (urls.length > 5) {
      return json({ error: 'Maximum 5 URLs par requête' }, { status: 400 });
    }

    // Valider chaque URL
    for (const url of urls) {
      if (!isValidUrl(url)) {
        return json({ error: `URL invalide: ${url}` }, { status: 400 });
      }
    }

    // Créer le service de screenshots
    const env = context.cloudflare.env as {
      SCREENSHOT_PROVIDER?: string;
      SCREENSHOT_API_KEY?: string;
      SCREENSHOT_BASE_URL?: string;
    };

    const screenshotService = createScreenshotServiceFromEnv(env);

    // Normaliser les URLs (convertir localhost si nécessaire)
    const previewBaseUrl = request.headers.get('X-Preview-URL') || undefined;
    const normalizedUrls = urls.map((url) => normalizeUrl(url, previewBaseUrl));

    logger.info('Processing screenshot request', {
      urlCount: normalizedUrls.length,
      options: body.options,
    });

    // Capturer les screenshots
    if (normalizedUrls.length === 1) {
      // Une seule URL
      const result = await screenshotService.capture({
        ...body.options,
        url: normalizedUrls[0],
      });

      if (!result.success) {
        return json({ error: result.error }, { status: 500 });
      }

      return json({
        success: true,
        screenshot: result,
      });
    } else {
      // Plusieurs URLs
      const results = await screenshotService.captureMultiple(normalizedUrls, body.options);

      const successCount = results.filter((r) => r.success).length;

      return json({
        success: successCount > 0,
        screenshots: results,
        summary: {
          total: results.length,
          success: successCount,
          failed: results.length - successCount,
        },
      });
    }
  } catch (error) {
    const [response] = handleRouteError(error, 'Screenshot', logger);
    return response;
  }
}
