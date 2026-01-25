/**
 * =============================================================================
 * BAVINI CLOUD - Design Tools Module
 * =============================================================================
 * Barrel export for design tools submodules.
 *
 * @module lib/agents/tools/design-tools
 * =============================================================================
 */

// Types
export type { DesignBrief, DesignPattern, ColorMood } from './types';

// Patterns
export { DESIGN_PATTERNS, COLOR_MOODS, detectPattern } from './patterns';

// Brief generator
export { createDesignBrief, formatBriefAsText, generateDarkModeColors } from './brief-generator';

// Config generators
export { generateCSSVariables, generateTailwindConfig } from './config-generators';

// Template recommender
export { recommendTemplate, getAvailableTemplateNames, getTemplateMetadata } from './template-recommender';
