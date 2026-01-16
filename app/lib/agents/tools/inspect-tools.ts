/**
 * Outils d'inspection visuelle pour les agents BAVINI
 *
 * Permet de capturer des screenshots de sites web pour :
 * - Debug visuel (vérifier les bugs UI reportés par l'utilisateur)
 * - Copier le design d'un site existant
 * - Vérifier le rendu de l'app générée
 */

import type { ToolDefinition, ToolExecutionResult } from '../types';

/*
 * ============================================================================
 * TYPES
 * ============================================================================
 */

/**
 * Résultat d'une inspection
 */
export interface InspectionResult {
  /** URL inspectée */
  url: string;

  /** Capture réussie */
  success: boolean;

  /** Image en base64 (si succès) */
  imageBase64?: string;

  /** Type MIME de l'image */
  mimeType?: string;

  /** Dimensions */
  dimensions?: {
    width: number;
    height: number;
  };

  /** Device simulé */
  device?: string;

  /** Erreur (si échec) */
  error?: string;

  /** Observations de l'IA sur le design */
  observations?: string[];
}

/**
 * Interface pour le service de screenshots (injecté)
 */
export interface ScreenshotServiceInterface {
  capture(options: {
    url: string;
    width?: number;
    height?: number;
    fullPage?: boolean;
    format?: 'png' | 'jpeg' | 'webp';
    device?: 'desktop' | 'tablet' | 'mobile';
    darkMode?: boolean;
    delay?: number;
  }): Promise<{
    success: boolean;
    base64?: string;
    mimeType?: string;
    metadata?: {
      url: string;
      width: number;
      height: number;
      capturedAt: string;
      provider: string;
    };
    error?: string;
  }>;
}

/*
 * ============================================================================
 * DÉFINITIONS DES OUTILS
 * ============================================================================
 */

/**
 * Outil pour inspecter visuellement un site web
 */
export const InspectSiteTool: ToolDefinition = {
  name: 'inspect_site',
  description: `Capture une screenshot d'un site web pour analyse visuelle.

QUAND UTILISER :
- L'utilisateur rapporte un bug visuel ("le bouton est mal aligné", "le header est cassé")
- L'utilisateur veut copier le design d'un site ("fais comme stripe.com", "inspire-toi de linear.app")
- Pour vérifier le rendu de l'app générée

CE QUE ÇA RETOURNE :
- Image du site en base64
- Dimensions du viewport
- Device simulé (desktop/tablet/mobile)

PARAMÈTRES :
- url (requis) : URL du site à capturer
- device : "desktop" (1280x800), "tablet" (768x1024), "mobile" (375x812)
- fullPage : Capturer toute la page (scroll complet)
- darkMode : Simuler le mode sombre

EXEMPLES :
- inspect_site({ url: "https://stripe.com", device: "desktop" })
- inspect_site({ url: "http://localhost:3000", device: "mobile", fullPage: true })`,
  inputSchema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'URL du site à capturer (http:// ou https://)',
      },
      device: {
        type: 'string',
        description: 'Device à simuler : desktop (1280x800), tablet (768x1024), mobile (375x812)',
        enum: ['desktop', 'tablet', 'mobile'],
      },
      fullPage: {
        type: 'boolean',
        description: 'Capturer toute la page avec scroll (défaut: false)',
      },
      darkMode: {
        type: 'boolean',
        description: 'Activer le mode sombre du navigateur (défaut: false)',
      },
      delay: {
        type: 'number',
        description: 'Délai en ms avant la capture pour laisser le JS charger (défaut: 1000)',
      },
    },
    required: ['url'],
  },
};

/**
 * Outil pour comparer deux sites visuellement
 */
export const CompareSitesTool: ToolDefinition = {
  name: 'compare_sites',
  description: `Compare visuellement deux sites web côte à côte.

QUAND UTILISER :
- Comparer le site original avec la version générée
- Vérifier la fidélité d'une reproduction de design
- Comparer desktop vs mobile

CE QUE ÇA RETOURNE :
- Screenshots des deux sites
- Dimensions respectives
- Note de similarité (si disponible)

PARAMÈTRES :
- url1 (requis) : Premier site (souvent l'original/référence)
- url2 (requis) : Second site (souvent la version générée)
- device : Device à utiliser pour les deux captures`,
  inputSchema: {
    type: 'object',
    properties: {
      url1: {
        type: 'string',
        description: 'URL du premier site (référence)',
      },
      url2: {
        type: 'string',
        description: 'URL du second site (à comparer)',
      },
      device: {
        type: 'string',
        description: 'Device à simuler pour les deux captures',
        enum: ['desktop', 'tablet', 'mobile'],
      },
    },
    required: ['url1', 'url2'],
  },
};

/*
 * ============================================================================
 * HANDLERS D'EXÉCUTION
 * ============================================================================
 */

/**
 * Créer les handlers pour les outils d'inspection
 */
export function createInspectToolHandlers(
  screenshotService?: ScreenshotServiceInterface,
): Record<string, (input: Record<string, unknown>) => Promise<ToolExecutionResult>> {
  /**
   * Fallback si pas de service de screenshots
   */
  const mockCapture = async (url: string, device: string): Promise<InspectionResult> => {
    return {
      url,
      success: true,
      imageBase64: generateMockScreenshotSvg(url, device),
      mimeType: 'image/svg+xml',
      dimensions: getDeviceDimensions(device),
      device,
      observations: [
        '⚠️ Mode mock activé - pas de vrai screenshot',
        'Configurez SCREENSHOT_API_KEY pour activer les vraies captures',
        `URL demandée: ${url}`,
        `Device: ${device}`,
      ],
    };
  };

  /**
   * Capture réelle avec le service
   */
  const realCapture = async (
    service: ScreenshotServiceInterface,
    url: string,
    device: string,
    fullPage: boolean,
    darkMode: boolean,
    delay: number,
  ): Promise<InspectionResult> => {
    const result = await service.capture({
      url,
      device: device as 'desktop' | 'tablet' | 'mobile',
      fullPage,
      darkMode,
      delay,
    });

    if (!result.success) {
      return {
        url,
        success: false,
        error: result.error || 'Capture échouée',
      };
    }

    return {
      url,
      success: true,
      imageBase64: result.base64,
      mimeType: result.mimeType,
      dimensions: result.metadata
        ? {
            width: result.metadata.width,
            height: result.metadata.height,
          }
        : getDeviceDimensions(device),
      device,
    };
  };

  return {
    /**
     * Handler pour inspect_site
     */
    async inspect_site(input: Record<string, unknown>): Promise<ToolExecutionResult> {
      try {
        const url = input.url as string;
        const device = (input.device as string) || 'desktop';
        const fullPage = (input.fullPage as boolean) || false;
        const darkMode = (input.darkMode as boolean) || false;
        const delay = (input.delay as number) || 1000;

        if (!url) {
          return {
            success: false,
            output: null,
            error: 'Le paramètre "url" est requis',
          };
        }

        // Valider l'URL
        if (!isValidUrl(url)) {
          return {
            success: false,
            output: null,
            error: `URL invalide: ${url}. L'URL doit commencer par http:// ou https://`,
          };
        }

        // Capturer le screenshot
        const result = screenshotService
          ? await realCapture(screenshotService, url, device, fullPage, darkMode, delay)
          : await mockCapture(url, device);

        if (!result.success) {
          return {
            success: false,
            output: null,
            error: result.error,
          };
        }

        return {
          success: true,
          output: {
            url: result.url,
            device: result.device,
            dimensions: result.dimensions,
            mimeType: result.mimeType,

            // On inclut l'image en base64 pour que l'agent puisse la "voir"
            // (Les modèles multimodaux peuvent analyser les images)
            imageBase64: result.imageBase64,
            observations: result.observations,
            message: `Screenshot capturé: ${url} (${result.device}, ${result.dimensions?.width}x${result.dimensions?.height})`,
          },
        };
      } catch (error) {
        return {
          success: false,
          output: null,
          error: `Erreur lors de la capture: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },

    /**
     * Handler pour compare_sites
     */
    async compare_sites(input: Record<string, unknown>): Promise<ToolExecutionResult> {
      try {
        const url1 = input.url1 as string;
        const url2 = input.url2 as string;
        const device = (input.device as string) || 'desktop';

        if (!url1 || !url2) {
          return {
            success: false,
            output: null,
            error: 'Les paramètres "url1" et "url2" sont requis',
          };
        }

        // Valider les URLs
        if (!isValidUrl(url1)) {
          return {
            success: false,
            output: null,
            error: `URL1 invalide: ${url1}`,
          };
        }

        if (!isValidUrl(url2)) {
          return {
            success: false,
            output: null,
            error: `URL2 invalide: ${url2}`,
          };
        }

        // Capturer les deux sites en parallèle
        const [result1, result2] = await Promise.all([
          screenshotService
            ? realCapture(screenshotService, url1, device, false, false, 1000)
            : mockCapture(url1, device),
          screenshotService
            ? realCapture(screenshotService, url2, device, false, false, 1000)
            : mockCapture(url2, device),
        ]);

        return {
          success: true,
          output: {
            comparison: {
              site1: {
                url: result1.url,
                success: result1.success,
                dimensions: result1.dimensions,
                imageBase64: result1.imageBase64,
                error: result1.error,
              },
              site2: {
                url: result2.url,
                success: result2.success,
                dimensions: result2.dimensions,
                imageBase64: result2.imageBase64,
                error: result2.error,
              },
              device,
            },
            message: `Comparaison: ${url1} vs ${url2} (${device})`,
          },
        };
      } catch (error) {
        return {
          success: false,
          output: null,
          error: `Erreur lors de la comparaison: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  };
}

/*
 * ============================================================================
 * UTILITAIRES
 * ============================================================================
 */

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
 * Obtenir les dimensions pour un device
 */
function getDeviceDimensions(device: string): { width: number; height: number } {
  const presets: Record<string, { width: number; height: number }> = {
    desktop: { width: 1280, height: 800 },
    tablet: { width: 768, height: 1024 },
    mobile: { width: 375, height: 812 },
  };

  return presets[device] || presets.desktop;
}

/**
 * Générer un SVG mock pour les tests
 */
function generateMockScreenshotSvg(url: string, device: string): string {
  const { width, height } = getDeviceDimensions(device);

  // Extraire le hostname pour l'affichage
  let hostname = url;
  try {
    hostname = new URL(url).hostname;
  } catch {
    // Garder l'URL originale si parsing échoue
  }

  return btoa(
    `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#1a1a2e"/>
          <stop offset="100%" style="stop-color:#16213e"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#bg)"/>

      <!-- Browser chrome -->
      <rect x="0" y="0" width="${width}" height="40" fill="#0f0f23"/>
      <circle cx="20" cy="20" r="6" fill="#ff5f57"/>
      <circle cx="40" cy="20" r="6" fill="#febc2e"/>
      <circle cx="60" cy="20" r="6" fill="#28c840"/>
      <rect x="80" y="12" width="${width - 100}" height="16" rx="4" fill="#1a1a2e"/>
      <text x="90" y="24" font-family="monospace" font-size="11" fill="#666">
        ${hostname}
      </text>

      <!-- Content placeholder -->
      <rect x="20" y="60" width="${width - 40}" height="80" rx="8" fill="#1e1e3f"/>
      <rect x="40" y="80" width="200" height="20" rx="4" fill="#2d2d5a"/>
      <rect x="40" y="110" width="300" height="12" rx="2" fill="#252550"/>

      <rect x="20" y="160" width="${(width - 60) / 3}" height="120" rx="8" fill="#1e1e3f"/>
      <rect x="${20 + (width - 60) / 3 + 10}" y="160" width="${(width - 60) / 3}" height="120" rx="8" fill="#1e1e3f"/>
      <rect x="${20 + ((width - 60) / 3 + 10) * 2}" y="160" width="${(width - 60) / 3}" height="120" rx="8" fill="#1e1e3f"/>

      <!-- Mock label -->
      <text x="${width / 2}" y="${height / 2 + 50}" text-anchor="middle" font-family="system-ui" font-size="16" fill="#4a4a8a">
        📸 Mock Screenshot
      </text>
      <text x="${width / 2}" y="${height / 2 + 80}" text-anchor="middle" font-family="system-ui" font-size="12" fill="#3a3a6a">
        ${device} • ${width}×${height}
      </text>
      <text x="${width / 2}" y="${height / 2 + 100}" text-anchor="middle" font-family="monospace" font-size="10" fill="#2a2a5a">
        Configurez SCREENSHOT_API_KEY pour de vraies captures
      </text>
    </svg>
  `.trim(),
  );
}

/*
 * ============================================================================
 * EXPORT
 * ============================================================================
 */

/**
 * Tous les outils d'inspection
 */
export const INSPECT_TOOLS: ToolDefinition[] = [InspectSiteTool, CompareSitesTool];
