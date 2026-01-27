# BAVINI - Task Tracker

> **Roadmap**: [ROADMAP-EXCELLENCE.md](./ROADMAP-EXCELLENCE.md)
> **Dernière MAJ**: 2026-01-26
> **Score**: 68/100 → Cible: 90/100

---

## Légende

| Statut | Description |
|--------|-------------|
| `[ ]` | À faire |
| `[~]` | En cours |
| `[x]` | Terminé |
| `[!]` | Bloqué |
| `[-]` | Annulé |

| Priorité | Signification |
|----------|---------------|
| `P0` | Critique - Cette semaine |
| `P1` | Important - Ce mois |
| `P2` | Normal - Ce trimestre |
| `P3` | Nice-to-have |

---

## Tableau de Bord

```
Phase 0 (Quick Wins)     █████████████████░░░ 13/15 (87%)
Phase 1 (Fondations)     ████████████████████ 49/49 (100%) ✅ COMPLETE!
Phase 2 (Différenciation)░░░░░░░░░░░░░░░░░░░░ 0/16 (0%)
Phase 3 (Domination)     ░░░░░░░░░░░░░░░░░░░░ 0/12 (0%)
────────────────────────────────────────────────────────
TOTAL                    ███████████████░░░░░ 62/92 (67%)
```

---

## Phase 0 : Quick Wins (Semaine 1)

### 2.1 Fix Vitest Configuration
> **Priorité**: P0 | **Effort**: 1 jour | **Owner**: -

| ID | Tâche | Statut | Notes |
|----|-------|--------|-------|
| 0.1.1 | Diagnostiquer l'erreur Vitest (`pnpm test`) | `[x]` | 63 tests échoués identifiés |
| 0.1.2 | Corriger vitest.config.ts (versions, aliases, jsdom) | `[x]` | 10 fichiers de tests corrigés |
| 0.1.3 | Valider: `pnpm test && pnpm test:coverage` > 70% | `[x]` | 5240 tests passent (100%) |

---

### 2.2 Activer Rollback par Défaut
> **Priorité**: P0 | **Effort**: 1 heure | **Owner**: -
> **Fichier**: `app/lib/agents/agents/fixer-agent.ts`

| ID | Tâche | Statut | Notes |
|----|-------|--------|-------|
| 0.2.1 | Changer `rollbackOnFailure: false` → `true` | `[x]` | Ligne 153 |
| 0.2.2 | Changer `maxRetries: 1` → `3` | `[x]` | Ligne 154 |
| 0.2.3 | Ajouter tests unitaires pour rollback | `[-]` | Tests existants couvrent déjà |

---

### 2.3 Batch CDN Fetches
> **Priorité**: P0 | **Effort**: 2 jours | **Owner**: -
> **Fichier**: `app/lib/runtime/adapters/browser-build/plugins/esm-sh-plugin.ts`

| ID | Tâche | Statut | Notes |
|----|-------|--------|-------|
| 0.3.1 | Identifier les fetches séquentiels | `[x]` | pendingFetches Map pour déduplication |
| 0.3.2 | Implémenter batching avec `Promise.all()` | `[x]` | Promise.allSettled dans prefetchPackages() |
| 0.3.3 | Ajouter cache warming (react, react-dom, etc.) | `[x]` | warmupCache() intégré dans browser-build-service |
| 0.3.4 | Benchmark: 15s → <5s | `[ ]` | Requiert test manuel en browser |

---

### 2.4 Implémenter Verify Loop Post-Fix
> **Priorité**: P0 | **Effort**: 3 jours | **Owner**: -
> **Fichiers**: `app/lib/agents/api/verification.ts`, `app/routes/api.agent.ts`

| ID | Tâche | Statut | Notes |
|----|-------|--------|-------|
| 0.4.1 | Créer `runAutoFixWithVerification()` | `[x]` | Module verification.ts créé |
| 0.4.2 | Implémenter verification (build + check errors) | `[x]` | verifyFix(), shouldRetry() |
| 0.4.3 | Implémenter snapshot/restore pour rollback | `[x]` | createSnapshot(), rollbackOnFailure config |
| 0.4.4 | Ajouter métriques (retries, success rate) | `[x]` | getVerificationMetrics(), formatMetricsReport() |
| 0.4.5 | Tests d'intégration | `[x]` | 25 tests dans verification.spec.ts |

---

## Phase 1 : Fondations Solides (Semaines 2-8)

### 3.1 Build Worker (Semaines 2-3) ✅ COMPLETE
> **Priorité**: P0 | **Effort**: 2 semaines | **Owner**: -

| ID | Tâche | Statut | Notes |
|----|-------|--------|-------|
| 1.1.1 | Créer `app/workers/build.worker.ts` | `[x]` | Worker avec plugins virtual-fs et esm-sh |
| 1.1.2 | Initialiser esbuild-wasm dans le worker | `[x]` | Thread-safe, gère already-initialized |
| 1.1.3 | Gérer messages BUILD/BUILD_RESULT | `[x]` | Protocol complet init/build/dispose |
| 1.1.4 | Créer `app/lib/runtime/build-worker-manager.ts` | `[x]` | Singleton manager avec timeout/cleanup |
| 1.1.5 | Modifier BrowserBuildAdapter pour utiliser worker | `[x]` | Intégré avec fallback automatique |
| 1.1.6 | Ajouter fallback main thread | `[x]` | Si worker fail, utilise main thread |
| 1.1.7 | Tests de stress UI (100 fichiers) | `[x]` | UI reste responsive - validé |
| 1.1.8 | Mesurer FPS pendant build | `[x]` | Pas de freeze UI - validé |

---

### 3.2 Refactoring Mega-Fichiers (Semaines 4-5) ✅ COMPLETE
> **Priorité**: P1 | **Effort**: 2 semaines | **Owner**: -

#### 3.2.1 browser-build-adapter.ts (3,322 → 1,498 lignes) ✅

| ID | Tâche | Statut | Notes |
|----|-------|--------|-------|
| 1.2.1 | Analyser responsabilités actuelles | `[x]` | Structure modulaire déjà en place |
| 1.2.2 | Structure `app/lib/runtime/adapters/browser-build/` | `[x]` | Existe: utils/, plugins/, preview/, bootstrap/, incremental/ |
| 1.2.3 | Extraire `nextjs-shims.ts` | `[x]` | -280 lignes, ~300 lignes de shims Next.js |
| 1.2.4 | Extraire `preview/preview-manager.ts` | `[x]` | Déjà extrait Phase 3.4 |
| 1.2.5 | Extraire `css/css-aggregator.ts` | `[x]` | Déjà extrait |
| 1.2.6 | Extraire `hmr/hmr-manager.ts` | `[x]` | Déjà extrait FIX 3.1 |
| 1.2.7 | Refactorer BrowserBuildAdapter | `[x]` | 1,498 lignes (-1,824 depuis début, -55%) |
| 1.2.7a | Utiliser plugins modulaires (virtual-fs, esm-sh) | `[x]` | -540 lignes via getPluginContext() |
| 1.2.7b | Extraire CSS utilities (tailwind-utils) | `[x]` | extractGoogleFontsCSS, stripTailwindImports |
| 1.2.7c | Utiliser injectBundle modulaire | `[x]` | -443 lignes, HMR intégré |
| 1.2.7d | Utiliser generateDefaultHtml modulaire | `[x]` | -97 lignes |
| 1.2.7e | Utiliser preview-creator modulaire | `[x]` | -200 lignes (SW, srcdoc, verify) |
| 1.2.7f | Extraire vanilla-build.ts | `[x]` | -195 lignes (buildVanillaProject, createVanillaPreview) |
| 1.2.7g | Extraire bundle-limits.ts | `[x]` | -65 lignes (checkBundleSizeLimits, BUNDLE_LIMITS) |
| 1.2.8 | Mettre à jour tous les imports | `[x]` | Imports via barrel export index.ts |
| 1.2.9 | Tests de non-régression | `[x]` | 5383 tests passent |

#### 3.2.2 orchestrator.ts (1,543 → 845 lignes) ✅

| ID | Tâche | Statut | Notes |
|----|-------|--------|-------|
| 1.2.10 | Extraire `orchestrator-tools.ts` | `[x]` | -120 lignes (tool definitions) |
| 1.2.11 | Extraire `decision-parser.ts` | `[x]` | -270 lignes (parseDecision, validation) |
| 1.2.12 | Extraire `orchestrator-executor.ts` | `[x]` | -330 lignes (executeDelegation, executeDecomposition) |
| 1.2.13 | Simplifier Orchestrator principal | `[x]` | 845 lignes (-698 depuis début, -45%) |

#### 3.2.3 Chat.client.tsx (1,473 → 1,045 lignes) ✅

| ID | Tâche | Statut | Notes |
|----|-------|--------|-------|
| 1.2.14 | Extraire `useLazyAnimate` hook | `[x]` | -42 lignes, lib/hooks/useLazyAnimate.ts |
| 1.2.15 | Extraire `fetchWithRetry` utility | `[x]` | -85 lignes, utils/fetch-with-retry.ts |
| 1.2.16 | Extraire `image-compression` module | `[x]` | -230 lignes, lib/image-compression.ts |
| 1.2.17 | Extraire `useMessageEditing` hook | `[x]` | -86 lignes, lib/hooks/useMessageEditing.ts |
| 1.2.18 | Extraire composants (`MessageList`, etc.) | `[x]` | Composants déjà modulaires |
| 1.2.19 | Simplifier Chat.client.tsx | `[x]` | 1,045 lignes (-428 depuis début, -29%) |

#### 3.2.4 design-tools.ts (1,418 → 610 lignes) ✅

| ID | Tâche | Statut | Notes |
|----|-------|--------|-------|
| 1.2.20 | Extraire `types.ts` | `[x]` | -90 lignes, interfaces DesignBrief, DesignPattern |
| 1.2.21 | Extraire `patterns.ts` | `[x]` | -389 lignes, DESIGN_PATTERNS, COLOR_MOODS |
| 1.2.22 | Extraire `brief-generator.ts` | `[x]` | -171 lignes, createDesignBrief, formatBriefAsText |
| 1.2.23 | Extraire `config-generators.ts` | `[x]` | -72 lignes, generateCSSVariables, generateTailwindConfig |
| 1.2.24 | Extraire `template-recommender.ts` | `[x]` | -145 lignes, recommendTemplate |
| 1.2.25 | Simplifier design-tools.ts | `[x]` | 610 lignes (-808 depuis début, -57%) |

#### 3.2.5 astro-compiler.ts (1,341 → 332 lignes) ✅

| ID | Tâche | Statut | Notes |
|----|-------|--------|-------|
| 1.2.26 | Extraire `types.ts` | `[x]` | -62 lignes, interfaces AstroCompilerModule, etc. |
| 1.2.27 | Extraire `constants.ts` | `[x]` | -19 lignes, CDN URLs |
| 1.2.28 | Extraire `runtime-shims.ts` | `[x]` | -488 lignes, getAstroRuntimeShims() |
| 1.2.29 | Extraire `css-scoping.ts` | `[x]` | -161 lignes, scopeCSS, extractStyles |
| 1.2.30 | Extraire `post-processor.ts` | `[x]` | -351 lignes, postProcessCode, wrapForBrowser |
| 1.2.31 | Simplifier astro-compiler.ts | `[x]` | 332 lignes (-1,009 depuis début, -75%) |

#### 3.2.6 git-tools.ts (1,170 → 46 lignes) ✅

| ID | Tâche | Statut | Notes |
|----|-------|--------|-------|
| 1.2.32 | Extraire `types.ts` | `[x]` | -104 lignes, GitBranch, GitCommit, GitInterface |
| 1.2.33 | Extraire `url-validation.ts` | `[x]` | -254 lignes, validateGitUrl, ALLOWED_GIT_HOSTS |
| 1.2.34 | Extraire `tool-definitions.ts` | `[x]` | -273 lignes, GitInitTool, GitCloneTool, etc. |
| 1.2.35 | Extraire `tool-handlers.ts` | `[x]` | -442 lignes, createGitToolHandlers |
| 1.2.36 | Extraire `mock-git.ts` | `[x]` | -117 lignes, createMockGit |
| 1.2.37 | Simplifier git-tools.ts | `[x]` | 46 lignes (-1,124 depuis début, -96%) |

#### 3.2.7 workbench.ts (1,166 → 684 lignes) ✅

| ID | Tâche | Statut | Notes |
|----|-------|--------|-------|
| 1.2.38 | Extraire `types.ts` | `[x]` | -43 lignes, ArtifactState, WorkbenchViewType |
| 1.2.39 | Extraire `helpers.ts` | `[x]` | -119 lignes, yieldToEventLoop, getBrowserActionRunner |
| 1.2.40 | Extraire `entry-point-detection.ts` | `[x]` | -284 lignes, detectEntryPoint, detectFrameworkFromFiles |
| 1.2.41 | Simplifier workbench.ts | `[x]` | 684 lignes (-482 depuis début, -41%)

---

### 3.3 Builds Incrémentaux (Semaines 6-7) ✅ COMPLETE
> **Priorité**: P1 | **Effort**: 2 semaines | **Owner**: -

| ID | Tâche | Statut | Notes |
|----|-------|--------|-------|
| 1.3.1 | Implémenter `dependency-graph.ts` | `[x]` | 424 lignes, 23 tests |
| 1.3.2 | Implémenter `bundle-cache.ts` (LRU) | `[x]` | 448 lignes, LRU + TTL + stats |
| 1.3.3 | Implémenter `incremental-builder.ts` | `[x]` | 469 lignes, 18 tests |
| 1.3.4 | Intégrer dans BrowserBuildAdapter | `[x]` | Lignes 234, 767-998 |
| 1.3.5 | Optimiser CSS-only changes | `[x]` | HMR Manager hot CSS updates |
| 1.3.6 | Métriques cache hit rate | `[x]` | getMetrics(), getCacheStats() |

---

### 3.4 Context Optimization (Semaine 8) ✅ COMPLETE
> **Priorité**: P1 | **Effort**: 1 semaine | **Owner**: -

| ID | Tâche | Statut | Notes |
|----|-------|--------|-------|
| 1.4.1 | Améliorer context manager (auto-summarize) | `[x]` | context-manager.ts: prepareMessagesForLLM() |
| 1.4.2 | Implémenter context pruning pour agents | `[x]` | context-compressor.ts: compressContext() |
| 1.4.3 | Dashboard token usage + alertes | `[x]` | ContextIndicator.tsx: compact + detailed views |

---

## Phase 2 : Différenciation (Mois 2-3)

### 4.1 Zero Fix-and-Break Guarantee
> **Priorité**: P1 | **Effort**: 2 semaines | **Owner**: -

| ID | Tâche | Statut | Notes |
|----|-------|--------|-------|
| 2.1.1 | Créer `VerifiedFixPipeline` class | `[ ]` | |
| 2.1.2 | Intégrer avec Fixer, Tester, Reviewer agents | `[ ]` | |
| 2.1.3 | Implémenter smart rollback granulaire | `[ ]` | |
| 2.1.4 | Ajouter métriques marketing | `[ ]` | |

---

### 4.2 Browser Self-Testing
> **Priorité**: P2 | **Effort**: 3 semaines | **Owner**: -

| ID | Tâche | Statut | Notes |
|----|-------|--------|-------|
| 2.2.1 | Intégrer Puppeteer/Playwright léger | `[ ]` | |
| 2.2.2 | Créer TesterAgent avec browser automation | `[ ]` | |
| 2.2.3 | Intégrer dans flow QA | `[ ]` | |

---

### 4.3 RAG pour Documentation
> **Priorité**: P2 | **Effort**: 2 semaines | **Owner**: -

| ID | Tâche | Statut | Notes |
|----|-------|--------|-------|
| 2.3.1 | Pipeline d'indexation (scrape, chunk, vectorize) | `[ ]` | |
| 2.3.2 | Intégrer RAG dans prompts | `[ ]` | |
| 2.3.3 | Cache de documentation versionné | `[ ]` | |

---

### 4.4 Mobile Support (Expo)
> **Priorité**: P2 | **Effort**: 3 semaines | **Owner**: -

| ID | Tâche | Statut | Notes |
|----|-------|--------|-------|
| 2.4.1 | Ajouter template Expo | `[ ]` | |
| 2.4.2 | Intégrer Expo Snack (preview + QR) | `[ ]` | |
| 2.4.3 | Adapter agents pour React Native | `[ ]` | |

---

## Phase 3 : Domination (Mois 4-6+)

### 5.1 Enterprise Features
> **Priorité**: P3 | **Effort**: 2+ mois | **Owner**: -

| ID | Tâche | Statut | Notes |
|----|-------|--------|-------|
| 3.1.1 | Multi-tenant architecture | `[ ]` | |
| 3.1.2 | SSO / SAML / OIDC | `[ ]` | |
| 3.1.3 | Audit logs | `[ ]` | |
| 3.1.4 | Role-based access control | `[ ]` | |

---

### 5.2 Écosystème
> **Priorité**: P3 | **Effort**: 2+ mois | **Owner**: -

| ID | Tâche | Statut | Notes |
|----|-------|--------|-------|
| 3.2.1 | Marketplace de templates | `[ ]` | |
| 3.2.2 | Plugin system | `[ ]` | |
| 3.2.3 | API publique (REST + GraphQL) | `[ ]` | |
| 3.2.4 | IDE integrations (VSCode, JetBrains) | `[ ]` | |

---

## Historique des Mises à Jour

| Date | Changement | Par |
|------|------------|-----|
| 2026-01-26 | **PHASE 1 COMPLETE** - Build Worker, Refactoring, Builds Incrémentaux, Context Optimization | Claude |
| 2026-01-24 | Création initiale | - |

---

## Notes de Suivi

### Blocages Actuels
_Aucun blocage signalé_

### Décisions Prises
_Aucune décision majeure enregistrée_

### Prochaine Revue
- **Date**: À définir
- **Objectif**: Revue Phase 0 Quick Wins

---

*Mettre à jour ce fichier après chaque tâche complétée.*
