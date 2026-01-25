/**
 * =============================================================================
 * BAVINI CLOUD - Universal Font Loader
 * =============================================================================
 * Provides Google Fonts loading for all frameworks (Vue, Svelte, Astro, React).
 *
 * Features:
 * - Dynamic font loading via Google Fonts CDN
 * - Automatic CSS variable generation
 * - Deduplication of font imports
 * - Font preloading for better performance
 * - TypeScript support with font metadata
 *
 * Usage:
 * ```typescript
 * import { fontLoader } from '~/lib/runtime/adapters/fonts';
 *
 * // Load a font
 * const interFont = fontLoader.loadFont('Inter', {
 *   weights: [400, 500, 700],
 *   variable: '--font-sans',
 * });
 *
 * // Get generated CSS
 * const css = fontLoader.generateCSS();
 * ```
 * =============================================================================
 */

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('UniversalFontLoader');

/**
 * Font weight specification
 */
export type FontWeight = 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900;

/**
 * Font style specification
 */
export type FontStyle = 'normal' | 'italic';

/**
 * Font loading options
 */
export interface FontOptions {
  /** Font weights to load */
  weights?: FontWeight[];
  /** Font styles to load */
  styles?: FontStyle[];
  /** CSS variable name (e.g., '--font-sans') */
  variable?: string;
  /** Font display strategy */
  display?: 'auto' | 'block' | 'swap' | 'fallback' | 'optional';
  /** Subsets to load (default: ['latin']) */
  subsets?: string[];
  /** Preload the font (better performance) */
  preload?: boolean;
}

/**
 * Loaded font metadata
 */
export interface LoadedFont {
  /** Original font name (e.g., 'Inter') */
  name: string;
  /** Display name (e.g., 'Inter') */
  displayName: string;
  /** CSS font-family value */
  fontFamily: string;
  /** CSS variable if specified */
  variable?: string;
  /** Font category for fallback */
  category: 'sans-serif' | 'serif' | 'monospace' | 'display' | 'handwriting';
  /** Loaded weights */
  weights: FontWeight[];
  /** Loaded styles */
  styles: FontStyle[];
  /** CSS class name */
  className: string;
}

/**
 * Font category mapping for common fonts
 *
 * Organized by:
 * - DISTINCTIVE: Creative, unique fonts (recommended)
 * - STANDARD: Common, reliable fonts
 * - GENERIC: Avoid for creative projects (Inter, Roboto, etc.)
 */
const FONT_CATEGORIES: Record<string, LoadedFont['category']> = {
  // ==========================================================================
  // DISTINCTIVE SANS-SERIF (Recommended for creative projects)
  // ==========================================================================
  'Space Grotesk': 'sans-serif', // Geometric, techy, distinctive
  Outfit: 'sans-serif', // Modern, geometric, friendly
  Syne: 'sans-serif', // Bold, editorial, artistic
  'Plus Jakarta Sans': 'sans-serif', // Modern, clean, professional
  'Bricolage Grotesque': 'sans-serif', // Quirky, playful, unique
  Lexend: 'sans-serif', // Readable, modern, accessible
  'Albert Sans': 'sans-serif', // Geometric, modern, versatile
  'General Sans': 'sans-serif', // Clean, modern, editorial
  Urbanist: 'sans-serif', // Geometric, modern, tech-forward
  'Clash Display': 'sans-serif', // Bold, impactful, editorial
  Satoshi: 'sans-serif', // Clean, modern, premium feel
  'Cabinet Grotesk': 'sans-serif', // Bold, geometric, striking
  Switzer: 'sans-serif', // Neo-grotesque, professional
  'Supreme': 'sans-serif', // Modern, versatile, clean
  'Instrument Sans': 'sans-serif', // Tech, modern, distinctive

  // ==========================================================================
  // DISTINCTIVE SERIF (Recommended for creative projects)
  // ==========================================================================
  Fraunces: 'serif', // Soft serif, playful, unique
  'Bodoni Moda': 'serif', // High contrast, luxurious, elegant
  'Cormorant Garamond': 'serif', // Elegant, editorial, refined
  'DM Serif Display': 'serif', // Modern serif, high contrast
  'DM Serif Text': 'serif', // Readable serif, modern
  Newsreader: 'serif', // Editorial, readable, distinctive
  Spectral: 'serif', // Elegant, readable, refined
  'Instrument Serif': 'serif', // Modern, editorial, sharp
  'Young Serif': 'serif', // Friendly, warm, approachable
  'Libre Caslon Display': 'serif', // Classic, elegant, timeless
  'Playfair Display': 'serif', // High contrast, elegant, editorial
  'Cormorant': 'serif', // Elegant, refined, display
  'Antic Didone': 'serif', // High contrast, elegant
  'Sorts Mill Goudy': 'serif', // Classic, refined, bookish

  // ==========================================================================
  // DISTINCTIVE DISPLAY (Headlines, hero text)
  // ==========================================================================
  'Archivo Black': 'display', // Bold, impactful, modern
  'Bebas Neue': 'display', // Condensed, strong, iconic
  'Big Shoulders Display': 'display', // Industrial, bold, American
  'Darker Grotesque': 'display', // Dark, condensed, unique
  'Dela Gothic One': 'display', // Bold, Japanese-inspired
  'DM Sans': 'display', // Geometric, clean (also body)
  Unbounded: 'display', // Rounded, friendly, modern
  'Climate Crisis': 'display', // Artistic, environmental
  Chivo: 'display', // Grotesque, versatile
  'Antonio': 'display', // Condensed, modern, strong
  Oswald: 'display', // Condensed, strong
  'Abril Fatface': 'display', // High contrast, elegant

  // ==========================================================================
  // DISTINCTIVE MONOSPACE (Code, technical)
  // ==========================================================================
  'Space Mono': 'monospace', // Geometric, distinctive, techy
  'JetBrains Mono': 'monospace', // Readable, ligatures, modern
  'Fira Code': 'monospace', // Ligatures, popular, readable
  'IBM Plex Mono': 'monospace', // Clean, corporate, professional
  'Azeret Mono': 'monospace', // Geometric, modern
  'Martian Mono': 'monospace', // Semi-condensed, futuristic
  'Red Hat Mono': 'monospace', // Friendly, modern
  'Commit Mono': 'monospace', // Neutral, readable

  // ==========================================================================
  // DISTINCTIVE HANDWRITING/SCRIPT
  // ==========================================================================
  Caveat: 'handwriting', // Natural, casual, friendly
  Kalam: 'handwriting', // Handwritten, warm, personal
  'Architects Daughter': 'handwriting', // Sketchy, casual
  'Permanent Marker': 'handwriting', // Bold, marker style
  'Rock Salt': 'handwriting', // Rough, edgy, artistic
  'Shadows Into Light': 'handwriting', // Light, elegant, feminine
  'Dancing Script': 'handwriting', // Elegant, flowing
  'Great Vibes': 'handwriting', // Calligraphic, elegant
  Pacifico: 'handwriting', // Retro, fun, friendly

  // ==========================================================================
  // STANDARD FONTS (Reliable, safe choices)
  // ==========================================================================
  Manrope: 'sans-serif', // Geometric, modern, versatile
  'Work Sans': 'sans-serif', // Humanist, readable, friendly
  Nunito: 'sans-serif', // Rounded, friendly
  'Source Sans Pro': 'sans-serif', // Adobe, professional
  Raleway: 'sans-serif', // Elegant, thin weights available
  Poppins: 'sans-serif', // Geometric, popular
  Montserrat: 'sans-serif', // Geometric, versatile
  Lato: 'sans-serif', // Humanist, warm
  Merriweather: 'serif', // Readable, screen-optimized
  Lora: 'serif', // Contemporary, readable
  'Crimson Text': 'serif', // Old-style, elegant
  'Libre Baskerville': 'serif', // Transitional, readable
  'Source Serif Pro': 'serif', // Adobe, professional
  'PT Serif': 'serif', // Transitional, readable
  'Source Code Pro': 'monospace', // Adobe, readable
  'Roboto Mono': 'monospace', // Google, clean
  Inconsolata: 'monospace', // Humanist, readable

  // ==========================================================================
  // GENERIC FONTS (Use sparingly - avoid for creative projects)
  // ==========================================================================
  Inter: 'sans-serif', // ⚠️ Overused - avoid for distinctive designs
  Roboto: 'sans-serif', // ⚠️ Google default - too generic
  'Open Sans': 'sans-serif', // ⚠️ Safe but boring
};

/**
 * Default font options
 */
const DEFAULT_OPTIONS: Required<FontOptions> = {
  weights: [400],
  styles: ['normal'],
  variable: '',
  display: 'swap',
  subsets: ['latin'],
  preload: false,
};

/**
 * Universal Font Loader class
 */
export class UniversalFontLoader {
  /** Loaded fonts registry */
  private _fonts = new Map<string, LoadedFont>();

  /** Injected font URLs (for deduplication) */
  private _injectedUrls = new Set<string>();

  /** CSS variables to generate */
  private _cssVariables: Array<{ name: string; value: string }> = [];

  /**
   * Load a Google Font
   *
   * @param fontName - Font name (e.g., 'Inter', 'Playfair Display')
   * @param options - Loading options
   * @returns Loaded font metadata
   */
  loadFont(fontName: string, options: FontOptions = {}): LoadedFont {
    const opts = { ...DEFAULT_OPTIONS, ...options };

    // Normalize font name (replace underscores with spaces)
    const displayName = fontName.replace(/_/g, ' ');

    // Check if already loaded with same config
    const cacheKey = this._getCacheKey(displayName, opts);

    if (this._fonts.has(cacheKey)) {
      return this._fonts.get(cacheKey)!;
    }

    // Determine category
    const category = FONT_CATEGORIES[displayName] || 'sans-serif';

    // Generate font family with fallback
    const fallbacks: Record<LoadedFont['category'], string> = {
      'sans-serif': 'ui-sans-serif, system-ui, sans-serif',
      serif: 'ui-serif, Georgia, serif',
      monospace: 'ui-monospace, Consolas, monospace',
      display: 'cursive',
      handwriting: 'cursive',
    };

    const fontFamily = `"${displayName}", ${fallbacks[category]}`;

    // Generate CSS class name
    const className = `font-${displayName.toLowerCase().replace(/\s+/g, '-')}`;

    // Create font metadata
    const loadedFont: LoadedFont = {
      name: fontName,
      displayName,
      fontFamily,
      variable: opts.variable || undefined,
      category,
      weights: opts.weights,
      styles: opts.styles,
      className,
    };

    // Add CSS variable if specified
    if (opts.variable) {
      this._cssVariables.push({
        name: opts.variable,
        value: fontFamily,
      });
    }

    // Cache the font
    this._fonts.set(cacheKey, loadedFont);

    logger.debug(`Loaded font: ${displayName} (${opts.weights.join(', ')})`);

    return loadedFont;
  }

  /**
   * Generate CSS for all loaded fonts
   *
   * @returns CSS string with @import and :root variables
   */
  generateCSS(): string {
    if (this._fonts.size === 0) {
      return '';
    }

    const parts: string[] = [];

    // Generate @import URLs
    const importUrls = this._generateGoogleFontsUrls();

    for (const url of importUrls) {
      parts.push(`@import url('${url}');`);
    }

    // Generate CSS variables
    if (this._cssVariables.length > 0) {
      const variables = this._cssVariables
        .map((v) => `  ${v.name}: ${v.value};`)
        .join('\n');

      parts.push('');
      parts.push(`:root {\n${variables}\n}`);
    }

    // Generate font classes
    parts.push('');

    for (const font of this._fonts.values()) {
      parts.push(`.${font.className} {\n  font-family: ${font.fontFamily};\n}`);
    }

    return parts.join('\n');
  }

  /**
   * Generate link tags for preloading fonts
   *
   * @returns Array of link HTML strings
   */
  generatePreloadLinks(): string[] {
    const urls = this._generateGoogleFontsUrls();

    return urls.map(
      (url) => `<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="preload" as="style" href="${url}">`
    );
  }

  /**
   * Inject fonts into the document (for runtime use)
   */
  inject(): void {
    if (typeof document === 'undefined') {
      logger.warn('Cannot inject fonts: document is not available');
      return;
    }

    const css = this.generateCSS();

    if (!css) {
      return;
    }

    // Check if already injected
    const existingStyle = document.getElementById('bavini-fonts');

    if (existingStyle) {
      existingStyle.textContent = css;
    } else {
      const style = document.createElement('style');
      style.id = 'bavini-fonts';
      style.textContent = css;
      document.head.appendChild(style);
    }

    logger.info(`Injected ${this._fonts.size} font(s) into document`);
  }

  /**
   * Get all loaded fonts
   */
  getFonts(): LoadedFont[] {
    return Array.from(this._fonts.values());
  }

  /**
   * Check if a font is loaded
   */
  hasFont(fontName: string): boolean {
    const displayName = fontName.replace(/_/g, ' ');

    for (const font of this._fonts.values()) {
      if (font.displayName === displayName) {
        return true;
      }
    }

    return false;
  }

  /**
   * Clear all loaded fonts
   */
  clear(): void {
    this._fonts.clear();
    this._injectedUrls.clear();
    this._cssVariables = [];
    logger.debug('Font loader cleared');
  }

  /**
   * Generate Google Fonts API URLs
   */
  private _generateGoogleFontsUrls(): string[] {
    const fontFamilies: string[] = [];

    for (const font of this._fonts.values()) {
      // Format: Family_Name:wght@400;500;700
      const weightsStr = font.weights.join(';');
      const fontStr = `${font.displayName.replace(/\s+/g, '+')}:wght@${weightsStr}`;
      fontFamilies.push(fontStr);
    }

    if (fontFamilies.length === 0) {
      return [];
    }

    // Google Fonts API allows multiple families in one URL
    const baseUrl = 'https://fonts.googleapis.com/css2';
    const params = fontFamilies.map((f) => `family=${f}`).join('&');

    return [`${baseUrl}?${params}&display=swap`];
  }

  /**
   * Generate cache key for font config
   */
  private _getCacheKey(fontName: string, opts: Required<FontOptions>): string {
    return `${fontName}|${opts.weights.join(',')}|${opts.styles.join(',')}`;
  }
}

/**
 * Singleton instance for convenience
 */
let defaultLoader: UniversalFontLoader | null = null;

/**
 * Get or create the default font loader
 */
export function getFontLoader(): UniversalFontLoader {
  if (!defaultLoader) {
    defaultLoader = new UniversalFontLoader();
  }

  return defaultLoader;
}

/**
 * Create a new font loader instance
 */
export function createFontLoader(): UniversalFontLoader {
  return new UniversalFontLoader();
}

/**
 * Quick font loading helper
 *
 * @param fontName - Font name
 * @param options - Font options
 * @returns Font family CSS value
 */
export function loadFont(fontName: string, options?: FontOptions): string {
  const loader = getFontLoader();
  const font = loader.loadFont(fontName, options);

  return font.fontFamily;
}
