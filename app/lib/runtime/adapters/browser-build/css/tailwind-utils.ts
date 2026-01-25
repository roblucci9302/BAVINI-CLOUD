/**
 * =============================================================================
 * BAVINI CLOUD - Tailwind CSS Utilities
 * =============================================================================
 * Utility functions for processing Tailwind CSS in browser builds.
 *
 * Features:
 * - Extract custom colors from tailwind.config
 * - Strip Tailwind imports (handled by CDN)
 * - Google Fonts CSS extraction for Next.js
 * =============================================================================
 */

import type { createScopedLogger } from '~/utils/logger';

type Logger = ReturnType<typeof createScopedLogger>;

/**
 * Extract custom color definitions from tailwind.config.js/ts
 * Converts Tailwind color config to CSS variables for runtime use.
 *
 * @param files - Virtual file system map
 * @param logger - Scoped logger instance
 * @returns CSS variable definitions string
 */
export function extractTailwindCustomColors(
  files: Map<string, string>,
  logger: Logger
): string {
  const configContent = files.get('/tailwind.config.js') || files.get('/tailwind.config.ts');
  if (!configContent) {
    return '';
  }

  const colorDefs: string[] = [];

  // Try to find the colors object in extend or theme
  // We need to handle nested objects like: cream: { 50: '#fff', 100: '#eee' }
  const colorsBlockMatch = configContent.match(/colors\s*:\s*\{([\s\S]*?)\n\s{4}\}/);
  if (!colorsBlockMatch) {
    // Try simpler patterns
    const simpleMatch = configContent.match(/colors\s*:\s*\{([^}]+)\}/);
    if (simpleMatch) {
      // Simple color: value pairs
      const simpleColorRegex = /['"]?(\w+)['"]?\s*:\s*['"]([^'"]+)['"]/g;
      let match;
      while ((match = simpleColorRegex.exec(simpleMatch[1])) !== null) {
        colorDefs.push(`--color-${match[1]}: ${match[2]};`);
      }
    }
    if (colorDefs.length > 0) {
      logger.debug(`Extracted ${colorDefs.length} simple custom colors from tailwind.config`);
      return colorDefs.join('\n    ');
    }
    return '';
  }

  const colorsBlock = colorsBlockMatch[1];

  // Parse nested color objects: colorName: { shade: 'value', ... }
  // Pattern matches: colorName: { ... }
  const nestedColorRegex = /['"]?(\w+)['"]?\s*:\s*\{([^}]+)\}/g;
  let nestedMatch;

  while ((nestedMatch = nestedColorRegex.exec(colorsBlock)) !== null) {
    const colorName = nestedMatch[1];
    const shadesBlock = nestedMatch[2];

    // Extract shade: value pairs
    const shadeRegex = /['"]?(\w+)['"]?\s*:\s*['"]([^'"]+)['"]/g;
    let shadeMatch;

    while ((shadeMatch = shadeRegex.exec(shadesBlock)) !== null) {
      const shade = shadeMatch[1];
      const value = shadeMatch[2];

      // Generate CSS variable: --color-colorName-shade: value
      if (shade === 'DEFAULT') {
        colorDefs.push(`--color-${colorName}: ${value};`);
      } else {
        colorDefs.push(`--color-${colorName}-${shade}: ${value};`);
      }
    }
  }

  // Also extract any simple color: value pairs at the top level
  // These would be single-value colors, not nested objects
  const lines = colorsBlock.split('\n');
  for (const line of lines) {
    // Match: colorName: 'value' (not followed by {)
    const simpleMatch = line.match(/^\s*['"]?(\w+)['"]?\s*:\s*['"]([^'"]+)['"]\s*,?\s*$/);
    if (simpleMatch) {
      colorDefs.push(`--color-${simpleMatch[1]}: ${simpleMatch[2]};`);
    }
  }

  if (colorDefs.length > 0) {
    logger.info(`Extracted ${colorDefs.length} custom colors from tailwind.config`);
  }

  return colorDefs.join('\n    ');
}

/**
 * Strip Tailwind CSS @import statements from CSS content.
 * These are handled by the Tailwind CDN browser script.
 *
 * @param css - CSS content to process
 * @param logger - Scoped logger instance
 * @returns CSS with Tailwind imports replaced
 */
export function stripTailwindImports(css: string, logger: Logger): string {
  // Remove @import statements for tailwindcss
  // Patterns: @import 'tailwindcss/base', @import "tailwindcss", @import url(tailwindcss/...)
  const patterns = [
    // @import 'tailwindcss/base'; or @import "tailwindcss/base";
    /@import\s+['"][^'"]*tailwindcss[^'"]*['"]\s*;?/gi,
    // @import url('tailwindcss/...') or @import url("tailwindcss/...")
    /@import\s+url\s*\(\s*['"]?[^)]*tailwindcss[^)]*['"]?\s*\)\s*;?/gi,
    // @tailwind base; @tailwind components; @tailwind utilities;
    /@tailwind\s+\w+\s*;?/gi,
  ];

  let result = css;
  for (const pattern of patterns) {
    const matches = result.match(pattern);
    if (matches && matches.length > 0) {
      logger.debug(`Stripping ${matches.length} Tailwind import(s): ${matches.join(', ')}`);
    }
    result = result.replace(pattern, '/* Tailwind handled by CDN */');
  }

  return result;
}

/** Serif font names for fallback detection */
const SERIF_FONTS = ['Playfair_Display', 'Merriweather', 'Lora', 'Crimson_Text', 'EB_Garamond', 'Libre_Baskerville'];

/** Monospace font names for fallback detection */
const MONO_FONTS = ['Fira_Code', 'JetBrains_Mono', 'Source_Code_Pro', 'IBM_Plex_Mono', 'Space_Mono', 'Geist_Mono'];

/**
 * Determine the appropriate fallback font family for a given font name.
 *
 * @param fontName - The font name (e.g., 'Playfair_Display')
 * @returns The fallback font family
 */
function getFontFallback(fontName: string): string {
  if (MONO_FONTS.includes(fontName)) {
    return 'monospace';
  }
  if (SERIF_FONTS.includes(fontName)) {
    return 'serif';
  }
  return 'sans-serif';
}

/**
 * Extract Google Fonts CSS from Next.js font configurations.
 * Parses imports like: import { Playfair_Display, Inter } from 'next/font/google'
 * Also extracts CSS variable assignments from font initializations.
 *
 * @param files - Virtual file system map
 * @param logger - Scoped logger instance
 * @returns CSS with @import and CSS variables for Google Fonts
 */
export function extractGoogleFontsCSS(
  files: Map<string, string>,
  logger: Logger
): string {
  const fontNames = new Set<string>();
  const fontVariables = new Map<string, { font: string; fallback: string }>();

  // Scan all files for next/font/google imports and font initializations
  for (const [filePath, content] of files) {
    if (!filePath.endsWith('.tsx') && !filePath.endsWith('.ts') && !filePath.endsWith('.jsx') && !filePath.endsWith('.js')) {
      continue;
    }

    // Match: import { FontName, FontName2 } from 'next/font/google'
    const importMatch = content.match(/import\s*\{([^}]+)\}\s*from\s*['"]next\/font\/google['"]/);
    if (importMatch) {
      const imports = importMatch[1].split(',').map(s => s.trim()).filter(Boolean);
      imports.forEach(font => fontNames.add(font));
    }

    // Match font initialization to get CSS variables
    // const inter = Inter({ variable: '--font-body', ... })
    const initRegex = /const\s+(\w+)\s*=\s*(\w+)\s*\(\s*\{[^}]*variable\s*:\s*['"]([^'"]+)['"]/g;
    let match;
    while ((match = initRegex.exec(content)) !== null) {
      const [, , fontName, variable] = match;
      const displayName = fontName.replace(/_/g, ' ');
      const fallback = getFontFallback(fontName);
      fontVariables.set(variable, { font: displayName, fallback });
    }
  }

  if (fontNames.size === 0) {
    return '';
  }

  // Build Google Fonts URL with all fonts combined
  const fontParams = Array.from(fontNames).map(font => {
    const urlName = font.replace(/_/g, '+');
    return `family=${urlName}:wght@300;400;500;600;700`;
  });

  const googleFontsUrl = `https://fonts.googleapis.com/css2?${fontParams.join('&')}&display=swap`;

  // Build CSS
  let css = `@import url('${googleFontsUrl}');\n\n`;

  // Add CSS variables if any were extracted
  if (fontVariables.size > 0) {
    css += ':root {\n';
    for (const [variable, { font, fallback }] of fontVariables) {
      css += `  ${variable}: "${font}", ${fallback};\n`;
    }
    css += '}\n';
  }

  logger.info(`Extracted ${fontNames.size} Google Font(s) for Next.js project`);
  return css;
}

/**
 * Common file extensions for web development
 */
export const WEB_EXTENSIONS = [
  '', '.tsx', '.ts', '.jsx', '.js', '.vue', '.svelte', '.astro', '.json', '.css', '.mjs'
] as const;

/**
 * Index file variants to try when resolving directories
 */
export const INDEX_FILES = [
  '/index.tsx', '/index.ts', '/index.jsx', '/index.js',
  '/index.vue', '/index.svelte', '/index.astro'
] as const;

/**
 * Find a file in the virtual filesystem, trying various extensions.
 *
 * @param path - Path to find
 * @param files - Virtual file system map
 * @returns Found path or null
 */
export function findFileWithExtensions(
  path: string,
  files: Map<string, string>
): string | null {
  // Normalize paths - files might be stored with or without leading /
  const pathsToTry = [path];

  // Also try without leading slash
  if (path.startsWith('/')) {
    pathsToTry.push(path.slice(1));
  } else {
    pathsToTry.push('/' + path);
  }

  for (const basePath of pathsToTry) {
    for (const ext of WEB_EXTENSIONS) {
      const pathWithExt = basePath + ext;

      if (files.has(pathWithExt)) {
        return pathWithExt;
      }
    }

    // Try index files (including framework-specific)
    for (const indexFile of INDEX_FILES) {
      const indexPath = basePath + indexFile;

      if (files.has(indexPath)) {
        return indexPath;
      }
    }
  }

  return null;
}
