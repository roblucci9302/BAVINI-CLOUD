# Git Workflow Rules

> Standards Git pour BAVINI

## Branch Naming

```
feature/   → Nouvelles fonctionnalités
fix/       → Bug fixes
refactor/  → Refactoring (pas de changement fonctionnel)
docs/      → Documentation uniquement
test/      → Ajout/modification de tests
perf/      → Optimisations performance
chore/     → Maintenance (deps, config)
```

### Exemples

```bash
feature/bavini-runtime-phase1
fix/preview-astro-compilation
refactor/stores-migration-nanostores
docs/api-documentation
test/runtime-integration-tests
perf/build-cache-optimization
```

## Commit Messages

### Format

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

### Types

| Type | Description |
|------|-------------|
| `feat` | Nouvelle fonctionnalité |
| `fix` | Correction de bug |
| `refactor` | Refactoring sans changement fonctionnel |
| `docs` | Documentation |
| `test` | Tests |
| `perf` | Performance |
| `chore` | Maintenance |
| `style` | Formatting (pas de changement de code) |
| `ci` | CI/CD |

### Scopes (BAVINI)

```
runtime, preview, chat, editor, terminal,
stores, agents, compilers, workers, persistence,
api, ui, config, deps
```

### Exemples

```bash
feat(runtime): Add QuickJS WASM integration

fix(preview): Resolve iframe reload on device change

refactor(stores): Migrate from useState to nanostores

docs(api): Add JSDoc for public compiler APIs

test(runtime): Add integration tests for file system

perf(build): Implement LRU cache for npm packages

chore(deps): Update esbuild-wasm to 0.20.0
```

## Pré-Commit Checklist

Avant chaque commit:

```bash
# 1. Vérifier les types
pnpm typecheck

# 2. Linter
pnpm lint

# 3. Tests
pnpm test

# 4. Pas de secrets
grep -r "sk-ant-" . --include="*.ts" --include="*.tsx"
# Doit retourner vide
```

## Pull Request Process

### Création

```bash
# 1. Créer la branche
git checkout -b feature/my-feature

# 2. Commits atomiques
git add -p  # Review chaque changement
git commit -m "feat(scope): description"

# 3. Push
git push -u origin feature/my-feature

# 4. Créer PR via GitHub
```

### PR Description Template

```markdown
## Description
[Qu'est-ce que ce PR fait?]

## Type of Change
- [ ] Feature
- [ ] Bug fix
- [ ] Refactor
- [ ] Documentation
- [ ] Test

## How Has This Been Tested?
- [ ] Unit tests
- [ ] Integration tests
- [ ] Manual testing

## Checklist
- [ ] Code follows project style
- [ ] Self-review completed
- [ ] Comments added for complex code
- [ ] Documentation updated
- [ ] No new warnings
- [ ] Tests pass locally
- [ ] Coverage >= 80%
```

### Merge Requirements

- [ ] Approved by reviewer
- [ ] All CI checks pass
- [ ] No merge conflicts
- [ ] Branch up to date with main

## Git Best Practices

### Commits Atomiques

```bash
# ❌ Un commit géant
git add .
git commit -m "Add feature X"

# ✅ Commits atomiques
git add src/feature.ts
git commit -m "feat(feature): Add core logic"

git add src/feature.spec.ts
git commit -m "test(feature): Add unit tests"

git add docs/feature.md
git commit -m "docs(feature): Add API documentation"
```

### Rebase vs Merge

```bash
# Préférer rebase pour branches de feature
git checkout feature/my-feature
git rebase main

# Résoudre conflits si nécessaire
git rebase --continue

# Force push si déjà pushé
git push --force-with-lease
```

### Git Hooks (recommandés)

```bash
# .husky/pre-commit
#!/bin/sh
pnpm lint-staged

# .husky/commit-msg
#!/bin/sh
npx commitlint --edit $1
```

## Ne Jamais Faire

```bash
# ❌ INTERDIT
git push --force origin main          # Force push sur main
git commit --amend && git push -f    # Après que d'autres ont pull
git reset --hard origin/main         # Perd les commits locaux
```
