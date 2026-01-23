/**
 * =============================================================================
 * BAVINI CLOUD - Preview Creator
 * =============================================================================
 * Creates previews using Service Worker or srcdoc modes.
 * =============================================================================
 */

import { createScopedLogger } from '~/utils/logger';
import type { PreviewInfo } from '../../../types';
import {
  shouldAttemptServiceWorker,
  isServiceWorkerReady,
  incrementSwFailures,
  getPreviewModeReason,
} from './preview-config';

const logger = createScopedLogger('PreviewCreator');

/**
 * Result of creating a preview
 */
export interface PreviewResult {
  preview: PreviewInfo;
  mode: 'service-worker' | 'srcdoc';
}

/**
 * Service Worker functions (injected from main adapter)
 */
export interface ServiceWorkerFunctions {
  setPreviewFiles: (files: Record<string, string>, buildId: string) => Promise<boolean>;
  getPreviewUrl: () => string;
}

/**
 * Verify Service Worker is serving content
 *
 * @param url - URL to verify
 * @returns Whether SW is serving the URL
 */
export async function verifyServiceWorkerServing(url: string): Promise<boolean> {
  try {
    // Use a short timeout - if SW works, it should respond very fast
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const response = await fetch(url, {
      signal: controller.signal,
      cache: 'no-store',
    });

    clearTimeout(timeoutId);

    // Check if we got a valid response
    if (!response.ok) {
      logger.warn(`SW verification failed: status ${response.status}`);
      return false;
    }

    // Check if response came from our Service Worker
    const servedBy = response.headers.get('X-Served-By');
    if (!servedBy || !servedBy.includes('BAVINI-Preview-SW')) {
      logger.warn('SW verification failed: response not from our Service Worker');
      return false;
    }

    // Check that we got actual content
    const text = await response.text();
    if (text.length < 100) {
      logger.warn('SW verification failed: response too short');
      return false;
    }

    logger.info('Service Worker verification passed');
    return true;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      logger.warn('SW verification timed out');
    } else {
      logger.warn('SW verification error:', error);
    }
    return false;
  }
}

/**
 * Create preview using Service Worker
 *
 * @param html - HTML content to serve
 * @param swFunctions - Service Worker functions
 * @returns Preview info if successful, null if failed
 */
export async function createPreviewWithServiceWorker(
  html: string,
  swFunctions: ServiceWorkerFunctions
): Promise<PreviewInfo | null> {
  const buildId = Date.now().toString();
  const { setPreviewFiles, getPreviewUrl } = swFunctions;

  // Send the HTML to the Service Worker
  const files: Record<string, string> = {
    'index.html': html,
  };

  const success = await setPreviewFiles(files, buildId);

  if (!success) {
    logger.warn('Service Worker failed to store files');
    return null;
  }

  // Use the Service Worker URL
  const previewUrl = getPreviewUrl();
  const fullUrl = `${previewUrl}?t=${buildId}`;

  // Create preview object
  const preview: PreviewInfo = {
    url: fullUrl,
    ready: true,
    updatedAt: Date.now(),
  };

  logger.info('Preview created via Service Worker');
  return preview;
}

/**
 * Create preview using srcdoc
 *
 * @param html - HTML content
 * @param revokeOldBlobUrl - Function to revoke old blob URL if exists
 * @returns Preview info
 */
export function createPreviewWithSrcdoc(
  html: string,
  revokeOldBlobUrl?: () => void
): PreviewInfo {
  // Revoke any previous blob URL (cleanup from old mode)
  if (revokeOldBlobUrl) {
    try {
      revokeOldBlobUrl();
      logger.debug('Revoked previous blob URL (switching to srcdoc mode)');
    } catch (e) {
      logger.warn('Failed to revoke old blob URL:', e);
    }
  }

  // Create preview object with srcdoc
  // URL is set to 'about:srcdoc' as a marker for the Preview component
  const preview: PreviewInfo = {
    url: 'about:srcdoc',
    ready: true,
    updatedAt: Date.now(),
    srcdoc: html,
  };

  logger.info('Preview created via srcdoc (recommended mode)');
  return preview;
}

/**
 * Create preview with automatic mode selection
 *
 * @param html - HTML content
 * @param swFunctions - Service Worker functions (optional)
 * @param revokeOldBlobUrl - Function to revoke old blob URL
 * @returns Preview result with mode used
 */
export async function createPreview(
  html: string,
  swFunctions?: ServiceWorkerFunctions,
  revokeOldBlobUrl?: () => void
): Promise<PreviewResult> {
  // Try Service Worker mode if appropriate
  if (swFunctions && shouldAttemptServiceWorker() && isServiceWorkerReady()) {
    logger.info('Attempting Service Worker mode for preview');

    const swPreview = await createPreviewWithServiceWorker(html, swFunctions);

    if (swPreview) {
      return {
        preview: swPreview,
        mode: 'service-worker',
      };
    }

    incrementSwFailures();
    logger.warn('Service Worker mode failed, falling back to srcdoc');
  } else {
    const reason = getPreviewModeReason();
    logger.debug(`Using srcdoc mode (${reason})`);
  }

  // Fallback to srcdoc mode
  const preview = createPreviewWithSrcdoc(html, revokeOldBlobUrl);

  return {
    preview,
    mode: 'srcdoc',
  };
}
