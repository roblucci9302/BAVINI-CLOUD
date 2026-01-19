# /fix-build Command

> Résoudre les erreurs de build et compilation

## Usage

```
/fix-build
```

## Ce que fait cette commande

1. **Lance** le build pour capturer les erreurs
2. **Analyse** chaque erreur (type, fichier, ligne)
3. **Catégorise** les erreurs:
   - TypeScript errors (TS2322, TS2345, etc.)
   - Import errors
   - Syntax errors
   - Config errors
4. **Corrige** les erreurs une par une
5. **Vérifie** que le build passe
6. **Lance** les tests pour s'assurer que rien n'est cassé

## Agent utilisé

**build-fixer** (Model: sonnet)

## Erreurs communes traitées

| Code | Description | Solution type |
|------|-------------|---------------|
| TS2322 | Type not assignable | Fix types |
| TS2345 | Argument type mismatch | Add assertion or fix type |
| TS2307 | Cannot find module | Check paths/aliases |
| TS7006 | Implicit any | Add type annotation |

## Commandes lancées

```bash
pnpm build 2>&1
pnpm typecheck
pnpm test
```

## Quand utiliser

- Après un merge qui casse le build
- Après mise à jour de dépendances
- Erreurs TypeScript multiples
- CI qui échoue
