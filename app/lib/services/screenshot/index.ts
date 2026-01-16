/**
 * Service de capture d'écran
 *
 * Supporte plusieurs providers :
 * - screenshotone.com (simple, économique)
 * - browserless.io (plus puissant)
 * - urlbox.io (haute qualité)
 *
 * Utilisé pour :
 * - Debug visuel (vérifier les bugs UI reportés)
 * - Copier le design d'un site existant
 * - Vérifier le rendu de l'app générée
 */

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('ScreenshotService');

/*
 * ============================================================================
 * TYPES
 * ============================================================================
 */

/**
 * Options de capture d'écran
 */
export interface ScreenshotOptions {
  /** URL à capturer */
  url: string;

  /** Largeur du viewport (défaut: 1280) */
  width?: number;

  /** Hauteur du viewport (défaut: 800) */
  height?: number;

  /** Capture pleine page (défaut: false) */
  fullPage?: boolean;

  /** Format de sortie (défaut: png) */
  format?: 'png' | 'jpeg' | 'webp';

  /** Qualité pour jpeg/webp (1-100, défaut: 80) */
  quality?: number;

  /** Délai avant capture en ms (défaut: 0) */
  delay?: number;

  /** Device à simuler */
  device?: 'desktop' | 'tablet' | 'mobile';

  /** Mode sombre */
  darkMode?: boolean;

  /** Bloquer les publicités */
  blockAds?: boolean;

  /** Timeout en ms (défaut: 30000) */
  timeout?: number;
}

/**
 * Résultat de la capture
 */
export interface ScreenshotResult {
  success: boolean;

  /** URL de l'image capturée (si stockée) */
  imageUrl?: string;

  /** Image en base64 */
  base64?: string;

  /** Type MIME */
  mimeType?: string;

  /** Métadonnées */
  metadata?: {
    url: string;
    width: number;
    height: number;
    capturedAt: string;
    provider: string;
  };

  /** Erreur si échec */
  error?: string;
}

/**
 * Provider de screenshots
 */
export type ScreenshotProvider = 'screenshotone' | 'browserless' | 'urlbox' | 'mock';

/**
 * Configuration du service
 */
export interface ScreenshotServiceConfig {
  provider: ScreenshotProvider;
  apiKey?: string;
  baseUrl?: string;
}

/*
 * ============================================================================
 * DEVICE PRESETS
 * ============================================================================
 */

const DEVICE_PRESETS = {
  desktop: { width: 1280, height: 800 },
  tablet: { width: 768, height: 1024 },
  mobile: { width: 375, height: 812 },
};

/*
 * ============================================================================
 * SCREENSHOT SERVICE
 * ============================================================================
 */

export class ScreenshotService {
  private config: ScreenshotServiceConfig;

  constructor(config: ScreenshotServiceConfig) {
    this.config = config;
  }

  /**
   * Capturer une page web
   */
  async capture(options: ScreenshotOptions): Promise<ScreenshotResult> {
    const startTime = Date.now();

    // Appliquer les presets device
    if (options.device && DEVICE_PRESETS[options.device]) {
      const preset = DEVICE_PRESETS[options.device];
      options.width = options.width || preset.width;
      options.height = options.height || preset.height;
    }

    // Valeurs par défaut
    const opts: Required<ScreenshotOptions> = {
      url: options.url,
      width: options.width || 1280,
      height: options.height || 800,
      fullPage: options.fullPage || false,
      format: options.format || 'png',
      quality: options.quality || 80,
      delay: options.delay || 0,
      device: options.device || 'desktop',
      darkMode: options.darkMode || false,
      blockAds: options.blockAds || true,
      timeout: options.timeout || 30000,
    };

    logger.debug('Capturing screenshot', { url: opts.url, provider: this.config.provider });

    try {
      let result: ScreenshotResult;

      switch (this.config.provider) {
        case 'screenshotone':
          result = await this.captureWithScreenshotOne(opts);
          break;

        case 'browserless':
          result = await this.captureWithBrowserless(opts);
          break;

        case 'urlbox':
          result = await this.captureWithUrlbox(opts);
          break;

        case 'mock':
        default:
          result = await this.captureWithMock(opts);
          break;
      }

      const duration = Date.now() - startTime;
      logger.info('Screenshot captured', { url: opts.url, duration, success: result.success });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Screenshot capture failed', { url: opts.url, error: errorMessage });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Capturer plusieurs URLs en parallèle
   */
  async captureMultiple(urls: string[], options?: Omit<ScreenshotOptions, 'url'>): Promise<ScreenshotResult[]> {
    const promises = urls.map((url) =>
      this.capture({ ...options, url }).catch((error) => ({
        success: false,
        error: error instanceof Error ? error.message : String(error),
      })),
    );

    return Promise.all(promises);
  }

  /*
   * ============================================================================
   * PROVIDERS
   * ============================================================================
   */

  /**
   * ScreenshotOne.com - Simple et économique
   * @see https://screenshotone.com/docs
   */
  private async captureWithScreenshotOne(opts: Required<ScreenshotOptions>): Promise<ScreenshotResult> {
    if (!this.config.apiKey) {
      throw new Error('ScreenshotOne API key required');
    }

    const params = new URLSearchParams({
      access_key: this.config.apiKey,
      url: opts.url,
      viewport_width: opts.width.toString(),
      viewport_height: opts.height.toString(),
      full_page: opts.fullPage.toString(),
      format: opts.format,
      image_quality: opts.quality.toString(),
      delay: opts.delay.toString(),
      block_ads: opts.blockAds.toString(),
      dark_mode: opts.darkMode.toString(),
      timeout: Math.floor(opts.timeout / 1000).toString(),
    });

    const baseUrl = this.config.baseUrl || 'https://api.screenshotone.com';
    const response = await fetch(`${baseUrl}/take?${params.toString()}`, {
      method: 'GET',
      signal: AbortSignal.timeout(opts.timeout),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ScreenshotOne error: ${response.status} - ${errorText}`);
    }

    const buffer = await response.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));

    return {
      success: true,
      base64,
      mimeType: `image/${opts.format}`,
      metadata: {
        url: opts.url,
        width: opts.width,
        height: opts.height,
        capturedAt: new Date().toISOString(),
        provider: 'screenshotone',
      },
    };
  }

  /**
   * Browserless.io - Plus puissant, supporte actions complexes
   * @see https://www.browserless.io/docs
   */
  private async captureWithBrowserless(opts: Required<ScreenshotOptions>): Promise<ScreenshotResult> {
    if (!this.config.apiKey) {
      throw new Error('Browserless API key required');
    }

    const baseUrl = this.config.baseUrl || 'https://chrome.browserless.io';

    const body = {
      url: opts.url,
      options: {
        fullPage: opts.fullPage,
        type: opts.format === 'jpeg' ? 'jpeg' : 'png',
        quality: opts.format === 'jpeg' ? opts.quality : undefined,
      },
      viewport: {
        width: opts.width,
        height: opts.height,
        deviceScaleFactor: 1,
      },
      waitFor: opts.delay || 1000,
      emulateMediaFeatures: opts.darkMode ? [{ name: 'prefers-color-scheme', value: 'dark' }] : undefined,
    };

    const response = await fetch(`${baseUrl}/screenshot?token=${this.config.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(opts.timeout),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Browserless error: ${response.status} - ${errorText}`);
    }

    const buffer = await response.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));

    return {
      success: true,
      base64,
      mimeType: `image/${opts.format}`,
      metadata: {
        url: opts.url,
        width: opts.width,
        height: opts.height,
        capturedAt: new Date().toISOString(),
        provider: 'browserless',
      },
    };
  }

  /**
   * Urlbox.io - Haute qualité, bon support des SPAs
   * @see https://urlbox.io/docs
   */
  private async captureWithUrlbox(opts: Required<ScreenshotOptions>): Promise<ScreenshotResult> {
    if (!this.config.apiKey) {
      throw new Error('Urlbox API key required');
    }

    const baseUrl = this.config.baseUrl || 'https://api.urlbox.io/v1';
    const [apiKey, apiSecret] = this.config.apiKey.split(':');

    if (!apiSecret) {
      throw new Error('Urlbox requires API key in format key:secret');
    }

    const params = new URLSearchParams({
      url: opts.url,
      width: opts.width.toString(),
      height: opts.height.toString(),
      full_page: opts.fullPage.toString(),
      format: opts.format,
      quality: opts.quality.toString(),
      delay: opts.delay.toString(),
      block_ads: opts.blockAds.toString(),
      dark_mode: opts.darkMode.toString(),
    });

    const response = await fetch(`${baseUrl}/${apiKey}/${apiSecret}/png?${params.toString()}`, {
      method: 'GET',
      signal: AbortSignal.timeout(opts.timeout),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Urlbox error: ${response.status} - ${errorText}`);
    }

    const buffer = await response.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));

    return {
      success: true,
      base64,
      mimeType: `image/${opts.format}`,
      metadata: {
        url: opts.url,
        width: opts.width,
        height: opts.height,
        capturedAt: new Date().toISOString(),
        provider: 'urlbox',
      },
    };
  }

  /**
   * Mock provider pour tests et développement
   */
  private async captureWithMock(opts: Required<ScreenshotOptions>): Promise<ScreenshotResult> {
    // Simuler un délai réseau
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Générer une image placeholder SVG
    const svg = `
      <svg width="${opts.width}" height="${opts.height}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="${opts.darkMode ? '#1a1a2e' : '#f0f0f0'}"/>
        <rect x="20" y="20" width="${opts.width - 40}" height="60" rx="8" fill="${opts.darkMode ? '#16213e' : '#ffffff'}"/>
        <text x="40" y="55" font-family="system-ui" font-size="14" fill="${opts.darkMode ? '#a0a0a0' : '#666666'}">
          📸 Screenshot: ${opts.url}
        </text>
        <rect x="20" y="100" width="${opts.width - 40}" height="${opts.height - 140}" rx="8" fill="${opts.darkMode ? '#16213e' : '#ffffff'}"/>
        <text x="${opts.width / 2}" y="${opts.height / 2}" text-anchor="middle" font-family="system-ui" font-size="18" fill="${opts.darkMode ? '#808080' : '#999999'}">
          [Mock Screenshot - ${opts.width}x${opts.height}]
        </text>
        <text x="${opts.width / 2}" y="${opts.height / 2 + 30}" text-anchor="middle" font-family="system-ui" font-size="12" fill="${opts.darkMode ? '#606060' : '#bbbbbb'}">
          Device: ${opts.device} | Format: ${opts.format}
        </text>
      </svg>
    `.trim();

    const base64 = btoa(svg);

    return {
      success: true,
      base64,
      mimeType: 'image/svg+xml',
      metadata: {
        url: opts.url,
        width: opts.width,
        height: opts.height,
        capturedAt: new Date().toISOString(),
        provider: 'mock',
      },
    };
  }
}

/*
 * ============================================================================
 * FACTORY
 * ============================================================================
 */

/**
 * Créer une instance du service de screenshots
 */
export function createScreenshotService(config: ScreenshotServiceConfig): ScreenshotService {
  return new ScreenshotService(config);
}

/**
 * Créer une instance depuis les variables d'environnement
 */
export function createScreenshotServiceFromEnv(env: {
  SCREENSHOT_PROVIDER?: string;
  SCREENSHOT_API_KEY?: string;
  SCREENSHOT_BASE_URL?: string;
}): ScreenshotService {
  const provider = (env.SCREENSHOT_PROVIDER as ScreenshotProvider) || 'mock';

  return createScreenshotService({
    provider,
    apiKey: env.SCREENSHOT_API_KEY,
    baseUrl: env.SCREENSHOT_BASE_URL,
  });
}
