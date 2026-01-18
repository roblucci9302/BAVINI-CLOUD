/**
 * =============================================================================
 * BAVINI CLOUD - Runtime Factory
 * =============================================================================
 * Factory pour créer et gérer les instances de RuntimeAdapter.
 * Permet de switcher entre WebContainer et BrowserBuild via feature flag.
 * =============================================================================
 */

import { atom, type WritableAtom } from 'nanostores';
import type { RuntimeAdapter } from './adapter';
import { WebContainerAdapter } from './adapters/webcontainer-adapter';
import { BrowserBuildAdapter } from './adapters/browser-build-adapter';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('RuntimeFactory');

/**
 * Types de runtime disponibles.
 */
export type RuntimeType = 'webcontainer' | 'browser';

/**
 * Feature flag pour choisir le runtime.
 *
 * - 'webcontainer': Utilise WebContainer (StackBlitz) - comportement actuel
 * - 'browser': Utilise esbuild-wasm dans le browser - nouveau système
 *
 * @default 'webcontainer'
 */
export const runtimeTypeStore: WritableAtom<RuntimeType> = atom<RuntimeType>('browser');

/**
 * Instance singleton du runtime adapter.
 */
let currentAdapter: RuntimeAdapter | null = null;
let currentType: RuntimeType | null = null;

/**
 * Promise de synchronisation pour éviter les race conditions lors de l'initialisation.
 * Quand initRuntime() est appelé pendant une init en cours, on attend la Promise existante.
 */
let initPromise: Promise<RuntimeAdapter> | null = null;

/**
 * Crée un RuntimeAdapter basé sur le type spécifié.
 *
 * @param type - Type de runtime ('webcontainer' | 'browser')
 * @returns Instance de RuntimeAdapter
 */
export function createRuntimeAdapter(type: RuntimeType): RuntimeAdapter {
  logger.info(`Creating runtime adapter: ${type}`);

  switch (type) {
    case 'webcontainer':
      return new WebContainerAdapter();

    case 'browser':
      return new BrowserBuildAdapter();

    default:
      throw new Error(`Unknown runtime type: ${type}`);
  }
}

/**
 * Obtient l'instance singleton du RuntimeAdapter.
 * Crée une nouvelle instance si le type a changé.
 *
 * @returns Instance de RuntimeAdapter
 */
export function getRuntimeAdapter(): RuntimeAdapter {
  const type = runtimeTypeStore.get();

  // Si le type a changé, détruire l'ancien et créer un nouveau
  if (currentAdapter && currentType !== type) {
    logger.info(`Runtime type changed from ${currentType} to ${type}, recreating adapter`);

    // Reset init promise when adapter changes (prevents stale Promise)
    initPromise = null;

    currentAdapter.destroy().catch((error) => {
      logger.error('Failed to destroy previous adapter:', error);
    });
    currentAdapter = null;
  }

  // Créer une nouvelle instance si nécessaire
  if (!currentAdapter) {
    currentAdapter = createRuntimeAdapter(type);
    currentType = type;
  }

  return currentAdapter;
}

/**
 * Initialise le runtime adapter.
 * Doit être appelé avant d'utiliser le runtime.
 * Protégé contre les race conditions - les appels concurrents attendent la même Promise.
 *
 * @returns Promise qui résout quand le runtime est prêt
 */
export async function initRuntime(): Promise<RuntimeAdapter> {
  const adapter = getRuntimeAdapter();

  // Déjà prêt, retourner immédiatement
  if (adapter.status === 'ready') {
    return adapter;
  }

  // Si une initialisation est en cours, attendre la Promise existante
  if (initPromise) {
    return initPromise;
  }

  // Démarrer l'initialisation et stocker la Promise
  initPromise = (async () => {
    try {
      await adapter.init();
      return adapter;
    } catch (error) {
      // Reset la Promise en cas d'échec pour permettre un retry
      initPromise = null;
      throw error;
    }
  })();

  return initPromise;
}

/**
 * Change le type de runtime.
 * L'ancien runtime sera détruit et un nouveau sera créé.
 *
 * @param type - Nouveau type de runtime
 */
export async function setRuntimeType(type: RuntimeType): Promise<void> {
  const previousType = runtimeTypeStore.get();

  if (previousType === type) {
    logger.debug(`Runtime type already set to ${type}`);
    return;
  }

  logger.info(`Switching runtime from ${previousType} to ${type}`);
  runtimeTypeStore.set(type);

  // Le prochain appel à getRuntimeAdapter() créera le nouveau runtime
}

/**
 * Détruit le runtime actuel.
 * Utile pour le cleanup lors du démontage d'un composant.
 */
export async function destroyRuntime(): Promise<void> {
  // Reset init promise first to prevent new inits during destroy
  initPromise = null;

  if (currentAdapter) {
    await currentAdapter.destroy();
    currentAdapter = null;
    currentType = null;
  }
}

/**
 * Vérifie si le runtime browser (esbuild-wasm) est disponible.
 *
 * @returns true si le runtime browser peut être utilisé
 */
export function isBrowserRuntimeAvailable(): boolean {
  // esbuild-wasm is available in browser environments
  return typeof window !== 'undefined';
}

/**
 * Obtient les informations sur les runtimes disponibles.
 */
export function getRuntimeInfo(): {
  current: RuntimeType;
  available: RuntimeType[];
  webcontainer: { available: boolean; reason?: string };
  browser: { available: boolean; reason?: string };
} {
  const browserAvailable = isBrowserRuntimeAvailable();

  return {
    current: runtimeTypeStore.get(),
    available: browserAvailable ? ['webcontainer', 'browser'] : ['webcontainer'],
    webcontainer: {
      available: true,
    },
    browser: {
      available: browserAvailable,
      reason: browserAvailable ? undefined : 'Not available in server environment',
    },
  };
}
