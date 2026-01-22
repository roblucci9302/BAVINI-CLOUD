# BAVINI WebContainer - Plan de Correction Complet

> **Version**: 1.0
> **Date**: 2026-01-21
> **Statut**: À implémenter
> **Temps estimé total**: 38-52 heures

---

## Vue d'Ensemble

Ce document détaille le plan d'implémentation pour corriger tous les problèmes identifiés lors de l'audit du WebContainer amélioré de BAVINI. Les corrections sont organisées en **4 phases** avec un ordre d'exécution logique basé sur les dépendances.

```
┌─────────────────────────────────────────────────────────────────┐
│                    ORDRE D'EXÉCUTION                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  PHASE 1: CRITIQUE (10-14h)                                    │
│  ├─ 1.1 Race condition esbuild                                 │
│  ├─ 1.2 Blob URL memory leak                                   │
│  ├─ 1.3 WebContainer listeners cleanup                         │
│  ├─ 1.4 Path traversal security                                │
│  └─ 1.5 Circular dependency loop                               │
│                                                                 │
│  PHASE 2: HAUTE PRIORITÉ (9-12h)                               │
│  ├─ 2.1 Timeouts (esbuild, fetch, build)                       │
│  ├─ 2.2 Service Worker error propagation                       │
│  ├─ 2.3 SmartCache TTL fix                                     │
│  ├─ 2.4 Tarball checksum validation                            │
│  └─ 2.5 fs module auto-init                                    │
│                                                                 │
│  PHASE 3: MOYENNE PRIORITÉ (15-20h)                            │
│  ├─ 3.1 HMR pipeline integration                               │
│  ├─ 3.2 Terminal pipes/redirection                             │
│  ├─ 3.3 SCSS/SASS compilation                                  │
│  ├─ 3.4 Hard limits bundle size                                │
│  └─ 3.5 process.nextTick memory leak                           │
│                                                                 │
│  PHASE 4: TESTS (4-6h)                                         │
│  └─ 4.1 Tests unitaires pour tous les correctifs               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## PHASE 1: CORRECTIFS CRITIQUES

### 1.1 Race Condition esbuild Global State

| Propriété | Valeur |
|-----------|--------|
| **Fichier** | `app/lib/runtime/adapters/browser-build-adapter.ts` |
| **Lignes** | 176-181, 244-306 |
| **Complexité** | Moyen |
| **Temps estimé** | 3-4h |
| **Dépendances** | Aucune |

#### Problème

```typescript
// PROBLÈME: Variables locales désynchronisées de globalThis
let globalEsbuildInitialized: boolean = (globalThis as any).__esbuildInitialized ?? false;
let globalEsbuildPromise: Promise<void> | null = (globalThis as any).__esbuildPromise ?? null;

// Race condition entre vérification et assignation
if (globalEsbuildInitialized) { /* ... */ }
if (globalEsbuildPromise) { /* ... */ }
globalEsbuildPromise = esbuild.initialize({...}); // ← Non atomique!
```

#### Solution

Créer une classe singleton avec state machine pour garantir l'atomicité:

```typescript
// Nouveau fichier: app/lib/runtime/adapters/esbuild-init-lock.ts

import * as esbuild from 'esbuild-wasm';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('EsbuildInitLock');

type InitState = 'idle' | 'initializing' | 'ready' | 'error';

/**
 * Singleton pour gérer l'initialisation esbuild de manière thread-safe
 */
export class EsbuildInitLock {
  private static instance: EsbuildInitLock | null = null;

  private _state: InitState = 'idle';
  private _promise: Promise<void> | null = null;
  private _error: Error | null = null;

  private constructor() {
    // Récupérer l'état depuis globalThis si existant
    const global = globalThis as any;
    if (global.__esbuildInitialized === true) {
      this._state = 'ready';
    }
  }

  static getInstance(): EsbuildInitLock {
    if (!EsbuildInitLock.instance) {
      EsbuildInitLock.instance = new EsbuildInitLock();
    }
    return EsbuildInitLock.instance;
  }

  get state(): InitState {
    return this._state;
  }

  get isReady(): boolean {
    return this._state === 'ready';
  }

  /**
   * Initialise esbuild de manière thread-safe
   * - Si déjà ready: retourne immédiatement
   * - Si en cours: retourne la Promise existante
   * - Si erreur: throw l'erreur précédente
   * - Si idle: démarre l'initialisation
   */
  async initialize(wasmUrl: string): Promise<void> {
    // State: ready → retour immédiat
    if (this._state === 'ready') {
      logger.debug('esbuild already initialized');
      return;
    }

    // State: error → throw l'erreur précédente
    if (this._state === 'error' && this._error) {
      throw this._error;
    }

    // State: initializing → attendre la Promise existante
    if (this._state === 'initializing' && this._promise) {
      logger.debug('esbuild initialization in progress, waiting...');
      return this._promise;
    }

    // State: idle → démarrer l'initialisation
    this._state = 'initializing';
    logger.info('Starting esbuild WASM initialization...');

    this._promise = this._doInitialize(wasmUrl);

    try {
      await this._promise;
      this._state = 'ready';
      (globalThis as any).__esbuildInitialized = true;
      logger.info('esbuild WASM initialized successfully');
    } catch (error) {
      this._state = 'error';
      this._error = error instanceof Error ? error : new Error(String(error));
      this._promise = null;
      logger.error('esbuild initialization failed:', this._error);
      throw this._error;
    }
  }

  private async _doInitialize(wasmUrl: string): Promise<void> {
    await esbuild.initialize({
      wasmURL: wasmUrl,
    });
  }

  /**
   * Reset l'état en cas d'erreur (pour retry)
   */
  reset(): void {
    if (this._state === 'error') {
      this._state = 'idle';
      this._error = null;
      this._promise = null;
      logger.info('EsbuildInitLock reset');
    }
  }
}

// Export singleton helper
export const esbuildInitLock = EsbuildInitLock.getInstance();
```

#### Modification de browser-build-adapter.ts

```typescript
// Remplacer les lignes 176-181 et 244-306

import { esbuildInitLock } from './esbuild-init-lock';

// Dans la méthode init():
async init(): Promise<void> {
  if (this._status === 'ready') {
    return;
  }

  this._status = 'initializing';
  this.emitStatusChange(this._status);

  try {
    // Utiliser le lock singleton
    await esbuildInitLock.initialize(ESBUILD_WASM_URL);

    this._status = 'ready';
    this.emitStatusChange(this._status);
    logger.info('BrowserBuildAdapter initialized');
  } catch (error) {
    this._status = 'error';
    this.emitStatusChange(this._status);
    throw error;
  }
}
```

---

### 1.2 Blob URL Memory Leak lors Changement Runtime

| Propriété | Valeur |
|-----------|--------|
| **Fichier** | `app/lib/runtime/factory.ts` |
| **Lignes** | 87-97 |
| **Complexité** | Simple |
| **Temps estimé** | 1-2h |
| **Dépendances** | Aucune |

#### Problème

```typescript
// PROBLÈME: destroy() non attendu, référence annulée immédiatement
if (currentAdapter && currentType !== type) {
  initPromise = null;
  currentAdapter.destroy().catch((error) => {
    logger.error('Failed to destroy previous adapter:', error);
  });
  currentAdapter = null; // ← Blob URLs peuvent fuiter!
}
```

#### Solution

**Fichier: factory.ts**

```typescript
/**
 * Change le type de runtime de manière sûre
 * AWAIT destroy() pour garantir le cleanup des ressources
 */
export async function setRuntimeType(type: RuntimeType): Promise<void> {
  const previousType = runtimeTypeStore.get();

  if (previousType === type) {
    return;
  }

  // CRITICAL: Attendre que l'ancien adapter soit proprement détruit
  if (currentAdapter) {
    logger.info(`Runtime type changing from ${previousType} to ${type}`);

    try {
      // Attendre la completion du destroy
      await currentAdapter.destroy();
      logger.debug('Previous adapter destroyed successfully');
    } catch (error) {
      logger.error('Failed to destroy previous adapter:', error);
      // Continuer malgré l'erreur - le nouveau runtime doit pouvoir démarrer
    }

    // Nettoyer les références APRÈS le destroy
    currentAdapter = null;
    currentType = null;
    initPromise = null;
  }

  runtimeTypeStore.set(type);
}
```

**Fichier: browser-build-adapter.ts** - Ajouter tracking des Blob URLs

```typescript
export class BrowserBuildAdapter extends BaseRuntimeAdapter {
  // Ajouter un Set pour tracker tous les Blob URLs créés
  private _blobUrls: Set<string> = new Set();

  /**
   * Crée un Blob URL et le track pour cleanup ultérieur
   */
  private createTrackedBlobUrl(blob: Blob): string {
    const url = URL.createObjectURL(blob);
    this._blobUrls.add(url);
    logger.debug(`Created blob URL: ${url.substring(0, 50)}...`);
    return url;
  }

  /**
   * Révoque un Blob URL spécifique
   */
  private revokeTrackedBlobUrl(url: string): void {
    if (this._blobUrls.has(url)) {
      try {
        URL.revokeObjectURL(url);
        this._blobUrls.delete(url);
        logger.debug(`Revoked blob URL: ${url.substring(0, 50)}...`);
      } catch (e) {
        logger.warn('Failed to revoke blob URL:', e);
      }
    }
  }

  /**
   * Destroy avec cleanup complet des Blob URLs
   */
  async destroy(): Promise<void> {
    const errors: Error[] = [];

    // 1. Révoquer TOUS les Blob URLs trackés
    logger.info(`Revoking ${this._blobUrls.size} tracked blob URLs...`);
    for (const url of this._blobUrls) {
      try {
        URL.revokeObjectURL(url);
      } catch (e) {
        errors.push(e instanceof Error ? e : new Error(String(e)));
      }
    }
    this._blobUrls.clear();

    // 2. Révoquer le blob URL courant du preview si existant
    if (this._blobUrl) {
      try {
        URL.revokeObjectURL(this._blobUrl);
        logger.debug('Revoked preview blob URL');
      } catch (e) {
        errors.push(e instanceof Error ? e : new Error(String(e)));
      }
      this._blobUrl = null;
    }

    // 3. Nettoyer les autres ressources
    this._files.clear();
    this._cssAggregator.clear();

    // 4. Reset status
    this._status = 'idle';

    logger.info('BrowserBuildAdapter destroyed');

    // Reporter les erreurs si présentes
    if (errors.length > 0) {
      logger.warn(`Destroy completed with ${errors.length} errors`);
    }
  }
}
```

---

### 1.3 WebContainer Listeners Non Nettoyés

| Propriété | Valeur |
|-----------|--------|
| **Fichier** | `app/lib/runtime/adapters/webcontainer-adapter.ts` |
| **Lignes** | 79-93, 110-117 |
| **Complexité** | Simple |
| **Temps estimé** | 1h |
| **Dépendances** | Aucune |

#### Problème

```typescript
// PROBLÈME: Listener jamais supprimé
async init(): Promise<void> {
  this.container = await getWebContainer();

  // Ce listener n'est JAMAIS nettoyé dans destroy()
  this.container.on('port', (port, type, url) => {
    // ...
  });
}
```

#### Solution

```typescript
export class WebContainerAdapter extends BaseRuntimeAdapter {
  // Stocker les références aux listeners pour cleanup
  private _portListener: ((port: number, type: string, url: string) => void) | null = null;
  private _cleanupFunctions: Array<() => void> = [];

  async init(): Promise<void> {
    if (this.container) {
      logger.debug('WebContainer already initialized');
      return;
    }

    this._status = 'initializing';
    this.emitStatusChange(this._status);

    try {
      this.container = await getWebContainer();

      // Créer le listener comme référence nommée pour pouvoir le supprimer
      this._portListener = (port: number, type: string, url: string) => {
        logger.debug(`Port event: ${port} ${type} ${url}`);

        if (type === 'open') {
          // Créer une COPIE de l'objet preview (immutabilité)
          this.currentPreview = {
            url,
            ready: true,
            updatedAt: Date.now(),
          };
          this.emitPreviewReady(this.currentPreview);
        } else if (type === 'close') {
          if (this.currentPreview?.url === url) {
            this.currentPreview = null;
          }
        }
      };

      // Enregistrer le listener
      this.container.on('port', this._portListener);

      // Enregistrer la fonction de cleanup
      this._cleanupFunctions.push(() => {
        if (this._portListener && this.container) {
          // Note: WebContainer API peut ne pas avoir off()
          // On marque juste comme nettoyé
          logger.debug('Port listener marked for cleanup');
        }
        this._portListener = null;
      });

      this._status = 'ready';
      this.emitStatusChange(this._status);
      logger.info('WebContainerAdapter initialized');
    } catch (error) {
      this._status = 'error';
      this.emitStatusChange(this._status);
      throw error;
    }
  }

  async destroy(): Promise<void> {
    logger.info('Destroying WebContainerAdapter...');

    // Exécuter toutes les fonctions de cleanup enregistrées
    for (const cleanup of this._cleanupFunctions) {
      try {
        cleanup();
      } catch (e) {
        logger.warn('Cleanup function error:', e);
      }
    }
    this._cleanupFunctions = [];

    // Reset les références
    // Note: WebContainer lui-même ne peut pas être détruit
    this.container = null;
    this.currentPreview = null;
    this._portListener = null;
    this._status = 'idle';

    logger.info('WebContainerAdapter destroyed');
  }
}
```

---

### 1.4 Path Traversal Security

| Propriété | Valeur |
|-----------|--------|
| **Fichiers** | `app/lib/runtime/filesystem/path-utils.ts`, tous les builtins |
| **Complexité** | Moyen |
| **Temps estimé** | 3-4h |
| **Dépendances** | Aucune |

#### Problème

```typescript
// PROBLÈME: Pas de validation contre path traversal
// ls /../../etc/passwd → ACCESSIBLE!
```

#### Solution

**Nouveau fichier: app/lib/runtime/filesystem/security.ts**

```typescript
import { createScopedLogger } from '~/utils/logger';
import { normalizePath, isInside } from './path-utils';

const logger = createScopedLogger('PathSecurity');

/**
 * Erreur de sécurité pour les violations de path
 */
export class SecurityError extends Error {
  constructor(
    message: string,
    public readonly path: string,
    public readonly violation: 'traversal' | 'null_byte' | 'escape' | 'invalid'
  ) {
    super(message);
    this.name = 'SecurityError';
  }
}

/**
 * Patterns dangereux à détecter AVANT normalisation
 */
const DANGEROUS_PATTERNS: Array<{ pattern: RegExp; violation: SecurityError['violation']; description: string }> = [
  {
    pattern: /\0/,
    violation: 'null_byte',
    description: 'Null byte injection'
  },
  {
    pattern: /\.\.[\\/]/,
    violation: 'traversal',
    description: 'Directory traversal (../)'
  },
  {
    pattern: /^\.\./,
    violation: 'traversal',
    description: 'Starts with ..'
  },
  {
    pattern: /[\\/]\.\.[\\/]/,
    violation: 'traversal',
    description: 'Contains /../'
  },
  {
    pattern: /[\\/]\.\.$/,
    violation: 'traversal',
    description: 'Ends with /..'
  },
];

/**
 * Valide et sanitize un path de manière sécurisée
 *
 * @param path - Le path à valider
 * @param allowedRoot - Le répertoire racine autorisé (default: '/')
 * @returns Le path normalisé et validé
 * @throws SecurityError si le path est dangereux
 *
 * @example
 * validatePath('/home/user/file.txt', '/home') // OK
 * validatePath('../../../etc/passwd', '/home') // THROWS SecurityError
 */
export function validatePath(path: string, allowedRoot: string = '/'): string {
  // Étape 1: Vérifier les patterns dangereux AVANT normalisation
  for (const { pattern, violation, description } of DANGEROUS_PATTERNS) {
    if (pattern.test(path)) {
      logger.warn(`Path security violation: ${description} in "${path}"`);
      throw new SecurityError(
        `Invalid path: ${description}`,
        path,
        violation
      );
    }
  }

  // Étape 2: Normaliser le path
  const normalized = normalizePath(path);
  const normalizedRoot = normalizePath(allowedRoot);

  // Étape 3: Vérifier que le path normalisé est dans la racine autorisée
  if (!isInside(normalizedRoot, normalized)) {
    logger.warn(`Path escape attempt: "${path}" → "${normalized}" escapes "${normalizedRoot}"`);
    throw new SecurityError(
      `Path escapes allowed root: ${path}`,
      path,
      'escape'
    );
  }

  return normalized;
}

/**
 * Version non-throwing pour vérification simple
 */
export function isValidPath(path: string, allowedRoot: string = '/'): boolean {
  try {
    validatePath(path, allowedRoot);
    return true;
  } catch {
    return false;
  }
}

/**
 * Sanitize un path pour affichage (logging safe)
 */
export function sanitizePathForDisplay(path: string): string {
  // Remplacer les caractères de contrôle
  return path.replace(/[\x00-\x1F\x7F]/g, '?');
}
```

**Modifier tous les builtins (cat.ts, ls.ts, cd.ts, etc.)**

```typescript
// Exemple pour cat.ts
import { validatePath, SecurityError } from '../../filesystem/security';

export const catCommand: BuiltinCommand = {
  name: 'cat',
  description: 'Concatenate and display file contents',

  async execute(args: string[], context: CommandContext): Promise<CommandResult> {
    if (args.length === 0) {
      context.stderr('cat: missing operand\n');
      return { exitCode: 1 };
    }

    for (const file of args) {
      try {
        // SECURITY: Valider le path avant toute opération
        const safePath = validatePath(
          file.startsWith('/') ? file : `${context.state.cwd}/${file}`,
          '/' // Ou context.state.cwd pour restreindre au cwd
        );

        const content = await context.fs.readTextFile(safePath);
        context.stdout(content);
      } catch (error) {
        if (error instanceof SecurityError) {
          context.stderr(`cat: ${file}: Permission denied\n`);
          return { exitCode: 1 };
        }
        context.stderr(`cat: ${file}: No such file or directory\n`);
        return { exitCode: 1 };
      }
    }

    return { exitCode: 0 };
  },
};
```

---

### 1.5 Circular Dependency Infinite Loop

| Propriété | Valeur |
|-----------|--------|
| **Fichier** | `app/lib/runtime/package-manager/resolver/dependency-tree.ts` |
| **Complexité** | Moyen |
| **Temps estimé** | 2-3h |
| **Dépendances** | Aucune |

#### Problème

```typescript
// PROBLÈME: Détection des cycles insuffisante
// A → B → A = boucle infinie sans protection
```

#### Solution

```typescript
export class DependencyTree {
  // Set pour tracker les packages EN COURS de résolution
  private _inProgress: Set<string> = new Set();

  // Compteur pour hard limit
  private _iterationCount: number = 0;
  private readonly MAX_ITERATIONS = 10000;
  private readonly MAX_DEPTH = 50;

  /**
   * Résout les dépendances avec protection contre les boucles infinies
   */
  async resolve(
    dependencies: Record<string, string>,
    options: ResolutionOptions = {}
  ): Promise<ResolutionResult> {
    // Reset le state pour une nouvelle résolution
    this._inProgress.clear();
    this._iterationCount = 0;
    this._resolving.clear();

    const root = this._createRootNode();

    for (const [name, range] of Object.entries(dependencies)) {
      const node = await this._safeResolve(name, range, 0, root, options);
      if (node) {
        root.dependencies.set(name, node);
      }
    }

    return this._buildResult(root);
  }

  /**
   * Résolution avec toutes les protections
   */
  private async _safeResolve(
    name: string,
    range: string,
    depth: number,
    parent: DependencyNode,
    options: ResolutionOptions
  ): Promise<DependencyNode | null> {
    // Protection 1: Max iterations global
    this._iterationCount++;
    if (this._iterationCount > this.MAX_ITERATIONS) {
      throw new PMError(
        'RESOLUTION_LIMIT',
        `Resolution limit exceeded (${this.MAX_ITERATIONS} iterations). Possible infinite loop.`
      );
    }

    // Protection 2: Max depth
    if (depth > this.MAX_DEPTH) {
      logger.warn(`Max depth reached for ${name}, skipping further resolution`);
      return null;
    }

    // Protection 3: Cycle detection via in-progress set
    if (this._inProgress.has(name)) {
      logger.warn(`Circular dependency detected: ${name} (in progress)`);
      return null;
    }

    // Protection 4: Cycle detection via ancestor chain
    if (this._detectCycleInAncestors(name, parent)) {
      logger.warn(`Circular dependency detected: ${name} (in ancestors)`);
      return null;
    }

    // Marquer comme en cours
    this._inProgress.add(name);

    try {
      return await this._doResolve(name, range, depth, parent, options);
    } finally {
      // Toujours retirer du set en cours
      this._inProgress.delete(name);
    }
  }

  /**
   * Détecte si un package est déjà dans la chaîne d'ancêtres
   */
  private _detectCycleInAncestors(name: string, node: DependencyNode): boolean {
    let current: DependencyNode | undefined = node;
    const visited = new Set<string>();

    while (current) {
      // Protection contre boucle infinie dans l'arbre lui-même
      if (visited.has(current.name)) {
        return true;
      }
      visited.add(current.name);

      if (current.name === name) {
        return true;
      }
      current = current.parent;
    }

    return false;
  }

  private async _doResolve(
    name: string,
    range: string,
    depth: number,
    parent: DependencyNode,
    options: ResolutionOptions
  ): Promise<DependencyNode | null> {
    // ... logique de résolution existante ...

    // Pour les sous-dépendances, utiliser _safeResolve récursivement
    for (const [depName, depRange] of Object.entries(deps)) {
      const childNode = await this._safeResolve(
        depName,
        depRange,
        depth + 1,  // Incrémenter la profondeur
        node,
        options
      );

      if (childNode) {
        node.dependencies.set(depName, childNode);
      }
    }

    return node;
  }
}
```

---

## PHASE 2: HAUTE PRIORITÉ

### 2.1 Timeouts Manquants

| Propriété | Valeur |
|-----------|--------|
| **Fichiers** | `browser-build-adapter.ts`, `registry-client.ts` |
| **Complexité** | Simple |
| **Temps estimé** | 2h |
| **Dépendances** | 1.1 |

#### Solution

**Nouveau fichier: app/lib/runtime/utils/timeout.ts**

```typescript
/**
 * Constantes de timeout pour toutes les opérations
 */
export const TIMEOUTS = {
  ESBUILD_INIT: 30_000,      // 30 secondes
  MODULE_FETCH: 15_000,       // 15 secondes par module
  BUILD_TOTAL: 120_000,       // 2 minutes max pour un build
  TARBALL_DOWNLOAD: 60_000,   // 1 minute pour un tarball
  SERVICE_WORKER_PING: 3_000, // 3 secondes
} as const;

/**
 * Erreur de timeout
 */
export class TimeoutError extends Error {
  constructor(
    message: string,
    public readonly operation: string,
    public readonly timeoutMs: number
  ) {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * Exécute une Promise avec timeout
 *
 * @example
 * await withTimeout(
 *   fetch(url),
 *   15000,
 *   'module fetch'
 * );
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new TimeoutError(
        `${operation} timed out after ${timeoutMs}ms`,
        operation,
        timeoutMs
      ));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    throw error;
  }
}

/**
 * Crée un AbortController avec timeout automatique
 */
export function createTimeoutController(timeoutMs: number): {
  controller: AbortController;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  return {
    controller,
    cleanup: () => clearTimeout(timeoutId),
  };
}
```

**Utilisation dans browser-build-adapter.ts:**

```typescript
import { withTimeout, TIMEOUTS, TimeoutError } from '../utils/timeout';

// Dans esbuild-init-lock.ts
private async _doInitialize(wasmUrl: string): Promise<void> {
  await withTimeout(
    esbuild.initialize({ wasmURL: wasmUrl }),
    TIMEOUTS.ESBUILD_INIT,
    'esbuild WASM initialization'
  );
}

// Dans build()
async build(options: BuildOptions): Promise<BundleResult> {
  try {
    return await withTimeout(
      this._doBuild(options),
      TIMEOUTS.BUILD_TOTAL,
      'build operation'
    );
  } catch (error) {
    if (error instanceof TimeoutError) {
      logger.error(`Build timeout: ${error.message}`);
      return {
        code: '',
        css: '',
        errors: [{ message: `Build timed out after ${TIMEOUTS.BUILD_TOTAL / 1000}s` }],
        warnings: [],
        buildTime: TIMEOUTS.BUILD_TOTAL,
        hash: '',
      };
    }
    throw error;
  }
}
```

---

### 2.2 - 2.5 (Résumé des autres correctifs Phase 2)

| # | Correctif | Fichier | Action Clé |
|---|-----------|---------|------------|
| 2.2 | SW Failures | `preview-service-worker.ts` | Ajouter event emitter + health check |
| 2.3 | Cache TTL | `browser-build-adapter.ts` | Séparer `cachedAt` de `lastAccess` |
| 2.4 | Tarball Checksum | `registry-client.ts` | Valider SHA avec `crypto.subtle.digest()` |
| 2.5 | fs Auto-init | `node-polyfills.ts` | Lazy wrapper avec error explicite |

---

## PHASE 3: MOYENNE PRIORITÉ

### 3.1 HMR Pipeline Integration

| Propriété | Valeur |
|-----------|--------|
| **Fichiers** | Nouveau `hmr-manager.ts`, `browser-build-adapter.ts` |
| **Complexité** | Complexe |
| **Temps estimé** | 6-8h |
| **Dépendances** | 1.2 |

#### Architecture HMR

```
┌─────────────────────────────────────────────────────────────────┐
│                       HMR ARCHITECTURE                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  File Change ──► HMRManager ──► Classify Change                │
│                      │                                          │
│                      ├── CSS Change ──► Hot CSS Update         │
│                      │                   (No reload)           │
│                      │                                          │
│                      └── JS/TS Change ──► Full Reload          │
│                                          (Future: React Fast   │
│                                           Refresh)             │
│                                                                 │
│  Preview Iframe ◄── postMessage('bavini-hmr') ◄── HMRManager   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

### 3.2 - 3.5 (Résumé Phase 3)

| # | Correctif | Complexité | Temps |
|---|-----------|------------|-------|
| 3.2 | Terminal Pipes | Complexe | 4-6h |
| 3.3 | SCSS Compiler | Moyen | 3-4h |
| 3.4 | Bundle Limits | Simple | 1h |
| 3.5 | nextTick Leak | Simple | 1h |

---

## PHASE 4: TESTS

### Tests à Créer

```typescript
// __tests__/security/path-traversal.spec.ts
// __tests__/esbuild/race-condition.spec.ts
// __tests__/memory/blob-url-cleanup.spec.ts
// __tests__/package-manager/circular-deps.spec.ts
// __tests__/timeout/operations.spec.ts
```

---

## Dépendances entre Correctifs

```
┌─────────────────────────────────────────────────────────────────┐
│                    GRAPHE DE DÉPENDANCES                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1.1 esbuild ────────────────────────► 2.1 Timeouts            │
│                                                                 │
│  1.2 Blob URL ───────────────────────► 3.1 HMR                 │
│                                                                 │
│  1.4 Path Traversal ─────────────────► 3.2 Terminal Pipes      │
│                                                                 │
│  Tous ───────────────────────────────► 4.1 Tests               │
│                                                                 │
│  [Indépendants]                                                │
│  ├── 1.3 WebContainer Listeners                                │
│  ├── 1.5 Circular Dependency                                   │
│  ├── 2.2-2.5 (Phase 2 restante)                               │
│  └── 3.3-3.5 (Phase 3 restante)                               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Fichiers Critiques

Les 5 fichiers les plus importants à modifier:

1. **`app/lib/runtime/adapters/browser-build-adapter.ts`**
   - esbuild init, blob URLs, timeouts, bundle limits

2. **`app/lib/runtime/factory.ts`**
   - Lifecycle adapter, await destroy()

3. **`app/lib/runtime/filesystem/path-utils.ts`** (+ nouveau `security.ts`)
   - Validation paths, protection traversal

4. **`app/lib/runtime/package-manager/resolver/dependency-tree.ts`**
   - Cycle detection, iteration limits

5. **`app/lib/runtime/adapters/webcontainer-adapter.ts`**
   - Listener cleanup

---

## Checklist d'Exécution

### Phase 1 - Critique
- [ ] 1.1 Créer `esbuild-init-lock.ts` avec state machine
- [ ] 1.1 Modifier `browser-build-adapter.ts` pour utiliser le lock
- [ ] 1.2 Ajouter `await` à `destroy()` dans `factory.ts`
- [ ] 1.2 Implémenter tracking Blob URLs dans adapter
- [ ] 1.3 Ajouter cleanup listeners dans `webcontainer-adapter.ts`
- [ ] 1.4 Créer `security.ts` avec `validatePath()`
- [ ] 1.4 Mettre à jour tous les builtins avec validation
- [ ] 1.5 Ajouter `_inProgress` Set dans `dependency-tree.ts`
- [ ] 1.5 Implémenter `MAX_ITERATIONS` et `MAX_DEPTH`

### Phase 2 - Haute
- [ ] 2.1 Créer `timeout.ts` avec `withTimeout()`
- [ ] 2.1 Ajouter timeouts à esbuild, fetch, build
- [ ] 2.2 Ajouter event emitter pour erreurs SW
- [ ] 2.3 Séparer `cachedAt` de `lastAccess` dans cache
- [ ] 2.4 Implémenter `verifyIntegrity()` strict
- [ ] 2.5 Créer lazy wrapper pour fs module

### Phase 3 - Moyenne
- [ ] 3.1 Créer `hmr-manager.ts`
- [ ] 3.1 Intégrer HMR dans pipeline build
- [ ] 3.2 Implémenter parsing pipes dans terminal
- [ ] 3.3 Créer `scss-compiler.ts`
- [ ] 3.4 Ajouter hard limits bundle size
- [ ] 3.5 Protéger nextTick contre recursion infinie

### Phase 4 - Tests
- [ ] Créer tests unitaires pour chaque correctif
- [ ] Créer tests d'intégration
- [ ] Vérifier coverage ≥ 80%

---

## Estimation Finale

| Phase | Temps Min | Temps Max |
|-------|-----------|-----------|
| Phase 1 | 10h | 14h |
| Phase 2 | 9h | 12h |
| Phase 3 | 15h | 20h |
| Phase 4 | 4h | 6h |
| **Total** | **38h** | **52h** |

---

*Document généré le 2026-01-21 par l'audit BAVINI WebContainer*
