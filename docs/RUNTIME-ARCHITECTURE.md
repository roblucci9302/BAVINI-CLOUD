# BAVINI Runtime Architecture

> Version: 2.0
> Last Updated: 2026-01-21
> Status: Production Ready

---

## 1. Overview

The BAVINI Runtime is a browser-based JavaScript execution environment that provides:

- **OPFS Filesystem**: Persistent storage using Origin Private File System
- **Browser Terminal**: Interactive shell with builtin commands
- **Package Manager**: NPM-compatible package resolution and installation
- **Node.js Runtime**: QuickJS-based JavaScript execution with Node.js API compatibility
- **Dev Server**: Hot Module Replacement (HMR) with framework support
- **Performance Optimization**: Caching, worker pools, and startup optimization

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         UI Layer                                     │
│  ┌───────────┐  ┌───────────────┐  ┌────────────────┐              │
│  │ xterm.js  │  │  CodeMirror   │  │ Preview iframe │              │
│  │ Terminal  │  │    Editor     │  │   (sandboxed)  │              │
│  └─────┬─────┘  └───────┬───────┘  └───────┬────────┘              │
└────────┼────────────────┼──────────────────┼────────────────────────┘
         │                │                  │
┌────────▼────────────────▼──────────────────▼────────────────────────┐
│                    Runtime Adapters                                  │
│  ┌──────────────────┐  ┌──────────────────┐                         │
│  │ BrowserBuildAdapter│ │WebContainerAdapter│                        │
│  │  (client-only)    │  │   (full Node.js)  │                        │
│  └────────┬──────────┘  └─────────┬────────┘                         │
└───────────┼───────────────────────┼──────────────────────────────────┘
            │                       │
┌───────────▼───────────────────────▼──────────────────────────────────┐
│                         Core Services                                 │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐     │
│  │ Filesystem │  │   Terminal │  │  Package   │  │ Dev Server │     │
│  │   (OPFS)   │  │  (Browser) │  │  Manager   │  │    (HMR)   │     │
│  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘  └─────┬──────┘     │
└────────┼───────────────┼───────────────┼───────────────┼─────────────┘
         │               │               │               │
┌────────▼───────────────▼───────────────▼───────────────▼─────────────┐
│                      Performance Layer                                │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐     │
│  │Performance │  │  Worker    │  │   Smart    │  │  Startup   │     │
│  │  Monitor   │  │   Pool     │  │   Cache    │  │ Optimizer  │     │
│  └────────────┘  └────────────┘  └────────────┘  └────────────┘     │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 2. Filesystem Layer

### 2.1 Architecture

The filesystem supports multiple backends with automatic fallback:

```typescript
interface FSBackend {
  init(): Promise<void>;
  destroy(): Promise<void>;
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, data: Uint8Array): Promise<void>;
  unlink(path: string): Promise<void>;
  mkdir(path: string, opts?: { recursive?: boolean }): Promise<void>;
  rmdir(path: string, opts?: { recursive?: boolean }): Promise<void>;
  readdir(path: string): Promise<string[]>;
  stat(path: string): Promise<FileStat>;
  exists(path: string): Promise<boolean>;
  rename(oldPath: string, newPath: string): Promise<void>;
  readonly persistent: boolean;
  readonly name: string;
}
```

### 2.2 Backends

| Backend | Use Case | Persistence | Performance |
|---------|----------|-------------|-------------|
| **OPFS** | Primary storage | Yes | High |
| **IndexedDB** | Fallback for Safari < 15.2 | Yes | Medium |
| **Memory** | Temporary files (/tmp) | No | Highest |

### 2.3 Mount Manager

```typescript
const mountManager = new MountManager();

// Mount OPFS as root
await mountManager.mount('/', new OPFSBackend());

// Mount memory for temp files
await mountManager.mount('/tmp', new MemoryBackend());

// Operations are routed to the correct backend
await mountManager.writeFile('/src/index.ts', content);  // -> OPFS
await mountManager.writeFile('/tmp/cache.json', data);   // -> Memory
```

---

## 3. Terminal Layer

### 3.1 Architecture

```
┌─────────────────────────────────────────────┐
│              xterm.js UI                     │
└─────────────────────┬───────────────────────┘
                      │
┌─────────────────────▼───────────────────────┐
│           BrowserTerminalStore               │
│  ┌──────────────────────────────────────┐   │
│  │  VirtualPTY (input/output handling)   │   │
│  └────────────────┬─────────────────────┘   │
│  ┌────────────────▼─────────────────────┐   │
│  │  CommandExecutor (dispatch)           │   │
│  └────────────────┬─────────────────────┘   │
│  ┌────────────────▼─────────────────────┐   │
│  │  ShellState (env, cwd, history)       │   │
│  └──────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

### 3.2 Builtin Commands

| Command | Description |
|---------|-------------|
| `cd [dir]` | Change directory |
| `ls [-la] [path]` | List files |
| `cat <file>` | Display file content |
| `pwd` | Print working directory |
| `echo [text]` | Print text |
| `mkdir [-p] <dir>` | Create directory |
| `rm [-rf] <path>` | Remove file/directory |
| `cp <src> <dest>` | Copy file |
| `mv <src> <dest>` | Move/rename |
| `touch <file>` | Create empty file |
| `clear` | Clear terminal |
| `env` | Show environment |
| `export KEY=value` | Set env variable |
| `help [cmd]` | Show help |

### 3.3 External Commands

External commands (npm, node, etc.) are executed via the package manager or QuickJS runtime.

---

## 4. Package Manager

### 4.1 Features

- NPM registry compatibility
- package.json parsing
- Dependency resolution with version ranges
- node_modules structure
- CDN-based package fetching (esm.sh, unpkg, jsdelivr)

### 4.2 Architecture

```typescript
const packageManager = new PackageManager(filesystem);

// Install packages
await packageManager.install(['react', 'react-dom']);

// Resolve a module
const resolved = await packageManager.resolve('react', '/src/App.tsx');
```

### 4.3 Resolution Strategy

1. Check local node_modules
2. Check package.json dependencies
3. Fetch from CDN (cached)
4. Install to node_modules

---

## 5. Node.js Runtime

### 5.1 QuickJS Integration

The runtime uses QuickJS-WASM for JavaScript execution with Node.js API compatibility:

```typescript
const runtime = new NodeJSRuntime(filesystem);

// Execute a script
const result = await runtime.execute('/src/index.js');

// Run with Node.js APIs
await runtime.run(`
  const fs = require('fs');
  const data = fs.readFileSync('/src/data.json');
  console.log(JSON.parse(data));
`);
```

### 5.2 Supported Node.js APIs

| Module | Status | Notes |
|--------|--------|-------|
| `fs` | Full | Async and sync |
| `path` | Full | |
| `process` | Partial | env, cwd, argv |
| `buffer` | Full | |
| `console` | Full | |
| `timers` | Full | setTimeout, setInterval |
| `events` | Full | EventEmitter |
| `stream` | Partial | Readable, Writable |
| `url` | Full | |
| `querystring` | Full | |
| `util` | Partial | promisify, inspect |

---

## 6. Dev Server

### 6.1 Architecture

```
┌─────────────────────────────────────────────┐
│              DevServer                       │
│  ┌────────────────────────────────────────┐ │
│  │  VirtualHTTPServer (request handling)  │ │
│  └────────────────┬───────────────────────┘ │
│  ┌────────────────▼───────────────────────┐ │
│  │  ModuleGraph (dependency tracking)     │ │
│  └────────────────┬───────────────────────┘ │
│  ┌────────────────▼───────────────────────┐ │
│  │  HMR Server (hot updates)              │ │
│  └────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

### 6.2 HMR Flow

1. File change detected
2. Module graph invalidated
3. HMR update generated
4. BroadcastChannel notifies client
5. Client applies update

### 6.3 Framework Plugins

| Plugin | Features |
|--------|----------|
| **React Refresh** | Component state preservation |
| **Vue HMR** | SFC hot replacement |
| **CSS HMR** | Style injection without reload |

---

## 7. Performance Layer

### 7.1 Performance Monitor

Tracks metrics with configurable budgets:

```typescript
const monitor = getPerformanceMonitor();

// Time an operation
await monitor.time('build', async () => {
  await build();
});

// Record metrics
monitor.record('parse:files', 150, { count: 50 });

// Get report
const report = monitor.generateReport();
```

### 7.2 Worker Pool

Manages web workers for parallel task execution:

```typescript
const pool = createWorkerPool('/worker.js', {
  minWorkers: 2,
  maxWorkers: 8,
  idleTimeout: 30000,
});

await pool.init();

// Execute tasks in parallel
const results = await pool.execBatch([
  { message: { type: 'transform', file: 'a.ts' } },
  { message: { type: 'transform', file: 'b.ts' } },
]);
```

### 7.3 Smart Cache

LRU cache with memory limits and TTL:

```typescript
const cache = createSmartCache<string>('transforms', {
  maxEntries: 500,
  maxSizeBytes: 50 * 1024 * 1024, // 50MB
  ttlMs: 60 * 60 * 1000,          // 1 hour
  persistent: true,
});

cache.set('key', value);
const cached = cache.get('key');
```

### 7.4 Startup Optimizer

Lazy loading and parallel initialization:

```typescript
const optimizer = getStartupOptimizer();

// Register resources for lazy loading
optimizer.registerResources([
  { id: 'quickjs-wasm', type: 'wasm', url: '/quickjs.wasm', priority: 'critical' },
  { id: 'esbuild-wasm', type: 'wasm', url: '/esbuild.wasm', priority: 'high' },
]);

// Register startup phases
optimizer.registerPhase({
  name: 'filesystem',
  dependencies: [],
  execute: async () => { /* init FS */ },
});

optimizer.registerPhase({
  name: 'runtime',
  dependencies: ['filesystem'],
  execute: async () => { /* init runtime */ },
});

// Run startup
const timing = await optimizer.runStartup();
```

---

## 8. Performance Budgets

| Metric | Budget | Warning |
|--------|--------|---------|
| Boot time | 2.5s | 3.5s |
| Build time | 5s | 7s |
| Memory usage | 256MB | 384MB |
| Bundle size | 3MB | 4MB |

---

## 9. Browser Compatibility

### 9.1 Required Features

| Feature | Chrome | Firefox | Safari | Edge |
|---------|--------|---------|--------|------|
| OPFS | 86+ | 111+ | 15.2+ | 86+ |
| Web Workers | All | All | All | All |
| ES Modules | 61+ | 60+ | 11+ | 16+ |
| BroadcastChannel | 54+ | 38+ | 15.4+ | 79+ |
| TextEncoder | 38+ | 19+ | 10.1+ | 79+ |

### 9.2 Fallbacks

- **OPFS unavailable**: Use IndexedDB backend
- **SharedArrayBuffer restricted**: Use MessageChannel
- **BroadcastChannel unavailable**: Use localStorage events

---

## 10. Directory Structure

```
app/lib/runtime/
├── index.ts                    # Public exports
├── factory.ts                  # Runtime factory
├── types.ts                    # Shared types
├── filesystem/                 # OPFS filesystem
│   ├── backends/
│   │   ├── opfs-backend.ts
│   │   ├── indexeddb-backend.ts
│   │   └── memory-backend.ts
│   ├── mount-manager.ts
│   └── path-utils.ts
├── terminal/                   # Browser terminal
│   ├── browser-terminal-store.ts
│   ├── virtual-pty.ts
│   ├── command-executor.ts
│   ├── shell-state.ts
│   └── builtins/
├── package-manager/           # NPM package manager
│   ├── package-manager.ts
│   ├── dependency-resolver.ts
│   ├── registry-client.ts
│   └── lockfile.ts
├── nodejs/                    # Node.js runtime
│   ├── nodejs-runtime.ts
│   ├── module-loader.ts
│   └── builtin-modules/
├── dev-server/                # Dev server & HMR
│   ├── dev-server.ts
│   ├── virtual-server.ts
│   ├── module-graph.ts
│   ├── hmr-server.ts
│   ├── hmr-client.ts
│   └── plugins/
├── performance/               # Performance utilities
│   ├── performance-monitor.ts
│   ├── worker-pool.ts
│   ├── smart-cache.ts
│   └── startup-optimizer.ts
└── quickjs/                   # QuickJS integration
    ├── quickjs-runtime.ts
    └── unified-fs.ts
```

---

## 11. Usage Example

```typescript
import {
  MountManager,
  OPFSBackend,
  MemoryBackend,
  BrowserTerminalStore,
  PackageManager,
  DevServer,
  getPerformanceMonitor,
} from '~/lib/runtime';

// Initialize filesystem
const fs = new MountManager();
await fs.mount('/', new OPFSBackend());
await fs.mount('/tmp', new MemoryBackend());

// Initialize terminal
const terminal = new BrowserTerminalStore({ filesystem: fs });
await terminal.attachTerminal(xtermInstance);

// Initialize package manager
const pm = new PackageManager(fs);
await pm.install(['react', 'react-dom']);

// Initialize dev server
const devServer = new DevServer(fs, { port: 3000 });
await devServer.start();

// Monitor performance
const monitor = getPerformanceMonitor();
monitor.startMemoryMonitoring();
```

---

## 12. Contributing

### Running Tests

```bash
pnpm test app/lib/runtime
```

### Building

```bash
pnpm build
```

### Code Style

See `CLAUDE.md` for coding standards and conventions.
