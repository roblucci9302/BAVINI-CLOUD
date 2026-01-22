/**
 * =============================================================================
 * BAVINI CLOUD - Next.js Compiler/Transformer
 * =============================================================================
 * Transforms Next.js code to work in browser-only mode by providing shims for
 * Next.js-specific imports and features.
 *
 * Supported features:
 * - next/font/google -> Google Fonts CDN
 * - next/image -> Optimized <img> tag
 * - next/link -> Regular <a> tag
 * - next/navigation -> Client-side routing shims
 * - App Router layout.tsx wrapping
 * =============================================================================
 */

import type { FrameworkCompiler, CompilationResult } from './compiler-registry';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('NextJSCompiler');

/**
 * Font configuration from next/font/google
 */
interface FontConfig {
  name: string;
  variable?: string;
  subsets?: string[];
  weight?: string | string[];
  style?: string | string[];
  display?: string;
}

/**
 * Parsed font import result
 */
interface ParsedFontImport {
  fontName: string;
  variableName: string;
  config: FontConfig;
}

/**
 * Next.js Compiler for browser runtime
 *
 * This compiler transforms Next.js specific code to work in a browser-only
 * environment. It doesn't compile files itself but provides transformation
 * utilities used by the browser-build-adapter.
 */
export class NextJSCompiler implements FrameworkCompiler {
  name = 'Next.js';
  extensions = ['.tsx', '.ts', '.jsx', '.js'];

  private _initialized = false;
  private _fontImports: Map<string, ParsedFontImport> = new Map();

  async init(): Promise<void> {
    if (this._initialized) return;

    logger.info('Initializing Next.js transformer...');
    this._initialized = true;
    logger.info('Next.js transformer initialized');
  }

  canHandle(filename: string): boolean {
    return this.extensions.some(ext => filename.endsWith(ext));
  }

  /**
   * Transform Next.js code for browser runtime
   */
  async compile(source: string, filename: string): Promise<CompilationResult> {
    let code = source;
    const warnings: string[] = [];
    let css = '';

    // Track font imports for this file
    this._fontImports.clear();

    // 1. Transform next/font/google imports
    const fontResult = this.transformFontImports(code);
    code = fontResult.code;
    css += fontResult.css;
    if (fontResult.warning) warnings.push(fontResult.warning);

    // 2. Transform next/image imports
    code = this.transformImageImports(code);

    // 3. Transform next/link imports
    code = this.transformLinkImports(code);

    // 4. Transform next/navigation imports
    code = this.transformNavigationImports(code);

    // 5. Remove Next.js metadata export (server-only)
    code = this.removeMetadataExport(code);

    // 6. Transform next/head imports
    code = this.transformHeadImports(code);

    return {
      code,
      css: css || undefined,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Transform next/font/google imports to Google Fonts CSS
   *
   * Input:
   * ```
   * import { Playfair_Display, Inter } from 'next/font/google'
   * const playfair = Playfair_Display({ subsets: ['latin'], variable: '--font-display' })
   * const inter = Inter({ subsets: ['latin'], variable: '--font-body' })
   * ```
   *
   * Output:
   * ```
   * const playfair = { className: 'font-playfair', variable: '--font-display', style: { fontFamily: '"Playfair Display", serif' } }
   * const inter = { className: 'font-inter', variable: '--font-body', style: { fontFamily: '"Inter", sans-serif' } }
   * ```
   *
   * Plus CSS:
   * ```
   * @import url('https://fonts.googleapis.com/css2?family=Playfair+Display&family=Inter&display=swap');
   * :root { --font-display: "Playfair Display", serif; --font-body: "Inter", sans-serif; }
   * ```
   */
  transformFontImports(code: string): { code: string; css: string; warning?: string } {
    let css = '';
    const fontFamilies: string[] = [];
    const cssVariables: string[] = [];

    // Match: import { FontName, FontName2 } from 'next/font/google'
    const importRegex = /import\s*\{([^}]+)\}\s*from\s*['"]next\/font\/google['"]/g;
    const fontNamesFromImport: string[] = [];

    let match;
    while ((match = importRegex.exec(code)) !== null) {
      const imports = match[1].split(',').map(s => s.trim()).filter(Boolean);
      fontNamesFromImport.push(...imports);
    }

    // Remove the import statement
    code = code.replace(/import\s*\{[^}]+\}\s*from\s*['"]next\/font\/google['"];?\n?/g, '');

    // Match font initialization: const varName = FontName({ ... })
    for (const fontName of fontNamesFromImport) {
      // Pattern: const varName = FontName({ config })
      const initRegex = new RegExp(
        `const\\s+(\\w+)\\s*=\\s*${fontName}\\s*\\(\\s*\\{([^}]*)\\}\\s*\\)`,
        'g'
      );

      code = code.replace(initRegex, (_, varName, configStr) => {
        // Parse the config
        const variableMatch = configStr.match(/variable\s*:\s*['"]([^'"]+)['"]/);
        const variable = variableMatch ? variableMatch[1] : undefined;

        const displayMatch = configStr.match(/display\s*:\s*['"]([^'"]+)['"]/);
        const display = displayMatch ? displayMatch[1] : 'swap';

        const weightMatch = configStr.match(/weight\s*:\s*['"]([^'"]+)['"]/);
        const weight = weightMatch ? weightMatch[1] : '400';

        // Convert font name: Playfair_Display -> Playfair Display
        const displayName = fontName.replace(/_/g, ' ');

        // Determine font category
        const isSerif = ['Playfair_Display', 'Merriweather', 'Lora', 'Crimson_Text', 'Libre_Baskerville'].includes(fontName);
        const isMono = ['Fira_Code', 'JetBrains_Mono', 'Source_Code_Pro', 'Roboto_Mono'].includes(fontName);
        const fallback = isMono ? 'monospace' : isSerif ? 'serif' : 'sans-serif';

        // Build Google Fonts URL part
        const fontUrlPart = fontName.replace(/_/g, '+') + (weight !== '400' ? `:wght@${weight}` : '');
        fontFamilies.push(fontUrlPart);

        // Add CSS variable if specified
        if (variable) {
          cssVariables.push(`  ${variable}: "${displayName}", ${fallback};`);
        }

        // Store font info
        this._fontImports.set(varName, {
          fontName,
          variableName: varName,
          config: { name: displayName, variable, display },
        });

        // Return the shim object
        const className = `font-${varName.toLowerCase()}`;
        return `const ${varName} = {
  className: '${className}',
  variable: '${variable || ''}',
  style: { fontFamily: '"${displayName}", ${fallback}' }
}`;
      });
    }

    // Generate CSS if fonts were found
    if (fontFamilies.length > 0) {
      const googleFontsUrl = `https://fonts.googleapis.com/css2?${fontFamilies.map(f => `family=${f}`).join('&')}&display=swap`;
      css = `@import url('${googleFontsUrl}');\n`;

      if (cssVariables.length > 0) {
        css += `:root {\n${cssVariables.join('\n')}\n}\n`;
      }

      logger.debug(`Transformed ${fontFamilies.length} Google Font(s)`);
    }

    return { code, css };
  }

  /**
   * Transform next/image to regular img element
   *
   * Input: import Image from 'next/image'
   * Output: const Image = (props) => <img {...props} />
   */
  transformImageImports(code: string): string {
    // Check if next/image is imported
    if (!code.includes('next/image')) {
      return code;
    }

    // Replace import
    code = code.replace(
      /import\s+(\w+)\s+from\s*['"]next\/image['"];?\n?/g,
      (_, importName) => {
        logger.debug(`Transforming next/image import: ${importName}`);
        return `const ${importName} = ({ src, alt, width, height, fill, priority, placeholder, className, style, ...props }) => {
  const imgStyle = fill ? { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', ...style } : style;
  return <img src={src} alt={alt || ''} width={fill ? undefined : width} height={fill ? undefined : height} className={className} style={imgStyle} loading={priority ? 'eager' : 'lazy'} {...props} />;
};\n`;
      }
    );

    return code;
  }

  /**
   * Transform next/link to regular anchor element
   *
   * Input: import Link from 'next/link'
   * Output: const Link = ({ href, children, ...props }) => <a href={href} {...props}>{children}</a>
   */
  transformLinkImports(code: string): string {
    if (!code.includes('next/link')) {
      return code;
    }

    code = code.replace(
      /import\s+(\w+)\s+from\s*['"]next\/link['"];?\n?/g,
      (_, importName) => {
        logger.debug(`Transforming next/link import: ${importName}`);
        return `const ${importName} = ({ href, children, className, style, target, rel, ...props }) => {
  return <a href={href} className={className} style={style} target={target} rel={rel} {...props}>{children}</a>;
};\n`;
      }
    );

    return code;
  }

  /**
   * Transform next/navigation hooks
   *
   * Provides client-side shims for:
   * - useRouter() -> { push, replace, back, forward, refresh, prefetch }
   * - usePathname() -> window.location.pathname
   * - useSearchParams() -> URLSearchParams
   * - useParams() -> {}
   */
  transformNavigationImports(code: string): string {
    if (!code.includes('next/navigation')) {
      return code;
    }

    // Match: import { useRouter, usePathname } from 'next/navigation'
    const importMatch = code.match(/import\s*\{([^}]+)\}\s*from\s*['"]next\/navigation['"]/);
    if (!importMatch) {
      return code;
    }

    const imports = importMatch[1].split(',').map(s => s.trim()).filter(Boolean);

    // Build shim code
    const shims: string[] = [];

    for (const importName of imports) {
      switch (importName) {
        case 'useRouter':
          shims.push(`const useRouter = () => ({
  push: (url) => { window.location.href = url; },
  replace: (url) => { window.location.replace(url); },
  back: () => { window.history.back(); },
  forward: () => { window.history.forward(); },
  refresh: () => { window.location.reload(); },
  prefetch: () => {},
});`);
          break;

        case 'usePathname':
          shims.push(`const usePathname = () => window.location.pathname;`);
          break;

        case 'useSearchParams':
          shims.push(`const useSearchParams = () => new URLSearchParams(window.location.search);`);
          break;

        case 'useParams':
          shims.push(`const useParams = () => ({});`);
          break;

        case 'redirect':
          shims.push(`const redirect = (url) => { window.location.href = url; };`);
          break;

        case 'notFound':
          shims.push(`const notFound = () => { throw new Error('Not Found'); };`);
          break;

        default:
          logger.warn(`Unknown next/navigation import: ${importName}`);
      }
    }

    // Remove original import and add shims
    code = code.replace(
      /import\s*\{[^}]+\}\s*from\s*['"]next\/navigation['"];?\n?/g,
      shims.join('\n') + '\n'
    );

    logger.debug(`Transformed ${imports.length} next/navigation import(s)`);
    return code;
  }

  /**
   * Remove Next.js metadata export (only works on server)
   *
   * Input: export const metadata: Metadata = { title: '...' }
   * Output: (removed)
   */
  removeMetadataExport(code: string): string {
    // Remove: export const metadata: Metadata = { ... }
    // This regex handles multi-line metadata objects
    code = code.replace(
      /export\s+const\s+metadata\s*:\s*Metadata\s*=\s*\{[\s\S]*?\};?\n?/g,
      '// metadata removed (server-only feature)\n'
    );

    // Also remove the Metadata type import if present
    code = code.replace(
      /import\s+(?:type\s+)?\{\s*Metadata\s*\}\s+from\s*['"]next['"];?\n?/g,
      ''
    );

    return code;
  }

  /**
   * Transform next/head to React Helmet or inline
   */
  transformHeadImports(code: string): string {
    if (!code.includes('next/head')) {
      return code;
    }

    code = code.replace(
      /import\s+(\w+)\s+from\s*['"]next\/head['"];?\n?/g,
      (_, importName) => {
        logger.debug(`Transforming next/head import: ${importName}`);
        // Simple Head component that does nothing in browser mode
        // (we can't modify <head> dynamically in srcdoc mode easily)
        return `const ${importName} = ({ children }) => null; // Head tags handled via HTML injection\n`;
      }
    );

    return code;
  }

  /**
   * Get collected font CSS for injection into HTML
   */
  getFontCSS(): string {
    const fontFamilies: string[] = [];
    const cssVariables: string[] = [];

    for (const [, fontInfo] of this._fontImports) {
      const displayName = fontInfo.config.name;
      const fontUrlPart = fontInfo.fontName.replace(/_/g, '+');
      fontFamilies.push(fontUrlPart);

      if (fontInfo.config.variable) {
        const isSerif = ['Playfair Display', 'Merriweather', 'Lora'].includes(displayName);
        const fallback = isSerif ? 'serif' : 'sans-serif';
        cssVariables.push(`  ${fontInfo.config.variable}: "${displayName}", ${fallback};`);
      }
    }

    if (fontFamilies.length === 0) {
      return '';
    }

    const googleFontsUrl = `https://fonts.googleapis.com/css2?${fontFamilies.map(f => `family=${f}`).join('&')}&display=swap`;
    let css = `@import url('${googleFontsUrl}');\n`;

    if (cssVariables.length > 0) {
      css += `:root {\n${cssVariables.join('\n')}\n}\n`;
    }

    return css;
  }
}

/**
 * Detect if a project is a Next.js project
 */
export function isNextJSProject(files: Map<string, string>): boolean {
  // Check for next.config.js/ts/mjs
  if (files.has('/next.config.js') || files.has('/next.config.ts') || files.has('/next.config.mjs')) {
    return true;
  }

  // Check package.json for next dependency
  const pkgJson = files.get('/package.json');
  if (pkgJson) {
    try {
      const pkg = JSON.parse(pkgJson);
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps['next']) {
        return true;
      }
    } catch {
      // Ignore parse errors
    }
  }

  // Check for App Router structure
  if (files.has('/src/app/layout.tsx') || files.has('/src/app/page.tsx') ||
      files.has('/app/layout.tsx') || files.has('/app/page.tsx')) {
    return true;
  }

  // Check for next/... imports in files
  for (const [, content] of files) {
    if (content.includes('from \'next/') || content.includes('from "next/')) {
      return true;
    }
  }

  return false;
}

/**
 * Get the entry point for a Next.js App Router project
 */
export function getNextJSEntryPoint(files: Map<string, string>): string | null {
  // App Router: src/app/layout.tsx or app/layout.tsx
  const possibleLayouts = [
    '/src/app/layout.tsx',
    '/src/app/layout.jsx',
    '/src/app/layout.ts',
    '/src/app/layout.js',
    '/app/layout.tsx',
    '/app/layout.jsx',
    '/app/layout.ts',
    '/app/layout.js',
  ];

  for (const layout of possibleLayouts) {
    if (files.has(layout)) {
      return layout;
    }
  }

  // Pages Router: pages/_app.tsx or pages/index.tsx
  const possiblePages = [
    '/src/pages/_app.tsx',
    '/src/pages/_app.jsx',
    '/pages/_app.tsx',
    '/pages/_app.jsx',
    '/src/pages/index.tsx',
    '/src/pages/index.jsx',
    '/pages/index.tsx',
    '/pages/index.jsx',
  ];

  for (const page of possiblePages) {
    if (files.has(page)) {
      return page;
    }
  }

  return null;
}

/**
 * Create the Next.js compiler instance
 */
export function createNextJSCompiler(): NextJSCompiler {
  return new NextJSCompiler();
}
