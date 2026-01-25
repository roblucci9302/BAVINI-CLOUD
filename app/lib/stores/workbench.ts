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
import { createScopedLogger } from '~/utils/logger';
import { EditorStore } from './editor';
import { PreviewsStore, type BrowserPreviewInfo, clearPreviewError } from './previews';
import { browserFilesStore, type FileMap } from './browser-files';
import { chatId } from '~/lib/persistence/useChatHistory';

// Import extracted modules
import type { ArtifactState, ArtifactUpdateState, Artifacts, WorkbenchViewType } from './workbench/types';
import {
  yieldToEventLoop,
  getBrowserActionRunner,
  getBrowserBuildService,
  loadFilesFromCheckpointHelper,
} from './workbench/helpers';
import { detectEntryPoint } from './workbench/entry-point-detection';

// Re-export types for backwards compatibility
export type { ArtifactState, ArtifactUpdateState, WorkbenchViewType };

const logger = createScopedLogger('Workbench');

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
    const filesChangeCleanup = browserFilesStore.onFilesChange(async (files) => {
      logger.debug(`Files changed, ${files.size} files total`);
    });
    if (typeof filesChangeCleanup === 'function') {
      this.#cleanupFunctions.push(filesChangeCleanup);
    }

    // Subscribe to files changes to update editor and stable atom
    const filesSubscription = browserFilesStore.files.subscribe((files) => {
      this.#filesAtom.set(files);

      if (this.#editorStore) {
        this.#editorStore.setDocuments(files);

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

      // Trigger initial build if files already exist
      let existingFiles = browserFilesStore.getAllFiles();

      // If no files in browserFilesStore, try to load from the latest checkpoint
      if (existingFiles.size === 0) {
        const currentChatId = chatId.get();

        if (currentChatId) {
          await loadFilesFromCheckpointHelper(currentChatId);
          existingFiles = browserFilesStore.getAllFiles();
        } else {
          logger.info('No chatId yet, will load from checkpoint when available');

          const store = this;
          let hasLoaded = false;

          const chatIdUnsubscribe = chatId.subscribe(async (newChatId) => {
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

          this.#cleanupFunctions.push(chatIdUnsubscribe);
        }
      }

      if (existingFiles.size > 0) {
        logger.info(`Found ${existingFiles.size} existing files, triggering initial build`);
        await this.#executeBrowserBuild();
      } else {
        logger.info('No files to build yet, waiting for AI to generate code or checkpoint load');
      }
    } catch (error) {
      logger.error('Failed to initialize BrowserBuildService:', error);
    }
  }

  /**
   * Public wrapper to trigger browser build immediately (bypasses debounce).
   */
  async triggerBrowserBuildPublic(): Promise<void> {
    if (this.#buildDebounceTimer) {
      clearTimeout(this.#buildDebounceTimer);
      this.#buildDebounceTimer = null;
    }

    await this.#executeBrowserBuild();
  }

  /**
   * Trigger a browser build with debouncing.
   */
  async #triggerBrowserBuild(changedFile?: string): Promise<void> {
    if (this.#runtimeType !== 'browser') {
      return;
    }

    if (changedFile) {
      this.#pendingFiles.add(changedFile);
    }

    if (this.#buildDebounceTimer) {
      clearTimeout(this.#buildDebounceTimer);
      this.#buildDebounceTimer = null;
    }

    this.#buildDebounceTimer = setTimeout(() => {
      if (this.#pendingFiles.size > 0) {
        logger.info(`Building with ${this.#pendingFiles.size} changed file(s):`, Array.from(this.#pendingFiles));
      }

      this.#pendingFiles.clear();

      this.#executeBrowserBuild();
    }, this.#buildDebounceMs);
  }

  /**
   * Execute the actual browser build (called after debounce).
   */
  async #executeBrowserBuild(): Promise<void> {
    try {
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

      // Use extracted entry point detection
      const entryPoint = detectEntryPoint(files);

      if (!entryPoint) {
        logger.warn('No entry point found. Files:', Array.from(files.keys()));
        return;
      }

      logger.info(`Triggering browser build with ${files.size} files, entry: ${entryPoint}`);

      for (const [path, content] of files) {
        if (path.endsWith('.tsx') || path.endsWith('.jsx')) {
          const preview = content.length > 500 ? content.substring(0, 500) + '...' : content;
          logger.info(`\u{1F4C4} ${path} (${content.length} chars):\n${preview}`);
        }
      }

      await yieldToEventLoop();

      const result = await service.syncAndBuild(files, entryPoint);

      if (result && result.errors.length === 0) {
        logger.info(`Browser build successful in ${Math.round(result.buildTime)}ms`);
        clearPreviewError();
      } else if (result && result.errors.length > 0) {
        logger.warn('Browser build had errors:', result.errors);
      }
    } catch (error) {
      logger.error('Build trigger failed:', error);
    }
  }

  get previews() {
    return this.#previewsAtom;
  }

  setBrowserPreview(info: BrowserPreviewInfo): void {
    logger.info(`Setting browser preview: ${info.url}${info.srcdoc ? ' (srcdoc mode)' : ''}`);

    const previewInfo = {
      port: 0,
      ready: info.ready,
      baseUrl: info.url,
      srcdoc: info.srcdoc,
    };

    const currentPreviews = this.#previewsAtom.get();
    const existingIndex = currentPreviews.findIndex((p: { port: number }) => p.port === 0);

    if (existingIndex >= 0) {
      const newPreviews = [...currentPreviews];
      newPreviews[existingIndex] = previewInfo;
      this.#previewsAtom.set(newPreviews);
    } else {
      this.#previewsAtom.set([...currentPreviews, previewInfo]);
    }

    this.#previewsStore?.setBrowserPreview(info);
  }

  clearBrowserPreview(): void {
    const currentPreviews = this.#previewsAtom.get();
    this.#previewsAtom.set(currentPreviews.filter((p: { port: number }) => p.port !== 0));
    this.#previewsStore?.clearBrowserPreview();
  }

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
    logger.debug('Terminal not available in browser mode');
  }

  attachTerminal(_terminal: ITerminal) {
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

    if (this.#pendingArtifacts.has(messageId)) {
      return;
    }

    if (!this.artifactIdList.includes(messageId)) {
      this.artifactIdList.push(messageId);
    }

    const createPromise = (async () => {
      const runner = await getBrowserActionRunner();
      if ('setBuildTrigger' in runner) {
        (runner as unknown as { setBuildTrigger: (fn: () => void) => void }).setBuildTrigger(() =>
          this.#triggerBrowserBuild(),
        );
      }

      this.artifacts.setKey(messageId, {
        id,
        title,
        closed: false,
        runner: runner as unknown as ArtifactState['runner'],
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

    if (state.closed) {
      const files = browserFilesStore.getAllFiles();
      logger.info(`Artifact closed with ${files.size} files:`, Array.from(files.keys()));
      logger.info('Triggering final build');
      this.triggerBrowserBuildPublic();
    }
  }

  async addAction(data: ActionCallbackData) {
    const { messageId } = data;

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
