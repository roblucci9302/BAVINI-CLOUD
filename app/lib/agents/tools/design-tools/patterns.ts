/**
 * =============================================================================
 * BAVINI CLOUD - Design Patterns
 * =============================================================================
 * Design patterns and color moods for different project types.
 *
 * @module lib/agents/tools/design-tools/patterns
 * =============================================================================
 */

import type { DesignBrief, DesignPattern } from './types';

/**
 * Design patterns par type de projet
 */
export const DESIGN_PATTERNS: Record<string, DesignPattern> = {
  saas: {
    keywords: ['saas', 'startup', 'product', 'app', 'platform', 'tool', 'software'],
    style: {
      mood: 'Professionnel et moderne',
      keywords: ['clean', 'minimal', 'trustworthy', 'innovative'],
      references: ['Linear', 'Notion', 'Stripe', 'Vercel'],
    },
    colors: {
      primary: '#6366F1',
      secondary: '#8B5CF6',
      accent: '#06B6D4',
      background: '#FFFFFF',
      surface: '#F8FAFC',
      text: '#0F172A',
    },
    layout: {
      type: 'single-column',
      maxWidth: '1280px',
      spacing: 'comfortable',
      borderRadius: 'rounded',
    },
    components: {
      buttons: 'solid',
      cards: 'bordered',
      navigation: 'top',
    },
    effects: {
      shadows: true,
      gradients: true,
      glassmorphism: false,
      animations: 'subtle',
      darkMode: true,
    },
    recommendations: [
      'Utiliser un hero section avec CTA clair et value proposition',
      'Inclure une section de social proof (logos clients, testimonials)',
      'Ajouter une section features avec icônes et descriptions courtes',
      'Prévoir une section pricing avec 3 tiers maximum',
      'Footer avec liens légaux et newsletter signup',
      'Utiliser des éléments HTML natifs (button, input, form) avec Tailwind CSS',
    ],
  },

  ecommerce: {
    keywords: ['ecommerce', 'shop', 'store', 'boutique', 'marketplace', 'products', 'vente'],
    style: {
      mood: 'Attractif et orienté conversion',
      keywords: ['trustworthy', 'clear', 'inviting', 'premium'],
      references: ['Apple Store', 'Shopify themes', 'ASOS'],
    },
    colors: {
      primary: '#18181B',
      secondary: '#71717A',
      accent: '#F59E0B',
      background: '#FFFFFF',
      surface: '#FAFAFA',
      text: '#18181B',
    },
    layout: {
      type: 'cards',
      maxWidth: '1440px',
      spacing: 'normal',
      borderRadius: 'subtle',
    },
    components: {
      buttons: 'solid',
      cards: 'elevated',
      navigation: 'top',
    },
    effects: {
      shadows: true,
      gradients: false,
      glassmorphism: false,
      animations: 'subtle',
      darkMode: false,
    },
    recommendations: [
      'Grille de produits responsive (4 colonnes desktop, 2 mobile)',
      'Images produits de haute qualité avec hover effects',
      'Filtres et tri visibles et accessibles',
      'Badge promotions et stock limité',
      'Panier persistant et visible',
      'Processus de checkout simplifié',
      'Utiliser des éléments HTML natifs avec Tailwind CSS pour les composants',
    ],
  },

  dashboard: {
    keywords: ['dashboard', 'admin', 'analytics', 'panel', 'backoffice', 'gestion', 'tableau de bord'],
    style: {
      mood: 'Fonctionnel et data-driven',
      keywords: ['clean', 'organized', 'efficient', 'professional'],
      references: ['Tailwind UI', 'Tremor', 'Vercel Dashboard'],
    },
    colors: {
      primary: '#3B82F6',
      secondary: '#6366F1',
      accent: '#10B981',
      background: '#F1F5F9',
      surface: '#FFFFFF',
      text: '#1E293B',
    },
    layout: {
      type: 'dashboard',
      maxWidth: '100%',
      spacing: 'normal',
      borderRadius: 'rounded',
    },
    components: {
      buttons: 'solid',
      cards: 'bordered',
      inputs: 'outlined',
      navigation: 'side',
    },
    effects: {
      shadows: false,
      gradients: false,
      glassmorphism: false,
      animations: 'subtle',
      darkMode: true,
    },
    recommendations: [
      'Sidebar de navigation fixe avec icônes',
      'Header avec search, notifications, user menu',
      'Cards pour les KPIs principaux en haut',
      'Graphiques avec Recharts ou Chart.js',
      'Tables avec pagination, tri, et filtres',
      'Utiliser un design system cohérent avec Tailwind CSS',
    ],
  },

  landing: {
    keywords: ['landing', 'page', 'vitrine', 'presentation', 'marketing', 'promo'],
    style: {
      mood: 'Impactant et mémorable',
      keywords: ['bold', 'engaging', 'modern', 'creative'],
      references: ['Framer', 'Webflow templates', 'Dribbble trends'],
    },
    colors: {
      primary: '#7C3AED',
      secondary: '#EC4899',
      accent: '#14B8A6',
      background: '#FFFFFF',
      surface: '#F5F3FF',
      text: '#1F2937',
    },
    layout: {
      type: 'single-column',
      maxWidth: '1200px',
      spacing: 'spacious',
      borderRadius: 'rounded',
    },
    components: {
      buttons: 'gradient',
      cards: 'glass',
      navigation: 'floating',
    },
    effects: {
      shadows: true,
      gradients: true,
      glassmorphism: true,
      animations: 'playful',
      darkMode: true,
    },
    recommendations: [
      'Hero section full-height avec animation ou illustration',
      'Scroll animations avec Framer Motion',
      'Sections alternées avec visuels attractifs',
      'CTAs multiples tout au long de la page',
      'Testimonials avec photos et noms',
      'FAQ section en accordion',
      'Utiliser des éléments HTML natifs avec Tailwind CSS pour les composants',
    ],
  },

  portfolio: {
    keywords: ['portfolio', 'cv', 'resume', 'personnel', 'freelance', 'artiste', 'designer', 'developer'],
    style: {
      mood: 'Créatif et personnel',
      keywords: ['unique', 'creative', 'minimal', 'artistic'],
      references: ['Awwwards winners', 'Behance', 'Personal sites'],
    },
    colors: {
      primary: '#000000',
      secondary: '#525252',
      accent: '#FBBF24',
      background: '#FAFAFA',
      surface: '#FFFFFF',
      text: '#171717',
    },
    layout: {
      type: 'magazine',
      maxWidth: '1100px',
      spacing: 'spacious',
      borderRadius: 'none',
    },
    components: {
      buttons: 'ghost',
      cards: 'flat',
      navigation: 'top',
    },
    effects: {
      shadows: false,
      gradients: false,
      glassmorphism: false,
      animations: 'playful',
      darkMode: true,
    },
    recommendations: [
      'Navigation minimaliste avec nom/logo',
      'Grille de projets avec hover effects créatifs',
      'Pages projets détaillées avec galeries',
      'Section about avec photo et bio',
      'Contact section simple et directe',
      'Cursor personnalisé et micro-interactions',
      'Utiliser des éléments HTML natifs avec Tailwind CSS pour les interactions',
    ],
  },

  blog: {
    keywords: ['blog', 'article', 'news', 'magazine', 'journal', 'publication', 'contenu'],
    style: {
      mood: 'Lisible et épuré',
      keywords: ['readable', 'clean', 'classic', 'editorial'],
      references: ['Medium', 'Substack', 'The Verge'],
    },
    colors: {
      primary: '#1D4ED8',
      secondary: '#4B5563',
      accent: '#DC2626',
      background: '#FFFFFF',
      surface: '#F9FAFB',
      text: '#111827',
    },
    layout: {
      type: 'single-column',
      maxWidth: '720px',
      spacing: 'comfortable',
      borderRadius: 'subtle',
    },
    components: {
      buttons: 'outline',
      cards: 'flat',
      navigation: 'top',
    },
    effects: {
      shadows: false,
      gradients: false,
      glassmorphism: false,
      animations: 'none',
      darkMode: true,
    },
    recommendations: [
      'Typographie soignée (Georgia, Inter, ou system fonts)',
      'Line-height généreux (1.7-1.8) pour la lecture',
      'Images full-width avec captions',
      'Table des matières pour articles longs',
      'Estimated reading time',
      "Related posts en fin d'article",
      'Utiliser des éléments HTML natifs avec Tailwind CSS pour les articles',
    ],
  },

  app: {
    keywords: ['app', 'application', 'mobile', 'web app', 'pwa', 'interface'],
    style: {
      mood: 'Intuitif et efficace',
      keywords: ['intuitive', 'clean', 'functional', 'modern'],
      references: ['iOS Human Interface', 'Material Design', 'Figma'],
    },
    colors: {
      primary: '#2563EB',
      secondary: '#7C3AED',
      accent: '#F97316',
      background: '#F8FAFC',
      surface: '#FFFFFF',
      text: '#0F172A',
    },
    layout: {
      type: 'sidebar',
      maxWidth: '100%',
      spacing: 'tight',
      borderRadius: 'rounded',
    },
    components: {
      buttons: 'solid',
      cards: 'elevated',
      inputs: 'filled',
      navigation: 'side',
    },
    effects: {
      shadows: true,
      gradients: false,
      glassmorphism: false,
      animations: 'subtle',
      darkMode: true,
    },
    recommendations: [
      'Navigation claire et hiérarchique',
      'États de chargement et feedback utilisateur',
      'Empty states informatifs',
      'Raccourcis clavier pour power users',
      'Responsive design mobile-first',
      'Accessibility (ARIA labels, focus states)',
      'Utiliser des éléments HTML natifs avec Tailwind CSS pour tous les formulaires',
    ],
  },
};

/**
 * Palettes de couleurs par mood
 */
export const COLOR_MOODS: Record<string, Partial<DesignBrief['colors']>> = {
  modern: {
    primary: '#6366F1',
    secondary: '#8B5CF6',
    accent: '#06B6D4',
  },
  warm: {
    primary: '#F97316',
    secondary: '#EAB308',
    accent: '#EF4444',
  },
  cool: {
    primary: '#0EA5E9',
    secondary: '#6366F1',
    accent: '#14B8A6',
  },
  nature: {
    primary: '#22C55E',
    secondary: '#84CC16',
    accent: '#10B981',
  },
  luxury: {
    primary: '#1F2937',
    secondary: '#D4AF37',
    accent: '#B8860B',
  },
  playful: {
    primary: '#EC4899',
    secondary: '#8B5CF6',
    accent: '#F59E0B',
  },
  corporate: {
    primary: '#1E40AF',
    secondary: '#3B82F6',
    accent: '#0EA5E9',
  },
  minimal: {
    primary: '#18181B',
    secondary: '#71717A',
    accent: '#3B82F6',
  },
};

/**
 * Détecter le pattern de design approprié basé sur le goal
 */
export function detectPattern(goal: string, context?: string): DesignPattern {
  const text = `${goal} ${context || ''}`.toLowerCase();

  // Chercher le pattern le plus approprié
  for (const [, pattern] of Object.entries(DESIGN_PATTERNS)) {
    for (const keyword of pattern.keywords) {
      if (text.includes(keyword)) {
        return pattern;
      }
    }
  }

  // Pattern par défaut : SaaS/modern
  return DESIGN_PATTERNS.saas;
}
