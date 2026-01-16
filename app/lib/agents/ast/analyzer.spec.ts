/**
 * Tests pour l'analyseur AST
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ASTAnalyzer, createASTAnalyzer, quickAnalyze, RuleRegistry } from './index';

describe('ASTAnalyzer', () => {
  let analyzer: ASTAnalyzer;

  beforeEach(() => {
    RuleRegistry.resetInstance();
    analyzer = createASTAnalyzer();
  });

  /*
   * ============================================================================
   * BASIC ANALYSIS
   * ============================================================================
   */

  describe('analyzeSource', () => {
    it('should analyze simple TypeScript code', () => {
      const code = `
        const x: string = "hello";
        function greet(name: string): string {
          return "Hello, " + name;
        }
      `;

      const result = analyzer.analyzeSource(code);

      expect(result.file).toBe('source.ts');
      expect(result.parseErrors).toHaveLength(0);
      expect(result.metrics.linesOfCode).toBeGreaterThan(0);
    });

    it('should calculate metrics correctly', () => {
      const code = `
        function calculate(x: number, y: number): number {
          if (x > 0) {
            if (y > 0) {
              return x + y;
            }
            return x;
          }
          return y;
        }
      `;

      const result = analyzer.analyzeSource(code);

      expect(result.metrics.cyclomaticComplexity).toBeGreaterThan(1);
      expect(result.metrics.maintainabilityIndex).toBeLessThanOrEqual(100);
    });

    it('should handle empty code', () => {
      const result = analyzer.analyzeSource('');

      expect(result.issues).toHaveLength(0);
      expect(result.parseErrors).toHaveLength(0);
    });
  });

  /*
   * ============================================================================
   * SECURITY RULES
   * ============================================================================
   */

  describe('security rules', () => {
    it('should detect eval usage', () => {
      const code = `
        const result = eval("1 + 1");
      `;

      const result = analyzer.analyzeSource(code);
      const evalIssues = result.issues.filter((i) => i.rule === 'security/no-eval');

      expect(evalIssues.length).toBeGreaterThan(0);
      expect(evalIssues[0].severity).toBe('error');
    });

    it('should detect new Function()', () => {
      const code = `
        const fn = new Function("return 1");
      `;

      const result = analyzer.analyzeSource(code);
      const issues = result.issues.filter((i) => i.rule === 'security/no-eval');

      expect(issues.length).toBeGreaterThan(0);
    });

    it('should detect innerHTML assignment', () => {
      const code = `
        document.getElementById("app").innerHTML = userInput;
      `;

      const result = analyzer.analyzeSource(code);
      const issues = result.issues.filter((i) => i.rule === 'security/no-innerhtml');

      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0].severity).toBe('error');
    });

    it('should detect SQL injection patterns', () => {
      const code = `
        const query = \`SELECT * FROM users WHERE id = \${userId}\`;
      `;

      const result = analyzer.analyzeSource(code);
      const issues = result.issues.filter((i) => i.rule === 'security/sql-injection');

      expect(issues.length).toBeGreaterThan(0);
    });

    it('should allow safe SQL with parameters', () => {
      const code = `
        const query = "SELECT * FROM users WHERE id = ?";
        db.query(query, [userId]);
      `;

      const result = analyzer.analyzeSource(code);
      const issues = result.issues.filter((i) => i.rule === 'security/sql-injection');

      expect(issues).toHaveLength(0);
    });
  });

  /*
   * ============================================================================
   * PERFORMANCE RULES
   * ============================================================================
   */

  describe('performance rules', () => {
    it('should detect synchronous operations', () => {
      const code = `
        import fs from 'fs';
        const data = fs.readFileSync('file.txt');
      `;

      const result = analyzer.analyzeSource(code);
      const issues = result.issues.filter((i) => i.rule === 'performance/no-sync-operations');

      expect(issues.length).toBeGreaterThan(0);
    });

    it('should detect useMemo with empty dependencies using external vars', () => {
      const code = `
        function Component() {
          const [count, setCount] = useState(0);
          const value = useMemo(() => count * 2, []);
          return value;
        }
      `;

      const result = analyzer.analyzeSource(code, 'component.tsx');
      const issues = result.issues.filter((i) => i.rule === 'performance/memo-dependencies');

      expect(issues.length).toBeGreaterThan(0);
    });

    it('should detect useEffect without dependencies', () => {
      const code = `
        function Component() {
          useEffect(() => {
            console.log('effect');
          });
        }
      `;

      const result = analyzer.analyzeSource(code, 'component.tsx');
      const issues = result.issues.filter((i) => i.rule === 'performance/memo-dependencies');

      expect(issues.length).toBeGreaterThan(0);
    });

    it('should detect large package imports', () => {
      const code = `
        import _ from 'lodash';
        import moment from 'moment';
      `;

      const result = analyzer.analyzeSource(code);
      const issues = result.issues.filter((i) => i.rule === 'performance/bundle-size');

      expect(issues.length).toBeGreaterThan(0);
    });

    it('should allow optimized imports', () => {
      const code = `
        import debounce from 'lodash/debounce';
        import { format } from 'date-fns';
      `;

      const result = analyzer.analyzeSource(code);
      const issues = result.issues.filter((i) => i.rule === 'performance/bundle-size');

      expect(issues).toHaveLength(0);
    });
  });

  /*
   * ============================================================================
   * MAINTAINABILITY RULES
   * ============================================================================
   */

  describe('maintainability rules', () => {
    it('should detect any type usage', () => {
      const code = `
        let x: any = 1;
        function f(param: any): any {
          return param;
        }
      `;

      const result = analyzer.analyzeSource(code);
      const issues = result.issues.filter((i) => i.rule === 'maintainability/no-any');

      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0].fixable).toBe(true);
    });

    it('should detect as any assertions', () => {
      const code = `
        const value = something as any;
      `;

      const result = analyzer.analyzeSource(code);
      const issues = result.issues.filter((i) => i.rule === 'maintainability/no-any');

      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0].severity).toBe('error');
    });

    it('should detect high complexity functions', () => {
      const code = `
        function complex(a: number, b: number, c: number) {
          if (a > 0) {
            if (b > 0) {
              if (c > 0) {
                for (let i = 0; i < a; i++) {
                  if (i % 2 === 0) {
                    while (b > 0) {
                      if (c > i) {
                        switch (a) {
                          case 1: return 1;
                          case 2: return 2;
                          case 3: return 3;
                          default: return 0;
                        }
                      }
                      b--;
                    }
                  }
                }
              }
            }
          }
          return 0;
        }
      `;

      const result = analyzer.analyzeSource(code);
      const issues = result.issues.filter((i) => i.rule === 'maintainability/max-complexity');

      expect(issues.length).toBeGreaterThan(0);
    });

    it('should allow simple functions', () => {
      const code = `
        function simple(x: number): number {
          if (x > 0) {
            return x;
          }
          return 0;
        }
      `;

      const result = analyzer.analyzeSource(code);
      const issues = result.issues.filter((i) => i.rule === 'maintainability/max-complexity');

      expect(issues).toHaveLength(0);
    });

    it('should detect incorrect naming conventions', () => {
      const code = `
        class myClass {}
        interface IUser {}
        function DoSomething() {}
      `;

      const result = analyzer.analyzeSource(code);
      const issues = result.issues.filter((i) => i.rule === 'maintainability/naming-conventions');

      expect(issues.length).toBeGreaterThan(0);
    });

    it('should accept correct naming conventions', () => {
      const code = `
        class MyClass {}
        interface User {}
        function doSomething() {}
        const MAX_SIZE = 100;
      `;

      const result = analyzer.analyzeSource(code);
      const issues = result.issues.filter((i) => i.rule === 'maintainability/naming-conventions');

      // Should only have hint for I prefix if any
      const nonHintIssues = issues.filter((i) => i.severity !== 'hint');
      expect(nonHintIssues).toHaveLength(0);
    });
  });

  /*
   * ============================================================================
   * METRICS
   * ============================================================================
   */

  describe('metrics calculation', () => {
    it('should count any types correctly', () => {
      const code = `
        let a: any;
        let b: any;
        let c: string;
        function f(x: any): any { return x; }
      `;

      const result = analyzer.analyzeSource(code);

      expect(result.metrics.anyCount).toBe(4);
    });

    it('should calculate maintainability index', () => {
      const simpleCode = `const x = 1;`;
      const complexCode = `
        function f() {
          if (a) { if (b) { if (c) { if (d) { return 1; } } } }
          for (let i = 0; i < 10; i++) {
            while (true) {
              switch (x) { case 1: break; case 2: break; }
            }
          }
        }
      `.repeat(10);

      const simple = analyzer.analyzeSource(simpleCode);
      const complex = analyzer.analyzeSource(complexCode);

      expect(simple.metrics.maintainabilityIndex).toBeGreaterThan(complex.metrics.maintainabilityIndex);
    });
  });

  /*
   * ============================================================================
   * CONFIGURATION
   * ============================================================================
   */

  describe('configuration', () => {
    it('should disable rules via config', () => {
      const analyzer = createASTAnalyzer({
        rules: {
          'maintainability/no-any': { enabled: false },
        },
      });

      const code = `let x: any = 1;`;
      const result = analyzer.analyzeSource(code);

      const anyIssues = result.issues.filter((i) => i.rule === 'maintainability/no-any');
      expect(anyIssues).toHaveLength(0);
    });

    it('should change severity via config', () => {
      const analyzer = createASTAnalyzer({
        rules: {
          'maintainability/no-any': { enabled: true, severity: 'error' },
        },
      });

      const code = `let x: any = 1;`;
      const result = analyzer.analyzeSource(code);

      const anyIssues = result.issues.filter((i) => i.rule === 'maintainability/no-any');
      expect(anyIssues[0].severity).toBe('error');
    });

    it('should pass options to rules', () => {
      const analyzer = createASTAnalyzer({
        rules: {
          'maintainability/max-complexity': {
            enabled: true,
            options: { maxComplexity: 5 },
          },
        },
      });

      const code = `
        function f(a: number, b: number) {
          if (a > 0) {
            if (b > 0) {
              if (a > b) {
                if (b > 1) {
                  if (a > 2) {
                    return 1;
                  }
                }
              }
            }
          }
          return 0;
        }
      `;

      const result = analyzer.analyzeSource(code);
      const issues = result.issues.filter((i) => i.rule === 'maintainability/max-complexity');

      expect(issues.length).toBeGreaterThan(0);
    });
  });

  /*
   * ============================================================================
   * QUICK ANALYZE
   * ============================================================================
   */

  describe('quickAnalyze', () => {
    it('should provide a simple API', () => {
      const result = quickAnalyze(`const x: any = 1;`);

      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.metrics).toBeDefined();
    });
  });

  /*
   * ============================================================================
   * SUMMARY
   * ============================================================================
   */

  describe('createSummary', () => {
    it('should aggregate results correctly', () => {
      const results = [
        analyzer.analyzeSource(`let x: any = 1;`, 'file1.ts'),
        analyzer.analyzeSource(`let y: any = 2; let z: any = 3;`, 'file2.ts'),
        analyzer.analyzeSource(`const safe: string = "ok";`, 'file3.ts'),
      ];

      const summary = analyzer.createSummary(results, 100);

      expect(summary.totalFiles).toBe(3);
      expect(summary.issuesBySeverity.warning).toBeGreaterThan(0);
      expect(summary.aggregatedMetrics.totalAnyCount).toBe(3);
    });
  });

  /*
   * ============================================================================
   * RULE REGISTRY
   * ============================================================================
   */

  describe('RuleRegistry', () => {
    it('should have all rules registered', () => {
      const registry = RuleRegistry.getInstance();
      const stats = registry.getStats();

      expect(stats.total).toBeGreaterThan(10);
      expect(stats.byCategory.security).toBeGreaterThan(0);
      expect(stats.byCategory.performance).toBeGreaterThan(0);
      expect(stats.byCategory.maintainability).toBeGreaterThan(0);
    });

    it('should allow enabling/disabling by category', () => {
      const registry = RuleRegistry.getInstance();

      registry.disableCategory('security');

      const disabled = registry.getByCategory('security');
      expect(disabled.every((r) => !r.enabled)).toBe(true);

      registry.enableCategory('security');

      const enabled = registry.getByCategory('security');
      expect(enabled.every((r) => r.enabled)).toBe(true);
    });
  });
});
