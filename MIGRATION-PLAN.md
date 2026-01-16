# Plan de Migration BAVINI

## Vue d'ensemble

Ce document détaille le plan de migration pour mettre à jour BAVINI vers les dernières versions des frameworks et outils.

### État Actuel → Cible

| Package | Actuel | Cible | Type |
|---------|--------|-------|------|
| **Remix** | 2.17.3 | ❌ Abandonné | Migration |
| **React Router** | - | 7.12.0 | Nouveau |
| **Vite** | 5.4.21 | 7.x | Majeur |
| **React** | 18.2.0 | 19.x | Majeur |
| **Vitest** | 2.1.9 | 4.x | Majeur |
| **Node.js** | 22.21.1 | ✅ OK | - |

### Pourquoi cette migration ?

1. **Remix n'évoluera plus** - L'équipe recommande React Router 7
2. **React 19** - Nouvelles fonctionnalités (Server Components, Actions)
3. **Vite 7** - Performance améliorée, Rolldown en preview
4. **Sécurité** - Correctifs de sécurité dans les nouvelles versions
5. **Support** - Les anciennes versions ne sont plus maintenues

---

## Phase 1: Préparation (1-2 jours)

### 1.1 Audit des dépendances

```bash
# Vérifier les dépendances qui dépendent de Remix
pnpm why @remix-run/react
pnpm why @remix-run/cloudflare

# Vérifier la compatibilité React 19
pnpm outdated
```

### 1.2 Créer une branche de migration

```bash
git checkout -b migration/react-router-7
```

### 1.3 Sauvegarder la configuration actuelle

- [ ] Copier `vite.config.ts` → `vite.config.ts.backup`
- [ ] Copier `package.json` → `package.json.backup`
- [ ] Documenter les routes actuelles

### 1.4 Identifier les fichiers à modifier

| Catégorie | Fichiers | Priorité |
|-----------|----------|----------|
| Config | `vite.config.ts`, `package.json` | Haute |
| Routes | `app/routes/*.ts(x)` | Haute |
| Entry | `app/entry.client.tsx`, `app/entry.server.tsx` | Haute |
| Root | `app/root.tsx` | Haute |
| Composants | Tous les `*.tsx` utilisant Remix hooks | Moyenne |
| Tests | `*.spec.ts(x)` | Basse |

---

## Phase 2: Migration Remix → React Router 7 (2-3 jours)

### 2.1 Installer React Router 7

```bash
# Supprimer Remix
pnpm remove @remix-run/cloudflare @remix-run/cloudflare-pages @remix-run/react @remix-run/dev

# Installer React Router 7
pnpm add react-router@^7 @react-router/node @react-router/cloudflare
pnpm add -D @react-router/dev
```

### 2.2 Mettre à jour vite.config.ts

```typescript
// Avant (Remix)
import { vitePlugin as remixVitePlugin } from '@remix-run/dev';

// Après (React Router 7)
import { reactRouter } from '@react-router/dev/vite';

export default defineConfig({
  plugins: [
    reactRouter(),
    // ... autres plugins
  ],
});
```

### 2.3 Créer react-router.config.ts

```typescript
import type { Config } from '@react-router/dev/config';

export default {
  appDirectory: 'app',
  ssr: true,
} satisfies Config;
```

### 2.4 Mettre à jour les imports

| Avant (Remix) | Après (React Router 7) |
|---------------|------------------------|
| `@remix-run/react` | `react-router` |
| `@remix-run/cloudflare` | `@react-router/cloudflare` |
| `@remix-run/node` | `@react-router/node` |

### 2.5 Mettre à jour les routes

```typescript
// Avant
import { json, LoaderFunctionArgs } from '@remix-run/cloudflare';
export const loader = async ({ request }: LoaderFunctionArgs) => {
  return json({ data });
};

// Après
import { data } from 'react-router';
import type { Route } from './+types/route-name';
export const loader = async ({ request }: Route.LoaderArgs) => {
  return data({ data });
};
```

### 2.6 Mettre à jour les hooks

| Remix Hook | React Router 7 |
|------------|----------------|
| `useLoaderData` | `useLoaderData` (même API) |
| `useActionData` | `useActionData` (même API) |
| `useFetcher` | `useFetcher` (même API) |
| `useNavigation` | `useNavigation` (même API) |
| `useSearchParams` | `useSearchParams` (même API) |
| `json()` | `data()` |
| `redirect()` | `redirect()` (même API) |

### 2.7 Fichiers à modifier

```
app/
├── entry.client.tsx      # Mettre à jour les imports
├── entry.server.tsx      # Mettre à jour pour React Router
├── root.tsx              # Mettre à jour Links, Meta, Scripts
├── routes/
│   ├── _index.tsx        # Mettre à jour loader/action
│   ├── api.chat.ts       # Mettre à jour
│   ├── api.*.ts          # Toutes les routes API
│   └── ...
└── components/           # Vérifier les imports Remix
```

---

## Phase 3: Migration React 18 → 19 (1-2 jours)

### 3.1 Mettre à jour React

```bash
pnpm add react@^19 react-dom@^19
pnpm add -D @types/react@^19 @types/react-dom@^19
```

### 3.2 Breaking Changes React 19

| Changement | Action |
|------------|--------|
| `ReactDOM.render` supprimé | Utiliser `createRoot` (déjà fait) |
| `defaultProps` déprécié | Utiliser paramètres par défaut |
| `propTypes` déprécié | Utiliser TypeScript |
| `useFormStatus` nouveau | Opportunité d'amélioration |
| `use()` hook nouveau | Opportunité d'amélioration |

### 3.3 Vérifier les dépendances React

```bash
# Vérifier les packages qui ont des peer deps React 18
pnpm why react@18
```

Packages à vérifier :
- [ ] `@radix-ui/*` - Vérifier compatibilité React 19
- [ ] `framer-motion` - Vérifier compatibilité React 19
- [ ] `react-resizable-panels` - Vérifier compatibilité React 19
- [ ] `@uiw/react-codemirror` - Vérifier compatibilité React 19

---

## Phase 4: Migration Vite 5 → 7 (0.5-1 jour)

### 4.1 Mettre à jour Vite

```bash
pnpm add -D vite@^7
```

### 4.2 Breaking Changes Vite 7

| Changement | Action |
|------------|--------|
| Node.js 20.19+ requis | ✅ Déjà OK (22.21.1) |
| Sass legacy API supprimé | Vérifier `css.preprocessorOptions` |
| `splitVendorChunkPlugin` supprimé | Utiliser `manualChunks` |
| Target par défaut changé | Vérifier `build.target` |

### 4.3 Mettre à jour vite.config.ts

```typescript
export default defineConfig({
  build: {
    target: 'esnext', // ou 'baseline-widely-available'
  },
  css: {
    preprocessorOptions: {
      scss: {
        // Supprimer api: 'legacy' si présent
      },
    },
  },
});
```

---

## Phase 5: Migration Vitest 2 → 4 (0.5 jour)

### 5.1 Mettre à jour Vitest

```bash
pnpm add -D vitest@^4 @vitest/coverage-v8@^4
```

### 5.2 Vérifier la configuration

```typescript
// vitest.config.ts - Vérifier la compatibilité
export default defineConfig({
  test: {
    // ... configuration existante
  },
});
```

---

## Phase 6: Tests et Validation (1-2 jours)

### 6.1 Checklist de tests

- [ ] `pnpm typecheck` passe
- [ ] `pnpm test` - Tous les tests passent
- [ ] `pnpm build` réussit
- [ ] `pnpm start` - L'app démarre
- [ ] Navigation fonctionne
- [ ] API routes fonctionnent
- [ ] Authentification fonctionne
- [ ] Chat fonctionne
- [ ] Workbench fonctionne
- [ ] Déploiement Cloudflare fonctionne

### 6.2 Tests manuels

| Fonctionnalité | Testé | Notes |
|----------------|-------|-------|
| Page d'accueil | ☐ | |
| Création de chat | ☐ | |
| Envoi de message | ☐ | |
| Streaming réponse | ☐ | |
| Génération de code | ☐ | |
| Preview | ☐ | |
| Téléchargement | ☐ | |
| Thème clair/sombre | ☐ | |
| Responsive mobile | ☐ | |

---

## Phase 7: Déploiement (0.5 jour)

### 7.1 Mettre à jour wrangler.toml si nécessaire

```toml
compatibility_date = "2025-01-15"
# Vérifier les flags de compatibilité
```

### 7.2 Déployer en staging

```bash
pnpm run deploy:staging
```

### 7.3 Valider en staging

- [ ] Toutes les fonctionnalités marchent
- [ ] Pas d'erreurs dans les logs
- [ ] Performance OK

### 7.4 Déployer en production

```bash
pnpm run deploy:production
```

---

## Estimation Totale

| Phase | Durée | Risque |
|-------|-------|--------|
| 1. Préparation | 1-2 jours | Faible |
| 2. Remix → React Router | 2-3 jours | **Élevé** |
| 3. React 18 → 19 | 1-2 jours | Moyen |
| 4. Vite 5 → 7 | 0.5-1 jour | Faible |
| 5. Vitest 2 → 4 | 0.5 jour | Faible |
| 6. Tests | 1-2 jours | - |
| 7. Déploiement | 0.5 jour | Moyen |

**Total estimé : 7-11 jours de travail**

---

## Risques et Mitigations

| Risque | Impact | Mitigation |
|--------|--------|------------|
| Dépendance incompatible React 19 | Élevé | Vérifier avant migration, fork si nécessaire |
| Routes cassées | Élevé | Tests exhaustifs, migration incrémentale |
| Régression fonctionnelle | Moyen | Tests automatisés + manuels |
| Performance dégradée | Faible | Benchmark avant/après |
| Déploiement échoue | Moyen | Tester en staging d'abord |

---

## Ordre recommandé

```
1. Créer branche migration/react-router-7
2. Remix → React Router 7 (le plus risqué, faire en premier)
3. Vite 5 → 6 → 7 (incrémental si problèmes)
4. React 18 → 19 (après stabilisation)
5. Vitest 2 → 4 (en dernier, moins critique)
6. Tests complets
7. Merge et déploiement
```

---

## Ressources

- [React Router Upgrade Guide](https://reactrouter.com/upgrading/remix)
- [Vite 7 Migration Guide](https://vite.dev/guide/migration)
- [React 19 Upgrade Guide](https://react.dev/blog/2024/04/25/react-19-upgrade-guide)
- [Vitest Migration Guide](https://vitest.dev/guide/migration)

---

## Notes

- **Ne pas faire tout en une fois** - Migrer par étapes
- **Garder la branche main stable** - Tout faire sur une branche séparée
- **Commit fréquent** - Un commit par changement logique
- **Documenter les problèmes** - Pour référence future

---

*Dernière mise à jour: Janvier 2025*
