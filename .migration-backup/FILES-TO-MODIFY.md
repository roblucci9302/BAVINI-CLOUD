# Fichiers à Modifier pour la Migration

## Fichiers Core (Priorité Haute)

### Configuration
- [ ] `vite.config.ts` - Remplacer plugin Remix par React Router
- [ ] `package.json` - Mettre à jour dépendances

### Entry Points
- [ ] `app/entry.server.tsx` - Adapter pour React Router 7
- [ ] `app/entry.client.tsx` - Adapter pour React Router 7
- [ ] `app/root.tsx` - Supprimer remix-island, adapter imports

## Routes (19 fichiers)

### Routes Pages
- [ ] `app/routes/_index.tsx` - Page d'accueil
- [ ] `app/routes/chat.$id.tsx` - Page chat

### Routes API
- [ ] `app/routes/api.chat.ts` - API Chat principal
- [ ] `app/routes/api.agent.ts` - API Agent
- [ ] `app/routes/api.enhancer.ts` - API Enhancer
- [ ] `app/routes/api.screenshot.ts` - API Screenshot
- [ ] `app/routes/api.templates.$id.ts` - API Templates

### Routes Auth
- [ ] `app/routes/api.auth.$provider.ts` - OAuth provider
- [ ] `app/routes/api.auth.$provider.spec.ts` - Tests
- [ ] `app/routes/api.auth.callback.ts` - OAuth callback
- [ ] `app/routes/api.auth.callback.spec.ts` - Tests
- [ ] `app/routes/api.auth.refresh.ts` - Token refresh
- [ ] `app/routes/api.auth.refresh.spec.ts` - Tests
- [ ] `app/routes/api.auth.status.ts` - Auth status

## Composants avec remix-utils (5 fichiers)

- [ ] `app/components/chat/BaseChat.tsx` - ClientOnly
- [ ] `app/components/chat/BaseChat.spec.tsx` - Tests
- [ ] `app/components/header/Header.tsx` - ClientOnly
- [ ] `app/components/header/Header.spec.tsx` - Tests
- [ ] `app/routes/_index.tsx` - ClientOnly

## Autres fichiers

- [ ] `app/lib/persistence/useChatHistory.ts` - useSearchParams
- [ ] `app/lib/.server/agents/BaseAgent.ts` - Types Remix

## Résumé

| Catégorie | Nombre | Priorité |
|-----------|--------|----------|
| Config | 2 | Haute |
| Entry | 3 | Haute |
| Routes API | 7 | Haute |
| Routes Pages | 2 | Haute |
| Routes Auth | 6 | Moyenne |
| Composants | 4 | Moyenne |
| Autres | 2 | Basse |
| **Total** | **26** | |

## Changements d'imports

| Avant (Remix) | Après (React Router 7) |
|---------------|------------------------|
| `@remix-run/react` | `react-router` |
| `@remix-run/cloudflare` | `@react-router/cloudflare` |
| `@remix-run/node` | `@react-router/node` |
| `remix-island` | Supprimer (built-in) |
| `remix-utils` | `remix-utils` (compatible RR7) |

## Changements de fonctions

| Avant | Après |
|-------|-------|
| `json({ data })` | `data({ data })` (import from react-router) |
| `redirect(url)` | `redirect(url)` (même API) |
| `LoaderFunctionArgs` | `Route.LoaderArgs` |
| `ActionFunctionArgs` | `Route.ActionArgs` |
