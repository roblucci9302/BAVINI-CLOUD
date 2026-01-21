# DIA - Plan d'Extraction Détaillé

> **DIA** - Browser Runtime SDK
> Extracted from BAVINI Cloud

---

## Vue d'Ensemble

| Attribut | Valeur |
|----------|--------|
| **Nom** | DIA |
| **Description** | Browser-based JavaScript bundler & preview engine |
| **Source** | BAVINI Cloud `/app/lib/runtime/` |
| **Effort estimé** | 8-10 jours |
| **Dépendances externes** | `esbuild-wasm` uniquement |

---

## Phase 1: Extraction du Code (3-4 jours)

### 1.1 Structure du Repo DIA

```
dia/
├── src/
│   ├── index.ts                    # Point d'entrée principal
│   ├── adapter.ts                  # Interface RuntimeAdapter
│   ├── base-adapter.ts             # Classe abstraite BaseRuntimeAdapter
│   ├── browser-adapter.ts          # BrowserBuildAdapter (core)
│   ├── types.ts                    # Tous les types exportés
│   │
│   ├── compilers/
│   │   ├── index.ts                # Exports des compilers
│   │   ├── registry.ts             # Compiler registry
│   │   ├── tailwind.ts             # Tailwind JIT compiler
│   │   ├── vue.ts                  # Vue SFC compiler
│   │   ├── svelte.ts               # Svelte compiler
│   │   └── astro.ts                # Astro compiler
│   │
│   ├── plugins/
│   │   ├── index.ts                # Exports des plugins
│   │   ├── virtual-fs.ts           # Virtual FS plugin (extrait du adapter)
│   │   ├── esm-sh.ts               # ESM.sh CDN plugin (extrait du adapter)
│   │   └── router.ts               # Client-side router plugin
│   │
│   └── utils/
│       ├── index.ts                # Exports utilitaires
│       ├── logger.ts               # Logger simple (remplacement BAVINI)
│       ├── lru-cache.ts            # LRU Cache (extrait du adapter)
│       └── path.ts                 # Path utilities
│
├── tests/
│   ├── adapter.spec.ts
│   ├── compilers/
│   │   ├── tailwind.spec.ts
│   │   ├── vue.spec.ts
│   │   └── svelte.spec.ts
│   └── integration/
│       └── react-project.spec.ts
│
├── examples/
│   ├── basic-react/
│   ├── with-tailwind/
│   ├── vue-app/
│   └── nextjs-style/
│
├── docs/
│   ├── getting-started.md
│   ├── api-reference.md
│   ├── compilers.md
│   └── examples.md
│
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── vitest.config.ts
├── README.md
├── LICENSE
└── CHANGELOG.md
```

### 1.2 Fichiers à Extraire (Mapping)

| Source BAVINI | Destination DIA | Action |
|---------------|-----------------|--------|
| `app/lib/runtime/types.ts` | `src/types.ts` | Copie directe |
| `app/lib/runtime/adapter.ts` | `src/adapter.ts` + `src/base-adapter.ts` | Split |
| `app/lib/runtime/adapters/browser-build-adapter.ts` | `src/browser-adapter.ts` | Refactor |
| `app/lib/runtime/adapters/compilers/compiler-registry.ts` | `src/compilers/registry.ts` | Refactor |
| `app/lib/runtime/adapters/compilers/tailwind-compiler.ts` | `src/compilers/tailwind.ts` | Refactor |
| `app/lib/runtime/adapters/compilers/vue-compiler.ts` | `src/compilers/vue.ts` | Refactor |
| `app/lib/runtime/adapters/compilers/svelte-compiler.ts` | `src/compilers/svelte.ts` | Refactor |
| `app/lib/runtime/adapters/compilers/astro-compiler.ts` | `src/compilers/astro.ts` | Refactor |
| `app/lib/runtime/adapters/plugins/router-plugin.ts` | `src/plugins/router.ts` | Refactor |

### 1.3 Commandes d'Extraction

```bash
# 1. Créer le repo DIA
mkdir -p ~/projects/dia
cd ~/projects/dia
git init

# 2. Créer la structure
mkdir -p src/{compilers,plugins,utils}
mkdir -p tests/{compilers,integration}
mkdir -p examples/{basic-react,with-tailwind,vue-app,nextjs-style}
mkdir -p docs

# 3. Initialiser npm
npm init -y

# 4. Copier les fichiers sources (depuis BAVINI)
# Voir Section 1.4 pour le script
```

### 1.4 Script d'Extraction Automatique

```bash
#!/bin/bash
# extract-dia.sh

BAVINI_ROOT="/Users/robespierreganro/Desktop/BAVINI-CLOUT"
DIA_ROOT="$HOME/projects/dia"
RUNTIME_SRC="$BAVINI_ROOT/app/lib/runtime"

echo "🚀 Extracting DIA from BAVINI..."

# Create directories
mkdir -p "$DIA_ROOT/src/compilers"
mkdir -p "$DIA_ROOT/src/plugins"
mkdir -p "$DIA_ROOT/src/utils"
mkdir -p "$DIA_ROOT/tests/compilers"
mkdir -p "$DIA_ROOT/tests/integration"

# Copy core files
echo "📁 Copying core files..."
cp "$RUNTIME_SRC/types.ts" "$DIA_ROOT/src/types.ts"
cp "$RUNTIME_SRC/adapter.ts" "$DIA_ROOT/src/adapter.ts"
cp "$RUNTIME_SRC/adapters/browser-build-adapter.ts" "$DIA_ROOT/src/browser-adapter.ts"

# Copy compilers
echo "📁 Copying compilers..."
cp "$RUNTIME_SRC/adapters/compilers/compiler-registry.ts" "$DIA_ROOT/src/compilers/registry.ts"
cp "$RUNTIME_SRC/adapters/compilers/tailwind-compiler.ts" "$DIA_ROOT/src/compilers/tailwind.ts"
cp "$RUNTIME_SRC/adapters/compilers/vue-compiler.ts" "$DIA_ROOT/src/compilers/vue.ts"
cp "$RUNTIME_SRC/adapters/compilers/svelte-compiler.ts" "$DIA_ROOT/src/compilers/svelte.ts"
cp "$RUNTIME_SRC/adapters/compilers/astro-compiler.ts" "$DIA_ROOT/src/compilers/astro.ts"

# Copy plugins
echo "📁 Copying plugins..."
cp "$RUNTIME_SRC/adapters/plugins/router-plugin.ts" "$DIA_ROOT/src/plugins/router.ts"

# Copy tests
echo "📁 Copying tests..."
cp "$RUNTIME_SRC/__tests__/browser-build-adapter.spec.ts" "$DIA_ROOT/tests/adapter.spec.ts"
cp "$RUNTIME_SRC/__tests__/react-project.integration.spec.ts" "$DIA_ROOT/tests/integration/react-project.spec.ts"
cp "$RUNTIME_SRC/adapters/compilers/tailwind-compiler.spec.ts" "$DIA_ROOT/tests/compilers/tailwind.spec.ts"
cp "$RUNTIME_SRC/adapters/plugins/router-plugin.spec.ts" "$DIA_ROOT/tests/plugins/router.spec.ts"

echo "✅ Extraction complete!"
echo "📝 Next: Run the import replacement script"
```

---

## Phase 2: Remplacement des Dépendances BAVINI (2-3 jours)

### 2.1 Dépendances à Remplacer

| Dépendance BAVINI | Remplacement DIA | Fichiers Affectés |
|-------------------|------------------|-------------------|
| `~/utils/logger` | `./utils/logger` (nouveau) | Tous |
| `~/lib/stores/*` | Supprimé (pas besoin) | Aucun |
| Chemins `~/` | Chemins relatifs `./` | Tous |

### 2.2 Nouveau Logger pour DIA

```typescript
// src/utils/logger.ts

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LoggerOptions {
  level?: LogLevel;
  prefix?: string;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

class Logger {
  private level: LogLevel;
  private prefix: string;

  constructor(options: LoggerOptions = {}) {
    this.level = options.level ?? 'info';
    this.prefix = options.prefix ?? 'DIA';
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.level];
  }

  private formatMessage(level: LogLevel, message: string): string {
    const timestamp = new Date().toISOString().slice(11, 23);
    return `[${timestamp}] [${this.prefix}] [${level.toUpperCase()}] ${message}`;
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.shouldLog('debug')) {
      console.debug(this.formatMessage('debug', message), ...args);
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (this.shouldLog('info')) {
      console.info(this.formatMessage('info', message), ...args);
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message), ...args);
    }
  }

  error(message: string, ...args: unknown[]): void {
    if (this.shouldLog('error')) {
      console.error(this.formatMessage('error', message), ...args);
    }
  }

  setLevel(level: LogLevel): void {
    this.level = level;
  }
}

// Factory function (replaces createScopedLogger)
export function createLogger(scope: string): Logger {
  return new Logger({ prefix: `DIA:${scope}` });
}

// Default logger instance
export const logger = new Logger();
```

### 2.3 Script de Remplacement des Imports

```bash
#!/bin/bash
# replace-imports.sh

DIA_ROOT="$HOME/projects/dia"

echo "🔄 Replacing BAVINI imports..."

# Replace logger imports
find "$DIA_ROOT/src" -name "*.ts" -exec sed -i '' \
  "s|import { createScopedLogger } from '~/utils/logger';|import { createLogger } from './utils/logger';|g" {} \;

find "$DIA_ROOT/src" -name "*.ts" -exec sed -i '' \
  "s|createScopedLogger|createLogger|g" {} \;

# Replace relative paths in compilers
find "$DIA_ROOT/src/compilers" -name "*.ts" -exec sed -i '' \
  "s|from '../|from '../|g" {} \;

# Replace paths in browser-adapter
sed -i '' "s|from './compilers/compiler-registry'|from './compilers/registry'|g" \
  "$DIA_ROOT/src/browser-adapter.ts"

sed -i '' "s|from './plugins/router-plugin'|from './plugins/router'|g" \
  "$DIA_ROOT/src/browser-adapter.ts"

sed -i '' "s|from '../adapter'|from './adapter'|g" \
  "$DIA_ROOT/src/browser-adapter.ts"

sed -i '' "s|from '../types'|from './types'|g" \
  "$DIA_ROOT/src/browser-adapter.ts"

echo "✅ Import replacement complete!"
```

### 2.4 Mapping des Imports (Manuel)

Effectuer ces remplacements dans chaque fichier:

#### `src/browser-adapter.ts`

```typescript
// AVANT (BAVINI)
import { BaseRuntimeAdapter } from '../adapter';
import type { FileMap, BundleResult, ... } from '../types';
import { createScopedLogger } from '~/utils/logger';
import { loadCompiler, hasCompilerFor, detectFramework, ... } from './compilers/compiler-registry';
import { detectRoutesFromFiles, ... } from './plugins/router-plugin';

// APRÈS (DIA)
import { BaseRuntimeAdapter } from './base-adapter';
import type { FileMap, BundleResult, ... } from './types';
import { createLogger } from './utils/logger';
import { loadCompiler, hasCompilerFor, detectFramework, ... } from './compilers/registry';
import { detectRoutesFromFiles, ... } from './plugins/router';
```

#### `src/compilers/registry.ts`

```typescript
// AVANT (BAVINI)
import { createScopedLogger } from '~/utils/logger';

// APRÈS (DIA)
import { createLogger } from '../utils/logger';
```

### 2.5 Fichier Index Principal

```typescript
// src/index.ts

// Core exports
export { RuntimeAdapter } from './adapter';
export { BaseRuntimeAdapter } from './base-adapter';
export { BrowserBuildAdapter, createBrowserBuildAdapter } from './browser-adapter';

// Types
export type {
  FileMap,
  FileRecord,
  BundleResult,
  BuildOptions,
  BuildError,
  BuildWarning,
  PreviewInfo,
  RuntimeStatus,
  RuntimeCallbacks,
  ConsoleLog,
  RuntimeError,
  TransformOptions,
  Loader,
} from './types';

// Compilers
export {
  loadCompiler,
  hasCompilerFor,
  detectFramework,
  getJsxConfig,
  type FrameworkType,
} from './compilers/registry';

export type { TailwindCompiler, ContentFile } from './compilers/tailwind';

// Plugins
export {
  detectRoutesFromFiles,
  detectRoutingNeeds,
  type RouteDefinition,
  type RouterConfig,
} from './plugins/router';

// Utils
export { createLogger, type LogLevel } from './utils/logger';
```

---

## Phase 3: Documentation (2-3 jours)

### 3.1 README.md

```markdown
# DIA

> 🚀 Browser-based JavaScript bundler & preview engine

DIA is a lightweight, browser-native build system that bundles and previews JavaScript applications entirely in the browser using esbuild-wasm. No server required.

## Features

- ⚡ **Instant builds** with esbuild-wasm
- 🎨 **Multi-framework support**: React, Vue, Svelte, Astro, Preact
- 🎯 **Tailwind CSS JIT** compilation in browser
- 🔗 **NPM packages** via esm.sh CDN
- 📱 **Live preview** with Blob URLs
- 🛤️ **Built-in routing** for multi-page apps
- 🔒 **Secure** virtual file system

## Installation

\`\`\`bash
npm install @anthropic/dia
# or
pnpm add @anthropic/dia
# or
yarn add @anthropic/dia
\`\`\`

## Quick Start

\`\`\`typescript
import { createBrowserBuildAdapter } from '@anthropic/dia';

// Create adapter
const dia = createBrowserBuildAdapter();

// Initialize (loads esbuild-wasm)
await dia.init();

// Write files
await dia.writeFiles(new Map([
  ['/src/App.tsx', `
    export default function App() {
      return <h1>Hello DIA!</h1>;
    }
  `],
  ['/src/main.tsx', `
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import App from './App';

    createRoot(document.getElementById('root')!).render(<App />);
  `],
]));

// Build
const result = await dia.build({
  entryPoint: '/src/main.tsx',
  mode: 'development',
});

// Get preview URL (Blob URL)
const preview = dia.getPreview();
console.log('Preview URL:', preview?.url);
\`\`\`

## Framework Support

| Framework | Status | Features |
|-----------|--------|----------|
| React | ✅ Full | JSX, Hooks, Router |
| Vue 3 | ✅ Full | SFC, Composition API |
| Svelte | ✅ Full | Components, Stores |
| Astro | ✅ Basic | Components |
| Preact | ✅ Full | JSX, Hooks |
| Next.js* | ✅ Partial | App Router shims |

*Next.js support is client-side only with browser shims

## API Reference

See [API Documentation](./docs/api-reference.md)

## Examples

- [Basic React App](./examples/basic-react)
- [React + Tailwind](./examples/with-tailwind)
- [Vue 3 App](./examples/vue-app)
- [Next.js Style](./examples/nextjs-style)

## License

MIT © BAVINI
\`\`\`

### 3.2 API Reference (`docs/api-reference.md`)

```markdown
# DIA API Reference

## BrowserBuildAdapter

The main class for building and previewing applications.

### Constructor

\`\`\`typescript
const adapter = new BrowserBuildAdapter();
// or use factory
const adapter = createBrowserBuildAdapter();
\`\`\`

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `name` | `string` | Adapter name ("BrowserBuild") |
| `status` | `RuntimeStatus` | Current status |
| `supportsTerminal` | `boolean` | Always `false` |
| `supportsShell` | `boolean` | Always `false` |
| `supportsNodeServer` | `boolean` | Always `false` |
| `isBrowserOnly` | `boolean` | Always `true` |
| `supportedFrameworks` | `string[]` | List of supported frameworks |

### Methods

#### `init(): Promise<void>`

Initialize esbuild-wasm. Must be called before any other method.

\`\`\`typescript
await adapter.init();
\`\`\`

#### `destroy(): Promise<void>`

Cleanup resources (Blob URLs, etc.).

\`\`\`typescript
await adapter.destroy();
\`\`\`

#### `writeFiles(files: FileMap): Promise<void>`

Write multiple files to the virtual file system.

\`\`\`typescript
await adapter.writeFiles(new Map([
  ['/src/App.tsx', 'export default () => <div>Hello</div>'],
  ['/src/index.css', '.app { color: red; }'],
]));
\`\`\`

#### `writeFile(path: string, content: string): Promise<void>`

Write a single file.

\`\`\`typescript
await adapter.writeFile('/src/App.tsx', code);
\`\`\`

#### `readFile(path: string): Promise<string | null>`

Read a file from the virtual file system.

\`\`\`typescript
const content = await adapter.readFile('/src/App.tsx');
\`\`\`

#### `deleteFile(path: string): Promise<void>`

Delete a file.

\`\`\`typescript
await adapter.deleteFile('/src/old-file.tsx');
\`\`\`

#### `build(options: BuildOptions): Promise<BundleResult>`

Build the project and return the bundle.

\`\`\`typescript
const result = await adapter.build({
  entryPoint: '/src/main.tsx',
  mode: 'development',
  minify: false,
  sourcemap: true,
  define: {
    'process.env.API_URL': '"https://api.example.com"',
  },
});

console.log('Build time:', result.buildTime, 'ms');
console.log('Errors:', result.errors);
console.log('Warnings:', result.warnings);
\`\`\`

#### `getPreview(): PreviewInfo | null`

Get the current preview URL.

\`\`\`typescript
const preview = adapter.getPreview();
if (preview?.ready) {
  iframe.src = preview.url;
}
\`\`\`

#### `refreshPreview(): Promise<void>`

Force refresh the preview iframe.

\`\`\`typescript
await adapter.refreshPreview();
\`\`\`

#### `setCallbacks(callbacks: RuntimeCallbacks): void`

Register event callbacks.

\`\`\`typescript
adapter.setCallbacks({
  onPreviewReady: (info) => {
    console.log('Preview ready:', info.url);
  },
  onConsole: (log) => {
    console.log(`[${log.type}]`, ...log.args);
  },
  onError: (error) => {
    console.error('Runtime error:', error.message);
  },
  onStatusChange: (status) => {
    console.log('Status:', status);
  },
  onBuildProgress: (phase, progress) => {
    console.log(`Build: ${phase} (${progress}%)`);
  },
});
\`\`\`

---

## Types

### FileMap

\`\`\`typescript
type FileMap = Map<string, string>;
\`\`\`

### BuildOptions

\`\`\`typescript
interface BuildOptions {
  entryPoint: string;
  mode: 'development' | 'production';
  minify?: boolean;
  sourcemap?: boolean;
  define?: Record<string, string>;
}
\`\`\`

### BundleResult

\`\`\`typescript
interface BundleResult {
  code: string;
  css: string;
  errors: BuildError[];
  warnings: BuildWarning[];
  buildTime: number;
  hash: string;
}
\`\`\`

### BuildError

\`\`\`typescript
interface BuildError {
  message: string;
  file?: string;
  line?: number;
  column?: number;
  snippet?: string;
}
\`\`\`

### PreviewInfo

\`\`\`typescript
interface PreviewInfo {
  url: string;      // Blob URL
  ready: boolean;
  updatedAt: number;
}
\`\`\`

### RuntimeStatus

\`\`\`typescript
type RuntimeStatus = 'idle' | 'initializing' | 'ready' | 'building' | 'error';
\`\`\`

### RuntimeCallbacks

\`\`\`typescript
interface RuntimeCallbacks {
  onPreviewReady?: (info: PreviewInfo) => void;
  onConsole?: (log: ConsoleLog) => void;
  onError?: (error: RuntimeError) => void;
  onStatusChange?: (status: RuntimeStatus) => void;
  onBuildProgress?: (phase: string, progress: number) => void;
}
\`\`\`

---

## Compilers

### loadCompiler(extension: string)

Lazy-load a compiler for a specific file extension.

\`\`\`typescript
import { loadCompiler } from '@anthropic/dia';

const tailwind = await loadCompiler('css');
const vue = await loadCompiler('vue');
const svelte = await loadCompiler('svelte');
\`\`\`

### detectFramework(files: Map<string, string>)

Detect the framework used in a project.

\`\`\`typescript
import { detectFramework } from '@anthropic/dia';

const framework = detectFramework(files);
// Returns: 'react' | 'vue' | 'svelte' | 'astro' | 'preact' | 'vanilla'
\`\`\`

---

## Routing

### detectRoutesFromFiles(filePaths: string[], files: Map<string, string>)

Detect routes from file structure (Next.js App Router style).

\`\`\`typescript
import { detectRoutesFromFiles } from '@anthropic/dia';

const routes = detectRoutesFromFiles(
  ['/app/page.tsx', '/app/about/page.tsx', '/app/products/[id]/page.tsx'],
  files
);

// Returns:
// [
//   { path: '/', component: '/app/page.tsx' },
//   { path: '/about', component: '/app/about/page.tsx' },
//   { path: '/products/:id', component: '/app/products/[id]/page.tsx' },
// ]
\`\`\`
\`\`\`

### 3.3 Getting Started Guide (`docs/getting-started.md`)

```markdown
# Getting Started with DIA

## Prerequisites

- Node.js 18+ (for development)
- Modern browser with ES2020 support

## Installation

\`\`\`bash
npm install @anthropic/dia
\`\`\`

## Basic Usage

### 1. Create an Adapter

\`\`\`typescript
import { createBrowserBuildAdapter } from '@anthropic/dia';

const dia = createBrowserBuildAdapter();
\`\`\`

### 2. Initialize

\`\`\`typescript
// This loads esbuild-wasm (~2-3 seconds on first load)
await dia.init();
\`\`\`

### 3. Write Your Code

\`\`\`typescript
await dia.writeFiles(new Map([
  ['/src/App.tsx', `
    import { useState } from 'react';

    export default function App() {
      const [count, setCount] = useState(0);

      return (
        <div>
          <h1>Count: {count}</h1>
          <button onClick={() => setCount(c => c + 1)}>
            Increment
          </button>
        </div>
      );
    }
  `],
  ['/src/main.tsx', `
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import App from './App';

    createRoot(document.getElementById('root')!).render(<App />);
  `],
  ['/index.html', `
    <!DOCTYPE html>
    <html>
      <head>
        <title>My App</title>
      </head>
      <body>
        <div id="root"></div>
      </body>
    </html>
  `],
]));
\`\`\`

### 4. Build

\`\`\`typescript
const result = await dia.build({
  entryPoint: '/src/main.tsx',
  mode: 'development',
});

if (result.errors.length > 0) {
  console.error('Build failed:', result.errors);
} else {
  console.log('Build successful in', result.buildTime, 'ms');
}
\`\`\`

### 5. Display Preview

\`\`\`typescript
const preview = dia.getPreview();

if (preview?.ready) {
  const iframe = document.getElementById('preview') as HTMLIFrameElement;
  iframe.src = preview.url;
}
\`\`\`

## Using with Tailwind CSS

\`\`\`typescript
await dia.writeFiles(new Map([
  ['/src/globals.css', `
    @tailwind base;
    @tailwind components;
    @tailwind utilities;
  `],
  ['/src/App.tsx', `
    import './globals.css';

    export default function App() {
      return (
        <div className="min-h-screen bg-gray-100 p-8">
          <h1 className="text-3xl font-bold text-blue-600">
            Hello Tailwind!
          </h1>
        </div>
      );
    }
  `],
]));
\`\`\`

DIA automatically detects Tailwind directives and compiles them using JIT.

## Using with Vue

\`\`\`typescript
await dia.writeFiles(new Map([
  ['/src/App.vue', `
    <script setup>
    import { ref } from 'vue';
    const count = ref(0);
    </script>

    <template>
      <div>
        <h1>Count: {{ count }}</h1>
        <button @click="count++">Increment</button>
      </div>
    </template>

    <style scoped>
    h1 { color: green; }
    </style>
  `],
  ['/src/main.ts', `
    import { createApp } from 'vue';
    import App from './App.vue';

    createApp(App).mount('#root');
  `],
]));
\`\`\`

## Event Handling

\`\`\`typescript
dia.setCallbacks({
  onPreviewReady: (info) => {
    document.getElementById('status').textContent = 'Ready';
    iframe.src = info.url;
  },

  onBuildProgress: (phase, progress) => {
    progressBar.style.width = progress + '%';
    progressLabel.textContent = phase;
  },

  onConsole: (log) => {
    // Forward preview console to your console
    console[log.type]('[Preview]', ...log.args);
  },

  onError: (error) => {
    errorPanel.textContent = error.message;
  },
});
\`\`\`

## Cleanup

\`\`\`typescript
// When done, cleanup resources
await dia.destroy();
\`\`\`

## Next Steps

- [API Reference](./api-reference.md)
- [Compiler Configuration](./compilers.md)
- [Examples](./examples.md)
\`\`\`

---

## Fichiers de Configuration

### 3.4 package.json

```json
{
  "name": "@anthropic/dia",
  "version": "0.1.0",
  "description": "Browser-based JavaScript bundler & preview engine",
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "require": "./dist/index.cjs",
      "types": "./dist/index.d.ts"
    }
  },
  "files": [
    "dist",
    "README.md",
    "LICENSE"
  ],
  "scripts": {
    "dev": "tsup --watch",
    "build": "tsup",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src --ext .ts",
    "prepublishOnly": "pnpm build"
  },
  "keywords": [
    "bundler",
    "esbuild",
    "browser",
    "preview",
    "react",
    "vue",
    "svelte",
    "tailwind"
  ],
  "author": "BAVINI",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/anthropic/dia"
  },
  "dependencies": {
    "esbuild-wasm": "^0.27.2"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "tsup": "^8.0.0",
    "typescript": "^5.5.0",
    "vitest": "^1.0.0",
    "eslint": "^8.0.0",
    "@typescript-eslint/eslint-plugin": "^7.0.0",
    "@typescript-eslint/parser": "^7.0.0"
  },
  "peerDependencies": {},
  "engines": {
    "node": ">=18.0.0"
  }
}
```

### 3.5 tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "isolatedModules": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

### 3.6 tsup.config.ts

```typescript
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  minify: false,
  splitting: false,
  treeshake: true,
  external: ['esbuild-wasm'],
});
```

### 3.7 vitest.config.ts

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.spec.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/index.ts'],
    },
  },
});
```

---

## Timeline Estimée

| Phase | Tâche | Durée |
|-------|-------|-------|
| **Phase 1** | Extraction du code | 3-4 jours |
| 1.1 | Setup repo + structure | 0.5 jour |
| 1.2 | Copier les fichiers | 0.5 jour |
| 1.3 | Extraire plugins (VFS, ESM.sh) | 1 jour |
| 1.4 | Tests de base | 1-2 jours |
| **Phase 2** | Remplacement dépendances | 2-3 jours |
| 2.1 | Créer logger DIA | 0.5 jour |
| 2.2 | Remplacer imports | 1 jour |
| 2.3 | Vérifier compilation | 0.5 jour |
| 2.4 | Fix tests | 1 jour |
| **Phase 3** | Documentation | 2-3 jours |
| 3.1 | README.md | 0.5 jour |
| 3.2 | API Reference | 1 jour |
| 3.3 | Getting Started | 0.5 jour |
| 3.4 | Exemples | 1 jour |
| **Total** | | **8-10 jours** |

---

## Checklist Finale

### Extraction
- [ ] Repo créé sur GitHub
- [ ] Structure de fichiers en place
- [ ] Tous les fichiers copiés
- [ ] package.json configuré
- [ ] tsconfig.json configuré

### Dépendances
- [ ] Logger remplacé
- [ ] Tous les imports mis à jour
- [ ] Compilation réussie
- [ ] Tests passent

### Documentation
- [ ] README.md complet
- [ ] API Reference complète
- [ ] Getting Started guide
- [ ] Au moins 2 exemples fonctionnels

### Publication
- [ ] npm login
- [ ] Version 0.1.0 tagguée
- [ ] `npm publish` réussi
- [ ] Package visible sur npmjs.com
