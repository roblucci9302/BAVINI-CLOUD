/**
 * Design Guidelines Prompt Injection for Multi-Agent System
 *
 * Provides design guidelines injection for the coder agent and orchestrator.
 * Uses the official Anthropic frontend-design plugin.
 *
 * @module agents/prompts/design-guidelines-prompt
 */

import { loadFrontendDesignSkill, formatSkillContent, type GuidelinesLevel } from '~/lib/skills';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('DesignGuidelinesPrompt');

/*
 * =============================================================================
 * TYPES
 * =============================================================================
 */

export interface DesignGuidelinesConfig {
  /** Enable design guidelines injection */
  enabled: boolean;
  /** Guidelines detail level */
  level: GuidelinesLevel;
}

/*
 * =============================================================================
 * DEFAULT CONFIG
 * =============================================================================
 */

export const DEFAULT_DESIGN_CONFIG: DesignGuidelinesConfig = {
  enabled: true,
  level: 'standard',
};

/*
 * =============================================================================
 * DESIGN GUIDELINES SECTION
 * =============================================================================
 */

/**
 * Senior Designer Persona - Ensures professional-grade design output
 */
const SENIOR_DESIGNER_PERSONA = `
## 🎨 PERSONA: SENIOR UI/UX DESIGNER (OBLIGATOIRE)

**Tu incarnes un Senior UI/UX Designer avec 15+ années d'expérience** dans les plus grandes agences mondiales (IDEO, Pentagram, Huge, Fantasy, ustwo).

### 🏆 STANDARDS PROFESSIONNELS NON-NÉGOCIABLES

#### 1. Palette de Couleurs SOPHISTIQUÉE

**❌ INTERDITS (Amateur/Canva-like):**
- Dégradés pastel (rose→pêche, violet→rose, bleu bébé→lavande)
- Couleurs criardes ou saturées à 100%
- Combinaisons "template gratuit" (orange vif + violet, rose + turquoise)
- Fonds colorés unis sans nuance
- Dégradés arc-en-ciel ou multicolores

**✅ OBLIGATOIRES (Niveau Dribbble/Awwwards):**
- Palettes monochromatiques avec accents stratégiques
- Dégradés subtils (même teinte, variation de luminosité)
- Couleurs désaturées et sophistiquées (slate, zinc, stone, neutral)
- Noir profond (#0a0a0a, #09090b) plutôt que #000000
- Blanc cassé (#fafafa, #f8fafc) plutôt que #ffffff pur
- Accents de couleur utilisés avec parcimonie (max 10% de la surface)

**Palettes Professionnelles Recommandées:**
| Style | Fond | Texte | Accent |
|-------|------|-------|--------|
| Dark Premium | slate-950 | slate-100 | amber-500 |
| Light Minimal | zinc-50 | zinc-900 | blue-600 |
| Corporate | white | slate-800 | indigo-600 |
| Luxe | neutral-950 | neutral-100 | gold/amber |
| Tech Modern | slate-900 | slate-50 | cyan-400 |

#### 2. Typographie EXPERTE

**❌ INTERDITS:**
- Inter, Roboto, Arial, Helvetica (trop génériques)
- Une seule font pour tout
- Tailles de texte incohérentes

**✅ OBLIGATOIRES:**
- **Display fonts**: DM Sans, Plus Jakarta Sans, Outfit, Manrope, Satoshi, Cabinet Grotesk
- **Body fonts**: IBM Plex Sans, Source Sans 3, Nunito Sans
- **Système de tailles**: xs(12), sm(14), base(16), lg(18), xl(20), 2xl(24), 3xl(30), 4xl(36), 5xl(48)
- **Line-height**: Titre (1.1-1.2), Body (1.5-1.7)
- **Letter-spacing**: Titres (-0.02em), Body (0), Small caps (+0.05em)

#### 3. Questions de VALIDATION (À se poser AVANT chaque design)

1. "Un directeur artistique de Stripe/Linear/Vercel approuverait-il ce design?"
2. "Cette palette serait-elle featured sur Dribbble avec 5000+ likes?"
3. "Ce design pourrait-il apparaître sur Awwwards Site of the Day?"
4. "Est-ce SOPHISTIQUÉ ou AMATEUR?"
5. "Y a-t-il une hiérarchie visuelle CLAIRE?"

**Si la réponse est NON à une seule question → REFAIRE les choix de design.**

#### 4. Composition et Spacing

- Système de spacing en multiples de 4px
- Padding généreux (min py-16 pour les sections)
- Max-width pour le contenu texte (max-w-2xl pour lisibilité)
- Zones de respiration intentionnelles
- Alignement parfait sur une grille invisible

---
`;

/**
 * Generates the design guidelines section for agent prompts
 */
export function getDesignGuidelinesSection(config: DesignGuidelinesConfig = DEFAULT_DESIGN_CONFIG): string {
  if (!config.enabled || config.level === 'minimal') {
    return '';
  }

  try {
    const skill = loadFrontendDesignSkill();
    const formattedContent = formatSkillContent(skill, config.level);

    if (!formattedContent) {
      return '';
    }

    logger.debug(`Generating design guidelines section (level: ${config.level})`);

    return `
${SENIOR_DESIGNER_PERSONA}

## 🎨 FRONTEND DESIGN GUIDELINES (Plugin Anthropic Officiel)

${formattedContent}

### Application des Guidelines

Ces guidelines DOIVENT être appliquées pour TOUTE création de code frontend/UI.
- **Priorité design**: La qualité esthétique est aussi importante que la fonctionnalité
- **Pas de générique**: Éviter les patterns AI clichés (Inter, purple gradients, etc.)
- **Distinctif**: Chaque projet doit avoir une identité visuelle unique
- **Niveau Professionnel**: Chaque design doit atteindre le niveau Dribbble/Awwwards

---
`;
  } catch (error) {
    logger.error('Failed to generate design guidelines section:', error);
    return '';
  }
}

/*
 * =============================================================================
 * CODER AGENT HELPERS
 * =============================================================================
 */

/**
 * Context to pass to coder agent for design-aware tasks
 */
export function getCoderDesignContext(config: DesignGuidelinesConfig = DEFAULT_DESIGN_CONFIG): string {
  if (!config.enabled || config.level === 'minimal') {
    return '';
  }

  return `
[DESIGN CONTEXT]
Les guidelines de design Anthropic sont ACTIVES (niveau: ${config.level}).
- Applique les principes de Design Thinking avant de coder
- Évite les esthétiques AI génériques
- Crée des designs distinctifs et mémorables
- Utilise des typographies uniques (pas Inter/Roboto/Arial)
- Crée des palettes de couleurs audacieuses
`;
}

/**
 * Checks if a task is UI-related based on keywords
 */
export function isUIRelatedTask(task: string): boolean {
  const UI_KEYWORDS = [
    // English
    'component', 'page', 'ui', 'interface', 'layout', 'design',
    'frontend', 'website', 'webapp', 'dashboard', 'landing',
    'form', 'button', 'card', 'modal', 'header', 'footer',
    'navigation', 'sidebar', 'menu', 'hero', 'portfolio',
    'e-commerce', 'ecommerce', 'shop', 'store', 'blog',
    'tailwind', 'css', 'style', 'theme', 'responsive',
    // French
    'composant', 'formulaire', 'bouton', 'carte', 'en-tête',
    'pied de page', 'barre latérale', 'boutique', 'vitrine',
    'site web', 'page web', 'tableau de bord',
  ];

  const lowerTask = task.toLowerCase();
  return UI_KEYWORDS.some(keyword => lowerTask.includes(keyword));
}

/*
 * =============================================================================
 * ORCHESTRATOR HELPERS
 * =============================================================================
 */

/**
 * Gets orchestrator instructions for design-aware task delegation
 */
export function getOrchestratorDesignInstructions(config: DesignGuidelinesConfig = DEFAULT_DESIGN_CONFIG): string {
  if (!config.enabled) {
    return '';
  }

  return `
## 🎨 DESIGN GUIDELINES SYSTEM

Un système de design guidelines est ACTIF (niveau: ${config.level}).

### Quand déléguer au coder pour des tâches UI:
1. **Inclure le contexte design** dans la tâche déléguée
2. **Rappeler les guidelines** pour les créations visuelles
3. **Vérifier la qualité** esthétique des résultats

### Instructions pour tâches UI:
Quand tu délègues une tâche UI au coder, ajoute dans le contexte:
\`\`\`
[DESIGN GUIDELINES ACTIVES]
- Appliquer Design Thinking avant de coder
- Éviter les esthétiques AI génériques (Inter, purple gradients)
- Créer des designs distinctifs et mémorables
- Prioriser: typographie unique, couleurs audacieuses, animations subtiles
\`\`\`

### Détection automatique:
Une tâche est considérée "UI" si elle contient des mots-clés comme:
component, page, dashboard, landing, form, button, card, e-commerce, etc.
`;
}

/*
 * =============================================================================
 * EXPORTS
 * =============================================================================
 */

export {
  type GuidelinesLevel,
} from '~/lib/skills';
