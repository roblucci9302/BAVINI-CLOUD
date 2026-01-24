/**
 * =============================================================================
 * BAVINI CLOUD - Workbench Store
 * =============================================================================
 * Main store for the workbench UI. Supports both WebContainer and Browser modes.
 * =============================================================================
 */

import { atom, map, type MapStore, type ReadableAtom, type WritableAtom } from 'nanostores';
import type { EditorDocument, ScrollPosition } from '~/components/editor/codemirror/types';
import type { ActionCallbackData, ArtifactCallbackData } from '~/lib/runtime/message-parser';
import { runtimeTypeStore, type RuntimeType } from '~/lib/runtime';
import type { ITerminal } from '~/types/terminal';
import { unreachable } from '~/utils/unreachable';
import { createScopedLogger } from '~/utils/logger';
import { EditorStore } from './editor';
import { PreviewsStore, type BrowserPreviewInfo, clearPreviewError } from './previews';
import { browserFilesStore, type FileMap } from './browser-files';
import { chatId } from '~/lib/persistence/useChatHistory';

const logger = createScopedLogger('Workbench');

/**
 * Yield to the event loop to allow the browser to process pending events.
 * This prevents UI freeze during heavy operations like builds.
 *
 * Uses scheduler.postTask if available (Chrome 94+), otherwise falls back to
 * requestIdleCallback or setTimeout.
 */
async function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    // Use scheduler.postTask with background priority if available (best for not blocking UI)
    if (typeof globalThis !== 'undefined' && 'scheduler' in globalThis) {
      const scheduler = (globalThis as { scheduler?: { postTask?: (cb: () => void, opts: { priority: string }) => void } }).scheduler;

      if (scheduler?.postTask) {
        scheduler.postTask(() => resolve(), { priority: 'background' });
        return;
      }
    }

    // Fallback to requestIdleCallback if available
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(() => resolve(), { timeout: 50 });
      return;
    }

    // Final fallback to setTimeout
    setTimeout(resolve, 0);
  });
}

// Lazy imports to avoid circular dependencies and conditional loading
async function getBrowserActionRunner() {
  const { BrowserActionRunner } = await import('~/lib/runtime/browser-action-runner');
  return new BrowserActionRunner();
}

async function getBrowserBuildService() {
  const { browserBuildService } = await import('~/lib/runtime/browser-build-service');
  return browserBuildService;
}

async function getLatestCheckpointFiles(currentChatId: string): Promise<Map<string, string> | null> {
  try {
    const { getPGlite } = await import('~/lib/persistence/pglite');
    const { getCheckpointsByChat } = await import('~/lib/persistence/checkpoints-db');

    const db = await getPGlite();

    if (!db) {
      logger.warn('PGlite not available for checkpoint loading');
      return null;
    }

    const checkpoints = await getCheckpointsByChat(db, currentChatId, 1);

    if (checkpoints.length === 0) {
      logger.debug(`No checkpoints found for chat ${currentChatId}`);
      return null;
    }

    const latestCheckpoint = checkpoints[0];
    logger.info(`Found checkpoint: ${latestCheckpoint.id} with ${Object.keys(latestCheckpoint.filesSnapshot).length} files`);

    // Convert filesSnapshot to Map format for browserFilesStore
    const filesMap = new Map<string, string>();

    for (const [path, entry] of Object.entries(latestCheckpoint.filesSnapshot)) {
      if (entry && typeof entry === 'object' && 'content' in entry && (entry as { type?: string }).type === 'file') {
        filesMap.set(path, (entry as { content: string }).content);
      }
    }

    return filesMap.size > 0 ? filesMap : null;
  } catch (error) {
    logger.warn('Failed to load checkpoint files:', error);
    return null;
  }
}

/**
 * Helper function to load files from checkpoint (outside class to avoid private method issues)
 */
async function loadFilesFromCheckpointHelper(currentChatId: string): Promise<void> {
  logger.info(`No files in browserFilesStore, checking for checkpoint for chat ${currentChatId}`);
  const checkpointFiles = await getLatestCheckpointFiles(currentChatId);

  if (checkpointFiles && checkpointFiles.size > 0) {
    logger.info(`Restoring ${checkpointFiles.size} files from checkpoint`);

    // Write files to browserFilesStore
    for (const [path, content] of checkpointFiles) {
      await browserFilesStore.writeFile(path, content);
    }
  } else {
    logger.debug(`No checkpoint files found for chat ${currentChatId}`);
  }
}

// Union type for action runners (browser-only in BAVINI)
type ActionRunnerType = Awaited<ReturnType<typeof getBrowserActionRunner>>;

export interface ArtifactState {
  id: string;
  title: string;
  closed: boolean;
  runner: ActionRunnerType;
}

export type ArtifactUpdateState = Pick<ArtifactState, 'title' | 'closed'>;

type Artifacts = MapStore<Record<string, ArtifactState>>;

export type WorkbenchViewType = 'code' | 'preview';

export class WorkbenchStore {
  // Stores - initialized lazily (browser mode only in BAVINI)
  #previewsStore: PreviewsStore | null = null;
  #editorStore: EditorStore | null = null;

  #initialized = false;
  #browserBuildInitialized = false;
  #runtimeType: RuntimeType = 'browser';

  // Track pending artifact creations (to allow addAction/runAction to wait)
  #pendingArtifacts = new Map<string, Promise<void>>();

  // Debounce timer for build triggers (to wait for all files to be written)
  #buildDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  #buildDebounceMs = 500; // OPTIMIZED: Reduced from 1000ms to 500ms for faster feedback

  /**
   * Track pending files that changed during debounce period.
   * Helps with debugging and potential incremental builds in the future.
   */
  #pendingFiles = new Set<string>();

  /**
   * Track all subscription cleanup functions to prevent memory leaks.
   * These are called when the mode changes or on cleanup.
   */
  #cleanupFunctions: Array<() => void> = [];

  // Stable atoms that are always available (prevents hook ordering issues)
  #previewsAtom = import.meta.hot?.data.previewsAtom ?? atom<Array<{ port: number; ready: boolean; baseUrl: string }>>([]);
  #showTerminalAtom = import.meta.hot?.data.showTerminalAtom ?? atom(false);
  #selectedFileAtom: WritableAtom<string | undefined> = import.meta.hot?.data.selectedFileAtom ?? atom<string | undefined>(undefined);
  #currentDocumentAtom: WritableAtom<EditorDocument | undefined> = import.meta.hot?.data.currentDocumentAtom ?? atom<EditorDocument | undefined>(undefined);
  #filesAtom: MapStore<FileMap> = import.meta.hot?.data.filesAtom ?? map<FileMap>({});

  artifacts: Artifacts = import.meta.hot?.data.artifacts ?? map({});

  showWorkbench: WritableAtom<boolean> = import.meta.hot?.data.showWorkbench ?? atom(false);
  currentView: WritableAtom<WorkbenchViewType> = import.meta.hot?.data.currentView ?? atom('code');
  unsavedFiles: WritableAtom<Set<string>> = import.meta.hot?.data.unsavedFiles ?? atom(new Set<string>());
  modifiedFiles = new Set<string>();
  artifactIdList: string[] = [];

  constructor() {
    if (import.meta.hot) {
      import.meta.hot.data.artifacts = this.artifacts;
      import.meta.hot.data.unsavedFiles = this.unsavedFiles;
      import.meta.hot.data.showWorkbench = this.showWorkbench;
      import.meta.hot.data.currentView = this.currentView;
      import.meta.hot.data.previewsAtom = this.#previewsAtom;
      import.meta.hot.data.showTerminalAtom = this.#showTerminalAtom;
      import.meta.hot.data.selectedFileAtom = this.#selectedFileAtom;
      import.meta.hot.data.currentDocumentAtom = this.#currentDocumentAtom;
      import.meta.hot.data.filesAtom = this.#filesAtom;
    }

    // Get initial runtime type
    this.#runtimeType = runtimeTypeStore.get();

    // Subscribe to showWorkbench changes to trigger lazy init
    this.showWorkbench.subscribe((show) => {
      if (show && !this.#initialized) {
        this.#initRuntime();
      }
    });

    // Subscribe to runtime type changes
    runtimeTypeStore.subscribe((type) => {
      logger.info(`Runtime type changed to: ${type}`);
      this.#runtimeType = type;

      if (type === 'browser' && this.showWorkbench.get()) {
        this.#initBrowserMode();
      }
    });
  }

  /**
   * Initialize runtime and related stores (browser mode only in BAVINI).
   */
  async #initRuntime(): Promise<void> {
    if (this.#initialized) {
      return;
    }

    this.#initialized = true;

    logger.info(`Initializing workbench with runtime type: ${this.#runtimeType}`);

    // BAVINI uses browser mode only
    await this.#initBrowserMode();
  }

  /**
   * Cleanup all subscriptions to prevent memory leaks.
   * Called when switching modes or on component unmount.
   */
  #cleanupSubscriptions(): void {
    for (const cleanup of this.#cleanupFunctions) {
      try {
        cleanup();
      } catch (error) {
        logger.warn('Error during subscription cleanup:', error);
      }
    }
    this.#cleanupFunctions = [];
    logger.debug(`Cleaned up ${this.#cleanupFunctions.length} subscriptions`);
  }

  /**
   * Initialize browser mode (esbuild-wasm based).
   */
  async #initBrowserMode(): Promise<void> {
    if (this.#browserBuildInitialized) {
      return;
    }

    this.#browserBuildInitialized = true;
    logger.info('Initializing Browser Mode...');

    // Initialize editor store with browser files store
    this.#editorStore = new EditorStore(browserFilesStore as any);

    // Initialize previews store (without WebContainer)
    this.#previewsStore = new PreviewsStore(Promise.resolve(null as any));
    this.#previewsStore.setMode('browser');

    // Connect browser files store to build service
    // Note: We don't trigger builds on every file change to avoid intermediate errors
    // Builds are triggered when:
    // 1. Artifact closes (all files written)
    // 2. User saves a file manually (via saveFile)
    const filesChangeCleanup = browserFilesStore.onFilesChange(async (files) => {
      logger.debug(`Files changed, ${files.size} files total`);
      // Build will be triggered by artifact close or manual save, not here
    });
    if (filesChangeCleanup) {
      this.#cleanupFunctions.push(filesChangeCleanup);
    }

    // Subscribe to files changes to update editor and stable atom
    const filesSubscription = browserFilesStore.files.subscribe((files) => {
      // Sync to stable files atom
      this.#filesAtom.set(files);

      if (this.#editorStore) {
        this.#editorStore.setDocuments(files);

        // Update current document atom if selected file exists
        const selectedFile = this.#selectedFileAtom.get();

        if (selectedFile) {
          const documents = this.#editorStore.documents.get();
          this.#currentDocumentAtom.set(documents[selectedFile]);
        }
      }
    });
    this.#cleanupFunctions.push(filesSubscription);

    // Sync editor store's selectedFile with stable atom
    if (this.#editorStore) {
      const selectedFileCleanup = this.#editorStore.selectedFile.subscribe((filePath) => {
        this.#selectedFileAtom.set(filePath);
      });
      this.#cleanupFunctions.push(selectedFileCleanup);

      const currentDocCleanup = this.#editorStore.currentDocument.subscribe((doc) => {
        this.#currentDocumentAtom.set(doc);
      });
      this.#cleanupFunctions.push(currentDocCleanup);
    }

    // Initialize browser build service
    try {
      const service = await getBrowserBuildService();
      await service.init();
      logger.info('BrowserBuildService ready');

      // Trigger initial build if files already exist (e.g., from persistence or HMR)
      let existingFiles = browserFilesStore.getAllFiles();

      // If no files in browserFilesStore, try to load from the latest checkpoint
      if (existingFiles.size === 0) {
        const currentChatId = chatId.get();

        if (currentChatId) {
          await loadFilesFromCheckpointHelper(currentChatId);
          existingFiles = browserFilesStore.getAllFiles();
        } else {
          logger.info('No chatId yet, will load from checkpoint when available');

          // Subscribe to chatId changes to load checkpoint when it becomes available
          // FIX: Track subscription for cleanup and ensure unsubscribe is always called
          const store = this;
          let hasLoaded = false;

          const chatIdUnsubscribe = chatId.subscribe(async (newChatId) => {
            // Prevent multiple loads
            if (hasLoaded) {
              return;
            }

            if (newChatId && browserFilesStore.getAllFiles().size === 0) {
              hasLoaded = true;
              logger.info(`ChatId set to ${newChatId}, loading files from checkpoint`);
              await loadFilesFromCheckpointHelper(newChatId);

              const loadedFiles = browserFilesStore.getAllFiles();

              if (loadedFiles.size > 0) {
                await store.triggerBrowserBuildPublic();
              }
            }
          });

          // Track this subscription for cleanup
          // This ensures it's cleaned up even if the condition is never met
          this.#cleanupFunctions.push(chatIdUnsubscribe);
        }
      }

      if (existingFiles.size > 0) {
        logger.info(`Found ${existingFiles.size} existing files, triggering initial build`);
        await this.#executeBrowserBuild(); // Use direct execution for initial build (no debounce)
      } else {
        logger.info('No files to build yet, waiting for AI to generate code or checkpoint load');
      }
    } catch (error) {
      logger.error('Failed to initialize BrowserBuildService:', error);
    }
  }

  /**
   * Public wrapper to trigger browser build immediately (bypasses debounce).
   * Used for initial loads from checkpoints where we want to build immediately.
   */
  async triggerBrowserBuildPublic(): Promise<void> {
    // Clear any pending debounce timer
    if (this.#buildDebounceTimer) {
      clearTimeout(this.#buildDebounceTimer);
      this.#buildDebounceTimer = null;
    }

    await this.#executeBrowserBuild();
  }

  /**
   * Trigger a browser build with debouncing.
   * This waits for file writes to settle before building to avoid
   * building when files are still being written (e.g., main.tsx exists but App.tsx doesn't).
   *
   * OPTIMIZED: Now tracks changed files for better debugging and potential incremental builds.
   *
   * @param changedFile - Optional path of the file that triggered the build
   */
  async #triggerBrowserBuild(changedFile?: string): Promise<void> {
    if (this.#runtimeType !== 'browser') {
      return;
    }

    // Track the changed file if provided
    if (changedFile) {
      this.#pendingFiles.add(changedFile);
    }

    // Clear any existing debounce timer
    if (this.#buildDebounceTimer) {
      clearTimeout(this.#buildDebounceTimer);
      this.#buildDebounceTimer = null;
    }

    // Set a new debounce timer
    this.#buildDebounceTimer = setTimeout(() => {
      // Log pending files for debugging
      if (this.#pendingFiles.size > 0) {
        logger.info(`Building with ${this.#pendingFiles.size} changed file(s):`, Array.from(this.#pendingFiles));
      }

      // Clear pending files before build
      this.#pendingFiles.clear();

      this.#executeBrowserBuild();
    }, this.#buildDebounceMs);
  }

  /**
   * Execute the actual browser build (called after debounce).
   * Uses yieldToEventLoop() to prevent UI freeze during build.
   */
  async #executeBrowserBuild(): Promise<void> {
    try {
      // Yield to event loop BEFORE starting build to allow pending input events to be processed
      // This prevents the "frozen input" issue where typing gets blocked during builds
      await yieldToEventLoop();

      const service = await getBrowserBuildService();

      if (!service.isReady()) {
        logger.warn('BrowserBuildService not ready yet');
        return;
      }

      const files = browserFilesStore.getAllFiles();

      if (files.size === 0) {
        logger.debug('No files to build');
        return;
      }

      // Detect entry point - only build if we have one
      const entryPoint = this.#detectEntryPoint(files);

      if (!entryPoint) {
        logger.warn('No entry point found. Files:', Array.from(files.keys()));
        return;
      }

      logger.info(`Triggering browser build with ${files.size} files, entry: ${entryPoint}`);

      // Debug: log all files being built (INFO level to ensure visibility)
      for (const [path, content] of files) {
        if (path.endsWith('.tsx') || path.endsWith('.jsx')) {
          const preview = content.length > 500 ? content.substring(0, 500) + '...' : content;
          logger.info(`\u{1F4C4} ${path} (${content.length} chars):\n${preview}`);
        }
      }

      // Yield again before the actual heavy build operation
      await yieldToEventLoop();

      const result = await service.syncAndBuild(files, entryPoint);

      if (result && result.errors.length === 0) {
        logger.info(`Browser build successful in ${Math.round(result.buildTime)}ms`);
        // Clear any previous error on successful build
        clearPreviewError();
      } else if (result && result.errors.length > 0) {
        // Log errors but don't treat as fatal - build can be retried
        logger.warn('Browser build had errors:', result.errors);
      }
    } catch (error) {
      logger.error('Build trigger failed:', error);
    }
  }

  /**
   * Detect the entry point from available files.
   * Returns null if no suitable entry point is found.
   * Supports React, Vue, Svelte, and Astro frameworks.
   * Also supports project subdirectories (e.g., /my-project/app/page.tsx)
   */
  #detectEntryPoint(files: Map<string, string>): string | null {
    // First, detect if there's a project root folder (e.g., /ecommerce-shop/)
    const projectRoot = this.#detectProjectRoot(files);
    const prefix = projectRoot || '';

    // First, detect framework from package.json to prioritize correct entry points
    const framework = this.#detectFrameworkFromFiles(files);

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
      if ((path.includes('/src/') || path.match(/^\/[^/]+\/src\//)) &&
          !path.includes('/data/') &&
          !path.includes('/utils/') &&
          !path.includes('/lib/') &&
          (path.endsWith('.tsx') || path.endsWith('.jsx') || path.endsWith('.ts') || path.endsWith('.js'))) {
        return path;
      }
    }

    // Fallback: Return first TSX/TS file found in /app or /{project}/app directory (Next.js App Router)
    for (const path of files.keys()) {
      if ((path.includes('/app/')) &&
          !path.includes('/api/') &&
          (path.endsWith('.tsx') || path.endsWith('.ts') || path.endsWith('.jsx') || path.endsWith('.js'))) {
        return path;
      }
    }

    // Fallback: Return first TSX/TS file found in /pages or /{project}/pages directory (Next.js Pages Router)
    for (const path of files.keys()) {
      if ((path.includes('/pages/')) &&
          !path.includes('/api/') &&
          (path.endsWith('.tsx') || path.endsWith('.ts') || path.endsWith('.jsx') || path.endsWith('.js'))) {
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
    const htmlCandidates = [
      `${prefix}/index.html`,
      '/index.html',
      `${prefix}/public/index.html`,
      '/public/index.html',
    ];

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
            path.endsWith('.astro')
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

  /**
   * Detect project root directory from file paths.
   * Returns the common prefix like '/ecommerce-shop' if all files are in a subdirectory.
   */
  #detectProjectRoot(files: Map<string, string>): string | null {
    if (files.size === 0) return null;

    // Get all file paths
    const paths = Array.from(files.keys());

    // Check if there's a common project directory prefix
    // Look for patterns like /project-name/src/... or /project-name/app/...
    // Extended list of common directories to detect project roots
    const knownDirs = 'src|app|pages|components|lib|public|providers|hooks|utils|types|styles|assets|api|services|store|stores|context|config|data';
    const projectDirPattern = new RegExp(`^(\\/[^/]+)\\/(${knownDirs}|package\\.json|tsconfig\\.json|index\\.(tsx?|jsx?|css))`);

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
      const filesInProject = paths.filter(p => p.startsWith(projectDir + '/')).length;
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
   */
  #detectFrameworkFromFiles(files: Map<string, string>): string {
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
      } catch (e) {
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

  get previews() {
    return this.#previewsAtom;
  }

  /**
   * Set a browser-mode preview (for esbuild-wasm builds)
   */
  setBrowserPreview(info: BrowserPreviewInfo): void {
    logger.info(`Setting browser preview: ${info.url}${info.srcdoc ? ' (srcdoc mode)' : ''}`);

    // Update the stable previews atom directly
    const previewInfo = {
      port: 0, // Use port 0 as marker for browser preview
      ready: info.ready,
      baseUrl: info.url,
      srcdoc: info.srcdoc, // Pass srcdoc for iframe content (avoids blob URL origin issues)
    };

    const currentPreviews = this.#previewsAtom.get();
    const existingIndex = currentPreviews.findIndex((p) => p.port === 0);

    if (existingIndex >= 0) {
      const newPreviews = [...currentPreviews];
      newPreviews[existingIndex] = previewInfo;
      this.#previewsAtom.set(newPreviews);
    } else {
      this.#previewsAtom.set([...currentPreviews, previewInfo]);
    }

    // Also update the store if available
    this.#previewsStore?.setBrowserPreview(info);
  }

  /**
   * Clear browser-mode preview
   */
  clearBrowserPreview(): void {
    // Update the stable atom
    const currentPreviews = this.#previewsAtom.get();
    this.#previewsAtom.set(currentPreviews.filter((p) => p.port !== 0));

    // Also update the store if available
    this.#previewsStore?.clearBrowserPreview();
  }

  /**
   * Set preview mode
   */
  setPreviewMode(mode: 'webcontainer' | 'browser'): void {
    this.#previewsStore?.setMode(mode);
  }

  get files() {
    return this.#filesAtom;
  }

  get currentDocument(): ReadableAtom<EditorDocument | undefined> {
    return this.#currentDocumentAtom;
  }

  get selectedFile(): ReadableAtom<string | undefined> {
    return this.#selectedFileAtom;
  }

  get firstArtifact(): ArtifactState | undefined {
    return this.#getArtifact(this.artifactIdList[0]);
  }

  get filesCount(): number {
    return browserFilesStore.filesCount;
  }

  get showTerminal() {
    return this.#showTerminalAtom;
  }

  toggleTerminal(_value?: boolean) {
    // Terminal not available in BAVINI browser mode
    logger.debug('Terminal not available in browser mode');
  }

  attachTerminal(_terminal: ITerminal) {
    // Terminal not available in BAVINI browser mode
    logger.debug('Terminal not available in browser mode');
  }

  onTerminalResize(_cols: number, _rows: number) {
    // Terminal not available in BAVINI browser mode
  }

  setDocuments(files: FileMap) {
    this.#editorStore?.setDocuments(files);

    const filesCount = this.filesCount;
    if (filesCount > 0 && this.currentDocument.get() === undefined) {
      for (const [filePath, dirent] of Object.entries(files)) {
        if (dirent?.type === 'file') {
          this.setSelectedFile(filePath);
          break;
        }
      }
    }
  }

  setShowWorkbench(show: boolean) {
    this.showWorkbench.set(show);
  }

  setCurrentDocumentContent(newContent: string) {
    const filePath = this.currentDocument.get()?.filePath;

    if (!filePath) {
      return;
    }

    const originalContent = browserFilesStore.getFile(filePath)?.content;
    const unsavedChanges = originalContent !== undefined && originalContent !== newContent;

    this.#editorStore?.updateFile(filePath, newContent);

    const currentDocument = this.currentDocument.get();

    if (currentDocument) {
      const previousUnsavedFiles = this.unsavedFiles.get();

      if (unsavedChanges && previousUnsavedFiles.has(currentDocument.filePath)) {
        return;
      }

      const newUnsavedFiles = new Set(previousUnsavedFiles);

      if (unsavedChanges) {
        newUnsavedFiles.add(currentDocument.filePath);
      } else {
        newUnsavedFiles.delete(currentDocument.filePath);
      }

      this.unsavedFiles.set(newUnsavedFiles);
    }
  }

  setCurrentDocumentScrollPosition(position: ScrollPosition) {
    const editorDocument = this.currentDocument.get();

    if (!editorDocument) {
      return;
    }

    this.#editorStore?.updateScrollPosition(editorDocument.filePath, position);
  }

  setSelectedFile(filePath: string | undefined) {
    this.#selectedFileAtom.set(filePath);
    this.#editorStore?.setSelectedFile(filePath);

    // Update current document atom when selection changes
    if (filePath && this.#editorStore) {
      const documents = this.#editorStore.documents.get();
      this.#currentDocumentAtom.set(documents[filePath]);
    } else {
      this.#currentDocumentAtom.set(undefined);
    }
  }

  async saveFile(filePath: string) {
    const documents = this.#editorStore?.documents.get();
    const document = documents?.[filePath];

    if (document === undefined) {
      return;
    }

    await browserFilesStore.saveFile(filePath, document.value);
    // Trigger a debounced build after manual file save
    this.#triggerBrowserBuild();

    const newUnsavedFiles = new Set(this.unsavedFiles.get());
    newUnsavedFiles.delete(filePath);
    this.unsavedFiles.set(newUnsavedFiles);
  }

  async saveCurrentDocument() {
    const currentDocument = this.currentDocument.get();

    if (currentDocument === undefined) {
      return;
    }

    await this.saveFile(currentDocument.filePath);
  }

  resetCurrentDocument() {
    const currentDocument = this.currentDocument.get();

    if (currentDocument === undefined) {
      return;
    }

    const { filePath } = currentDocument;
    const file = browserFilesStore.getFile(filePath);

    if (!file) {
      return;
    }

    this.setCurrentDocumentContent(file.content);
  }

  async saveAllFiles() {
    for (const filePath of this.unsavedFiles.get()) {
      await this.saveFile(filePath);
    }
  }

  getFileModifications() {
    return browserFilesStore.getFileModifications();
  }

  resetAllFileModifications() {
    browserFilesStore.resetFileModifications();
  }

  getOriginalContent(filePath: string): string | undefined {
    return browserFilesStore.getOriginalContent(filePath);
  }

  isFileModified(filePath: string): boolean {
    return browserFilesStore.isFileModified(filePath);
  }

  async restoreFromSnapshot(snapshot: FileMap): Promise<{ filesWritten: number; filesDeleted: number }> {
    // BAVINI uses browser mode only
    const files = new Map<string, string>();
    for (const [path, entry] of Object.entries(snapshot)) {
      if (entry?.type === 'file') {
        files.set(path, entry.content);
      }
    }
    await browserFilesStore.writeFiles(files);
    this.setDocuments(snapshot);
    this.unsavedFiles.set(new Set<string>());
    return { filesWritten: files.size, filesDeleted: 0 };
  }

  abortAllActions() {
    const artifacts = this.artifacts.get();

    for (const [, artifact] of Object.entries(artifacts)) {
      const actions = artifact.runner.actions.get();

      for (const [, action] of Object.entries(actions)) {
        if (action.status === 'running' || action.status === 'pending') {
          action.abort();
        }
      }
    }
  }

  async addArtifact({ messageId, title, id }: ArtifactCallbackData) {
    const artifact = this.#getArtifact(messageId);

    if (artifact) {
      return;
    }

    // Check if already being created
    if (this.#pendingArtifacts.has(messageId)) {
      return;
    }

    if (!this.artifactIdList.includes(messageId)) {
      this.artifactIdList.push(messageId);
    }

    // Create the artifact asynchronously and track the promise
    const createPromise = (async () => {
      // Create appropriate action runner based on mode
      // BAVINI uses browser action runner only
      const runner = await getBrowserActionRunner();
      // Set build trigger for browser action runner
      (runner as any).setBuildTrigger(() => this.#triggerBrowserBuild());

      this.artifacts.setKey(messageId, {
        id,
        title,
        closed: false,
        runner,
      });
    })();

    this.#pendingArtifacts.set(messageId, createPromise);

    try {
      await createPromise;
    } finally {
      this.#pendingArtifacts.delete(messageId);
    }
  }

  updateArtifact({ messageId }: ArtifactCallbackData, state: Partial<ArtifactUpdateState>) {
    const artifact = this.#getArtifact(messageId);

    if (!artifact) {
      return;
    }

    this.artifacts.setKey(messageId, { ...artifact, ...state });

    // Trigger a build when artifact is closed (all files have been written)
    if (state.closed) {
      const files = browserFilesStore.getAllFiles();
      logger.info(`Artifact closed with ${files.size} files:`, Array.from(files.keys()));
      logger.info('Triggering final build');
      this.triggerBrowserBuildPublic();
    }
  }

  async addAction(data: ActionCallbackData) {
    const { messageId } = data;

    // Wait for pending artifact creation if needed
    const pendingPromise = this.#pendingArtifacts.get(messageId);

    if (pendingPromise) {
      await pendingPromise;
    }

    const artifact = this.#getArtifact(messageId);

    if (!artifact) {
      logger.warn(`Artifact not found for message ${messageId}, skipping action`);
      return;
    }

    artifact.runner.addAction(data);
  }

  async runAction(data: ActionCallbackData) {
    const { messageId } = data;

    // Wait for pending artifact creation if needed
    const pendingPromise = this.#pendingArtifacts.get(messageId);

    if (pendingPromise) {
      await pendingPromise;
    }

    const artifact = this.#getArtifact(messageId);

    if (!artifact) {
      logger.warn(`Artifact not found for message ${messageId}, skipping action`);
      return;
    }

    artifact.runner.runAction(data);
  }

  #getArtifact(id: string) {
    const artifacts = this.artifacts.get();
    return artifacts[id];
  }
}

export const workbenchStore = new WorkbenchStore();
