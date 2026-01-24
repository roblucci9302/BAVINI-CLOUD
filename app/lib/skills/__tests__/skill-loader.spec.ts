/**
 * Skill Loader - Unit Tests
 *
 * Tests for the skill loading and parsing functionality.
 *
 * @module skills/__tests__/skill-loader.spec
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadFrontendDesignSkill,
  getFallbackSkill,
  formatSkillContent,
  clearSkillCache,
  getSkillCacheStats,
  isSkillAvailable,
  type ParsedSkill,
} from '../skill-loader';

describe('SkillLoader', () => {
  beforeEach(() => {
    clearSkillCache();
  });

  describe('loadFrontendDesignSkill', () => {
    it('should load the actual SKILL.md file', () => {
      const skill = loadFrontendDesignSkill();

      expect(skill.metadata.name).toBe('frontend-design');
      expect(skill.metadata.description).toContain('distinctive');
      expect(skill.content).toContain('Design Thinking');
    });

    it('should cache the result', () => {
      const skill1 = loadFrontendDesignSkill();
      const skill2 = loadFrontendDesignSkill();

      // Same object reference due to caching
      expect(skill1).toBe(skill2);
    });

    it('should reload when forceReload is true', () => {
      const skill1 = loadFrontendDesignSkill();
      const skill2 = loadFrontendDesignSkill({ forceReload: true });

      // Different objects due to force reload
      expect(skill1).not.toBe(skill2);
      // But same content
      expect(skill1.content).toBe(skill2.content);
    });

    it('should include loadedAt timestamp', () => {
      const before = Date.now();
      const skill = loadFrontendDesignSkill({ forceReload: true });
      const after = Date.now();

      expect(skill.loadedAt).toBeGreaterThanOrEqual(before);
      expect(skill.loadedAt).toBeLessThanOrEqual(after);
    });

    it('should parse frontmatter correctly', () => {
      const skill = loadFrontendDesignSkill();

      expect(skill.metadata.name).toBe('frontend-design');
      expect(typeof skill.metadata.description).toBe('string');
    });

    it('should separate content from frontmatter', () => {
      const skill = loadFrontendDesignSkill();

      // Content should not contain frontmatter metadata (but may contain --- as HR)
      expect(skill.content).not.toContain('name: frontend-design');
      expect(skill.content).not.toContain('description:');
      // Content should start with actual skill content, not frontmatter
      expect(skill.content).not.toMatch(/^---\s*\n\s*name:/);
    });
  });

  describe('getFallbackSkill', () => {
    it('should return valid skill structure', () => {
      const skill = getFallbackSkill();

      expect(skill.metadata.name).toBe('frontend-design');
      expect(skill.metadata.description).toBeDefined();
      expect(skill.content.length).toBeGreaterThan(100);
      expect(skill.rawContent).toBe('');
      expect(skill.loadedAt).toBeGreaterThan(0);
    });

    it('should contain essential design sections', () => {
      const skill = getFallbackSkill();

      expect(skill.content).toContain('Design Thinking');
      expect(skill.content).toContain('Purpose');
      expect(skill.content).toContain('Tone');
      expect(skill.content).toContain('Typography');
      expect(skill.content).toContain('Color');
      expect(skill.content).toContain('Motion');
      expect(skill.content).toContain('NEVER');
    });

    it('should always return a new object', () => {
      const skill1 = getFallbackSkill();
      const skill2 = getFallbackSkill();

      expect(skill1).not.toBe(skill2);
    });
  });

  describe('formatSkillContent', () => {
    const mockSkill: ParsedSkill = {
      metadata: { name: 'test', description: 'test' },
      content: `## Design Thinking

Before coding, commit to a BOLD direction.

## Frontend Aesthetics Guidelines

Focus on typography and color.

## Other Section

Some other content.`,
      rawContent: '',
      loadedAt: Date.now(),
    };

    it('should return null for minimal level', () => {
      const result = formatSkillContent(mockSkill, 'minimal');

      expect(result).toBeNull();
    });

    it('should return formatted content for standard level', () => {
      const result = formatSkillContent(mockSkill, 'standard');

      expect(result).not.toBeNull();
      expect(result).toContain('Design Thinking');
      expect(result).toContain('Frontend Aesthetics Guidelines');
      expect(result).toContain('CRITICAL');
    });

    it('should extract sections correctly for standard level', () => {
      const result = formatSkillContent(mockSkill, 'standard');

      expect(result).toContain('BOLD direction');
      expect(result).toContain('typography and color');
    });

    it('should return full content for full level', () => {
      const result = formatSkillContent(mockSkill, 'full');

      expect(result).not.toBeNull();
      expect(result).toContain('Design Thinking');
      expect(result).toContain('Frontend Aesthetics Guidelines');
      expect(result).toContain('Other Section');
      expect(result).toContain('DESIGN GUIDELINES FULLY ACTIVE');
    });

    it('should include warnings in full level', () => {
      const result = formatSkillContent(mockSkill, 'full');

      expect(result).toContain('NEVER use generic fonts');
      expect(result).toContain('NEVER use default Tailwind colors');
    });

    it('should handle skill with missing sections gracefully', () => {
      const incompleteSkill: ParsedSkill = {
        metadata: { name: 'test', description: 'test' },
        content: 'Just some content without sections',
        rawContent: '',
        loadedAt: Date.now(),
      };

      const result = formatSkillContent(incompleteSkill, 'standard');

      expect(result).not.toBeNull();
      expect(result).toContain('CRITICAL');
    });
  });

  describe('clearSkillCache', () => {
    it('should clear the cache', () => {
      loadFrontendDesignSkill();
      expect(getSkillCacheStats().size).toBe(1);

      clearSkillCache();
      expect(getSkillCacheStats().size).toBe(0);
    });
  });

  describe('getSkillCacheStats', () => {
    it('should return empty stats initially', () => {
      const stats = getSkillCacheStats();

      expect(stats.size).toBe(0);
      expect(stats.skills).toEqual([]);
    });

    it('should return correct stats after loading', () => {
      loadFrontendDesignSkill();

      const stats = getSkillCacheStats();

      expect(stats.size).toBe(1);
      expect(stats.skills).toContain('frontend-design');
    });
  });

  describe('isSkillAvailable', () => {
    it('should return true for frontend-design skill', () => {
      // The skill file exists in the repo
      expect(isSkillAvailable('frontend-design')).toBe(true);
    });

    it('should return true when skill is cached', () => {
      loadFrontendDesignSkill();

      // Should return true because it's cached
      expect(isSkillAvailable('frontend-design')).toBe(true);
    });

    it('should default to frontend-design', () => {
      expect(isSkillAvailable()).toBe(true);
    });
  });

  describe('Real SKILL.md content', () => {
    it('should contain essential Anthropic plugin content', () => {
      const skill = loadFrontendDesignSkill();

      // Check for key content from the official plugin
      expect(skill.content).toContain('Design Thinking');
      expect(skill.content).toContain('Frontend Aesthetics Guidelines');
      expect(skill.content).toContain('Typography');
      expect(skill.content).toContain('Color');
      expect(skill.content).toContain('Motion');
    });

    it('should warn against generic aesthetics', () => {
      const skill = loadFrontendDesignSkill();

      expect(skill.content).toContain('NEVER');
      expect(skill.content.toLowerCase()).toContain('generic');
    });

    it('should encourage distinctive design', () => {
      const skill = loadFrontendDesignSkill();

      expect(skill.content.toLowerCase()).toContain('distinctive');
    });
  });
});
