/**
 * Types pour Pyodide - BAVINI
 * Définitions de types pour l'exécution Python
 */

/**
 * Type représentant un objet Python
 * Utilise `unknown` car les valeurs Python sont fondamentalement imprévisibles
 */
export type PyObject = unknown;

/**
 * Résultat d'une exécution Python
 */
export interface PythonResult {
  /** Résultat de l'exécution (type inconnu car vient de Python) */
  result: PyObject;

  /** Sortie standard capturée */
  stdout: string;

  /** Sortie d'erreur capturée */
  stderr: string;
}

/**
 * Options pour l'exécution Python
 */
export interface PythonExecutionOptions {
  /** Timeout en millisecondes */
  timeout?: number;

  /** Packages à installer avant l'exécution */
  packages?: string[];

  /** Variables globales à injecter */
  globals?: Record<string, PyObject>;

  /** Limite de mémoire en Mo (pour avertissement) */
  memoryLimitMB?: number;
}

/**
 * Limites de ressources Pyodide
 */
export interface PyodideResourceLimits {
  /** Limite de mémoire en octets */
  memoryLimitBytes: number;

  /** Seuil d'avertissement (pourcentage) */
  warningThreshold: number;
}

/**
 * Statistiques d'utilisation mémoire
 */
export interface MemoryStats {
  /** Mémoire utilisée en octets */
  usedBytes: number;

  /** Mémoire totale disponible en octets */
  totalBytes: number;

  /** Pourcentage d'utilisation */
  usagePercent: number;
}

/**
 * Erreur d'exécution Python
 */
export interface PythonError {
  /** Type d'erreur Python (ex: ValueError, TypeError) */
  type: string;

  /** Message d'erreur */
  message: string;

  /** Traceback complet */
  traceback?: string;
}

/**
 * État du runtime Pyodide
 */
export type PyodideState = 'uninitialized' | 'initializing' | 'ready' | 'error';
