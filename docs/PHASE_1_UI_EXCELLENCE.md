# PHASE 1: UI Excellence
## Plan d'implémentation détaillé

> **STATUT: EN PAUSE (2026-01-20)**
>
> L'intégration Shadcn/ui est **temporairement suspendue** en raison de problèmes de compatibilité avec le mode preview browser. Les composants Radix UI (utilisés par Shadcn) ne fonctionnent pas correctement avec le système de keyboard forwarding de l'iframe.
>
> **Approche actuelle**: Utilisation de composants HTML natifs avec Tailwind CSS.
> **Reprise prévue**: Lorsque le Service Worker preview sera corrigé.
> Issue: https://github.com/bavini/issues/keyboard-shadcn

**Durée**: 2 semaines
**Objectif**: ~~Faire de shadcn/ui le standard UI~~ Utiliser HTML natif + atteindre 100% responsive

---

# Vue d'ensemble

```
PHASE 1 - UI EXCELLENCE
│
├── Étape 1.1: Standards shadcn/ui dans les prompts
│   ├── Modifier prompts.ts
│   ├── Ajouter UI_STANDARDS
│   └── Tests de validation
│
├── Étape 1.2: Patterns UI prédéfinis
│   ├── Créer ui-patterns.ts
│   ├── 6 patterns (Dashboard, Auth, Landing, CRUD, Settings, Profile)
│   └── Tests de chaque pattern
│
├── Étape 1.3: Templates améliorés
│   ├── Template React + shadcn/ui
│   ├── Template Next.js + shadcn/ui
│   ├── Template Full-Stack + Supabase
│   └── Tests d'intégration
│
├── Étape 1.4: Règles responsive
│   ├── RESPONSIVE_RULES dans prompts
│   ├── Validation automatique
│   └── Tests mobile-first
│
└── Étape 1.5: Composants UI de base
    ├── Configuration Tailwind
    ├── 10+ composants shadcn
    └── Documentation
```

---

# Étape 1.1: Standards shadcn/ui dans les prompts

## Objectif
Forcer l'IA à utiliser shadcn/ui pour tous les composants UI générés.

## Fichier à modifier
`app/lib/.server/llm/prompts.ts`

## Code à ajouter

### Après la section `<quality_standards>` (ligne ~49), ajouter:

```typescript
<ui_standards>
  STANDARDS UI OBLIGATOIRES - Ces règles sont NON NÉGOCIABLES :

  1. COMPOSANTS SHADCN/UI (OBLIGATOIRE)
     - TOUJOURS utiliser shadcn/ui pour les composants UI
     - Composants obligatoires via shadcn : Button, Card, Dialog, Form, Input,
       Label, Select, Table, Tabs, Toast, Tooltip, Sheet, Avatar, Badge
     - JAMAIS créer de composants custom si shadcn/ui en propose un équivalent
     - Importer depuis "@/components/ui/[component]"

  2. ICÔNES LUCIDE REACT (OBLIGATOIRE)
     - TOUJOURS utiliser Lucide React pour les icônes
     - Import: import { IconName } from "lucide-react"
     - JAMAIS d'emoji comme icônes dans l'UI (sauf décoratif)
     - JAMAIS d'icônes en SVG inline

  3. TAILWIND CSS (OBLIGATOIRE)
     - TOUJOURS utiliser les classes Tailwind
     - TOUJOURS utiliser les breakpoints standard: sm, md, lg, xl, 2xl
     - JAMAIS de CSS custom ou fichiers .css séparés pour le styling
     - JAMAIS de valeurs arbitraires (ex: w-[347px]) sauf cas extrême

  4. STRUCTURE DES COMPOSANTS (OBLIGATOIRE)
     - Chaque composant dans son propre fichier
     - Props typées avec interface TypeScript
     - Export nommé + export default si c'est le composant principal
     - Fichier max 80 lignes (extraire en sous-composants si plus)

  5. THÈME ET COULEURS (OBLIGATOIRE)
     - Utiliser les variables CSS de shadcn : --primary, --secondary, --muted, etc.
     - Classes Tailwind correspondantes : bg-primary, text-muted-foreground, etc.
     - JAMAIS de couleurs en dur (ex: bg-blue-500) sauf pour des accents
     - Supporter le dark mode avec les classes appropriées

  6. ACCESSIBILITÉ (OBLIGATOIRE)
     - Tous les boutons/liens ont un texte ou aria-label
     - Les formulaires ont des labels associés
     - Contraste suffisant (WCAG AA minimum)
     - Navigation au clavier fonctionnelle
     - Focus visible sur tous les éléments interactifs
</ui_standards>
```

### Exemple de composant conforme à ajouter dans les exemples:

```typescript
// Dans la section <examples>, ajouter cet exemple:

<example>
  <user_query>Crée un formulaire de contact</user_query>

  <assistant_response>
    Je crée un formulaire de contact avec shadcn/ui et validation.

    <boltArtifact id="contact-form" title="Formulaire de Contact shadcn/ui">
      <boltAction type="file" filePath="package.json">
{
  "name": "contact-form",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "test": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-hook-form": "^7.49.0",
    "@hookform/resolvers": "^3.3.0",
    "zod": "^3.22.0",
    "lucide-react": "^0.309.0",
    "class-variance-authority": "^0.7.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.2.0"
  },
  "devDependencies": {
    "@testing-library/react": "^14.1.0",
    "@testing-library/jest-dom": "^6.2.0",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@vitejs/plugin-react": "^4.2.0",
    "autoprefixer": "^10.4.16",
    "jsdom": "^23.2.0",
    "postcss": "^8.4.32",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.3.0",
    "vite": "^5.0.0",
    "vitest": "^1.2.0"
  }
}
      </boltAction>

      <boltAction type="file" filePath="tailwind.config.js">
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
    },
  },
  plugins: [],
}
      </boltAction>

      <boltAction type="file" filePath="src/lib/utils.ts">
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
      </boltAction>

      <boltAction type="file" filePath="src/components/ui/button.tsx">
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
      </boltAction>

      <boltAction type="file" filePath="src/components/ui/input.tsx">
import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
      </boltAction>

      <boltAction type="file" filePath="src/components/ui/label.tsx">
import * as React from "react";
import { cn } from "@/lib/utils";

export interface LabelProps
  extends React.LabelHTMLAttributes<HTMLLabelElement> {}

const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, ...props }, ref) => {
    return (
      <label
        className={cn(
          "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Label.displayName = "Label";

export { Label };
      </boltAction>

      <boltAction type="file" filePath="src/components/ui/card.tsx">
import * as React from "react";
import { cn } from "@/lib/utils";

const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "rounded-lg border bg-card text-card-foreground shadow-sm",
        className
      )}
      {...props}
    />
  )
);
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />
  )
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn("text-2xl font-semibold leading-none tracking-tight", className)} {...props} />
  )
);
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
  )
);
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
  )
);
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center p-6 pt-0", className)} {...props} />
  )
);
CardFooter.displayName = "CardFooter";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent };
      </boltAction>

      <boltAction type="file" filePath="src/components/ContactForm.tsx">
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";

// Schéma de validation
const contactSchema = z.object({
  name: z.string().min(2, "Le nom doit contenir au moins 2 caractères"),
  email: z.string().email("Email invalide"),
  message: z.string().min(10, "Le message doit contenir au moins 10 caractères"),
});

type ContactFormData = z.infer<typeof contactSchema>;

interface ContactFormProps {
  onSubmit: (data: ContactFormData) => Promise<void>;
}

export function ContactForm({ onSubmit }: ContactFormProps) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<ContactFormData>({
    resolver: zodResolver(contactSchema),
  });

  const handleFormSubmit = async (data: ContactFormData) => {
    await onSubmit(data);
    reset();
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>Contactez-nous</CardTitle>
        <CardDescription>
          Envoyez-nous un message et nous vous répondrons rapidement.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit(handleFormSubmit)}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nom</Label>
            <Input
              id="name"
              placeholder="Votre nom"
              {...register("name")}
              aria-invalid={errors.name ? "true" : "false"}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="votre@email.com"
              {...register("email")}
              aria-invalid={errors.email ? "true" : "false"}
            />
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="message">Message</Label>
            <textarea
              id="message"
              placeholder="Votre message..."
              className="flex min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              {...register("message")}
              aria-invalid={errors.message ? "true" : "false"}
            />
            {errors.message && (
              <p className="text-sm text-destructive">{errors.message.message}</p>
            )}
          </div>
        </CardContent>

        <CardFooter>
          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Envoi en cours...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                Envoyer
              </>
            )}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
      </boltAction>

      <boltAction type="shell">
        npm install && npm run dev
      </boltAction>
    </boltArtifact>
  </assistant_response>
</example>
```

## Tests de validation

Créer un fichier de test pour vérifier que les prompts incluent les standards:

```typescript
// app/lib/.server/llm/prompts.spec.ts

import { describe, it, expect } from 'vitest';
import { getSystemPrompt } from './prompts';

describe('System Prompt - UI Standards', () => {
  const prompt = getSystemPrompt();

  it('contient les standards shadcn/ui', () => {
    expect(prompt).toContain('shadcn/ui');
    expect(prompt).toContain('COMPOSANTS SHADCN/UI');
  });

  it('contient les règles Lucide React', () => {
    expect(prompt).toContain('lucide-react');
    expect(prompt).toContain('ICÔNES LUCIDE REACT');
  });

  it('contient les règles Tailwind', () => {
    expect(prompt).toContain('Tailwind');
    expect(prompt).toContain('JAMAIS de CSS custom');
  });

  it('contient les règles d\'accessibilité', () => {
    expect(prompt).toContain('ACCESSIBILITÉ');
    expect(prompt).toContain('aria-label');
    expect(prompt).toContain('WCAG');
  });

  it('contient les exemples shadcn/ui', () => {
    expect(prompt).toContain('@/components/ui/button');
    expect(prompt).toContain('buttonVariants');
  });
});
```

---

# Étape 1.2: Patterns UI prédéfinis

## Objectif
Créer une bibliothèque de patterns UI réutilisables.

## Fichier à créer
`app/lib/templates/ui-patterns.ts`

## Code complet

```typescript
/**
 * Patterns UI prédéfinis pour BAVINI
 * Chaque pattern définit une structure et des composants recommandés
 */

export interface UIPattern {
  id: string;
  name: string;
  description: string;
  category: 'layout' | 'page' | 'component' | 'form';
  structure: string;
  components: string[];
  promptHint: string;
}

/**
 * Pattern: Dashboard Layout
 * Layout admin avec sidebar et header
 */
export const DASHBOARD_PATTERN: UIPattern = {
  id: 'dashboard',
  name: 'Dashboard',
  description: 'Interface admin avec navigation latérale',
  category: 'layout',
  components: [
    'Sheet', 'Button', 'Avatar', 'DropdownMenu',
    'Card', 'Table', 'Badge', 'Tabs'
  ],
  structure: `
    <div className="flex h-screen bg-background">
      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex md:w-64 md:flex-col border-r">
        <div className="flex h-16 items-center border-b px-4">
          <Logo />
        </div>
        <nav className="flex-1 space-y-1 p-4">
          <NavLinks />
        </nav>
      </aside>

      {/* Sidebar - Mobile (Sheet) */}
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden">
            <Menu className="h-5 w-5" />
          </Button>
        </SheetTrigger>
        <SheetContent side="left">
          <nav><NavLinks /></nav>
        </SheetContent>
      </Sheet>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 border-b flex items-center justify-between px-4 md:px-6">
          <h1 className="text-lg font-semibold">{pageTitle}</h1>
          <UserMenu />
        </header>
        <main className="flex-1 overflow-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  `,
  promptHint: `
    Pour un dashboard, utilise:
    - Sheet pour le menu mobile
    - DropdownMenu pour le menu utilisateur
    - Cards pour les statistiques
    - Table pour les données
    - Tabs pour la navigation secondaire
  `
};

/**
 * Pattern: Authentication Pages
 * Login, Register, Forgot Password
 */
export const AUTH_PATTERN: UIPattern = {
  id: 'auth',
  name: 'Authentication',
  description: 'Pages de connexion et inscription',
  category: 'page',
  components: [
    'Card', 'CardHeader', 'CardContent', 'CardFooter',
    'Form', 'Input', 'Label', 'Button', 'Separator'
  ],
  structure: `
    <div className="min-h-screen flex items-center justify-center bg-muted/50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <Logo className="mx-auto mb-4" />
          <CardTitle className="text-2xl">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {formFields}
            <Button type="submit" className="w-full">
              {submitLabel}
            </Button>
          </form>

          <div className="relative my-6">
            <Separator />
            <span className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
              ou continuer avec
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Button variant="outline">
              <GoogleIcon className="mr-2 h-4 w-4" />
              Google
            </Button>
            <Button variant="outline">
              <GithubIcon className="mr-2 h-4 w-4" />
              GitHub
            </Button>
          </div>
        </CardContent>

        <CardFooter className="justify-center">
          <p className="text-sm text-muted-foreground">
            {footerText} <a href={footerLink} className="text-primary hover:underline">{footerLinkText}</a>
          </p>
        </CardFooter>
      </Card>
    </div>
  `,
  promptHint: `
    Pour l'authentification:
    - Card centré sur fond muted
    - Validation avec react-hook-form + zod
    - Boutons OAuth avec icônes
    - Liens vers les autres pages auth
    - Messages d'erreur sous chaque champ
  `
};

/**
 * Pattern: Landing Page
 * Page marketing avec sections
 */
export const LANDING_PATTERN: UIPattern = {
  id: 'landing',
  name: 'Landing Page',
  description: 'Page marketing avec hero et features',
  category: 'page',
  components: [
    'Button', 'Card', 'Badge', 'Avatar',
    'NavigationMenu', 'Sheet'
  ],
  structure: `
    <div className="min-h-screen">
      {/* Navigation */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur">
        <nav className="container flex h-16 items-center justify-between">
          <Logo />
          <NavigationMenu className="hidden md:flex" />
          <div className="flex items-center gap-4">
            <Button variant="ghost" className="hidden md:inline-flex">Connexion</Button>
            <Button>Commencer</Button>
            <MobileMenu className="md:hidden" />
          </div>
        </nav>
      </header>

      {/* Hero Section */}
      <section className="container py-24 md:py-32 text-center">
        <Badge className="mb-4">Nouveau</Badge>
        <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
          {heroTitle}
        </h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto mb-8">
          {heroDescription}
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button size="lg">{ctaPrimary}</Button>
          <Button size="lg" variant="outline">{ctaSecondary}</Button>
        </div>
      </section>

      {/* Features Grid */}
      <section className="container py-24">
        <h2 className="text-3xl font-bold text-center mb-12">Fonctionnalités</h2>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {features.map(feature => (
            <Card key={feature.id}>
              <CardHeader>
                <feature.icon className="h-10 w-10 text-primary mb-4" />
                <CardTitle>{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">{feature.description}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-primary text-primary-foreground py-24">
        <div className="container text-center">
          <h2 className="text-3xl font-bold mb-4">{ctaTitle}</h2>
          <p className="text-lg opacity-90 mb-8">{ctaDescription}</p>
          <Button size="lg" variant="secondary">{ctaButton}</Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-12">
        <div className="container">
          <FooterContent />
        </div>
      </footer>
    </div>
  `,
  promptHint: `
    Pour une landing page:
    - Header sticky avec navigation responsive
    - Hero avec CTA prominent
    - Features en grid 3 colonnes (1 sur mobile)
    - Section CTA avec couleur primaire
    - Footer avec liens
  `
};

/**
 * Pattern: CRUD Table
 * Liste avec actions et modal
 */
export const CRUD_TABLE_PATTERN: UIPattern = {
  id: 'crud-table',
  name: 'CRUD Table',
  description: 'Tableau de données avec actions CRUD',
  category: 'component',
  components: [
    'Table', 'TableHeader', 'TableBody', 'TableRow', 'TableCell',
    'Button', 'Dialog', 'DropdownMenu', 'Input', 'Badge',
    'AlertDialog'
  ],
  structure: `
    <div className="space-y-4">
      {/* Header avec recherche et bouton ajouter */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Rechercher..." className="pl-9" />
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Ajouter
            </Button>
          </DialogTrigger>
          <DialogContent>
            <CreateForm />
          </DialogContent>
        </Dialog>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map(col => (
                <TableHead key={col.id}>{col.label}</TableHead>
              ))}
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map(item => (
              <TableRow key={item.id}>
                {columns.map(col => (
                  <TableCell key={col.id}>{item[col.id]}</TableCell>
                ))}
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem>Modifier</DropdownMenuItem>
                      <DropdownMenuItem className="text-destructive">
                        Supprimer
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {totalItems} éléments
        </p>
        <Pagination />
      </div>
    </div>
  `,
  promptHint: `
    Pour un CRUD table:
    - Barre de recherche + bouton ajouter
    - Table avec colonnes triables
    - DropdownMenu pour les actions par ligne
    - Dialog pour créer/éditer
    - AlertDialog pour confirmer suppression
    - Pagination en bas
  `
};

/**
 * Pattern: Settings Page
 * Page paramètres avec tabs
 */
export const SETTINGS_PATTERN: UIPattern = {
  id: 'settings',
  name: 'Settings',
  description: 'Page de paramètres avec onglets',
  category: 'page',
  components: [
    'Tabs', 'TabsList', 'TabsTrigger', 'TabsContent',
    'Card', 'Form', 'Input', 'Label', 'Switch', 'Button',
    'Select', 'Separator', 'Avatar'
  ],
  structure: `
    <div className="container max-w-4xl py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Paramètres</h1>
        <p className="text-muted-foreground">Gérez vos préférences</p>
      </div>

      <Tabs defaultValue="profile" className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-4">
          <TabsTrigger value="profile">Profil</TabsTrigger>
          <TabsTrigger value="account">Compte</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="security">Sécurité</TabsTrigger>
        </TabsList>

        <TabsContent value="profile">
          <Card>
            <CardHeader>
              <CardTitle>Profil</CardTitle>
              <CardDescription>Vos informations publiques</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center gap-4">
                <Avatar className="h-20 w-20">
                  <AvatarImage src={user.avatar} />
                  <AvatarFallback>{user.initials}</AvatarFallback>
                </Avatar>
                <Button variant="outline">Changer la photo</Button>
              </div>
              <Separator />
              <ProfileForm />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications">
          <Card>
            <CardHeader>
              <CardTitle>Notifications</CardTitle>
              <CardDescription>Configurez vos alertes</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {notificationSettings.map(setting => (
                <div key={setting.id} className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{setting.label}</p>
                    <p className="text-sm text-muted-foreground">{setting.description}</p>
                  </div>
                  <Switch checked={setting.enabled} onCheckedChange={...} />
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  `,
  promptHint: `
    Pour une page settings:
    - Tabs horizontaux pour les sections
    - Chaque section dans une Card
    - Switch pour les toggles
    - Formulaires avec validation
    - Bouton sauvegarder par section
  `
};

/**
 * Pattern: Profile Page
 * Page profil utilisateur
 */
export const PROFILE_PATTERN: UIPattern = {
  id: 'profile',
  name: 'Profile',
  description: 'Page profil utilisateur',
  category: 'page',
  components: [
    'Avatar', 'Card', 'Button', 'Badge', 'Tabs',
    'Separator'
  ],
  structure: `
    <div className="container max-w-4xl py-8">
      {/* Profile Header */}
      <Card className="mb-8">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row items-center md:items-start gap-6">
            <Avatar className="h-24 w-24">
              <AvatarImage src={user.avatar} />
              <AvatarFallback className="text-2xl">{user.initials}</AvatarFallback>
            </Avatar>
            <div className="flex-1 text-center md:text-left">
              <h1 className="text-2xl font-bold">{user.name}</h1>
              <p className="text-muted-foreground">{user.email}</p>
              <div className="flex flex-wrap gap-2 mt-3 justify-center md:justify-start">
                <Badge>{user.role}</Badge>
                <Badge variant="outline">Membre depuis {user.joinDate}</Badge>
              </div>
            </div>
            <Button variant="outline">Modifier le profil</Button>
          </div>
        </CardContent>
      </Card>

      {/* Profile Content */}
      <Tabs defaultValue="activity">
        <TabsList>
          <TabsTrigger value="activity">Activité</TabsTrigger>
          <TabsTrigger value="projects">Projets</TabsTrigger>
          <TabsTrigger value="stats">Statistiques</TabsTrigger>
        </TabsList>

        <TabsContent value="activity" className="mt-6">
          <ActivityFeed activities={user.activities} />
        </TabsContent>

        <TabsContent value="projects" className="mt-6">
          <div className="grid gap-4 md:grid-cols-2">
            {user.projects.map(project => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  `,
  promptHint: `
    Pour une page profil:
    - Header avec avatar large et infos principales
    - Badges pour le rôle et statut
    - Tabs pour le contenu secondaire
    - Cards pour les projets/items
  `
};

// Export de tous les patterns
export const UI_PATTERNS: Record<string, UIPattern> = {
  dashboard: DASHBOARD_PATTERN,
  auth: AUTH_PATTERN,
  landing: LANDING_PATTERN,
  'crud-table': CRUD_TABLE_PATTERN,
  settings: SETTINGS_PATTERN,
  profile: PROFILE_PATTERN,
};

/**
 * Récupère un pattern par son ID
 */
export function getPatternById(id: string): UIPattern | undefined {
  return UI_PATTERNS[id];
}

/**
 * Récupère tous les patterns d'une catégorie
 */
export function getPatternsByCategory(category: UIPattern['category']): UIPattern[] {
  return Object.values(UI_PATTERNS).filter(p => p.category === category);
}

/**
 * Génère le prompt hint combiné pour plusieurs patterns
 */
export function combinePatternHints(patternIds: string[]): string {
  return patternIds
    .map(id => UI_PATTERNS[id]?.promptHint)
    .filter(Boolean)
    .join('\n\n');
}
```

## Tests des patterns

```typescript
// app/lib/templates/ui-patterns.spec.ts

import { describe, it, expect } from 'vitest';
import {
  UI_PATTERNS,
  getPatternById,
  getPatternsByCategory,
  DASHBOARD_PATTERN,
  AUTH_PATTERN
} from './ui-patterns';

describe('UI Patterns', () => {
  it('contient 6 patterns', () => {
    expect(Object.keys(UI_PATTERNS)).toHaveLength(6);
  });

  it('chaque pattern a tous les champs requis', () => {
    Object.values(UI_PATTERNS).forEach(pattern => {
      expect(pattern).toHaveProperty('id');
      expect(pattern).toHaveProperty('name');
      expect(pattern).toHaveProperty('description');
      expect(pattern).toHaveProperty('category');
      expect(pattern).toHaveProperty('structure');
      expect(pattern).toHaveProperty('components');
      expect(pattern).toHaveProperty('promptHint');
    });
  });

  it('getPatternById retourne le bon pattern', () => {
    expect(getPatternById('dashboard')).toEqual(DASHBOARD_PATTERN);
    expect(getPatternById('auth')).toEqual(AUTH_PATTERN);
    expect(getPatternById('inexistant')).toBeUndefined();
  });

  it('getPatternsByCategory filtre correctement', () => {
    const layouts = getPatternsByCategory('layout');
    expect(layouts.length).toBeGreaterThan(0);
    layouts.forEach(p => expect(p.category).toBe('layout'));

    const pages = getPatternsByCategory('page');
    expect(pages.length).toBeGreaterThan(0);
    pages.forEach(p => expect(p.category).toBe('page'));
  });

  it('DASHBOARD_PATTERN contient les composants attendus', () => {
    expect(DASHBOARD_PATTERN.components).toContain('Sheet');
    expect(DASHBOARD_PATTERN.components).toContain('Card');
    expect(DASHBOARD_PATTERN.components).toContain('Table');
  });

  it('AUTH_PATTERN contient les composants de formulaire', () => {
    expect(AUTH_PATTERN.components).toContain('Form');
    expect(AUTH_PATTERN.components).toContain('Input');
    expect(AUTH_PATTERN.components).toContain('Button');
  });
});
```

---

# Étape 1.3: Templates améliorés

## Objectif
Ajouter des templates avec shadcn/ui pré-configuré.

## Fichier à modifier
`app/lib/templates/index.ts`

## Nouveaux templates à ajouter

```typescript
// Ajouter après les templates existants:

{
  id: 'react-shadcn',
  name: 'React + shadcn/ui',
  description: 'React + TypeScript + Tailwind + shadcn/ui + Vitest',
  icon: '🎨',
  color: 'bg-violet-500/10 hover:bg-violet-500/20 border-violet-500/30',
  prompt: `Crée une application React moderne avec:

## Stack technique
- React 18 + TypeScript + Vite
- Tailwind CSS configuré avec le thème shadcn/ui
- shadcn/ui components installés (Button, Card, Input, Label)
- Lucide React pour les icônes
- Vitest + Testing Library pour les tests

## Structure attendue
- src/components/ui/ - Composants shadcn/ui
- src/components/ - Composants métier
- src/lib/utils.ts - Fonction cn() pour les classes
- tailwind.config.js - Configuration avec couleurs shadcn
- Configuration du path alias "@/" vers src/

## Fichiers de base
- Un composant App.tsx avec un exemple de Card et Button
- Les styles CSS de base pour shadcn/ui
- Un test pour le composant App

## Important
- Utiliser les variables CSS de shadcn pour les couleurs
- Mobile-first responsive design
- Tous les composants typés avec TypeScript`,
},

{
  id: 'nextjs-shadcn',
  name: 'Next.js + shadcn/ui',
  description: 'Next.js 14 + App Router + shadcn/ui + Tailwind',
  icon: '▲',
  color: 'bg-black/10 hover:bg-black/20 border-black/30 dark:bg-white/10 dark:hover:bg-white/20 dark:border-white/30',
  prompt: `Crée une application Next.js 14 avec:

## Stack technique
- Next.js 14 avec App Router
- TypeScript strict
- Tailwind CSS + shadcn/ui theme
- shadcn/ui components de base
- Vitest pour les tests

## Structure attendue
- app/ - App Router pages
- components/ui/ - Composants shadcn/ui
- components/ - Composants métier
- lib/utils.ts - Utilitaires

## Pages de base
- app/page.tsx - Page d'accueil avec hero section
- app/layout.tsx - Layout avec metadata et providers
- components/ui/button.tsx, card.tsx, input.tsx

## Important
- Utiliser les Server Components par défaut
- "use client" uniquement quand nécessaire
- Metadata configurée pour le SEO
- Dark mode supporté`,
},

{
  id: 'fullstack-supabase',
  name: 'Full-Stack Supabase',
  description: 'React + shadcn/ui + Supabase (Auth, DB, Storage)',
  icon: '🚀',
  color: 'bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/30',
  prompt: `Crée une application full-stack avec Supabase:

## Stack technique
- React 18 + TypeScript + Vite
- Tailwind CSS + shadcn/ui
- Supabase Client pour Auth et Database
- React Router pour la navigation
- React Query pour le data fetching
- Vitest pour les tests

## Fonctionnalités Auth
- Page de connexion (email/password)
- Page d'inscription
- Page mot de passe oublié
- AuthContext pour l'état utilisateur
- Protection des routes privées

## Structure
- src/lib/supabase.ts - Client Supabase
- src/contexts/AuthContext.tsx - Provider Auth
- src/hooks/useAuth.ts - Hook personnalisé
- src/pages/auth/ - Pages d'authentification
- src/pages/dashboard/ - Pages protégées
- src/components/auth/ProtectedRoute.tsx

## Important
- Variables d'environnement pour les clés Supabase
- Fichier .env.example avec les variables requises
- Types TypeScript pour les tables (si applicable)
- RLS activé par défaut dans les exemples SQL`,
},
```

## Exporter les templates améliorés

```typescript
// Ajouter dans index.ts:

/**
 * Récupère les templates avec shadcn/ui
 */
export function getShadcnTemplates(): ProjectTemplate[] {
  return PROJECT_TEMPLATES.filter(t =>
    t.id.includes('shadcn') || t.id.includes('supabase')
  );
}

/**
 * Vérifie si un template utilise shadcn/ui
 */
export function isShadcnTemplate(templateId: string): boolean {
  const shadcnIds = ['react-shadcn', 'nextjs-shadcn', 'fullstack-supabase'];
  return shadcnIds.includes(templateId);
}
```

---

# Étape 1.4: Règles Responsive

## Objectif
Garantir que toutes les apps générées sont 100% responsive.

## Code à ajouter dans prompts.ts

```typescript
// Après <ui_standards>, ajouter:

<responsive_rules>
  RÈGLES RESPONSIVE OBLIGATOIRES - Mobile-First TOUJOURS :

  1. BREAKPOINTS TAILWIND (OBLIGATOIRE)
     - Ordre d'écriture: mobile → sm → md → lg → xl → 2xl
     - Base (< 640px): Styles mobile par défaut
     - sm (≥ 640px): Tablette portrait
     - md (≥ 768px): Tablette paysage
     - lg (≥ 1024px): Desktop
     - xl (≥ 1280px): Grand écran
     - 2xl (≥ 1536px): Très grand écran

  2. NAVIGATION RESPONSIVE (OBLIGATOIRE)
     - Mobile: Menu hamburger avec Sheet ou Drawer
     - Desktop: Navigation horizontale visible
     - Exemple:
       \`\`\`tsx
       {/* Desktop Nav */}
       <nav className="hidden md:flex items-center gap-6">
         <NavLinks />
       </nav>

       {/* Mobile Nav */}
       <Sheet>
         <SheetTrigger className="md:hidden">
           <Menu className="h-6 w-6" />
         </SheetTrigger>
         <SheetContent side="left">
           <NavLinks />
         </SheetContent>
       </Sheet>
       \`\`\`

  3. GRILLES RESPONSIVE (OBLIGATOIRE)
     - Pattern standard: grid-cols-1 → md:grid-cols-2 → lg:grid-cols-3
     - Exemple cards:
       \`\`\`tsx
       <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
         {items.map(item => <Card key={item.id} />)}
       </div>
       \`\`\`

  4. TYPOGRAPHIE RESPONSIVE (OBLIGATOIRE)
     - Titres: text-2xl md:text-3xl lg:text-4xl
     - Sous-titres: text-lg md:text-xl
     - Corps: text-sm md:text-base
     - Exemple h1:
       \`\`\`tsx
       <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold">
         Titre principal
       </h1>
       \`\`\`

  5. ESPACEMENT RESPONSIVE (OBLIGATOIRE)
     - Padding conteneur: p-4 md:p-6 lg:p-8
     - Gaps grilles: gap-4 md:gap-6
     - Margins sections: my-12 md:my-16 lg:my-24
     - Exemple section:
       \`\`\`tsx
       <section className="container px-4 md:px-6 py-12 md:py-24">
         {content}
       </section>
       \`\`\`

  6. ÉLÉMENTS CACHÉS/AFFICHÉS (OBLIGATOIRE)
     - Mobile only: block md:hidden
     - Desktop only: hidden md:block
     - Exemple sidebar:
       \`\`\`tsx
       {/* Sidebar desktop */}
       <aside className="hidden md:block w-64">
         <Sidebar />
       </aside>

       {/* Menu mobile */}
       <MobileMenu className="md:hidden" />
       \`\`\`

  7. IMAGES RESPONSIVE (OBLIGATOIRE)
     - Toujours: w-full ou largeur relative
     - Aspect ratio défini: aspect-video, aspect-square
     - Lazy loading: loading="lazy"
     - Exemple:
       \`\`\`tsx
       <img
         src={image.url}
         alt={image.alt}
         className="w-full aspect-video object-cover rounded-lg"
         loading="lazy"
       />
       \`\`\`

  8. FORMULAIRES RESPONSIVE (OBLIGATOIRE)
     - Inputs full width sur mobile: w-full
     - Boutons côte à côte sur desktop: flex-col sm:flex-row
     - Exemple:
       \`\`\`tsx
       <div className="flex flex-col sm:flex-row gap-4">
         <Input className="w-full sm:flex-1" />
         <Button className="w-full sm:w-auto">Envoyer</Button>
       </div>
       \`\`\`
</responsive_rules>
```

---

# Étape 1.5: Composants UI de base

## Objectif
Fournir les fichiers de configuration et composants de base.

## Fichiers à créer dans le projet généré

### Configuration Tailwind shadcn/ui

```javascript
// tailwind.config.js (template)
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
```

### Variables CSS globales

```css
/* src/index.css (template) */
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 222.2 84% 4.9%;
    --radius: 0.5rem;
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --popover: 222.2 84% 4.9%;
    --popover-foreground: 210 40% 98%;
    --primary: 210 40% 98%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 212.7 26.8% 83.9%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}
```

### Fonction utilitaire cn()

```typescript
// src/lib/utils.ts (template)
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

---

# Checklist Phase 1

## Étape 1.1: Standards shadcn/ui
- [ ] Ajouter `<ui_standards>` dans prompts.ts
- [ ] Ajouter exemple de composant shadcn dans les exemples
- [ ] Créer tests prompts.spec.ts
- [ ] Vérifier que les tests passent

## Étape 1.2: Patterns UI
- [ ] Créer ui-patterns.ts avec 6 patterns
- [ ] Créer tests ui-patterns.spec.ts
- [ ] Vérifier que les tests passent
- [ ] Documenter chaque pattern

## Étape 1.3: Templates améliorés
- [ ] Ajouter template React + shadcn/ui
- [ ] Ajouter template Next.js + shadcn/ui
- [ ] Ajouter template Full-Stack Supabase
- [ ] Mettre à jour les fonctions utilitaires
- [ ] Tester chaque template manuellement

## Étape 1.4: Règles Responsive
- [ ] Ajouter `<responsive_rules>` dans prompts.ts
- [ ] Inclure exemples de code pour chaque règle
- [ ] Tester avec génération d'apps

## Étape 1.5: Composants de base
- [ ] Créer template tailwind.config.js
- [ ] Créer template index.css avec variables
- [ ] Créer template utils.ts
- [ ] Documenter l'utilisation

---

# Tests d'acceptance Phase 1

## Test 1: Génération avec shadcn/ui
```
Prompt: "Crée un dashboard avec une liste d'utilisateurs"
Attendu:
- Utilise Card, Table, Button de shadcn/ui
- Import depuis @/components/ui/*
- Tailwind CSS uniquement
- Lucide React pour les icônes
```

## Test 2: Responsive
```
Prompt: "Crée une landing page pour une startup"
Attendu:
- Navigation responsive (hamburger mobile)
- Hero avec texte adaptatif
- Grid 1→2→3 colonnes
- Footer responsive
```

## Test 3: Formulaire
```
Prompt: "Crée un formulaire d'inscription"
Attendu:
- Input, Label, Button de shadcn/ui
- Validation avec messages d'erreur
- Layout responsive
- Accessibilité (labels, aria)
```

## Test 4: Template Supabase
```
Prompt: Utiliser template "Full-Stack Supabase"
Attendu:
- Client Supabase configuré
- AuthContext fonctionnel
- Pages login/register
- Routes protégées
```

---

# Métriques de succès

| Métrique | Avant | Après Phase 1 |
|----------|-------|---------------|
| Apps avec shadcn/ui | 0% | 100% |
| Apps 100% responsive | ~70% | 100% |
| Score accessibilité | ~60% | > 85% |
| Temps setup UI | ~10min | ~2min |

---

*Plan créé le 27 décembre 2025*
*Pour le projet BAVINI - Phase 1*
