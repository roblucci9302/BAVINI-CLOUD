/**
 * Tests pour le service de templates
 */

import { describe, it, expect, beforeAll } from 'vitest';
import {
  PROJECT_TEMPLATES,
  getTemplateById,
  getMainTemplates,
  getAdditionalTemplates,
  getFullStackTemplates,
  getTemplatesByTag,
  hasTemplateFiles,
  type ProjectTemplate,
} from '../templates';

describe('Templates Service', () => {
  describe('PROJECT_TEMPLATES', () => {
    it('devrait contenir au moins 5 templates', () => {
      expect(PROJECT_TEMPLATES.length).toBeGreaterThanOrEqual(5);
    });

    it('chaque template devrait avoir les propriétés requises', () => {
      PROJECT_TEMPLATES.forEach((template) => {
        expect(template.id).toBeDefined();
        expect(template.name).toBeDefined();
        expect(template.description).toBeDefined();
        expect(template.icon).toBeDefined();
        expect(template.color).toBeDefined();
        expect(template.prompt).toBeDefined();
      });
    });

    it('les IDs de templates devraient être uniques', () => {
      const ids = PROJECT_TEMPLATES.map((t) => t.id);
      const uniqueIds = [...new Set(ids)];
      expect(ids.length).toBe(uniqueIds.length);
    });
  });

  describe('getTemplateById', () => {
    it("devrait retourner le template correspondant à l'ID", () => {
      const template = getTemplateById('react-vite-ts');
      expect(template).toBeDefined();
      expect(template?.name).toBe('React');
    });

    it('devrait retourner undefined pour un ID inexistant', () => {
      const template = getTemplateById('non-existent');
      expect(template).toBeUndefined();
    });

    it('devrait trouver le template Supabase Full-Stack', () => {
      const template = getTemplateById('supabase-fullstack');
      expect(template).toBeDefined();
      expect(template?.name).toBe('Supabase Full-Stack');
      expect(template?.isFullStack).toBe(true);
    });
  });

  describe('getMainTemplates', () => {
    it('devrait retourner les 4 premiers templates', () => {
      const mainTemplates = getMainTemplates();
      expect(mainTemplates.length).toBe(4);
      expect(mainTemplates[0].id).toBe('react-vite-ts');
    });
  });

  describe('getAdditionalTemplates', () => {
    it('devrait retourner les templates après les 4 premiers', () => {
      const additional = getAdditionalTemplates();
      expect(additional.length).toBe(PROJECT_TEMPLATES.length - 4);
    });

    it('devrait inclure le template Supabase Full-Stack', () => {
      const additional = getAdditionalTemplates();
      const supabase = additional.find((t) => t.id === 'supabase-fullstack');
      expect(supabase).toBeDefined();
    });
  });

  describe('getFullStackTemplates', () => {
    it('devrait retourner uniquement les templates full-stack', () => {
      const fullStack = getFullStackTemplates();
      expect(fullStack.length).toBeGreaterThan(0);
      fullStack.forEach((template) => {
        expect(template.isFullStack).toBe(true);
      });
    });

    it('devrait inclure Supabase Full-Stack', () => {
      const fullStack = getFullStackTemplates();
      const supabase = fullStack.find((t) => t.id === 'supabase-fullstack');
      expect(supabase).toBeDefined();
    });
  });

  describe('getTemplatesByTag', () => {
    it('devrait filtrer par tag "fullstack"', () => {
      const templates = getTemplatesByTag('fullstack');
      expect(templates.length).toBeGreaterThan(0);
      templates.forEach((template) => {
        expect(template.tags).toContain('fullstack');
      });
    });

    it('devrait filtrer par tag "supabase"', () => {
      const templates = getTemplatesByTag('supabase');
      expect(templates.length).toBeGreaterThan(0);

      const supabase = templates.find((t) => t.id === 'supabase-fullstack');
      expect(supabase).toBeDefined();
    });

    it('devrait retourner un tableau vide pour un tag inexistant', () => {
      const templates = getTemplatesByTag('non-existent-tag');
      expect(templates).toEqual([]);
    });
  });

  describe('hasTemplateFiles', () => {
    it('devrait retourner true pour les templates avec templateDir', () => {
      const supabase = getTemplateById('supabase-fullstack');
      expect(supabase).toBeDefined();

      if (supabase) {
        expect(hasTemplateFiles(supabase)).toBe(true);
      }
    });

    it('devrait retourner true pour react-vite-ts avec templateDir', () => {
      const react = getTemplateById('react-vite-ts');
      expect(react).toBeDefined();

      if (react) {
        expect(hasTemplateFiles(react)).toBe(true);
      }
    });
  });

  describe('Template Supabase Full-Stack', () => {
    let supabaseTemplate: ProjectTemplate | undefined;

    beforeAll(() => {
      supabaseTemplate = getTemplateById('supabase-fullstack');
    });

    it('devrait exister', () => {
      expect(supabaseTemplate).toBeDefined();
    });

    it('devrait avoir le bon nom', () => {
      expect(supabaseTemplate?.name).toBe('Supabase Full-Stack');
    });

    it('devrait être marqué comme full-stack', () => {
      expect(supabaseTemplate?.isFullStack).toBe(true);
    });

    it('devrait avoir un templateDir défini', () => {
      expect(supabaseTemplate?.templateDir).toBe('supabase-fullstack');
    });

    it('devrait avoir les tags appropriés', () => {
      expect(supabaseTemplate?.tags).toContain('fullstack');
      expect(supabaseTemplate?.tags).toContain('auth');
      expect(supabaseTemplate?.tags).toContain('database');
      expect(supabaseTemplate?.tags).toContain('supabase');
    });

    it('devrait avoir un prompt détaillé', () => {
      expect(supabaseTemplate?.prompt).toContain('Supabase');
      expect(supabaseTemplate?.prompt).toContain('Authentification');
      expect(supabaseTemplate?.prompt).toContain('RLS');
    });

    it('devrait avoir une couleur emerald', () => {
      expect(supabaseTemplate?.color).toContain('emerald');
    });
  });
});
