# Plan de Migration BAVINI Cloud (Style Lovable)

> **Objectif**: Remplacer WebContainer (StackBlitz) par une architecture 100% propriétaire basée sur esbuild-wasm + Supabase.

**Date de création**: Janvier 2025
**Durée estimée**: 10-12 semaines
**Statut**: En planification

---

## Table des Matières

1. [Résumé Exécutif](#résumé-exécutif)
2. [Analyse de l'Existant](#analyse-de-lexistant)
3. [Nouvelle Architecture](#nouvelle-architecture)
4. [Phases de Migration](#phases-de-migration)
5. [Détails Techniques](#détails-techniques)
6. [Risques et Mitigations](#risques-et-mitigations)
7. [Coûts et Économies](#coûts-et-économies)
8. [Critères de Succès](#critères-de-succès)

---

## Résumé Exécutif

### Métriques Clés

| Métrique | Valeur |
|----------|--------|
| **Durée estimée** | 10-12 semaines |
| **Fichiers à modifier** | ~45 fichiers |
| **Fichiers à créer** | ~25 fichiers |
| **Fichiers à supprimer** | ~8 fichiers |
| **Risque global** | Moyen |
| **Réutilisation code** | ~75% |

### Avant / Après

| Aspect | Avant (WebContainer) | Après (BAVINI Cloud) |
|--------|---------------------|----------------------|
| Runtime | Node.js WASM dans browser | esbuild-wasm bundler |
| Preview | Port events WebContainer | iframe + code bundlé |
| Terminal | Shell complet | Console panel (logs) |
| Backend | Limité | Supabase complet |
| Limite sessions | 500/mois (StackBlitz) | Illimité |
| Coût licence | ~$27,000/an | $0 |
| Propriétaire | Non | **100% Oui** |

---

## Analyse de l'Existant

### Composants Réutilisables (75%)

| Composant | Réutilisation | Notes |
|-----------|--------------|-------|
| Système multi-agents | 100% | Aucun changement |
| UI/Composants React | 95% | Minor tweaks preview |
| Stores nanostores | 80% | Adapter sources données |
| Supabase integration | 100% | Déjà complète (13K+ lignes) |
| CodeMirror editor | 100% | Aucun changement |
| Auth system | 100% | Prêt |
| PGlite persistence | 100% | Local DB reste |
| Chat/Messages | 100% | Aucun changement |

### Composants à Remplacer (25%)

| Composant | Action | Effort |
|-----------|--------|--------|
| `/app/lib/webcontainer/` | Remplacer par Build Engine | Haut |
| `PreviewsStore` | Nouveau système preview | Moyen |
| `Terminal` | Supprimer ou Console | Bas |
| `FilesStore` sync | Adapter pour Supabase | Moyen |
| `action-runner.ts` | Simplifier | Moyen |

### Dépendances WebContainer Identifiées

```
Fichiers Core (5):
├── /app/lib/webcontainer/index.ts
├── /app/lib/webcontainer/dependency-cache.ts
├── /app/lib/webcontainer/optimized-installer.ts
├── /app/lib/webcontainer/dependency-prewarmer.ts
└── /app/lib/webcontainer/auth.client.ts

Stores (4):
├── /app/lib/stores/workbench.ts
├── /app/lib/stores/files.ts
├── /app/lib/stores/terminal.ts
└── /app/lib/stores/previews.ts

Agents/Adapters (4):
├── /app/lib/agents/adapters/webcontainer-adapter.ts
├── /app/lib/agents/adapters/shell-adapter.ts
├── /app/lib/agents/adapters/file-operations-adapter.ts
└── /app/lib/agents/tools/shell-tools.ts

Services (3):
├── /app/lib/runtime/action-runner.ts
├── /app/lib/services/checkpoints/webcontainer-sync.ts
└── /app/lib/git/file-sync.ts
```

---

## Nouvelle Architecture

### Vue d'Ensemble

```
┌─────────────────────────────────────────────────────────────────────┐
│                         BROWSER (Client)                             │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                      BAVINI Editor                               ││
│  │  ┌───────────────┐  ┌───────────────┐  ┌───────────────────────┐││
│  │  │  Code Editor  │  │  File Tree    │  │  AI Chat + Agents     │││
│  │  │  (CodeMirror) │  │  (Virtual FS) │  │  (système actuel)     │││
│  │  └───────┬───────┘  └───────┬───────┘  └───────────┬───────────┘││
│  │          │                  │                      │             ││
│  │          └──────────────────┼──────────────────────┘             ││
│  │                             │                                    ││
│  │  ┌──────────────────────────▼──────────────────────────────────┐││
│  │  │                   Build Engine (In-Browser)                  │││
│  │  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │││
│  │  │  │esbuild-wasm │  │ Virtual FS  │  │  Import Resolver    │  │││
│  │  │  │ (bundler)   │  │ (in-memory) │  │  (esm.sh/skypack)   │  │││
│  │  │  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │││
│  │  │         └────────────────┼───────────────────┘              │││
│  │  │                          │                                   │││
│  │  │         ┌────────────────▼────────────────┐                  │││
│  │  │         │      Bundled App (in-memory)    │                  │││
│  │  │         └────────────────┬────────────────┘                  │││
│  │  └──────────────────────────┼───────────────────────────────────┘││
│  │                             │                                    ││
│  │  ┌──────────────────────────▼──────────────────────────────────┐││
│  │  │                    Preview (iframe sandbox)                  │││
│  │  │         React/Vue/Svelte App running live                    │││
│  │  └─────────────────────────────────────────────────────────────┘││
│  └─────────────────────────────────────────────────────────────────┘│
└──────────────────────────────────┬──────────────────────────────────┘
                                   │ HTTPS/WebSocket
┌──────────────────────────────────▼──────────────────────────────────┐
│                         BACKEND (Cloud)                              │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                      Supabase                                    ││
│  │  ┌───────────┐  ┌───────────┐  ┌───────────┐  ┌───────────────┐ ││
│  │  │ Postgres  │  │   Auth    │  │  Storage  │  │Edge Functions │ ││
│  │  │ (projects,│  │  (users)  │  │  (assets) │  │(API routes)   │ ││
│  │  │  files)   │  │           │  │           │  │               │ ││
│  │  └───────────┘  └───────────┘  └───────────┘  └───────────────┘ ││
│  └─────────────────────────────────────────────────────────────────┘│
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │                   Cloudflare (Deployment)                        ││
│  │  ┌───────────┐  ┌───────────┐  ┌───────────────────────────────┐││
│  │  │   Pages   │  │  Workers  │  │         R2 Storage            │││
│  │  │ (hosting) │  │(serverless)│ │       (npm cache)             │││
│  │  └───────────┘  └───────────┘  └───────────────────────────────┘││
│  └─────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────┘
```

### Structure des Fichiers

```
app/
├── lib/
│   ├── build-engine/                    # NOUVEAU - Remplace webcontainer
│   │   ├── index.ts                     # Exports principaux
│   │   ├── browser-bundler.ts           # esbuild-wasm wrapper
│   │   ├── plugins/
│   │   │   ├── virtual-fs.ts            # Plugin fichiers virtuels
│   │   │   ├── http-import.ts           # Plugin npm via CDN
│   │   │   ├── css-modules.ts           # Support CSS modules
│   │   │   └── assets.ts                # Images, fonts, etc.
│   │   ├── hmr-manager.ts               # Hot Module Replacement
│   │   └── types.ts                     # Types TypeScript
│   │
│   ├── preview/                         # NOUVEAU - Système preview
│   │   ├── index.ts
│   │   ├── sandbox.ts                   # iframe sandbox sécurisé
│   │   ├── console-capture.ts           # Capture console.log
│   │   ├── error-boundary.ts            # Gestion erreurs preview
│   │   └── communication.ts             # postMessage protocol
│   │
│   ├── stores/
│   │   ├── files.ts                     # MODIFIER - Retirer sync WC
│   │   ├── previews.ts                  # REMPLACER - Nouveau système
│   │   ├── build.ts                     # NOUVEAU - État du build
│   │   └── terminal.ts                  # SUPPRIMER ou SIMULER
│   │
│   ├── webcontainer/                    # SUPPRIMER (après migration)
│   │
│   └── services/
│       └── supabase/                    # ÉTENDRE
│           ├── projects.ts              # NOUVEAU - CRUD projets
│           ├── files.ts                 # NOUVEAU - Sync fichiers
│           └── deployments.ts           # NOUVEAU - Déploiements
│
├── components/
│   └── workbench/
│       ├── Preview.tsx                  # MODIFIER - Nouveau système
│       ├── Terminal.tsx                 # MODIFIER - Console only
│       └── ConsolePanel.tsx             # NOUVEAU - Remplace terminal
│
└── routes/
    └── api.deploy.ts                    # NOUVEAU - Edge function deploy
```

---

## Phases de Migration

### Timeline Visuelle

```
Semaine 1  │████████████████████│ Phase 0: Préparation
Semaine 2  │████████████████████│ Phase 1: Build Engine (1/2)
Semaine 3  │████████████████████│ Phase 1: Build Engine (2/2)
Semaine 4  │████████████████████│ Phase 2: Preview System (1/2)
Semaine 5  │████████████████████│ Phase 2: Preview System (2/2)
Semaine 6  │████████████████████│ Phase 3: Supabase (1/2)
Semaine 7  │████████████████████│ Phase 3: Supabase (2/2)
Semaine 8  │████████████████████│ Phase 4: Déploiement
Semaine 9  │████████████████████│ Phase 5: Nettoyage (1/2)
Semaine 10 │████████████████████│ Phase 5: Nettoyage (2/2)
Semaine 11 │████████████████████│ Phase 6: Tests & Polish (1/2)
Semaine 12 │████████████████████│ Phase 6: Tests & Polish (2/2)
```

---

### Phase 0: Préparation (Semaine 1)

**Objectif**: Créer l'abstraction et les tests de référence

#### Tâches

- [ ] **0.1** Créer interface `RuntimeAdapter`
  ```typescript
  // /app/lib/runtime/adapter.ts
  export interface RuntimeAdapter {
    bundle(files: FileMap, entry: string): Promise<BundleResult>;
    transform(code: string, loader: Loader): Promise<string>;
    getPreviewUrl(): string | null;
    onPreviewReady(callback: (url: string) => void): void;
    onConsole(callback: (log: ConsoleLog) => void): void;
    onError(callback: (error: RuntimeError) => void): void;
  }
  ```

- [ ] **0.2** Créer tests d'intégration de référence
  - Test: bundle simple React app
  - Test: import npm package
  - Test: CSS modules
  - Test: erreurs de build
  - Test: hot reload

- [ ] **0.3** Documenter le comportement actuel
  - Capture des temps de build
  - Liste packages npm supportés
  - Comportements edge cases

- [ ] **0.4** Créer feature flag
  ```typescript
  // /app/lib/stores/settings.ts
  export const buildEngineStore = atom<'webcontainer' | 'browser'>('webcontainer');
  ```

#### Livrables
- [ ] Interface `RuntimeAdapter` définie
- [ ] 15+ tests de référence
- [ ] Documentation comportement actuel
- [ ] Feature flag fonctionnel

---

### Phase 1: Build Engine (Semaines 2-3)

**Objectif**: Implémenter esbuild-wasm dans le browser

#### Tâches

- [ ] **1.1** Installer et configurer esbuild-wasm
  ```bash
  pnpm add esbuild-wasm
  ```

- [ ] **1.2** Créer `BrowserBundler`
  ```typescript
  // /app/lib/build-engine/browser-bundler.ts
  import * as esbuild from 'esbuild-wasm';

  class BrowserBundler {
    private initialized = false;

    async init() {
      if (this.initialized) return;
      await esbuild.initialize({
        worker: true,
        wasmURL: '/esbuild.wasm',
      });
      this.initialized = true;
    }

    async bundle(files: Map<string, string>, entryPoint: string): Promise<string> {
      await this.init();
      const result = await esbuild.build({
        entryPoints: [entryPoint],
        bundle: true,
        write: false,
        format: 'esm',
        plugins: [
          virtualFsPlugin(files),
          httpImportPlugin(),
          cssModulesPlugin(),
        ],
      });
      return result.outputFiles[0].text;
    }
  }
  ```

- [ ] **1.3** Créer Virtual FS Plugin
- [ ] **1.4** Créer HTTP Import Plugin (esm.sh, skypack)
- [ ] **1.5** Créer CSS Support Plugin
- [ ] **1.6** Créer Assets Plugin
- [ ] **1.7** Créer Build Store

#### Livrables
- [ ] `BrowserBundler` fonctionnel
- [ ] 4 plugins (virtual-fs, http-import, css, assets)
- [ ] Build store avec status/erreurs
- [ ] 20+ tests unitaires
- [ ] Build < 500ms pour app simple

---

### Phase 2: Système Preview (Semaines 4-5)

**Objectif**: Créer le nouveau système de preview sans WebContainer

#### Tâches

- [ ] **2.1** Créer `PreviewSandbox`
  ```typescript
  // /app/lib/preview/sandbox.ts
  export class PreviewSandbox {
    private iframe: HTMLIFrameElement;

    async render(bundledCode: string) {
      const doc = this.iframe.contentDocument!;
      doc.open();
      doc.write(`
        <!DOCTYPE html>
        <html>
          <head><meta charset="utf-8"></head>
          <body>
            <div id="root"></div>
            <script type="module">${bundledCode}</script>
          </body>
        </html>
      `);
      doc.close();
    }
  }
  ```

- [ ] **2.2** Créer Console Capture
- [ ] **2.3** Créer Error Boundary
- [ ] **2.4** Créer HMR Manager
- [ ] **2.5** Refactorer `PreviewsStore`
- [ ] **2.6** Modifier `Preview.tsx`
- [ ] **2.7** Créer `ConsolePanel`

#### Livrables
- [ ] PreviewSandbox fonctionnel
- [ ] Console capture avec postMessage
- [ ] HMR Manager avec debounce
- [ ] ConsolePanel UI
- [ ] Tests E2E preview

---

### Phase 3: Persistence Supabase (Semaines 6-7)

**Objectif**: Sauvegarder projets et fichiers dans Supabase

#### Schema SQL

```sql
-- /supabase/migrations/002_bavini_cloud.sql

-- Projets
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  name TEXT NOT NULL,
  description TEXT,
  template TEXT DEFAULT 'react-vite',
  is_public BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Fichiers
CREATE TABLE project_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  files JSONB NOT NULL DEFAULT '{}',
  version INTEGER DEFAULT 1,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Historique
CREATE TABLE project_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  files JSONB NOT NULL,
  message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users own projects" ON projects
  FOR ALL USING (auth.uid() = user_id);
```

#### Tâches

- [ ] **3.1** Créer schema Supabase
- [ ] **3.2** Créer `ProjectsService`
- [ ] **3.3** Créer `FilesService`
- [ ] **3.4** Modifier `FilesStore`
- [ ] **3.5** Créer `ProjectStore`
- [ ] **3.6** Modifier `WorkbenchStore`

#### Livrables
- [ ] Schema Supabase déployé
- [ ] ProjectsService CRUD complet
- [ ] FilesService avec versions
- [ ] Auto-save fonctionnel

---

### Phase 4: Déploiement (Semaine 8)

**Objectif**: Permettre le déploiement en un clic

#### Tâches

- [ ] **4.1** Créer Edge Function build
- [ ] **4.2** Créer Edge Function deploy
- [ ] **4.3** Créer `DeploymentsService`
- [ ] **4.4** Créer `DeployPanel` UI
- [ ] **4.5** Intégrer Cloudflare Pages API

#### Livrables
- [ ] Edge Functions fonctionnelles
- [ ] DeployPanel UI
- [ ] Déploiement < 30s
- [ ] URL publique fonctionnelle

---

### Phase 5: Nettoyage & Migration (Semaines 9-10)

**Objectif**: Supprimer WebContainer et finaliser

#### Tâches

- [ ] **5.1** Supprimer `@webcontainer/api`
  ```bash
  pnpm remove @webcontainer/api
  ```

- [ ] **5.2** Supprimer fichiers WebContainer
  ```bash
  rm -rf app/lib/webcontainer/
  ```

- [ ] **5.3** Supprimer/Adapter Terminal
- [ ] **5.4** Nettoyer les imports
- [ ] **5.5** Mettre à jour documentation
- [ ] **5.6** Mettre à jour licences
- [ ] **5.7** Script migration utilisateurs

#### Livrables
- [ ] Zéro référence WebContainer
- [ ] Documentation à jour
- [ ] Licences nettoyées

---

### Phase 6: Tests & Polish (Semaines 11-12)

**Objectif**: Stabiliser et optimiser

#### Benchmarks Cibles

| Métrique | Objectif |
|----------|----------|
| Build initial | < 500ms |
| Rebuild (HMR) | < 200ms |
| Preview update | < 100ms |
| Déploiement | < 30s |

#### Tâches

- [ ] **6.1** Tests E2E complets
- [ ] **6.2** Benchmarks performance
- [ ] **6.3** Optimisations (cache, workers)
- [ ] **6.4** Gestion d'erreurs
- [ ] **6.5** Monitoring (Sentry)
- [ ] **6.6** Documentation utilisateur

#### Livrables
- [ ] 50+ tests E2E passants
- [ ] Benchmarks documentés
- [ ] Monitoring configuré
- [ ] Documentation complète

---

## Détails Techniques

### Build Engine - BrowserBundler

```typescript
// /app/lib/build-engine/browser-bundler.ts

import * as esbuild from 'esbuild-wasm';

export interface BundleResult {
  code: string;
  css: string;
  errors: esbuild.Message[];
  warnings: esbuild.Message[];
  buildTime: number;
}

export class BrowserBundler {
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = esbuild.initialize({
      worker: true,
      wasmURL: '/esbuild.wasm',
    }).then(() => {
      this.initialized = true;
    });

    return this.initPromise;
  }

  async bundle(
    files: Map<string, string>,
    entryPoint: string
  ): Promise<BundleResult> {
    await this.init();

    const startTime = performance.now();

    const result = await esbuild.build({
      entryPoints: [entryPoint],
      bundle: true,
      write: false,
      format: 'esm',
      target: 'es2020',
      jsx: 'automatic',
      loader: {
        '.ts': 'ts',
        '.tsx': 'tsx',
        '.css': 'css',
        '.json': 'json',
        '.svg': 'dataurl',
        '.png': 'dataurl',
        '.jpg': 'dataurl',
      },
      plugins: [
        virtualFsPlugin(files),
        httpImportPlugin(),
        cssModulesPlugin(),
      ],
      define: {
        'process.env.NODE_ENV': '"development"',
      },
    });

    const buildTime = performance.now() - startTime;

    return {
      code: result.outputFiles.find(f => f.path.endsWith('.js'))?.text ?? '',
      css: result.outputFiles.find(f => f.path.endsWith('.css'))?.text ?? '',
      errors: result.errors,
      warnings: result.warnings,
      buildTime,
    };
  }
}

export const bundler = new BrowserBundler();
```

### Virtual FS Plugin

```typescript
// /app/lib/build-engine/plugins/virtual-fs.ts

import type { Plugin } from 'esbuild-wasm';

export function virtualFsPlugin(files: Map<string, string>): Plugin {
  return {
    name: 'virtual-fs',
    setup(build) {
      // Résoudre les imports locaux
      build.onResolve({ filter: /^\./ }, (args) => {
        const resolved = resolvePath(args.importer, args.path);

        // Essayer différentes extensions
        const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx'];
        for (const ext of extensions) {
          if (files.has(resolved + ext)) {
            return { path: resolved + ext, namespace: 'virtual' };
          }
        }

        return null;
      });

      // Charger depuis le FS virtuel
      build.onLoad({ filter: /.*/, namespace: 'virtual' }, (args) => {
        const content = files.get(args.path);
        if (!content) {
          return { errors: [{ text: `File not found: ${args.path}` }] };
        }

        return {
          contents: content,
          loader: getLoader(args.path)
        };
      });
    },
  };
}

function resolvePath(importer: string, importPath: string): string {
  const dir = importer.substring(0, importer.lastIndexOf('/'));
  const parts = [...dir.split('/'), ...importPath.split('/')];
  const resolved: string[] = [];

  for (const part of parts) {
    if (part === '..') {
      resolved.pop();
    } else if (part !== '.') {
      resolved.push(part);
    }
  }

  return resolved.join('/');
}

function getLoader(path: string): esbuild.Loader {
  if (path.endsWith('.tsx')) return 'tsx';
  if (path.endsWith('.ts')) return 'ts';
  if (path.endsWith('.jsx')) return 'jsx';
  if (path.endsWith('.js')) return 'js';
  if (path.endsWith('.css')) return 'css';
  if (path.endsWith('.json')) return 'json';
  return 'text';
}
```

### HTTP Import Plugin

```typescript
// /app/lib/build-engine/plugins/http-import.ts

import type { Plugin } from 'esbuild-wasm';

const CDN_URL = 'https://esm.sh';
const cache = new Map<string, string>();

export function httpImportPlugin(): Plugin {
  return {
    name: 'http-import',
    setup(build) {
      // Résoudre les bare imports (npm packages)
      build.onResolve({ filter: /^[^./]/ }, (args) => {
        // Ignorer les built-ins
        if (isNodeBuiltin(args.path)) {
          return { path: args.path, external: true };
        }

        return {
          path: `${CDN_URL}/${args.path}`,
          namespace: 'http',
        };
      });

      // Résoudre les imports depuis le CDN
      build.onResolve({ filter: /.*/, namespace: 'http' }, (args) => {
        return {
          path: new URL(args.path, args.importer).href,
          namespace: 'http',
        };
      });

      // Charger depuis CDN
      build.onLoad({ filter: /.*/, namespace: 'http' }, async (args) => {
        // Check cache
        if (cache.has(args.path)) {
          return { contents: cache.get(args.path), loader: 'js' };
        }

        // Fetch from CDN
        const response = await fetch(args.path);
        if (!response.ok) {
          return { errors: [{ text: `Failed to fetch: ${args.path}` }] };
        }

        const contents = await response.text();
        cache.set(args.path, contents);

        return { contents, loader: 'js' };
      });
    },
  };
}

const NODE_BUILTINS = new Set([
  'fs', 'path', 'os', 'crypto', 'stream', 'buffer',
  'util', 'events', 'http', 'https', 'net', 'url',
  'querystring', 'child_process', 'cluster', 'dgram',
]);

function isNodeBuiltin(id: string): boolean {
  return NODE_BUILTINS.has(id) || id.startsWith('node:');
}
```

### Preview Sandbox

```typescript
// /app/lib/preview/sandbox.ts

export interface ConsoleLog {
  type: 'log' | 'warn' | 'error' | 'info';
  args: any[];
  timestamp: number;
}

export interface RuntimeError {
  message: string;
  filename?: string;
  lineno?: number;
  colno?: number;
  stack?: string;
}

export class PreviewSandbox {
  private iframe: HTMLIFrameElement;
  private onConsoleCallback?: (log: ConsoleLog) => void;
  private onErrorCallback?: (error: RuntimeError) => void;

  constructor(container: HTMLElement) {
    this.iframe = document.createElement('iframe');
    this.iframe.sandbox.add('allow-scripts', 'allow-same-origin');
    this.iframe.style.cssText = 'width:100%;height:100%;border:none;';
    container.appendChild(this.iframe);

    this.setupMessageListener();
  }

  async render(bundledCode: string, css: string = '') {
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>${css}</style>
          <style>* { box-sizing: border-box; }</style>
        </head>
        <body>
          <div id="root"></div>
          <script type="module">
            // Error handling
            window.onerror = (msg, url, line, col, error) => {
              parent.postMessage({
                type: 'error',
                error: { message: msg, lineno: line, colno: col, stack: error?.stack }
              }, '*');
            };

            window.onunhandledrejection = (event) => {
              parent.postMessage({
                type: 'error',
                error: { message: event.reason?.message || String(event.reason) }
              }, '*');
            };

            // Console capture
            const originalConsole = { ...console };
            ['log', 'warn', 'error', 'info'].forEach(method => {
              console[method] = (...args) => {
                parent.postMessage({
                  type: 'console',
                  log: { type: method, args, timestamp: Date.now() }
                }, '*');
                originalConsole[method](...args);
              };
            });

            // Run bundled code
            try {
              ${bundledCode}
            } catch (error) {
              parent.postMessage({
                type: 'error',
                error: { message: error.message, stack: error.stack }
              }, '*');
            }
          </script>
        </body>
      </html>
    `;

    const doc = this.iframe.contentDocument!;
    doc.open();
    doc.write(html);
    doc.close();
  }

  private setupMessageListener() {
    window.addEventListener('message', (event) => {
      if (event.source !== this.iframe.contentWindow) return;

      const { type, log, error } = event.data;

      if (type === 'console' && this.onConsoleCallback) {
        this.onConsoleCallback(log);
      }

      if (type === 'error' && this.onErrorCallback) {
        this.onErrorCallback(error);
      }
    });
  }

  onConsole(callback: (log: ConsoleLog) => void) {
    this.onConsoleCallback = callback;
  }

  onError(callback: (error: RuntimeError) => void) {
    this.onErrorCallback = callback;
  }

  destroy() {
    this.iframe.remove();
  }
}
```

---

## Risques et Mitigations

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| Packages npm incompatibles | Moyenne | Moyen | Whitelist packages testés, fallback message |
| Performance build dégradée | Basse | Moyen | Web Worker, cache agressif |
| CDN esm.sh down | Basse | Haut | Fallback vers unpkg/skypack |
| Migration utilisateurs | Moyenne | Moyen | Script automatique + support |
| Fonctionnalités manquantes | Moyenne | Moyen | Documentation claire des limites |

---

## Coûts et Économies

### Infrastructure Mensuelle

| Service | Plan | Coût |
|---------|------|------|
| Supabase | Pro | $25/mois |
| Cloudflare Pages | Free | $0 |
| Cloudflare R2 | Pay as you go | ~$5/mois |
| **Total** | | **~$30/mois** |

### Comparaison

| Avant (WebContainer) | Après (BAVINI Cloud) | Économie/an |
|---------------------|----------------------|-------------|
| ~$27,000/an | ~$360/an | **~$26,640** |

---

## Critères de Succès

### Phase 1-2 (Build + Preview)
- [ ] Build React app simple en < 500ms
- [ ] Preview fonctionnel avec HMR
- [ ] Import de 10 packages npm courants
- [ ] Gestion CSS/Tailwind

### Phase 3-4 (Persistence + Deploy)
- [ ] Save/Load projet fonctionnel
- [ ] Déploiement en < 30s
- [ ] URL publique accessible

### Phase 5-6 (Polish)
- [ ] Zéro mention WebContainer
- [ ] 50+ tests passants
- [ ] Documentation complète

---

## Actions Immédiates

```bash
# 1. Créer branche
git checkout -b feature/bavini-cloud

# 2. Installer esbuild-wasm
pnpm add esbuild-wasm

# 3. Créer structure
mkdir -p app/lib/build-engine/plugins
mkdir -p app/lib/preview

# 4. Copier esbuild.wasm dans public
cp node_modules/esbuild-wasm/esbuild.wasm public/

# 5. Créer premier fichier
touch app/lib/build-engine/browser-bundler.ts
```

---

## Changelog

| Date | Version | Description |
|------|---------|-------------|
| 2025-01-16 | 1.0 | Création du plan initial |

---

*Document généré par Claude Opus 4.5 - BAVINI Migration Planning*
