import { loadPyodide, type PyodideInterface } from 'pyodide';
import { createScopedLogger } from '~/utils/logger';
import { raceWithTimeout, EXECUTION_LIMITS } from '~/lib/security/timeout';
import type { PyObject, MemoryStats, PyodideResourceLimits } from './types';

// Réexport des types
export type {
  PythonResult,
  PyObject,
  PythonExecutionOptions,
  PythonError,
  PyodideState,
  MemoryStats,
  PyodideResourceLimits,
} from './types';

// Import du type pour usage interne
import type { PythonResult } from './types';

const logger = createScopedLogger('Pyodide');

const PYODIDE_INDEX_URL = '/assets/pyodide/';

let pyodideInstance: PyodideInterface | null = null;
let pyodidePromise: Promise<PyodideInterface> | null = null;
let micropipLoaded = false;

/**
 * Initialize Pyodide runtime. Returns cached instance if already initialized.
 */
export async function initPyodide(): Promise<PyodideInterface> {
  if (pyodideInstance) {
    return pyodideInstance;
  }

  if (pyodidePromise) {
    return pyodidePromise;
  }

  pyodidePromise = (async () => {
    logger.info('Initializing Pyodide...');

    const pyodide = await loadPyodide({
      indexURL: PYODIDE_INDEX_URL,
    });

    logger.info('Pyodide initialized successfully');

    pyodideInstance = pyodide;

    return pyodide;
  })();

  return pyodidePromise;
}

/**
 * Get the Pyodide instance. Throws if not initialized.
 */
export function getPyodide(): PyodideInterface {
  if (!pyodideInstance) {
    throw new Error('Pyodide not initialized. Call initPyodide() first.');
  }

  return pyodideInstance;
}

/**
 * Check if Pyodide is ready.
 */
export function isPyodideReady(): boolean {
  return pyodideInstance !== null;
}

/**
 * Load micropip for package installation.
 */
async function ensureMicropip(): Promise<void> {
  if (micropipLoaded) {
    return;
  }

  const pyodide = await initPyodide();

  await pyodide.loadPackage('micropip');
  micropipLoaded = true;
  logger.debug('micropip loaded');
}

/**
 * Install Python packages using micropip.
 */
export async function installPackages(packages: string[]): Promise<void> {
  if (packages.length === 0) {
    return;
  }

  await ensureMicropip();

  const pyodide = getPyodide();
  const micropip = pyodide.pyimport('micropip');

  for (const pkg of packages) {
    logger.debug(`Installing package: ${pkg}`);

    try {
      await micropip.install(pkg);
      logger.info(`Installed: ${pkg}`);
    } catch (error) {
      logger.error(`Failed to install ${pkg}:`, error);
      throw error;
    }
  }
}

/**
 * Run Python code and capture stdout/stderr.
 */
export async function runPython(code: string): Promise<PythonResult> {
  const pyodide = await initPyodide();

  // set up stdout/stderr capture
  await pyodide.runPythonAsync(`
import sys
from io import StringIO

_captured_stdout = StringIO()
_captured_stderr = StringIO()
_original_stdout = sys.stdout
_original_stderr = sys.stderr
sys.stdout = _captured_stdout
sys.stderr = _captured_stderr
`);

  let result: PyObject;
  let error: Error | null = null;

  try {
    result = await pyodide.runPythonAsync(code);
  } catch (err) {
    error = err as Error;
    logger.error('Python execution error:', err);
  }

  // capture output
  const stdout = await pyodide.runPythonAsync('_captured_stdout.getvalue()');
  const stderr = await pyodide.runPythonAsync('_captured_stderr.getvalue()');

  // restore stdout/stderr
  await pyodide.runPythonAsync(`
sys.stdout = _original_stdout
sys.stderr = _original_stderr
`);

  if (error) {
    return {
      result: null,
      stdout: stdout || '',
      stderr: stderr || error.message,
    };
  }

  return {
    result,
    stdout: stdout || '',
    stderr: stderr || '',
  };
}

/**
 * Run Python code with timeout (30 seconds by default).
 * Prevents infinite loops from blocking the browser.
 */
export async function runPythonWithTimeout(
  code: string,
  timeoutMs: number = EXECUTION_LIMITS.python.timeoutMs,
): Promise<PythonResult> {
  return raceWithTimeout(runPython(code), timeoutMs, EXECUTION_LIMITS.python.message);
}

/**
 * Run Python code synchronously (blocking). Use with caution.
 * @returns Résultat de l'exécution Python (type inconnu car vient de Python)
 */
export function runPythonSync(code: string): PyObject {
  const pyodide = getPyodide();

  return pyodide.runPython(code);
}

/**
 * Close and reset Pyodide instance.
 */
export function closePyodide(): void {
  pyodideInstance = null;
  pyodidePromise = null;
  micropipLoaded = false;
  logger.info('Pyodide closed');
}

/**
 * Check if a package is available in Pyodide's built-in packages.
 */
export async function isPackageBuiltin(packageName: string): Promise<boolean> {
  const pyodide = await initPyodide();

  try {
    const result = await pyodide.runPythonAsync(`
import micropip
"${packageName}" in micropip.list()
`);

    return result;
  } catch {
    return false;
  }
}

/*
 * ============================================================================
 * Memory Monitoring
 * ============================================================================
 */

/** Limite mémoire par défaut : 512 Mo */
const DEFAULT_MEMORY_LIMIT_BYTES = 512 * 1024 * 1024;

/** Seuil d'avertissement par défaut : 80% */
const DEFAULT_WARNING_THRESHOLD = 0.8;

let resourceLimits: PyodideResourceLimits = {
  memoryLimitBytes: DEFAULT_MEMORY_LIMIT_BYTES,
  warningThreshold: DEFAULT_WARNING_THRESHOLD,
};

/**
 * Configure les limites de ressources Pyodide.
 */
export function setResourceLimits(limits: Partial<PyodideResourceLimits>): void {
  resourceLimits = {
    ...resourceLimits,
    ...limits,
  };
  logger.debug('Resource limits updated:', resourceLimits);
}

/**
 * Récupère les limites de ressources actuelles.
 */
export function getResourceLimits(): PyodideResourceLimits {
  return { ...resourceLimits };
}

/**
 * Récupère les statistiques mémoire actuelles.
 * Note: Cette fonction utilise performance.memory si disponible (Chrome uniquement).
 * Dans les autres navigateurs, elle retourne des estimations basées sur l'état Pyodide.
 */
export function getMemoryStats(): MemoryStats {
  // Vérifier si performance.memory est disponible (Chrome)
  const perfMemory = (performance as { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;

  if (perfMemory) {
    const usedBytes = perfMemory.usedJSHeapSize;
    const totalBytes = Math.min(perfMemory.jsHeapSizeLimit, resourceLimits.memoryLimitBytes);
    const usagePercent = (usedBytes / totalBytes) * 100;

    return {
      usedBytes,
      totalBytes,
      usagePercent: Math.round(usagePercent * 100) / 100,
    };
  }

  /*
   * Fallback: estimation basée sur l'état Pyodide
   * Pyodide utilise environ 50-100 Mo au démarrage
   */
  const estimatedUsed = pyodideInstance ? 80 * 1024 * 1024 : 0;

  return {
    usedBytes: estimatedUsed,
    totalBytes: resourceLimits.memoryLimitBytes,
    usagePercent: (estimatedUsed / resourceLimits.memoryLimitBytes) * 100,
  };
}

/**
 * Vérifie si la mémoire approche de la limite.
 * Retourne true si le seuil d'avertissement est atteint.
 */
export function isMemoryWarning(): boolean {
  const stats = getMemoryStats();

  return stats.usagePercent >= resourceLimits.warningThreshold * 100;
}

/**
 * Vérifie l'état de la mémoire et log un avertissement si nécessaire.
 * Retourne les stats mémoire actuelles.
 */
export function checkMemoryUsage(): MemoryStats {
  const stats = getMemoryStats();

  if (stats.usagePercent >= resourceLimits.warningThreshold * 100) {
    logger.warn(`Mémoire élevée: ${stats.usagePercent.toFixed(1)}% utilisée`, {
      usedMB: Math.round(stats.usedBytes / (1024 * 1024)),
      limitMB: Math.round(stats.totalBytes / (1024 * 1024)),
    });
  }

  return stats;
}
