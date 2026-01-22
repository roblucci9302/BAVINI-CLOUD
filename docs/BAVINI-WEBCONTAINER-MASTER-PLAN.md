# BAVINI WebContainer - Plan Directeur de Développement

> **Document Technique de Niveau Expert**
>
> **Version**: 1.0
> **Date**: 2026-01-21
> **Classification**: Architecture Stratégique
> **Auteurs Virtuels**: Panel d'Experts en Systèmes Distribués, WebAssembly, et Runtimes JavaScript

---

## Table des Matières

1. [Résumé Exécutif](#1-résumé-exécutif)
2. [Analyse de l'État Actuel](#2-analyse-de-létat-actuel)
3. [Benchmark: WebContainer vs Nodebox vs BAVINI](#3-benchmark-webcontainer-vs-nodebox-vs-bavini)
4. [Architecture Cible](#4-architecture-cible)
5. [Composants Techniques Détaillés](#5-composants-techniques-détaillés)
6. [Plan d'Implémentation par Phases](#6-plan-dimplémentation-par-phases)
7. [Spécifications de Performance](#7-spécifications-de-performance)
8. [Sécurité et Isolation](#8-sécurité-et-isolation)
9. [Risques et Mitigations](#9-risques-et-mitigations)
10. [Ressources et Références](#10-ressources-et-références)

---

## 1. Résumé Exécutif

### Vision

Transformer BAVINI d'un **Browser Build Runtime** limité en un **WebContainer complet** capable d'exécuter Node.js nativement dans le navigateur, avec:

- Terminal interactif complet (bash/sh)
- Package manager fonctionnel (npm/pnpm/yarn)
- Système de fichiers persistant
- Serveurs HTTP locaux avec prévisualisation
- Support SSR natif pour tous les frameworks
- Performance comparable à StackBlitz WebContainer

### Objectifs Stratégiques

| Objectif | Métrique Cible | Priorité |
|----------|---------------|----------|
| Boot time | < 1.5 secondes | P0 |
| Premier build | < 3 secondes | P0 |
| Terminal response | < 50ms | P0 |
| npm install (10 deps) | < 5 secondes | P1 |
| Mémoire max | < 256MB | P1 |
| Compatibilité Node.js | 95% APIs courantes | P1 |

### Approche Recommandée

Après analyse approfondie, nous recommandons une **architecture hybride**:

1. **QuickJS WASM** pour l'exécution JavaScript isolée
2. **Virtual Filesystem** avec IndexedDB pour la persistance
3. **Web Workers** pour le multi-threading
4. **Service Worker** pour le networking virtualisé
5. **xterm.js + shell WASM** pour le terminal

Cette approche évite la dépendance à SharedArrayBuffer (problématique sur Safari) tout en offrant des performances proches de WebContainer.

---

## 2. Analyse de l'État Actuel

### 2.1 Architecture Browser Runtime Actuelle

```
┌─────────────────────────────────────────────────────────────────────┐
│                        BAVINI Browser Runtime                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐  │
│  │  esbuild-wasm   │    │  Compiler       │    │  Preview        │  │
│  │  (bundler)      │    │  Registry       │    │  (srcdoc/SW)    │  │
│  └────────┬────────┘    └────────┬────────┘    └────────┬────────┘  │
│           │                      │                      │           │
│  ┌────────▼──────────────────────▼──────────────────────▼────────┐  │
│  │                    Virtual Filesystem (Map)                    │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                                                                      │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐  │
│  │  esm.sh CDN     │    │  CSS Aggregator │    │  QuickJS SSR    │  │
│  │  (npm packages) │    │  (Tailwind JIT) │    │  (optionnel)    │  │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 Capacités Actuelles

| Fonctionnalité | Statut | Détails |
|----------------|--------|---------|
| React/Vue/Svelte/Astro | ✅ Complet | Compilation via CDN |
| Tailwind CSS JIT | ✅ Complet | jit-browser-tailwindcss |
| npm packages | ⚠️ Limité | Via esm.sh CDN uniquement |
| Multi-page routing | ✅ Complet | Hash-based routing |
| Preview iframe | ✅ Complet | srcdoc mode |
| Ouvrir nouvel onglet | ✅ Complet | Blob URL |
| Terminal | ❌ Absent | Pas de shell |
| npm install | ❌ Absent | CDN seulement |
| Filesystem persistant | ⚠️ Partiel | IndexedDB via QuickJS |
| SSR | ⚠️ Limité | QuickJS bridge optionnel |
| Code splitting | ❌ Absent | Bundle unique |
| Node.js APIs | ❌ Absent | Polyfills basiques |

### 2.3 Limitations Critiques

#### A. Absence de Terminal

```
IMPACT: Impossible d'exécuter des commandes shell
- Pas de `npm install`, `npm run build`
- Pas de scripts package.json
- Pas d'outils CLI (prettier, eslint, etc.)
```

#### B. Package Management Simulé

```
ACTUEL: import React from 'react'
        → Résolu vers esm.sh/react@18.x

PROBLÈME:
- Versions non contrôlées
- Pas de lockfile
- Pas de node_modules
- Incompatible avec packages complexes (native bindings)
```

#### C. Système de Fichiers Volatile

```
ACTUEL: Map<string, string> en mémoire

PROBLÈME:
- Perdu au refresh
- Pas de vraie arborescence
- Pas de permissions
- Pas de liens symboliques
```

#### D. Networking Inexistant

```
PROBLÈME:
- Pas de serveur HTTP local
- Pas de WebSockets côté serveur
- Pas de proxy API
- CORS blocking pour fetch externes
```

---

## 3. Benchmark: WebContainer vs Nodebox vs BAVINI

### 3.1 Comparaison Architecturale

| Aspect | WebContainer (StackBlitz) | Nodebox (CodeSandbox) | BAVINI Actuel |
|--------|--------------------------|----------------------|---------------|
| **Technologie Core** | WASM custom + SharedArrayBuffer | Web Workers + Virtual FS | esbuild-wasm |
| **Compatibilité Browser** | Chrome, Firefox, Safari TP | Tous navigateurs | Tous navigateurs |
| **Headers Requis** | COOP/COEP obligatoires | Aucun | Aucun |
| **Boot Time** | ~800ms | ~1.2s | ~2-4s |
| **npm install** | ✅ Natif (pnpm) | ✅ Simulé | ❌ CDN only |
| **Terminal** | ✅ jsh (shell custom) | ✅ Shell simulé | ❌ Absent |
| **Node.js APIs** | ~90% | ~70% | ~5% |
| **Filesystem** | Virtual + persistance | Virtual + CDN | Map volatile |
| **Offline** | ✅ Après boot | ⚠️ Partiel | ❌ Non |
| **SSR** | ✅ Natif | ✅ Natif | ⚠️ QuickJS bridge |
| **Licence** | Propriétaire (payant) | MIT (open source) | MIT |

### 3.2 Architecture WebContainer (StackBlitz)

```
┌─────────────────────────────────────────────────────────────────────┐
│                     WebContainer Architecture                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    Main Thread (UI)                           │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐   │   │
│  │  │ xterm.js    │  │ Monaco      │  │ Preview Iframe      │   │   │
│  │  │ (terminal)  │  │ (editor)    │  │ (localhost proxy)   │   │   │
│  │  └──────┬──────┘  └─────────────┘  └──────────┬──────────┘   │   │
│  └─────────┼─────────────────────────────────────┼──────────────┘   │
│            │                                     │                   │
│  ┌─────────▼─────────────────────────────────────▼──────────────┐   │
│  │              SharedArrayBuffer Communication                  │   │
│  └───────────────────────────┬──────────────────────────────────┘   │
│                              │                                       │
│  ┌───────────────────────────▼──────────────────────────────────┐   │
│  │                  WASM Worker Thread                           │   │
│  │  ┌─────────────────────────────────────────────────────────┐ │   │
│  │  │              Node.js Runtime (WASM)                      │ │   │
│  │  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐ │ │   │
│  │  │  │ V8/jsc   │  │ npm/pnpm │  │ fs       │  │ http     │ │ │   │
│  │  │  │ engine   │  │ registry │  │ virtual  │  │ server   │ │ │   │
│  │  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘ │ │   │
│  │  └─────────────────────────────────────────────────────────┘ │   │
│  │  ┌─────────────────────────────────────────────────────────┐ │   │
│  │  │              Virtual TCP/IP Stack                        │ │   │
│  │  └─────────────────────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                  Service Worker                               │   │
│  │  ┌─────────────────────┐  ┌─────────────────────────────┐    │   │
│  │  │ localhost:* proxy   │  │ Network virtualization       │    │   │
│  │  └─────────────────────┘  └─────────────────────────────┘    │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.3 Architecture Nodebox (CodeSandbox)

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Nodebox Architecture                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    Main Thread                                │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐   │   │
│  │  │ Terminal UI │  │ Editor      │  │ Preview Iframe      │   │   │
│  │  └──────┬──────┘  └─────────────┘  └──────────┬──────────┘   │   │
│  └─────────┼─────────────────────────────────────┼──────────────┘   │
│            │ postMessage                         │                   │
│  ┌─────────▼─────────────────────────────────────▼──────────────┐   │
│  │              Web Worker Pool (Process Emulation)              │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │   │
│  │  │ Worker 1     │  │ Worker 2     │  │ Worker N     │        │   │
│  │  │ (node proc)  │  │ (npm proc)   │  │ (dev server) │        │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘        │   │
│  └──────────────────────────┬───────────────────────────────────┘   │
│                             │                                        │
│  ┌──────────────────────────▼───────────────────────────────────┐   │
│  │              Shared Virtual Filesystem                        │   │
│  │  ┌─────────────────────────────────────────────────────────┐ │   │
│  │  │ Event-based consistency (eventual sync across workers)  │ │   │
│  │  └─────────────────────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │              Service Worker + Hidden IFrames                  │   │
│  │  ┌─────────────────────┐  ┌─────────────────────────────┐    │   │
│  │  │ HTTP Server Mock    │  │ WebSocket Mock               │    │   │
│  │  └─────────────────────┘  └─────────────────────────────┘    │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.4 Analyse des Forces/Faiblesses

| Solution | Forces | Faiblesses |
|----------|--------|------------|
| **WebContainer** | Performance native, compatibilité Node.js élevée, terminal réel | Requiert SharedArrayBuffer, headers COOP/COEP, propriétaire |
| **Nodebox** | Cross-browser, open source, pas de headers spéciaux | Moins performant, APIs Node.js limitées, pas de DB natives |
| **BAVINI Actuel** | Simple, léger, frameworks modernes | Pas de terminal, pas de npm, pas de persistance |

---

## 4. Architecture Cible

### 4.1 Vision: BAVINI WebContainer

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        BAVINI WebContainer v2.0                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────────────────── UI Layer ─────────────────────────────────┐│
│  │                                                                          ││
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐ ││
│  │  │ xterm.js    │  │ CodeMirror  │  │ Preview     │  │ DevTools        │ ││
│  │  │ Terminal    │  │ Editor      │  │ Iframe      │  │ Panel           │ ││
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └────────┬────────┘ ││
│  │         │                │                │                   │          ││
│  └─────────┼────────────────┼────────────────┼───────────────────┼──────────┘│
│            │                │                │                   │           │
│  ┌─────────▼────────────────▼────────────────▼───────────────────▼──────────┐│
│  │                         Message Bus (Nanostores + Events)                 ││
│  └─────────────────────────────────┬────────────────────────────────────────┘│
│                                    │                                          │
│  ┌─────────────────────────────────▼────────────────────────────────────────┐│
│  │                         Runtime Orchestrator                              ││
│  │  ┌──────────────────────────────────────────────────────────────────┐    ││
│  │  │                    Process Manager (Web Workers)                  │    ││
│  │  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐  │    ││
│  │  │  │ Shell      │  │ Node.js    │  │ npm/pnpm   │  │ Dev Server │  │    ││
│  │  │  │ Worker     │  │ Worker     │  │ Worker     │  │ Worker     │  │    ││
│  │  │  │ (bash-wasm)│  │ (QuickJS)  │  │ (registry) │  │ (Vite-like)│  │    ││
│  │  │  └────────────┘  └────────────┘  └────────────┘  └────────────┘  │    ││
│  │  └──────────────────────────────────────────────────────────────────┘    ││
│  │  ┌──────────────────────────────────────────────────────────────────┐    ││
│  │  │                    Virtual Filesystem (OPFS + IndexedDB)          │    ││
│  │  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐  │    ││
│  │  │  │ /home      │  │ /node_mods │  │ /tmp       │  │ /project   │  │    ││
│  │  │  │ (persist)  │  │ (cached)   │  │ (volatile) │  │ (persist)  │  │    ││
│  │  │  └────────────┘  └────────────┘  └────────────┘  └────────────┘  │    ││
│  │  └──────────────────────────────────────────────────────────────────┘    ││
│  │  ┌──────────────────────────────────────────────────────────────────┐    ││
│  │  │                    Network Stack (Service Worker)                 │    ││
│  │  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────────┐  │    ││
│  │  │  │ HTTP Server    │  │ WebSocket      │  │ External Proxy     │  │    ││
│  │  │  │ localhost:*    │  │ Server Mock    │  │ (CORS bypass)      │  │    ││
│  │  │  └────────────────┘  └────────────────┘  └────────────────────┘  │    ││
│  │  └──────────────────────────────────────────────────────────────────┘    ││
│  └──────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
│  ┌────────────────────────── Build Pipeline ────────────────────────────────┐│
│  │  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────────────┐  ││
│  │  │ esbuild    │  │ Compilers  │  │ Tailwind   │  │ Hot Module         │  ││
│  │  │ WASM       │  │ (Vue,Svlt) │  │ JIT        │  │ Replacement (HMR)  │  ││
│  │  └────────────┘  └────────────┘  └────────────┘  └────────────────────┘  ││
│  └──────────────────────────────────────────────────────────────────────────┘│
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 Décisions Architecturales Clés

#### Decision 1: Pas de SharedArrayBuffer

```
RATIONALE:
- Safari ne supporte pas pleinement SharedArrayBuffer
- Requiert headers COOP/COEP (complexité déploiement)
- Nodebox prouve qu'on peut s'en passer

ALTERNATIVE:
- postMessage pour la communication inter-workers
- Transferable objects pour les gros buffers
- Eventually consistent filesystem
```

#### Decision 2: QuickJS comme Runtime JavaScript Principal

```
RATIONALE:
- 200KB WASM (léger vs V8)
- Exécution synchrone possible
- Sandboxing natif
- Compatible tous navigateurs

UTILISATION:
- Exécution de scripts Node.js
- SSR pour tous frameworks
- Évaluation de code utilisateur
```

#### Decision 3: OPFS pour le Filesystem

```
RATIONALE:
- Origin Private File System (Chrome 86+, Firefox 111+, Safari 15.2+)
- Accès synchrone dans les workers
- Meilleure performance qu'IndexedDB
- Vrai système de fichiers hiérarchique

FALLBACK:
- IndexedDB pour navigateurs non supportés
- Memory fallback pour Safari ancien
```

#### Decision 4: Architecture Worker Pool

```
DESIGN:
- 1 Shell Worker (bash-wasm)
- N Node.js Workers (QuickJS instances)
- 1 Package Manager Worker
- 1 Dev Server Worker

AVANTAGES:
- Isolation des processus
- Parallélisation
- Crash isolation
```

---

## 5. Composants Techniques Détaillés

### 5.1 Terminal System

#### Architecture

```typescript
// terminal/BaviniTerminal.ts
interface BaviniTerminal {
  // Core
  xterm: Terminal;                    // xterm.js instance
  shellWorker: Worker;                // bash-wasm worker
  pty: VirtualPTY;                    // Pseudo-terminal bridge

  // State
  history: string[];                  // Command history
  env: Record<string, string>;        // Environment variables
  cwd: string;                        // Current working directory

  // Methods
  write(data: string): void;          // Write to terminal
  exec(command: string): Promise<ExecResult>;
  resize(cols: number, rows: number): void;
  attachToProcess(pid: number): void;
}
```

#### Shell WASM Options

| Option | Taille | Fonctionnalités | Recommandation |
|--------|--------|-----------------|----------------|
| **bash-wasm** | ~2MB | Bash complet | ✅ Recommandé |
| **BusyBox WASM** | ~800KB | Shell minimal + utils | Alternative légère |
| **dash-wasm** | ~400KB | POSIX shell basique | Fallback |

#### Implémentation PTY Virtuelle

```typescript
// terminal/VirtualPTY.ts
class VirtualPTY {
  private inputBuffer: string[] = [];
  private outputBuffer: string[] = [];
  private echoEnabled = true;
  private lineMode = true;

  // Gestion des escape sequences ANSI
  processInput(data: string): string {
    // Handle arrow keys, Ctrl+C, Ctrl+D, etc.
  }

  processOutput(data: string): string {
    // Handle colors, cursor movement, etc.
  }
}
```

### 5.2 Virtual Filesystem

#### Architecture Multi-Layer

```
┌─────────────────────────────────────────────────────────────┐
│                    VFS API (POSIX-like)                      │
│  open(), read(), write(), mkdir(), readdir(), stat(), etc.  │
└─────────────────────────────┬───────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────┐
│                    Mount Point Manager                       │
│  /project → OPFS    /node_modules → CacheFS    /tmp → MemFS │
└─────────────────────────────┬───────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────┐
│                    Backend Implementations                   │
├─────────────────┬─────────────────┬─────────────────────────┤
│  OPFS Backend   │  IndexedDB      │  Memory Backend         │
│  (persistent)   │  Backend        │  (volatile)             │
└─────────────────┴─────────────────┴─────────────────────────┘
```

#### Spécification API

```typescript
// filesystem/VirtualFS.ts
interface VirtualFS {
  // File operations
  readFile(path: string, encoding?: string): Promise<Buffer | string>;
  writeFile(path: string, data: Buffer | string): Promise<void>;
  appendFile(path: string, data: Buffer | string): Promise<void>;
  unlink(path: string): Promise<void>;

  // Directory operations
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  rmdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  readdir(path: string): Promise<string[]>;

  // Metadata
  stat(path: string): Promise<Stats>;
  lstat(path: string): Promise<Stats>;
  chmod(path: string, mode: number): Promise<void>;

  // Links
  symlink(target: string, path: string): Promise<void>;
  readlink(path: string): Promise<string>;

  // Watch
  watch(path: string, callback: WatchCallback): Unsubscribe;

  // Sync variants (for workers with Atomics)
  readFileSync(path: string, encoding?: string): Buffer | string;
  writeFileSync(path: string, data: Buffer | string): void;
  // ... etc
}
```

#### Stratégie de Caching node_modules

```typescript
// filesystem/NodeModulesCache.ts
class NodeModulesCache {
  // Structure: Map<packageName@version, { files: Map, lastUsed: Date }>
  private cache: LRUCache<string, PackageCache>;

  // Stratégie:
  // 1. Check cache d'abord
  // 2. Si absent, fetch depuis registry (npm, esm.sh)
  // 3. Décompresser en mémoire
  // 4. Stocker dans OPFS pour persistance
  // 5. Montrer dans /node_modules du projet

  async getPackage(name: string, version: string): Promise<PackageFiles> {
    const cacheKey = `${name}@${version}`;

    // Check memory cache
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey)!.files;
    }

    // Check OPFS persistent cache
    const opfsCache = await this.checkOPFSCache(cacheKey);
    if (opfsCache) {
      this.cache.set(cacheKey, opfsCache);
      return opfsCache.files;
    }

    // Fetch from registry
    const tarball = await this.fetchTarball(name, version);
    const files = await this.extractTarball(tarball);

    // Store in caches
    await this.storeInOPFS(cacheKey, files);
    this.cache.set(cacheKey, { files, lastUsed: new Date() });

    return files;
  }
}
```

### 5.3 Package Manager

#### Architecture npm/pnpm Virtuel

```typescript
// package-manager/BaviniPM.ts
class BaviniPackageManager {
  private fs: VirtualFS;
  private registry: PackageRegistry;
  private lockfile: Lockfile;
  private cache: NodeModulesCache;

  // Commands
  async install(packages?: string[]): Promise<InstallResult>;
  async uninstall(packages: string[]): Promise<void>;
  async update(packages?: string[]): Promise<void>;
  async run(script: string): Promise<ExecResult>;
  async exec(binary: string, args: string[]): Promise<ExecResult>;

  // Resolution
  private async resolveDependencies(pkg: PackageJson): Promise<DependencyTree>;
  private async flattenDependencies(tree: DependencyTree): Promise<FlatDeps>;

  // Installation
  private async downloadPackages(deps: FlatDeps): Promise<void>;
  private async linkBinaries(deps: FlatDeps): Promise<void>;
  private async runPostInstall(deps: FlatDeps): Promise<void>;
}
```

#### Registry Strategy

```typescript
// package-manager/PackageRegistry.ts
class PackageRegistry {
  private endpoints = [
    'https://registry.npmjs.org',      // npm officiel
    'https://registry.npmmirror.com',  // Mirror Chine
    'https://esm.sh',                  // ESM direct
  ];

  async getPackageInfo(name: string): Promise<PackageInfo> {
    // Fetch package metadata
  }

  async downloadTarball(name: string, version: string): Promise<ArrayBuffer> {
    // Download and cache tarball
  }
}
```

### 5.4 Node.js Runtime (QuickJS)

#### Architecture

```typescript
// runtime/NodeRuntime.ts
class BaviniNodeRuntime {
  private quickjs: QuickJSContext;
  private fs: VirtualFS;
  private modules: ModuleRegistry;

  // Node.js Globals
  private setupGlobals(): void {
    this.quickjs.setProp('process', this.createProcessObject());
    this.quickjs.setProp('Buffer', this.createBufferClass());
    this.quickjs.setProp('console', this.createConsoleObject());
    this.quickjs.setProp('setTimeout', this.createSetTimeout());
    this.quickjs.setProp('require', this.createRequire());
    // ... etc
  }

  // Module System
  private createRequire(): (id: string) => any {
    return (id: string) => {
      // Handle core modules
      if (this.isBuiltinModule(id)) {
        return this.getBuiltinModule(id);
      }

      // Resolve and load
      const resolved = this.modules.resolve(id, this.cwd);
      return this.loadModule(resolved);
    };
  }
}
```

#### Node.js APIs Prioritaires

| Module | Priorité | Complexité | Implémentation |
|--------|----------|------------|----------------|
| `fs` | P0 | Moyenne | VirtualFS bridge |
| `path` | P0 | Faible | Pure JS |
| `process` | P0 | Moyenne | Shim partiel |
| `events` | P0 | Faible | Pure JS (EventEmitter) |
| `buffer` | P0 | Moyenne | TypedArray wrapper |
| `stream` | P1 | Haute | Web Streams adapter |
| `http` | P1 | Haute | Service Worker bridge |
| `crypto` | P1 | Moyenne | Web Crypto API |
| `child_process` | P2 | Haute | Worker spawn |
| `net` | P2 | Très haute | TCP simulation |
| `dns` | P3 | Moyenne | DoH (DNS over HTTPS) |

### 5.5 Network Stack

#### HTTP Server Virtuel

```typescript
// network/VirtualHTTPServer.ts
class VirtualHTTPServer {
  private port: number;
  private handler: RequestHandler;
  private serviceWorker: ServiceWorkerRegistration;

  listen(port: number, callback?: () => void): this {
    this.port = port;

    // Register route with Service Worker
    this.serviceWorker.active?.postMessage({
      type: 'REGISTER_SERVER',
      port,
      workerId: self.name,
    });

    callback?.();
    return this;
  }

  // Incoming request from Service Worker
  handleRequest(request: VirtualRequest): VirtualResponse {
    // Route to handler
    return this.handler(request, new VirtualResponse());
  }
}
```

#### Service Worker Networking

```typescript
// network/NetworkServiceWorker.ts
// Installé sur /sw.js

self.addEventListener('fetch', (event: FetchEvent) => {
  const url = new URL(event.request.url);

  // Intercept localhost:* requests
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    const port = parseInt(url.port || '80');

    // Route to registered virtual server
    const server = this.registeredServers.get(port);
    if (server) {
      event.respondWith(
        this.routeToVirtualServer(server, event.request)
      );
      return;
    }
  }

  // Pass through to network
  event.respondWith(fetch(event.request));
});
```

### 5.6 Build System (HMR)

#### Hot Module Replacement

```typescript
// build/HMRServer.ts
class HMRServer {
  private connections: Set<WebSocket>;
  private moduleGraph: ModuleGraph;

  // File change detected
  async handleFileChange(path: string): Promise<void> {
    const affectedModules = this.moduleGraph.getAffectedModules(path);

    for (const module of affectedModules) {
      // Recompile module
      const compiled = await this.compiler.compile(module.path);

      // Send update to clients
      this.broadcast({
        type: 'update',
        path: module.path,
        code: compiled.code,
        css: compiled.css,
      });
    }
  }

  // Client-side HMR runtime
  getClientRuntime(): string {
    return `
      const ws = new WebSocket('ws://localhost:__HMR_PORT__');
      ws.onmessage = (event) => {
        const update = JSON.parse(event.data);
        if (update.type === 'update') {
          // Apply update without full reload
          __BAVINI_HMR__.applyUpdate(update);
        }
      };
    `;
  }
}
```

---

## 6. Plan d'Implémentation par Phases

### Phase 1: Fondations (4-6 semaines)

```
OBJECTIF: Virtual Filesystem + Terminal basique
```

#### Semaine 1-2: Virtual Filesystem OPFS

```
Tâches:
├── [ ] Implémenter OPFS backend
│   ├── [ ] Wrapper API synchrone pour workers
│   ├── [ ] Wrapper API async pour main thread
│   └── [ ] Tests unitaires complets
├── [ ] Implémenter IndexedDB fallback
│   ├── [ ] Même API que OPFS backend
│   └── [ ] Detection automatique du support
├── [ ] Implémenter Memory backend
│   └── [ ] Pour /tmp et tests
├── [ ] Mount Point Manager
│   ├── [ ] API mount/unmount
│   └── [ ] Path resolution cross-mounts
└── [ ] Intégration avec Browser Runtime existant
    ├── [ ] Remplacer Map<string, string>
    └── [ ] Tests de régression
```

**Fichiers à créer:**
```
app/lib/runtime/filesystem/
├── VirtualFS.ts                 # Interface principale
├── backends/
│   ├── OPFSBackend.ts          # Origin Private FS
│   ├── IndexedDBBackend.ts     # Fallback IDB
│   └── MemoryBackend.ts        # Volatile memory
├── MountManager.ts              # Gestion des mount points
├── PathResolver.ts              # Résolution de chemins
├── WatchManager.ts              # File watching
└── __tests__/
    ├── VirtualFS.spec.ts
    └── backends.spec.ts
```

#### Semaine 3-4: Terminal Core

```
Tâches:
├── [ ] Intégration xterm.js avancée
│   ├── [ ] WebGL renderer (performance)
│   ├── [ ] Addon: fit, unicode11, webLinks
│   └── [ ] Theming (synchronisé avec UI)
├── [ ] Virtual PTY
│   ├── [ ] Input processing (escape sequences)
│   ├── [ ] Output processing (ANSI colors)
│   └── [ ] Line editing (readline-like)
├── [ ] Shell Worker (bash-wasm)
│   ├── [ ] Compilation bash → WASM
│   ├── [ ] Intégration avec VirtualFS
│   └── [ ] Environment variables
└── [ ] Commandes builtin
    ├── [ ] cd, pwd, ls, cat, echo
    ├── [ ] mkdir, rm, cp, mv
    └── [ ] export, env, which
```

**Fichiers à créer:**
```
app/lib/runtime/terminal/
├── BaviniTerminal.tsx           # Composant React
├── VirtualPTY.ts                # Pseudo-terminal
├── ShellWorker.ts               # Worker bash-wasm
├── builtins/
│   ├── cd.ts
│   ├── ls.ts
│   ├── cat.ts
│   └── ...
└── __tests__/
    ├── terminal.spec.ts
    └── pty.spec.ts
```

#### Semaine 5-6: Intégration UI

```
Tâches:
├── [ ] Panel Terminal dans Workbench
│   ├── [ ] Toggle terminal (Ctrl+`)
│   ├── [ ] Multiple terminal tabs
│   └── [ ] Split terminal
├── [ ] File Explorer amélioré
│   ├── [ ] Synchronisé avec VirtualFS
│   ├── [ ] Drag & drop
│   └── [ ] Context menu (delete, rename)
├── [ ] Output panel
│   ├── [ ] Logs de build
│   ├── [ ] Errors avec liens cliquables
│   └── [ ] Filtres (errors, warnings, info)
└── [ ] Tests E2E
    ├── [ ] Playwright tests terminal
    └── [ ] Playwright tests filesystem
```

### Phase 2: Package Management (4-5 semaines)

```
OBJECTIF: npm install fonctionnel
```

#### Semaine 7-8: Package Resolution

```
Tâches:
├── [ ] Package Registry Client
│   ├── [ ] Fetch package metadata
│   ├── [ ] Version resolution (semver)
│   └── [ ] Tarball download
├── [ ] Dependency Resolution
│   ├── [ ] Tree resolution (comme npm)
│   ├── [ ] Conflict resolution
│   └── [ ] Peer dependencies
├── [ ] Lockfile Support
│   ├── [ ] package-lock.json parser
│   ├── [ ] pnpm-lock.yaml parser
│   └── [ ] Lockfile generation
└── [ ] Package Cache
    ├── [ ] Memory LRU cache
    ├── [ ] OPFS persistent cache
    └── [ ] Cache invalidation
```

**Fichiers à créer:**
```
app/lib/runtime/package-manager/
├── BaviniPM.ts                  # Package manager principal
├── registry/
│   ├── RegistryClient.ts        # npm registry client
│   ├── TarballExtractor.ts      # Extraction .tgz
│   └── VersionResolver.ts       # Semver resolution
├── resolution/
│   ├── DependencyTree.ts        # Arbre de dépendances
│   ├── Flattener.ts             # Flatten pour node_modules
│   └── PeerResolver.ts          # Peer deps
├── lockfile/
│   ├── PackageLock.ts           # npm lockfile
│   └── PnpmLock.ts              # pnpm lockfile
├── cache/
│   ├── PackageCache.ts          # LRU cache
│   └── OPFSCache.ts             # Persistent cache
└── __tests__/
```

#### Semaine 9-10: npm Commands

```
Tâches:
├── [ ] npm install
│   ├── [ ] Fresh install
│   ├── [ ] Install specific packages
│   ├── [ ] --save / --save-dev
│   └── [ ] Progress reporting
├── [ ] npm uninstall
│   ├── [ ] Remove from node_modules
│   └── [ ] Update package.json
├── [ ] npm run <script>
│   ├── [ ] Parse package.json scripts
│   ├── [ ] Execute in shell
│   └── [ ] Pre/post scripts
├── [ ] npx
│   ├── [ ] Download and execute
│   └── [ ] Cache executables
└── [ ] Binary linking
    ├── [ ] node_modules/.bin
    └── [ ] PATH management
```

#### Semaine 11: Integration & Polish

```
Tâches:
├── [ ] Terminal integration
│   ├── [ ] npm, npx, pnpm commands
│   ├── [ ] Tab completion
│   └── [ ] Progress spinners
├── [ ] Error handling
│   ├── [ ] Network errors
│   ├── [ ] Version conflicts
│   └── [ ] User-friendly messages
├── [ ] Performance optimization
│   ├── [ ] Parallel downloads
│   ├── [ ] Streaming extraction
│   └── [ ] Memory optimization
└── [ ] Tests E2E
    ├── [ ] npm install react
    ├── [ ] Create-react-app clone
    └── [ ] Monorepo basic
```

### Phase 3: Node.js Runtime (5-6 semaines)

```
OBJECTIF: Exécution Node.js complète
```

#### Semaine 12-13: QuickJS Integration

```
Tâches:
├── [ ] QuickJS-emscripten setup
│   ├── [ ] WASM loading optimisé
│   ├── [ ] Contexte isolation
│   └── [ ] Memory management
├── [ ] Node.js Globals
│   ├── [ ] process object
│   ├── [ ] Buffer class
│   ├── [ ] console (avec colors)
│   ├── [ ] timers (setTimeout, setInterval)
│   └── [ ] __dirname, __filename
├── [ ] Module System
│   ├── [ ] require() implementation
│   ├── [ ] ESM import/export
│   ├── [ ] Module caching
│   └── [ ] Circular dependency handling
└── [ ] Core modules bootstrap
    ├── [ ] path (pure JS)
    ├── [ ] events (EventEmitter)
    └── [ ] util (basic functions)
```

**Fichiers à créer:**
```
app/lib/runtime/node/
├── BaviniNode.ts                # Runtime principal
├── globals/
│   ├── process.ts
│   ├── buffer.ts
│   ├── console.ts
│   └── timers.ts
├── modules/
│   ├── require.ts               # CommonJS require
│   ├── esm.ts                   # ES Modules
│   └── resolver.ts              # Module resolution
├── core-modules/
│   ├── path.ts
│   ├── events.ts
│   ├── util.ts
│   ├── fs.ts                    # VirtualFS bridge
│   ├── stream.ts
│   └── ...
└── __tests__/
```

#### Semaine 14-15: Core Modules

```
Tâches:
├── [ ] fs module
│   ├── [ ] Sync methods (readFileSync, etc.)
│   ├── [ ] Async/callback methods
│   ├── [ ] Promise API (fs/promises)
│   └── [ ] Streams (createReadStream, etc.)
├── [ ] stream module
│   ├── [ ] Readable
│   ├── [ ] Writable
│   ├── [ ] Transform
│   └── [ ] Duplex
├── [ ] http/https modules
│   ├── [ ] createServer (VirtualHTTPServer)
│   ├── [ ] request (fetch wrapper)
│   └── [ ] IncomingMessage, ServerResponse
├── [ ] crypto module
│   ├── [ ] Web Crypto API bridge
│   ├── [ ] createHash, createHmac
│   └── [ ] randomBytes
└── [ ] child_process module
    ├── [ ] spawn (Worker spawn)
    ├── [ ] exec
    └── [ ] fork
```

#### Semaine 16-17: Advanced Runtime

```
Tâches:
├── [ ] Worker process isolation
│   ├── [ ] Process spawning
│   ├── [ ] IPC messaging
│   └── [ ] Signal handling (SIGINT, SIGTERM)
├── [ ] Network stack
│   ├── [ ] net module (TCP simulation)
│   ├── [ ] dns module (DoH)
│   └── [ ] WebSocket server
├── [ ] Performance
│   ├── [ ] Startup optimization
│   ├── [ ] Memory pooling
│   └── [ ] JIT warmup
└── [ ] Debugging
    ├── [ ] Stack traces
    ├── [ ] Source maps
    └── [ ] Inspector protocol (basic)
```

### Phase 4: Dev Server & HMR (3-4 semaines)

```
OBJECTIF: Experience développeur proche de Vite
```

#### Semaine 18-19: Dev Server

```
Tâches:
├── [ ] Virtual HTTP Server
│   ├── [ ] localhost:* interception
│   ├── [ ] Static file serving
│   └── [ ] API routing
├── [ ] Build pipeline
│   ├── [ ] On-demand compilation
│   ├── [ ] Module graph
│   └── [ ] Dependency pre-bundling
├── [ ] Framework integrations
│   ├── [ ] Vite config parsing
│   ├── [ ] Next.js dev mode
│   ├── [ ] Astro dev mode
│   └── [ ] SvelteKit dev mode
└── [ ] Error overlay
    ├── [ ] Compile errors
    ├── [ ] Runtime errors
    └── [ ] Stack trace mapping
```

#### Semaine 20-21: Hot Module Replacement

```
Tâches:
├── [ ] HMR Runtime
│   ├── [ ] WebSocket connection
│   ├── [ ] Module update protocol
│   └── [ ] State preservation
├── [ ] Framework HMR
│   ├── [ ] React Fast Refresh
│   ├── [ ] Vue HMR
│   ├── [ ] Svelte HMR
│   └── [ ] CSS HMR
├── [ ] File watcher integration
│   ├── [ ] VirtualFS watch events
│   ├── [ ] Debouncing
│   └── [ ] Glob patterns
└── [ ] Full page reload fallback
    ├── [ ] When HMR fails
    └── [ ] Config changes
```

### Phase 5: Polish & Production (3-4 semaines)

```
OBJECTIF: Production-ready
```

#### Semaine 22-23: Performance

```
Tâches:
├── [ ] Startup optimization
│   ├── [ ] Lazy loading workers
│   ├── [ ] WASM precompilation
│   └── [ ] Parallel initialization
├── [ ] Memory optimization
│   ├── [ ] Module cache limits
│   ├── [ ] Garbage collection hints
│   └── [ ] Worker recycling
├── [ ] Bundle optimization
│   ├── [ ] Code splitting support
│   ├── [ ] Tree shaking
│   └── [ ] Minification
└── [ ] Metrics & monitoring
    ├── [ ] Performance API
    ├── [ ] Memory usage tracking
    └── [ ] Build time metrics
```

#### Semaine 24-25: Testing & Documentation

```
Tâches:
├── [ ] Test suites
│   ├── [ ] Unit tests (90%+ coverage)
│   ├── [ ] Integration tests
│   └── [ ] E2E tests (Playwright)
├── [ ] Compatibility testing
│   ├── [ ] Chrome, Firefox, Safari, Edge
│   ├── [ ] Mobile browsers
│   └── [ ] Node.js version compat
├── [ ] Documentation
│   ├── [ ] Architecture guide
│   ├── [ ] API reference
│   └── [ ] Migration guide
└── [ ] Examples
    ├── [ ] React + Vite
    ├── [ ] Next.js
    ├── [ ] Astro
    └── [ ] Vue + Nuxt
```

---

## 7. Spécifications de Performance

### 7.1 Targets

| Métrique | Target | Acceptable | Current |
|----------|--------|------------|---------|
| Cold boot | < 1.5s | < 2.5s | 3-4s |
| Hot boot (cached) | < 500ms | < 1s | N/A |
| npm install (empty) | < 2s | < 4s | N/A |
| npm install (10 deps) | < 5s | < 10s | N/A |
| First build (React) | < 2s | < 4s | 3-8s |
| HMR update | < 100ms | < 300ms | N/A |
| Terminal keystroke | < 16ms | < 50ms | N/A |
| Memory usage (idle) | < 100MB | < 150MB | 100-200MB |
| Memory usage (active) | < 256MB | < 400MB | 200-300MB |

### 7.2 Benchmarks à Implémenter

```typescript
// benchmarks/performance.ts
const benchmarks = {
  bootTime: {
    measure: () => {
      const start = performance.now();
      // Boot WebContainer
      return performance.now() - start;
    },
    target: 1500, // ms
  },

  npmInstall: {
    measure: async () => {
      const start = performance.now();
      await pm.install(['react', 'react-dom']);
      return performance.now() - start;
    },
    target: 5000, // ms
  },

  buildReact: {
    measure: async () => {
      const start = performance.now();
      await buildService.build({ entry: '/src/main.tsx' });
      return performance.now() - start;
    },
    target: 2000, // ms
  },

  hmrUpdate: {
    measure: async () => {
      const start = performance.now();
      // Modify file and measure until UI update
      return performance.now() - start;
    },
    target: 100, // ms
  },
};
```

### 7.3 Optimisations Clés

#### Startup Optimization

```
1. WASM Precompilation
   - Compiler QuickJS/bash WASM au build time
   - Stocker le module compilé dans IndexedDB
   - Instantiation directe sans recompilation

2. Parallel Initialization
   - Boot workers en parallèle
   - Charger filesystem pendant init WASM
   - Prefetch packages populaires

3. Lazy Loading
   - Charger compilateurs à la demande
   - Différer chargement terminal si non visible
   - Code splitting pour l'UI
```

#### Memory Optimization

```
1. Worker Recycling
   - Pool de workers réutilisables
   - Cleanup automatique après inactivité
   - Limite sur nombre de workers

2. Cache Management
   - LRU pour modules npm
   - Eviction proactive basée sur mémoire
   - Compression pour cache persistant

3. Streaming Processing
   - Stream tarballs au lieu de buffer complet
   - Streaming compilation pour gros fichiers
   - Chunked responses pour network
```

---

## 8. Sécurité et Isolation

### 8.1 Modèle de Sécurité

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Trust Boundaries                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    BAVINI Application                         │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐   │   │
│  │  │ UI Layer    │  │ Stores      │  │ Workers             │   │   │
│  │  │ (trusted)   │  │ (trusted)   │  │ (trusted)           │   │   │
│  │  └─────────────┘  └─────────────┘  └─────────────────────┘   │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                              │                                       │
│  ════════════════════════════╪═══════════════════════════════════   │
│                              │ Sandbox Boundary                      │
│  ════════════════════════════╪═══════════════════════════════════   │
│                              │                                       │
│  ┌──────────────────────────▼───────────────────────────────────┐   │
│  │                    QuickJS Sandbox                            │   │
│  │  ┌─────────────────────────────────────────────────────────┐ │   │
│  │  │               User Code Execution                        │ │   │
│  │  │  - No access to host APIs                                │ │   │
│  │  │  - Limited memory                                        │ │   │
│  │  │  - Timeout enforcement                                   │ │   │
│  │  │  - No network access (proxied)                          │ │   │
│  │  └─────────────────────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │                    Preview Iframe                             │   │
│  │  ┌─────────────────────────────────────────────────────────┐ │   │
│  │  │               sandbox="allow-scripts"                    │ │   │
│  │  │  - Isolated origin (srcdoc)                             │ │   │
│  │  │  - No access to parent                                   │ │   │
│  │  │  - Limited APIs (no geolocation, etc.)                  │ │   │
│  │  └─────────────────────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### 8.2 Contrôles de Sécurité

| Risque | Contrôle | Implémentation |
|--------|----------|----------------|
| Code malveillant | QuickJS sandbox | Exécution isolée, pas d'accès host |
| Fuite mémoire | Memory limits | Limite par worker, timeout |
| DoS (infinite loop) | Execution timeout | 30s max par script |
| XSS | Content sanitization | DOMPurify, CSP headers |
| Prototype pollution | Object.freeze | Freeze globals |
| Path traversal | Path normalization | Validation stricte |
| SSRF | Network proxy | Whitelist domains |
| Secret exposure | No .env access | Variables injectées |

### 8.3 Content Security Policy

```typescript
// security/csp.ts
const contentSecurityPolicy = {
  'default-src': ["'self'"],
  'script-src': [
    "'self'",
    "'unsafe-eval'",  // Pour QuickJS
    'blob:',          // Pour workers
    'https://esm.sh', // CDN packages
  ],
  'style-src': [
    "'self'",
    "'unsafe-inline'", // Pour Tailwind
  ],
  'connect-src': [
    "'self'",
    'https://registry.npmjs.org',
    'https://esm.sh',
    'wss://*',  // HMR WebSocket
  ],
  'frame-src': [
    "'self'",
    'blob:',
    'about:',
  ],
  'worker-src': [
    "'self'",
    'blob:',
  ],
};
```

---

## 9. Risques et Mitigations

### 9.1 Risques Techniques

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| OPFS non supporté | Moyenne | Haut | IndexedDB fallback |
| QuickJS perf insuffisante | Faible | Haut | Profiling, optimisation |
| npm packages incompatibles | Haute | Moyen | Polyfills, alternatives |
| Memory leaks workers | Moyenne | Haut | Monitoring, recycling |
| Service Worker bugs | Moyenne | Moyen | Fallback srcdoc |

### 9.2 Risques Projet

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| Scope creep | Haute | Haut | Phases strictes, MVP |
| Complexité sous-estimée | Moyenne | Haut | Prototypes, spikes |
| Dépendances externes | Moyenne | Moyen | Vendor lock-in minimal |
| Maintenance long terme | Faible | Moyen | Documentation, tests |

### 9.3 Plan de Fallback

```
SI Phase 1 échoue:
  → Améliorer Browser Runtime existant
  → Focus sur HMR et preview amélioré
  → Terminal simulé (commandes limitées)

SI Phase 2 échoue:
  → Continuer avec esm.sh CDN
  → Support package.json basique
  → Pas de npm install réel

SI Phase 3 échoue:
  → Garder compilation client-side
  → SSR optionnel via API backend
  → QuickJS pour eval seulement
```

---

## 10. Ressources et Références

### 10.1 Projets de Référence

| Projet | Lien | Utilité |
|--------|------|---------|
| WebContainer API | [webcontainers.io](https://webcontainers.io/) | Architecture de référence |
| Nodebox | [github.com/Sandpack/nodebox-runtime](https://github.com/Sandpack/nodebox-runtime) | Implémentation open source |
| quickjs-emscripten | [github.com/justjake/quickjs-emscripten](https://github.com/justjake/quickjs-emscripten) | Runtime JavaScript WASM |
| xterm.js | [xtermjs.org](https://xtermjs.org/) | Terminal emulator |
| Wasmer | [wasmer.io](https://wasmer.io/) | WASI runtime |
| esm.sh | [esm.sh](https://esm.sh/) | CDN ESM |

### 10.2 Documentation Technique

| Sujet | Ressource |
|-------|-----------|
| OPFS | [MDN: Origin Private File System](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system) |
| Web Workers | [MDN: Using Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers) |
| Service Workers | [MDN: Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API) |
| SharedArrayBuffer | [MDN: SharedArrayBuffer](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer) |
| WASI | [WASI Spec](https://github.com/WebAssembly/WASI) |

### 10.3 Estimation Ressources

| Ressource | Quantité | Notes |
|-----------|----------|-------|
| Développeurs Senior | 2-3 | Full-stack, WASM experience |
| Durée totale | 5-6 mois | Avec buffer 20% |
| Budget WASM/Rust | 1 dev | Pour optimisations critiques |
| QA/Testing | 1 | Dernier mois intensif |

---

## Annexes

### A. Glossaire

| Terme | Définition |
|-------|------------|
| **OPFS** | Origin Private File System - API navigateur pour filesystem persistant |
| **QuickJS** | Moteur JavaScript léger, compilable en WASM |
| **HMR** | Hot Module Replacement - mise à jour sans refresh |
| **PTY** | Pseudo-Terminal - interface terminal virtuelle |
| **WASI** | WebAssembly System Interface - accès système pour WASM |

### B. Changelog

| Date | Version | Changements |
|------|---------|-------------|
| 2026-01-21 | 1.0 | Document initial |

---

*Document généré pour BAVINI Cloud - Confidentiel*
