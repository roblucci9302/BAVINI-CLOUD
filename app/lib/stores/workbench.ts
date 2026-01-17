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
import { PreviewsStore, type BrowserPreviewInfo } from './previews';
import { browserFilesStore, type FileMap } from './browser-files';
import { chatId } from '~/lib/persistence/useChatHistory';

const logger = createScopedLogger('Workbench');

// Lazy imports to avoid circular dependencies and conditional loading
async function getWebContainerModule() {
  const { webcontainer } = await import('~/lib/webcontainer');
  return webcontainer;
}

async function getWebContainerFilesStore() {
  const { FilesStore } = await import('./files');
  const webcontainer = await getWebContainerModule();
  return new FilesStore(webcontainer);
}

async function getWebContainerActionRunner() {
  const { ActionRunner } = await import('~/lib/runtime/action-runner');
  const webcontainer = await getWebContainerModule();
  return new ActionRunner(webcontainer);
}

async function getBrowserActionRunner() {
  const { BrowserActionRunner } = await import('~/lib/runtime/browser-action-runner');
  return new BrowserActionRunner();
}

async function getTerminalStore() {
  const { TerminalStore } = await import('./terminal');
  const webcontainer = await getWebContainerModule();
  return new TerminalStore(webcontainer);
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

// Union type for action runners
type ActionRunnerType = Awaited<ReturnType<typeof getWebContainerActionRunner>> | Awaited<ReturnType<typeof getBrowserActionRunner>>;

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
  // Stores - initialized lazily based on runtime mode
  #previewsStore: PreviewsStore | null = null;
  #webContainerFilesStore: Awaited<ReturnType<typeof getWebContainerFilesStore>> | null = null;
  #terminalStore: Awaited<ReturnType<typeof getTerminalStore>> | null = null;
  #editorStore: EditorStore | null = null;

  #initialized = false;
  #browserBuildInitialized = false;
  #runtimeType: RuntimeType = 'browser';

  // Track pending artifact creations (to allow addAction/runAction to wait)
  #pendingArtifacts = new Map<string, Promise<void>>();

  // Debounce timer for build triggers (to wait for all files to be written)
  #buildDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  #buildDebounceMs = 1000; // Wait 1000ms after last file change before building

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
   * Initialize runtime and related stores based on mode.
   */
  async #initRuntime(): Promise<void> {
    if (this.#initialized) {
      return;
    }

    this.#initialized = true;

    logger.info(`Initializing workbench with runtime type: ${this.#runtimeType}`);

    if (this.#runtimeType === 'browser') {
      await this.#initBrowserMode();
    } else {
      await this.#initWebContainerMode();
    }
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
    browserFilesStore.onFilesChange(async (files) => {
      logger.debug(`Files changed, ${files.size} files total`);
      await this.#triggerBrowserBuild();
    });

    // Subscribe to files changes to update editor and stable atom
    browserFilesStore.files.subscribe((files) => {
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

    // Sync editor store's selectedFile with stable atom
    if (this.#editorStore) {
      this.#editorStore.selectedFile.subscribe((filePath) => {
        this.#selectedFileAtom.set(filePath);
      });

      this.#editorStore.currentDocument.subscribe((doc) => {
        this.#currentDocumentAtom.set(doc);
      });
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
          // Use arrow function to capture workbenchStore reference
          const store = this;
          const unsubscribe = chatId.subscribe(async (newChatId) => {
            if (newChatId && browserFilesStore.getAllFiles().size === 0) {
              logger.info(`ChatId set to ${newChatId}, loading files from checkpoint`);
              await loadFilesFromCheckpointHelper(newChatId);

              const loadedFiles = browserFilesStore.getAllFiles();

              if (loadedFiles.size > 0) {
                await store.triggerBrowserBuildPublic();
              }

              unsubscribe(); // Only need to load once
            }
          });
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
   * Initialize WebContainer mode (legacy).
   */
  async #initWebContainerMode(): Promise<void> {
    logger.info('Initializing WebContainer Mode...');

    // Initialize WebContainer-based stores
    this.#webContainerFilesStore = await getWebContainerFilesStore();
    this.#webContainerFilesStore.init();

    // Sync files to stable atom
    this.#webContainerFilesStore.files.subscribe((files) => {
      this.#filesAtom.set(files);
    });

    this.#editorStore = new EditorStore(this.#webContainerFilesStore as any);

    const webcontainer = await getWebContainerModule();
    this.#previewsStore = new PreviewsStore(webcontainer);
    this.#previewsStore.setMode('webcontainer');
    this.#previewsStore.init();

    // Sync previews from store to stable atom
    this.#previewsStore.previews.subscribe((previews) => {
      this.#previewsAtom.set(previews);
    });

    // Sync editor store's atoms with stable atoms
    if (this.#editorStore) {
      this.#editorStore.selectedFile.subscribe((filePath) => {
        this.#selectedFileAtom.set(filePath);
      });

      this.#editorStore.currentDocument.subscribe((doc) => {
        this.#currentDocumentAtom.set(doc);
      });
    }

    this.#terminalStore = await getTerminalStore();

    // Sync terminal visibility
    if (this.#terminalStore.showTerminal) {
      this.#terminalStore.showTerminal.subscribe((show) => {
        this.#showTerminalAtom.set(show);
      });
    }
  }

  /**
   * Trigger a browser build with debouncing.
   * This waits for file writes to settle before building to avoid
   * building when files are still being written (e.g., main.tsx exists but App.tsx doesn't).
   */
  async #triggerBrowserBuild(): Promise<void> {
    if (this.#runtimeType !== 'browser') {
      return;
    }

    // Clear any existing debounce timer
    if (this.#buildDebounceTimer) {
      clearTimeout(this.#buildDebounceTimer);
      this.#buildDebounceTimer = null;
    }

    // Set a new debounce timer
    this.#buildDebounceTimer = setTimeout(() => {
      this.#executeBrowserBuild();
    }, this.#buildDebounceMs);
  }

  /**
   * Execute the actual browser build (called after debounce).
   */
  async #executeBrowserBuild(): Promise<void> {
    try {
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
        logger.debug('No entry point found yet, waiting for more files');
        return;
      }

      logger.info(`Triggering browser build with ${files.size} files, entry: ${entryPoint}`);

      const result = await service.syncAndBuild(files, entryPoint);

      if (result && result.errors.length === 0) {
        logger.info(`Browser build successful in ${Math.round(result.buildTime)}ms`);
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
   */
  #detectEntryPoint(files: Map<string, string>): string | null {
    const candidates = [
      '/src/main.tsx',
      '/src/main.ts',
      '/src/index.tsx',
      '/src/index.ts',
      '/src/App.tsx',
      '/src/App.ts',
      '/index.tsx',
      '/index.ts',
      '/main.tsx',
      '/main.ts',
    ];

    for (const candidate of candidates) {
      if (files.has(candidate)) {
        return candidate;
      }
    }

    // Return first TSX/TS file found in /src directory
    for (const path of files.keys()) {
      if (path.startsWith('/src/') && (path.endsWith('.tsx') || path.endsWith('.ts'))) {
        return path;
      }
    }

    // No suitable entry point found
    return null;
  }

  get previews() {
    return this.#previewsAtom;
  }

  /**
   * Set a browser-mode preview (for esbuild-wasm builds)
   */
  setBrowserPreview(info: BrowserPreviewInfo): void {
    logger.info(`Setting browser preview: ${info.url}`);

    // Update the stable previews atom directly
    const previewInfo = {
      port: 0, // Use port 0 as marker for browser preview
      ready: info.ready,
      baseUrl: info.url,
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
    if (this.#runtimeType === 'browser') {
      return browserFilesStore.filesCount;
    }
    return this.#webContainerFilesStore?.filesCount ?? 0;
  }

  get showTerminal() {
    return this.#showTerminalAtom;
  }

  toggleTerminal(value?: boolean) {
    if (this.#runtimeType === 'browser') {
      logger.debug('Terminal not available in browser mode');
      return;
    }

    const newValue = value ?? !this.#showTerminalAtom.get();
    this.#showTerminalAtom.set(newValue);
    this.#terminalStore?.toggleTerminal(newValue);
  }

  attachTerminal(terminal: ITerminal) {
    if (this.#runtimeType === 'browser') {
      logger.debug('Terminal not available in browser mode');
      return;
    }
    this.#terminalStore?.attachTerminal(terminal);
  }

  onTerminalResize(cols: number, rows: number) {
    this.#terminalStore?.onTerminalResize(cols, rows);
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

    const filesStore = this.#runtimeType === 'browser' ? browserFilesStore : this.#webContainerFilesStore;
    const originalContent = filesStore?.getFile(filePath)?.content;
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

    if (this.#runtimeType === 'browser') {
      await browserFilesStore.saveFile(filePath, document.value);
    } else {
      await this.#webContainerFilesStore?.saveFile(filePath, document.value);
    }

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
    const filesStore = this.#runtimeType === 'browser' ? browserFilesStore : this.#webContainerFilesStore;
    const file = filesStore?.getFile(filePath);

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
    if (this.#runtimeType === 'browser') {
      return browserFilesStore.getFileModifications();
    }
    return this.#webContainerFilesStore?.getFileModifications() ?? [];
  }

  resetAllFileModifications() {
    if (this.#runtimeType === 'browser') {
      browserFilesStore.resetFileModifications();
    } else {
      this.#webContainerFilesStore?.resetFileModifications();
    }
  }

  getOriginalContent(filePath: string): string | undefined {
    if (this.#runtimeType === 'browser') {
      return browserFilesStore.getOriginalContent(filePath);
    }
    return this.#webContainerFilesStore?.getOriginalContent(filePath);
  }

  isFileModified(filePath: string): boolean {
    if (this.#runtimeType === 'browser') {
      return browserFilesStore.isFileModified(filePath);
    }
    return this.#webContainerFilesStore?.isFileModified(filePath) ?? false;
  }

  async restoreFromSnapshot(snapshot: FileMap): Promise<{ filesWritten: number; filesDeleted: number }> {
    if (this.#runtimeType === 'browser') {
      // In browser mode, just set all files
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

    const result = await this.#webContainerFilesStore?.restoreFromSnapshot(snapshot) ?? { filesWritten: 0, filesDeleted: 0 };
    this.setDocuments(snapshot);
    this.unsavedFiles.set(new Set<string>());
    return result;
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
      let runner: ActionRunnerType;

      if (this.#runtimeType === 'browser') {
        runner = await getBrowserActionRunner();
        // Set build trigger for browser action runner
        (runner as any).setBuildTrigger(() => this.#triggerBrowserBuild());
      } else {
        runner = await getWebContainerActionRunner();
      }

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
    if (state.closed && this.#runtimeType === 'browser') {
      logger.info('Artifact closed, triggering final build');
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
