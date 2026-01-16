# Express + TypeScript API Template

API REST Express avec TypeScript et Vitest.

## Scripts

```bash
npm run dev      # Serveur de développement (hot reload)
npm run build    # Build TypeScript
npm run start    # Serveur de production
npm run test     # Tests avec Vitest
```

## Structure

```
src/
├── index.ts              # Point d'entrée, configuration Express
├── routes/
│   ├── health.ts         # Route /health
│   └── health.spec.ts    # Tests
└── middleware/
    └── errorHandler.ts   # Gestion des erreurs
```

## Endpoints

| Méthode | Route    | Description      |
|---------|----------|------------------|
| GET     | /health  | Status de l'API  |

## Fonctionnalités

- Express 4 avec TypeScript
- Helmet pour la sécurité
- CORS configuré
- Gestion d'erreurs centralisée
- Tests avec Vitest + Supertest
- Hot reload avec tsx
