/**
 * =============================================================================
 * BAVINI CLOUD - Entry Point Detection
 * =============================================================================
 * Logic for detecting entry points and frameworks in the workbench.
 *
 * @module lib/stores/workbench/entry-point-detection
 * =============================================================================
 */

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('EntryPointDetection');

/**
 * Detect project root directory from file paths.
 * Returns the common prefix like '/ecommerce-shop' if all files are in a subdirectory.
 *
 * @param files - Map of file paths to content
 * @returns The project root path, or null if not detected
 */
export function detectProjectRoot(files: Map<string, string>): string | null {
  if (files.size === 0) return null;

  // Get all file paths
  const paths = Array.from(files.keys());

  // Check if there's a common project directory prefix
  // Look for patterns like /project-name/src/... or /project-name/app/...
  // Extended list of common directories to detect project roots
  const knownDirs =
    'src|app|pages|components|lib|public|providers|hooks|utils|types|styles|assets|api|services|store|stores|context|config|data';
  const projectDirPattern = new RegExp(
    `^(\\/[^/]+)\\/(${knownDirs}|package\\.json|tsconfig\\.json|index\\.(tsx?|jsx?|css))`,
  );

  const projectDirs = new Set<string>();
  for (const path of paths) {
    const match = path.match(projectDirPattern);
    if (match) {
      projectDirs.add(match[1]);
    }
  }

  logger.debug(`Project root detection: found ${projectDirs.size} potential roots:`, Array.from(projectDirs));

  // If we found exactly one project directory and most files are in it, use it
  if (projectDirs.size === 1) {
    const projectDir = Array.from(projectDirs)[0];
    const filesInProject = paths.filter((p) => p.startsWith(projectDir + '/')).length;
    // At least 50% of files should be in the project directory (lowered from 70%)
    if (filesInProject >= paths.length * 0.5) {
      logger.info(`Detected project root: ${projectDir} (${filesInProject}/${paths.length} files)`);
      return projectDir;
    }
  }

  // If no project root found, check if all files have a common first-level prefix
  const firstLevelDirs = new Set<string>();
  for (const path of paths) {
    const match = path.match(/^(\/[^/]+)\//);
    if (match) {
      firstLevelDirs.add(match[1]);
    }
  }

  if (firstLevelDirs.size === 1) {
    const commonDir = Array.from(firstLevelDirs)[0];
    logger.info(`All files share common prefix: ${commonDir}`);
    return commonDir;
  }

  logger.debug('No project root detected');
  return null;
}

/**
 * Detect framework from package.json or file extensions.
 * Also checks for package.json in project subdirectories.
 *
 * @param files - Map of file paths to content
 * @returns The detected framework name
 */
export function detectFrameworkFromFiles(files: Map<string, string>): string {
  // Find package.json - check both root and project subdirectories
  let pkgJson: string | undefined;

  // First try root
  pkgJson = files.get('/package.json');

  // If not found, look for package.json in any first-level subdirectory
  if (!pkgJson) {
    for (const [path, content] of files.entries()) {
      // Match patterns like /project-name/package.json
      if (path.match(/^\/[^/]+\/package\.json$/)) {
        pkgJson = content;
        break;
      }
    }
  }

  if (pkgJson) {
    try {
      const pkg = JSON.parse(pkgJson);
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps['astro']) return 'astro';
      if (deps['vue'] || deps['@vue/compiler-sfc']) return 'vue';
      if (deps['svelte']) return 'svelte';
      if (deps['preact']) return 'preact';
      if (deps['react'] || deps['react-dom'] || deps['next']) return 'react';
    } catch {
      // Ignore JSON parse errors
    }
  }

  // Check file extensions
  for (const path of files.keys()) {
    if (path.endsWith('.astro')) return 'astro';
    if (path.endsWith('.vue')) return 'vue';
    if (path.endsWith('.svelte')) return 'svelte';
  }

  return 'react'; // Default to React
}

/**
 * Detect the entry point from available files.
 * Returns null if no suitable entry point is found.
 * Supports React, Vue, Svelte, and Astro frameworks.
 * Also supports project subdirectories (e.g., /my-project/app/page.tsx)
 *
 * @param files - Map of file paths to content
 * @returns The detected entry point path, or null if not found
 */
export function detectEntryPoint(files: Map<string, string>): string | null {
  // First, detect if there's a project root folder (e.g., /ecommerce-shop/)
  const projectRoot = detectProjectRoot(files);
  const prefix = projectRoot || '';

  // First, detect framework from package.json to prioritize correct entry points
  const framework = detectFrameworkFromFiles(files);

  logger.debug(`Detecting entry point: framework=${framework}, projectRoot=${projectRoot}`);

  // Framework-specific entry point candidates
  if (framework === 'astro') {
    const astroCandidates = [
      `${prefix}/src/pages/index.astro`,
      `${prefix}/src/pages/index.md`,
      `${prefix}/src/pages/index.mdx`,
      `${prefix}/pages/index.astro`,
      `${prefix}/index.astro`,
    ];
    for (const candidate of astroCandidates) {
      if (files.has(candidate)) {
        return candidate;
      }
    }
  }

  if (framework === 'vue') {
    const vueCandidates = [
      `${prefix}/src/main.ts`,
      `${prefix}/src/main.js`,
      `${prefix}/src/App.vue`,
      `${prefix}/App.vue`,
      `${prefix}/main.ts`,
      `${prefix}/main.js`,
    ];
    for (const candidate of vueCandidates) {
      if (files.has(candidate)) {
        return candidate;
      }
    }
  }

  if (framework === 'svelte') {
    const svelteCandidates = [
      `${prefix}/src/main.ts`,
      `${prefix}/src/main.js`,
      `${prefix}/src/App.svelte`,
      `${prefix}/App.svelte`,
      `${prefix}/main.ts`,
      `${prefix}/main.js`,
    ];
    for (const candidate of svelteCandidates) {
      if (files.has(candidate)) {
        return candidate;
      }
    }
  }

  // Next.js App Router candidates (check before default React)
  // IMPORTANT: layout.tsx must be checked BEFORE page.tsx because layout imports globals.css
  if (framework === 'react') {
    const nextAppCandidates = [
      // App Router - layout.tsx is the entry that imports CSS and wraps pages
      `${prefix}/src/app/layout.tsx`,
      `${prefix}/src/app/layout.jsx`,
      `${prefix}/app/layout.tsx`,
      `${prefix}/app/layout.jsx`,
      // Fallback to page if no layout
      `${prefix}/src/app/page.tsx`,
      `${prefix}/src/app/page.jsx`,
      `${prefix}/app/page.tsx`,
      `${prefix}/app/page.jsx`,
      `${prefix}/app/page.ts`,
      `${prefix}/app/page.js`,
      // Pages Router
      `${prefix}/pages/_app.tsx`,
      `${prefix}/pages/_app.jsx`,
      `${prefix}/pages/index.tsx`,
      `${prefix}/pages/index.jsx`,
      `${prefix}/pages/index.ts`,
      `${prefix}/pages/index.js`,
    ];
    for (const candidate of nextAppCandidates) {
      if (files.has(candidate)) {
        return candidate;
      }
    }
  }

  // Default candidates for React/Preact/Vanilla (including JSX/JS extensions)
  const defaultCandidates = [
    `${prefix}/src/main.tsx`,
    `${prefix}/src/main.jsx`,
    `${prefix}/src/main.ts`,
    `${prefix}/src/main.js`,
    `${prefix}/src/index.tsx`,
    `${prefix}/src/index.jsx`,
    `${prefix}/src/index.ts`,
    `${prefix}/src/index.js`,
    `${prefix}/src/App.tsx`,
    `${prefix}/src/App.jsx`,
    `${prefix}/src/App.ts`,
    `${prefix}/src/App.js`,
    `${prefix}/index.tsx`,
    `${prefix}/index.jsx`,
    `${prefix}/index.ts`,
    `${prefix}/index.js`,
    `${prefix}/main.tsx`,
    `${prefix}/main.jsx`,
    `${prefix}/main.ts`,
    `${prefix}/main.js`,
  ];

  for (const candidate of defaultCandidates) {
    if (files.has(candidate)) {
      return candidate;
    }
  }

  // Also check without prefix for backwards compatibility
  if (prefix) {
    const rootCandidates = [
      '/src/main.tsx',
      '/src/main.jsx',
      '/src/main.ts',
      '/src/main.js',
      '/src/index.tsx',
      '/src/index.jsx',
      '/src/index.ts',
      '/src/index.js',
      '/app/layout.tsx',
      '/app/layout.jsx',
      '/app/page.tsx',
      '/app/page.jsx',
    ];
    for (const candidate of rootCandidates) {
      if (files.has(candidate)) {
        return candidate;
      }
    }
  }

  // Return first TSX/JSX/TS/JS file found in /src or /{project}/src directory
  for (const path of files.keys()) {
    if (
      (path.includes('/src/') || path.match(/^\/[^/]+\/src\//)) &&
      !path.includes('/data/') &&
      !path.includes('/utils/') &&
      !path.includes('/lib/') &&
      (path.endsWith('.tsx') || path.endsWith('.jsx') || path.endsWith('.ts') || path.endsWith('.js'))
    ) {
      return path;
    }
  }

  // Fallback: Return first TSX/TS file found in /app or /{project}/app directory (Next.js App Router)
  for (const path of files.keys()) {
    if (
      path.includes('/app/') &&
      !path.includes('/api/') &&
      (path.endsWith('.tsx') || path.endsWith('.ts') || path.endsWith('.jsx') || path.endsWith('.js'))
    ) {
      return path;
    }
  }

  // Fallback: Return first TSX/TS file found in /pages or /{project}/pages directory (Next.js Pages Router)
  for (const path of files.keys()) {
    if (
      path.includes('/pages/') &&
      !path.includes('/api/') &&
      (path.endsWith('.tsx') || path.endsWith('.ts') || path.endsWith('.jsx') || path.endsWith('.js'))
    ) {
      return path;
    }
  }

  // For Astro: find any .astro page file
  for (const path of files.keys()) {
    if (path.includes('/pages/') && path.endsWith('.astro')) {
      return path;
    }
  }

  // VANILLA HTML/JS SUPPORT:
  // For projects with just index.html, style.css, script.js (no framework)
  // Check if we have an index.html file - this is valid for vanilla projects
  const htmlCandidates = [`${prefix}/index.html`, '/index.html', `${prefix}/public/index.html`, '/public/index.html'];

  for (const candidate of htmlCandidates) {
    if (files.has(candidate)) {
      // Verify it's truly a vanilla project (no framework JS files)
      const hasFrameworkEntry = Array.from(files.keys()).some(
        (path) =>
          path.endsWith('.tsx') ||
          path.endsWith('.jsx') ||
          (path.endsWith('.ts') && !path.endsWith('.d.ts')) ||
          path.endsWith('.vue') ||
          path.endsWith('.svelte') ||
          path.endsWith('.astro'),
      );

      // Only use index.html as entry if no framework files exist
      if (!hasFrameworkEntry) {
        logger.info(`Detected vanilla HTML project, using ${candidate} as entry point`);
        return candidate;
      }
    }
  }

  // No suitable entry point found
  return null;
}
