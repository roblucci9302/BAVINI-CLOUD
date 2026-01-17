/**
 * =============================================================================
 * BAVINI CLOUD - Runtime Adapter Interface
 * =============================================================================
 * Interface abstraite pour les différents runtimes (WebContainer, Browser Build).
 * Permet de switcher entre les implémentations sans changer le code métier.
 * =============================================================================
 */

import type {
  FileMap,
  FileRecord,
  BundleResult,
  BuildOptions,
  TransformOptions,
  PreviewInfo,
  ConsoleLog,
  RuntimeError,
  RuntimeStatus,
  RuntimeCallbacks,
} from './types';

/**
 * Interface principale pour les adapteurs de runtime.
 *
 * Chaque implémentation (WebContainer, BrowserBuild) doit implémenter
 * cette interface pour être interchangeable.
 *
 * @example
 * ```typescript
 * // Utilisation avec WebContainer (actuel)
 * const adapter = new WebContainerAdapter();
 * await adapter.init();
 *
 * // Utilisation avec Browser Build (nouveau)
 * const adapter = new BrowserBuildAdapter();
 * await adapter.init();
 *
 * // Le reste du code est identique
 * await adapter.writeFiles(files);
 * const result = await adapter.build({ entryPoint: '/src/main.tsx' });
 * ```
 */
export interface RuntimeAdapter {
  /**
   * Nom de l'adapteur (pour le debug/logs)
   */
  readonly name: string;

  /**
   * Status actuel du runtime
   */
  readonly status: RuntimeStatus;

  // ===========================================================================
  // LIFECYCLE
  // ===========================================================================

  /**
   * Initialise le runtime.
   * Doit être appelé avant toute autre opération.
   *
   * @throws {Error} Si l'initialisation échoue
   */
  init(): Promise<void>;

  /**
   * Nettoie les ressources du runtime.
   * Appelé lors de la destruction du composant.
   */
  destroy(): Promise<void>;

  // ===========================================================================
  // FILE SYSTEM
  // ===========================================================================

  /**
   * Écrit plusieurs fichiers dans le système de fichiers virtuel.
   *
   * @param files - Map des fichiers (chemin -> contenu)
   */
  writeFiles(files: FileMap): Promise<void>;

  /**
   * Écrit un seul fichier.
   *
   * @param path - Chemin du fichier (ex: '/src/App.tsx')
   * @param content - Contenu du fichier
   */
  writeFile(path: string, content: string): Promise<void>;

  /**
   * Lit un fichier.
   *
   * @param path - Chemin du fichier
   * @returns Contenu du fichier ou null si non trouvé
   */
  readFile(path: string): Promise<string | null>;

  /**
   * Supprime un fichier.
   *
   * @param path - Chemin du fichier
   */
  deleteFile(path: string): Promise<void>;

  /**
   * Liste les fichiers dans un répertoire.
   *
   * @param path - Chemin du répertoire
   * @returns Liste des noms de fichiers/dossiers
   */
  readdir(path: string): Promise<string[]>;

  // ===========================================================================
  // BUILD
  // ===========================================================================

  /**
   * Build le projet et retourne le bundle.
   *
   * @param options - Options de build
   * @returns Résultat du build (code, css, erreurs)
   */
  build(options: BuildOptions): Promise<BundleResult>;

  /**
   * Transforme un seul fichier (sans bundling).
   * Utile pour la validation syntaxique en temps réel.
   *
   * @param code - Code source
   * @param options - Options de transformation
   * @returns Code transformé
   */
  transform(code: string, options: TransformOptions): Promise<string>;

  // ===========================================================================
  // PREVIEW
  // ===========================================================================

  /**
   * Obtient l'URL du preview actuel.
   *
   * @returns Info du preview ou null si pas de preview
   */
  getPreview(): PreviewInfo | null;

  /**
   * Force le refresh du preview.
   */
  refreshPreview(): Promise<void>;

  // ===========================================================================
  // EVENTS
  // ===========================================================================

  /**
   * Enregistre les callbacks pour les événements.
   *
   * @param callbacks - Objet contenant les callbacks
   */
  setCallbacks(callbacks: RuntimeCallbacks): void;

  // ===========================================================================
  // CAPABILITIES
  // ===========================================================================

  /**
   * Indique si le runtime supporte un terminal complet.
   * WebContainer: true, BrowserBuild: false
   */
  readonly supportsTerminal: boolean;

  /**
   * Indique si le runtime supporte l'exécution de commandes shell.
   * WebContainer: true, BrowserBuild: false
   */
  readonly supportsShell: boolean;

  /**
   * Indique si le runtime supporte les serveurs Node.js.
   * WebContainer: true, BrowserBuild: false
   */
  readonly supportsNodeServer: boolean;

  /**
   * Indique si le runtime fonctionne entièrement dans le browser.
   * WebContainer: true (WASM), BrowserBuild: true (esbuild-wasm)
   */
  readonly isBrowserOnly: boolean;

  /**
   * Liste des frameworks supportés.
   */
  readonly supportedFrameworks: string[];
}

/**
 * Classe abstraite de base pour les adapteurs.
 * Fournit une implémentation par défaut des callbacks.
 */
export abstract class BaseRuntimeAdapter implements RuntimeAdapter {
  abstract readonly name: string;
  abstract readonly status: RuntimeStatus;
  abstract readonly supportsTerminal: boolean;
  abstract readonly supportsShell: boolean;
  abstract readonly supportsNodeServer: boolean;
  abstract readonly isBrowserOnly: boolean;
  abstract readonly supportedFrameworks: string[];

  protected callbacks: RuntimeCallbacks = {};

  abstract init(): Promise<void>;
  abstract destroy(): Promise<void>;
  abstract writeFiles(files: FileMap): Promise<void>;
  abstract writeFile(path: string, content: string): Promise<void>;
  abstract readFile(path: string): Promise<string | null>;
  abstract deleteFile(path: string): Promise<void>;
  abstract readdir(path: string): Promise<string[]>;
  abstract build(options: BuildOptions): Promise<BundleResult>;
  abstract transform(code: string, options: TransformOptions): Promise<string>;
  abstract getPreview(): PreviewInfo | null;
  abstract refreshPreview(): Promise<void>;

  setCallbacks(callbacks: RuntimeCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  protected emitConsole(log: ConsoleLog): void {
    this.callbacks.onConsole?.(log);
  }

  protected emitError(error: RuntimeError): void {
    this.callbacks.onError?.(error);
  }

  protected emitPreviewReady(info: PreviewInfo): void {
    this.callbacks.onPreviewReady?.(info);
  }

  protected emitStatusChange(status: RuntimeStatus): void {
    this.callbacks.onStatusChange?.(status);
  }

  protected emitBuildProgress(phase: string, progress: number): void {
    this.callbacks.onBuildProgress?.(phase, progress);
  }
}
