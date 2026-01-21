/**
 * Service de gestion des templates de projet
 * Permet de charger et afficher les templates disponibles pour un démarrage rapide
 */

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  prompt: string;

  /** Chemin vers le dossier template (pour les templates avec fichiers pré-existants) */
  templateDir?: string;

  /** Tags pour filtrer les templates */
  tags?: string[];

  /** Indique si c'est un template full-stack avec backend */
  isFullStack?: boolean;
}

/**
 * Liste des templates disponibles pour le démarrage rapide
 * Chaque template génère un projet TypeScript avec tests Vitest
 */
export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  // NOTE: BAVINI utilise HTML natif + Tailwind CSS pour tous les projets générés
  // Pas de bibliothèques UI externes (Shadcn, Radix, etc.) pour la compatibilité preview browser
  {
    id: 'react-vite-ts',
    name: 'React',
    description: 'Application React + TypeScript + Vite + Vitest',
    icon: '⚛️',
    color: 'bg-blue-500/10 hover:bg-blue-500/20 border-blue-500/30',
    prompt:
      'Crée une application React avec TypeScript, Vite, et Vitest pour les tests. Inclure un composant App de base avec un test.',
    templateDir: 'react-vite-ts',
  },
  {
    id: 'node-ts',
    name: 'Node.js',
    description: 'Serveur Node.js + TypeScript + Vitest',
    icon: '🟢',
    color: 'bg-green-500/10 hover:bg-green-500/20 border-green-500/30',
    prompt:
      "Crée un projet Node.js avec TypeScript et Vitest pour les tests. Inclure un point d'entrée index.ts et un module utilitaire avec tests.",
    templateDir: 'node-ts',
  },
  {
    id: 'next-ts',
    name: 'Next.js',
    description: 'Application Next.js 14 + TypeScript + App Router',
    icon: '▲',
    color: 'bg-gray-500/10 hover:bg-gray-500/20 border-gray-500/30',
    prompt:
      "Crée une application Next.js 14 avec TypeScript et App Router. Inclure une page d'accueil, un layout, et la configuration de tests avec Vitest.",
    templateDir: 'next-ts',
  },
  {
    id: 'astro-ts',
    name: 'Astro',
    description: 'Site Astro + TypeScript + Islands',
    icon: '🚀',
    color: 'bg-purple-500/10 hover:bg-purple-500/20 border-purple-500/30',
    prompt:
      "Crée un site Astro avec TypeScript. Inclure une page d'accueil, un composant interactif React, et la configuration de tests.",
    templateDir: 'astro-ts',
  },
  {
    id: 'express-ts',
    name: 'API Express',
    description: 'API REST Express + TypeScript + Vitest',
    icon: '🔌',
    color: 'bg-yellow-500/10 hover:bg-yellow-500/20 border-yellow-500/30',
    prompt:
      'Crée une API REST avec Express et TypeScript. Inclure un endpoint /health, la structure MVC, et des tests avec Vitest et Supertest.',
    templateDir: 'express-ts',
    tags: ['api', 'backend'],
  },
  {
    id: 'supabase-fullstack',
    name: 'Supabase Full-Stack',
    description: 'React + Supabase (Auth, Database, RLS) + Tailwind',
    icon: '⚡',
    color: 'bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/30',
    prompt: `Crée une application full-stack avec React et Supabase.
Inclure:
- Authentification (inscription, connexion, déconnexion)
- Profils utilisateurs avec RLS
- Dashboard protégé
- React Query pour la gestion d'état
- Tailwind CSS pour le styling
- Structure de migration SQL`,
    templateDir: 'supabase-fullstack',
    tags: ['fullstack', 'auth', 'database', 'supabase'],
    isFullStack: true,
  },
];

/**
 * Récupère un template par son identifiant
 */
export function getTemplateById(id: string): ProjectTemplate | undefined {
  return PROJECT_TEMPLATES.find((template) => template.id === id);
}

/**
 * Récupère les templates principaux à afficher (les 4 premiers)
 */
export function getMainTemplates(): ProjectTemplate[] {
  return PROJECT_TEMPLATES.slice(0, 4);
}

/**
 * Récupère les templates additionnels (après les 4 premiers)
 */
export function getAdditionalTemplates(): ProjectTemplate[] {
  return PROJECT_TEMPLATES.slice(4);
}

/**
 * Récupère les templates full-stack avec backend intégré
 */
export function getFullStackTemplates(): ProjectTemplate[] {
  return PROJECT_TEMPLATES.filter((template) => template.isFullStack);
}

/**
 * Récupère les templates par tag
 */
export function getTemplatesByTag(tag: string): ProjectTemplate[] {
  return PROJECT_TEMPLATES.filter((template) => template.tags?.includes(tag));
}

/**
 * Vérifie si un template a des fichiers pré-existants
 */
export function hasTemplateFiles(template: ProjectTemplate): boolean {
  return !!template.templateDir;
}
