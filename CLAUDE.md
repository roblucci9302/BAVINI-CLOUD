# BAVINI Cloud - Claude Code Configuration

> **Version**: 2.1
> **Dernière mise à jour**: 2026-01-20
> **Projet**: BAVINI - Environnement de développement web propulsé par l'IA

---

## Project Overview

BAVINI est un **environnement de développement full-stack** fonctionnant entièrement dans le navigateur, propulsé par Claude AI. Il combine:

- **Chat IA** avec génération de code en streaming
- **Système multi-agents** (8 agents spécialisés)
- **WebContainer/Browser Runtime** pour exécution Node.js
- **Preview live** avec simulation d'appareils
- **Persistence** via PGlite (IndexedDB)

### Tech Stack

| Catégorie | Technologies |
|-----------|--------------|
| **Frontend** | React 18, TypeScript 5.5, Remix 2.x, Vite 5 |
| **State** | Nanostores, Jotai |
| **Styling** | UnoCSS, SCSS, Tailwind-like utilities |
| **Editor** | CodeMirror 6 |
| **Terminal** | xterm.js |
| **Runtime** | WebContainer API, esbuild-wasm |
| **AI** | Anthropic Claude API, AI SDK |
| **Database** | PGlite (browser PostgreSQL) |
| **Deployment** | Cloudflare Pages/Workers |

---

## Critical Rules

### 1. Code Organization

```
STRUCTURE OBLIGATOIRE:
├── app/
│   ├── components/     # Composants React (feature-based)
│   ├── lib/            # Logique métier et utilitaires
│   │   ├── runtime/    # Adapters et workers
│   │   ├── stores/     # State management (nanostores)
│   │   └── persistence/ # PGlite et storage
│   ├── routes/         # Routes Remix
│   └── styles/         # SCSS global
├── docs/               # Documentation technique
└── worker/             # Cloudflare Workers
```

**Règles strictes:**
- **200-400 lignes** par fichier (max 800 exceptionnellement)
- **Feature-based** structure, pas type-based
- **Colocation**: tests à côté des fichiers (`*.spec.ts`)
- **Barrel exports** via `index.ts` pour chaque module

### 2. Code Style

```typescript
// ✅ OBLIGATOIRE
- TypeScript strict mode (no `any`, no `as` casting abusif)
- Immutabilité par défaut (const, readonly, Object.freeze)
- Early returns pour réduire nesting
- Fonctions pures quand possible
- Noms explicites (pas d'abréviations cryptiques)

// ❌ INTERDIT
- console.log en production (utiliser createScopedLogger)
- Emojis dans le code (sauf si explicitement demandé)
- Magic numbers (utiliser des constantes nommées)
- Mutations directes d'état (utiliser les stores)
- any, @ts-ignore sans justification
```

### 3. Error Handling

```typescript
// Pattern obligatoire pour les erreurs
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('ModuleName');

try {
  // code risqué
} catch (error) {
  logger.error('Description claire:', error);
  // Ne JAMAIS exposer les stack traces à l'utilisateur
  throw new UserFacingError('Message utilisateur friendly');
}
```

### 4. Testing Requirements

| Type | Coverage Min | Outils |
|------|--------------|--------|
| Unit | 80% | Vitest |
| Integration | 70% | Vitest + Testing Library |
| E2E | Critical paths | Playwright |

**TDD Workflow:**
1. Écrire le test FIRST (RED)
2. Implémenter le minimum (GREEN)
3. Refactor avec tests verts
4. Vérifier coverage ≥ 80%

### 5. Security (NON-NÉGOCIABLE)

```typescript
// ❌ JAMAIS
const apiKey = "sk-ant-xxxxx";  // Hardcoded secret
const query = `SELECT * FROM users WHERE id = ${userId}`;  // SQL injection
element.innerHTML = userInput;  // XSS

// ✅ TOUJOURS
const apiKey = process.env.ANTHROPIC_API_KEY;
if (!apiKey) throw new Error('ANTHROPIC_API_KEY required');

// Validation avec Zod
const schema = z.object({ userId: z.string().uuid() });
const { userId } = schema.parse(input);
```

**Checklist pré-commit:**
- [ ] Aucun secret hardcodé
- [ ] Inputs validés (Zod)
- [ ] Queries paramétrées
- [ ] HTML sanitisé
- [ ] CORS configuré
- [ ] Rate limiting en place

---

## Architecture Patterns

### State Management (Nanostores)

```typescript
// ✅ Pattern correct
import { atom, map } from 'nanostores';

// Atoms pour valeurs simples
export const runtimeTypeStore = atom<'browser' | 'webcontainer'>('browser');

// Maps pour objets complexes
export const artifactsStore = map<Record<string, ArtifactState>>({});

// Computed stores
export const isReadyStore = computed(runtimeTypeStore, (type) => type !== null);
```

### Workers Pattern

```typescript
// Tous les workers suivent ce pattern
// 1. Message types définis
type WorkerMessage =
  | { type: 'INIT'; payload: Config }
  | { type: 'EXEC'; payload: Command }
  | { type: 'RESULT'; payload: Result };

// 2. Communication via postMessage
self.onmessage = (event: MessageEvent<WorkerMessage>) => {
  switch (event.data.type) {
    case 'INIT': handleInit(event.data.payload); break;
    case 'EXEC': handleExec(event.data.payload); break;
  }
};
```

### API Response Format

```typescript
// Format standard pour toutes les API responses
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    timestamp: number;
    requestId: string;
  };
}
```

---

## Project-Specific Conventions

### Runtime Adapters

Le système supporte deux runtimes:

| Runtime | Fichier | Usage |
|---------|---------|-------|
| WebContainer | `webcontainer-adapter.ts` | Full Node.js (terminal, npm) |
| Browser Build | `browser-build-adapter.ts` | Client-side only (esbuild) |

**Règle:** Toujours vérifier `runtimeTypeStore` avant d'utiliser des features spécifiques.

### Compilers

Pour ajouter un nouveau framework:

1. Créer `compilers/{framework}-compiler.ts`
2. Implémenter `FrameworkCompiler` interface
3. Enregistrer dans `compiler-registry.ts`
4. Ajouter detection dans `detectFramework()`

### Preview System

```typescript
// Le preview utilise des Blob URLs en mode browser
// et des ports localhost en mode WebContainer

// Pattern pour émettre un preview ready
this._callbacks.onPreviewReady?.({
  url: blobUrl,  // ou `http://localhost:${port}`
  ready: true,
  updatedAt: Date.now(),
});
```

---

## Frontend Design Plugin (Anthropic Official)

BAVINI intègre le plugin officiel Anthropic **frontend-design** pour générer des interfaces uniques et créatives. Ce plugin guide Claude pour éviter les designs "génériques IA" et créer des expériences mémorables.

### Configuration

| Niveau | Description | Tokens estimés | Usage |
|--------|-------------|----------------|-------|
| `minimal` | Désactivé | 0 | Pour du code backend ou utilitaires |
| `standard` | Guidelines essentielles | ~500 | **Défaut** - Bon équilibre créativité/coût |
| `full` | Guidelines complètes | ~1200 | Projets UI critiques |

### Activation

**Via UI (utilisateurs):**
1. Ouvrir Settings (icône engrenage dans sidebar)
2. Onglet "Interface"
3. Section "Design Guidelines"
4. Toggle ON/OFF + sélection du niveau

**Via API (développeurs):**
```typescript
// Dans le body de l'API chat
{
  designGuidelines: {
    enabled: true,
    level: 'standard'  // 'minimal' | 'standard' | 'full'
  }
}
```

**Via code (agents):**
```typescript
import { getCoderSystemPrompt } from '~/lib/agents';

const prompt = getCoderSystemPrompt({
  enabled: true,
  level: 'full'
});
```

### Principes du Plugin

Le plugin guide Claude pour :

1. **Typographie distinctive** - Éviter Inter, Roboto, Arial (trop générique)
2. **Palettes audacieuses** - Pas de blue-500, indigo-600 par défaut
3. **Layouts surprenants** - Asymétrie, compositions inattendues
4. **Animations impactantes** - Focus sur les moments clés (entrées, transitions)
5. **Designs variés** - Chaque génération doit être unique

### Architecture

```
.claude/skills/frontend-design/SKILL.md  →  Source officielle Anthropic
        │
        ▼
app/lib/skills/skill-loader.ts           →  Charge et cache le contenu
        │
        ▼
app/lib/stores/design-guidelines.ts      →  État utilisateur (nanostores)
        │
        ├──→ app/lib/agents/prompts/     →  Injection dans prompts multi-agent
        └──→ Settings UI                 →  Toggle et sélecteur
```

### Stores Disponibles

```typescript
import {
  designGuidelinesEnabledStore,  // atom<boolean>
  guidelinesLevelStore,          // atom<GuidelinesLevel>
  setDesignGuidelinesEnabled,    // (enabled: boolean) => void
  setGuidelinesLevel,            // (level: GuidelinesLevel) => void
  getEstimatedTokens,            // (level: GuidelinesLevel) => number
} from '~/lib/stores/design-guidelines';
```

### Référence

- **Source** : `.claude/skills/frontend-design/SKILL.md`
- **ADR** : `docs/adr/005-design-guidelines-plugin.md`
- **Tests** : `app/lib/skills/__tests__/`, `app/lib/stores/design-guidelines.spec.ts`

---

## Git Workflow

### Branch Naming

```
feature/  → Nouvelles fonctionnalités
fix/      → Bug fixes
refactor/ → Refactoring sans changement fonctionnel
docs/     → Documentation uniquement
perf/     → Optimisations performance
```

### Commit Format

```
<type>(<scope>): <description>

Types: feat, fix, refactor, docs, test, perf, chore
Scope: runtime, preview, chat, editor, agents, etc.

Exemples:
feat(runtime): Add BAVINI Runtime Phase 1
fix(preview): Resolve Astro compilation error
refactor(stores): Migrate to nanostores v0.10
```

### PR Requirements

- [ ] Tests passent (`pnpm test`)
- [ ] Types valides (`pnpm typecheck`)
- [ ] Lint clean (`pnpm lint`)
- [ ] Coverage maintenu ≥ 80%
- [ ] Documentation mise à jour si API change

---

## Available Commands

### Development

```bash
pnpm dev          # Start dev server (port 5173)
pnpm build        # Production build
pnpm preview      # Preview production build
pnpm typecheck    # TypeScript validation
pnpm lint         # ESLint
pnpm lint:fix     # ESLint with auto-fix
```

### Testing

```bash
pnpm test         # Run all tests
pnpm test:watch   # Watch mode
pnpm test:coverage # With coverage report
```

### Deployment

```bash
pnpm deploy       # Build + deploy to Cloudflare
```

---

## Slash Commands (Claude Code)

| Command | Description | Agent |
|---------|-------------|-------|
| `/plan` | Planifier une feature complexe | planner |
| `/tdd` | Développer en TDD | tdd-guide |
| `/review` | Code review complet | code-reviewer |
| `/security` | Audit sécurité | security-reviewer |
| `/fix-build` | Résoudre erreurs de build | build-fixer |
| `/refactor` | Nettoyer et améliorer code | refactor-cleaner |
| `/e2e` | Créer/runner tests E2E | e2e-runner |

---

## Agent Delegation Rules

### Quand déléguer à un agent

```
DÉLÉGUER SI:
- Tâche spécialisée (security review, TDD)
- Analyse approfondie requise (code review)
- Opération longue (E2E tests, refactoring massif)

NE PAS DÉLÉGUER SI:
- Modification simple (< 50 lignes)
- Question rapide
- Clarification nécessaire d'abord
```

### Agents disponibles

| Agent | Activation | Tools | Model |
|-------|------------|-------|-------|
| **planner** | Features complexes | Read, Grep, Glob | opus |
| **architect** | Décisions architecture | Read, Grep, Glob, WebSearch | opus |
| **coder** | Génération code | Read, Write, Edit, Bash | sonnet |
| **tdd-guide** | Test-first development | Read, Write, Edit, Bash | sonnet |
| **code-reviewer** | Quality review | Read, Grep, Glob | sonnet |
| **security-reviewer** | Security audit | Read, Grep, Glob | opus |
| **build-fixer** | Build errors | Read, Write, Edit, Bash | sonnet |
| **e2e-runner** | Playwright tests | Read, Write, Bash | sonnet |

---

## Environment Variables

### Required

```env
ANTHROPIC_API_KEY=sk-ant-...      # Claude API key
```

### Optional

```env
VITE_LOG_LEVEL=debug              # Logging verbosity
SUPABASE_URL=https://...          # If using Supabase template
SUPABASE_ANON_KEY=...             # Supabase public key
GITHUB_TOKEN=...                  # For git operations
```

---

## Performance Guidelines

### Context Window Management

```
⚠️ CRITIQUE: Le context window de 200k peut réduire à 70k avec trop d'outils

RECOMMANDATIONS:
- Garder < 80 tools actifs
- Désactiver MCPs non utilisés
- Utiliser agents pour tâches longues (libère le contexte)
- Résumer les fichiers longs plutôt que les inclure entièrement
```

### Build Performance

```typescript
// Utiliser le debouncing pour les builds
#buildDebounceMs = 500;  // Attendre que tous les fichiers soient écrits

// Utiliser le cache LRU pour les packages npm
const cache = new LRUCache({ max: 150, ttl: 3600000 });
```

---

## Troubleshooting

### Erreurs communes

| Erreur | Cause | Solution |
|--------|-------|----------|
| `esbuild already initialized` | Double init | Vérifier flag global |
| `SharedArrayBuffer not available` | Headers CORS | Ajouter COOP/COEP headers |
| `Module not found` | Mauvais path | Vérifier aliases dans vite.config |
| `Hydration mismatch` | SSR/Client diff | Utiliser `ClientOnly` wrapper |

### Debug Tools

```typescript
// Activer les logs détaillés
import { createScopedLogger } from '~/utils/logger';
const logger = createScopedLogger('Debug');
logger.setLevel('debug');

// Inspecter le state
import { runtimeTypeStore, previewsStore } from '~/lib/stores';
console.log('Runtime:', runtimeTypeStore.get());
console.log('Previews:', previewsStore.get());
```

---

## Documentation References

| Document | Path | Description |
|----------|------|-------------|
| Runtime Plan | `docs/BAVINI-RUNTIME-PLAN.md` | Plan BAVINI Runtime |
| API Reference | `docs/API.md` | API documentation |
| Components | `docs/COMPONENTS.md` | UI components guide |
| Database | `docs/DATABASE.md` | PGlite schema |
| ADRs | `docs/adr/` | Architecture decisions |
| Design Plugin | `docs/adr/005-design-guidelines-plugin.md` | Frontend Design Plugin ADR |

---

## Quick Reference Card

```
┌─────────────────────────────────────────────────────────────┐
│                    BAVINI QUICK REFERENCE                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  START DEV        pnpm dev                                  │
│  RUN TESTS        pnpm test                                 │
│  TYPE CHECK       pnpm typecheck                            │
│  BUILD            pnpm build                                │
│  DEPLOY           pnpm deploy                               │
│                                                             │
│  LOG PATTERN      createScopedLogger('Name')                │
│  STATE PATTERN    atom() / map() from nanostores            │
│  ERROR PATTERN    try/catch + logger.error()                │
│                                                             │
│  FILE LIMIT       400 lines (800 max)                       │
│  TEST COVERAGE    80% minimum                               │
│  COMMIT FORMAT    type(scope): description                  │
│                                                             │
│  RUNTIME CHECK    runtimeTypeStore.get()                    │
│  PREVIEW URL      previewsStore.get()[0]?.baseUrl           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

*Ce fichier est automatiquement chargé par Claude Code pour comprendre le contexte du projet.*
