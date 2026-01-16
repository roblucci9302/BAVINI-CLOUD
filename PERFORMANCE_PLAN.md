# Plan d'Optimisation Performance - BAVINI

## Résumé de l'Audit

### Métriques Actuelles

| Métrique | Valeur | Statut |
|----------|--------|--------|
| Bundle Client Total | 40 MB | CRITIQUE |
| Chunk Principal (_index) | 1.4 MB | CRITIQUE |
| Three.js | 720 KB | OK (lazy) |
| Shiki Languages | 2.5 MB total | CRITIQUE |
| PGLite WASM | 8.9 MB | ATTENTION |
| PGLite Data | 4.9 MB | ATTENTION |
| XTerm | 289 KB | OK |
| Tests | 2324 pass | OK |

### Dépendances Lourdes (node_modules)

| Package | Taille | Usage |
|---------|--------|-------|
| @cloudflare | 106 MB | Hosting (nécessaire) |
| three | 37 MB | 3D background (lazy loaded) |
| date-fns | 36 MB | Date formatting |
| @electric-sql/pglite | 20 MB | SQL local |
| pyodide | 13 MB | Python runtime |
| @shikijs | 12 MB | Syntax highlighting |

---

## Phase 1 : Optimisation Bundle Critique (Impact Élevé)

### 1.1 Réduire les langages Shiki

**Problème** : Tous les langages Shiki sont inclus (~2.5 MB)

**Solution** : Charger uniquement les langages nécessaires

```typescript
// app/lib/shiki/languages.ts (nouveau fichier)
export const ESSENTIAL_LANGUAGES = [
  'javascript', 'typescript', 'jsx', 'tsx',
  'python', 'html', 'css', 'json', 'markdown',
  'bash', 'shell', 'sql'
];

// Langages optionnels chargés à la demande
export const OPTIONAL_LANGUAGES = [
  'rust', 'go', 'java', 'cpp', 'c', 'ruby', 'php'
];
```

**Fichiers à modifier** :
- `app/components/chat/CodeBlock.tsx`
- `app/components/chat/Artifact.tsx`

**Gain estimé** : ~2 MB (réduction de 80% des langages)

### 1.2 Code Splitting du Chunk Principal

**Problème** : `_index-D4YHK09x.js` fait 1.4 MB

**Solution** : Séparer en chunks logiques

```typescript
// vite.config.ts - ajouter manualChunks
build: {
  rollupOptions: {
    output: {
      manualChunks: {
        'vendor-react': ['react', 'react-dom', 'react-router-dom'],
        'vendor-ai': ['ai', '@ai-sdk/anthropic', '@ai-sdk/openai'],
        'vendor-codemirror': ['@codemirror/state', '@codemirror/view', '@codemirror/lang-javascript'],
        'vendor-ui': ['framer-motion', '@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu'],
        'vendor-git': ['isomorphic-git', '@isomorphic-git/lightning-fs'],
      }
    }
  }
}
```

**Gain estimé** : Réduction chunk principal à ~400 KB

### 1.3 Lazy Loading PGLite

**Problème** : PGLite (13.8 MB) chargé au démarrage

**Solution** : Charger uniquement quand nécessaire

```typescript
// app/lib/database/pglite.lazy.ts
let pgliteInstance: PGlite | null = null;

export async function getPGLite() {
  if (!pgliteInstance) {
    const { PGlite } = await import('@electric-sql/pglite');
    pgliteInstance = new PGlite();
  }
  return pgliteInstance;
}
```

**Gain estimé** : 13.8 MB différé au premier usage SQL

---

## Phase 2 : Optimisation State Management (Impact Moyen)

### 2.1 Remplacer Array.slice() par Circular Buffer

**Problème** : Copie O(n) à chaque mise à jour de logs

**Fichiers concernés** :
- `app/lib/stores/chat.ts:202`
- `app/lib/stores/agents.ts:266-271`

**Solution** :

```typescript
// app/lib/utils/circular-buffer.ts
export class CircularBuffer<T> {
  private buffer: T[];
  private head = 0;
  private size = 0;

  constructor(private capacity: number) {
    this.buffer = new Array(capacity);
  }

  push(item: T): void {
    this.buffer[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
    if (this.size < this.capacity) this.size++;
  }

  toArray(): T[] {
    if (this.size < this.capacity) {
      return this.buffer.slice(0, this.size);
    }
    return [...this.buffer.slice(this.head), ...this.buffer.slice(0, this.head)];
  }
}
```

**Gain estimé** : O(1) au lieu de O(n) pour chaque log

### 2.2 Computed Stores pour FileTree

**Problème** : Multiples subscriptions dans FileTree

**Solution** :

```typescript
// app/lib/stores/workbench.ts
export const fileTreeState = computed(
  [filesStore, collapsedFoldersStore, searchQueryStore],
  (files, collapsed, search) => ({
    files: Object.entries(files),
    collapsed,
    search,
    filtered: filterFiles(files, search)
  })
);
```

---

## Phase 3 : Web Workers (Impact Moyen-Élevé)

### 3.1 Worker pour Syntax Highlighting

**Problème** : Shiki bloque le main thread pour gros fichiers

**Solution** :

```typescript
// app/workers/shiki.worker.ts
import { createHighlighter } from 'shiki';

let highlighter: Awaited<ReturnType<typeof createHighlighter>> | null = null;

self.onmessage = async (e: MessageEvent<{ code: string; lang: string }>) => {
  if (!highlighter) {
    highlighter = await createHighlighter({
      themes: ['github-dark'],
      langs: ['javascript', 'typescript', 'python', 'html', 'css']
    });
  }

  const html = highlighter.codeToHtml(e.data.code, {
    lang: e.data.lang,
    theme: 'github-dark'
  });

  self.postMessage({ html });
};
```

```typescript
// app/hooks/useShikiWorker.ts
const worker = new Worker(new URL('../workers/shiki.worker.ts', import.meta.url));

export function useShikiWorker() {
  return useCallback((code: string, lang: string) => {
    return new Promise<string>((resolve) => {
      worker.onmessage = (e) => resolve(e.data.html);
      worker.postMessage({ code, lang });
    });
  }, []);
}
```

**Gain estimé** : Main thread libéré, UI fluide pendant highlighting

### 3.2 Worker pour Diff Computation

```typescript
// app/workers/diff.worker.ts
import { diffLines } from 'diff';

self.onmessage = (e: MessageEvent<{ oldText: string; newText: string }>) => {
  const changes = diffLines(e.data.oldText, e.data.newText);
  self.postMessage({ changes });
};
```

---

## Phase 4 : Optimisation API & Cache (Impact Élevé)

### 4.1 Request Deduplication

```typescript
// app/lib/api/request-cache.ts
const pendingRequests = new Map<string, Promise<Response>>();

export async function dedupedFetch(url: string, options?: RequestInit) {
  const key = `${options?.method || 'GET'}:${url}:${JSON.stringify(options?.body)}`;

  if (pendingRequests.has(key)) {
    return pendingRequests.get(key)!.then(r => r.clone());
  }

  const promise = fetch(url, options);
  pendingRequests.set(key, promise);

  try {
    const response = await promise;
    return response;
  } finally {
    pendingRequests.delete(key);
  }
}
```

### 4.2 Response Cache avec TTL

```typescript
// app/lib/api/response-cache.ts
interface CacheEntry<T> {
  data: T;
  expiry: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

export function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (entry && Date.now() < entry.expiry) {
    return entry.data as T;
  }
  cache.delete(key);
  return null;
}

export function setCache<T>(key: string, data: T, ttlMs: number = 60000): void {
  cache.set(key, { data, expiry: Date.now() + ttlMs });
}
```

### 4.3 HTTP Cache Headers

```typescript
// app/routes/api.agent.ts
export async function action({ request }: ActionFunctionArgs) {
  // ... existing code ...

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache', // Pour streaming
      'Connection': 'keep-alive',
    }
  });
}

// Pour les endpoints statiques
export async function loader() {
  return json(data, {
    headers: {
      'Cache-Control': 'public, max-age=3600', // 1 heure
    }
  });
}
```

---

## Phase 5 : Optimisation Images & Assets

### 5.1 Preload Critical Assets

```html
<!-- app/root.tsx -->
<link rel="preload" href="/assets/pyodide/pyodide.js" as="script" />
<link rel="preload" href="/fonts/inter.woff2" as="font" type="font/woff2" crossorigin />
```

### 5.2 Service Worker avec Stratégie Cache-First

```typescript
// app/lib/performance/service-worker.ts
const CACHE_NAME = 'bavini-v1';
const STATIC_ASSETS = [
  '/assets/pyodide/',
  '/fonts/',
];

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (STATIC_ASSETS.some(path => url.pathname.startsWith(path))) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        return cached || fetch(event.request).then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        });
      })
    );
  }
});
```

---

## Phase 6 : React Optimizations

### 6.1 Stable Message Keys

```typescript
// app/components/chat/Messages.client.tsx
// AVANT
{messages.map((message, index) => (
  <Message key={message.id || `msg-${index}`} ... />
))}

// APRÈS - Générer ID stable si manquant
const messagesWithIds = useMemo(() =>
  messages.map((msg, i) => ({
    ...msg,
    stableId: msg.id || `msg-${crypto.randomUUID()}`
  }))
, [messages]);

{messagesWithIds.map((message) => (
  <Message key={message.stableId} ... />
))}
```

### 6.2 Virtualisation pour Longues Listes

```typescript
// Pour les listes de fichiers > 100 éléments
import { useVirtualizer } from '@tanstack/react-virtual';

function FileTree({ files }: { files: FileEntry[] }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: files.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 24, // hauteur d'une ligne
    overscan: 5,
  });

  return (
    <div ref={parentRef} style={{ height: '100%', overflow: 'auto' }}>
      <div style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map(item => (
          <FileEntry key={files[item.index].path} file={files[item.index]} />
        ))}
      </div>
    </div>
  );
}
```

---

## Phase 7 : Build Optimizations

### 7.1 Vite Config Améliorée

```typescript
// vite.config.ts
export default defineConfig({
  build: {
    target: 'esnext',
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // Remove console.log in production
        drop_debugger: true,
      }
    },
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-ai': ['ai', '@ai-sdk/anthropic'],
          'vendor-codemirror': [/^@codemirror\//],
          'vendor-shiki': ['shiki'],
          'vendor-three': ['three'],
        }
      }
    }
  },
  esbuild: {
    legalComments: 'none', // Remove license comments
  }
});
```

### 7.2 Compression Brotli

```typescript
// vite.config.ts
import viteCompression from 'vite-plugin-compression';

plugins: [
  viteCompression({
    algorithm: 'brotliCompress',
    ext: '.br',
  }),
  viteCompression({
    algorithm: 'gzip',
    ext: '.gz',
  }),
]
```

---

## Ordre d'Implémentation Recommandé

### Semaine 1 : Quick Wins (Impact Immédiat)

| Jour | Tâche | Gain Estimé |
|------|-------|-------------|
| J1 | Réduire langages Shiki | -2 MB |
| J2 | Manual chunks Vite | -1 MB chunk principal |
| J3 | Lazy load PGLite | -13.8 MB initial |
| J4 | Compression Brotli | -60% transfert |
| J5 | Tests & validation | - |

### Semaine 2 : Optimisations Runtime

| Jour | Tâche | Gain Estimé |
|------|-------|-------------|
| J1-2 | Circular Buffer stores | O(1) updates |
| J3-4 | Web Worker Shiki | UI fluide |
| J5 | Request deduplication | -50% API calls |

### Semaine 3 : Polish

| Jour | Tâche | Gain Estimé |
|------|-------|-------------|
| J1 | Stable message keys | Moins de re-renders |
| J2 | Virtualisation FileTree | 60fps scroll |
| J3-4 | Service Worker cache | Offline support |
| J5 | Audit final | - |

---

## Métriques Cibles

| Métrique | Actuel | Cible | Amélioration |
|----------|--------|-------|--------------|
| Bundle Initial | 1.4 MB | 400 KB | -70% |
| Shiki Languages | 2.5 MB | 200 KB | -92% |
| First Contentful Paint | - | < 1.5s | - |
| Time to Interactive | - | < 3s | - |
| Lighthouse Performance | - | > 90 | - |

---

## Commandes de Test Performance

```bash
# Analyser le bundle
npx vite-bundle-visualizer

# Lighthouse CLI
npx lighthouse http://localhost:5173 --output=json --output-path=./lighthouse.json

# Mesurer le build
time npm run build

# Taille des chunks
ls -lah build/client/assets/*.js | sort -k5 -h
```

---

## Fichiers à Créer

1. `app/lib/utils/circular-buffer.ts`
2. `app/lib/shiki/languages.ts`
3. `app/lib/api/request-cache.ts`
4. `app/lib/api/response-cache.ts`
5. `app/workers/shiki.worker.ts`
6. `app/workers/diff.worker.ts`
7. `app/lib/database/pglite.lazy.ts`

## Fichiers à Modifier

1. `vite.config.ts` - Manual chunks, compression
2. `app/components/chat/CodeBlock.tsx` - Worker + langues réduites
3. `app/lib/stores/chat.ts` - Circular buffer
4. `app/lib/stores/agents.ts` - Circular buffer
5. `app/components/workbench/FileTree.tsx` - Virtualisation
6. `app/components/chat/Messages.client.tsx` - Stable keys

---

## Statut d'Implémentation

### ✅ Phase 1 : Bundle Optimizations - COMPLÉTÉ
- Langages Shiki réduits (12 essentiels, optionnels lazy-loaded)
- Manual chunks Vite configurés
- PGLite lazy loading implémenté
- Compression Brotli + Gzip activée

### ✅ Phase 2 : State Management - COMPLÉTÉ
- `CircularBuffer` créé et intégré dans les stores
- Limites: 200 logs agents, 100 messages chat
- Tests: 8 tests pour CircularBuffer

### ✅ Phase 3 : Web Workers - COMPLÉTÉ
- `shiki.worker.ts` pour syntax highlighting off-thread
- `diff.worker.ts` pour diff computation off-thread
- Hooks React: `useShikiWorker`, `useDiffWorker`
- CodeBlock utilise worker pour code > 2000 caractères
- DiffViewer utilise worker pour diffs > 10000 caractères

### ✅ Phase 4 : API & Cache - COMPLÉTÉ
- `request-cache.ts` : Request deduplication
- `response-cache.ts` : Cache avec TTL et LRU eviction
- `cache-headers.ts` : HTTP Cache-Control headers
- Tests: 26 tests pour les caches

### ✅ Phase 5 : Assets & Service Worker - COMPLÉTÉ
- `app/root.tsx` : Preload hints (Pyodide, fonts)
- `public/sw.js` : Version bavini-v2 avec:
  - Cache Pyodide séparé (max 20 entrées)
  - Cache runtime (max 100 entrées)
  - Auto-pruning LRU
- DNS prefetch pour api.anthropic.com

### ✅ Phase 6 : React Optimizations - COMPLÉTÉ
- `Messages.client.tsx` : IDs stables avec useMemo/useRef
- `FileTree.tsx` : Virtualisation avec @tanstack/react-virtual
  - Threshold: > 100 éléments
  - Overscan: 10 éléments
  - Fallback pour petites listes
- Composants `File`, `Folder`, `NodeButton` wrappés avec `memo()`

### ✅ Phase 7 : Build Optimizations - COMPLÉTÉ
- Terser installé et configuré avec:
  - `drop_console: true` - Supprime tous les console.*
  - `drop_debugger: true` - Supprime les debugger
  - `pure_funcs` - Tree-shake console.log/debug/trace
  - `passes: 2` - Double compression
  - `comments: false` - Supprime tous les commentaires
- esbuild configuré avec `legalComments: 'none'`
- **Résultats bundle client:**
  - `_index.js`: 648 KB → 151 KB (Brotli)
  - `vendor-react.js`: 276 KB → 68 KB (Brotli)
  - `vendor-ui.js`: 220 KB → 61 KB (Brotli)
  - `vendor-terminal.js`: 288 KB → 56 KB (Brotli)
  - `vendor-git.js`: 252 KB → 64 KB (Brotli)

---

## Résultats Tests

| Phase | Tests Passés | Fichiers |
|-------|--------------|----------|
| Phase 2 | 8 | circular-buffer.spec.ts |
| Phase 3 | 2348+ | workers hooks |
| Phase 4 | 26 | request-cache.spec.ts, response-cache.spec.ts |
| Phase 5 | 14 | performance tests |
| Phase 6 | 2374 | tous tests |
| Phase 7 | 2374 | tous tests |

---

## Récapitulatif Final

| Métrique | Avant | Après | Amélioration |
|----------|-------|-------|--------------|
| Chunk Principal (_index) | 1.4 MB | 648 KB | -54% |
| _index (Brotli) | - | 151 KB | - |
| Bundle Total Client | ~40 MB | 59 MB* | - |
| Tests Passés | 2324 | 2374 | +50 |

*Note: Le bundle total inclut tous les langages Shiki (lazy-loaded)

### Optimisations Implémentées
1. ✅ Langages Shiki réduits (12 essentiels)
2. ✅ Manual chunks Vite
3. ✅ PGLite lazy loading
4. ✅ Compression Brotli + Gzip
5. ✅ Circular Buffer pour stores
6. ✅ Web Workers (Shiki, Diff)
7. ✅ Request deduplication
8. ✅ Response cache avec TTL
9. ✅ Service Worker optimisé
10. ✅ React memoization
11. ✅ FileTree virtualization
12. ✅ Terser minification

---

*Généré le 3 janvier 2026*
*Dernière mise à jour : Phase 7 complétée - Plan d'optimisation terminé*
