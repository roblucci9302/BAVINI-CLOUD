# {{PROJECT_NAME}}

Application React avec Shadcn UI, TypeScript et Vite.

## Stack technique

- **React 18** - Bibliothèque UI
- **TypeScript** - Typage statique
- **Vite** - Build tool rapide
- **Tailwind CSS** - Styling utilitaire
- **Shadcn UI** - Composants UI accessibles

## Commandes

```bash
# Développement
npm run dev

# Build production
npm run build

# Preview du build
npm run preview

# Vérification des types
npm run typecheck
```

## Composants Shadcn UI disponibles

Les composants suivants sont pré-installés :

- `Button` - Boutons avec variantes
- `Card` - Cartes conteneur
- `Input` - Champs de saisie
- `Label` - Labels accessibles

### Ajouter d'autres composants

Visitez [ui.shadcn.com](https://ui.shadcn.com/docs/components) pour la liste complète.

```bash
# Exemple: ajouter le composant Dialog
npx shadcn@latest add dialog
```

## Structure

```
src/
├── components/
│   └── ui/          # Composants Shadcn UI
│       ├── button.tsx
│       ├── card.tsx
│       ├── input.tsx
│       └── label.tsx
├── lib/
│   └── utils.ts     # Utilitaire cn()
├── App.tsx          # Composant principal
├── main.tsx         # Point d'entrée
└── index.css        # Styles globaux + CSS variables
```
