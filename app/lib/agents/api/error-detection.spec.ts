/**
 * Tests for error-detection module
 */

import { describe, it, expect } from 'vitest';
import { detectErrorsInOutput, buildFixerPrompt } from './error-detection';
import type { DetectedError } from './types';

describe('error-detection', () => {
  describe('detectErrorsInOutput', () => {
    describe('TypeScript errors', () => {
      it('should detect TS errors with error code', () => {
        const output = 'error TS2304: Cannot find name "foo"';
        const errors = detectErrorsInOutput(output);

        expect(errors).toHaveLength(1);
        expect(errors[0].type).toBe('typescript');
        expect(errors[0].severity).toBe('high');
        expect(errors[0].message).toContain('TS2304');
      });

      it('should detect multiple TS errors', () => {
        const output = `
          error TS2304: Cannot find name "foo"
          error TS1005: ';' expected
          error TS2339: Property 'bar' does not exist
        `;
        const errors = detectErrorsInOutput(output);

        expect(errors.filter((e) => e.type === 'typescript')).toHaveLength(3);
      });
    });

    describe('Syntax errors', () => {
      it('should detect SyntaxError', () => {
        const output = 'SyntaxError: Unexpected token )';
        const errors = detectErrorsInOutput(output);

        expect(errors).toHaveLength(1);
        expect(errors[0].type).toBe('syntax');
        expect(errors[0].severity).toBe('high');
      });

      it('should detect SyntaxError with different formats', () => {
        const outputs = ['SyntaxError: Invalid or unexpected token', 'syntaxerror: missing semicolon'];

        outputs.forEach((output) => {
          const errors = detectErrorsInOutput(output);
          expect(errors.some((e) => e.type === 'syntax')).toBe(true);
        });
      });
    });

    describe('Import/Module errors', () => {
      it('should detect Cannot find module', () => {
        const output = `Cannot find module 'lodash'`;
        const errors = detectErrorsInOutput(output);

        expect(errors).toHaveLength(1);
        expect(errors[0].type).toBe('import');
        expect(errors[0].severity).toBe('high');
      });

      it('should detect Module not found', () => {
        const output = 'Module not found: Error: Cannot resolve module';
        const errors = detectErrorsInOutput(output);

        expect(errors.some((e) => e.type === 'import')).toBe(true);
      });

      it('should detect Failed to resolve import', () => {
        const output = `Failed to resolve import "react-router-dom"`;
        const errors = detectErrorsInOutput(output);

        expect(errors.some((e) => e.type === 'import')).toBe(true);
      });

      it('should detect Module has no exported member', () => {
        const output = `Module "react" has no exported member "useData"`;
        const errors = detectErrorsInOutput(output);

        expect(errors.some((e) => e.type === 'import')).toBe(true);
      });

      it('should detect Could not resolve', () => {
        const output = `Could not resolve "tailwindcss"`;
        const errors = detectErrorsInOutput(output);

        expect(errors.some((e) => e.type === 'import')).toBe(true);
      });

      it('should detect ENOENT in node_modules', () => {
        const output = 'ENOENT: no such file or directory node_modules/package';
        const errors = detectErrorsInOutput(output);

        expect(errors.some((e) => e.type === 'import')).toBe(true);
      });
    });

    describe('NPM errors', () => {
      it('should detect npm ERR!', () => {
        const output = 'npm ERR! Missing required argument';
        const errors = detectErrorsInOutput(output);

        expect(errors).toHaveLength(1);
        expect(errors[0].type).toBe('build');
        expect(errors[0].severity).toBe('high');
      });

      it('should detect multiple npm errors', () => {
        const output = `
          npm ERR! code ENOENT
          npm ERR! syscall open
          npm ERR! path /package.json
        `;
        const errors = detectErrorsInOutput(output);

        expect(errors.filter((e) => e.type === 'build')).toHaveLength(3);
      });
    });

    describe('Vite errors', () => {
      it('should detect vite error messages', () => {
        const output = '[vite] Internal server error: Failed to load';
        const errors = detectErrorsInOutput(output);

        expect(errors.some((e) => e.type === 'build')).toBe(true);
      });

      it('should not flag non-error vite messages', () => {
        const output = '[vite] hot module replacement enabled';
        const errors = detectErrorsInOutput(output);

        expect(errors.filter((e) => e.message.includes('vite'))).toHaveLength(0);
      });
    });

    describe('Runtime errors', () => {
      it('should detect TypeError', () => {
        const output = 'TypeError: undefined is not a function';
        const errors = detectErrorsInOutput(output);

        expect(errors).toHaveLength(1);
        expect(errors[0].type).toBe('runtime');
        expect(errors[0].severity).toBe('medium');
      });

      it('should detect ReferenceError', () => {
        const output = 'ReferenceError: myVar is not defined';
        const errors = detectErrorsInOutput(output);

        expect(errors).toHaveLength(1);
        expect(errors[0].type).toBe('runtime');
      });

      it('should detect RangeError', () => {
        const output = 'RangeError: Maximum call stack size exceeded';
        const errors = detectErrorsInOutput(output);

        expect(errors).toHaveLength(1);
        expect(errors[0].type).toBe('runtime');
      });

      it('should filter out false positive runtime errors', () => {
        const output = 'TypeError: No route matches';
        const errors = detectErrorsInOutput(output);

        expect(errors.filter((e) => e.type === 'runtime')).toHaveLength(0);
      });
    });

    describe('Build errors', () => {
      it('should detect Build failed', () => {
        const output = 'Build failed with 5 errors';
        const errors = detectErrorsInOutput(output);

        expect(errors.some((e) => e.type === 'build')).toBe(true);
      });

      it('should detect Compilation failed', () => {
        const output = 'Compilation failed due to errors';
        const errors = detectErrorsInOutput(output);

        expect(errors.some((e) => e.type === 'build')).toBe(true);
      });

      it('should detect Failed to compile', () => {
        const output = 'Failed to compile: missing dependency';
        const errors = detectErrorsInOutput(output);

        expect(errors.some((e) => e.type === 'build')).toBe(true);
      });
    });

    describe('PostCSS/Tailwind errors', () => {
      it('should detect PostCSS errors', () => {
        const output = 'PostCSS: error processing styles';
        const errors = detectErrorsInOutput(output);

        expect(errors.some((e) => e.type === 'build')).toBe(true);
      });

      it('should detect Tailwind errors', () => {
        const output = 'Tailwind: Error loading configuration';
        const errors = detectErrorsInOutput(output);

        expect(errors.some((e) => e.type === 'build')).toBe(true);
      });
    });

    describe('Test failures', () => {
      it('should detect FAIL', () => {
        const output = 'FAIL src/test.spec.ts';
        const errors = detectErrorsInOutput(output);

        expect(errors.some((e) => e.type === 'test')).toBe(true);
        expect(errors[0].severity).toBe('medium');
      });

      it('should detect ✗ symbol', () => {
        const output = '✗ should work correctly';
        const errors = detectErrorsInOutput(output);

        expect(errors.some((e) => e.type === 'test')).toBe(true);
      });

      it('should detect × symbol', () => {
        const output = '× test failed';
        const errors = detectErrorsInOutput(output);

        expect(errors.some((e) => e.type === 'test')).toBe(true);
      });
    });

    describe('Deduplication', () => {
      it('should deduplicate identical errors', () => {
        const output = `
          Cannot find module 'lodash'
          Cannot find module 'lodash'
          Cannot find module 'lodash'
        `;
        const errors = detectErrorsInOutput(output);

        expect(errors.filter((e) => e.message.includes('lodash'))).toHaveLength(1);
      });

      it('should limit to max 10 errors', () => {
        const lines = [];
        for (let i = 0; i < 20; i++) {
          lines.push(`error TS${2300 + i}: Error ${i}`);
        }
        const output = lines.join('\n');
        const errors = detectErrorsInOutput(output);

        expect(errors.length).toBeLessThanOrEqual(10);
      });
    });

    describe('Edge cases', () => {
      it('should return empty array for clean output', () => {
        const output = 'Build successful\nAll tests passed\nServer running on port 3000';
        const errors = detectErrorsInOutput(output);

        expect(errors).toHaveLength(0);
      });

      it('should handle empty string', () => {
        const errors = detectErrorsInOutput('');
        expect(errors).toHaveLength(0);
      });

      it('should handle multiline error messages', () => {
        const output = `error TS2304: Cannot find name "foo"
        at src/index.ts:10:5`;
        const errors = detectErrorsInOutput(output);

        expect(errors).toHaveLength(1);
      });
    });
  });

  describe('buildFixerPrompt', () => {
    it('should generate prompt with single error', () => {
      const errors: DetectedError[] = [{ type: 'import', message: `Cannot find module 'lodash'`, severity: 'high' }];

      const prompt = buildFixerPrompt(errors, 'coder');

      expect(prompt).toContain('Erreurs détectées');
      expect(prompt).toContain('[import]');
      expect(prompt).toContain("Cannot find module 'lodash'");
      expect(prompt).toContain('coder');
    });

    it('should generate prompt with multiple errors', () => {
      const errors: DetectedError[] = [
        { type: 'typescript', message: 'error TS2304: Cannot find name', severity: 'high' },
        { type: 'syntax', message: 'SyntaxError: Unexpected token', severity: 'high' },
        { type: 'runtime', message: 'TypeError: undefined is not a function', severity: 'medium' },
      ];

      const prompt = buildFixerPrompt(errors, 'builder');

      expect(prompt).toContain('1. [typescript]');
      expect(prompt).toContain('2. [syntax]');
      expect(prompt).toContain('3. [runtime]');
      expect(prompt).toContain('builder');
    });

    it('should include critical instructions', () => {
      const errors: DetectedError[] = [{ type: 'import', message: 'Module not found', severity: 'high' }];

      const prompt = buildFixerPrompt(errors, 'coder');

      expect(prompt).toContain('npm install');
      expect(prompt).toContain('<boltAction type="restart">');
      expect(prompt).toContain('package.json');
    });

    it('should mention boltArtifact format', () => {
      const errors: DetectedError[] = [{ type: 'build', message: 'Build failed', severity: 'high' }];

      const prompt = buildFixerPrompt(errors, 'builder');

      expect(prompt).toContain('<boltArtifact');
      expect(prompt).toContain('FORMAT DE RÉPONSE OBLIGATOIRE');
    });

    it('should handle empty error array gracefully', () => {
      const errors: DetectedError[] = [];
      const prompt = buildFixerPrompt(errors, 'coder');

      expect(prompt).toContain('Erreurs détectées');
      expect(prompt).not.toContain('[undefined]');
    });
  });
});
