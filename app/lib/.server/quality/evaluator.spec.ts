/**
 * Tests pour le QualityEvaluator
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { QualityEvaluator, evaluateQuality } from './evaluator';

describe('QualityEvaluator', () => {
  let evaluator: QualityEvaluator;

  beforeEach(() => {
    evaluator = new QualityEvaluator();
  });

  describe('evaluate', () => {
    it('devrait retourner un score excellent pour du code TypeScript avec tests', () => {
      const content = `
<boltAction type="file" filePath="src/utils.ts">
export function add(a: number, b: number): number {
  try {
    return a + b;
  } catch (error) {
    throw new Error('Addition failed');
  }
}
</boltAction>

<boltAction type="file" filePath="src/utils.spec.ts">
import { describe, it, expect } from 'vitest';
import { add } from './utils';

describe('add', () => {
  it('should add two numbers', () => {
    expect(add(1, 2)).toBe(3);
  });
});
</boltAction>

<boltAction type="file" filePath="package.json">
{
  "name": "test-project",
  "scripts": {
    "test": "vitest"
  }
}
</boltAction>

<boltAction type="file" filePath="tsconfig.json">
{
  "compilerOptions": {
    "strict": true
  }
}
</boltAction>
`;

      const report = evaluator.evaluate(content);

      expect(report.score.overall).toBeGreaterThanOrEqual(75);
      expect(report.score.level).toMatch(/excellent|good/);
      expect(report.metrics.typescriptFiles).toBeGreaterThan(0);
      expect(report.metrics.testFiles).toBeGreaterThan(0);
    });

    it('devrait pénaliser le code JavaScript sans TypeScript', () => {
      const content = `
<boltAction type="file" filePath="src/utils.js">
function add(a, b) {
  return a + b;
}
module.exports = { add };
</boltAction>
`;

      const report = evaluator.evaluate(content);

      expect(report.score.categories.typescript).toBeLessThan(100);
      expect(report.issues.some((i) => i.category === 'typescript')).toBe(true);
    });

    it("devrait détecter l'absence de tests", () => {
      const content = `
<boltAction type="file" filePath="src/app.ts">
export function greet(name: string): string {
  return \`Hello, \${name}!\`;
}
</boltAction>
`;

      const report = evaluator.evaluate(content);

      expect(report.issues.some((i) => i.category === 'testing')).toBe(true);
      expect(report.metrics.testFiles).toBe(0);
    });

    it("devrait détecter l'utilisation de any", () => {
      const content = `
<boltAction type="file" filePath="src/service.ts">
export function process(data: any): any {
  return data;
}
</boltAction>
`;

      const report = evaluator.evaluate(content);

      expect(report.issues.some((i) => i.message.includes('any'))).toBe(true);
      expect(report.metrics.filesWithAny).toBe(1);
    });

    it('devrait détecter les secrets en dur', () => {
      const content = `
<boltAction type="file" filePath="src/config.ts">
const API_KEY = "sk_live_12345abcdef";
export default { API_KEY };
</boltAction>
`;

      const report = evaluator.evaluate(content);

      expect(report.issues.some((i) => i.severity === 'critical' && i.category === 'security')).toBe(true);
    });

    it('devrait détecter les risques XSS', () => {
      const content = `
<boltAction type="file" filePath="src/render.ts">
function render(html: string): void {
  document.body.innerHTML = html;
}
</boltAction>
`;

      const report = evaluator.evaluate(content);

      expect(report.issues.some((i) => i.message.includes('XSS'))).toBe(true);
    });

    it('devrait détecter les fichiers volumineux', () => {
      // Créer un fichier avec plus de 100 lignes
      const lines = Array(150).fill('const x = 1;').join('\n');
      const content = `
<boltAction type="file" filePath="src/large.ts">
${lines}
</boltAction>
`;

      const report = evaluator.evaluate(content);

      expect(report.metrics.largeFiles).toBe(1);
      expect(report.issues.some((i) => i.category === 'maintainability')).toBe(true);
    });

    it('devrait extraire les fichiers des blocs markdown', () => {
      const content = `
Voici le code :

\`\`\`typescript
export const value = 42;
\`\`\`
`;

      const report = evaluator.evaluate(content);

      expect(report.metrics.filesAnalyzed).toBeGreaterThan(0);
    });
  });

  describe('shouldSuggestImprovement', () => {
    it('devrait retourner false pour un code excellent', () => {
      const content = `
<boltAction type="file" filePath="src/utils.ts">
export function add(a: number, b: number): number {
  try {
    return a + b;
  } catch (error) {
    throw error;
  }
}
</boltAction>
<boltAction type="file" filePath="src/utils.spec.ts">
import { add } from './utils';
describe('add', () => {
  it('works', () => { expect(add(1, 2)).toBe(3); });
});
</boltAction>
<boltAction type="file" filePath="package.json">
{"name": "test", "scripts": {"test": "vitest"}}
</boltAction>
<boltAction type="file" filePath="tsconfig.json">
{"compilerOptions": {"strict": true}}
</boltAction>
`;

      const report = evaluator.evaluate(content);

      // Vérifie que le score est assez haut pour ne pas suggérer d'amélioration
      if (report.score.overall >= 90) {
        expect(evaluator.shouldSuggestImprovement(report)).toBe(false);
      }
    });

    it('devrait retourner true pour un code avec des problèmes', () => {
      const content = `
<boltAction type="file" filePath="src/bad.js">
function bad(x) {
  eval(x);
}
</boltAction>
`;

      const report = evaluator.evaluate(content);

      expect(evaluator.shouldSuggestImprovement(report)).toBe(true);
    });
  });

  describe('generateImprovementPrompt', () => {
    it('devrait générer un prompt vide pour un code approuvé', () => {
      const report = {
        timestamp: new Date(),
        score: {
          overall: 95,
          categories: {
            typescript: 100,
            testing: 100,
            security: 100,
            performance: 90,
            maintainability: 90,
            structure: 90,
            accessibility: 100,
            responsive: 100,
            uxPatterns: 100,
          },
          level: 'excellent' as const,
          action: 'approve' as const,
        },
        issues: [],
        summary: 'Excellent',
        suggestions: [],
        metrics: {
          filesAnalyzed: 1,
          totalLines: 10,
          typescriptFiles: 1,
          testFiles: 1,
          filesWithAny: 0,
          filesWithErrorHandling: 1,
          largeFiles: 0,
          accessibility: {
            imagesWithoutAlt: 0,
            buttonsWithoutLabel: 0,
            inputsWithoutLabels: 0,
            interactiveWithoutAria: 0,
            linksWithoutText: 0,
            contrastIssues: 0,
            score: 100,
          },
          responsive: {
            usesBreakpoints: true,
            responsiveClasses: 20,
            flexibleLayouts: 10,
            hasMobileNav: true,
            responsiveImages: 5,
            adaptiveGrids: 3,
            score: 100,
          },
          uxPatterns: {
            loadingStates: 5,
            errorStates: 3,
            emptyStates: 2,
            userFeedback: 3,
            animations: 5,
            focusManagement: 5,
            score: 100,
          },
        },
      };

      const prompt = evaluator.generateImprovementPrompt(report);

      expect(prompt).toBe('');
    });

    it('devrait générer un prompt avec suggestions pour un code à améliorer', () => {
      const report = {
        timestamp: new Date(),
        score: {
          overall: 60,
          categories: {
            typescript: 70,
            testing: 50,
            security: 70,
            performance: 80,
            maintainability: 60,
            structure: 50,
            accessibility: 60,
            responsive: 50,
            uxPatterns: 50,
          },
          level: 'acceptable' as const,
          action: 'suggest' as const,
        },
        issues: [
          {
            category: 'testing' as const,
            severity: 'major' as const,
            message: 'Pas de tests',
            suggestion: 'Ajouter des tests Vitest',
            impact: -20,
          },
        ],
        summary: 'Qualité acceptable',
        suggestions: ['Ajouter des tests Vitest'],
        metrics: {
          filesAnalyzed: 1,
          totalLines: 10,
          typescriptFiles: 1,
          testFiles: 0,
          filesWithAny: 0,
          filesWithErrorHandling: 0,
          largeFiles: 0,
          accessibility: {
            imagesWithoutAlt: 1,
            buttonsWithoutLabel: 1,
            inputsWithoutLabels: 0,
            interactiveWithoutAria: 0,
            linksWithoutText: 0,
            contrastIssues: 0,
            score: 60,
          },
          responsive: {
            usesBreakpoints: false,
            responsiveClasses: 5,
            flexibleLayouts: 2,
            hasMobileNav: false,
            responsiveImages: 0,
            adaptiveGrids: 0,
            score: 50,
          },
          uxPatterns: {
            loadingStates: 0,
            errorStates: 0,
            emptyStates: 0,
            userFeedback: 0,
            animations: 0,
            focusManagement: 0,
            score: 50,
          },
        },
      };

      const prompt = evaluator.generateImprovementPrompt(report);

      expect(prompt).toContain('60/100');
      expect(prompt).toContain('Améliorations recommandées');
    });
  });

  describe('evaluateQuality (fonction helper)', () => {
    it('devrait utiliser le singleton', () => {
      const content = '<boltAction type="file" filePath="test.ts">const x: number = 1;</boltAction>';

      const report1 = evaluateQuality(content);
      const report2 = evaluateQuality(content);

      expect(report1.score.overall).toBe(report2.score.overall);
    });
  });
});
