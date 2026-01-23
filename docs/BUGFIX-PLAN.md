# BAVINI Runtime - Plan de Correction des Bugs

> **Version**: 1.1
> **Date**: 2026-01-23
> **Backup**: `BAVINI-CLOUT-BACKUP-20260123-154222`
> **Statut**: En cours d'implémentation

---

## Changelog

| Date | Bug | Statut |
|------|-----|--------|
| 2026-01-23 | Bug #1: Astro `$$` replacement | CORRIGÉ |
| 2026-01-23 | Bug #2: Input freeze during build | CORRIGÉ |
| 2026-01-23 | Bug #3: Service Worker iframe issues | CORRIGÉ |
| 2026-01-23 | Bug #4: Astro async `[ASYNC]` display | CORRIGÉ |
| 2026-01-23 | Limitation #1: PostCSS Support | IMPLÉMENTÉ |
| 2026-01-23 | Limitation #2: Next.js SSR Docs | IMPLÉMENTÉ |
| 2026-01-23 | Limitation #3: Tailwind JIT Optimisation | IMPLÉMENTÉ |
| 2026-01-23 | Limitation #4: Universal Fonts Loader | IMPLÉMENTÉ |
| 2026-01-23 | Phase 3: Refactoring browser-build-adapter | EN COURS |

---

## Résumé de l'Audit

L'audit complet du système WebContainer/Browser Runtime a révélé:

| Catégorie | Nombre | Priorité |
|-----------|--------|----------|
| Bugs critiques | 3 | HAUTE |
| Limitations techniques | 4 | MOYENNE |
| Dette technique | 1 | MOYENNE |

---

## Phase 1: Bugs Critiques (Priorité HAUTE)

### Bug #1: Astro Global Variable Replacement - CORRIGÉ

**Fichier**: `app/lib/runtime/adapters/compilers/astro-compiler.ts`
**Lignes corrigées**: 548, 578, 599
**Sévérité**: Critique
**Statut**: CORRIGÉ (2026-01-23)

**Problème identifié**:
En JavaScript, `$$` dans une chaîne de remplacement de `String.replace()` produit un seul `$`.
Donc `'globalThis.$$result'` produisait `'globalThis.$result'` (perte d'un `$`).

**Corrections appliquées**:
```typescript
// Ligne 548 - $$result
Avant:  'globalThis.$$result.$2'      → produisait: globalThis.$result.$2 (BUG!)
Après:  'globalThis.$$$$result.$2'    → produit:    globalThis.$$result.$2 (OK)

// Ligne 578 - $$renderTemplate
Avant:  'globalThis.$$renderTemplate`' → produisait: globalThis.$renderTemplate` (BUG!)
Après:  'globalThis.$$$$renderTemplate`'→ produit:   globalThis.$$renderTemplate` (OK)

// Ligne 599 - $$render
Avant:  'globalThis.$$render`'         → produisait: globalThis.$render` (BUG!)
Après:  'globalThis.$$$$render`'       → produit:    globalThis.$$render` (OK)
```

**Fichiers modifiés**:
- `app/lib/runtime/adapters/compilers/astro-compiler.ts` (3 lignes)

**Durée réelle**: 30 minutes

---

### Bug #2: Input Freeze During Build - CORRIGÉ

**Fichiers**:
- `app/lib/runtime/adapters/browser-build-adapter.ts`
- `app/lib/stores/workbench.ts`
**Sévérité**: Haute (UX)
**Statut**: CORRIGÉ (2026-01-23)

**Problème identifié**:
Le build esbuild, bien qu'async, bloquait le thread principal pendant les opérations lourdes.
L'utilisateur ne pouvait pas taper pendant que esbuild compilait.

**Solution implémentée**:
Ajout d'une fonction `yieldToEventLoop()` qui permet au navigateur de traiter les événements d'input
en utilisant `scheduler.postTask` (Chrome 94+) ou `requestIdleCallback` comme fallback.

```typescript
// Nouvelle fonction utilitaire
async function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    if ('scheduler' in globalThis && scheduler?.postTask) {
      scheduler.postTask(() => resolve(), { priority: 'background' });
    } else if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(() => resolve(), { timeout: 50 });
    } else {
      setTimeout(resolve, 0);
    }
  });
}

// Utilisé avant et pendant les opérations de build
async #executeBrowserBuild(): Promise<void> {
  await yieldToEventLoop(); // Avant le build
  // ...
  await yieldToEventLoop(); // Avant esbuild.build()
  const result = await service.syncAndBuild(files, entryPoint);
}
```

**Fichiers modifiés**:
- `app/lib/stores/workbench.ts` - Ajout de yieldToEventLoop et 2 appels dans #executeBrowserBuild
- `app/lib/runtime/adapters/browser-build-adapter.ts` - Ajout de yieldToEventLoop et 1 appel avant esbuild.build

**Durée réelle**: 20 minutes

---

### Bug #3: Service Worker Iframe Issues - CORRIGÉ

**Fichiers modifiés**:
- `app/lib/runtime/adapters/browser-build-adapter.ts`
- `app/lib/runtime/index.ts`
**Sévérité**: Moyenne
**Statut**: CORRIGÉ (2026-01-23)

**Problème identifié**:
Le Service Worker était complètement désactivé (`SERVICE_WORKER_DISABLED = true`) sans possibilité
de le réactiver. Cette approche "tout ou rien" empêchait l'utilisation de localStorage/cookies dans les previews.

**Solution implémentée**:
Remplacement de la constante `SERVICE_WORKER_DISABLED` par un système de configuration flexible:

```typescript
// Nouveau type de configuration
export type PreviewMode = 'auto' | 'service-worker' | 'srcdoc';

// Configuration par défaut: srcdoc (plus fiable)
// Mais SW est maintenant disponible si nécessaire
const previewModeConfig: PreviewModeConfig = {
  mode: 'auto',           // Mode automatique
  swAvailable: false,     // Détecté au runtime
  autoPreferSW: false,    // Par défaut: préférer srcdoc
};

// Nouvelles fonctions exportées
export function setPreviewMode(mode: PreviewMode): void;
export function enableServiceWorkerPreference(): void;  // Pour localStorage/cookies
export function disableServiceWorkerPreference(): void;
export function resetServiceWorkerFailures(): void;
```

**Avantages**:
1. **Mode par défaut fiable**: srcdoc reste le défaut (fonctionne partout)
2. **SW optionnel**: Peut être activé quand localStorage/cookies sont nécessaires
3. **Fallback automatique**: Si SW échoue 3 fois, bascule vers srcdoc automatiquement
4. **Configurable**: L'utilisateur/développeur peut choisir le mode

**Usage**:
```typescript
import { setPreviewMode, enableServiceWorkerPreference } from '~/lib/runtime';

// Forcer le mode Service Worker (pour localStorage)
setPreviewMode('service-worker');

// Ou juste préférer SW en mode auto
enableServiceWorkerPreference();
```

**Durée réelle**: 45 minutes

---

## Phase 2: Limitations Techniques (Priorité MOYENNE)

### Limitation #1: PostCSS Non Supporté - IMPLÉMENTÉ

**Statut**: IMPLÉMENTÉ (2026-01-23)
**Impact**: Tailwind CSS v4, Autoprefixer, autres plugins PostCSS

**Solution implémentée**:
Utilisation de `lightningcss-wasm` pour le traitement CSS côté navigateur (plus rapide que PostCSS traditionnel).

```typescript
// Fichier créé: app/lib/runtime/adapters/css/postcss-processor.ts

export interface PostCSSConfig {
  autoprefixer?: boolean;  // Vendor prefixes
  minify?: boolean;        // Minification
  nesting?: boolean;       // CSS Nesting spec
  customMedia?: boolean;   // Custom media queries
  sourceMap?: boolean;
  targets?: Record<string, number>;  // Browser targets
}

export class PostCSSProcessor {
  async init(): Promise<boolean>;  // Charge le WASM
  async process(css: string, filename?: string): Promise<PostCSSResult>;
}

// Fonctions utilitaires
export function createPostCSSProcessor(config?: PostCSSConfig): PostCSSProcessor;
export async function processCSS(css: string, filename?: string): Promise<string>;
```

**Intégration avec CSSAggregator**:
```typescript
// Dans css-aggregator.ts - nouvelles méthodes ajoutées
aggregator.enablePostCSS({ autoprefixer: true, minify: true });
const processedCSS = await aggregator.aggregateWithPostCSS();
```

**Fichiers créés/modifiés**:
- `app/lib/runtime/adapters/css/postcss-processor.ts` (NOUVEAU)
- `app/lib/runtime/adapters/css-aggregator.ts` (MODIFIÉ)
- `app/lib/runtime/index.ts` (EXPORTS)

**Durée réelle**: 1 heure

---

### Limitation #2: Next.js SSR Non Supporté - IMPLÉMENTÉ

**Statut**: IMPLÉMENTÉ (2026-01-23)
**Impact**: getServerSideProps, API routes, middleware

**Solution implémentée**:
Détection automatique des features serveur non supportées avec warnings clairs.

```typescript
// nextjs-compiler.ts - detectUnsupportedFeatures()
// Détecte automatiquement:
// - getServerSideProps, getStaticProps, getStaticPaths
// - API Routes (/api/*)
// - Server Actions ('use server')
// - Middleware (middleware.ts)
// - Imports serveur (next/server, next/headers, next/cookies)
// - Imports DB directs (prisma, drizzle, pg, mysql)

// Exemple de warning généré:
// "[/pages/index.tsx] getServerSideProps n'est pas supporté dans le Browser Runtime.
//  Utilisez useSWR, React Query ou fetch() dans useEffect à la place."
```

**Features implémentées**:
1. ✅ Détection automatique des patterns serveur
2. ✅ Warnings utilisateur clairs avec alternatives
3. ✅ Suppression automatique des exports serveur (getServerSideProps, etc.)
4. ✅ Documentation JSDoc complète dans le fichier

**Fichiers modifiés**:
- `app/lib/runtime/adapters/compilers/nextjs-compiler.ts`

**Durée réelle**: 30 minutes

---

### Limitation #3: Tailwind JIT 10x Plus Lent - IMPLÉMENTÉ

**Statut**: IMPLÉMENTÉ (2026-01-23)
**Impact**: Builds lents pour gros projets

**Optimisations implémentées**:

1. **Cache LRU amélioré**:
```typescript
// TailwindCache optimisé
- Taille: 50 → 150 entrées
- TTL: 5min → 30min
- Algorithme: Simple hash → FNV-1a
- Ordering: MRU (Most Recently Used)
```

2. **Cache niveau classe**:
```typescript
// Nouveau: cache séparé pour les classes individuelles
private _classCache = new Map<string, string>();  // 500 entrées max
getClass(className: string): string | null;
setClass(className: string, css: string): void;
getClasses(classNames: string[]): { cached, missing };
```

3. **Extraction statique des classes**:
```typescript
// Pré-extraction au setContentFiles()
function extractTailwindClasses(content: string): string[] {
  // Extrait: class="...", className="...", template literals
  // Supporte: classes arbitraires ([...], w-[100px])
}
```

4. **Détection de changements**:
```typescript
hasContentChanged(): boolean;  // Évite recompilation si inchangé
getCacheStats(): { compilationSize, classSize };
clearCaches(): void;  // Pour tests/refresh manuel
```

**Fichiers modifiés**:
- `app/lib/runtime/adapters/compilers/tailwind-compiler.ts`

**Durée réelle**: 45 minutes

---

### Limitation #4: Fonts pour Autres Frameworks - IMPLÉMENTÉ

**Statut**: IMPLÉMENTÉ (2026-01-23)
**Impact**: Vue, Svelte, Astro n'ont pas accès aux fonts modernes

**Solution implémentée**:
Système de fonts universel avec support Google Fonts pour tous les frameworks.

```typescript
// Fichier: app/lib/runtime/adapters/fonts/universal-font-loader.ts

// API principale
const loader = getFontLoader();
const font = loader.loadFont('Inter', {
  weights: [400, 500, 700],
  variable: '--font-sans',
  display: 'swap',
});

// Génération CSS automatique
const css = loader.generateCSS();
// → @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&display=swap');
// → :root { --font-sans: "Inter", ui-sans-serif, system-ui, sans-serif; }

// Injection runtime
loader.inject();  // Injecte dans <head>
```

**Features implémentées**:
1. ✅ Chargement Google Fonts dynamique
2. ✅ Génération automatique de CSS variables
3. ✅ Déduplication des imports
4. ✅ Détection automatique de catégorie (serif/sans/mono)
5. ✅ Classes CSS générées (.font-inter, etc.)
6. ✅ Support preload pour performance
7. ✅ TypeScript avec métadonnées complètes

**Fichiers créés**:
- `app/lib/runtime/adapters/fonts/universal-font-loader.ts`
- `app/lib/runtime/adapters/fonts/index.ts`
- `app/lib/runtime/index.ts` (exports)

**Durée réelle**: 30 minutes

---

## Phase 3: Dette Technique (Priorité MOYENNE)

### Refactoring: browser-build-adapter.ts (4128 lignes) - EN COURS

**Problème**: Fichier trop volumineux, difficile à maintenir et tester.

**Statut**: EN COURS (2026-01-23)

**Structure créée**:
```
app/lib/runtime/adapters/browser-build/
├── index.ts                    # Point d'entrée du module
├── utils/
│   ├── index.ts               # Exports utils
│   ├── build-cache.ts         # LRU Cache avec TTL (✅ CRÉÉ)
│   ├── event-loop.ts          # yieldToEventLoop (✅ CRÉÉ)
│   └── path-utils.ts          # Utilitaires de chemin (✅ CRÉÉ)
├── preview/
│   ├── index.ts               # Exports preview
│   └── preview-config.ts      # Configuration preview (✅ CRÉÉ)
├── plugins/
│   ├── index.ts               # Exports plugins (✅ CRÉÉ)
│   ├── types.ts               # Types PluginContext (✅ CRÉÉ)
│   ├── virtual-fs-plugin.ts   # Plugin filesystem virtuel (✅ CRÉÉ)
│   └── esm-sh-plugin.ts       # Plugin CDN npm (✅ CRÉÉ)
└── bootstrap/                  # (À FAIRE)
    └── framework-entries.ts
```

**Fichiers créés (Phase 3.1)**:
- `browser-build/index.ts` - Point d'entrée principal
- `browser-build/utils/build-cache.ts` - LRUCache avec stats
- `browser-build/utils/event-loop.ts` - yieldToEventLoop + processInChunks
- `browser-build/utils/path-utils.ts` - normalizePath, generateHash, isPathSafe, etc.
- `browser-build/preview/preview-config.ts` - Configuration PreviewMode

**Fichiers créés (Phase 3.2)**:
- `browser-build/plugins/types.ts` - Interface PluginContext
- `browser-build/plugins/virtual-fs-plugin.ts` - Plugin filesystem virtuel (~350 lignes)
- `browser-build/plugins/esm-sh-plugin.ts` - Plugin CDN npm (~160 lignes)
- `browser-build/plugins/index.ts` - Exports plugins

**Intégration**:
- `browser-build-adapter.ts` importe maintenant les modules (avec alias pour éviter conflits)
- Migration progressive: garder le code existant + ajouter imports
- Plugins extraits avec interface PluginContext pour injection de dépendances

**Prochaines étapes**:
1. [x] Extraire createVirtualFsPlugin → plugins/ ✅
2. [x] Extraire createEsmShPlugin → plugins/ ✅
3. [ ] Extraire bootstrap entries → bootstrap/
4. [ ] Remplacer progressivement le code dupliqué

**Estimation restante**: 8-10 heures

---

## Phase 4: Tests E2E

### Tests à ajouter

```typescript
// e2e/runtime/astro-build.spec.ts
test('should compile Astro component with $$result correctly', async () => {
  // ...
});

// e2e/runtime/react-build.spec.ts
test('should not freeze UI during large React build', async () => {
  // ...
});

// e2e/runtime/preview.spec.ts
test('should display preview with correct device frame', async () => {
  // ...
});

// e2e/runtime/tailwind.spec.ts
test('should compile Tailwind classes correctly', async () => {
  // ...
});
```

**Estimation**: 8-10 heures

---

## Planning de Mise en Œuvre

### Semaine 1: Bugs Critiques

| Jour | Tâche | Durée |
|------|-------|-------|
| Jour 1 | Bug #1: Astro globals | 3h |
| Jour 1-2 | Bug #2: Input freeze | 6h |
| Jour 3-4 | Bug #3: Service Worker | 8h |

### Semaine 2: Optimisations

| Jour | Tâche | Durée |
|------|-------|-------|
| Jour 1-2 | PostCSS support | 10h |
| Jour 3 | Tailwind optimizations | 6h |
| Jour 4 | Universal fonts | 6h |

### Semaine 3-4: Refactoring

| Jour | Tâche | Durée |
|------|-------|-------|
| Jour 1-2 | Extraire plugins | 6h |
| Jour 3-4 | Extraire HMR | 6h |
| Jour 5-6 | Extraire preview | 6h |
| Jour 7-8 | Refactorer core | 6h |
| Jour 9-10 | Tests E2E | 10h |

---

## Rollback Plan

Si un problème majeur survient:

1. **Restaurer le backup**:
```bash
rm -rf /Users/robespierreganro/Desktop/BAVINI-CLOUT
cp -r /Users/robespierreganro/Desktop/BAVINI-CLOUT-BACKUP-20260123-154222 /Users/robespierreganro/Desktop/BAVINI-CLOUT
```

2. **Vérifier le fonctionnement**:
```bash
cd /Users/robespierreganro/Desktop/BAVINI-CLOUT
pnpm install
pnpm dev
```

---

## Métriques de Succès

| Métrique | Avant | Après (Cible) |
|----------|-------|---------------|
| Astro $$result bug | Présent | Corrigé |
| Input freeze | 500ms+ | < 50ms |
| Service Worker | Désactivé | Actif |
| PostCSS | Non supporté | Supporté |
| Tailwind compile | ~2s | < 500ms |
| browser-build-adapter.ts | 3989 lignes | < 500 lignes |
| Test coverage runtime | ~40% | > 80% |

---

## Prochaines Étapes Immédiates

1. [ ] Commencer par Bug #1 (Astro globals) - Le plus simple
2. [ ] Puis Bug #2 (Input freeze) - Impact UX majeur
3. [ ] Puis Bug #3 (Service Worker) - Plus complexe

**Commande pour démarrer**:
```bash
# Ouvrir le fichier bugué
code /Users/robespierreganro/Desktop/BAVINI-CLOUT/app/lib/runtime/adapters/compilers/astro-compiler.ts
```

---

*Document généré automatiquement par l'audit BAVINI Runtime*
