# /review Command

> Effectuer une revue de code complète

## Usage

```
/review [fichier ou dossier optionnel]
```

## Exemples

```
/review                                    # Review des fichiers modifiés
/review app/lib/runtime/                   # Review d'un dossier
/review app/lib/stores/workbench.ts        # Review d'un fichier spécifique
```

## Ce que fait cette commande

1. **Identifie** les fichiers à reviewer
2. **Analyse** le code selon les critères:
   - Correctness
   - Code style (TypeScript strict, immutabilité, etc.)
   - Architecture (patterns, responsabilités)
   - Performance
   - Security
   - Testing
   - Documentation
3. **Produit** un rapport détaillé avec:
   - Approvals (ce qui est bien)
   - Required changes (bloquants)
   - Suggestions (améliorations optionnelles)
   - Questions (clarifications)

## Agent utilisé

**code-reviewer** (Model: sonnet)

## Severity Levels

| Icon | Level | Action |
|------|-------|--------|
| 🔴 | Blocking | Doit être corrigé |
| 🟡 | Important | Devrait être corrigé |
| 💡 | Suggestion | Nice to have |
| ❓ | Question | Clarification needed |

## Quand utiliser

- Avant de créer une PR
- Après un refactoring
- Pour auditer du code existant
- Quand vous voulez un second avis
