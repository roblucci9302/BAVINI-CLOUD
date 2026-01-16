# ROADMAP CORRECTIONS BAVINI - Décembre 2025

## Objectif
Corriger les problèmes identifiés lors de l'audit du système de génération de code pour atteindre un score de **95/100**.

---

## RÉSUMÉ DES PROBLÈMES À CORRIGER

| Priorité | Problème | Impact | Effort |
|----------|----------|--------|--------|
| 🔴 P0 | Tool Handler non implémenté | Bloque agents avancés | Moyen |
| 🔴 P0 | Exécution parallèle manquante | Performance | Élevé |
| 🟡 P1 | Tests avec mocks excessifs | Fiabilité | Moyen |
| 🟡 P1 | Détection qualité par regex | Précision | Moyen |
| 🟢 P2 | Templates figés au build | Flexibilité | Faible |

---

## PHASE 1 : CORRECTIONS CRITIQUES (P0)
**Durée estimée : Sprint 1**

### 1.1 Implémenter Tool Handler dans BaseAgent

**Fichier :** `app/lib/agents/core/base-agent.ts`

**Problème actuel :**
```typescript
executeToolHandler() {
  throw new Error('Not implemented');
}
```

**Solution :**
```typescript
protected async executeToolHandler(
  toolName: string,
  params: Record<string, unknown>
): Promise<ToolResult> {
  const handler = this.toolHandlers.get(toolName);

  if (!handler) {
    return {
      success: false,
      error: `Tool '${toolName}' not registered`
    };
  }

  try {
    const result = await handler.execute(params);
    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
```

**Tâches :**
- [ ] 1.1.1 Définir l'interface `ToolHandler`
- [ ] 1.1.2 Créer un registre de tools (`Map<string, ToolHandler>`)
- [ ] 1.1.3 Implémenter `registerTool()` et `unregisterTool()`
- [ ] 1.1.4 Implémenter `executeToolHandler()` avec gestion d'erreurs
- [ ] 1.1.5 Ajouter les tools par défaut (file, shell, git, python, github)
- [ ] 1.1.6 Écrire les tests unitaires
- [ ] 1.1.7 Écrire les tests d'intégration

**Fichiers à créer/modifier :**
```
app/lib/agents/core/
├── base-agent.ts          (modifier)
├── tool-handler.ts        (créer)
├── tool-registry.ts       (créer)
└── tools/
    ├── file-tool.ts       (créer)
    ├── shell-tool.ts      (créer)
    ├── git-tool.ts        (créer)
    ├── python-tool.ts     (créer)
    └── github-tool.ts     (créer)
```

---

### 1.2 Implémenter l'Exécution Parallèle

**Fichier :** `app/lib/agents/agents/orchestrator.ts`

**Problème actuel :**
```typescript
// TODO: Phase 2 - Ajouter l'exécution parallèle avec gestion des dépendances
for (const subtask of subtasks) {
  await this.executeSubtask(subtask); // Séquentiel
}
```

**Solution :**
```typescript
async executeSubtasksParallel(subtasks: Subtask[]): Promise<SubtaskResult[]> {
  // 1. Construire le graphe de dépendances
  const dependencyGraph = this.buildDependencyGraph(subtasks);

  // 2. Identifier les tâches sans dépendances (niveau 0)
  const levels = this.topologicalSort(dependencyGraph);

  // 3. Exécuter par niveau (parallèle dans chaque niveau)
  const results: SubtaskResult[] = [];

  for (const level of levels) {
    const levelResults = await Promise.all(
      level.map(subtask => this.executeSubtask(subtask))
    );
    results.push(...levelResults);

    // Vérifier si une tâche a échoué
    const failed = levelResults.find(r => !r.success);
    if (failed) {
      throw new SubtaskExecutionError(failed);
    }
  }

  return results;
}

private buildDependencyGraph(subtasks: Subtask[]): DependencyGraph {
  const graph = new Map<string, Set<string>>();

  for (const task of subtasks) {
    graph.set(task.id, new Set(task.dependencies || []));
  }

  return graph;
}

private topologicalSort(graph: DependencyGraph): Subtask[][] {
  // Algorithme de Kahn pour tri topologique par niveaux
  const levels: Subtask[][] = [];
  const inDegree = new Map<string, number>();

  // ... implémentation complète

  return levels;
}
```

**Tâches :**
- [ ] 1.2.1 Définir l'interface `DependencyGraph`
- [ ] 1.2.2 Implémenter `buildDependencyGraph()`
- [ ] 1.2.3 Implémenter `topologicalSort()` (algorithme de Kahn)
- [ ] 1.2.4 Implémenter `executeSubtasksParallel()`
- [ ] 1.2.5 Ajouter la détection de cycles
- [ ] 1.2.6 Ajouter le timeout par tâche
- [ ] 1.2.7 Ajouter la gestion des échecs (retry, rollback)
- [ ] 1.2.8 Écrire les tests unitaires
- [ ] 1.2.9 Écrire les tests d'intégration avec timing

**Fichiers à créer/modifier :**
```
app/lib/agents/
├── agents/
│   └── orchestrator.ts           (modifier)
├── execution/
│   ├── parallel-executor.ts      (créer)
│   ├── dependency-graph.ts       (créer)
│   └── topological-sort.ts       (créer)
└── types/
    └── execution.ts              (créer)
```

---

## PHASE 2 : AMÉLIORATIONS SIGNIFICATIVES (P1)
**Durée estimée : Sprint 2**

### 2.1 Remplacer les Mocks par des Tests d'Intégration

**Fichier :** `app/lib/runtime/action-runner.spec.ts`

**Problème actuel :**
- Mocks extensifs pour Git, File sync, Auth, Pyodide
- Tests ne vérifient pas l'intégration réelle

**Solution :**

**Tâches :**
- [ ] 2.1.1 Créer un environnement de test isolé (test container)
- [ ] 2.1.2 Créer des fixtures de fichiers réels
- [ ] 2.1.3 Implémenter tests d'intégration pour `file` actions
- [ ] 2.1.4 Implémenter tests d'intégration pour `shell` actions
- [ ] 2.1.5 Implémenter tests d'intégration pour `git` actions (avec repo local)
- [ ] 2.1.6 Garder les mocks pour services externes (GitHub API, Pyodide)
- [ ] 2.1.7 Ajouter des tests E2E avec Playwright

**Fichiers à créer/modifier :**
```
app/lib/runtime/
├── action-runner.spec.ts              (modifier - garder unit tests)
├── action-runner.integration.spec.ts  (créer)
└── __fixtures__/
    ├── test-project/                  (créer)
    │   ├── package.json
    │   └── src/
    └── git-repo/                      (créer)

tests/e2e/
├── code-generation.spec.ts            (créer)
└── project-creation.spec.ts           (créer)
```

---

### 2.2 Améliorer le Système de Détection de Qualité

**Fichier :** `app/lib/.server/quality/evaluator.ts`

**Problème actuel :**
- Détection basée sur regex simple
- Faux positifs/négatifs possibles
- Pas d'analyse AST

**Solution :**
Utiliser un parser AST (TypeScript Compiler API ou @babel/parser) pour une analyse précise.

**Tâches :**
- [ ] 2.2.1 Installer `@typescript-eslint/parser` ou utiliser `ts.createSourceFile`
- [ ] 2.2.2 Créer `ASTAnalyzer` class
- [ ] 2.2.3 Implémenter détection précise de :
  - [ ] Types `any` (via AST)
  - [ ] Fonctions sans types de retour
  - [ ] Variables non typées
  - [ ] Imports non utilisés
- [ ] 2.2.4 Implémenter détection de patterns :
  - [ ] Try/catch vides
  - [ ] Console.log en production
  - [ ] Fonctions trop longues (>50 lignes)
  - [ ] Complexité cyclomatique
- [ ] 2.2.5 Ajouter scoring pondéré par sévérité
- [ ] 2.2.6 Générer des suggestions de fix précises
- [ ] 2.2.7 Écrire les tests

**Fichiers à créer/modifier :**
```
app/lib/.server/quality/
├── evaluator.ts                 (modifier)
├── ast-analyzer.ts              (créer)
├── rules/
│   ├── typescript-rules.ts      (créer)
│   ├── security-rules.ts        (créer)
│   ├── maintainability-rules.ts (créer)
│   └── performance-rules.ts     (créer)
└── __tests__/
    ├── ast-analyzer.spec.ts     (créer)
    └── rules.spec.ts            (créer)
```

---

## PHASE 3 : AMÉLIORATIONS OPTIONNELLES (P2)
**Durée estimée : Sprint 3 (si temps disponible)**

### 3.1 Templates Dynamiques en Production

**Problème actuel :**
- Templates chargés via `import.meta.glob` au build time
- Impossible d'ajouter des templates sans rebuild

**Solution :**
Système hybride : templates built-in + templates dynamiques via API/stockage.

**Tâches :**
- [ ] 3.1.1 Créer interface `TemplateSource` (built-in vs dynamic)
- [ ] 3.1.2 Implémenter stockage templates (KV Cloudflare ou R2)
- [ ] 3.1.3 Créer API `/api/templates/upload` (admin only)
- [ ] 3.1.4 Implémenter cache des templates dynamiques
- [ ] 3.1.5 Ajouter validation des templates uploadés
- [ ] 3.1.6 UI admin pour gérer les templates

**Fichiers à créer/modifier :**
```
app/lib/templates/
├── index.ts                    (modifier)
├── template-source.ts          (créer)
├── dynamic-loader.ts           (créer)
└── validation.ts               (créer)

app/routes/
├── api.templates.upload.ts     (créer)
└── api.templates.list.ts       (créer)
```

---

## PLAN D'EXÉCUTION

### Sprint 1 (Semaine 1-2) : Corrections Critiques

```
Jour 1-2:   1.1.1 - 1.1.3 (Tool Handler interfaces)
Jour 3-4:   1.1.4 - 1.1.5 (Tool Handler implementation)
Jour 5:     1.1.6 - 1.1.7 (Tests Tool Handler)
Jour 6-7:   1.2.1 - 1.2.3 (Dependency Graph)
Jour 8-9:   1.2.4 - 1.2.7 (Parallel Executor)
Jour 10:    1.2.8 - 1.2.9 (Tests Parallel)
```

### Sprint 2 (Semaine 3-4) : Améliorations P1

```
Jour 1-3:   2.1.1 - 2.1.4 (Tests d'intégration setup)
Jour 4-5:   2.1.5 - 2.1.7 (Tests d'intégration complets)
Jour 6-7:   2.2.1 - 2.2.3 (AST Analyzer base)
Jour 8-9:   2.2.4 - 2.2.6 (Rules et scoring)
Jour 10:    2.2.7 (Tests qualité)
```

### Sprint 3 (Semaine 5) : Optionnel P2

```
Jour 1-2:   3.1.1 - 3.1.2 (Template sources)
Jour 3-4:   3.1.3 - 3.1.5 (API et validation)
Jour 5:     3.1.6 (UI admin)
```

---

## MÉTRIQUES DE SUCCÈS

### Avant corrections (Actuel)

| Métrique | Valeur |
|----------|--------|
| Score global | 82/100 |
| Agents avancés | 60/100 |
| Qualité detection | 70/100 |
| Couverture tests intégration | 20% |

### Après corrections (Objectif)

| Métrique | Cible |
|----------|-------|
| Score global | **95/100** |
| Agents avancés | **95/100** |
| Qualité detection | **90/100** |
| Couverture tests intégration | **80%** |

---

## DÉPENDANCES À INSTALLER

```bash
# Phase 2.2 - AST Analysis
npm install @typescript-eslint/parser @typescript-eslint/typescript-estree

# Phase 2.1 - Tests E2E (si pas déjà installé)
npm install -D @playwright/test
```

---

## RISQUES ET MITIGATION

| Risque | Probabilité | Impact | Mitigation |
|--------|-------------|--------|------------|
| Régression sur système existant | Moyenne | Élevé | Tests complets avant merge |
| Performance dégradée (AST parsing) | Faible | Moyen | Cache des analyses AST |
| Complexité du parallel executor | Moyenne | Moyen | Implémentation incrémentale |
| Incompatibilité Cloudflare Workers | Faible | Élevé | Tests sur environnement CF |

---

## CHECKLIST FINALE

### Phase 1 Complète
- [ ] Tool Handler fonctionnel
- [ ] Tous les tools enregistrés (file, shell, git, python, github)
- [ ] Exécution parallèle avec dépendances
- [ ] Tests unitaires passent
- [ ] Tests d'intégration passent
- [ ] Pas de régression sur fonctionnalités existantes

### Phase 2 Complète
- [ ] Tests d'intégration réels (pas de mocks excessifs)
- [ ] AST Analyzer fonctionnel
- [ ] Rules de qualité précises
- [ ] Score de qualité fiable
- [ ] Documentation mise à jour

### Phase 3 Complète (Optionnel)
- [ ] Templates dynamiques fonctionnels
- [ ] API admin sécurisée
- [ ] UI de gestion templates

---

## VALIDATION FINALE

Après toutes les corrections, lancer :

```bash
# Tests unitaires
npm run test

# Tests d'intégration
npm run test:integration

# Tests E2E
npm run test:e2e

# Type check
npm run typecheck

# Build production
npm run build
```

**Critère de succès :** Tous les tests passent + Score audit ≥ 95/100

---

*Document créé le 28 décembre 2025*
*Dernière mise à jour : 28 décembre 2025*
