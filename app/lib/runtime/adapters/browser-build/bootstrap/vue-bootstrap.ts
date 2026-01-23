/**
 * =============================================================================
 * BAVINI CLOUD - Vue Bootstrap
 * =============================================================================
 * Bootstrap code generator for Vue.js applications.
 * =============================================================================
 */

import type { BootstrapContext } from './types';

/**
 * Generate Vue bootstrap entry code
 *
 * @param entryPath - Entry file path
 * @param context - Bootstrap context
 * @returns Bootstrap JavaScript code
 */
export function createVueBootstrapEntry(
  entryPath: string,
  context: BootstrapContext
): string {
  const { files, findFile, logger } = context;
  const entryContent = files.get(entryPath) || '';

  // Check if this is already a mounting entry file
  if (entryContent.includes('createApp') && entryContent.includes('.mount(')) {
    logger.debug(`Entry ${entryPath} is a Vue mounting file, importing for side effects`);
    return `import '${entryPath.replace(/\.(ts|js|vue)$/, '')}';`;
  }

  // Find main App.vue if entry is not a .vue file
  let appPath = entryPath;
  if (!entryPath.endsWith('.vue')) {
    const appVue = findFile('/src/App.vue') || findFile('/App.vue');
    if (appVue) {
      appPath = appVue;
    }
  }

  return `
import { createApp } from 'vue';
import App from '${appPath.replace(/\.vue$/, '')}';

// Mount the Vue app
const container = document.getElementById('root') || document.getElementById('app');
if (container) {
  const app = createApp(App);
  app.mount(container);
} else {
  console.error('Root element not found');
}
`;
}
