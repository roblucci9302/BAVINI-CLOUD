/**
 * Skills Module
 *
 * Charge et gère les plugins Claude Code pour BAVINI.
 *
 * @module skills
 */

// Skill Loader
export {
  loadFrontendDesignSkill,
  getFallbackSkill,
  formatSkillContent,
  clearSkillCache,
  getSkillCacheStats,
  isSkillAvailable,
} from './skill-loader';

// Types
export type { SkillMetadata, ParsedSkill, SkillLoaderOptions, GuidelinesLevel } from './skill-loader';
