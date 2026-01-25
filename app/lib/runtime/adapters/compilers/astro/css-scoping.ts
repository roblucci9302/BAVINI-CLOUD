/**
 * =============================================================================
 * BAVINI CLOUD - Astro CSS Scoping
 * =============================================================================
 * Functions for extracting and scoping CSS from Astro components.
 *
 * @module lib/runtime/adapters/compilers/astro/css-scoping
 * =============================================================================
 */

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('AstroCSSScoping');

/**
 * Generate Astro-style scope hash from filename.
 * Astro uses a hash based on the file path for scoping.
 *
 * @param filename - The filename to generate hash from
 * @returns 8-character base36 hash string
 */
export function generateScopeHash(filename: string): string {
  // Simple hash function similar to what Astro uses
  let hash = 0;
  for (let i = 0; i < filename.length; i++) {
    const char = filename.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  // Convert to base36 and take last 8 chars
  return Math.abs(hash).toString(36).substring(0, 8);
}

/**
 * Extract CSS from <style> tags in the Astro source.
 * Handles both global and scoped styles.
 * Applies Astro-style scoping to non-global styles.
 *
 * @param source - The Astro source code
 * @param filename - The filename for scope hash generation
 * @param actualScopeHash - The scope hash extracted from compiled code (if available)
 * @returns Extracted and scoped CSS string
 */
export function extractStylesFromSource(
  source: string,
  filename: string,
  actualScopeHash?: string | null,
): string {
  const styles: string[] = [];
  // Use the actual scope hash from Astro if available, otherwise generate one
  const scopeHash = actualScopeHash || generateScopeHash(filename);
  const scopeClass = `astro-${scopeHash}`;

  // Match all <style> tags with their attributes and content
  const styleRegex = /<style([^>]*)>([^]*?)<\/style>/gi;
  let match;

  while ((match = styleRegex.exec(source)) !== null) {
    const attributes = match[1] || '';
    const styleContent = match[2].trim();

    if (!styleContent) continue;

    // Check if this is a global style (is:global attribute)
    const isGlobal = /is:global/i.test(attributes);

    if (isGlobal) {
      // Global styles are used as-is
      styles.push(`/* Global styles from ${filename} */\n${styleContent}`);
    } else {
      // Scoped styles need the scope class added to selectors
      const scopedCss = scopeCSS(styleContent, scopeClass);
      styles.push(`/* Scoped styles from ${filename} (${scopeClass}) */\n${scopedCss}`);
    }
  }

  if (styles.length > 0) {
    logger.debug(`Extracted ${styles.length} style block(s) from ${filename}, scope: ${scopeClass}`);
  }

  return styles.join('\n\n');
}

/**
 * Add scope class to CSS selectors.
 * This mimics Astro's scoping behavior.
 *
 * @param css - The CSS content to scope
 * @param scopeClass - The scope class to add (e.g., "astro-abc123")
 * @returns CSS with scoped selectors
 */
export function scopeCSS(css: string, scopeClass: string): string {
  // Simple CSS scoping - adds .astro-xxxxx to each selector
  // This is a simplified version of what Astro does

  // Split CSS into rules (very basic parsing)
  // Handle @media, @keyframes, etc.
  let result = css;

  // Don't scope @keyframes, @font-face, etc.
  const atRuleRegex = /@(keyframes|font-face|import|charset|namespace)[^{]*\{[^}]*\}/gi;
  const atRules: string[] = [];
  result = result.replace(atRuleRegex, (match) => {
    atRules.push(match);
    return `__AT_RULE_${atRules.length - 1}__`;
  });

  // Scope regular selectors
  // Match selector { ... } patterns
  result = result.replace(/([^{}@]+)\{([^{}]*)\}/g, (match, selector, rules) => {
    // Don't scope if it's a placeholder for at-rules
    if (selector.includes('__AT_RULE_')) {
      return match;
    }

    // Split multiple selectors and scope each one
    const scopedSelectors = selector
      .split(',')
      .map((s: string) => {
        s = s.trim();
        if (!s) return s;

        // Don't scope :root, :host, html, body, *, or selectors that already have the scope
        if (/^(:root|:host|html|body|\*|@)/.test(s) || s.includes(scopeClass)) {
          return s;
        }

        // Add scope class to the selector
        // For complex selectors, add to the first element
        // e.g., ".btn" -> ".btn.astro-xxxxx"
        // e.g., ".card .title" -> ".card.astro-xxxxx .title"
        const parts = s.split(/\s+/);
        if (parts.length > 0) {
          // Add scope to first part that's not a combinator
          for (let i = 0; i < parts.length; i++) {
            if (parts[i] && !/^[>+~]$/.test(parts[i])) {
              // Check if it's a pseudo-element or pseudo-class at the end
              const pseudoMatch = parts[i].match(/^([^:]+)(:.+)$/);
              if (pseudoMatch) {
                parts[i] = `${pseudoMatch[1]}.${scopeClass}${pseudoMatch[2]}`;
              } else {
                parts[i] = `${parts[i]}.${scopeClass}`;
              }
              break;
            }
          }
        }
        return parts.join(' ');
      })
      .join(', ');

    return `${scopedSelectors} {${rules}}`;
  });

  // Restore at-rules
  atRules.forEach((rule, i) => {
    result = result.replace(`__AT_RULE_${i}__`, rule);
  });

  return result;
}
