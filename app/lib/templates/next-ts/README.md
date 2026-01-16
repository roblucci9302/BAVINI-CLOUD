# Next.js 14 + TypeScript Template

Application Next.js 14 avec TypeScript et App Router.

## Scripts

```bash
npm run dev      # Serveur de développement
npm run build    # Build de production
npm run start    # Serveur de production
npm run test     # Tests avec Vitest
npm run lint     # ESLint
```

## Structure

```
src/
├── app/
│   ├── layout.tsx    # Layout racine
│   ├── page.tsx      # Page d'accueil
│   ├── page.spec.tsx # Tests
│   └── globals.css   # Styles globaux
└── test/
    └── setup.ts      # Configuration Vitest
```

## Fonctionnalités

- Next.js 14 avec App Router
- React 18 Server Components
- TypeScript strict
- Tests avec Vitest + Testing Library
- ESLint configuration
