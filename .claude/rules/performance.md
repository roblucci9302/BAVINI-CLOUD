# Performance Rules

> Guidelines performance pour BAVINI

## Context Window Management

### Critique

```
⚠️ Le context window de 200k peut réduire à 70k avec trop d'outils

LIMITES RECOMMANDÉES:
- MCPs configurés: 20-30 max
- MCPs actifs par projet: < 10
- Tools actifs: < 80
```

### Stratégies

```typescript
// 1. Utiliser des agents pour tâches longues
// Libère le contexte principal

// 2. Résumer plutôt qu'inclure
// ❌ Inclure fichier de 2000 lignes
// ✅ Résumer les parties pertinentes

// 3. Désactiver MCPs non utilisés
// Dans settings, utiliser disabledMcpServers
```

## React Performance

### Éviter Re-renders Inutiles

```typescript
// ❌ Création d'objet à chaque render
<Component style={{ margin: 10 }} />
<Component onClick={() => handleClick(id)} />

// ✅ Mémoization
const style = useMemo(() => ({ margin: 10 }), []);
const handleClickMemo = useCallback(() => handleClick(id), [id]);

<Component style={style} />
<Component onClick={handleClickMemo} />
```

### Memo pour Composants Coûteux

```typescript
// ❌ Re-render à chaque parent update
function ExpensiveList({ items }) {
  return items.map(item => <ExpensiveItem key={item.id} {...item} />);
}

// ✅ Mémoization
const ExpensiveList = memo(function ExpensiveList({ items }) {
  return items.map(item => <ExpensiveItem key={item.id} {...item} />);
});

const ExpensiveItem = memo(function ExpensiveItem(props) {
  // Render coûteux
});
```

### Lazy Loading

```typescript
// ❌ Import direct de gros composants
import { HeavyEditor } from './HeavyEditor';

// ✅ Lazy loading
const HeavyEditor = lazy(() => import('./HeavyEditor'));

function App() {
  return (
    <Suspense fallback={<Loading />}>
      <HeavyEditor />
    </Suspense>
  );
}
```

## State Management Performance

### Nanostores - Selective Subscriptions

```typescript
// ❌ S'abonner à tout le store
const allState = useStore(bigStore);

// ✅ S'abonner seulement à ce qui est nécessaire
const specificValue = useStore(
  computed(bigStore, state => state.specificField)
);
```

### Éviter les Subscriptions Excessives

```typescript
// ❌ Multiple subscriptions dans un effet
useEffect(() => {
  const unsub1 = store1.subscribe(() => {});
  const unsub2 = store2.subscribe(() => {});
  const unsub3 = store3.subscribe(() => {});
  // ...
}, []);

// ✅ Combiner avec computed
const combinedStore = computed(
  [store1, store2, store3],
  (s1, s2, s3) => ({ ...s1, ...s2, ...s3 })
);

const combined = useStore(combinedStore);
```

## Build Performance

### Debouncing

```typescript
// BAVINI utilise un debounce de 500ms pour les builds
const BUILD_DEBOUNCE_MS = 500;

// Évite les builds pendant que les fichiers sont encore écrits
let buildTimer: ReturnType<typeof setTimeout> | null = null;

function triggerBuild() {
  if (buildTimer) clearTimeout(buildTimer);

  buildTimer = setTimeout(() => {
    executeBuild();
  }, BUILD_DEBOUNCE_MS);
}
```

### Caching

```typescript
// Cache LRU pour les packages npm
import { LRUCache } from 'lru-cache';

const moduleCache = new LRUCache<string, string>({
  max: 150,              // Max entries
  ttl: 1000 * 60 * 60,  // 1 hour TTL
});

async function fetchModule(url: string): Promise<string> {
  const cached = moduleCache.get(url);
  if (cached) return cached;

  const response = await fetch(url);
  const content = await response.text();

  moduleCache.set(url, content);
  return content;
}
```

### Worker Offloading

```typescript
// Opérations lourdes dans des Workers
// ✅ Build dans un Worker
const buildWorker = new Worker('./build.worker.ts');
buildWorker.postMessage({ type: 'BUILD', files });

// ✅ Compilation dans un Worker
const compilerWorker = new Worker('./compiler.worker.ts');
compilerWorker.postMessage({ type: 'COMPILE', source });
```

## Memory Management

### Cleanup des Subscriptions

```typescript
// ✅ Toujours cleanup
useEffect(() => {
  const unsub = store.subscribe(handler);
  return () => unsub(); // Cleanup!
}, []);

// Dans les classes
class MyService {
  #cleanupFunctions: Array<() => void> = [];

  init() {
    const unsub = store.subscribe(handler);
    this.#cleanupFunctions.push(unsub);
  }

  destroy() {
    this.#cleanupFunctions.forEach(fn => fn());
    this.#cleanupFunctions = [];
  }
}
```

### Revoke Blob URLs

```typescript
// Les Blob URLs consomment de la mémoire
const blobUrl = URL.createObjectURL(blob);

// ✅ Toujours révoquer quand plus nécessaire
function updatePreview(newBlob: Blob) {
  if (this.currentBlobUrl) {
    URL.revokeObjectURL(this.currentBlobUrl);
  }
  this.currentBlobUrl = URL.createObjectURL(newBlob);
}
```

### Limiter la Taille des Fichiers

```typescript
// BAVINI limite à 5MB par fichier
const MAX_FILE_SIZE = 5 * 1024 * 1024;

function validateFile(content: string): boolean {
  if (content.length > MAX_FILE_SIZE) {
    logger.warn(`File too large: ${content.length} bytes`);
    return false;
  }
  return true;
}
```

## Benchmarks Cibles

| Métrique | Cible | Acceptable |
|----------|-------|------------|
| Boot time | < 2s | < 3s |
| First preview | < 5s | < 8s |
| Build (React app) | < 3s | < 5s |
| npm install (5 pkgs) | < 5s | < 10s |
| Memory usage | < 200MB | < 300MB |
| Bundle size | < 2MB | < 3MB |
