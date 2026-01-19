# BAVINI Runtime - Plan de Développement Complet

> **Version**: 1.0
> **Date**: 2026-01-19
> **Objectif**: Créer un runtime browser-based 100% indépendant pour remplacer WebContainer
> **License cible**: MIT (toutes les dépendances)

---

## Table des Matières

1. [Vision & Objectifs](#1-vision--objectifs)
2. [Architecture Technique](#2-architecture-technique)
3. [Stack Technologique](#3-stack-technologique)
4. [Structure du Projet](#4-structure-du-projet)
5. [Phases de Développement](#5-phases-de-développement)
6. [Détail des Composants](#6-détail-des-composants)
7. [APIs Exposées](#7-apis-exposées)
8. [Gestion des Limitations](#8-gestion-des-limitations)
9. [Tests & Qualité](#9-tests--qualité)
10. [Risques & Mitigations](#10-risques--mitigations)
11. [Métriques de Succès](#11-métriques-de-succès)
12. [Calendrier](#12-calendrier)

---

## 1. Vision & Objectifs

### 1.1 Vision

Créer **BAVINI Runtime**, un environnement d'exécution JavaScript/Node.js complet qui fonctionne entièrement dans le navigateur, sans aucune dépendance à des services tiers propriétaires (WebContainer, Nodebox).

### 1.2 Objectifs Principaux

| # | Objectif | Priorité | Critère de Succès |
|---|----------|----------|-------------------|
| O1 | Exécuter du code JavaScript/TypeScript | P0 | 100% des projets React/Vue/Svelte fonctionnent |
| O2 | Système de fichiers virtuel complet | P0 | CRUD + watch + persistence |
| O3 | Terminal interactif fonctionnel | P0 | Commandes shell basiques + npm |
| O4 | Installation de packages npm | P0 | npm install fonctionne |
| O5 | Dev server avec hot reload | P1 | localhost simulé + HMR |
| O6 | Support multi-frameworks | P1 | React, Vue, Svelte, Astro, Next.js |
| O7 | Cross-browser compatibility | P1 | Chrome, Firefox, Safari, Edge |
| O8 | Performance acceptable | P2 | Boot < 3s, build < 5s |
| O9 | Persistence des projets | P2 | IndexedDB + export/import |
| O10 | 100% open source | P0 | MIT License uniquement |

### 1.3 Ce que BAVINI Runtime N'EST PAS

- ❌ Un émulateur Node.js complet (certaines APIs manqueront)
- ❌ Un remplacement pour le développement local natif
- ❌ Compatible avec les native modules (C/C++ addons)
- ❌ Capable d'accéder au système de fichiers réel
- ❌ Capable de connexions TCP/UDP natives

---

## 2. Architecture Technique

### 2.1 Vue d'Ensemble

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           BAVINI RUNTIME                                     │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         APPLICATION LAYER                            │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │   │
│  │  │   Editor    │ │  Terminal   │ │   Preview   │ │  File Tree  │   │   │
│  │  │  (Monaco/   │ │  (xterm.js) │ │  (iframe)   │ │  (React)    │   │   │
│  │  │  CodeMirror)│ │             │ │             │ │             │   │   │
│  │  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘ └──────┬──────┘   │   │
│  └─────────┼───────────────┼───────────────┼───────────────┼─────────┘   │
│            │               │               │               │             │
│  ┌─────────┴───────────────┴───────────────┴───────────────┴─────────┐   │
│  │                      RUNTIME MANAGER (Main Thread)                 │   │
│  │  ┌─────────────────────────────────────────────────────────────┐  │   │
│  │  │  • Process Orchestration    • Event Bus (Message Passing)   │  │   │
│  │  │  • File System Facade       • Build Coordination            │  │   │
│  │  └─────────────────────────────────────────────────────────────┘  │   │
│  └────────────────────────────────┬──────────────────────────────────┘   │
│                                   │                                       │
│            ┌──────────────────────┼──────────────────────┐               │
│            │                      │                      │               │
│  ┌─────────▼─────────┐  ┌────────▼────────┐  ┌─────────▼─────────┐      │
│  │   JS ENGINE       │  │   FILE SYSTEM   │  │   PACKAGE MGR     │      │
│  │   WORKER          │  │   WORKER        │  │   WORKER          │      │
│  │  ┌─────────────┐  │  │  ┌───────────┐  │  │  ┌─────────────┐  │      │
│  │  │  QuickJS    │  │  │  │  memfs    │  │  │  │  NPM        │  │      │
│  │  │  WASM       │  │  │  │  + IDB    │  │  │  │  Resolver   │  │      │
│  │  └─────────────┘  │  │  └───────────┘  │  │  └─────────────┘  │      │
│  └───────────────────┘  └─────────────────┘  └───────────────────┘      │
│            │                      │                      │               │
│  ┌─────────▼─────────┐  ┌────────▼────────┐  ┌─────────▼─────────┐      │
│  │   SHELL           │  │   NETWORK       │  │   BUILD           │      │
│  │   WORKER          │  │   SERVICE WKR   │  │   WORKER          │      │
│  │  ┌─────────────┐  │  │  ┌───────────┐  │  │  ┌─────────────┐  │      │
│  │  │  Bash/Shell │  │  │  │  HTTP     │  │  │  │  esbuild    │  │      │
│  │  │  Commands   │  │  │  │  Intercept│  │  │  │  WASM       │  │      │
│  │  └─────────────┘  │  │  └───────────┘  │  │  └─────────────┘  │      │
│  └───────────────────┘  └─────────────────┘  └───────────────────┘      │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Communication Inter-Workers

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          MESSAGE BUS                                      │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│   Main Thread ◄─────────────────────────────────────────────────────►    │
│       │                                                                  │
│       │  postMessage / onmessage (structured clone)                      │
│       │                                                                  │
│       ├──────► JS Engine Worker                                          │
│       │           • EXEC_CODE                                            │
│       │           • EVAL_EXPRESSION                                      │
│       │           • IMPORT_MODULE                                        │
│       │                                                                  │
│       ├──────► File System Worker                                        │
│       │           • READ_FILE                                            │
│       │           • WRITE_FILE                                           │
│       │           • WATCH_FILE                                           │
│       │           • LIST_DIR                                             │
│       │                                                                  │
│       ├──────► Package Manager Worker                                    │
│       │           • INSTALL_PACKAGE                                      │
│       │           • RESOLVE_IMPORT                                       │
│       │           • GET_PACKAGE_INFO                                     │
│       │                                                                  │
│       ├──────► Shell Worker                                              │
│       │           • EXEC_COMMAND                                         │
│       │           • SPAWN_PROCESS                                        │
│       │           • KILL_PROCESS                                         │
│       │                                                                  │
│       └──────► Build Worker                                              │
│                   • BUILD_PROJECT                                        │
│                   • TRANSFORM_FILE                                       │
│                   • WATCH_BUILD                                          │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

### 2.3 Flux de Données

```
User Action (type in terminal: npm install react)
    │
    ▼
┌─────────────────┐
│  Terminal UI    │  xterm.js capture input
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Shell Worker   │  Parse command: npm install react
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Package Mgr    │  1. Resolve 'react' from esm.sh
│  Worker         │  2. Fetch package + dependencies
└────────┬────────┘  3. Cache in IndexedDB
         │
         ▼
┌─────────────────┐
│  File System    │  Write to /node_modules/react/...
│  Worker         │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Shell Worker   │  Return success to terminal
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Terminal UI    │  Display: "added 1 package"
└─────────────────┘
```

---

## 3. Stack Technologique

### 3.1 Dépendances Core

| Composant | Package | Version | License | Taille | Rôle |
|-----------|---------|---------|---------|--------|------|
| **JS Engine** | `quickjs-emscripten` | ^0.29.0 | MIT | ~1.3MB | Exécution JS sandboxée |
| **File System** | `memfs` | ^4.6.0 | MIT | ~150KB | FS in-memory |
| **File System** | `@aspect-build/fs-browser` | ^1.0.0 | MIT | ~50KB | IndexedDB persistence |
| **Terminal** | `xterm` | ^5.3.0 | MIT | ~300KB | Terminal UI |
| **Terminal** | `@xterm/addon-fit` | ^0.10.0 | MIT | ~10KB | Auto-resize |
| **Terminal** | `@xterm/addon-web-links` | ^0.11.0 | MIT | ~15KB | Clickable links |
| **Bundler** | `esbuild-wasm` | ^0.20.0 | MIT | ~10MB | Build/Transform |
| **Shell** | Custom | - | MIT | ~50KB | Shell command parser |

### 3.2 CDN pour Packages NPM

| CDN | URL | Usage | Fallback Priority |
|-----|-----|-------|-------------------|
| **esm.sh** | `https://esm.sh/` | Primary - ESM conversion | 1 |
| **jsDelivr** | `https://cdn.jsdelivr.net/npm/` | Secondary - Raw files | 2 |
| **unpkg** | `https://unpkg.com/` | Tertiary - Fallback | 3 |

### 3.3 APIs Browser Utilisées

| API | Usage | Support |
|-----|-------|---------|
| **Web Workers** | Isolation des processus | ✅ Tous browsers |
| **Service Workers** | Interception réseau | ✅ Tous browsers |
| **IndexedDB** | Persistence | ✅ Tous browsers |
| **Blob/URL.createObjectURL** | Preview | ✅ Tous browsers |
| **postMessage** | Communication inter-workers | ✅ Tous browsers |
| **SharedArrayBuffer** | ❌ NON UTILISÉ | N/A |

---

## 4. Structure du Projet

### 4.1 Organisation des Fichiers

```
app/lib/bavini-runtime/
├── index.ts                      # Export principal
├── types.ts                      # Types TypeScript partagés
├── constants.ts                  # Constantes (CDN URLs, timeouts, etc.)
│
├── core/
│   ├── runtime-manager.ts        # Orchestrateur principal
│   ├── message-bus.ts            # Communication inter-workers
│   ├── event-emitter.ts          # Événements runtime
│   └── logger.ts                 # Logging centralisé
│
├── engine/
│   ├── js-engine.worker.ts       # Worker QuickJS
│   ├── quickjs-wrapper.ts        # Abstraction QuickJS
│   ├── module-loader.ts          # Chargement ES Modules
│   └── node-polyfills.ts         # Polyfills APIs Node.js
│
├── filesystem/
│   ├── fs.worker.ts              # Worker File System
│   ├── virtual-fs.ts             # Abstraction memfs
│   ├── persistence.ts            # IndexedDB sync
│   ├── watchers.ts               # File watchers
│   └── path-utils.ts             # Utilitaires path
│
├── package-manager/
│   ├── npm.worker.ts             # Worker NPM
│   ├── resolver.ts               # Résolution de packages
│   ├── fetcher.ts                # Fetch depuis CDN
│   ├── cache.ts                  # Cache LRU + IndexedDB
│   ├── lockfile.ts               # package-lock.json parsing
│   └── registry.ts               # npm registry API
│
├── shell/
│   ├── shell.worker.ts           # Worker Shell
│   ├── parser.ts                 # Parse commandes
│   ├── commands/
│   │   ├── index.ts              # Registry commandes
│   │   ├── fs-commands.ts        # ls, cd, mkdir, rm, cat, etc.
│   │   ├── npm-commands.ts       # npm install, npm run, etc.
│   │   ├── git-commands.ts       # git status, git add, etc.
│   │   ├── node-commands.ts      # node, npx
│   │   └── utils-commands.ts     # echo, env, export, etc.
│   ├── process.ts                # Gestion processus
│   └── environment.ts            # Variables d'environnement
│
├── build/
│   ├── build.worker.ts           # Worker Build
│   ├── bundler.ts                # esbuild wrapper
│   ├── dev-server.ts             # Dev server simulation
│   ├── hot-reload.ts             # HMR implementation
│   └── compilers/
│       ├── index.ts              # Registry compilers
│       ├── typescript.ts         # TS → JS
│       ├── vue.ts                # Vue SFC
│       ├── svelte.ts             # Svelte
│       └── astro.ts              # Astro
│
├── network/
│   ├── network.service-worker.ts # Service Worker réseau
│   ├── http-interceptor.ts       # Interception fetch
│   ├── localhost-proxy.ts        # Simulation localhost
│   └── websocket-shim.ts         # WebSocket simulation
│
├── preview/
│   ├── preview-manager.ts        # Gestion preview
│   ├── iframe-sandbox.ts         # Sandbox iframe
│   ├── console-capture.ts        # Capture console.log
│   └── error-overlay.ts          # Affichage erreurs
│
└── adapters/
    ├── bavini-adapter.ts         # Adapter pour BAVINI existant
    └── webcontainer-compat.ts    # Couche compatibilité API WC
```

### 4.2 Intégration avec BAVINI Existant

```
app/lib/runtime/
├── adapters/
│   ├── browser-build-adapter.ts    # EXISTANT - À conserver comme fallback
│   ├── webcontainer-adapter.ts     # EXISTANT - À remplacer progressivement
│   └── bavini-runtime-adapter.ts   # NOUVEAU - Utilise BAVINI Runtime
│
├── factory.ts                       # MODIFIER - Ajouter bavini-runtime
└── index.ts                         # MODIFIER - Exporter nouveau runtime
```

---

## 5. Phases de Développement

### Phase 1 : Foundation (Semaines 1-4)

#### Objectif
Créer le squelette du runtime avec communication inter-workers fonctionnelle.

#### Semaine 1 : Setup & Architecture

| Tâche | Description | Fichiers | Estimation |
|-------|-------------|----------|------------|
| 1.1 | Créer structure de dossiers | `bavini-runtime/*` | 2h |
| 1.2 | Définir types TypeScript | `types.ts` | 4h |
| 1.3 | Implémenter Message Bus | `core/message-bus.ts` | 8h |
| 1.4 | Implémenter Event Emitter | `core/event-emitter.ts` | 4h |
| 1.5 | Setup tests unitaires | `__tests__/*` | 4h |

#### Semaine 2 : File System Core

| Tâche | Description | Fichiers | Estimation |
|-------|-------------|----------|------------|
| 2.1 | Intégrer memfs | `filesystem/virtual-fs.ts` | 8h |
| 2.2 | Créer FS Worker | `filesystem/fs.worker.ts` | 8h |
| 2.3 | Implémenter CRUD ops | `filesystem/virtual-fs.ts` | 8h |
| 2.4 | Ajouter path resolution | `filesystem/path-utils.ts` | 4h |
| 2.5 | Tests FS | `__tests__/filesystem.spec.ts` | 4h |

#### Semaine 3 : JS Engine Core

| Tâche | Description | Fichiers | Estimation |
|-------|-------------|----------|------------|
| 3.1 | Intégrer quickjs-emscripten | `engine/quickjs-wrapper.ts` | 12h |
| 3.2 | Créer Engine Worker | `engine/js-engine.worker.ts` | 8h |
| 3.3 | Implémenter eval/exec | `engine/quickjs-wrapper.ts` | 8h |
| 3.4 | Ajouter ES Module loader | `engine/module-loader.ts` | 8h |
| 3.5 | Tests Engine | `__tests__/engine.spec.ts` | 4h |

#### Semaine 4 : Runtime Manager

| Tâche | Description | Fichiers | Estimation |
|-------|-------------|----------|------------|
| 4.1 | Créer Runtime Manager | `core/runtime-manager.ts` | 12h |
| 4.2 | Connecter FS + Engine | `core/runtime-manager.ts` | 8h |
| 4.3 | Implémenter lifecycle | `core/runtime-manager.ts` | 8h |
| 4.4 | Tests d'intégration | `__tests__/integration.spec.ts` | 8h |
| 4.5 | Documentation Phase 1 | `docs/phase1.md` | 4h |

#### Livrables Phase 1
- ✅ Workers communiquent via Message Bus
- ✅ File System virtuel fonctionnel
- ✅ Exécution JavaScript basique
- ✅ Tests unitaires > 80% coverage

---

### Phase 2 : Shell & Terminal (Semaines 5-8)

#### Objectif
Terminal interactif avec commandes shell basiques.

#### Semaine 5 : Terminal UI

| Tâche | Description | Fichiers | Estimation |
|-------|-------------|----------|------------|
| 5.1 | Intégrer xterm.js | `shell/terminal.tsx` | 8h |
| 5.2 | Créer Shell Worker | `shell/shell.worker.ts` | 8h |
| 5.3 | Connecter input/output | `shell/shell.worker.ts` | 8h |
| 5.4 | Styling terminal | `shell/terminal.css` | 4h |
| 5.5 | Tests terminal | `__tests__/terminal.spec.ts` | 4h |

#### Semaine 6 : Shell Parser

| Tâche | Description | Fichiers | Estimation |
|-------|-------------|----------|------------|
| 6.1 | Parser de commandes | `shell/parser.ts` | 12h |
| 6.2 | Support arguments/flags | `shell/parser.ts` | 8h |
| 6.3 | Support pipes (basic) | `shell/parser.ts` | 8h |
| 6.4 | Support redirections | `shell/parser.ts` | 8h |
| 6.5 | Tests parser | `__tests__/parser.spec.ts` | 4h |

#### Semaine 7 : Commandes FS

| Tâche | Description | Fichiers | Estimation |
|-------|-------------|----------|------------|
| 7.1 | Commande `ls` | `shell/commands/fs-commands.ts` | 4h |
| 7.2 | Commande `cd` | `shell/commands/fs-commands.ts` | 2h |
| 7.3 | Commandes `mkdir/rmdir` | `shell/commands/fs-commands.ts` | 4h |
| 7.4 | Commandes `touch/rm` | `shell/commands/fs-commands.ts` | 4h |
| 7.5 | Commandes `cat/echo` | `shell/commands/fs-commands.ts` | 4h |
| 7.6 | Commandes `cp/mv` | `shell/commands/fs-commands.ts` | 6h |
| 7.7 | Commande `pwd` | `shell/commands/fs-commands.ts` | 1h |
| 7.8 | Tests commandes | `__tests__/commands.spec.ts` | 8h |

#### Semaine 8 : Process Management

| Tâche | Description | Fichiers | Estimation |
|-------|-------------|----------|------------|
| 8.1 | Gestion processus | `shell/process.ts` | 12h |
| 8.2 | Variables d'env | `shell/environment.ts` | 8h |
| 8.3 | Commandes `env/export` | `shell/commands/utils-commands.ts` | 4h |
| 8.4 | Background processes | `shell/process.ts` | 8h |
| 8.5 | Tests process | `__tests__/process.spec.ts` | 4h |

#### Livrables Phase 2
- ✅ Terminal xterm.js intégré
- ✅ Commandes shell basiques (ls, cd, mkdir, rm, cat, etc.)
- ✅ Parser de commandes avec pipes/redirections
- ✅ Gestion des variables d'environnement

---

### Phase 3 : Package Manager (Semaines 9-12)

#### Objectif
npm install fonctionnel avec résolution de dépendances.

#### Semaine 9 : NPM Resolver

| Tâche | Description | Fichiers | Estimation |
|-------|-------------|----------|------------|
| 9.1 | Créer NPM Worker | `package-manager/npm.worker.ts` | 8h |
| 9.2 | Résolution packages | `package-manager/resolver.ts` | 12h |
| 9.3 | Parsing package.json | `package-manager/resolver.ts` | 4h |
| 9.4 | Dependency tree | `package-manager/resolver.ts` | 8h |
| 9.5 | Tests resolver | `__tests__/resolver.spec.ts` | 4h |

#### Semaine 10 : Package Fetcher

| Tâche | Description | Fichiers | Estimation |
|-------|-------------|----------|------------|
| 10.1 | Fetch depuis esm.sh | `package-manager/fetcher.ts` | 8h |
| 10.2 | Fallback CDNs | `package-manager/fetcher.ts` | 6h |
| 10.3 | Cache LRU mémoire | `package-manager/cache.ts` | 8h |
| 10.4 | Cache IndexedDB | `package-manager/cache.ts` | 8h |
| 10.5 | Tests fetcher | `__tests__/fetcher.spec.ts` | 4h |

#### Semaine 11 : NPM Commands

| Tâche | Description | Fichiers | Estimation |
|-------|-------------|----------|------------|
| 11.1 | `npm install` | `shell/commands/npm-commands.ts` | 12h |
| 11.2 | `npm install <pkg>` | `shell/commands/npm-commands.ts` | 8h |
| 11.3 | `npm uninstall` | `shell/commands/npm-commands.ts` | 4h |
| 11.4 | `npm list` | `shell/commands/npm-commands.ts` | 4h |
| 11.5 | `npm run` | `shell/commands/npm-commands.ts` | 8h |
| 11.6 | Tests npm | `__tests__/npm.spec.ts` | 4h |

#### Semaine 12 : Node Commands

| Tâche | Description | Fichiers | Estimation |
|-------|-------------|----------|------------|
| 12.1 | Commande `node` | `shell/commands/node-commands.ts` | 8h |
| 12.2 | Commande `npx` | `shell/commands/node-commands.ts` | 8h |
| 12.3 | Support scripts | `shell/commands/node-commands.ts` | 8h |
| 12.4 | Node polyfills | `engine/node-polyfills.ts` | 8h |
| 12.5 | Tests node | `__tests__/node.spec.ts` | 4h |

#### Livrables Phase 3
- ✅ `npm install` fonctionne
- ✅ Résolution de dépendances
- ✅ Cache packages (mémoire + IndexedDB)
- ✅ Commandes npm/node/npx

---

### Phase 4 : Build System (Semaines 13-16)

#### Objectif
Build et bundling avec support dev server.

#### Semaine 13 : Build Worker

| Tâche | Description | Fichiers | Estimation |
|-------|-------------|----------|------------|
| 13.1 | Créer Build Worker | `build/build.worker.ts` | 8h |
| 13.2 | Intégrer esbuild-wasm | `build/bundler.ts` | 8h |
| 13.3 | Configuration build | `build/bundler.ts` | 8h |
| 13.4 | Support TypeScript | `build/compilers/typescript.ts` | 8h |
| 13.5 | Tests build | `__tests__/build.spec.ts` | 4h |

#### Semaine 14 : Framework Compilers

| Tâche | Description | Fichiers | Estimation |
|-------|-------------|----------|------------|
| 14.1 | Compiler Vue SFC | `build/compilers/vue.ts` | 8h |
| 14.2 | Compiler Svelte | `build/compilers/svelte.ts` | 8h |
| 14.3 | Compiler Astro | `build/compilers/astro.ts` | 8h |
| 14.4 | Registry compilers | `build/compilers/index.ts` | 4h |
| 14.5 | Tests compilers | `__tests__/compilers.spec.ts` | 4h |

#### Semaine 15 : Dev Server

| Tâche | Description | Fichiers | Estimation |
|-------|-------------|----------|------------|
| 15.1 | Dev server simulation | `build/dev-server.ts` | 12h |
| 15.2 | Service Worker network | `network/network.service-worker.ts` | 12h |
| 15.3 | Localhost proxy | `network/localhost-proxy.ts` | 8h |
| 15.4 | Tests dev server | `__tests__/dev-server.spec.ts` | 4h |

#### Semaine 16 : Hot Reload

| Tâche | Description | Fichiers | Estimation |
|-------|-------------|----------|------------|
| 16.1 | File watchers | `filesystem/watchers.ts` | 8h |
| 16.2 | HMR implementation | `build/hot-reload.ts` | 12h |
| 16.3 | WebSocket shim (HMR) | `network/websocket-shim.ts` | 8h |
| 16.4 | Tests HMR | `__tests__/hmr.spec.ts` | 4h |

#### Livrables Phase 4
- ✅ Build TypeScript/JavaScript
- ✅ Support Vue/Svelte/Astro
- ✅ Dev server simulé
- ✅ Hot Module Replacement

---

### Phase 5 : Preview & Integration (Semaines 17-20)

#### Objectif
Preview fonctionnelle et intégration avec BAVINI.

#### Semaine 17 : Preview System

| Tâche | Description | Fichiers | Estimation |
|-------|-------------|----------|------------|
| 17.1 | Preview Manager | `preview/preview-manager.ts` | 8h |
| 17.2 | Iframe sandbox | `preview/iframe-sandbox.ts` | 8h |
| 17.3 | Console capture | `preview/console-capture.ts` | 8h |
| 17.4 | Error overlay | `preview/error-overlay.ts` | 8h |
| 17.5 | Tests preview | `__tests__/preview.spec.ts` | 4h |

#### Semaine 18 : Persistence

| Tâche | Description | Fichiers | Estimation |
|-------|-------------|----------|------------|
| 18.1 | IndexedDB persistence | `filesystem/persistence.ts` | 12h |
| 18.2 | Project export/import | `filesystem/persistence.ts` | 8h |
| 18.3 | Auto-save | `filesystem/persistence.ts` | 8h |
| 18.4 | Tests persistence | `__tests__/persistence.spec.ts` | 4h |

#### Semaine 19 : BAVINI Adapter

| Tâche | Description | Fichiers | Estimation |
|-------|-------------|----------|------------|
| 19.1 | Créer adapter | `adapters/bavini-adapter.ts` | 12h |
| 19.2 | Compatibilité API | `adapters/webcontainer-compat.ts` | 8h |
| 19.3 | Intégrer workbench | `stores/workbench.ts` (modifier) | 8h |
| 19.4 | Tests intégration | `__tests__/adapter.spec.ts` | 4h |

#### Semaine 20 : Polish & Documentation

| Tâche | Description | Fichiers | Estimation |
|-------|-------------|----------|------------|
| 20.1 | Bug fixes | Various | 16h |
| 20.2 | Performance tuning | Various | 8h |
| 20.3 | Documentation API | `docs/api.md` | 8h |
| 20.4 | Documentation usage | `docs/usage.md` | 4h |
| 20.5 | README | `bavini-runtime/README.md` | 4h |

#### Livrables Phase 5
- ✅ Preview iframe fonctionnelle
- ✅ Persistence IndexedDB
- ✅ Adapter compatible BAVINI
- ✅ Documentation complète

---

## 6. Détail des Composants

### 6.1 JS Engine (QuickJS)

#### Capacités
```typescript
interface JSEngine {
  // Évaluation de code
  eval(code: string): Promise<any>;
  evalModule(code: string, filename: string): Promise<any>;

  // Gestion des modules
  importModule(specifier: string): Promise<any>;
  registerModule(name: string, exports: object): void;

  // Globals
  setGlobal(name: string, value: any): void;
  getGlobal(name: string): any;

  // Lifecycle
  dispose(): void;
}
```

#### Polyfills Node.js à implémenter
```typescript
// Priorité haute (P0)
const P0_POLYFILLS = [
  'console',
  'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
  'Buffer',
  'process.env', 'process.cwd', 'process.exit',
  'require', 'module', 'exports',
  '__dirname', '__filename',
];

// Priorité moyenne (P1)
const P1_POLYFILLS = [
  'fs.readFileSync', 'fs.writeFileSync',
  'path.join', 'path.resolve', 'path.dirname', 'path.basename',
  'url.parse', 'url.format',
  'crypto.randomBytes', 'crypto.createHash',
];

// Priorité basse (P2)
const P2_POLYFILLS = [
  'events.EventEmitter',
  'stream.Readable', 'stream.Writable',
  'util.promisify', 'util.inspect',
];
```

### 6.2 File System (memfs)

#### API
```typescript
interface VirtualFileSystem {
  // CRUD
  readFile(path: string): Promise<string | Uint8Array>;
  writeFile(path: string, content: string | Uint8Array): Promise<void>;
  deleteFile(path: string): Promise<void>;
  exists(path: string): Promise<boolean>;

  // Directories
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  rmdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  readdir(path: string): Promise<string[]>;

  // Stats
  stat(path: string): Promise<FileStat>;

  // Watch
  watch(path: string, callback: WatchCallback): Unsubscribe;

  // Bulk operations
  writeFiles(files: Map<string, string>): Promise<void>;
  readAllFiles(): Promise<Map<string, string>>;

  // Persistence
  persist(): Promise<void>;
  restore(): Promise<void>;
  export(): Promise<Blob>;
  import(blob: Blob): Promise<void>;
}
```

### 6.3 Shell Commands

#### Commandes Implémentées
```
FILESYSTEM
├── ls [-la] [path]           # List directory
├── cd <path>                 # Change directory
├── pwd                       # Print working directory
├── mkdir [-p] <path>         # Create directory
├── rmdir <path>              # Remove directory
├── touch <file>              # Create empty file
├── rm [-rf] <path>           # Remove file/directory
├── cat <file>                # Display file content
├── echo <text>               # Print text
├── cp [-r] <src> <dest>      # Copy
├── mv <src> <dest>           # Move
└── find <path> -name <pat>   # Find files

NPM
├── npm install [pkg]         # Install packages
├── npm uninstall <pkg>       # Uninstall package
├── npm list                  # List installed
├── npm run <script>          # Run script
├── npm init [-y]             # Initialize project
└── npm version               # Show version

NODE
├── node <file>               # Execute JS file
├── node -e "<code>"          # Evaluate code
└── npx <command>             # Execute npm binary

UTILS
├── env                       # List environment
├── export VAR=val            # Set environment
├── clear                     # Clear terminal
├── history                   # Command history
├── which <cmd>               # Locate command
└── exit                      # Exit shell
```

### 6.4 Package Manager

#### Résolution de Dépendances
```
npm install react react-dom
        │
        ▼
┌─────────────────────────────────────────┐
│  1. Parse package names                 │
│     → ['react', 'react-dom']            │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  2. Resolve versions from registry      │
│     → react@18.2.0, react-dom@18.2.0    │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  3. Build dependency tree               │
│     react@18.2.0                        │
│     └── loose-envify@1.4.0              │
│         └── js-tokens@4.0.0             │
│     react-dom@18.2.0                    │
│     └── scheduler@0.23.0                │
│         └── loose-envify@1.4.0 (dedup)  │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  4. Fetch from CDN (parallel)           │
│     → esm.sh/react@18.2.0               │
│     → esm.sh/react-dom@18.2.0           │
│     → esm.sh/scheduler@0.23.0           │
│     → esm.sh/loose-envify@1.4.0         │
│     → esm.sh/js-tokens@4.0.0            │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  5. Write to virtual node_modules       │
│     /node_modules/react/                │
│     /node_modules/react-dom/            │
│     /node_modules/scheduler/            │
│     /node_modules/.cache/ (ESM bundles) │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  6. Update package.json & lockfile      │
└─────────────────────────────────────────┘
```

### 6.5 Network Layer

#### Service Worker Strategy
```typescript
// network/network.service-worker.ts

self.addEventListener('fetch', (event: FetchEvent) => {
  const url = new URL(event.request.url);

  // Intercept localhost requests
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
    event.respondWith(handleLocalhost(event.request, url));
    return;
  }

  // Intercept npm package requests
  if (url.hostname === 'esm.sh' || url.hostname === 'cdn.jsdelivr.net') {
    event.respondWith(handleCDN(event.request));
    return;
  }

  // Pass through everything else
  event.respondWith(fetch(event.request));
});

async function handleLocalhost(request: Request, url: URL): Promise<Response> {
  const port = parseInt(url.port) || 3000;
  const path = url.pathname;

  // Get the dev server for this port
  const server = await DevServerRegistry.get(port);
  if (!server) {
    return new Response('Server not running', { status: 502 });
  }

  // Handle the request
  return server.handleRequest(request, path);
}
```

---

## 7. APIs Exposées

### 7.1 API Principale

```typescript
// bavini-runtime/index.ts

export interface BaviniRuntime {
  // Lifecycle
  boot(): Promise<void>;
  shutdown(): Promise<void>;

  // File System
  fs: VirtualFileSystem;

  // Terminal
  terminal: {
    attach(element: HTMLElement): void;
    detach(): void;
    write(data: string): void;
    onData(callback: (data: string) => void): Unsubscribe;
  };

  // Process
  spawn(command: string, args?: string[]): Process;
  exec(command: string): Promise<ExecResult>;

  // Build
  build(options: BuildOptions): Promise<BuildResult>;
  startDevServer(options: DevServerOptions): Promise<DevServer>;

  // Preview
  getPreviewUrl(): string | null;
  onPreviewReady(callback: (url: string) => void): Unsubscribe;

  // Events
  on(event: RuntimeEvent, callback: EventCallback): Unsubscribe;

  // State
  getStatus(): RuntimeStatus;
}

// Factory
export function createBaviniRuntime(options?: RuntimeOptions): BaviniRuntime;
```

### 7.2 Compatibilité WebContainer

```typescript
// adapters/webcontainer-compat.ts

// Cette couche permet une migration progressive
// Le code existant utilisant WebContainer fonctionnera

export class WebContainerCompat {
  // Méthodes WebContainer → BAVINI Runtime

  static async boot(): Promise<WebContainerCompat> {
    const runtime = createBaviniRuntime();
    await runtime.boot();
    return new WebContainerCompat(runtime);
  }

  async mount(files: FileSystemTree): Promise<void> {
    // Convertir FileSystemTree → Map<string, string>
    await this.runtime.fs.writeFiles(convertTree(files));
  }

  async spawn(command: string, args: string[]): Promise<WebContainerProcess> {
    const process = this.runtime.spawn(command, args);
    return new WebContainerProcessCompat(process);
  }

  get fs(): FileSystemAPI {
    return new FileSystemAPICompat(this.runtime.fs);
  }
}
```

---

## 8. Gestion des Limitations

### 8.1 Ce qui NE SERA PAS supporté

| Fonctionnalité | Raison | Alternative |
|----------------|--------|-------------|
| Native modules (N-API) | Pas de compilation C/C++ dans browser | Utiliser alternatives JS/WASM |
| TCP/UDP sockets natifs | Pas d'accès réseau bas niveau | HTTP via Service Worker |
| Child process fork | Pas de vrai multiprocessing | Web Workers |
| Certains crypto (bcrypt) | Pas de native bindings | crypto-js, Web Crypto API |
| Accès fichiers système | Sandbox browser | File System Access API (opt-in) |
| Bases de données locales | Pas de sockets | Supabase, PlanetScale (HTTP) |

### 8.2 Messages d'Erreur Clairs

```typescript
const UNSUPPORTED_ERRORS = {
  'native_module': {
    message: 'Ce package utilise des modules natifs non supportés dans le browser.',
    suggestion: 'Recherchez une alternative JavaScript ou WASM.',
    docs: '/docs/limitations#native-modules'
  },
  'tcp_socket': {
    message: 'Les connexions TCP directes ne sont pas possibles dans le browser.',
    suggestion: 'Utilisez une base de données HTTP comme Supabase.',
    docs: '/docs/limitations#networking'
  },
  // ...
};
```

---

## 9. Tests & Qualité

### 9.1 Stratégie de Tests

```
┌─────────────────────────────────────────────────────────────┐
│                    PYRAMIDE DE TESTS                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│                    ┌─────────────┐                          │
│                    │    E2E      │  10%                     │
│                    │  (Playwright)│                         │
│                    └──────┬──────┘                          │
│                           │                                 │
│               ┌───────────┴───────────┐                     │
│               │     Integration       │  30%                │
│               │   (Vitest + JSDOM)    │                     │
│               └───────────┬───────────┘                     │
│                           │                                 │
│       ┌───────────────────┴───────────────────┐             │
│       │             Unit Tests                │  60%        │
│       │              (Vitest)                 │             │
│       └───────────────────────────────────────┘             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 9.2 Coverage Cibles

| Module | Target Coverage |
|--------|-----------------|
| Core | 90% |
| File System | 85% |
| JS Engine | 80% |
| Shell | 85% |
| Package Manager | 80% |
| Build | 75% |
| Network | 70% |
| Preview | 70% |

### 9.3 Tests de Performance

```typescript
// __tests__/performance.spec.ts

describe('Performance Benchmarks', () => {
  it('should boot in < 3 seconds', async () => {
    const start = performance.now();
    const runtime = await createBaviniRuntime().boot();
    const bootTime = performance.now() - start;

    expect(bootTime).toBeLessThan(3000);
  });

  it('should build React app in < 5 seconds', async () => {
    // Setup React project
    await runtime.fs.writeFiles(REACT_PROJECT_FILES);

    const start = performance.now();
    await runtime.build({ entryPoint: '/src/main.tsx' });
    const buildTime = performance.now() - start;

    expect(buildTime).toBeLessThan(5000);
  });

  it('should npm install react in < 10 seconds', async () => {
    const start = performance.now();
    await runtime.exec('npm install react react-dom');
    const installTime = performance.now() - start;

    expect(installTime).toBeLessThan(10000);
  });
});
```

---

## 10. Risques & Mitigations

### 10.1 Risques Techniques

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| QuickJS incompatibilités | Moyenne | Élevé | Tests extensifs, fallback esbuild |
| Performance insuffisante | Moyenne | Élevé | Profiling, Web Workers, cache aggressif |
| Mémoire browser limitée | Moyenne | Moyen | Cleanup agressif, lazy loading |
| CDN esm.sh down | Faible | Élevé | Fallback jsDelivr/unpkg |
| Service Worker issues | Moyenne | Moyen | Fallback sans SW |

### 10.2 Risques Projet

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| Scope creep | Élevée | Élevé | MVP strict, phases claires |
| Estimation optimiste | Élevée | Moyen | Buffer 20% par phase |
| Dépendances abandonnées | Faible | Moyen | Audit régulier, alternatives |

### 10.3 Plan de Contingence

```
SI QuickJS ne fonctionne pas bien:
  → Utiliser esbuild-wasm pour tout (plus limité mais stable)

SI esm.sh est down:
  → Fallback automatique vers jsDelivr
  → Cache IndexedDB pour packages déjà installés

SI performance inacceptable:
  → Réduire scope (pas de HMR, build à la demande)
  → Utiliser WebContainer en fallback
```

---

## 11. Métriques de Succès

### 11.1 Métriques Fonctionnelles

| Métrique | Cible | Mesure |
|----------|-------|--------|
| Projets React fonctionnels | 95% | Tests templates |
| Projets Vue fonctionnels | 90% | Tests templates |
| Projets Svelte fonctionnels | 90% | Tests templates |
| npm install success rate | 85% | Monitoring |
| Build success rate | 90% | Monitoring |

### 11.2 Métriques Performance

| Métrique | Cible | Acceptable |
|----------|-------|------------|
| Boot time | < 2s | < 3s |
| Build time (React) | < 3s | < 5s |
| npm install (5 packages) | < 5s | < 10s |
| Memory usage | < 200MB | < 300MB |
| First preview | < 5s | < 8s |

### 11.3 Métriques Qualité

| Métrique | Cible |
|----------|-------|
| Test coverage | > 80% |
| Bug escape rate | < 5% |
| Documentation coverage | 100% public APIs |

---

## 12. Calendrier

### 12.1 Timeline Globale

```
2026
│
├── Semaines 1-4   │ Phase 1: Foundation
│   Janvier        │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
│                  │
├── Semaines 5-8   │ Phase 2: Shell & Terminal
│   Février        │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
│                  │
├── Semaines 9-12  │ Phase 3: Package Manager
│   Mars           │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
│                  │
├── Semaines 13-16 │ Phase 4: Build System
│   Avril          │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
│                  │
├── Semaines 17-20 │ Phase 5: Preview & Integration
│   Mai            │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
│                  │
└── Semaine 21+    │ Buffer & Stabilisation
    Juin           │ ░░░░░░░░░░░░░░░░░░░░
```

### 12.2 Milestones

| Milestone | Date | Critères |
|-----------|------|----------|
| **M1: Foundation** | Fin Semaine 4 | Workers + FS + Engine basique |
| **M2: Terminal MVP** | Fin Semaine 8 | Terminal + commandes shell |
| **M3: NPM Works** | Fin Semaine 12 | npm install fonctionnel |
| **M4: Build Works** | Fin Semaine 16 | Build + Dev server |
| **M5: Integration** | Fin Semaine 20 | BAVINI adapter complet |
| **M6: Production** | Semaine 24 | Stable, documenté, déployé |

### 12.3 Checkpoints de Décision

```
Après Phase 1 (Semaine 4):
  ❓ QuickJS fonctionne-t-il bien ?
  ❓ Performance acceptable ?
  → GO/NO-GO pour continuer

Après Phase 3 (Semaine 12):
  ❓ npm install fiable ?
  ❓ Dépendances résolues correctement ?
  → GO/NO-GO pour dev server

Après Phase 5 (Semaine 20):
  ❓ Parité suffisante avec WebContainer ?
  ❓ Prêt pour production ?
  → GO/NO-GO pour migration
```

---

## Annexes

### A. Dépendances NPM Complètes

```json
{
  "dependencies": {
    "quickjs-emscripten": "^0.29.0",
    "memfs": "^4.6.0",
    "xterm": "^5.3.0",
    "@xterm/addon-fit": "^0.10.0",
    "@xterm/addon-web-links": "^0.11.0",
    "esbuild-wasm": "^0.20.0",
    "idb-keyval": "^6.2.0"
  },
  "devDependencies": {
    "vitest": "^1.0.0",
    "@vitest/coverage-v8": "^1.0.0",
    "playwright": "^1.40.0"
  }
}
```

### B. Ressources & Documentation

- [QuickJS Documentation](https://bellard.org/quickjs/quickjs.html)
- [quickjs-emscripten GitHub](https://github.com/justjake/quickjs-emscripten)
- [memfs Documentation](https://github.com/streamich/memfs)
- [xterm.js Documentation](https://xtermjs.org/docs/)
- [esbuild API](https://esbuild.github.io/api/)
- [Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [Web Workers API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API)

### C. Glossaire

| Terme | Définition |
|-------|------------|
| **WASM** | WebAssembly - format binaire pour exécution performante |
| **Worker** | Thread isolé dans le browser (Web Worker) |
| **Service Worker** | Worker spécial pour interception réseau |
| **memfs** | Système de fichiers en mémoire |
| **CDN** | Content Delivery Network |
| **HMR** | Hot Module Replacement |
| **esm.sh** | CDN qui convertit npm packages en ES Modules |

---

**Document créé le**: 2026-01-19
**Dernière mise à jour**: 2026-01-19
**Auteur**: Claude (Architecte DevTools)
**Status**: PRÊT POUR VALIDATION
