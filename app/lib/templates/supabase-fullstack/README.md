# Template Supabase Full-Stack

Template prêt à l'emploi pour créer des applications React avec Supabase comme backend.

## Technologies

- **Frontend**: React 18 + TypeScript + Vite
- **Styling**: Tailwind CSS
- **Backend**: Supabase (Auth, Database, Storage)
- **State Management**: React Query + Context API
- **Routing**: React Router v6
- **Validation**: Zod
- **Tests**: Vitest + Testing Library

## Structure du projet

```
src/
├── components/
│   ├── auth/          # Composants d'authentification
│   │   ├── LoginForm.tsx
│   │   ├── RegisterForm.tsx
│   │   └── ProtectedRoute.tsx
│   └── layout/        # Composants de mise en page
│       └── Header.tsx
├── contexts/
│   └── AuthContext.tsx    # Contexte d'authentification
├── hooks/
│   ├── useSupabase.ts     # Hook Supabase
│   └── useProfile.ts      # Hook profil utilisateur
├── lib/
│   ├── supabase.ts        # Client Supabase
│   ├── database.types.ts  # Types générés
│   └── validation.ts      # Schémas Zod
├── pages/
│   ├── Home.tsx           # Page d'accueil
│   ├── Dashboard.tsx      # Tableau de bord (protégé)
│   └── Profile.tsx        # Page profil (protégé)
├── test/
│   └── setup.ts           # Configuration des tests
├── App.tsx                # Application principale
├── main.tsx               # Point d'entrée
└── index.css              # Styles globaux

supabase/
└── migrations/
    └── 00001_initial.sql  # Migration initiale
```

## Installation

1. **Cloner et installer les dépendances**

```bash
npm install
```

2. **Configurer Supabase**

Créer un projet sur [supabase.com](https://supabase.com) et copier les credentials:

```bash
cp .env.example .env
```

Éditer `.env`:

```env
VITE_SUPABASE_URL=https://votre-projet.supabase.co
VITE_SUPABASE_ANON_KEY=votre-anon-key
```

3. **Exécuter les migrations**

Dans le dashboard Supabase, allez dans SQL Editor et exécutez le contenu de `supabase/migrations/00001_initial.sql`.

4. **Lancer l'application**

```bash
npm run dev
```

## Fonctionnalités incluses

### Authentification

- Inscription avec email/mot de passe
- Connexion avec email/mot de passe
- Réinitialisation du mot de passe
- Déconnexion
- Gestion de session persistante

### Profil utilisateur

- Création automatique du profil à l'inscription
- Mise à jour du profil (nom, bio, website)
- Avatar (support Storage inclus dans la migration)

### Sécurité

- Row Level Security (RLS) activée
- Politiques RLS pré-configurées
- Validation des formulaires avec Zod
- Routes protégées

## Scripts disponibles

```bash
# Développement
npm run dev

# Build production
npm run build

# Preview du build
npm run preview

# Tests
npm run test

# Tests en mode watch
npm run test:watch

# Linting
npm run lint
```

## Personnalisation

### Ajouter une nouvelle table

1. Créer une migration dans `supabase/migrations/`
2. Ajouter les types dans `src/lib/database.types.ts`
3. Créer un hook dans `src/hooks/`

### Modifier les couleurs

Éditer `tailwind.config.js`:

```js
theme: {
  extend: {
    colors: {
      primary: {
        // Vos couleurs personnalisées
      }
    }
  }
}
```

### Ajouter l'authentification OAuth

1. Configurer le provider dans Supabase Dashboard
2. Utiliser `supabase.auth.signInWithOAuth()` dans AuthContext

## Structure de la base de données

### Table: profiles

| Colonne     | Type        | Description                    |
|-------------|-------------|--------------------------------|
| id          | UUID        | Référence vers auth.users      |
| email       | TEXT        | Email de l'utilisateur         |
| full_name   | TEXT        | Nom complet                    |
| avatar_url  | TEXT        | URL de l'avatar                |
| bio         | TEXT        | Biographie                     |
| website     | TEXT        | Site web                       |
| created_at  | TIMESTAMPTZ | Date de création               |
| updated_at  | TIMESTAMPTZ | Date de mise à jour            |

### Politiques RLS

- `Users can view own profile` - SELECT propre profil
- `Users can update own profile` - UPDATE propre profil
- `Users can insert own profile` - INSERT propre profil

## Bonnes pratiques

1. **Toujours utiliser `supabaseQuery()`** pour les requêtes - gère automatiquement les erreurs
2. **Ne jamais exposer la service_role key** - utiliser uniquement l'anon key côté client
3. **Valider les entrées utilisateur** avec Zod avant envoi
4. **Utiliser React Query** pour le cache et la synchronisation des données

## Dépannage

### Erreur "Invalid API key"

Vérifier que les variables d'environnement sont correctement configurées.

### Erreur "Row Level Security"

Vérifier que les politiques RLS sont en place et que l'utilisateur est authentifié.

### Profil non créé à l'inscription

Vérifier que le trigger `on_auth_user_created` est actif dans Supabase.

## Licence

MIT
