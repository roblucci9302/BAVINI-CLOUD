# /tdd Command

> Développer une feature en mode Test-Driven Development

## Usage

```
/tdd <description de la feature à implémenter>
```

## Exemples

```
/tdd Ajouter une fonction de validation d'email
/tdd Créer un composant Button avec variants
/tdd Implémenter le cache LRU pour les packages npm
/tdd Ajouter la commande 'ls' au shell
```

## Ce que fait cette commande

1. **Comprend** la feature à implémenter
2. **Écrit le test FIRST** (phase RED)
3. **Vérifie** que le test échoue
4. **Implémente** le code minimal (phase GREEN)
5. **Vérifie** que le test passe
6. **Refactore** si nécessaire
7. **Vérifie** le coverage (>= 80%)

## Agent utilisé

**tdd-guide** (Model: sonnet)

## Workflow

```
┌─────────┐
│   RED   │  Écrire test qui échoue
└────┬────┘
     │
     ▼
┌─────────┐
│  GREEN  │  Code minimal pour passer
└────┬────┘
     │
     ▼
┌─────────┐
│REFACTOR │  Améliorer sans casser
└────┬────┘
     │
     └──────► Répéter
```

## Quand utiliser

- Nouvelles fonctions/utilities
- Nouveaux composants
- Nouvelles API
- Bug fixes (écrire test qui reproduit d'abord)
- Quand la logique est complexe
