/**
 * =============================================================================
 * BAVINI CLOUD - Svelte Bootstrap
 * =============================================================================
 * Bootstrap code generator for Svelte applications.
 * =============================================================================
 */

import type { BootstrapContext } from './types';

/**
 * Generate Svelte bootstrap entry code
 *
 * @param entryPath - Entry file path
 * @param context - Bootstrap context
 * @returns Bootstrap JavaScript code
 */
export function createSvelteBootstrapEntry(
  entryPath: string,
  context: BootstrapContext
): string {
  const { files, findFile, logger } = context;
  const entryContent = files.get(entryPath) || '';

  // Check if this is already a mounting entry file
  if (entryContent.includes('new ') && entryContent.includes('target:')) {
    logger.debug(`Entry ${entryPath} is a Svelte mounting file, importing for side effects`);
    return `import '${entryPath.replace(/\.(ts|js|svelte)$/, '')}';`;
  }

  // Find main App.svelte if entry is not a .svelte file
  let appPath = entryPath;
  if (!entryPath.endsWith('.svelte')) {
    const appSvelte = findFile('/src/App.svelte') || findFile('/App.svelte');
    if (appSvelte) {
      appPath = appSvelte;
    }
  }

  return `
import App from '${appPath.replace(/\.svelte$/, '')}';

// Mount the Svelte app
const container = document.getElementById('root') || document.getElementById('app');
if (container) {
  const app = new App({
    target: container,
    props: {}
  });
} else {
  console.error('Root element not found');
}
`;
}
