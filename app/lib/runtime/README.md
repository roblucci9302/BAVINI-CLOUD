# BAVINI CLOUD - Runtime Abstraction Layer

## Overview

This module provides an abstraction layer for different runtime engines used by BAVINI Cloud. The current implementation uses StackBlitz's WebContainer, but the architecture allows switching to alternative runtimes (like esbuild-wasm) without changing business logic.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Business Logic                          │
│  (Chat, Workbench, File Operations, Build Commands, etc.)  │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                   RuntimeAdapter Interface                  │
│  init(), writeFiles(), build(), getPreview(), transform()  │
└───────────────┬─────────────────────────┬───────────────────┘
                │                         │
                ▼                         ▼
┌───────────────────────────┐   ┌───────────────────────────┐
│   WebContainerAdapter     │   │   BrowserBuildAdapter     │
│   (Current - Phase 0)     │   │   (Future - Phase 1+)     │
│                           │   │                           │
│ - Full Node.js runtime    │   │ - esbuild-wasm bundler    │
│ - npm install support     │   │ - esm.sh for packages     │
│ - Terminal/Shell access   │   │ - Blob URL previews       │
│ - Dev server (Vite, etc)  │   │ - No server required      │
└───────────────────────────┘   └───────────────────────────┘
```

## Files

| File | Description |
|------|-------------|
| `types.ts` | Common types (FileMap, BundleResult, BuildOptions, etc.) |
| `adapter.ts` | RuntimeAdapter interface and BaseRuntimeAdapter class |
| `factory.ts` | Factory functions and runtimeTypeStore feature flag |
| `index.ts` | Public exports |
| `adapters/webcontainer-adapter.ts` | WebContainer implementation |

## Usage

### Basic Usage

```typescript
import { initRuntime, getRuntimeAdapter } from '~/lib/runtime';

// Initialize runtime (once at app start)
const adapter = await initRuntime();

// Write files
await adapter.writeFiles(new Map([
  ['/src/App.tsx', 'export default () => <div>Hello</div>'],
  ['/src/main.tsx', 'import App from "./App"; ...'],
]));

// Build
const result = await adapter.build({
  entryPoint: '/src/main.tsx',
  mode: 'development',
});

// Get preview URL
const preview = adapter.getPreview();
console.log(preview?.url); // blob:... or http://localhost:...
```

### Feature Flag

The runtime engine can be switched via the `runtimeTypeStore`:

```typescript
import { runtimeTypeStore, setRuntimeType } from '~/lib/runtime';
import { setBuildEngine } from '~/lib/stores/settings';

// Check current runtime
console.log(runtimeTypeStore.get()); // 'webcontainer' | 'browser'

// Switch runtime (via settings - recommended)
setBuildEngine('browser');

// Or directly
setRuntimeType('browser');
```

### Callbacks

```typescript
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
    console.log(`Build ${phase}: ${progress}%`);
  },
});
```

## RuntimeAdapter Interface

| Method | Description |
|--------|-------------|
| `init()` | Initialize the runtime |
| `destroy()` | Clean up resources |
| `writeFiles(files)` | Write multiple files |
| `writeFile(path, content)` | Write a single file |
| `readFile(path)` | Read a file (null if not found) |
| `deleteFile(path)` | Delete a file |
| `readdir(path)` | List directory contents |
| `build(options)` | Build the project |
| `transform(code, options)` | Transform a single file |
| `getPreview()` | Get current preview info |
| `refreshPreview()` | Force preview refresh |
| `setCallbacks(callbacks)` | Register event handlers |

### Capability Flags

| Flag | WebContainer | BrowserBuild |
|------|--------------|--------------|
| `supportsTerminal` | ✅ | ❌ |
| `supportsShell` | ✅ | ❌ |
| `supportsNodeServer` | ✅ | ❌ |
| `isBrowserOnly` | ✅ (WASM) | ✅ |
| `supportedFrameworks` | All | React, Vue, Svelte, Vanilla |

## Build Options

```typescript
interface BuildOptions {
  entryPoint: string;           // e.g., '/src/main.tsx'
  mode: 'development' | 'production';
  minify?: boolean;             // Production only
  sourcemap?: boolean;          // For debugging
  define?: Record<string, string>; // env variables
}
```

## Bundle Result

```typescript
interface BundleResult {
  code: string;          // Bundled JavaScript
  css: string;           // Extracted CSS
  errors: BuildError[];  // Build errors
  warnings: BuildWarning[];
  buildTime: number;     // ms
  hash: string;          // For cache invalidation
}
```

## Testing

Reference tests are located in `__tests__/`:

```bash
# Run runtime tests
pnpm test app/lib/runtime/__tests__
```

Tests cover:
- Lifecycle (init/destroy)
- File system operations
- Build process
- Transform functionality
- Preview management
- Callbacks/events
- Capability flags

## Migration Path

### Phase 0 (Current)
- ✅ RuntimeAdapter interface defined
- ✅ WebContainerAdapter wraps existing behavior
- ✅ Reference tests document expected behavior
- ✅ Feature flag in settings store

### Phase 1 (Next)
- [ ] Implement BrowserBuildAdapter with esbuild-wasm
- [ ] Add esm.sh CDN integration for npm packages
- [ ] Blob URL preview system
- [ ] UI toggle in settings

### Phase 2+
- [ ] Supabase Edge Functions for backend operations
- [ ] File persistence via Supabase Storage
- [ ] Progressive migration of features

## Dependencies

Current (WebContainer):
- `@webcontainer/api`

Future (BrowserBuild):
- `esbuild-wasm`
- `esm.sh` (CDN, no npm install)
