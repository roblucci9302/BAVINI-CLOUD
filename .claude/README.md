# BAVINI Claude Code Configuration

> Configuration complète pour Claude Code adaptée au projet BAVINI

## Structure

```
.claude/
├── README.md              # Ce fichier
├── hooks.json             # Hooks d'automatisation
│
├── agents/                # Agents spécialisés
│   ├── planner.md         # Planification de features
│   ├── architect.md       # Décisions architecture
│   ├── tdd-guide.md       # Test-Driven Development
│   ├── code-reviewer.md   # Revue de code
│   ├── security-reviewer.md # Audit sécurité
│   └── build-fixer.md     # Résolution erreurs build
│
├── rules/                 # Règles toujours actives
│   ├── security.md        # Règles de sécurité
│   ├── testing.md         # Standards de tests
│   ├── coding-style.md    # Style de code
│   ├── git-workflow.md    # Workflow Git
│   └── performance.md     # Guidelines performance
│
└── commands/              # Commandes slash
    ├── plan.md            # /plan
    ├── tdd.md             # /tdd
    ├── review.md          # /review
    ├── security.md        # /security
    └── fix-build.md       # /fix-build
```

## Fichier Principal

Le fichier `CLAUDE.md` à la racine du projet est le point d'entrée principal.
Il contient:
- Overview du projet
- Tech stack
- Règles critiques
- Patterns architecturaux
- Conventions de code
- Commandes disponibles

## Agents

Les agents sont des spécialistes invoqués pour des tâches spécifiques:

| Agent | Invocation | Usage |
|-------|------------|-------|
| planner | `/plan` | Planification features complexes |
| architect | Manuel | Décisions d'architecture |
| tdd-guide | `/tdd` | Développement TDD |
| code-reviewer | `/review` | Revue de code |
| security-reviewer | `/security` | Audit sécurité |
| build-fixer | `/fix-build` | Erreurs de build |

## Rules

Les règles sont toujours actives et guident le comportement:

- **security.md** - Checklist sécurité obligatoire
- **testing.md** - Standards de tests (80% coverage)
- **coding-style.md** - TypeScript strict, immutabilité
- **git-workflow.md** - Conventions commits et branches
- **performance.md** - Optimisations et limites

## Hooks

Les hooks s'exécutent automatiquement:

### PreToolUse
- Rappel tmux pour serveurs de dev
- Confirmation avant git push
- Blocage force push sur main

### PostToolUse
- TypeScript check après édition
- Warning console.log
- Rappel sécurité routes API
- Rappel tests après modification

### Stop
- Vérifications finales de session

## Commandes Slash

```bash
/plan <description>     # Planifier une feature
/tdd <description>      # Développer en TDD
/review [path]          # Code review
/security [path]        # Audit sécurité
/fix-build              # Corriger erreurs build
```

## Personnalisation

Pour adapter cette configuration:

1. **Modifier les rules** selon vos besoins spécifiques
2. **Ajouter des agents** pour des tâches récurrentes
3. **Ajuster les hooks** selon votre workflow
4. **Créer des commands** pour des actions fréquentes

## Inspiré par

Cette configuration est inspirée de [everything-claude-code](https://github.com/affaan-m/everything-claude-code) et adaptée aux spécificités de BAVINI.
