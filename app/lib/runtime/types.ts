/**
 * =============================================================================
 * BAVINI CLOUD - Runtime Types
 * =============================================================================
 * Types communs pour les adapteurs de runtime (WebContainer, Browser Build, etc.)
 * =============================================================================
 */

/**
 * Représente un fichier dans le système de fichiers virtuel
 */
export interface VirtualFile {
  type: 'file';
  content: string;
  isBinary: boolean;
}

/**
 * Représente un dossier dans le système de fichiers virtuel
 */
export interface VirtualFolder {
  type: 'folder';
}

/**
 * Union type pour les entrées du système de fichiers
 */
export type VirtualDirent = VirtualFile | VirtualFolder;

/**
 * Map des fichiers virtuels (chemin -> contenu)
 */
export type FileMap = Map<string, string>;

/**
 * Record des fichiers virtuels (compatible avec les stores existants)
 */
export type FileRecord = Record<string, VirtualDirent | undefined>;

/**
 * Loaders supportés pour la transformation de code
 */
export type Loader = 'ts' | 'tsx' | 'js' | 'jsx' | 'css' | 'json' | 'text';

/**
 * Résultat d'un build
 */
export interface BundleResult {
  /** Code JavaScript bundlé */
  code: string;
  /** CSS extrait (si applicable) */
  css: string;
  /** Erreurs de build */
  errors: BuildError[];
  /** Warnings de build */
  warnings: BuildWarning[];
  /** Temps de build en ms */
  buildTime: number;
  /** Hash du bundle (pour cache) */
  hash: string;
}

/**
 * Erreur de build
 */
export interface BuildError {
  /** Message d'erreur */
  message: string;
  /** Fichier concerné */
  file?: string;
  /** Ligne de l'erreur */
  line?: number;
  /** Colonne de l'erreur */
  column?: number;
  /** Extrait de code autour de l'erreur */
  snippet?: string;
}

/**
 * Warning de build
 */
export interface BuildWarning {
  message: string;
  file?: string;
  line?: number;
  column?: number;
}

/**
 * Log de console capturé depuis le preview
 */
export interface ConsoleLog {
  /** Type de log */
  type: 'log' | 'warn' | 'error' | 'info' | 'debug';
  /** Arguments passés à console.x() */
  args: unknown[];
  /** Timestamp en ms */
  timestamp: number;
}

/**
 * Erreur runtime capturée depuis le preview
 */
export interface RuntimeError {
  /** Message d'erreur */
  message: string;
  /** Nom du fichier source */
  filename?: string;
  /** Numéro de ligne */
  lineno?: number;
  /** Numéro de colonne */
  colno?: number;
  /** Stack trace */
  stack?: string;
}

/**
 * Information sur le preview
 */
export interface PreviewInfo {
  /** URL du preview (blob:// ou http://) */
  url: string;
  /** Le preview est-il prêt? */
  ready: boolean;
  /** Timestamp de dernière mise à jour */
  updatedAt: number;
  /** HTML content for srcdoc mode (avoids blob URL origin issues) */
  srcdoc?: string;
}

/**
 * Status du runtime
 */
export type RuntimeStatus = 'idle' | 'initializing' | 'ready' | 'building' | 'error';

/**
 * Options de build
 */
export interface BuildOptions {
  /** Point d'entrée (ex: '/src/main.tsx') */
  entryPoint: string;
  /** Mode de build */
  mode: 'development' | 'production';
  /** Activer le minification */
  minify?: boolean;
  /** Activer les source maps */
  sourcemap?: boolean;
  /** Variables d'environnement à injecter */
  define?: Record<string, string>;
}

/**
 * Options de transformation
 */
export interface TransformOptions {
  /** Loader à utiliser */
  loader: Loader;
  /** Nom du fichier (pour les messages d'erreur) */
  filename?: string;
}

/**
 * Callbacks pour les événements du runtime
 */
export interface RuntimeCallbacks {
  /** Appelé quand le preview est prêt */
  onPreviewReady?: (info: PreviewInfo) => void;
  /** Appelé pour chaque log console */
  onConsole?: (log: ConsoleLog) => void;
  /** Appelé pour chaque erreur runtime */
  onError?: (error: RuntimeError) => void;
  /** Appelé quand le status change */
  onStatusChange?: (status: RuntimeStatus) => void;
  /** Appelé pendant le build (progress) */
  onBuildProgress?: (phase: string, progress: number) => void;
}
