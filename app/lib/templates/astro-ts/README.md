# Astro + TypeScript Template

Site Astro avec TypeScript et Islands Architecture.

## Scripts

```bash
npm run dev      # Serveur de développement
npm run build    # Build statique
npm run preview  # Preview du build
npm run test     # Tests avec Vitest
```

## Structure

```
src/
├── components/
│   ├── Counter.tsx       # Composant React interactif
│   └── Counter.spec.tsx  # Tests
├── layouts/
│   └── Layout.astro      # Layout principal
├── pages/
│   └── index.astro       # Page d'accueil
└── test/
    └── setup.ts          # Configuration Vitest
```

## Fonctionnalités

- Astro 4 avec Islands Architecture
- TypeScript strict
- Composants React interactifs (client:load)
- Tests avec Vitest + Testing Library
- Build statique optimisé
