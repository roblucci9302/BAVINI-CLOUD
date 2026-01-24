# BAVINI - Roadmap vers l'Excellence

> **Version**: 1.0
> **Créé le**: 2026-01-24
> **Objectif**: Transformer BAVINI en leader du marché des plateformes de développement IA
> **Score actuel**: 68/100 → **Score cible**: 90/100

---

## Table des Matières

1. [Vue d'Ensemble](#1-vue-densemble)
2. [Phase 0 : Quick Wins Immédiats](#2-phase-0--quick-wins-immédiats-1-semaine)
3. [Phase 1 : Fondations Solides](#3-phase-1--fondations-solides-4-6-semaines)
4. [Phase 2 : Différenciation](#4-phase-2--différenciation-2-3-mois)
5. [Phase 3 : Domination](#5-phase-3--domination-6-mois)
6. [Annexes Techniques](#6-annexes-techniques)

---

## 1. Vue d'Ensemble

### 1.1 Problèmes Critiques à Résoudre

| Priorité | Problème | Impact UX | Effort |
|----------|----------|-----------|--------|
| 🔴 P0 | Builds sur main thread | UI freeze | 1 sem |
| 🔴 P0 | Pas de verify post-fix | Fix-and-break | 3 jours |
| 🔴 P0 | Rollback désactivé | Pas de recovery | 1 heure |
| 🔴 P0 | CDN sequential fetches | npm lent (15-20s) | 2 jours |
| 🔴 P0 | Vitest cassé | Pas de CI/CD | 1 jour |
| 🟡 P1 | 7 mega-fichiers | Maintenabilité | 2 sem |
| 🟡 P1 | Pas de builds incrémentaux | Rebuilds lents | 1 sem |
| 🟡 P1 | Context accumulation | OOM | 3 jours |

### 1.2 Timeline Globale

```
Semaine 1     : Phase 0 - Quick Wins (Vitest, rollback, batch CDN)
Semaine 2-3   : Phase 1.1 - Build Worker + Verify Loop
Semaine 4-5   : Phase 1.2 - Refactoring mega-fichiers
Semaine 6-8   : Phase 1.3 - Builds incrémentaux + Context optimization
Mois 2-3      : Phase 2 - Différenciation (self-testing, innovations)
Mois 4-6      : Phase 3 - Domination (enterprise, écosystème)
```

### 1.3 Métriques de Succès

| Métrique | Actuel | Cible Phase 1 | Cible Finale |
|----------|--------|---------------|--------------|
| Boot time | ~4s | <2s | <1.5s |
| First preview | ~7s | <4s | <3s |
| Build (React) | ~5s | <2s | <1s |
| npm install (5 pkgs) | ~18s | <5s | <3s |
| Fix success rate | ~60% | 85% | 95% |
| Memory usage | ~300MB | <200MB | <150MB |

---

## 2. Phase 0 : Quick Wins Immédiats (1 semaine)

### 2.1 Fix Vitest Configuration

**Objectif**: CI/CD opérationnel, tests exécutables

**Fichiers concernés**:
- `vitest.config.ts`
- `package.json`

**Tâches**:

```markdown
[ ] 2.1.1 Diagnostiquer l'erreur Vitest
    - Exécuter `pnpm test` et capturer l'erreur complète
    - Vérifier la compatibilité des versions (vitest, vite, @vitest/coverage-v8)

[ ] 2.1.2 Corriger la configuration
    - Mettre à jour vitest.config.ts
    - Vérifier les alias de paths
    - S'assurer que jsdom est bien configuré

[ ] 2.1.3 Valider la correction
    - Exécuter `pnpm test` (doit passer)
    - Exécuter `pnpm test:coverage` (doit générer un rapport)
    - Vérifier coverage > 70%
```

**Commande Claude Code**:
```bash
# Diagnostiquer
pnpm test 2>&1 | head -100

# Après fix, valider
pnpm test && pnpm test:coverage
```

---

### 2.2 Activer Rollback par Défaut

**Objectif**: Recovery automatique si un fix échoue

**Fichier**: `app/lib/agents/agents/fixer-agent.ts`

**Modification**:

```typescript
// AVANT (ligne ~149)
configureVerification({
  enabled: true,
  timeout: 60000,
  verifyTypes: ['typecheck', 'test', 'lint', 'build'],
  rollbackOnFailure: false,  // ❌ DANGEREUX
  maxRetries: 1
})

// APRÈS
configureVerification({
  enabled: true,
  timeout: 60000,
  verifyTypes: ['typecheck', 'test', 'lint', 'build'],
  rollbackOnFailure: true,   // ✅ SÉCURISÉ
  maxRetries: 3              // Plus de tentatives
})
```

**Tâches**:

```markdown
[ ] 2.2.1 Modifier fixer-agent.ts
    - Changer rollbackOnFailure: false → true
    - Changer maxRetries: 1 → 3

[ ] 2.2.2 Ajouter tests unitaires
    - Test: rollback se déclenche sur échec de verification
    - Test: snapshot créé avant fix
    - Test: restore fonctionne correctement
```

---

### 2.3 Batch CDN Fetches

**Objectif**: npm install 3-5x plus rapide

**Fichier**: `app/lib/runtime/adapters/plugins/esm-sh-plugin.ts`

**Approche**:

```typescript
// AVANT: Fetches séquentiels
for (const pkg of packages) {
  const content = await fetchFromCDN(pkg); // Séquentiel ❌
}

// APRÈS: Fetches parallèles
const contents = await Promise.all(
  packages.map(pkg => fetchFromCDN(pkg)) // Parallèle ✅
);
```

**Tâches**:

```markdown
[ ] 2.3.1 Identifier les points de fetch séquentiels
    - Grep pour 'fetch' dans esm-sh-plugin.ts
    - Identifier la boucle de résolution des dépendances

[ ] 2.3.2 Implémenter le batching
    - Collecter toutes les dépendances à résoudre
    - Utiliser Promise.all() pour fetches parallèles
    - Gérer les erreurs individuelles (Promise.allSettled si nécessaire)

[ ] 2.3.3 Ajouter cache warming
    - Pré-fetch les dépendances courantes (react, react-dom, etc.)
    - Utiliser un cache LRU plus agressif

[ ] 2.3.4 Mesurer l'amélioration
    - Benchmark avant: npm install de 5 packages
    - Benchmark après: même test
    - Objectif: 15s → <5s
```

**Code de référence**:

```typescript
// app/lib/runtime/adapters/plugins/esm-sh-plugin.ts

class EsmShPlugin {
  private pendingFetches: Map<string, Promise<string>> = new Map();

  async batchResolve(packages: string[]): Promise<Map<string, string>> {
    const results = new Map<string, string>();
    const toFetch: string[] = [];

    // Check cache first
    for (const pkg of packages) {
      const cached = moduleCache.get(pkg);
      if (cached) {
        results.set(pkg, cached);
      } else if (this.pendingFetches.has(pkg)) {
        // Already fetching, wait for it
        results.set(pkg, await this.pendingFetches.get(pkg)!);
      } else {
        toFetch.push(pkg);
      }
    }

    // Batch fetch remaining
    if (toFetch.length > 0) {
      const fetchPromises = toFetch.map(async (pkg) => {
        const promise = this.fetchSingle(pkg);
        this.pendingFetches.set(pkg, promise);

        try {
          const content = await promise;
          moduleCache.set(pkg, content);
          return { pkg, content, success: true };
        } catch (error) {
          return { pkg, error, success: false };
        } finally {
          this.pendingFetches.delete(pkg);
        }
      });

      const fetchResults = await Promise.all(fetchPromises);

      for (const result of fetchResults) {
        if (result.success) {
          results.set(result.pkg, result.content);
        }
      }
    }

    return results;
  }
}
```

---

### 2.4 Implémenter Verify Loop Post-Fix

**Objectif**: Éliminer le cycle "fix-and-break"

**Fichier**: `app/routes/api.agent.ts`

**Architecture cible**:

```
Fix Request → Fixer Agent → Verification → Success?
                                ↓ No
                          Re-analyze errors
                                ↓
                          Fixer Agent (retry)
                                ↓
                          Max retries? → Rollback
```

**Tâches**:

```markdown
[ ] 2.4.1 Créer la fonction runAutoFixWithVerification
    - Wrapper autour de runAutoFixPipeline existant
    - Ajouter boucle de retry (max 3)
    - Ajouter verification après chaque fix

[ ] 2.4.2 Implémenter la verification
    - Run build (via workbench)
    - Check pour nouvelles erreurs
    - Comparer avec erreurs initiales

[ ] 2.4.3 Implémenter le rollback
    - Capturer snapshot avant fix
    - Restore si max retries atteint
    - Notifier l'utilisateur

[ ] 2.4.4 Ajouter métriques
    - Nombre de retries moyen
    - Taux de succès après verification
    - Temps moyen de résolution
```

**Code d'implémentation**:

```typescript
// app/routes/api.agent.ts

interface VerificationResult {
  success: boolean;
  errors: DetectedError[];
  buildOutput?: string;
}

interface FixAttemptResult {
  success: boolean;
  attempts: number;
  finalErrors: DetectedError[];
  rolledBack: boolean;
}

async function runAutoFixWithVerification(
  controller: ReadableStreamDefaultController,
  initialErrors: DetectedError[],
  agentOutput: string,
  options: {
    maxRetries?: number;
    enableRollback?: boolean;
  } = {}
): Promise<FixAttemptResult> {
  const { maxRetries = 3, enableRollback = true } = options;
  const logger = createScopedLogger('VerifiedFix');

  // 1. Create snapshot for potential rollback
  let snapshot: FileSnapshot | null = null;
  if (enableRollback) {
    snapshot = await createFileSnapshot();
    logger.debug('Snapshot created for rollback');
  }

  let currentErrors = initialErrors;
  let attempts = 0;

  while (attempts < maxRetries && currentErrors.length > 0) {
    attempts++;
    logger.info(`Fix attempt ${attempts}/${maxRetries}`);

    // 2. Notify user
    controller.enqueue(
      encoder.encode(formatDataStreamPart('text',
        `\n\n🔧 Tentative de correction ${attempts}/${maxRetries}...\n`
      ))
    );

    // 3. Run fixer agent
    await runAutoFixPipeline(controller, currentErrors, agentOutput);

    // 4. Verify the fix
    const verification = await runVerification();

    if (verification.success) {
      controller.enqueue(
        encoder.encode(formatDataStreamPart('text',
          `\n✅ Correction vérifiée avec succès!\n`
        ))
      );

      return {
        success: true,
        attempts,
        finalErrors: [],
        rolledBack: false
      };
    }

    // 5. Update errors for next iteration
    currentErrors = verification.errors;
    logger.warn(`Verification failed, ${currentErrors.length} errors remaining`);
  }

  // 6. Max retries reached - rollback if enabled
  if (enableRollback && snapshot) {
    logger.warn('Max retries reached, rolling back');
    await restoreSnapshot(snapshot);

    controller.enqueue(
      encoder.encode(formatDataStreamPart('text',
        `\n⚠️ Correction automatique échouée après ${maxRetries} tentatives. ` +
        `Rollback effectué. Intervention manuelle requise.\n`
      ))
    );

    return {
      success: false,
      attempts,
      finalErrors: currentErrors,
      rolledBack: true
    };
  }

  return {
    success: false,
    attempts,
    finalErrors: currentErrors,
    rolledBack: false
  };
}

async function runVerification(): Promise<VerificationResult> {
  const logger = createScopedLogger('Verification');

  try {
    // Trigger build
    const buildResult = await workbenchStore.triggerBuild();

    // Check for errors in build output
    const errors = detectErrorsInOutput(buildResult.output || '');

    return {
      success: errors.length === 0 && buildResult.success,
      errors,
      buildOutput: buildResult.output
    };
  } catch (error) {
    logger.error('Verification failed:', error);
    return {
      success: false,
      errors: [{
        type: 'build',
        message: error instanceof Error ? error.message : 'Unknown error',
        severity: 'error'
      }]
    };
  }
}

async function createFileSnapshot(): Promise<FileSnapshot> {
  const files = browserFilesStore.files.get();
  return {
    timestamp: Date.now(),
    files: new Map(Object.entries(files))
  };
}

async function restoreSnapshot(snapshot: FileSnapshot): Promise<void> {
  for (const [path, content] of snapshot.files) {
    await browserFilesStore.writeFile(path, content);
  }
}
```

---

## 3. Phase 1 : Fondations Solides (4-6 semaines)

### 3.1 Build Worker (Semaine 2-3)

**Objectif**: UI reste responsive pendant les builds

**Architecture cible**:

```
Main Thread                    Build Worker
     │                              │
     │  postMessage({               │
     │    type: 'BUILD',            │
     │    files: Map<path,content>  │
     │  })                          │
     │ ─────────────────────────────>
     │                              │
     │                         esbuild.build()
     │                         (peut prendre 5s+)
     │                              │
     │  onmessage({                 │
     │    type: 'BUILD_RESULT',     │
     │    bundle: string,           │
     │    css: string               │
     │  })                          │
     │ <─────────────────────────────
     │                              │
     ▼                              ▼
```

**Fichiers à créer/modifier**:

```
app/workers/
└── build.worker.ts          # NOUVEAU

app/lib/runtime/
├── browser-build-service.ts  # MODIFIER
└── adapters/
    └── browser-build-adapter.ts  # EXTRAIRE
```

**Tâches**:

```markdown
[ ] 3.1.1 Créer le worker de build
    Fichier: app/workers/build.worker.ts
    - Initialiser esbuild-wasm dans le worker
    - Gérer les messages BUILD/BUILD_RESULT
    - Implémenter error handling robuste

[ ] 3.1.2 Extraire la logique de build dans un module portable
    - Créer app/lib/runtime/build/bundler.ts
    - Déplacer esbuild config et plugins
    - S'assurer que le code fonctionne dans un worker

[ ] 3.1.3 Modifier BrowserBuildService pour utiliser le worker
    - Créer le worker dans init()
    - Remplacer appels directs par postMessage
    - Gérer les callbacks via onmessage

[ ] 3.1.4 Ajouter fallback si worker non disponible
    - Détecter si workers supportés
    - Fallback sur main thread si nécessaire
    - Logger le mode utilisé

[ ] 3.1.5 Tester la réactivité UI
    - Créer test de stress (100 fichiers)
    - Vérifier que UI reste responsive
    - Mesurer FPS pendant build
```

**Code du Worker**:

```typescript
// app/workers/build.worker.ts

import * as esbuild from 'esbuild-wasm';

interface BuildMessage {
  type: 'INIT' | 'BUILD' | 'DISPOSE';
  id?: string;
  files?: Record<string, string>;
  entryPoint?: string;
  options?: BuildOptions;
}

interface BuildResult {
  type: 'INIT_DONE' | 'BUILD_RESULT' | 'BUILD_ERROR';
  id?: string;
  bundle?: string;
  css?: string;
  error?: string;
  warnings?: string[];
}

let initialized = false;

self.onmessage = async (event: MessageEvent<BuildMessage>) => {
  const { type, id, files, entryPoint, options } = event.data;

  try {
    switch (type) {
      case 'INIT':
        if (!initialized) {
          await esbuild.initialize({
            wasmURL: 'https://unpkg.com/esbuild-wasm@0.27.2/esbuild.wasm',
            worker: false // Nous sommes déjà dans un worker
          });
          initialized = true;
        }
        self.postMessage({ type: 'INIT_DONE' } as BuildResult);
        break;

      case 'BUILD':
        if (!initialized) {
          throw new Error('esbuild not initialized');
        }

        const result = await runBuild(files!, entryPoint!, options);

        self.postMessage({
          type: 'BUILD_RESULT',
          id,
          bundle: result.outputFiles?.[0]?.text,
          css: result.outputFiles?.[1]?.text,
          warnings: result.warnings.map(w => w.text)
        } as BuildResult);
        break;

      case 'DISPOSE':
        // Cleanup if needed
        break;
    }
  } catch (error) {
    self.postMessage({
      type: 'BUILD_ERROR',
      id,
      error: error instanceof Error ? error.message : 'Unknown error'
    } as BuildResult);
  }
};

async function runBuild(
  files: Record<string, string>,
  entryPoint: string,
  options?: BuildOptions
): Promise<esbuild.BuildResult> {
  // Virtual filesystem plugin
  const virtualFsPlugin: esbuild.Plugin = {
    name: 'virtual-fs',
    setup(build) {
      build.onResolve({ filter: /.*/ }, args => {
        if (args.path.startsWith('./') || args.path.startsWith('../')) {
          const resolved = resolvePath(args.resolveDir, args.path);
          if (files[resolved]) {
            return { path: resolved, namespace: 'virtual' };
          }
        }
        // External packages - resolve via CDN
        if (!args.path.startsWith('.') && !args.path.startsWith('/')) {
          return {
            path: `https://esm.sh/${args.path}`,
            external: true
          };
        }
        return null;
      });

      build.onLoad({ filter: /.*/, namespace: 'virtual' }, args => {
        const content = files[args.path];
        if (content) {
          return {
            contents: content,
            loader: getLoader(args.path)
          };
        }
        return null;
      });
    }
  };

  return esbuild.build({
    entryPoints: [entryPoint],
    bundle: true,
    format: 'esm',
    target: 'es2020',
    jsx: 'automatic',
    jsxImportSource: 'react',
    write: false,
    plugins: [virtualFsPlugin],
    ...options
  });
}

function resolvePath(from: string, to: string): string {
  // Simple path resolution
  const fromParts = from.split('/').filter(Boolean);
  const toParts = to.split('/').filter(Boolean);

  for (const part of toParts) {
    if (part === '..') {
      fromParts.pop();
    } else if (part !== '.') {
      fromParts.push(part);
    }
  }

  return '/' + fromParts.join('/');
}

function getLoader(path: string): esbuild.Loader {
  const ext = path.split('.').pop()?.toLowerCase();
  const loaders: Record<string, esbuild.Loader> = {
    'ts': 'ts',
    'tsx': 'tsx',
    'js': 'js',
    'jsx': 'jsx',
    'css': 'css',
    'json': 'json'
  };
  return loaders[ext || ''] || 'text';
}
```

**Service modifié**:

```typescript
// app/lib/runtime/browser-build-service.ts (modifications)

class BrowserBuildService {
  private buildWorker: Worker | null = null;
  private pendingBuilds: Map<string, {
    resolve: (result: BuildResult) => void;
    reject: (error: Error) => void;
  }> = new Map();

  async init(): Promise<void> {
    // Try to create worker
    try {
      this.buildWorker = new Worker(
        new URL('../../../workers/build.worker.ts', import.meta.url),
        { type: 'module' }
      );

      this.buildWorker.onmessage = this.handleWorkerMessage.bind(this);
      this.buildWorker.onerror = this.handleWorkerError.bind(this);

      // Wait for init
      await this.sendToWorker({ type: 'INIT' });

      this.logger.info('Build worker initialized');
    } catch (error) {
      this.logger.warn('Worker not available, using main thread fallback');
      this.buildWorker = null;
    }
  }

  private handleWorkerMessage(event: MessageEvent<BuildResult>): void {
    const { type, id, bundle, css, error, warnings } = event.data;

    if (type === 'BUILD_RESULT' && id) {
      const pending = this.pendingBuilds.get(id);
      if (pending) {
        pending.resolve({ bundle, css, warnings });
        this.pendingBuilds.delete(id);
      }
    } else if (type === 'BUILD_ERROR' && id) {
      const pending = this.pendingBuilds.get(id);
      if (pending) {
        pending.reject(new Error(error));
        this.pendingBuilds.delete(id);
      }
    }
  }

  async build(files: Record<string, string>, entryPoint: string): Promise<BuildResult> {
    if (this.buildWorker) {
      // Use worker
      const id = crypto.randomUUID();

      return new Promise((resolve, reject) => {
        this.pendingBuilds.set(id, { resolve, reject });

        this.buildWorker!.postMessage({
          type: 'BUILD',
          id,
          files,
          entryPoint
        });

        // Timeout after 60s
        setTimeout(() => {
          if (this.pendingBuilds.has(id)) {
            this.pendingBuilds.delete(id);
            reject(new Error('Build timeout'));
          }
        }, 60000);
      });
    } else {
      // Fallback to main thread (existing code)
      return this.buildMainThread(files, entryPoint);
    }
  }
}
```

---

### 3.2 Refactoring Mega-Fichiers (Semaine 4-5)

**Objectif**: Tous les fichiers < 800 lignes

**Utiliser la commande Claude Code**:
```
/code-simplifier
```

#### 3.2.1 browser-build-adapter.ts (3,163 lignes → 6-8 modules)

**Structure cible**:

```
app/lib/runtime/build/
├── index.ts                    # Barrel exports
├── adapter.ts                  # BrowserBuildAdapter (300 lignes max)
├── bundler/
│   ├── index.ts
│   ├── esbuild-bundler.ts      # Configuration esbuild (400 lignes)
│   └── bundle-limits.ts        # Constantes et vérifications
├── transformers/
│   ├── index.ts
│   ├── jsx-transformer.ts      # Transformation JSX/TSX
│   └── import-rewriter.ts      # Réécriture des imports
├── preview/
│   ├── index.ts
│   ├── preview-manager.ts      # Gestion du preview (400 lignes)
│   ├── blob-preview.ts         # Mode Blob URL
│   ├── sw-preview.ts           # Mode Service Worker
│   └── srcdoc-preview.ts       # Mode srcdoc
├── css/
│   ├── index.ts
│   ├── css-aggregator.ts       # Agrégation CSS
│   └── tailwind-handler.ts     # Compilation Tailwind
└── hmr/
    ├── index.ts
    └── hmr-manager.ts          # Hot Module Replacement
```

**Tâches**:

```markdown
[ ] 3.2.1.1 Analyser les responsabilités actuelles
    - Mapper chaque section du fichier à un module
    - Identifier les dépendances entre sections
    - Documenter l'interface publique actuelle

[ ] 3.2.1.2 Créer la structure de dossiers
    mkdir -p app/lib/runtime/build/{bundler,transformers,preview,css,hmr}

[ ] 3.2.1.3 Extraire esbuild-bundler.ts
    - Configuration esbuild
    - Plugins factory
    - Build execution

[ ] 3.2.1.4 Extraire preview-manager.ts
    - Détection du mode (SW/Blob/srcdoc)
    - Création de preview
    - Cleanup des ressources

[ ] 3.2.1.5 Extraire css-aggregator.ts
    - Collecte CSS des frameworks
    - Agrégation
    - Tailwind JIT

[ ] 3.2.1.6 Extraire hmr-manager.ts
    - Classification des changements
    - Communication avec iframe
    - Debouncing

[ ] 3.2.1.7 Refactorer BrowserBuildAdapter
    - Orchestration des modules
    - Interface publique simplifiée
    - Max 300 lignes

[ ] 3.2.1.8 Mettre à jour les imports
    - Trouver tous les imports de browser-build-adapter
    - Mettre à jour vers le nouveau barrel export

[ ] 3.2.1.9 Tests de non-régression
    - Exécuter tous les tests existants
    - Ajouter tests d'intégration pour chaque module
```

#### 3.2.2 orchestrator.ts (1,542 lignes → 3-4 modules)

**Structure cible**:

```
app/lib/agents/orchestrator/
├── index.ts                    # Barrel exports
├── orchestrator.ts             # Classe principale (400 lignes max)
├── task-decomposer.ts          # Décomposition en sous-tâches
├── routing-engine.ts           # Décisions de routing
└── agent-coordinator.ts        # Coordination inter-agents
```

**Tâches**:

```markdown
[ ] 3.2.2.1 Extraire TaskDecomposer
    - Analyse de la complexité de tâche
    - Création de sous-tâches
    - Gestion des dépendances

[ ] 3.2.2.2 Extraire RoutingEngine
    - Cache de routing
    - Logique de décision (pattern matcher + LLM)
    - Fallback strategies

[ ] 3.2.2.3 Extraire AgentCoordinator
    - Communication avec agents
    - Gestion du circuit breaker
    - Métriques de performance

[ ] 3.2.2.4 Simplifier Orchestrator
    - Composition des modules extraits
    - Interface publique claire
```

#### 3.2.3 Chat.client.tsx (1,473 lignes → composants)

**Structure cible**:

```
app/components/chat/
├── index.ts
├── Chat.client.tsx             # Composant principal (300 lignes max)
├── hooks/
│   ├── index.ts
│   ├── useChatState.ts         # Gestion de l'état
│   ├── useChatActions.ts       # Actions (send, cancel, etc.)
│   ├── useMessageParser.ts     # Parsing des messages
│   └── useAutoScroll.ts        # Auto-scroll
├── components/
│   ├── MessageList.tsx         # Liste des messages
│   ├── MessageInput.tsx        # Input utilisateur
│   ├── MessageBubble.tsx       # Bulle de message
│   └── TypingIndicator.tsx     # Indicateur de frappe
└── utils/
    ├── formatters.ts           # Formatage des messages
    └── validators.ts           # Validation des inputs
```

#### 3.2.4 Autres fichiers à refactorer

```markdown
[ ] design-tools.ts (1,418 lignes)
    → Splitter par catégorie de tool (color, layout, typography)

[ ] astro-compiler.ts (1,341 lignes)
    → Extraire AST transforms, validators, code generators

[ ] git-tools.ts (1,170 lignes)
    → Splitter par opération (commit, branch, merge, etc.)

[ ] workbench.ts (1,166 lignes)
    → Extraire stores, file operations, preview management
```

---

### 3.3 Builds Incrémentaux (Semaine 6-7)

**Objectif**: Ne rebuilder que les modules affectés

**Architecture**:

```
File Change
     ↓
[DependencyGraph] Quels modules sont affectés?
     ↓
[IncrementalBuilder] Rebuild uniquement ces modules
     ↓
[BundleCache] Récupérer les modules non affectés du cache
     ↓
[Merge] Combiner pour le bundle final
```

**Fichiers à créer**:

```
app/lib/runtime/build/
├── dependency-graph.ts         # NOUVEAU
├── incremental-builder.ts      # NOUVEAU
└── bundle-cache.ts             # NOUVEAU
```

**Tâches**:

```markdown
[ ] 3.3.1 Implémenter DependencyGraph
    - Parser les imports de chaque fichier
    - Construire le graphe de dépendances
    - Méthode: getAffectedModules(changedFiles)

[ ] 3.3.2 Implémenter BundleCache
    - Cache LRU des modules compilés
    - Clé: hash du contenu du fichier
    - Invalidation automatique sur changement

[ ] 3.3.3 Implémenter IncrementalBuilder
    - Utiliser DependencyGraph pour déterminer quoi rebuilder
    - Récupérer les modules non affectés du cache
    - Merger pour le bundle final

[ ] 3.3.4 Intégrer dans BrowserBuildAdapter
    - Détecter si build incrémental possible
    - Fallback sur full build si nécessaire
    - Métriques de performance (cache hit rate)

[ ] 3.3.5 Optimiser pour les cas courants
    - CSS-only changes: hot reload sans rebuild JS
    - Single file changes: rebuild minimal
    - Config changes: full rebuild
```

**Code de référence**:

```typescript
// app/lib/runtime/build/dependency-graph.ts

interface DependencyNode {
  path: string;
  imports: Set<string>;      // Ce fichier importe
  importedBy: Set<string>;   // Ce fichier est importé par
  contentHash: string;
}

class DependencyGraph {
  private nodes: Map<string, DependencyNode> = new Map();

  async build(files: Record<string, string>): Promise<void> {
    this.nodes.clear();

    for (const [path, content] of Object.entries(files)) {
      const imports = this.parseImports(content);
      const hash = await this.hashContent(content);

      this.nodes.set(path, {
        path,
        imports: new Set(imports),
        importedBy: new Set(),
        contentHash: hash
      });
    }

    // Build reverse dependencies
    for (const [path, node] of this.nodes) {
      for (const imp of node.imports) {
        const importedNode = this.nodes.get(imp);
        if (importedNode) {
          importedNode.importedBy.add(path);
        }
      }
    }
  }

  getAffectedModules(changedFiles: string[]): Set<string> {
    const affected = new Set<string>();
    const queue = [...changedFiles];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (affected.has(current)) continue;

      affected.add(current);

      const node = this.nodes.get(current);
      if (node) {
        for (const dependant of node.importedBy) {
          queue.push(dependant);
        }
      }
    }

    return affected;
  }

  private parseImports(content: string): string[] {
    const importRegex = /import\s+.*?\s+from\s+['"]([^'"]+)['"]/g;
    const imports: string[] = [];
    let match;

    while ((match = importRegex.exec(content)) !== null) {
      const importPath = match[1];
      if (importPath.startsWith('.')) {
        imports.push(importPath);
      }
    }

    return imports;
  }

  private async hashContent(content: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
}
```

---

### 3.4 Context Optimization (Semaine 8)

**Objectif**: Éviter les OOM sur sessions longues

**Approche**:

```
Messages accumulating
         ↓
Token count > 80% threshold?
         ↓ Yes
Summarize old messages (keep last 10)
         ↓
Inject summary as system context
         ↓
Continue with reduced context
```

**Tâches**:

```markdown
[ ] 3.4.1 Améliorer le context manager existant
    - Détecter automatiquement quand summarize nécessaire
    - Préserver les informations critiques (fichiers modifiés, erreurs)
    - Ajouter métriques de compression

[ ] 3.4.2 Implémenter context pruning pour agents
    - Limiter le contexte passé entre agents
    - Extraire uniquement les informations pertinentes
    - Éviter l'accumulation dans les chaînes d'agents

[ ] 3.4.3 Ajouter observabilité
    - Dashboard token usage
    - Alertes quand context > 70%
    - Historique des summarizations
```

---

## 4. Phase 2 : Différenciation (2-3 mois)

### 4.1 Zero Fix-and-Break Guarantee

**Objectif**: Être le premier à garantir que les fixes ne cassent rien

**Implémentation complète**:

```markdown
[ ] 4.1.1 Créer VerifiedFixPipeline class
    - Orchestration fix → verify → retry
    - Gestion des snapshots
    - Métriques de succès

[ ] 4.1.2 Intégrer avec les 3 agents QA
    - Fixer: applique les corrections
    - Tester: valide les tests passent
    - Reviewer: vérifie pas de régressions

[ ] 4.1.3 Implémenter smart rollback
    - Rollback granulaire (par fichier)
    - Préserver les changements validés
    - Notifier l'utilisateur

[ ] 4.1.4 Ajouter métriques marketing
    - "98% des fixes réussis du premier coup"
    - Temps moyen de résolution
    - Comparaison avec industrie
```

### 4.2 Browser Self-Testing (comme Replit Agent 3)

**Objectif**: Tester l'app comme un vrai utilisateur

**Architecture**:

```
Generated App
      ↓
[Puppeteer/Playwright in Worker]
      ↓
Navigate, Click, Type, Assert
      ↓
Test Results → Fixer if needed
```

**Tâches**:

```markdown
[ ] 4.2.1 Intégrer Puppeteer/Playwright léger
    - Utiliser puppeteer-core
    - Connecter au preview iframe
    - Sandboxer les tests

[ ] 4.2.2 Créer TesterAgent avec browser automation
    - Générer scénarios de test automatiquement
    - Exécuter les tests
    - Reporter les échecs

[ ] 4.2.3 Intégrer dans le flow QA
    - Après chaque build réussi
    - Avant le déploiement
    - Sur demande utilisateur
```

### 4.3 RAG pour Documentation

**Objectif**: Améliorer la qualité du code généré avec la doc officielle

**Tâches**:

```markdown
[ ] 4.3.1 Créer pipeline d'indexation
    - Scraper les docs (React, Vue, etc.)
    - Chunker le contenu
    - Vectoriser avec embeddings

[ ] 4.3.2 Intégrer RAG dans les prompts
    - Détecter le framework utilisé
    - Rechercher les sections pertinentes
    - Injecter dans le contexte

[ ] 4.3.3 Créer cache de documentation
    - Mettre à jour périodiquement
    - Versionner par framework version
```

### 4.4 Mobile Support (Expo)

**Objectif**: Parité avec Bolt.new sur le mobile

**Tâches**:

```markdown
[ ] 4.4.1 Ajouter template Expo
    - React Native avec Expo
    - Configuration TypeScript
    - Hot reload

[ ] 4.4.2 Intégrer Expo Snack
    - Preview dans le navigateur
    - QR code pour test sur device
    - Synchronisation des fichiers

[ ] 4.4.3 Adapter les agents pour mobile
    - Patterns React Native
    - Navigation native
    - Styling StyleSheet
```

---

## 5. Phase 3 : Domination (6+ mois)

### 5.1 Enterprise Features

```markdown
[ ] Multi-tenant architecture
    - Isolation des données par organisation
    - Quotas et limites personnalisables
    - Billing par organisation

[ ] SSO / SAML / OIDC
    - Intégration Okta, Azure AD, etc.
    - Provisioning automatique
    - Session management

[ ] Audit logs
    - Toutes les actions tracées
    - Export pour compliance
    - Retention configurable

[ ] Role-based access control
    - Rôles prédéfinis (admin, developer, viewer)
    - Permissions granulaires
    - Hiérarchie d'accès
```

### 5.2 Écosystème

```markdown
[ ] Marketplace de templates
    - Templates communautaires
    - Templates premium
    - Système de rating/review

[ ] Plugin system
    - API pour compilers custom
    - Hooks dans le build pipeline
    - UI extensions

[ ] API publique
    - REST + GraphQL
    - Webhooks
    - SDKs (Python, JS, Go)

[ ] IDE integrations
    - VSCode extension
    - JetBrains plugin
    - CLI tool
```

### 5.3 AI Avancé

```markdown
[ ] Fine-tuning sur patterns BAVINI
    - Collecter les corrections réussies
    - Fine-tuner un modèle spécialisé
    - A/B testing

[ ] Mémoire persistante
    - Préférences utilisateur
    - Patterns projet
    - Historique des corrections

[ ] Agents spécialisés par framework
    - ReactAgent optimisé pour React
    - VueAgent pour Vue
    - Etc.
```

---

## 6. Annexes Techniques

### 6.1 Commandes Claude Code Utiles

```bash
# Refactoring
/code-simplifier           # Simplifier un fichier volumineux

# Analyse
/review                    # Code review complet
/security                  # Audit sécurité

# Développement
/tdd                       # Test-Driven Development
/fix-build                 # Résoudre erreurs de build

# Planning
/plan                      # Planifier une feature
```

### 6.2 Scripts de Validation

```bash
# Vérifier taille des fichiers
find app -name "*.ts" -o -name "*.tsx" | xargs wc -l | sort -rn | head -20

# Vérifier les any
grep -r ": any" app --include="*.ts" --include="*.tsx" | grep -v ".spec." | wc -l

# Vérifier les TODO
grep -r "TODO" app --include="*.ts" --include="*.tsx" | grep -v node_modules | wc -l

# Run tests
pnpm test

# Run coverage
pnpm test:coverage

# Typecheck
pnpm typecheck
```

### 6.3 Métriques à Tracker

```typescript
// app/lib/metrics/performance.ts

interface PerformanceMetrics {
  // Build metrics
  buildTime: number;
  incrementalHitRate: number;
  bundleSize: number;

  // QA metrics
  fixSuccessRate: number;
  averageFixAttempts: number;
  rollbackRate: number;

  // UX metrics
  timeToFirstPreview: number;
  uiFreezeEvents: number;

  // Cost metrics
  tokensPerSession: number;
  apiCallsPerTask: number;
}
```

### 6.4 Checklist Pre-Release

```markdown
## Before Each Release

### Code Quality
- [ ] Tous les tests passent
- [ ] Coverage > 80%
- [ ] Aucun fichier > 800 lignes
- [ ] Typecheck clean
- [ ] ESLint clean

### Performance
- [ ] Boot time < 2s
- [ ] First preview < 4s
- [ ] Build time < 2s
- [ ] Memory < 200MB

### Security
- [ ] Aucun secret hardcodé
- [ ] Inputs validés (Zod)
- [ ] XSS protection
- [ ] Rate limiting actif

### Documentation
- [ ] CHANGELOG mis à jour
- [ ] API docs à jour
- [ ] Migration guide si breaking changes
```

---

## Changelog

| Version | Date | Changements |
|---------|------|-------------|
| 1.0 | 2026-01-24 | Création initiale basée sur audit |

---

*Ce document doit être maintenu à jour au fur et à mesure de l'avancement.*
