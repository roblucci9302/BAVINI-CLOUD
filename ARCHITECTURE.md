# BAVINI CLOUD - Architecture

## Vue d'ensemble

BAVINI CLOUD est une application web pour la generation de code assistee par IA avec preview en temps reel. L'architecture est basee sur Remix (React) avec un systeme de runtime modulaire.

## Diagramme des composants

```
+------------------------------------------------------------------+
|                           BAVINI CLOUD                            |
+------------------------------------------------------------------+
|                                                                    |
|  +---------------------+    +--------------------------------+    |
|  |    Frontend (React) |    |         Backend (Remix)        |    |
|  +---------------------+    +--------------------------------+    |
|  |                     |    |                                |    |
|  | - Chat Interface    |    | - API Routes (/api/*)         |    |
|  | - Workbench         |    | - Agent Orchestration         |    |
|  | - Code Editor       |    | - LLM Integration (Anthropic) |    |
|  | - Preview Panel     |    | - Rate Limiting               |    |
|  | - File Explorer     |    |                                |    |
|  |                     |    |                                |    |
|  +---------------------+    +--------------------------------+    |
|          |                             |                           |
|          v                             v                           |
|  +---------------------------------------------------------------+ |
|  |                    Runtime Layer                               | |
|  +---------------------------------------------------------------+ |
|  |                                                                 | |
|  |  +------------------+          +-------------------------+     | |
|  |  | BrowserBuild     |    OR    | WebContainer            |     | |
|  |  | (esbuild-wasm)   |          | (StackBlitz)            |     | |
|  |  +------------------+          +-------------------------+     | |
|  |  | - In-browser     |          | - Full Node.js env      |     | |
|  |  | - Fast builds    |          | - npm support           |     | |
|  |  | - Limited deps   |          | - Terminal access       |     | |
|  |  +------------------+          +-------------------------+     | |
|  |                                                                 | |
|  +---------------------------------------------------------------+ |
|                                                                    |
+------------------------------------------------------------------+
```

## Structure des dossiers

```
app/
├── components/         # Composants React
│   ├── chat/          # Interface de chat
│   ├── editor/        # Editeur de code (CodeMirror)
│   ├── workbench/     # Workbench et preview
│   └── ui/            # Composants UI generiques
│
├── lib/               # Logique metier
│   ├── agents/        # Systeme d'agents IA
│   │   ├── orchestrator/  # Orchestrateur principal
│   │   ├── security/      # Validation des actions
│   │   └── types.ts       # Types des agents
│   │
│   ├── runtime/       # Couche d'abstraction runtime
│   │   ├── adapters/      # Implementations (Browser, WebContainer)
│   │   ├── factory.ts     # Factory pattern pour les runtimes
│   │   └── adapter.ts     # Interface commune
│   │
│   ├── stores/        # Stores Nanostores
│   │   ├── workbench.ts   # Etat du workbench
│   │   ├── files.ts       # Systeme de fichiers
│   │   └── settings.ts    # Parametres utilisateur
│   │
│   └── security/      # Securite
│       └── rate-limiter.ts
│
├── routes/            # Routes Remix
│   ├── _index.tsx     # Page principale
│   ├── api.agent.ts   # API des agents
│   └── api.chat.ts    # API du chat
│
└── utils/             # Utilitaires
    └── logger.ts      # Logging
```

## Flow des donnees

### 1. Message utilisateur -> Generation de code

```
User Input
    |
    v
+-------------------+
| Chat Component    |
+-------------------+
    |
    v (POST /api/agent)
+-------------------+
| Agent API Route   |
+-------------------+
    |
    v
+-------------------+
| Orchestrator      |  <-- Decide quel sous-agent utiliser
+-------------------+
    |
    +-----> Coder Agent (generation de code)
    |
    +-----> Builder Agent (npm install, etc.)
    |
    +-----> Tester Agent (tests)
    |
    v
+-------------------+
| Action Validator  |  <-- Valide les actions avant execution
+-------------------+
    |
    v
+-------------------+
| Runtime Adapter   |  <-- Execute les actions (fichiers, builds)
+-------------------+
    |
    v
+-------------------+
| Preview Update    |  <-- Met a jour la preview
+-------------------+
```

### 2. Modification de fichier -> Preview

```
File Change (Editor or Agent)
    |
    v
+-------------------+
| Workbench Store   |  <-- Debounce 500ms
+-------------------+
    |
    v
+-------------------+
| Runtime Adapter   |
+-------------------+
    |
    +---> (Browser) esbuild-wasm build
    |         |
    |         v
    |     Blob URL
    |
    +---> (WebContainer) npm run dev
              |
              v
          Server URL
    |
    v
+-------------------+
| Preview Panel     |  <-- iframe avec hot reload
+-------------------+
```

## Patterns utilises

### 1. Factory Pattern (Runtime)

```typescript
// factory.ts
export function createRuntimeAdapter(type: RuntimeType): RuntimeAdapter {
  switch (type) {
    case 'browser':
      return new BrowserBuildAdapter();
    case 'webcontainer':
      return new WebContainerAdapter();
  }
}
```

### 2. Singleton avec Protection Race Condition

```typescript
// factory.ts
let initPromise: Promise<RuntimeAdapter> | null = null;

export async function initRuntime(): Promise<RuntimeAdapter> {
  if (initPromise) {
    return initPromise; // Appels concurrents partagent la meme Promise
  }

  initPromise = (async () => {
    // ... init logic
  })();

  return initPromise;
}
```

### 3. LRU Cache avec TTL

```typescript
// browser-build-adapter.ts
class LRUCache<K, V> {
  private maxSize: number;
  private maxAge: number;

  get(key: K): V | undefined {
    // Eviction si expire ou si taille max atteinte
  }
}
```

### 4. Deny-by-Default pour la securite

```typescript
// command-whitelist.ts
export function checkCommand(command: string): CommandCheckResult {
  // Verifier les regles explicites
  for (const rule of rules) {
    if (matches(command, rule)) {
      return rule.result;
    }
  }

  // Par defaut: bloquer
  return { level: 'blocked' };
}
```

## Stores (Nanostores)

| Store | Description | Fichier |
|-------|-------------|---------|
| `workbenchStore` | Etat du workbench (fichiers, builds) | `stores/workbench.ts` |
| `filesStore` | Contenu des fichiers | `stores/files.ts` |
| `settingsStore` | Parametres utilisateur | `stores/settings.ts` |
| `runtimeTypeStore` | Type de runtime actif | `runtime/factory.ts` |
| `agentLogsStore` | Logs des agents | `stores/agents.ts` |

## Securite

Voir [SECURITY.md](./SECURITY.md) pour les details.

## Performance

### Optimisations implementees

1. **Debounce des builds** - 500ms pour eviter les builds excessifs
2. **LRU Cache** - 150 modules, 1h TTL
3. **Memoization** - Stores computed avec shallow equality
4. **Worker idle timeout** - Terminaison apres 30s d'inactivite
5. **Streaming O(1)** - Array.join() au lieu de +=

### Metriques cibles

| Metrique | Cible |
|----------|-------|
| Build time (small project) | < 2s |
| Preview update | < 500ms |
| Memory usage | < 500MB |
| P95 response time | < 5s |

## Tests

```bash
# Lancer tous les tests
pnpm test

# Tests specifiques
pnpm test -- --filter=race-conditions
pnpm test -- --filter=security
pnpm test -- --filter=memory-leaks
```

Voir le dossier `__tests__/` dans chaque module pour les tests unitaires.
