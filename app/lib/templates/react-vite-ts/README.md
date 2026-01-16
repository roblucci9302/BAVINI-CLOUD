# {{PROJECT_NAME}}

{{PROJECT_DESCRIPTION}}

## Prérequis

- Node.js 18+
- npm ou pnpm

## Installation

```bash
npm install
```

## Développement

```bash
npm run dev
```

L'application sera accessible sur http://localhost:3000

## Tests

```bash
# Lancer les tests
npm test

# Tests avec interface graphique
npm run test:ui

# Tests avec couverture
npm run test:coverage
```

## Vérification des types

```bash
npm run typecheck
```

## Build de production

```bash
npm run build
```

## Structure du projet

```
src/
├── components/     # Composants React réutilisables
├── test/          # Configuration des tests
├── App.tsx        # Composant principal
├── App.spec.tsx   # Tests du composant principal
├── main.tsx       # Point d'entrée
└── index.css      # Styles globaux
```

## Technologies

- React 18
- TypeScript 5
- Vite 5
- Vitest
- Testing Library

---

Créé avec BAVINI 🇫🇷
