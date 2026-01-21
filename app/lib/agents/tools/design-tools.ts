/**
 * Outils de design pour les agents BAVINI
 * Ces outils permettent de générer des inspirations et guidelines de design
 *
 * Version 2.0 - Intégration des palettes 2025 et composants modernes
 */

import type { ToolDefinition, ToolExecutionResult } from '../types';
import {
  PALETTES_2025,
  getRecommendedPalette,
  generateCSSVariables as generatePaletteCSSVariables,
  generateTailwindColors,
  type ColorPalette,
} from '../design/palettes-2025';
import {
  MODERN_COMPONENTS,
  searchComponents,
  getComponentsByCategory,
  formatComponentsForPrompt,
  type ComponentSnippet,
} from '../design/modern-components';
import { ANIMATION_PRESETS, formatAnimationsForPrompt } from '../design/animation-presets';
import {
  TEMPLATES_METADATA,
  getTemplateByName,
  getTemplatesByUseCase,
  getTemplatesByPalette,
} from '../design/templates';

/*
 * ============================================================================
 * TYPES
 * ============================================================================
 */

/**
 * Brief de design généré
 */
export interface DesignBrief {
  /** Style visuel général */
  style: {
    mood: string;
    keywords: string[];
    references: string[];
  };

  /** Palette de couleurs recommandée */
  colors: {
    primary: string;
    secondary: string;
    accent: string;
    background: string;
    surface: string;
    text: string;
    textMuted: string;
    border: string;
    success: string;
    warning: string;
    error: string;
  };

  /** Typographie */
  typography: {
    headingFont: string;
    bodyFont: string;
    monoFont: string;
    scale: 'compact' | 'comfortable' | 'spacious';
  };

  /** Structure de layout */
  layout: {
    type: 'single-column' | 'sidebar' | 'dashboard' | 'magazine' | 'cards';
    maxWidth: string;
    spacing: 'tight' | 'normal' | 'relaxed' | 'comfortable' | 'spacious';
    borderRadius: 'none' | 'subtle' | 'rounded' | 'pill';
  };

  /** Composants UI recommandés */
  components: {
    buttons: 'solid' | 'outline' | 'ghost' | 'gradient';
    cards: 'flat' | 'elevated' | 'bordered' | 'glass';
    inputs: 'underline' | 'outlined' | 'filled';
    navigation: 'top' | 'side' | 'bottom' | 'floating';
  };

  /** Effets visuels */
  effects: {
    shadows: boolean;
    gradients: boolean;
    glassmorphism: boolean;
    animations: 'none' | 'subtle' | 'playful';
    darkMode: boolean;
  };

  /** Recommandations spécifiques */
  recommendations: string[];
}

/**
 * Patterns de design par type de projet
 */
interface DesignPattern {
  keywords: string[];
  style: DesignBrief['style'];
  colors: Partial<DesignBrief['colors']>;
  layout: Partial<DesignBrief['layout']>;
  components: Partial<DesignBrief['components']>;
  effects: Partial<DesignBrief['effects']>;
  recommendations: string[];
}

/*
 * ============================================================================
 * PATTERNS DE DESIGN
 * ============================================================================
 */

const DESIGN_PATTERNS: Record<string, DesignPattern> = {
  saas: {
    keywords: ['saas', 'startup', 'product', 'app', 'platform', 'tool', 'software'],
    style: {
      mood: 'Professionnel et moderne',
      keywords: ['clean', 'minimal', 'trustworthy', 'innovative'],
      references: ['Linear', 'Notion', 'Stripe', 'Vercel'],
    },
    colors: {
      primary: '#6366F1', // Indigo
      secondary: '#8B5CF6', // Violet
      accent: '#06B6D4', // Cyan
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
      primary: '#18181B', // Noir élégant
      secondary: '#71717A', // Gris
      accent: '#F59E0B', // Orange/Gold pour les CTA
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
      primary: '#3B82F6', // Blue
      secondary: '#6366F1', // Indigo
      accent: '#10B981', // Green pour success
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
      primary: '#7C3AED', // Violet
      secondary: '#EC4899', // Pink
      accent: '#14B8A6', // Teal
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
      accent: '#FBBF24', // Yellow/Gold
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
      primary: '#1D4ED8', // Blue pour les liens
      secondary: '#4B5563',
      accent: '#DC2626', // Rouge pour highlights
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
      primary: '#2563EB', // Blue
      secondary: '#7C3AED', // Violet
      accent: '#F97316', // Orange
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

/*
 * ============================================================================
 * PALETTES DE COULEURS SUPPLÉMENTAIRES
 * ============================================================================
 */

const COLOR_MOODS: Record<string, Partial<DesignBrief['colors']>> = {
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

/*
 * ============================================================================
 * DÉFINITIONS DES OUTILS
 * ============================================================================
 */

/**
 * Outil pour générer une inspiration de design
 */
export const GenerateDesignInspirationTool: ToolDefinition = {
  name: 'generate_design_inspiration',
  description: `Génère un brief de design complet basé sur le type de projet demandé.
Utilise cet outil AVANT de coder quand la demande est vague sur le style visuel.

Exemples d'utilisation :
- "Crée une landing page pour mon SaaS" → Génère un brief avec palette, typo, layout
- "Fais-moi un dashboard admin" → Génère des recommandations dashboard
- "Je veux un portfolio moderne" → Génère un style créatif et unique

Le brief retourné contient :
- Style visuel (mood, références)
- Palette de couleurs complète
- Typographie recommandée
- Structure de layout
- Composants UI suggérés
- Effets visuels
- Recommandations spécifiques

IMPORTANT : Suis les recommandations du brief lors de la génération du code.`,
  inputSchema: {
    type: 'object',
    properties: {
      goal: {
        type: 'string',
        description: 'Objectif du projet (ex: "landing page SaaS", "dashboard analytics", "portfolio designer")',
      },
      context: {
        type: 'string',
        description: 'Contexte additionnel : industrie, marque, contraintes, préférences de style',
      },
      mood: {
        type: 'string',
        description: 'Ambiance souhaitée (modern, warm, cool, nature, luxury, playful, corporate, minimal)',
        enum: ['modern', 'warm', 'cool', 'nature', 'luxury', 'playful', 'corporate', 'minimal'],
      },
      darkMode: {
        type: 'boolean',
        description: 'Générer un design dark mode par défaut (défaut: false)',
      },
    },
    required: ['goal'],
  },
};

/*
 * ============================================================================
 * HANDLERS D'EXÉCUTION
 * ============================================================================
 */

/**
 * Détecter le pattern de design approprié basé sur le goal
 */
function detectPattern(goal: string, context?: string): DesignPattern {
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

/**
 * Générer une palette dark mode
 */
function generateDarkModeColors(colors: DesignBrief['colors']): DesignBrief['colors'] {
  return {
    ...colors,
    background: '#0F172A',
    surface: '#1E293B',
    text: '#F8FAFC',
    textMuted: '#94A3B8',
    border: '#334155',
  };
}

/**
 * Créer le brief de design complet
 */
function createDesignBrief(goal: string, context?: string, mood?: string, darkMode?: boolean): DesignBrief {
  const pattern = detectPattern(goal, context);

  // Couleurs de base
  const moodColors = mood && COLOR_MOODS[mood] ? COLOR_MOODS[mood] : {};

  let colors: DesignBrief['colors'] = {
    primary: '#6366F1',
    secondary: '#8B5CF6',
    accent: '#06B6D4',
    background: '#FFFFFF',
    surface: '#F8FAFC',
    text: '#0F172A',
    textMuted: '#64748B',
    border: '#E2E8F0',
    success: '#22C55E',
    warning: '#F59E0B',
    error: '#EF4444',
    ...pattern.colors,
    ...moodColors,
  };

  // Appliquer dark mode si demandé
  if (darkMode) {
    colors = generateDarkModeColors(colors);
  }

  // Construire le brief
  const brief: DesignBrief = {
    style: pattern.style,
    colors,
    typography: {
      headingFont: 'Inter, system-ui, sans-serif',
      bodyFont: 'Inter, system-ui, sans-serif',
      monoFont: 'JetBrains Mono, Fira Code, monospace',
      scale: pattern.layout?.spacing === 'tight' ? 'compact' : 'comfortable',
    },
    layout: {
      type: pattern.layout?.type || 'single-column',
      maxWidth: pattern.layout?.maxWidth || '1280px',
      spacing: pattern.layout?.spacing || 'normal',
      borderRadius: pattern.layout?.borderRadius || 'rounded',
    },
    components: {
      buttons: pattern.components?.buttons || 'solid',
      cards: pattern.components?.cards || 'bordered',
      inputs: pattern.components?.inputs || 'outlined',
      navigation: pattern.components?.navigation || 'top',
    },
    effects: {
      shadows: pattern.effects?.shadows ?? true,
      gradients: pattern.effects?.gradients ?? false,
      glassmorphism: pattern.effects?.glassmorphism ?? false,
      animations: pattern.effects?.animations || 'subtle',
      darkMode: darkMode ?? pattern.effects?.darkMode ?? true,
    },
    recommendations: pattern.recommendations,
  };

  // Ajouter des recommandations basées sur le contexte
  if (context) {
    if (context.toLowerCase().includes('mobile')) {
      brief.recommendations.push('Priorité mobile-first avec touch targets de 44px minimum');
    }
    if (context.toLowerCase().includes('accessib')) {
      brief.recommendations.push('Contraste WCAG AA minimum, focus visible, ARIA labels');
    }
    if (context.toLowerCase().includes('performance') || context.toLowerCase().includes('rapide')) {
      brief.recommendations.push('Optimiser les images, lazy loading, minimal JavaScript');
    }
  }

  return brief;
}

/**
 * Formater le brief en texte lisible
 */
function formatBriefAsText(brief: DesignBrief): string {
  const lines: string[] = [
    '═══════════════════════════════════════════════════════════════',
    '                    📐 BRIEF DE DESIGN                          ',
    '═══════════════════════════════════════════════════════════════',
    '',
    '## 🎨 STYLE VISUEL',
    `   Mood: ${brief.style.mood}`,
    `   Mots-clés: ${brief.style.keywords.join(', ')}`,
    `   Références: ${brief.style.references.join(', ')}`,
    '',
    '## 🎨 PALETTE DE COULEURS',
    `   Primary:    ${brief.colors.primary}`,
    `   Secondary:  ${brief.colors.secondary}`,
    `   Accent:     ${brief.colors.accent}`,
    `   Background: ${brief.colors.background}`,
    `   Surface:    ${brief.colors.surface}`,
    `   Text:       ${brief.colors.text}`,
    `   TextMuted:  ${brief.colors.textMuted}`,
    `   Border:     ${brief.colors.border}`,
    '',
    '## 📝 TYPOGRAPHIE',
    `   Headings: ${brief.typography.headingFont}`,
    `   Body:     ${brief.typography.bodyFont}`,
    `   Code:     ${brief.typography.monoFont}`,
    `   Scale:    ${brief.typography.scale}`,
    '',
    '## 📐 LAYOUT',
    `   Type:         ${brief.layout.type}`,
    `   Max Width:    ${brief.layout.maxWidth}`,
    `   Spacing:      ${brief.layout.spacing}`,
    `   Border Radius: ${brief.layout.borderRadius}`,
    '',
    '## 🧩 COMPOSANTS',
    `   Buttons:    ${brief.components.buttons}`,
    `   Cards:      ${brief.components.cards}`,
    `   Inputs:     ${brief.components.inputs}`,
    `   Navigation: ${brief.components.navigation}`,
    '',
    '## ✨ EFFETS',
    `   Shadows:      ${brief.effects.shadows ? 'Oui' : 'Non'}`,
    `   Gradients:    ${brief.effects.gradients ? 'Oui' : 'Non'}`,
    `   Glassmorphism: ${brief.effects.glassmorphism ? 'Oui' : 'Non'}`,
    `   Animations:   ${brief.effects.animations}`,
    `   Dark Mode:    ${brief.effects.darkMode ? 'Supporté' : 'Non'}`,
    '',
    '## 💡 RECOMMANDATIONS',
    ...brief.recommendations.map((r, i) => `   ${i + 1}. ${r}`),
    '',
    '═══════════════════════════════════════════════════════════════',
    '',
    '⚠️  IMPORTANT: Applique ces recommandations dans le code généré.',
    '    Utilise les couleurs exactes et respecte le style défini.',
    '',
  ];

  return lines.join('\n');
}

/**
 * Générer le CSS des variables de design
 */
function generateCSSVariables(brief: DesignBrief): string {
  return `:root {
  /* Colors */
  --color-primary: ${brief.colors.primary};
  --color-secondary: ${brief.colors.secondary};
  --color-accent: ${brief.colors.accent};
  --color-background: ${brief.colors.background};
  --color-surface: ${brief.colors.surface};
  --color-text: ${brief.colors.text};
  --color-text-muted: ${brief.colors.textMuted};
  --color-border: ${brief.colors.border};
  --color-success: ${brief.colors.success};
  --color-warning: ${brief.colors.warning};
  --color-error: ${brief.colors.error};

  /* Typography */
  --font-heading: ${brief.typography.headingFont};
  --font-body: ${brief.typography.bodyFont};
  --font-mono: ${brief.typography.monoFont};

  /* Layout */
  --max-width: ${brief.layout.maxWidth};
  --border-radius: ${brief.layout.borderRadius === 'none' ? '0' : brief.layout.borderRadius === 'subtle' ? '4px' : brief.layout.borderRadius === 'rounded' ? '8px' : '9999px'};
  --spacing: ${brief.layout.spacing === 'tight' ? '0.5rem' : brief.layout.spacing === 'normal' ? '1rem' : '1.5rem'};
}`;
}

/**
 * Générer la config Tailwind
 */
function generateTailwindConfig(brief: DesignBrief): string {
  return `// tailwind.config.ts - Généré par BAVINI Design Tool
export default {
  theme: {
    extend: {
      colors: {
        primary: '${brief.colors.primary}',
        secondary: '${brief.colors.secondary}',
        accent: '${brief.colors.accent}',
        background: '${brief.colors.background}',
        surface: '${brief.colors.surface}',
        foreground: '${brief.colors.text}',
        muted: '${brief.colors.textMuted}',
        border: '${brief.colors.border}',
      },
      fontFamily: {
        heading: ['${brief.typography.headingFont.split(',')[0]}', 'sans-serif'],
        body: ['${brief.typography.bodyFont.split(',')[0]}', 'sans-serif'],
        mono: ['${brief.typography.monoFont.split(',')[0]}', 'monospace'],
      },
      borderRadius: {
        DEFAULT: '${brief.layout.borderRadius === 'none' ? '0' : brief.layout.borderRadius === 'subtle' ? '4px' : brief.layout.borderRadius === 'rounded' ? '8px' : '9999px'}',
      },
    },
  },
};`;
}

/**
 * Créer les handlers pour les outils de design
 */
export function createDesignToolHandlers(): Record<
  string,
  (input: Record<string, unknown>) => Promise<ToolExecutionResult>
> {
  return {
    /**
     * Handler pour generate_design_inspiration
     */
    async generate_design_inspiration(input: Record<string, unknown>): Promise<ToolExecutionResult> {
      try {
        const goal = input.goal as string;
        const context = input.context as string | undefined;
        const mood = input.mood as string | undefined;
        const darkMode = input.darkMode as boolean | undefined;

        if (!goal) {
          return {
            success: false,
            output: null,
            error: 'Le paramètre "goal" est requis',
          };
        }

        const brief = createDesignBrief(goal, context, mood, darkMode);

        const formattedBrief = formatBriefAsText(brief);
        const cssVariables = generateCSSVariables(brief);
        const tailwindConfig = generateTailwindConfig(brief);

        return {
          success: true,
          output: {
            brief,
            formatted: formattedBrief,
            cssVariables,
            tailwindConfig,
            message: `Brief de design généré pour: "${goal}"`,
          },
        };
      } catch (error) {
        return {
          success: false,
          output: null,
          error: `Échec de la génération du brief: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  };
}

/*
 * ============================================================================
 * NOUVEAUX OUTILS 2025
 * ============================================================================
 */

/**
 * Outil pour obtenir des composants modernes
 */
export const GetModernComponentsTool: ToolDefinition = {
  name: 'get_modern_components',
  description: `Obtenir des composants UI modernes prêts à l'emploi.
Utilise cet outil pour trouver des composants React/Tailwind modernes et beaux.

Catégories disponibles:
- hero: Sections hero avec animations
- cards: Cards avec effets (glass, spotlight, hover)
- buttons: Boutons avec effets (shimmer, glow, magnetic)
- navigation: Navbars et menus
- features: Sections de features
- testimonials: Témoignages clients
- pricing: Tables de prix
- footer: Footers modernes
- effects: Effets visuels (curseur, gradients)
- animations: Wrappers d'animation

Le code retourné est du React/TypeScript avec Tailwind CSS et Framer Motion.`,
  inputSchema: {
    type: 'object',
    properties: {
      category: {
        type: 'string',
        description: 'Catégorie de composants',
        enum: [
          'hero',
          'cards',
          'buttons',
          'navigation',
          'features',
          'testimonials',
          'pricing',
          'footer',
          'effects',
          'animations',
          'forms',
        ],
      },
      search: {
        type: 'string',
        description: 'Recherche par mots-clés (ex: "glass", "gradient", "hover")',
      },
    },
  },
};

/**
 * Outil pour obtenir une palette 2025
 */
export const GetPalette2025Tool: ToolDefinition = {
  name: 'get_palette_2025',
  description: `Obtenir une palette de couleurs moderne 2025.
Palettes disponibles avec light et dark mode:

- Aurora: Violet/Pink/Cyan vibrant (SaaS, startups, tech)
- Midnight: Bleu profond élégant (fintech, enterprise, dashboards)
- Ember: Orange/Rouge chaleureux (food, lifestyle, créatif)
- Forest: Vert nature apaisant (eco, santé, bien-être)
- Obsidian: Noir premium avec or (luxe, fashion, premium)
- Neon: Cyberpunk néon (gaming, futuriste, tech)
- Rose: Rose moderne inclusif (beauty, social, femtech)
- Slate: Gris neutre professionnel (universel)

Retourne les couleurs, gradients, et configurations Tailwind.`,
  inputSchema: {
    type: 'object',
    properties: {
      palette: {
        type: 'string',
        description: 'Nom de la palette',
        enum: ['Aurora', 'Midnight', 'Ember', 'Forest', 'Obsidian', 'Neon', 'Rose', 'Slate'],
      },
      projectType: {
        type: 'string',
        description: 'Type de projet pour recommandation automatique',
      },
      mode: {
        type: 'string',
        description: 'Mode de couleur',
        enum: ['light', 'dark', 'both'],
      },
    },
  },
};

/**
 * Outil pour obtenir un template de design complet
 */
export const GetDesignTemplateTool: ToolDefinition = {
  name: 'get_design_template',
  description: `Obtenir un template de page complet prêt à l'emploi.

⭐ UTILISE CET OUTIL QUAND L'UTILISATEUR DEMANDE:
- "crée-moi un site e-commerce" → template EcommerceModern
- "je veux un dashboard" → template DashboardModern
- "fais-moi une landing page" → template LandingModern
- "un portfolio" → template PortfolioModern
- "une page de tarifs" → template PricingModern
- "un blog" → template BlogModern
- "une page d'authentification" → template AuthModern
- "une page 404" → template ErrorModern

TEMPLATES DISPONIBLES (10):
1. LandingModern (Aurora) - Landing page SaaS/Startup
2. DashboardModern (Midnight) - Dashboard/Admin panel
3. PortfolioModern (Obsidian) - Portfolio créatif
4. EcommerceModern (Ember) - Boutique e-commerce
5. BlogModern (Slate) - Blog/Magazine
6. PricingModern (Aurora) - Page tarifs SaaS
7. AgencyModern (Rose) - Page agence/services
8. DocsModern (Midnight) - Documentation technique
9. AuthModern (Slate) - Login/Signup/Forgot password
10. ErrorModern (Neon) - 404/500/Maintenance

Chaque template inclut:
- Code React/TypeScript complet
- Tailwind CSS pour le styling
- Animations Framer Motion
- Composants responsive
- Dark mode support`,
  inputSchema: {
    type: 'object',
    properties: {
      template: {
        type: 'string',
        description: 'Nom du template',
        enum: [
          'LandingModern',
          'DashboardModern',
          'PortfolioModern',
          'EcommerceModern',
          'BlogModern',
          'PricingModern',
          'AgencyModern',
          'DocsModern',
          'AuthModern',
          'ErrorModern',
        ],
      },
      useCase: {
        type: 'string',
        description: 'Cas d\'usage pour recommandation automatique (ex: "e-commerce", "blog", "portfolio")',
      },
      listAll: {
        type: 'boolean',
        description: 'Lister tous les templates disponibles sans code',
      },
    },
  },
};

/**
 * Recommande le template le plus adapté selon le cas d'usage
 */
export function recommendTemplate(useCase: string): (typeof TEMPLATES_METADATA)[number] | null {
  const useCaseLower = useCase.toLowerCase();

  // Mapping des mots-clés vers les templates
  const keywordMapping: Record<string, string> = {
    // E-commerce
    shop: 'EcommerceModern',
    store: 'EcommerceModern',
    boutique: 'EcommerceModern',
    'e-commerce': 'EcommerceModern',
    ecommerce: 'EcommerceModern',
    marketplace: 'EcommerceModern',
    produit: 'EcommerceModern',
    product: 'EcommerceModern',
    vente: 'EcommerceModern',
    panier: 'EcommerceModern',
    cart: 'EcommerceModern',

    // Landing
    landing: 'LandingModern',
    saas: 'LandingModern',
    startup: 'LandingModern',
    marketing: 'LandingModern',
    launch: 'LandingModern',
    accueil: 'LandingModern',
    home: 'LandingModern',

    // Dashboard
    dashboard: 'DashboardModern',
    admin: 'DashboardModern',
    backoffice: 'DashboardModern',
    analytics: 'DashboardModern',
    'tableau de bord': 'DashboardModern',
    crm: 'DashboardModern',
    gestion: 'DashboardModern',

    // Portfolio
    portfolio: 'PortfolioModern',
    cv: 'PortfolioModern',
    resume: 'PortfolioModern',
    freelance: 'PortfolioModern',
    personnel: 'PortfolioModern',
    personal: 'PortfolioModern',
    créatif: 'PortfolioModern',
    creative: 'PortfolioModern',

    // Blog
    blog: 'BlogModern',
    article: 'BlogModern',
    magazine: 'BlogModern',
    news: 'BlogModern',
    actualité: 'BlogModern',
    journal: 'BlogModern',
    content: 'BlogModern',

    // Pricing
    pricing: 'PricingModern',
    tarif: 'PricingModern',
    prix: 'PricingModern',
    plan: 'PricingModern',
    subscription: 'PricingModern',
    abonnement: 'PricingModern',

    // Agency
    agency: 'AgencyModern',
    agence: 'AgencyModern',
    service: 'AgencyModern',
    consulting: 'AgencyModern',
    studio: 'AgencyModern',
    équipe: 'AgencyModern',
    team: 'AgencyModern',

    // Docs
    doc: 'DocsModern',
    documentation: 'DocsModern',
    api: 'DocsModern',
    guide: 'DocsModern',
    tutorial: 'DocsModern',
    knowledge: 'DocsModern',
    wiki: 'DocsModern',

    // Auth
    auth: 'AuthModern',
    login: 'AuthModern',
    connexion: 'AuthModern',
    signup: 'AuthModern',
    inscription: 'AuthModern',
    register: 'AuthModern',
    password: 'AuthModern',

    // Error
    error: 'ErrorModern',
    erreur: 'ErrorModern',
    '404': 'ErrorModern',
    '500': 'ErrorModern',
    maintenance: 'ErrorModern',
    'not found': 'ErrorModern',
  };

  // Chercher le premier mot-clé qui correspond
  for (const [keyword, templateName] of Object.entries(keywordMapping)) {
    if (useCaseLower.includes(keyword)) {
      return TEMPLATES_METADATA.find((t) => t.name === templateName) || null;
    }
  }

  // Essayer avec getTemplatesByUseCase
  const matches = getTemplatesByUseCase(useCase);
  if (matches.length > 0) {
    return matches[0];
  }

  return null;
}

/**
 * Handlers pour les nouveaux outils
 */
export function createDesignToolHandlersV2(): Record<
  string,
  (input: Record<string, unknown>) => Promise<ToolExecutionResult>
> {
  const baseHandlers = createDesignToolHandlers();

  return {
    ...baseHandlers,

    /**
     * Handler pour get_modern_components
     */
    async get_modern_components(input: Record<string, unknown>): Promise<ToolExecutionResult> {
      try {
        const category = input.category as string | undefined;
        const search = input.search as string | undefined;

        let components: ComponentSnippet[] = [];

        if (category) {
          components = getComponentsByCategory(category as any);
        } else if (search) {
          components = searchComponents(search);
        } else {
          // Retourner un aperçu de tous les composants
          components = MODERN_COMPONENTS;
        }

        if (components.length === 0) {
          return {
            success: true,
            output: {
              message: 'Aucun composant trouvé pour cette recherche.',
              availableCategories: [
                'hero',
                'cards',
                'buttons',
                'navigation',
                'features',
                'testimonials',
                'pricing',
                'footer',
                'effects',
                'animations',
                'forms',
              ],
              suggestion: 'Essaie avec une catégorie ou un mot-clé différent.',
            },
          };
        }

        // Formater les composants pour le retour
        const formatted = components.map((c) => ({
          name: c.name,
          description: c.description,
          category: c.category,
          tags: c.tags,
          dependencies: c.dependencies || [],
          code: c.code,
          styles: c.styles,
        }));

        return {
          success: true,
          output: {
            components: formatted,
            count: formatted.length,
            message: `${formatted.length} composant(s) trouvé(s).`,
            tip: 'Utilise le code directement dans ton projet. Ajoute framer-motion si nécessaire.',
          },
        };
      } catch (error) {
        return {
          success: false,
          output: null,
          error: `Erreur: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },

    /**
     * Handler pour get_palette_2025
     */
    async get_palette_2025(input: Record<string, unknown>): Promise<ToolExecutionResult> {
      try {
        const paletteName = input.palette as string | undefined;
        const projectType = input.projectType as string | undefined;
        const mode = (input.mode as string) || 'both';

        let palette: ColorPalette;

        if (paletteName) {
          const found = PALETTES_2025.find((p) => p.name.toLowerCase() === paletteName.toLowerCase());
          if (!found) {
            return {
              success: false,
              output: null,
              error: `Palette "${paletteName}" non trouvée. Palettes disponibles: ${PALETTES_2025.map((p) => p.name).join(', ')}`,
            };
          }
          palette = found;
        } else if (projectType) {
          palette = getRecommendedPalette(projectType);
        } else {
          // Par défaut: Aurora
          palette = PALETTES_2025[0];
        }

        const output: Record<string, unknown> = {
          name: palette.name,
          description: palette.description,
          tags: palette.tags,
          gradients: palette.gradients,
        };

        if (mode === 'light' || mode === 'both') {
          output.light = palette.light;
          output.cssVariablesLight = generatePaletteCSSVariables(palette, 'light');
        }

        if (mode === 'dark' || mode === 'both') {
          output.dark = palette.dark;
          output.cssVariablesDark = generatePaletteCSSVariables(palette, 'dark');
        }

        output.tailwindConfig = generateTailwindColors(palette);
        output.message = `Palette "${palette.name}" - ${palette.description}`;

        return {
          success: true,
          output,
        };
      } catch (error) {
        return {
          success: false,
          output: null,
          error: `Erreur: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },

    /**
     * Handler pour get_design_template
     */
    async get_design_template(input: Record<string, unknown>): Promise<ToolExecutionResult> {
      try {
        const templateName = input.template as string | undefined;
        const useCase = input.useCase as string | undefined;
        const listAll = input.listAll as boolean | undefined;

        // Mode liste: retourne tous les templates disponibles
        if (listAll) {
          return {
            success: true,
            output: {
              templates: TEMPLATES_METADATA.map((t) => ({
                name: t.name,
                description: t.description,
                palette: t.palette,
                sections: t.sections,
                useCases: t.useCases,
              })),
              count: TEMPLATES_METADATA.length,
              message: `${TEMPLATES_METADATA.length} templates disponibles. Utilise le paramètre "template" pour obtenir le code complet.`,
            },
          };
        }

        // Déterminer le template à utiliser
        const selectedTemplate = templateName
          ? getTemplateByName(templateName)
          : useCase
            ? recommendTemplate(useCase)
            : null;

        if (!selectedTemplate && !templateName && !useCase) {
          return {
            success: false,
            output: null,
            error:
              'Paramètre requis: "template" (nom du template), "useCase" (pour recommandation), ou "listAll" (pour lister).',
          };
        }

        if (!selectedTemplate) {
          const suggestion = useCase
            ? `Aucun template trouvé pour "${useCase}".`
            : `Template "${templateName}" non trouvé.`;

          return {
            success: false,
            output: null,
            error: `${suggestion} Templates disponibles: ${TEMPLATES_METADATA.map((t) => t.name).join(', ')}`,
          };
        }

        // Import dynamique du template pour récupérer le code
        const templateInfo = {
          name: selectedTemplate.name,
          file: selectedTemplate.file,
          description: selectedTemplate.description,
          palette: selectedTemplate.palette,
          sections: selectedTemplate.sections,
          useCases: selectedTemplate.useCases,

          // Note: Le code complet du template est disponible dans le fichier
          templatePath: `app/lib/agents/design/templates/${selectedTemplate.file}`,
          instructions: `
Pour utiliser ce template:
1. Copie le code depuis: app/lib/agents/design/templates/${selectedTemplate.file}
2. IMPORTANT: Le template inclut déjà 'use client' en première ligne (requis pour Next.js 13+)
3. Adapte les textes et images à ton projet
4. Modifie les couleurs si tu utilises une palette différente de ${selectedTemplate.palette}
5. Ajoute framer-motion si les animations sont requises

⚠️ Note Next.js: Ce template utilise des hooks React (useState, etc.) et framer-motion.
   La directive 'use client' est OBLIGATOIRE en première ligne pour les projets Next.js App Router.

Sections incluses: ${selectedTemplate.sections.join(', ')}
Cas d'usage: ${selectedTemplate.useCases.join(', ')}
          `.trim(),
        };

        return {
          success: true,
          output: {
            template: templateInfo,
            recommendation: useCase ? `Template recommandé pour "${useCase}": ${selectedTemplate.name}` : undefined,
            message: `Template "${selectedTemplate.name}" - ${selectedTemplate.description}`,
          },
        };
      } catch (error) {
        return {
          success: false,
          output: null,
          error: `Erreur: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  };
}

/*
 * ============================================================================
 * EXPORT
 * ============================================================================
 */

/**
 * Tous les outils de design (version 2.0)
 */
export const DESIGN_TOOLS: ToolDefinition[] = [
  GenerateDesignInspirationTool,
  GetModernComponentsTool,
  GetPalette2025Tool,
  GetDesignTemplateTool,
];

/**
 * Obtenir le résumé du design system pour les prompts
 */
export function getDesignSystemSummary(): string {
  return `
# Design System BAVINI 2.0

## 🎨 Templates Complets (${TEMPLATES_METADATA.length} templates)
${TEMPLATES_METADATA.map((t) => `- **${t.name}** (${t.palette}): ${t.description}`).join('\n')}

## 🎨 Palettes 2025 Disponibles
${PALETTES_2025.map((p) => `- **${p.name}**: ${p.description} (${p.tags.slice(0, 3).join(', ')})`).join('\n')}

## 🧩 Composants Modernes (${MODERN_COMPONENTS.length} composants)
${formatComponentsForPrompt()}

## ✨ Animations Disponibles
${formatAnimationsForPrompt()}

## 🛠️ Utilisation des Outils
1. **\`get_design_template\`** - Obtenir un template complet (PRIORITÉ HAUTE pour nouveaux sites)
2. \`get_palette_2025\` - Obtenir une palette adaptée au projet
3. \`get_modern_components\` - Trouver des composants prêts à l'emploi
4. \`generate_design_inspiration\` - Générer un brief de design complet

## ⚡ IMPORTANT: Utilisation Automatique des Templates
Quand l'utilisateur demande de créer un site/page, utilise TOUJOURS \`get_design_template\` d'abord:
- "crée-moi un site e-commerce" → template EcommerceModern
- "je veux un dashboard" → template DashboardModern
- "fais-moi une landing page" → template LandingModern
- "un portfolio" → template PortfolioModern
- "une page de tarifs" → template PricingModern
- "un blog" → template BlogModern
- "une page d'authentification" → template AuthModern
- "une page 404" → template ErrorModern

## 🎯 FORMULAIRES - ÉLÉMENTS HTML NATIFS (OBLIGATOIRE)
Pour tout projet React ou Next.js, utiliser des éléments HTML natifs :
- **Formulaires**: \`<button>\`, \`<input>\`, \`<label>\`, \`<textarea>\`, \`<select>\`, \`<input type="checkbox">\`
- **Conteneurs**: \`<div>\` avec classes Tailwind (rounded-xl, shadow-lg, p-6)
- **Feedback**: Classes Tailwind pour alertes et badges
- **Navigation**: \`<nav>\`, \`<ul>\`, \`<a>\` avec Tailwind

**IMPORTANT**: NE PAS utiliser Shadcn UI, Radix UI ou autres bibliothèques de composants complexes.
Le mode preview browser de BAVINI ne supporte pas ces composants pour le clavier.

## ✅ Best Practices
- Toujours utiliser des animations subtiles (pas trop flashy)
- Préférer les effets de hover pour l'interactivité
- Utiliser les gradients avec parcimonie
- Assurer le contraste WCAG AA minimum
- Supporter le dark mode
- **PRIORITÉ**: Utiliser des éléments HTML natifs avec Tailwind CSS pour tous les formulaires
`;
}
