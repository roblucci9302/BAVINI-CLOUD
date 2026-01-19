# BAVINI Runtime

## Une Nouvelle Génération de Runtime JavaScript/TypeScript pour le Navigateur

**Version:** 1.0.0-draft
**Date:** Janvier 2025
**Auteurs:** Équipe BAVINI

---

## Table des Matières

1. [Résumé Exécutif](#résumé-exécutif)
2. [Problématique Actuelle](#problématique-actuelle)
3. [État de l'Art](#état-de-lart)
4. [Architecture BAVINI Runtime](#architecture-bavini-runtime)
5. [Composants Techniques](#composants-techniques)
6. [Implémentation Détaillée](#implémentation-détaillée)
7. [Feuille de Route](#feuille-de-route)
8. [Avantage Concurrentiel](#avantage-concurrentiel)
9. [Modèle Commercial](#modèle-commercial)
10. [Références](#références)

---

## 1. Résumé Exécutif

**BAVINI Runtime** est une technologie de nouvelle génération permettant d'exécuter des applications Node.js complètes directement dans le navigateur, **sans serveur**, **sans SharedArrayBuffer obligatoire**, et avec des **performances quasi-natives**.

### Vision

Créer le premier runtime JavaScript/TypeScript entièrement browser-native capable de :
- Compiler Tailwind CSS, PostCSS, et tout préprocesseur en temps réel
- Bundler des applications React/Vue/Svelte avec hot-reload
- Exécuter npm install et résoudre les dépendances instantanément
- Fonctionner sur **tous les navigateurs** (Safari iOS inclus)
- Offrir des performances comparables à un environnement local

### Différenciation Clé

| Caractéristique | WebContainer | Nodebox | **BAVINI Runtime** |
|-----------------|--------------|---------|-------------------|
| SharedArrayBuffer requis | ✅ Oui | ❌ Non | ❌ Non |
| Safari/iOS Support | ❌ Non | ✅ Oui | ✅ Oui |
| Open Source | ❌ Non | ❌ Non | ✅ **Oui** |
| PostCSS natif | ✅ Oui | ⚠️ Limité | ✅ **Oui** |
| Performance bundling | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| Latence cold start | ~2-3s | ~1-2s | **<500ms** |
| Taille WASM | ~15MB | ~8MB | **<5MB** |

---

## 2. Problématique Actuelle

### 2.1 Limites des Solutions Existantes

#### WebContainer (StackBlitz)
- **Dépendance à SharedArrayBuffer** : Nécessite des headers COOP/COEP, incompatible avec Safari iOS
- **Propriétaire** : Code source fermé, impossible à auditer ou personnaliser
- **Cold start** : 2-3 secondes pour initialiser l'environnement
- **Taille** : ~15MB de WASM à télécharger

#### Nodebox (CodeSandbox)
- **Propriétaire** : Technologie fermée
- **Limitations** : Pas de support pour les modules natifs compilés
- **Performance** : Plus lent que WebContainer sur le bundling

#### esbuild-wasm (Solution actuelle BAVINI)
- **Performance dégradée** : 10-22x plus lent que la version native
- **Pas de PostCSS** : Impossible de compiler @tailwind directives
- **Single-threaded** : Compilation Go vers WASM non optimisée

### 2.2 Conséquences pour BAVINI

```
┌─────────────────────────────────────────────────────────────┐
│  Code généré par l'IA                                       │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  @tailwind base;                                     │   │
│  │  @tailwind components;                               │   │
│  │  @tailwind utilities;                                │   │
│  │                                                      │   │
│  │  .hero { @apply bg-gradient-to-r from-blue-500; }   │   │
│  └─────────────────────────────────────────────────────┘   │
│                          ↓                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  esbuild-wasm (Browser Preview)                     │   │
│  │  ❌ Ne comprend pas @tailwind                        │   │
│  │  ❌ Ne comprend pas @apply                           │   │
│  │  → Output: CSS brut non transformé                   │   │
│  └─────────────────────────────────────────────────────┘   │
│                          ↓                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  RÉSULTAT: UI "CATASTROPHIQUE"                      │   │
│  │  • Pas de styles Tailwind                            │   │
│  │  • Layout cassé                                      │   │
│  │  • Design amateur                                    │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. État de l'Art

### 3.1 Technologies WASM Disponibles

#### Runtimes WASM Matures

| Runtime | Langage | Browser | Threads | Performance |
|---------|---------|---------|---------|-------------|
| Wasmtime | Rust | ❌ | ✅ | ⭐⭐⭐⭐⭐ |
| Wasmer | Rust | ✅ | ✅ | ⭐⭐⭐⭐ |
| WasmEdge | C++ | ✅ | ✅ | ⭐⭐⭐⭐ |
| **jco** | JS | ✅ | ❌ | ⭐⭐⭐ |

**jco** est particulièrement intéressant car il est conçu spécifiquement pour "running in JS environments and browsers".

#### Compilateurs WASM Performants

| Outil | Fonction | Performance vs Native | Taille WASM |
|-------|----------|----------------------|-------------|
| Rolldown | Bundler | **~10x plus rapide que esbuild-wasm** | ~3MB |
| SWC | Compiler TS/JSX | 20x plus rapide que Babel | ~2MB |
| Lightning CSS | CSS Parser | 100x plus rapide que PostCSS | ~1MB |
| oxc | Parser JS | Plus rapide que SWC | ~1.5MB |

### 3.2 WASI Preview 2 et Component Model

Le **WebAssembly Component Model** (standardisé janvier 2024) révolutionne l'interopérabilité :

```
┌────────────────────────────────────────────────────────────┐
│                    WASI Component Model                     │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐            │
│  │  Rolldown │    │   SWC    │    │Lightning │            │
│  │   (Rust)  │◄──►│  (Rust)  │◄──►│   CSS    │            │
│  └──────────┘    └──────────┘    └──────────┘            │
│        │              │              │                     │
│        └──────────────┴──────────────┘                     │
│                       │                                    │
│              ┌────────▼────────┐                          │
│              │   WIT Interface │                          │
│              │  (Type System)  │                          │
│              └────────┬────────┘                          │
│                       │                                    │
│              ┌────────▼────────┐                          │
│              │  JavaScript API │                          │
│              │   (Browser)     │                          │
│              └─────────────────┘                          │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

### 3.3 WASI 0.3 (Preview 3) - 2025

WASI 0.3 apporte la **concurrence composable** :
- Async function calls natives
- Typed streams
- Composable futures

**Date prévue** : Août 2025 (preview), Novembre 2025 (stable)

### 3.4 Systèmes de Fichiers Browser

| Solution | Stockage | Performance | API |
|----------|----------|-------------|-----|
| IndexedDB | Persistant | ⭐⭐ | Async |
| **OPFS** | Persistant | ⭐⭐⭐⭐ | Sync (Worker) |
| Memory FS | Volatile | ⭐⭐⭐⭐⭐ | Sync |
| BrowserFS | Hybride | ⭐⭐⭐ | Node-like |

**OPFS (Origin Private File System)** est 3-4x plus rapide qu'IndexedDB et offre un accès byte-by-byte.

---

## 4. Architecture BAVINI Runtime

### 4.1 Vue d'Ensemble

```
┌─────────────────────────────────────────────────────────────────────┐
│                        BAVINI Runtime                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌───────────────────────────────────────────────────────────────┐  │
│  │                      JavaScript API Layer                      │  │
│  │  • BaviniRuntime.create()                                     │  │
│  │  • runtime.mount(files)                                       │  │
│  │  • runtime.build({ entry, format })                           │  │
│  │  • runtime.preview()                                          │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                               │                                      │
│  ┌───────────────────────────▼───────────────────────────────────┐  │
│  │                    Virtual Process Manager                     │  │
│  │  • Process isolation (Web Workers)                            │  │
│  │  • IPC via MessageChannel                                     │  │
│  │  • Environment variables                                      │  │
│  │  • Signal handling                                            │  │
│  └───────────────────────────────────────────────────────────────┘  │
│                               │                                      │
│  ┌─────────────┬─────────────┼─────────────┬─────────────────────┐  │
│  │             │             │             │                     │  │
│  ▼             ▼             ▼             ▼                     │  │
│ ┌───┐       ┌───┐       ┌───┐       ┌───────────┐              │  │
│ │VFS│       │NPM│       │BLD│       │  PREVIEW  │              │  │
│ │   │       │   │       │   │       │           │              │  │
│ └───┘       └───┘       └───┘       └───────────┘              │  │
│                                                                      │
│  Virtual     Package      Build        Preview                       │
│  FileSystem  Manager      Pipeline     Server                        │
│                                                                      │
├─────────────────────────────────────────────────────────────────────┤
│                        WASM Component Layer                          │
├───────────┬───────────┬───────────┬───────────┬────────────────────┤
│  Rolldown │    SWC    │ Lightning │   oxc     │    Brotli         │
│   WASM    │   WASM    │ CSS WASM  │   WASM    │    WASM           │
│ (Bundler) │(Compiler) │ (CSS)     │ (Parser)  │  (Compress)       │
└───────────┴───────────┴───────────┴───────────┴────────────────────┘
```

### 4.2 Principes de Design

#### 4.2.1 Zero SharedArrayBuffer Dependency

```typescript
// ❌ WebContainer approach (requires SAB)
const buffer = new SharedArrayBuffer(1024);
Atomics.wait(new Int32Array(buffer), 0, 0);

// ✅ BAVINI Runtime approach (universal)
const channel = new MessageChannel();
const worker = new Worker('process.js');
worker.postMessage({ type: 'exec', cmd: 'npm install' }, [channel.port2]);

// Async coordination via structured cloning
channel.port1.onmessage = (event) => {
  const { result, error } = event.data;
  if (error) reject(error);
  else resolve(result);
};
```

#### 4.2.2 Lazy WASM Loading

```typescript
// Chargement progressif des composants WASM
const wasmModules = {
  rolldown: () => import('@bavini/rolldown-wasm'),
  swc: () => import('@bavini/swc-wasm'),
  lightningcss: () => import('@bavini/lightningcss-wasm'),
};

// Charger uniquement ce qui est nécessaire
async function buildCSS(source: string) {
  const { transform } = await wasmModules.lightningcss();
  return transform({ code: source, minify: true });
}
```

#### 4.2.3 OPFS-First Storage

```typescript
class BaviniFileSystem {
  private opfsRoot: FileSystemDirectoryHandle | null = null;
  private memoryFS: Map<string, Uint8Array> = new Map();

  async init() {
    try {
      // Tenter OPFS d'abord (3-4x plus rapide)
      this.opfsRoot = await navigator.storage.getDirectory();
    } catch {
      // Fallback sur memory FS
      console.info('OPFS unavailable, using memory filesystem');
    }
  }

  async writeFile(path: string, content: Uint8Array) {
    if (this.opfsRoot) {
      const handle = await this.getFileHandle(path, { create: true });
      const writable = await handle.createWritable();
      await writable.write(content);
      await writable.close();
    } else {
      this.memoryFS.set(path, content);
    }
  }
}
```

---

## 5. Composants Techniques

### 5.1 Virtual File System (VFS)

```typescript
interface VirtualFileSystem {
  // Core operations
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, content: Uint8Array): Promise<void>;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  readdir(path: string): Promise<string[]>;
  stat(path: string): Promise<FileStat>;
  unlink(path: string): Promise<void>;

  // Watch API
  watch(path: string, callback: WatchCallback): Unsubscribe;

  // Sync operations (Worker only)
  readFileSync(path: string): Uint8Array;
  writeFileSync(path: string, content: Uint8Array): void;

  // Mount external sources
  mount(source: FileSystemSource, mountPoint: string): Promise<void>;
}

interface FileStat {
  isFile: boolean;
  isDirectory: boolean;
  size: number;
  mtime: Date;
}

type FileSystemSource =
  | { type: 'memory'; files: Record<string, string | Uint8Array> }
  | { type: 'opfs'; handle: FileSystemDirectoryHandle }
  | { type: 'indexeddb'; dbName: string }
  | { type: 'github'; repo: string; branch: string };
```

### 5.2 Package Manager

```typescript
interface PackageManager {
  // Installation
  install(packages: string[]): Promise<InstallResult>;
  installAll(): Promise<InstallResult>; // from package.json

  // Resolution
  resolve(specifier: string, from?: string): Promise<string>;

  // Cache
  clearCache(): Promise<void>;
  getCacheSize(): Promise<number>;
}

interface InstallResult {
  success: boolean;
  installed: PackageInfo[];
  errors: PackageError[];
  duration: number;
}
```

#### Stratégie de Résolution des Packages

```
┌─────────────────────────────────────────────────────────────────┐
│                    Package Resolution Flow                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  import 'react'                                                  │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────────┐                                            │
│  │ 1. Check Cache  │ ─────Yes────► Return cached module         │
│  └────────┬────────┘                                            │
│           │ No                                                   │
│           ▼                                                      │
│  ┌─────────────────┐                                            │
│  │ 2. Check OPFS   │ ─────Yes────► Load from OPFS               │
│  └────────┬────────┘                                            │
│           │ No                                                   │
│           ▼                                                      │
│  ┌─────────────────┐                                            │
│  │ 3. Fetch from   │                                            │
│  │    CDN (esm.sh) │                                            │
│  └────────┬────────┘                                            │
│           │                                                      │
│           ▼                                                      │
│  ┌─────────────────┐                                            │
│  │ 4. Store in     │                                            │
│  │    OPFS Cache   │                                            │
│  └────────┬────────┘                                            │
│           │                                                      │
│           ▼                                                      │
│     Return module                                                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 5.3 Build Pipeline

```typescript
interface BuildPipeline {
  // Main build
  build(options: BuildOptions): Promise<BuildResult>;

  // Watch mode
  watch(options: BuildOptions): AsyncGenerator<BuildResult>;

  // Individual transformations
  transformJS(code: string, options: JSOptions): Promise<TransformResult>;
  transformCSS(code: string, options: CSSOptions): Promise<TransformResult>;
  transformHTML(code: string, options: HTMLOptions): Promise<TransformResult>;
}

interface BuildOptions {
  entry: string | string[];
  outdir?: string;
  format?: 'esm' | 'cjs' | 'iife';
  target?: string[];
  minify?: boolean;
  sourcemap?: boolean | 'inline' | 'external';
  splitting?: boolean;

  // CSS Processing
  css?: {
    postcss?: boolean;
    tailwind?: TailwindConfig;
    autoprefixer?: AutoprefixerConfig;
  };

  // Framework support
  framework?: 'react' | 'vue' | 'svelte' | 'solid';
}
```

#### CSS Processing Pipeline (Innovation Clé)

```typescript
class CSSProcessor {
  private lightningCSS: typeof import('lightningcss-wasm');
  private tailwindCompiler: TailwindCompiler;

  async process(css: string, config: CSSConfig): Promise<string> {
    let result = css;

    // 1. Résoudre @import
    result = await this.resolveImports(result);

    // 2. Compiler Tailwind (si présent)
    if (this.hasTailwindDirectives(result)) {
      result = await this.compileTailwind(result, config);
    }

    // 3. Transformer avec Lightning CSS
    const { code } = await this.lightningCSS.transform({
      filename: 'styles.css',
      code: new TextEncoder().encode(result),
      minify: config.minify,
      targets: this.getBrowserTargets(config.browsers),
      drafts: {
        customMedia: true,
      },
    });

    return new TextDecoder().decode(code);
  }

  private hasTailwindDirectives(css: string): boolean {
    return /@tailwind|@apply|@layer|@screen/.test(css);
  }

  private async compileTailwind(css: string, config: CSSConfig): Promise<string> {
    // Utiliser le compilateur Tailwind intégré
    return this.tailwindCompiler.compile(css, {
      content: config.contentPaths,
      theme: config.tailwindTheme,
    });
  }
}
```

### 5.4 Preview Server

```typescript
interface PreviewServer {
  // Start server
  start(options: PreviewOptions): Promise<PreviewHandle>;

  // Hot reload
  invalidate(paths: string[]): void;

  // Get URL
  getURL(): string;
}

interface PreviewOptions {
  root: string;
  port?: number;
  hmr?: boolean;
  proxy?: Record<string, string>;
}

interface PreviewHandle {
  url: string;
  iframe: HTMLIFrameElement;
  stop(): void;
}
```

#### Architecture du Preview Server

```
┌─────────────────────────────────────────────────────────────────┐
│                     Preview Server Architecture                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │                      Main Thread                             ││
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ ││
│  │  │   BAVINI    │  │   Preview   │  │      User Code      │ ││
│  │  │    Editor   │──│   iframe    │──│    (Sandboxed)      │ ││
│  │  └─────────────┘  └──────┬──────┘  └─────────────────────┘ ││
│  │                          │                                   ││
│  └──────────────────────────┼───────────────────────────────────┘│
│                             │                                    │
│  ┌──────────────────────────▼───────────────────────────────────┐│
│  │                    Service Worker                             ││
│  │  ┌─────────────────────────────────────────────────────────┐ ││
│  │  │  Request Interceptor                                     │ ││
│  │  │  • Intercept all fetch() from iframe                     │ ││
│  │  │  • Route to VFS or CDN                                   │ ││
│  │  │  • Handle HMR websocket simulation                       │ ││
│  │  └─────────────────────────────────────────────────────────┘ ││
│  │                                                               ││
│  │  fetch('/src/App.tsx') ──► VFS.readFile('/src/App.tsx')     ││
│  │                        ──► Transform (SWC)                    ││
│  │                        ──► Return Response                    ││
│  │                                                               ││
│  │  fetch('react') ──► CDN (esm.sh/react)                       ││
│  │               ──► Cache in OPFS                               ││
│  │               ──► Return Response                             ││
│  │                                                               ││
│  └───────────────────────────────────────────────────────────────┘│
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. Implémentation Détaillée

### 6.1 Tailwind CSS Compiler (Innovation Majeure)

Le plus grand défi technique est la compilation Tailwind dans le navigateur. Notre approche :

```typescript
class TailwindBrowserCompiler {
  private classCache: Map<string, string> = new Map();
  private theme: TailwindTheme;

  async compile(css: string, options: TailwindOptions): Promise<string> {
    const { content, theme } = options;
    this.theme = theme || defaultTheme;

    // 1. Extraire les classes utilisées dans le contenu
    const usedClasses = this.extractClasses(content);

    // 2. Générer les directives @tailwind
    let output = '';

    if (css.includes('@tailwind base')) {
      output += this.generateBase();
    }

    if (css.includes('@tailwind components')) {
      output += this.generateComponents();
    }

    if (css.includes('@tailwind utilities')) {
      output += this.generateUtilities(usedClasses);
    }

    // 3. Résoudre @apply
    output = this.resolveApply(css, output);

    return output;
  }

  private extractClasses(content: string[]): Set<string> {
    const regex = /class(?:Name)?=["']([^"']+)["']|class(?:Name)?=\{[`"']([^`"']+)[`"']\}/g;
    const classes = new Set<string>();

    for (const file of content) {
      let match;
      while ((match = regex.exec(file)) !== null) {
        const classStr = match[1] || match[2];
        classStr.split(/\s+/).forEach(cls => classes.add(cls));
      }
    }

    return classes;
  }

  private generateUtilities(classes: Set<string>): string {
    let css = '';

    for (const cls of classes) {
      if (this.classCache.has(cls)) {
        css += this.classCache.get(cls);
        continue;
      }

      const generated = this.generateUtility(cls);
      if (generated) {
        this.classCache.set(cls, generated);
        css += generated;
      }
    }

    return css;
  }

  private generateUtility(className: string): string {
    // Parser la classe Tailwind
    const parsed = this.parseClassName(className);
    if (!parsed) return '';

    const { prefix, variants, utility, value } = parsed;

    // Générer le CSS
    let css = '';
    const selector = this.buildSelector(className, variants);
    const properties = this.getProperties(utility, value);

    if (properties) {
      css = `${selector} { ${properties} }\n`;

      // Ajouter les media queries pour les variants responsive
      css = this.wrapWithVariants(css, variants);
    }

    return css;
  }

  private parseClassName(className: string): ParsedClass | null {
    // Support: hover:md:bg-blue-500/50
    const parts = className.split(':');
    const utility = parts.pop()!;
    const variants = parts;

    // Parser utility-value
    const match = utility.match(/^(-?)([a-z]+(?:-[a-z]+)*)-(.+)$/);
    if (!match) {
      // Classes sans valeur (flex, hidden, etc.)
      return { variants, utility, value: null, negative: false };
    }

    return {
      variants,
      utility: match[2],
      value: match[3],
      negative: match[1] === '-',
    };
  }
}
```

### 6.2 Module Resolution avec esm.sh

```typescript
class ModuleResolver {
  private cdn = 'https://esm.sh';
  private cache: Map<string, string> = new Map();

  async resolve(specifier: string, importer?: string): Promise<string> {
    // 1. Relatif : ./foo, ../bar
    if (specifier.startsWith('.')) {
      return this.resolveRelative(specifier, importer);
    }

    // 2. Absolue : /src/foo
    if (specifier.startsWith('/')) {
      return specifier;
    }

    // 3. Alias : @/components/Button
    if (specifier.startsWith('@/')) {
      return this.resolveAlias(specifier);
    }

    // 4. Package : react, lodash/debounce
    return this.resolvePackage(specifier);
  }

  private async resolvePackage(specifier: string): Promise<string> {
    // Vérifier le cache
    if (this.cache.has(specifier)) {
      return this.cache.get(specifier)!;
    }

    // Construire l'URL esm.sh
    const [packageName, ...subpath] = specifier.split('/');
    const url = subpath.length > 0
      ? `${this.cdn}/${packageName}/${subpath.join('/')}`
      : `${this.cdn}/${packageName}`;

    this.cache.set(specifier, url);
    return url;
  }
}
```

### 6.3 Web Worker Process Model

```typescript
// process-worker.ts
class BaviniProcess {
  private fs: VirtualFileSystem;
  private env: Record<string, string>;
  private cwd: string = '/';

  constructor(options: ProcessOptions) {
    this.fs = options.fs;
    this.env = options.env || {};
  }

  async exec(command: string, args: string[]): Promise<ExecResult> {
    switch (command) {
      case 'node':
        return this.execNode(args);
      case 'npm':
      case 'pnpm':
      case 'yarn':
        return this.execPackageManager(command, args);
      case 'npx':
        return this.execNpx(args);
      default:
        return this.execBinary(command, args);
    }
  }

  private async execNode(args: string[]): Promise<ExecResult> {
    const [script, ...scriptArgs] = args;
    const code = await this.fs.readFile(script);

    // Créer un environnement d'exécution isolé
    const sandbox = new NodeSandbox({
      fs: this.fs,
      env: this.env,
      cwd: this.cwd,
      args: scriptArgs,
    });

    try {
      const result = await sandbox.run(code);
      return { exitCode: 0, stdout: result.stdout, stderr: result.stderr };
    } catch (error) {
      return { exitCode: 1, stdout: '', stderr: error.message };
    }
  }
}
```

### 6.4 Hot Module Replacement (HMR)

```typescript
class HMRClient {
  private socket: BroadcastChannel;
  private acceptedModules: Map<string, HMRCallback[]> = new Map();

  constructor() {
    // Utiliser BroadcastChannel au lieu de WebSocket (pas besoin de serveur)
    this.socket = new BroadcastChannel('bavini-hmr');
    this.socket.onmessage = this.handleMessage.bind(this);
  }

  private handleMessage(event: MessageEvent) {
    const { type, path, timestamp } = event.data;

    switch (type) {
      case 'update':
        this.handleUpdate(path, timestamp);
        break;
      case 'full-reload':
        window.location.reload();
        break;
      case 'css-update':
        this.handleCSSUpdate(path);
        break;
    }
  }

  private async handleUpdate(path: string, timestamp: number) {
    const callbacks = this.acceptedModules.get(path);

    if (callbacks && callbacks.length > 0) {
      // Hot update
      const newModule = await import(`${path}?t=${timestamp}`);
      callbacks.forEach(cb => cb(newModule));
    } else {
      // Full reload si pas de HMR accepté
      window.location.reload();
    }
  }

  private handleCSSUpdate(path: string) {
    // Mettre à jour le CSS sans reload
    const links = document.querySelectorAll<HTMLLinkElement>(`link[href*="${path}"]`);
    links.forEach(link => {
      const url = new URL(link.href);
      url.searchParams.set('t', Date.now().toString());
      link.href = url.toString();
    });
  }

  // API publique
  accept(path: string, callback: HMRCallback) {
    if (!this.acceptedModules.has(path)) {
      this.acceptedModules.set(path, []);
    }
    this.acceptedModules.get(path)!.push(callback);
  }
}
```

---

## 7. Feuille de Route

### Phase 1 : Foundation (Mois 1-3)

```
┌─────────────────────────────────────────────────────────────┐
│  Phase 1: Foundation                                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Mois 1: Virtual File System                                │
│  ├── OPFS integration                                       │
│  ├── Memory FS fallback                                     │
│  ├── File watching API                                      │
│  └── Tests de performance                                   │
│                                                              │
│  Mois 2: Build Pipeline Core                                │
│  ├── Intégration Rolldown WASM                             │
│  ├── Intégration SWC WASM                                  │
│  ├── Intégration Lightning CSS                             │
│  └── Module resolution (esm.sh)                            │
│                                                              │
│  Mois 3: Basic Preview                                      │
│  ├── Service Worker interceptor                            │
│  ├── iframe sandbox                                        │
│  ├── Error overlay                                         │
│  └── Console forwarding                                    │
│                                                              │
│  Livrables:                                                 │
│  • @bavini/runtime-core                                    │
│  • @bavini/vfs                                             │
│  • Bundling React apps (sans Tailwind)                    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Phase 2 : CSS Pipeline (Mois 4-5)

```
┌─────────────────────────────────────────────────────────────┐
│  Phase 2: CSS Pipeline                                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Mois 4: Tailwind Compiler                                  │
│  ├── Class extraction                                       │
│  ├── Utility generation                                     │
│  ├── @apply resolution                                      │
│  ├── Responsive variants                                    │
│  └── Dark mode support                                      │
│                                                              │
│  Mois 5: PostCSS Compatibility                              │
│  ├── @import resolution                                     │
│  ├── CSS nesting                                            │
│  ├── Autoprefixer                                           │
│  └── Custom plugins API                                     │
│                                                              │
│  Livrables:                                                 │
│  • @bavini/css-pipeline                                    │
│  • Full Tailwind support                                   │
│  • PostCSS plugin compatibility                            │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Phase 3 : Package Manager (Mois 6-7)

```
┌─────────────────────────────────────────────────────────────┐
│  Phase 3: Package Manager                                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Mois 6: Core Package Manager                               │
│  ├── package.json parsing                                   │
│  ├── Dependency resolution                                  │
│  ├── CDN fetching (esm.sh, unpkg)                          │
│  ├── OPFS caching                                          │
│  └── Version locking                                        │
│                                                              │
│  Mois 7: Advanced Features                                  │
│  ├── Peer dependency resolution                            │
│  ├── Workspace support (monorepos)                         │
│  ├── Private packages (auth)                               │
│  └── Offline mode                                          │
│                                                              │
│  Livrables:                                                 │
│  • @bavini/package-manager                                 │
│  • npm install equivalent                                  │
│  • Dependency caching                                      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Phase 4 : Framework Support (Mois 8-10)

```
┌─────────────────────────────────────────────────────────────┐
│  Phase 4: Framework Support                                  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Mois 8: React Ecosystem                                    │
│  ├── React 18+ support                                     │
│  ├── Next.js (App Router)                                  │
│  ├── Remix                                                  │
│  └── React Router                                          │
│                                                              │
│  Mois 9: Vue & Svelte                                       │
│  ├── Vue 3 + Vite                                          │
│  ├── Nuxt 3                                                │
│  ├── Svelte + SvelteKit                                    │
│  └── Single-file components                                │
│                                                              │
│  Mois 10: Other Frameworks                                  │
│  ├── Solid.js                                              │
│  ├── Astro                                                 │
│  ├── Qwik                                                  │
│  └── Angular (limited)                                     │
│                                                              │
│  Livrables:                                                 │
│  • @bavini/react-plugin                                    │
│  • @bavini/vue-plugin                                      │
│  • @bavini/svelte-plugin                                   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Phase 5 : Production Ready (Mois 11-12)

```
┌─────────────────────────────────────────────────────────────┐
│  Phase 5: Production Ready                                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Mois 11: Performance & Stability                           │
│  ├── Stress testing (1000+ files)                          │
│  ├── Memory optimization                                    │
│  ├── Error recovery                                         │
│  ├── Logging & debugging                                    │
│  └── Browser compatibility testing                          │
│                                                              │
│  Mois 12: Documentation & Release                           │
│  ├── API documentation                                     │
│  ├── Migration guides                                      │
│  ├── Examples & tutorials                                  │
│  ├── Performance benchmarks                                │
│  └── v1.0.0 release                                        │
│                                                              │
│  Livrables:                                                 │
│  • BAVINI Runtime v1.0.0                                   │
│  • Documentation site                                      │
│  • NPM packages                                            │
│  • GitHub repository                                       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 8. Avantage Concurrentiel

### 8.1 Comparaison Technique

```
┌───────────────────────────────────────────────────────────────────┐
│              Performance Benchmark (Projection)                    │
├───────────────────────────────────────────────────────────────────┤
│                                                                    │
│  Build 500 modules (React app with Tailwind)                      │
│                                                                    │
│  WebContainer    ████████████████████████████████  4.2s           │
│  Nodebox         ██████████████████████████████████████  5.8s     │
│  esbuild-wasm    ████████████████████████████████████████████ 22s │
│  BAVINI Runtime  ████████████████  2.1s                           │
│                                                                    │
├───────────────────────────────────────────────────────────────────┤
│                                                                    │
│  Cold Start (first load)                                          │
│                                                                    │
│  WebContainer    ████████████████████████  2.8s                   │
│  Nodebox         ████████████████  1.5s                           │
│  esbuild-wasm    ████████  0.8s                                   │
│  BAVINI Runtime  ████  0.4s                                       │
│                                                                    │
├───────────────────────────────────────────────────────────────────┤
│                                                                    │
│  WASM Bundle Size                                                 │
│                                                                    │
│  WebContainer    ████████████████████████████████  ~15MB          │
│  Nodebox         ████████████████  ~8MB                           │
│  esbuild-wasm    ████████████████████████  ~11MB                  │
│  BAVINI Runtime  ██████████  ~5MB                                 │
│                                                                    │
└───────────────────────────────────────────────────────────────────┘
```

### 8.2 Unique Selling Points

1. **Open Source First** : Contrairement à WebContainer et Nodebox, BAVINI Runtime sera entièrement open source sous licence MIT.

2. **Universal Browser Support** : Fonctionne sur Safari iOS sans SharedArrayBuffer grâce à notre architecture basée sur MessageChannel.

3. **Optimized for AI Code Generation** : Conçu spécifiquement pour les cas d'usage de génération de code par IA (streaming, preview instantanée).

4. **Modular Architecture** : Chaque composant peut être utilisé indépendamment (@bavini/vfs, @bavini/css-pipeline, etc.).

5. **Tailwind-Native** : Premier runtime avec compilation Tailwind complète dans le navigateur.

---

## 9. Modèle Commercial

### 9.1 Open Core Model

```
┌─────────────────────────────────────────────────────────────────┐
│                    BAVINI Runtime Licensing                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   OPEN SOURCE (MIT)                      │   │
│  │                                                          │   │
│  │  • @bavini/runtime-core                                 │   │
│  │  • @bavini/vfs                                          │   │
│  │  • @bavini/css-pipeline                                 │   │
│  │  • @bavini/package-manager                              │   │
│  │  • Framework plugins (React, Vue, Svelte)               │   │
│  │                                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   COMMERCIAL LICENSE                     │   │
│  │                                                          │   │
│  │  • BAVINI Cloud Sync (real-time collaboration)          │   │
│  │  • Enterprise SSO/SAML                                  │   │
│  │  • Private package registry                             │   │
│  │  • Dedicated support                                    │   │
│  │  • Custom WASM compilation                              │   │
│  │  • White-label solution                                 │   │
│  │                                                          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 9.2 Pricing Tiers

| Tier | Prix | Features |
|------|------|----------|
| **Community** | Gratuit | Open source core, communauté Discord |
| **Pro** | $29/mois | + Cloud sync, + Priority support |
| **Team** | $99/mois | + Collaboration, + Private packages |
| **Enterprise** | Custom | + SSO, + SLA, + Custom development |

### 9.3 Market Opportunity

- **AI Code Generation** : Marché en explosion (Bolt, v0, Replit)
- **Browser-based IDEs** : StackBlitz, CodeSandbox, GitPod
- **Documentation** : Interactive docs (Storybook, Docusaurus)
- **Education** : Coding bootcamps, MOOCs

---

## 10. Références

### Technologies Utilisées

- [Rolldown](https://rolldown.rs/) - Bundler Rust ultra-rapide
- [SWC](https://swc.rs/) - Compilateur TypeScript/JavaScript
- [Lightning CSS](https://lightningcss.dev/) - Parser/transformer CSS
- [WASI Preview 2](https://wasi.dev/) - WebAssembly System Interface
- [OPFS](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system) - Origin Private File System

### Recherches et Articles

- [The State of WebAssembly 2024-2025](https://platform.uno/blog/state-of-webassembly-2024-2025/)
- [WASI Preview 2: A New Dawn for WebAssembly](https://thenewstack.io/wasi-preview-2-a-new-dawn-for-webassembly/)
- [WebAssembly Component Model](https://component-model.bytecodealliance.org/)
- [Nodebox Architecture](https://codesandbox.io/blog/announcing-sandpack-2)
- [BrowserFS](https://github.com/jvilk/BrowserFS)

### Comparaisons Concurrentielles

- [WebContainer](https://blog.stackblitz.com/posts/introducing-webcontainers/)
- [Nodebox](https://sandpack.codesandbox.io/docs/resources/faq)
- [esbuild-wasm](https://esbuild.github.io/)

---

## Annexe A : Glossaire

| Terme | Définition |
|-------|------------|
| **WASM** | WebAssembly - format binaire pour exécution dans le navigateur |
| **WASI** | WebAssembly System Interface - APIs système pour WASM |
| **OPFS** | Origin Private File System - stockage fichiers performant |
| **VFS** | Virtual File System - abstraction du système de fichiers |
| **HMR** | Hot Module Replacement - rechargement à chaud |
| **AST** | Abstract Syntax Tree - représentation structurée du code |
| **CDN** | Content Delivery Network - réseau de distribution |

---

## Annexe B : Risques et Mitigations

| Risque | Impact | Probabilité | Mitigation |
|--------|--------|-------------|------------|
| Performance WASM insuffisante | Élevé | Moyenne | Tests précoces, fallback server |
| Incompatibilité navigateurs | Élevé | Faible | Feature detection, polyfills |
| Complexité Tailwind compiler | Moyen | Élevée | Approche incrémentale |
| Concurrence (WebContainer OSS) | Élevé | Faible | First-mover advantage |
| Adoption communautaire | Moyen | Moyenne | Documentation, exemples |

---

**Document rédigé par l'équipe BAVINI**
**Dernière mise à jour : Janvier 2025**
