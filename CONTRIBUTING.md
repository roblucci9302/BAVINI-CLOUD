# Contribuer à BAVINI

Merci de votre intérêt pour BAVINI. Ce guide vous explique comment contribuer au projet.

---

## Table des matières

- [Code de conduite](#code-de-conduite)
- [Comment contribuer](#comment-contribuer)
- [Configuration de l'environnement](#configuration-de-lenvironnement)
- [Standards de code](#standards-de-code)
- [Process de review](#process-de-review)

---

## Code de conduite

En participant à ce projet, vous vous engagez à :

- Maintenir un environnement respectueux et inclusif
- Accepter les critiques constructives avec professionnalisme
- Privilégier l'intérêt du projet et de la communauté
- Communiquer de manière claire et bienveillante

---

## Comment contribuer

### Signaler un bug

1. Vérifiez que le bug n'a pas déjà été signalé dans les [Issues](https://github.com/roblucci9302/BAVINI/issues)
2. Créez une nouvelle issue avec le template **Bug Report**
3. Incluez :
   - Description claire du problème
   - Étapes pour reproduire
   - Comportement attendu vs observé
   - Environnement (OS, navigateur, version Node.js)
   - Captures d'écran si pertinent

### Proposer une fonctionnalité

1. Ouvrez une issue avec le template **Feature Request**
2. Décrivez :
   - Le problème que cette fonctionnalité résout
   - La solution proposée
   - Les alternatives envisagées
3. Attendez la validation avant de commencer le développement

### Soumettre une Pull Request

1. Forkez le repository
2. Créez une branche depuis `main` :
   ```bash
   git checkout -b feature/nom-de-la-feature
   ```
3. Développez votre fonctionnalité en respectant les [standards de code](#standards-de-code)
4. Testez vos modifications :
   ```bash
   pnpm test
   pnpm typecheck
   pnpm lint
   ```
5. Commitez avec un message descriptif (voir [conventions de commit](#conventions-de-commit))
6. Poussez votre branche et ouvrez une Pull Request

---

## Configuration de l'environnement

### Prérequis

- Node.js >= 18.18.0
- pnpm >= 9.4.0

### Installation

```bash
# Cloner votre fork
git clone https://github.com/VOTRE_USERNAME/BAVINI.git
cd BAVINI

# Installer les dépendances
pnpm install

# Configurer l'environnement
cp .env.example .env.local
# Ajouter votre clé API Anthropic dans .env.local

# Lancer le serveur de développement
pnpm dev
```

### Scripts utiles

| Commande | Description |
|----------|-------------|
| `pnpm dev` | Serveur de développement |
| `pnpm build` | Build de production |
| `pnpm test` | Tests unitaires |
| `pnpm test:watch` | Tests en mode watch |
| `pnpm lint` | Vérification ESLint |
| `pnpm typecheck` | Vérification TypeScript |

---

## Standards de code

### Style de code

Le projet utilise ESLint et Prettier pour maintenir un style cohérent :

```bash
# Vérifier le style
pnpm lint

# Vérifier les types
pnpm typecheck
```

### Conventions de nommage

| Élément | Convention | Exemple |
|---------|------------|---------|
| Fichiers composants | PascalCase | `ChatPanel.tsx` |
| Fichiers utilitaires | camelCase | `formatDate.ts` |
| Variables/fonctions | camelCase | `getUserData()` |
| Constantes | UPPER_SNAKE_CASE | `MAX_RETRIES` |
| Types/Interfaces | PascalCase | `UserProfile` |
| CSS classes | kebab-case | `chat-container` |

### Conventions de commit

Format : `type(scope): description`

**Types :**

| Type | Description |
|------|-------------|
| `feat` | Nouvelle fonctionnalité |
| `fix` | Correction de bug |
| `docs` | Documentation |
| `style` | Formatage (sans changement de code) |
| `refactor` | Refactoring |
| `test` | Ajout ou modification de tests |
| `chore` | Maintenance, dépendances |
| `perf` | Amélioration de performance |

**Exemples :**

```
feat(agents): add new Reviewer agent
fix(chat): resolve message duplication issue
docs(readme): update installation instructions
refactor(stores): simplify state management
```

### Structure des fichiers

```
app/
├── components/        # Composants React UI
│   ├── chat/          # Interface de chat
│   ├── editor/        # Éditeur de code
│   ├── workbench/     # Espace de travail IDE
│   └── ui/            # Primitives réutilisables
├── lib/
│   ├── agents/        # Système multi-agents
│   ├── stores/        # État Nanostores
│   ├── hooks/         # React hooks
│   ├── persistence/   # Couche base de données
│   └── services/      # Intégrations externes
├── routes/            # Routes API Remix
└── utils/             # Fonctions utilitaires
```

Pour une documentation complète de l'architecture, consultez [BAVINI.md](./BAVINI.md).

---

## Process de review

### Critères d'acceptation

Une Pull Request sera acceptée si :

- [ ] Les tests passent (`pnpm test`)
- [ ] Le code respecte les standards (`pnpm lint`, `pnpm typecheck`)
- [ ] La fonctionnalité est documentée si nécessaire
- [ ] Le code est lisible et maintenable
- [ ] Les commits suivent les conventions

### Délai de review

- Les PRs sont généralement reviewées sous 48-72h
- Les corrections mineures peuvent être mergées plus rapidement
- Les fonctionnalités majeures nécessitent une discussion préalable

### Feedback

- Les commentaires de review sont constructifs
- Les modifications demandées doivent être adressées avant le merge
- N'hésitez pas à demander des clarifications

---

## Architecture multi-agents

BAVINI utilise un système de 8 agents spécialisés. Si vous contribuez au système d'agents :

1. Consultez la documentation dans [BAVINI.md](./BAVINI.md)
2. Respectez l'interface `AgentCapability` existante
3. Ajoutez des tests pour tout nouvel agent
4. Documentez les capacités et limites de l'agent

---

## Questions

Pour toute question :

- Ouvrez une [Discussion](https://github.com/roblucci9302/BAVINI/discussions) sur GitHub
- Consultez la [documentation](./BAVINI.md)

---

## Licence

En contribuant à BAVINI, vous acceptez que vos contributions soient soumises à la licence propriétaire du projet. Voir [LICENSE.md](./LICENSE.md) pour les détails.

Les contributions dérivées de code sous licence MIT (Bolt.new) restent sous MIT. Voir [THIRD_PARTY_LICENSES.md](./THIRD_PARTY_LICENSES.md).
