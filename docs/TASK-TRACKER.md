# BAVINI - Task Tracker

> **Roadmap**: [ROADMAP-EXCELLENCE.md](./ROADMAP-EXCELLENCE.md)
> **Dernière MAJ**: 2026-01-24
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
Phase 1 (Fondations)     ░░░░░░░░░░░░░░░░░░░░ 0/35 (0%)
Phase 2 (Différenciation)░░░░░░░░░░░░░░░░░░░░ 0/16 (0%)
Phase 3 (Domination)     ░░░░░░░░░░░░░░░░░░░░ 0/12 (0%)
────────────────────────────────────────────────────────
TOTAL                    ███░░░░░░░░░░░░░░░░░ 13/78 (17%)
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

### 3.1 Build Worker (Semaines 2-3)
> **Priorité**: P0 | **Effort**: 2 semaines | **Owner**: -

| ID | Tâche | Statut | Notes |
|----|-------|--------|-------|
| 1.1.1 | Créer `app/workers/build.worker.ts` | `[ ]` | |
| 1.1.2 | Initialiser esbuild-wasm dans le worker | `[ ]` | |
| 1.1.3 | Gérer messages BUILD/BUILD_RESULT | `[ ]` | |
| 1.1.4 | Extraire logique dans `app/lib/runtime/build/bundler.ts` | `[ ]` | |
| 1.1.5 | Modifier BrowserBuildService pour utiliser worker | `[ ]` | |
| 1.1.6 | Ajouter fallback main thread | `[ ]` | |
| 1.1.7 | Tests de stress UI (100 fichiers) | `[ ]` | |
| 1.1.8 | Mesurer FPS pendant build | `[ ]` | |

---

### 3.2 Refactoring Mega-Fichiers (Semaines 4-5)
> **Priorité**: P1 | **Effort**: 2 semaines | **Owner**: -

#### 3.2.1 browser-build-adapter.ts (3,163 → ~400 lignes)

| ID | Tâche | Statut | Notes |
|----|-------|--------|-------|
| 1.2.1 | Analyser responsabilités actuelles | `[ ]` | |
| 1.2.2 | Créer structure `app/lib/runtime/build/` | `[ ]` | |
| 1.2.3 | Extraire `bundler/esbuild-bundler.ts` | `[ ]` | |
| 1.2.4 | Extraire `preview/preview-manager.ts` | `[ ]` | |
| 1.2.5 | Extraire `css/css-aggregator.ts` | `[ ]` | |
| 1.2.6 | Extraire `hmr/hmr-manager.ts` | `[ ]` | |
| 1.2.7 | Refactorer BrowserBuildAdapter (max 300 lignes) | `[ ]` | |
| 1.2.8 | Mettre à jour tous les imports | `[ ]` | |
| 1.2.9 | Tests de non-régression | `[ ]` | |

#### 3.2.2 orchestrator.ts (1,542 → ~400 lignes)

| ID | Tâche | Statut | Notes |
|----|-------|--------|-------|
| 1.2.10 | Extraire `task-decomposer.ts` | `[ ]` | |
| 1.2.11 | Extraire `routing-engine.ts` | `[ ]` | |
| 1.2.12 | Extraire `agent-coordinator.ts` | `[ ]` | |
| 1.2.13 | Simplifier Orchestrator principal | `[ ]` | |

#### 3.2.3 Chat.client.tsx (1,473 → ~300 lignes)

| ID | Tâche | Statut | Notes |
|----|-------|--------|-------|
| 1.2.14 | Extraire hooks (`useChatState`, etc.) | `[ ]` | |
| 1.2.15 | Extraire composants (`MessageList`, etc.) | `[ ]` | |
| 1.2.16 | Simplifier Chat.client.tsx | `[ ]` | |

#### 3.2.4 Autres fichiers

| ID | Tâche | Statut | Notes |
|----|-------|--------|-------|
| 1.2.17 | Refactorer `design-tools.ts` (1,418 lignes) | `[ ]` | |
| 1.2.18 | Refactorer `astro-compiler.ts` (1,341 lignes) | `[ ]` | |
| 1.2.19 | Refactorer `git-tools.ts` (1,170 lignes) | `[ ]` | |
| 1.2.20 | Refactorer `workbench.ts` (1,166 lignes) | `[ ]` | |

---

### 3.3 Builds Incrémentaux (Semaines 6-7)
> **Priorité**: P1 | **Effort**: 2 semaines | **Owner**: -

| ID | Tâche | Statut | Notes |
|----|-------|--------|-------|
| 1.3.1 | Implémenter `dependency-graph.ts` | `[ ]` | |
| 1.3.2 | Implémenter `bundle-cache.ts` (LRU) | `[ ]` | |
| 1.3.3 | Implémenter `incremental-builder.ts` | `[ ]` | |
| 1.3.4 | Intégrer dans BrowserBuildAdapter | `[ ]` | |
| 1.3.5 | Optimiser CSS-only changes | `[ ]` | |
| 1.3.6 | Métriques cache hit rate | `[ ]` | |

---

### 3.4 Context Optimization (Semaine 8)
> **Priorité**: P1 | **Effort**: 1 semaine | **Owner**: -

| ID | Tâche | Statut | Notes |
|----|-------|--------|-------|
| 1.4.1 | Améliorer context manager (auto-summarize) | `[ ]` | |
| 1.4.2 | Implémenter context pruning pour agents | `[ ]` | |
| 1.4.3 | Dashboard token usage + alertes | `[ ]` | |

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
