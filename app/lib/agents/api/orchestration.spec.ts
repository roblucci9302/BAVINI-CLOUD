/**
 * Tests for orchestration module
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { analyzeAndDecide } from './orchestration';

// Mock logger to avoid noise in tests
vi.mock('~/utils/logger', () => ({
  createScopedLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe('orchestration', () => {
  describe('analyzeAndDecide', () => {
    describe('Error detection (Priority 0)', () => {
      it('should delegate to fixer for "Error:" messages', async () => {
        const result = await analyzeAndDecide('Error: Something went wrong', '');

        expect(result.action).toBe('delegate');
        expect(result.targetAgent).toBe('fixer');
        expect(result.reasoning).toContain('Error message detected');
      });

      it('should delegate to fixer for "Cannot find module"', async () => {
        const result = await analyzeAndDecide(`Cannot find module 'lodash'`, '');

        expect(result.targetAgent).toBe('fixer');
        expect(result.reasoning).toContain('Missing module');
      });

      it('should delegate to fixer for "Module not found"', async () => {
        const result = await analyzeAndDecide('Module not found: react-router-dom', '');

        expect(result.targetAgent).toBe('fixer');
      });

      it('should delegate to fixer for "Failed to resolve/compile/build"', async () => {
        const messages = ['Failed to resolve import', 'Failed to compile module', 'Failed to build project'];

        for (const msg of messages) {
          const result = await analyzeAndDecide(msg, '');
          expect(result.targetAgent).toBe('fixer');
        }
      });

      it('should delegate to fixer for SyntaxError', async () => {
        const result = await analyzeAndDecide('SyntaxError: Unexpected token', '');

        expect(result.targetAgent).toBe('fixer');
      });

      it('should delegate to fixer for TypeError', async () => {
        const result = await analyzeAndDecide('TypeError: undefined is not a function', '');

        expect(result.targetAgent).toBe('fixer');
      });

      it('should delegate to fixer for ReferenceError', async () => {
        const result = await analyzeAndDecide('ReferenceError: x is not defined', '');

        expect(result.targetAgent).toBe('fixer');
      });

      it('should delegate to fixer for ENOENT', async () => {
        const result = await analyzeAndDecide('ENOENT: no such file or directory', '');

        expect(result.targetAgent).toBe('fixer');
      });

      it('should delegate to fixer for npm ERR!', async () => {
        const result = await analyzeAndDecide('npm ERR! code ENOENT', '');

        expect(result.targetAgent).toBe('fixer');
      });

      it('should delegate to fixer for Build failed', async () => {
        const result = await analyzeAndDecide('Build failed with 3 errors', '');

        expect(result.targetAgent).toBe('fixer');
      });

      it('should delegate to fixer for French error messages', async () => {
        const messages = [
          'la page est blanche',
          "rien ne s'affiche",
          'ne fonctionne pas',
          'ne marche pas',
          "j'ai une erreur",
        ];

        for (const msg of messages) {
          const result = await analyzeAndDecide(msg, '');
          expect(result.targetAgent).toBe('fixer');
        }
      });
    });

    describe('Fix requests (Priority 1)', () => {
      it('should delegate to fixer for "corrige"', async () => {
        const result = await analyzeAndDecide('corrige le bug dans le composant', '');

        expect(result.targetAgent).toBe('fixer');
        expect(result.reasoning).toContain('Fix/repair task detected');
      });

      it('should delegate to fixer for "fix"', async () => {
        const result = await analyzeAndDecide('fix the authentication issue', '');

        expect(result.targetAgent).toBe('fixer');
      });

      it('should delegate to fixer for "répare"', async () => {
        const result = await analyzeAndDecide('répare le formulaire', '');

        expect(result.targetAgent).toBe('fixer');
      });

      it('should delegate to fixer for "debug"', async () => {
        const result = await analyzeAndDecide('debug this function', '');

        expect(result.targetAgent).toBe('fixer');
      });
    });

    describe('Code creation (Priority 2)', () => {
      it('should delegate to coder for "crée"', async () => {
        const result = await analyzeAndDecide('crée un nouveau composant', '');

        expect(result.targetAgent).toBe('coder');
        expect(result.reasoning).toContain('Code creation');
      });

      it('should delegate to coder for "génère"', async () => {
        const result = await analyzeAndDecide('génère une API REST', '');

        expect(result.targetAgent).toBe('coder');
      });

      it('should delegate to coder for "développe"', async () => {
        const result = await analyzeAndDecide('développe une fonctionnalité', '');

        expect(result.targetAgent).toBe('coder');
      });

      it('should delegate to coder for "build"', async () => {
        const result = await analyzeAndDecide('build me a dashboard', '');

        expect(result.targetAgent).toBe('coder');
      });

      it('should delegate to coder for project types', async () => {
        const types = [
          'site web',
          'une page de contact',
          'une application mobile',
          'un composant React',
          'une boutique en ligne',
          'un dashboard',
          'un formulaire',
          'landing page',
          'portfolio',
          'blog',
          'un bouton',
          'un modal',
          'un header',
        ];

        for (const type of types) {
          const result = await analyzeAndDecide(`je veux ${type}`, '');
          expect(result.targetAgent).toBe('coder');
        }
      });

      it('should delegate to coder for "ajoute"', async () => {
        const result = await analyzeAndDecide('ajoute un bouton de suppression', '');

        expect(result.targetAgent).toBe('coder');
      });

      it('should delegate to coder for "modifie"', async () => {
        const result = await analyzeAndDecide('modifie le style du header', '');

        expect(result.targetAgent).toBe('coder');
      });
    });

    describe('Build operations (Priority 3)', () => {
      it('should delegate to builder for "install" at start', async () => {
        // Starts with "install" - matches isBuild pattern
        const result = await analyzeAndDecide('install dependencies', '');

        expect(result.targetAgent).toBe('builder');
        expect(result.reasoning).toContain('Build/npm task');
      });

      it('should delegate to builder for "npm" at start', async () => {
        const result = await analyzeAndDecide('npm install lodash', '');

        expect(result.targetAgent).toBe('builder');
      });

      it('should delegate to builder for "yarn" at start', async () => {
        const result = await analyzeAndDecide('yarn add react-query', '');

        expect(result.targetAgent).toBe('builder');
      });

      it('should delegate to builder for "pnpm" at start', async () => {
        const result = await analyzeAndDecide('pnpm install', '');

        expect(result.targetAgent).toBe('builder');
      });

      it('should prioritize code creation over build for "build" with project type', async () => {
        // "build" is also a creation verb - code creation (priority 2) wins
        const result = await analyzeAndDecide('build the project', '');

        // Code creation has higher priority
        expect(result.targetAgent).toBe('coder');
      });

      it('should delegate to builder for "run" at start', async () => {
        const result = await analyzeAndDecide('run dev', '');

        expect(result.targetAgent).toBe('builder');
      });

      it('should delegate to builder for "start" at start', async () => {
        const result = await analyzeAndDecide('start server', '');

        expect(result.targetAgent).toBe('builder');
      });

      it('should delegate to builder for "démarre" at start', async () => {
        const result = await analyzeAndDecide('démarre', '');

        expect(result.targetAgent).toBe('builder');
      });

      it('should delegate to builder for "lance" at start', async () => {
        // "lance" at start triggers builder
        const result = await analyzeAndDecide('lance', '');

        expect(result.targetAgent).toBe('builder');
      });
    });

    describe('Test operations (Priority 3)', () => {
      it('should prioritize code creation when component type is mentioned', async () => {
        // "component" is a project type - code creation (priority 2) wins
        const result = await analyzeAndDecide('test the component', '');

        // Code creation has higher priority over test
        expect(result.targetAgent).toBe('coder');
      });

      it('should delegate to tester for "test" at start without project types', async () => {
        // Pure test command at start
        const result = await analyzeAndDecide('test all', '');

        expect(result.targetAgent).toBe('tester');
        expect(result.reasoning).toContain('Test task');
      });

      it('should delegate to tester for "vérifie" at start', async () => {
        const result = await analyzeAndDecide('vérifie tout', '');

        expect(result.targetAgent).toBe('tester');
      });

      it('should delegate to tester for "coverage" at start', async () => {
        const result = await analyzeAndDecide('coverage', '');

        expect(result.targetAgent).toBe('tester');
      });

      it('should delegate to builder for "lance" at start (build priority)', async () => {
        // "lance" at start matches builder pattern (priority 3 build)
        // before the "lance.*test" pattern is checked
        const result = await analyzeAndDecide('lance les tests unitaires', '');

        expect(result.targetAgent).toBe('builder');
      });

      it('should delegate to builder for "run" at start', async () => {
        // "run" at start matches builder pattern
        const result = await analyzeAndDecide('run tests for auth module', '');

        expect(result.targetAgent).toBe('builder');
      });
    });

    describe('Review operations (Priority 3)', () => {
      it('should prioritize code creation when "code" is mentioned', async () => {
        // "code" triggers hasCreationVerb - code creation (priority 2) wins
        const result = await analyzeAndDecide('do a code review please', '');

        expect(result.targetAgent).toBe('coder');
      });

      it('should delegate to reviewer for "qualité" without code keyword', async () => {
        // Pure quality check without "code" keyword
        const result = await analyzeAndDecide('évaluer la qualité', '');

        expect(result.targetAgent).toBe('reviewer');
      });

      it('should prioritize coder over reviewer when code is mentioned', async () => {
        // When "code" is mentioned, it triggers hasCreationVerb, so coder wins
        const result = await analyzeAndDecide('analyse le code du module', '');

        // Code creation has higher priority than review
        expect(result.targetAgent).toBe('coder');
      });

      it('should delegate to reviewer for audit without code keyword', async () => {
        const result = await analyzeAndDecide('audit security', '');

        expect(result.targetAgent).toBe('reviewer');
      });

      it('should delegate to reviewer for pure review pattern', async () => {
        // "review" alone without code keyword
        const result = await analyzeAndDecide('review please', '');

        expect(result.targetAgent).toBe('reviewer');
      });
    });

    describe('Exploration operations (Priority 4)', () => {
      it('should delegate to explore for "où"', async () => {
        const result = await analyzeAndDecide('où est défini le composant Button', '');

        expect(result.targetAgent).toBe('explore');
        expect(result.reasoning).toContain('Exploration task');
      });

      it('should delegate to explore for "cherche"', async () => {
        const result = await analyzeAndDecide('cherche les fichiers de configuration', '');

        expect(result.targetAgent).toBe('explore');
      });

      it('should delegate to explore for "trouve"', async () => {
        const result = await analyzeAndDecide('trouve les tests existants', '');

        expect(result.targetAgent).toBe('explore');
      });

      it('should delegate to explore for "montre"', async () => {
        const result = await analyzeAndDecide('montre-moi la structure du projet', '');

        expect(result.targetAgent).toBe('explore');
      });

      it('should delegate to explore for "liste"', async () => {
        const result = await analyzeAndDecide('liste tous les composants', '');

        expect(result.targetAgent).toBe('explore');
      });

      it('should delegate to explore for "explique"', async () => {
        const result = await analyzeAndDecide('explique comment fonctionne ce module', '');

        expect(result.targetAgent).toBe('explore');
      });

      it('should delegate to explore for "qu\'est-ce"', async () => {
        const result = await analyzeAndDecide("qu'est-ce que ce fichier fait", '');

        expect(result.targetAgent).toBe('explore');
      });

      it('should delegate to explore for "comment fonctionne"', async () => {
        const result = await analyzeAndDecide("comment fonctionne le système d'auth", '');

        expect(result.targetAgent).toBe('explore');
      });
    });

    describe('Default behavior', () => {
      it('should default to coder for ambiguous requests', async () => {
        const result = await analyzeAndDecide('hello world', '');

        expect(result.targetAgent).toBe('coder');
        expect(result.reasoning).toContain('Default routing');
      });

      it('should default to coder for general requests', async () => {
        const messages = ['je voudrais quelque chose', "peux-tu m'aider", "j'ai besoin d'aide", 'fais quelque chose'];

        for (const msg of messages) {
          const result = await analyzeAndDecide(msg, '');
          expect(result.targetAgent).toBe('coder');
        }
      });
    });

    describe('File context handling', () => {
      it('should accept and process file context', async () => {
        const fileContext = '- src/components/Button.tsx\n- src/pages/Home.tsx';
        const result = await analyzeAndDecide('crée un composant', fileContext);

        // File context doesn't change routing logic, just provides context
        expect(result.action).toBe('delegate');
        expect(result.targetAgent).toBe('coder');
      });

      it('should work with empty file context', async () => {
        // "npm install" at start triggers builder (Priority 3)
        const result = await analyzeAndDecide('npm install', '');

        expect(result.action).toBe('delegate');
        expect(result.targetAgent).toBe('builder');
      });
    });

    describe('Case insensitivity', () => {
      it('should handle uppercase messages', async () => {
        const result = await analyzeAndDecide('FIX THE BUG', '');

        expect(result.targetAgent).toBe('fixer');
      });

      it('should handle mixed case messages', async () => {
        const result = await analyzeAndDecide('CrÉe un ComPosant', '');

        expect(result.targetAgent).toBe('coder');
      });

      it('should handle messages with accents', async () => {
        const messages = ['crée', 'créé', 'génère', 'génére', 'répare', 'réparé'];

        for (const msg of messages) {
          const result = await analyzeAndDecide(`${msg} quelque chose`, '');

          // All these should trigger coder or fixer, not fail
          expect(['coder', 'fixer']).toContain(result.targetAgent);
        }
      });
    });

    describe('Priority ordering', () => {
      it('should prioritize error detection over code creation', async () => {
        // This message has both error pattern and creation pattern
        const result = await analyzeAndDecide('Error: cannot create module', '');

        // Error detection (priority 0) should win over code creation
        expect(result.targetAgent).toBe('fixer');
      });

      it('should prioritize fix over build', async () => {
        // This has both fix and build patterns
        const result = await analyzeAndDecide('fix the build issue', '');

        // Fix (priority 1) should win over build (priority 3)
        expect(result.targetAgent).toBe('fixer');
      });
    });

    describe('Edge cases', () => {
      it('should handle very short messages', async () => {
        const result = await analyzeAndDecide('ok', '');

        // Should not crash, default to coder
        expect(result.targetAgent).toBe('coder');
      });

      it('should handle very long messages', async () => {
        const longMessage = 'crée un composant avec '.repeat(100);
        const result = await analyzeAndDecide(longMessage, '');

        expect(result.targetAgent).toBe('coder');
      });

      it('should handle messages with special characters', async () => {
        const result = await analyzeAndDecide('crée un composant @#$%^&*()', '');

        expect(result.targetAgent).toBe('coder');
      });

      it('should handle multiline messages', async () => {
        const multiline = 'crée un composant\navec plusieurs\nlignes';
        const result = await analyzeAndDecide(multiline, '');

        expect(result.targetAgent).toBe('coder');
      });
    });
  });
});
