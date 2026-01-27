/**
 * =============================================================================
 * BAVINI CLOUD - Design Tools
 * =============================================================================
 * Tools for generating design inspirations and guidelines for BAVINI agents.
 * Version 2.0 - Integration with 2025 palettes and modern components.
 *
 * @module lib/agents/tools/design-tools
 * =============================================================================
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

// Phase 1.2 Refactoring - Import from extracted modules
import type { DesignBrief } from './design-tools/types';
import { createDesignBrief, formatBriefAsText } from './design-tools/brief-generator';
import { generateCSSVariables, generateTailwindConfig } from './design-tools/config-generators';
import { recommendTemplate } from './design-tools/template-recommender';

// Re-export types and utilities for backwards compatibility
export type { DesignBrief, DesignPattern, ColorMood } from './design-tools/types';
export { DESIGN_PATTERNS, COLOR_MOODS, detectPattern } from './design-tools/patterns';
export { createDesignBrief, formatBriefAsText, generateDarkModeColors } from './design-tools/brief-generator';
export { generateCSSVariables, generateTailwindConfig } from './design-tools/config-generators';
export { recommendTemplate } from './design-tools/template-recommender';

/*
 * ============================================================================
 * TOOL DEFINITIONS
 * ============================================================================
 */

/**
 * Tool for generating design inspiration
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

/**
 * Tool for getting modern components
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
 * Tool for getting 2025 palettes
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
 * Tool for getting complete design templates
 */
export const GetDesignTemplateTool: ToolDefinition = {
  name: 'get_design_template',
  description: `Obtenir un template de page STRUCTUREL prêt à l'emploi.

⭐ UTILISE CET OUTIL UNIQUEMENT POUR CES 4 TYPES:
- "je veux un dashboard" → template DashboardModern
- "documentation", "docs", "api" → template DocsModern
- "une page d'authentification" → template AuthModern
- "une page 404" → template ErrorModern

⚠️ NE PAS UTILISER de template pour:
- Landing pages, sites vitrines, SaaS
- E-commerce, boutiques, portfolios
- Blogs, pages tarifs, agences
→ Pour ces projets CRÉATIFS, générer un design UNIQUE avec le skill frontend-design.

TEMPLATES STRUCTURELS (auto-liés):
1. DashboardModern (Midnight) - Dashboard/Admin panel
2. DocsModern (Midnight) - Documentation technique
3. AuthModern (Slate) - Login/Signup/Forgot password
4. ErrorModern (Neon) - 404/500/Maintenance

TEMPLATES MANUELS (accessibles sur demande explicite par nom):
- LandingModern, EcommerceModern, PortfolioModern
- BlogModern, PricingModern, AgencyModern

Chaque template inclut:
- Code React/TypeScript complet
- Tailwind CSS pour le styling
- Animations Framer Motion
- Composants responsive`,
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
        description: 'Cas d\'usage STRUCTUREL uniquement (ex: "dashboard", "documentation", "login", "404"). NE PAS utiliser pour landing/e-commerce/portfolio/blog.',
      },
      listAll: {
        type: 'boolean',
        description: 'Lister tous les templates disponibles sans code',
      },
    },
  },
};

/*
 * ============================================================================
 * TOOL HANDLERS
 * ============================================================================
 */

/**
 * Create handlers for design tools
 */
export function createDesignToolHandlers(): Record<
  string,
  (input: Record<string, unknown>) => Promise<ToolExecutionResult>
> {
  return {
    /**
     * Handler for generate_design_inspiration
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

/**
 * Create handlers for design tools V2 (with new 2025 tools)
 */
export function createDesignToolHandlersV2(): Record<
  string,
  (input: Record<string, unknown>) => Promise<ToolExecutionResult>
> {
  const baseHandlers = createDesignToolHandlers();

  return {
    ...baseHandlers,

    /**
     * Handler for get_modern_components
     */
    async get_modern_components(input: Record<string, unknown>): Promise<ToolExecutionResult> {
      try {
        const category = input.category as string | undefined;
        const search = input.search as string | undefined;

        let components: ComponentSnippet[] = [];

        if (category) {
          components = getComponentsByCategory(category as Parameters<typeof getComponentsByCategory>[0]);
        } else if (search) {
          components = searchComponents(search);
        } else {
          components = MODERN_COMPONENTS;
        }

        if (components.length === 0) {
          return {
            success: true,
            output: {
              message: 'Aucun composant trouvé pour cette recherche.',
              availableCategories: [
                'hero', 'cards', 'buttons', 'navigation', 'features',
                'testimonials', 'pricing', 'footer', 'effects', 'animations', 'forms',
              ],
              suggestion: 'Essaie avec une catégorie ou un mot-clé différent.',
            },
          };
        }

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
     * Handler for get_palette_2025
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

        return { success: true, output };
      } catch (error) {
        return {
          success: false,
          output: null,
          error: `Erreur: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },

    /**
     * Handler for get_design_template
     * Returns the FULL template code, not just metadata
     */
    async get_design_template(input: Record<string, unknown>): Promise<ToolExecutionResult> {
      try {
        const templateName = input.template as string | undefined;
        const useCase = input.useCase as string | undefined;
        const listAll = input.listAll as boolean | undefined;

        // List mode: return all available templates
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

        // Determine which template to use
        const selectedTemplate = templateName
          ? getTemplateByName(templateName)
          : useCase
            ? recommendTemplate(useCase)
            : null;

        if (!selectedTemplate && !templateName && !useCase) {
          return {
            success: false,
            output: null,
            error: 'Paramètre requis: "template" (nom du template), "useCase" (pour recommandation), ou "listAll" (pour lister).',
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

        // Read the actual template code from filesystem
        let templateCode = '';
        try {
          // Dynamic import for server-side only
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const fs = require('fs');
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const path = require('path');

          const templatePath = path.join(process.cwd(), 'app/lib/agents/design/templates', selectedTemplate.file);

          if (fs.existsSync(templatePath)) {
            templateCode = fs.readFileSync(templatePath, 'utf-8');
          }
        } catch (fsError) {
          // Fallback: if fs is not available (browser), return instructions instead
          console.warn('Could not read template file, returning metadata only:', fsError);
        }

        const templateInfo = {
          name: selectedTemplate.name,
          file: selectedTemplate.file,
          description: selectedTemplate.description,
          palette: selectedTemplate.palette,
          sections: selectedTemplate.sections,
          useCases: selectedTemplate.useCases,
        };

        // If we got the code, return it directly
        if (templateCode) {
          return {
            success: true,
            output: {
              template: templateInfo,
              code: templateCode,
              recommendation: useCase ? `Template recommandé pour "${useCase}": ${selectedTemplate.name}` : undefined,
              message: `Template "${selectedTemplate.name}" - Code complet inclus (${templateCode.split('\n').length} lignes)`,
              instructions: `
UTILISATION DU TEMPLATE:
1. Ce code est un template React/TypeScript complet avec Tailwind CSS
2. 'use client' est déjà inclus en première ligne (requis pour Next.js 13+)
3. Adapte les textes, images et couleurs selon le projet
4. Palette utilisée: ${selectedTemplate.palette}
5. Sections incluses: ${selectedTemplate.sections.join(', ')}

⚠️ IMPORTANT: Copie ce code et adapte-le au projet de l'utilisateur.
              `.trim(),
            },
          };
        }

        // Fallback without code (browser environment)
        return {
          success: true,
          output: {
            template: templateInfo,
            recommendation: useCase ? `Template recommandé pour "${useCase}": ${selectedTemplate.name}` : undefined,
            message: `Template "${selectedTemplate.name}" - ${selectedTemplate.description}`,
            note: 'Code non disponible dans cet environnement. Utilise read_file pour lire: app/lib/agents/design/templates/' + selectedTemplate.file,
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
 * EXPORTS
 * ============================================================================
 */

/**
 * All design tools (version 2.0)
 */
export const DESIGN_TOOLS: ToolDefinition[] = [
  GenerateDesignInspirationTool,
  GetModernComponentsTool,
  GetPalette2025Tool,
  GetDesignTemplateTool,
];

/**
 * Get design system summary for prompts
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
1. \`get_palette_2025\` - ⭐ TOUJOURS utiliser pour choisir les couleurs
2. \`generate_design_inspiration\` - Brief créatif pour projets créatifs
3. \`get_modern_components\` - Composants prêts à l'emploi
4. \`get_design_template\` - **UNIQUEMENT** pour dashboard/docs/auth/error

## ⚡ Templates STRUCTURELS uniquement
Utiliser \`get_design_template\` UNIQUEMENT pour ces 4 types:
- "dashboard", "admin", "backoffice" → DashboardModern
- "documentation", "docs", "api" → DocsModern
- "login", "signup", "authentification" → AuthModern
- "page 404", "erreur", "maintenance" → ErrorModern

## 🎨 Projets CRÉATIFS (PAS de template)
⚠️ Pour ces demandes, créer un design UNIQUE sans template:
- Landing pages, sites vitrines, SaaS
- E-commerce, boutiques, marketplaces
- Portfolios, agences, freelance
- Blogs, magazines, pricing pages

→ Utiliser \`generate_design_inspiration\` + \`get_palette_2025\` pour créer un design original

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
