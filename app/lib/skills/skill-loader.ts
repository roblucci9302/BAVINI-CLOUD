/**
 * Skill Loader - Charge et parse les fichiers SKILL.md
 *
 * Charge le plugin frontend-design depuis .claude/skills/
 * et le rend disponible pour injection dans les prompts BAVINI.
 *
 * @module skills/skill-loader
 */

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('SkillLoader');

/*
 * =============================================================================
 * TYPES
 * =============================================================================
 */

export interface SkillMetadata {
  name: string;
  description: string;
  license?: string;
  'disable-model-invocation'?: boolean;
  'user-invocable'?: boolean;
  'allowed-tools'?: string[];
  model?: string;
  context?: 'fork' | 'main';
  agent?: string;
}

export interface ParsedSkill {
  metadata: SkillMetadata;
  content: string;
  rawContent: string;
  loadedAt: number;
}

export interface SkillLoaderOptions {
  /** Force reload even if cached */
  forceReload?: boolean;
  /** Use fallback if file not found */
  useFallback?: boolean;
}

/*
 * =============================================================================
 * CACHE
 * =============================================================================
 */

// Cache en mémoire avec TTL
const skillCache = new Map<string, ParsedSkill>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function getCachedSkill(skillName: string): ParsedSkill | null {
  const cached = skillCache.get(skillName);

  if (!cached) return null;

  // Vérifier TTL
  if (Date.now() - cached.loadedAt > CACHE_TTL_MS) {
    skillCache.delete(skillName);
    return null;
  }

  return cached;
}

function setCachedSkill(skillName: string, skill: ParsedSkill): void {
  skillCache.set(skillName, skill);
}

/*
 * =============================================================================
 * FRONTMATTER PARSER
 * =============================================================================
 */

interface ParsedFrontmatter {
  metadata: Record<string, unknown>;
  content: string;
}

/**
 * Parse simple YAML frontmatter without external dependencies
 * Supports basic key: value pairs (strings, booleans, arrays)
 */
function parseSimpleYaml(yamlContent: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = yamlContent.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) continue;

    const colonIndex = trimmed.indexOf(':');

    if (colonIndex === -1) continue;

    const key = trimmed.slice(0, colonIndex).trim();
    let value: unknown = trimmed.slice(colonIndex + 1).trim();

    // Remove quotes if present
    if (
      (typeof value === 'string' && value.startsWith('"') && value.endsWith('"')) ||
      (typeof value === 'string' && value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // Parse booleans
    if (value === 'true') value = true;
    else if (value === 'false') value = false;

    // Parse arrays (simple format: [item1, item2])
    if (typeof value === 'string' && value.startsWith('[') && value.endsWith(']')) {
      value = value
        .slice(1, -1)
        .split(',')
        .map((item) => item.trim().replace(/^['"]|['"]$/g, ''));
    }

    result[key] = value;
  }

  return result;
}

function parseFrontmatter(rawContent: string): ParsedFrontmatter {
  const FRONTMATTER_REGEX = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = rawContent.match(FRONTMATTER_REGEX);

  if (!match) {
    // Pas de frontmatter, tout est contenu
    return {
      metadata: {},
      content: rawContent.trim(),
    };
  }

  const [, yamlContent, markdownContent] = match;

  let metadata: Record<string, unknown> = {};

  try {
    metadata = parseSimpleYaml(yamlContent);
  } catch (error) {
    logger.warn('Failed to parse YAML frontmatter:', error);
  }

  return {
    metadata,
    content: markdownContent.trim(),
  };
}

/*
 * =============================================================================
 * SKILL LOADING (Server-side)
 * =============================================================================
 */

/**
 * Charge le skill frontend-design depuis le filesystem (server-side only)
 */
export function loadFrontendDesignSkill(options: SkillLoaderOptions = {}): ParsedSkill {
  const { forceReload = false, useFallback = true } = options;
  const skillName = 'frontend-design';

  // Check cache first
  if (!forceReload) {
    const cached = getCachedSkill(skillName);

    if (cached) {
      logger.debug('Using cached skill:', skillName);
      return cached;
    }
  }

  // Try to load from filesystem (server-side only)
  try {
    // Dynamic import for server-side only
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path');

    const skillPath = path.join(process.cwd(), '.claude/skills/frontend-design/SKILL.md');

    if (!fs.existsSync(skillPath)) {
      logger.warn('Skill file not found:', skillPath);

      if (useFallback) {
        return getFallbackSkill();
      }

      throw new Error(`Skill file not found: ${skillPath}`);
    }

    const rawContent = fs.readFileSync(skillPath, 'utf-8');
    const { metadata, content } = parseFrontmatter(rawContent);

    const skill: ParsedSkill = {
      metadata: {
        name: (metadata.name as string) || skillName,
        description: (metadata.description as string) || '',
        license: metadata.license as string | undefined,
        'disable-model-invocation': metadata['disable-model-invocation'] as boolean | undefined,
        'user-invocable': metadata['user-invocable'] as boolean | undefined,
        'allowed-tools': metadata['allowed-tools'] as string[] | undefined,
        model: metadata.model as string | undefined,
        context: metadata.context as 'fork' | 'main' | undefined,
        agent: metadata.agent as string | undefined,
      },
      content,
      rawContent,
      loadedAt: Date.now(),
    };

    setCachedSkill(skillName, skill);
    logger.info('Loaded skill:', skillName);

    return skill;
  } catch (error) {
    logger.error('Failed to load skill:', error);

    if (useFallback) {
      return getFallbackSkill();
    }

    throw error;
  }
}

/*
 * =============================================================================
 * FALLBACK SKILL
 * =============================================================================
 */

/**
 * Retourne un skill de fallback si le fichier SKILL.md n'est pas disponible
 */
export function getFallbackSkill(): ParsedSkill {
  return {
    metadata: {
      name: 'frontend-design',
      description:
        'Create distinctive, production-grade frontend interfaces with high design quality. Generates creative, polished code that avoids generic AI aesthetics.',
    },
    content: FALLBACK_DESIGN_GUIDELINES,
    rawContent: '',
    loadedAt: Date.now(),
  };
}

/**
 * Guidelines de fallback (version compacte du plugin officiel)
 */
const FALLBACK_DESIGN_GUIDELINES = `
## Design Thinking

Before coding, understand the context and commit to a BOLD aesthetic direction:
- **Purpose**: What problem does this interface solve? Who uses it?
- **Tone**: Pick an extreme: brutally minimal, maximalist chaos, retro-futuristic, organic/natural, luxury/refined, playful/toy-like, editorial/magazine, brutalist/raw, art deco/geometric, soft/pastel, industrial/utilitarian.
- **Constraints**: Technical requirements (framework, performance, accessibility).
- **Differentiation**: What makes this UNFORGETTABLE? What's the one thing someone will remember?

**CRITICAL**: Choose a clear conceptual direction and execute it with precision. Bold maximalism and refined minimalism both work - the key is intentionality, not intensity.

## Frontend Aesthetics Guidelines

Focus on:
- **Typography**: Choose fonts that are beautiful, unique, and interesting. Avoid generic fonts like Arial and Inter; opt instead for distinctive choices that elevate the frontend's aesthetics. Pair a distinctive display font with a refined body font.
- **Color & Theme**: Commit to a cohesive aesthetic. Use CSS variables for consistency. Dominant colors with sharp accents outperform timid, evenly-distributed palettes.
- **Motion**: Use animations for effects and micro-interactions. Focus on high-impact moments: one well-orchestrated page load with staggered reveals creates more delight than scattered micro-interactions. Use scroll-triggering and hover states that surprise.
- **Spatial Composition**: Unexpected layouts. Asymmetry. Overlap. Diagonal flow. Grid-breaking elements. Generous negative space OR controlled density.
- **Backgrounds & Visual Details**: Create atmosphere and depth rather than defaulting to solid colors. Add contextual effects and textures that match the overall aesthetic.

NEVER use generic AI-generated aesthetics like overused font families (Inter, Roboto, Arial, system fonts), cliched color schemes (particularly purple gradients on white backgrounds), predictable layouts and component patterns, and cookie-cutter design that lacks context-specific character.

No design should be the same. Vary between light and dark themes, different fonts, different aesthetics. NEVER converge on common choices across generations.

**IMPORTANT**: Match implementation complexity to the aesthetic vision. Maximalist designs need elaborate code with extensive animations and effects. Minimalist or refined designs need restraint, precision, and careful attention to spacing, typography, and subtle details.
`.trim();

/*
 * =============================================================================
 * SKILL CONTENT FORMATTERS
 * =============================================================================
 */

export type GuidelinesLevel = 'minimal' | 'standard' | 'full';

/**
 * Formate les guidelines selon le niveau demandé
 */
export function formatSkillContent(skill: ParsedSkill, level: GuidelinesLevel): string | null {
  if (level === 'minimal') {
    return null;
  }

  if (level === 'standard') {
    return formatStandardGuidelines(skill.content);
  }

  // level === 'full'
  return formatFullGuidelines(skill.content);
}

/**
 * Version standard : sections essentielles + accessibilité (~1000 tokens)
 */
function formatStandardGuidelines(content: string): string {
  const designThinking = extractSection(content, 'Design Thinking');
  const aesthetics = extractSection(content, 'Frontend Aesthetics Guidelines');
  const accessibility = extractSection(content, 'Accessibilité');
  const focusStates = extractSection(content, 'Focus States');
  const fontPairings = extractSectionSummary(content, 'Font Pairings Recommandés');

  return `
## Frontend Design Guidelines (Active)

${designThinking}

${aesthetics}

${fontPairings}

### Accessibilité Critique

${accessibility ? getAccessibilitySummary(accessibility) : '- Tous les inputs doivent avoir un label ou aria-label\n- Les boutons icône doivent avoir aria-label\n- Les éléments interactifs doivent être accessibles au clavier'}

### Focus States (Obligatoire)

${focusStates ? getFocusSummary(focusStates) : '- Tous les éléments interactifs doivent avoir un focus visible\n- Utiliser focus-visible:ring-2 pour les boutons\n- Ne jamais utiliser outline-none sans remplacement'}

---
CRITICAL: Apply these guidelines to ALL frontend code. Avoid generic AI aesthetics.
`.trim();
}

/**
 * Extrait un résumé court d'une section (pour le niveau standard)
 */
function extractSectionSummary(content: string, sectionName: string): string {
  const section = extractSection(content, sectionName);

  if (!section) return '';

  // Pour Font Pairings, extraire juste les tables de pairings recommandés
  if (sectionName.includes('Font')) {
    const lines = section.split('\n');
    const summaryLines: string[] = ['### Fonts Distinctives Recommandées', ''];

    // Extract key pairings
    summaryLines.push('**Tech/Startup**: Space Grotesk + Plus Jakarta Sans');
    summaryLines.push('**Luxury**: Bodoni Moda + Lato, Playfair Display + Source Sans');
    summaryLines.push('**Editorial**: Instrument Serif + Instrument Sans, Newsreader + Work Sans');
    summaryLines.push('**Friendly**: Lexend, Nunito, Albert Sans');
    summaryLines.push('');
    summaryLines.push('**À éviter**: Inter, Roboto, Open Sans, Arial (trop génériques)');

    return summaryLines.join('\n');
  }

  return section;
}

/**
 * Extrait un résumé de l'accessibilité
 */
function getAccessibilitySummary(fullSection: string): string {
  return `- Tous les \`<input>\` doivent avoir un \`<label>\` associé ou \`aria-label\`
- Les boutons avec icône seule doivent avoir \`aria-label="description"\`
- Les éléments interactifs custom doivent avoir \`role\`, \`tabIndex\`, \`onKeyDown\`
- Utiliser les éléments HTML natifs (\`<button>\`, \`<a>\`) plutôt que \`<div onClick>\`
- Hiérarchie des titres: un seul \`<h1>\` par page, puis h2 > h3 > h4`;
}

/**
 * Extrait un résumé des focus states
 */
function getFocusSummary(fullSection: string): string {
  return `- Pattern boutons: \`focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2\`
- Pattern inputs: \`focus:ring-2 focus:ring-primary focus:border-transparent\`
- JAMAIS \`outline-none\` seul sans remplacement par \`ring\`
- Préférer \`focus-visible\` (clavier) sur boutons, \`focus\` sur inputs`;
}

/**
 * Version complète : tout le contenu (~7500 tokens)
 * Inclut: Design Thinking, Accessibilité, Focus, Mobile-First, Forms,
 * Animations, Dark Mode, Performance, Navigation, i18n, Font Pairings,
 * Typographie avancée, Anti-patterns, et Checklist finale
 */
function formatFullGuidelines(content: string): string {
  return `
## Frontend Design Guidelines (Plugin Anthropic - Full)

${content}

---
⚠️ DESIGN GUIDELINES FULLY ACTIVE: Apply ALL the above principles meticulously.
- NEVER use generic fonts (Inter, Roboto, Arial, system-ui)
- NEVER use default Tailwind colors (blue-500, indigo-600)
- ALWAYS create distinctive, memorable designs
- ALWAYS vary between projects - no two should look alike
`.trim();
}

/**
 * Extrait une section spécifique du contenu markdown
 */
function extractSection(content: string, sectionName: string): string {
  // Match from "## SectionName" to next "##" or end
  const regex = new RegExp(`## ${sectionName}[\\s\\S]*?(?=\\n## |$)`, 'i');
  const match = content.match(regex);

  if (!match) {
    return '';
  }

  return match[0].trim();
}

/*
 * =============================================================================
 * UTILITIES
 * =============================================================================
 */

/**
 * Vide le cache des skills
 */
export function clearSkillCache(): void {
  skillCache.clear();
  logger.debug('Skill cache cleared');
}

/**
 * Retourne les stats du cache
 */
export function getSkillCacheStats(): { size: number; skills: string[] } {
  return {
    size: skillCache.size,
    skills: Array.from(skillCache.keys()),
  };
}

/**
 * Vérifie si le skill est disponible (sans le charger complètement)
 */
export function isSkillAvailable(skillName: string = 'frontend-design'): boolean {
  // Check cache first
  if (skillCache.has(skillName)) {
    return true;
  }

  // Check filesystem
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path');

    const skillPath = path.join(process.cwd(), `.claude/skills/${skillName}/SKILL.md`);

    return fs.existsSync(skillPath);
  } catch {
    return false;
  }
}
