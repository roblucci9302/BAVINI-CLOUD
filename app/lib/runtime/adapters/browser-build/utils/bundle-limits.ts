/**
 * =============================================================================
 * BAVINI CLOUD - Bundle Size Limits
 * =============================================================================
 * Provides bundle size checking and warnings/errors for oversized bundles.
 * =============================================================================
 */

import { createScopedLogger } from '~/utils/logger';
import type { BuildWarning, BuildError } from '../../../types';

const logger = createScopedLogger('BundleLimits');

/**
 * Bundle size limits configuration
 */
export const BUNDLE_LIMITS = {
  /** Warning threshold for JS bundle (1.5MB) */
  JS_WARNING_KB: 1500,
  /** Error threshold for JS bundle (5MB) - browser may freeze */
  JS_ERROR_KB: 5000,
  /** Warning threshold for CSS bundle (500KB) */
  CSS_WARNING_KB: 500,
  /** Error threshold for CSS bundle (2MB) */
  CSS_ERROR_KB: 2000,
  /** Warning threshold for total bundle (2MB) */
  TOTAL_WARNING_KB: 2000,
  /** Error threshold for total bundle (8MB) */
  TOTAL_ERROR_KB: 8000,
} as const;

/**
 * Result of bundle size check
 */
export interface BundleSizeCheckResult {
  /** Size warnings for the user */
  warnings: BuildWarning[];
  /** Size errors (bundle too large) */
  errors: BuildError[];
  /** JS bundle size in KB */
  jsKB: number;
  /** CSS bundle size in KB */
  cssKB: number;
  /** Total bundle size in KB */
  totalKB: number;
}

/**
 * Check bundle sizes and return warnings/errors if limits exceeded
 *
 * @param code - JavaScript code
 * @param css - CSS code
 * @returns Check result with warnings and errors
 */
export function checkBundleSizeLimits(code: string, css: string): BundleSizeCheckResult {
  const jsKB = code.length / 1024;
  const cssKB = css.length / 1024;
  const totalKB = jsKB + cssKB;

  const warnings: BuildWarning[] = [];
  const errors: BuildError[] = [];

  // Check JS bundle size
  if (jsKB > BUNDLE_LIMITS.JS_ERROR_KB) {
    errors.push({
      message: `JS bundle too large (${jsKB.toFixed(0)}KB > ${BUNDLE_LIMITS.JS_ERROR_KB}KB limit). Browser may freeze or crash. Split your code or use fewer dependencies.`,
      file: 'bundle.js',
    });
    logger.error(`JS bundle exceeds error limit: ${jsKB.toFixed(0)}KB`);
  } else if (jsKB > BUNDLE_LIMITS.JS_WARNING_KB) {
    warnings.push({
      message: `JS bundle is large (${jsKB.toFixed(0)}KB). Consider code splitting or removing unused dependencies.`,
      file: 'bundle.js',
    });
    logger.warn(`JS bundle exceeds warning limit: ${jsKB.toFixed(0)}KB`);
  }

  // Check CSS bundle size
  if (cssKB > BUNDLE_LIMITS.CSS_ERROR_KB) {
    errors.push({
      message: `CSS bundle too large (${cssKB.toFixed(0)}KB > ${BUNDLE_LIMITS.CSS_ERROR_KB}KB limit). Remove unused styles or split CSS.`,
      file: 'bundle.css',
    });
    logger.error(`CSS bundle exceeds error limit: ${cssKB.toFixed(0)}KB`);
  } else if (cssKB > BUNDLE_LIMITS.CSS_WARNING_KB) {
    warnings.push({
      message: `CSS bundle is large (${cssKB.toFixed(0)}KB). Consider purging unused styles.`,
      file: 'bundle.css',
    });
    logger.warn(`CSS bundle exceeds warning limit: ${cssKB.toFixed(0)}KB`);
  }

  // Check total bundle size
  if (totalKB > BUNDLE_LIMITS.TOTAL_ERROR_KB) {
    errors.push({
      message: `Total bundle too large (${totalKB.toFixed(0)}KB > ${BUNDLE_LIMITS.TOTAL_ERROR_KB}KB limit). Application may not load properly.`,
    });
    logger.error(`Total bundle exceeds error limit: ${totalKB.toFixed(0)}KB`);
  } else if (totalKB > BUNDLE_LIMITS.TOTAL_WARNING_KB) {
    warnings.push({
      message: `Total bundle is large (${totalKB.toFixed(0)}KB). Consider optimizations for better performance.`,
    });
    logger.warn(`Total bundle exceeds warning limit: ${totalKB.toFixed(0)}KB`);
  }

  return { warnings, errors, jsKB, cssKB, totalKB };
}

/**
 * Log bundle size summary
 */
export function logBundleSize(jsKB: number, cssKB: number, totalKB: number): void {
  logger.info(`Bundle size: JS=${jsKB.toFixed(1)}KB, CSS=${cssKB.toFixed(1)}KB, Total=${totalKB.toFixed(1)}KB`);
}
