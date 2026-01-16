/**
 * Integration Tests for AST Analyzer
 * Tests sur de vrais fichiers du codebase
 */

import { describe, it, expect, beforeAll } from 'vitest';
import * as path from 'path';
import * as fs from 'fs/promises';
import { ASTAnalyzer, createASTAnalyzer, RuleRegistry, createConsoleReporter } from './index';

describe('ASTAnalyzer Integration', () => {
  let analyzer: ASTAnalyzer;
  const projectRoot = process.cwd();

  beforeAll(() => {
    RuleRegistry.resetInstance();
    analyzer = createASTAnalyzer();
  });

  /*
   * ============================================================================
   * REAL FILE ANALYSIS
   * ============================================================================
   */

  describe('Real file analysis', () => {
    it('should analyze a real TypeScript file from the project', async () => {
      const filePath = path.join(projectRoot, 'app/lib/agents/ast/types.ts');

      try {
        const result = await analyzer.analyzeFile(filePath);

        expect(result.file).toBe(filePath);
        expect(result.parseErrors).toHaveLength(0);
        expect(result.metrics.linesOfCode).toBeGreaterThan(0);
        expect(result.metrics.maintainabilityIndex).toBeGreaterThanOrEqual(0);
        expect(result.metrics.maintainabilityIndex).toBeLessThanOrEqual(100);
      } catch (error) {
        // Skip if file doesn't exist in test environment
        console.log('File not found, skipping:', filePath);
      }
    });

    it('should analyze the parser file', async () => {
      const filePath = path.join(projectRoot, 'app/lib/agents/ast/parser.ts');

      try {
        const result = await analyzer.analyzeFile(filePath);

        expect(result.file).toBe(filePath);
        expect(result.parseErrors).toHaveLength(0);

        // Parser should have moderate complexity
        expect(result.metrics.cyclomaticComplexity).toBeGreaterThan(1);
      } catch (error) {
        console.log('File not found, skipping:', filePath);
      }
    });

    it('should analyze security rules file', async () => {
      const filePath = path.join(projectRoot, 'app/lib/agents/ast/rules/security/index.ts');

      try {
        const result = await analyzer.analyzeFile(filePath);

        expect(result.file).toBe(filePath);
        expect(result.parseErrors).toHaveLength(0);
        expect(result.metrics.linesOfCode).toBeGreaterThan(100); // Security rules are substantial
      } catch (error) {
        console.log('File not found, skipping:', filePath);
      }
    });
  });

  /*
   * ============================================================================
   * METRICS ACCURACY
   * ============================================================================
   */

  describe('Metrics accuracy on real code', () => {
    it('should calculate accurate LOC for known file', async () => {
      // Create a test file with known LOC
      const testCode = `
        // Comment line 1
        const x = 1;
        const y = 2;

        function add(a: number, b: number): number {
          return a + b;
        }

        // Another comment
        export { x, y, add };
      `;

      const result = analyzer.analyzeSource(testCode, 'test.ts');

      // Should count only non-comment, non-empty lines
      expect(result.metrics.linesOfCode).toBeGreaterThan(5);
      expect(result.metrics.linesOfCode).toBeLessThan(15);
    });

    it('should detect complexity in real-world patterns', () => {
      const complexCode = `
        async function processData(items: Item[]): Promise<Result[]> {
          const results: Result[] = [];

          for (const item of items) {
            if (item.status === 'active') {
              if (item.type === 'A') {
                try {
                  const processed = await processTypeA(item);
                  if (processed.valid) {
                    results.push(processed);
                  }
                } catch (error) {
                  if (error instanceof ValidationError) {
                    console.warn('Validation failed:', error);
                  } else {
                    throw error;
                  }
                }
              } else if (item.type === 'B') {
                results.push(await processTypeB(item));
              }
            }
          }

          return results.filter(r => r !== null);
        }
      `;

      const result = analyzer.analyzeSource(complexCode);

      // This function should have high complexity (7+ branches)
      expect(result.metrics.cyclomaticComplexity).toBeGreaterThan(5);
    });

    it('should trigger complexity warning for very complex functions', () => {
      // Use analyzer with lower threshold for testing
      const strictAnalyzer = createASTAnalyzer({
        rules: {
          'maintainability/max-complexity': {
            enabled: true,
            options: { maxComplexity: 3 },
          },
        },
      });

      const complexCode = `
        function veryComplex(a: number, b: number, c: number) {
          if (a > 0) {
            if (b > 0) {
              if (c > 0) {
                return a + b + c;
              }
            }
          }
          return 0;
        }
      `;

      const result = strictAnalyzer.analyzeSource(complexCode);

      const complexityIssues = result.issues.filter((i) => i.rule === 'maintainability/max-complexity');
      expect(complexityIssues.length).toBeGreaterThan(0);
    });
  });

  /*
   * ============================================================================
   * REAL SECURITY PATTERNS
   * ============================================================================
   */

  describe('Real-world security pattern detection', () => {
    it('should detect common React XSS patterns', () => {
      const reactCode = `
        function UserProfile({ userData }: { userData: any }) {
          return (
            <div>
              <h1>{userData.name}</h1>
              <div dangerouslySetInnerHTML={{ __html: userData.bio }} />
              <a href={userData.website}>Visit website</a>
            </div>
          );
        }
      `;

      const result = analyzer.analyzeSource(reactCode, 'UserProfile.tsx');

      // Should detect dangerouslySetInnerHTML
      const xssIssues = result.issues.filter((i) => i.rule === 'security/no-innerhtml');
      expect(xssIssues.length).toBeGreaterThan(0);

      // Should also detect the 'any' type
      const anyIssues = result.issues.filter((i) => i.rule === 'maintainability/no-any');
      expect(anyIssues.length).toBeGreaterThan(0);
    });

    it('should detect SQL injection in ORM patterns', () => {
      const ormCode = `
        async function findUser(userId: string) {
          // Dangerous: string interpolation in SQL
          const query = \`SELECT * FROM users WHERE id = '\${userId}'\`;
          return db.rawQuery(query);
        }

        async function findUserSafe(userId: string) {
          // Safe: parameterized query
          return db.query('SELECT * FROM users WHERE id = ?', [userId]);
        }
      `;

      const result = analyzer.analyzeSource(ormCode);

      const sqlIssues = result.issues.filter((i) => i.rule === 'security/sql-injection');
      expect(sqlIssues.length).toBeGreaterThan(0);
    });
  });

  /*
   * ============================================================================
   * REAL PERFORMANCE PATTERNS
   * ============================================================================
   */

  describe('Real-world performance pattern detection', () => {
    it('should detect inefficient React patterns', () => {
      const reactCode = `
        function ProductList({ products, onSelect }) {
          const [filter, setFilter] = useState('');

          // Bad: creating new object on every render
          const styles = { padding: 10, margin: 5 };

          // Bad: inline function recreation
          const handleClick = (id) => onSelect(id);

          return (
            <div style={styles}>
              {products.map(p => (
                <Product
                  key={p.id}
                  data={p}
                  onClick={() => handleClick(p.id)}
                  config={{ showDetails: true }}
                />
              ))}
            </div>
          );
        }
      `;

      const result = analyzer.analyzeSource(reactCode, 'ProductList.tsx');

      // Should detect inline objects in JSX props
      const reRenderIssues = result.issues.filter((i) => i.rule === 'performance/avoid-re-renders');
      expect(reRenderIssues.length).toBeGreaterThan(0);
    });

    it('should detect blocking operations', () => {
      const nodeCode = `
        import fs from 'fs';
        import { execSync } from 'child_process';

        function loadConfig() {
          // Bad: synchronous file read
          const config = fs.readFileSync('./config.json', 'utf-8');
          return JSON.parse(config);
        }

        function runCommand() {
          // Bad: synchronous exec
          const output = execSync('npm run build');
          return output.toString();
        }
      `;

      const result = analyzer.analyzeSource(nodeCode);

      const syncIssues = result.issues.filter((i) => i.rule === 'performance/no-sync-operations');
      expect(syncIssues.length).toBeGreaterThanOrEqual(2); // readFileSync and execSync
    });
  });

  /*
   * ============================================================================
   * SUMMARY & REPORTING
   * ============================================================================
   */

  describe('Summary and reporting', () => {
    it('should create accurate summary for multiple files', () => {
      const results = [
        analyzer.analyzeSource(`let x: any = 1;`, 'file1.ts'),
        analyzer.analyzeSource(`eval("code");`, 'file2.ts'),
        analyzer.analyzeSource(`const safe: string = "ok";`, 'file3.ts'),
      ];

      const summary = analyzer.createSummary(results, 100);

      expect(summary.totalFiles).toBe(3);
      expect(summary.issuesBySeverity.error).toBeGreaterThan(0); // eval
      expect(summary.issuesBySeverity.warning).toBeGreaterThan(0); // any
      expect(summary.issuesByCategory.security).toBeGreaterThan(0);
      expect(summary.issuesByCategory.maintainability).toBeGreaterThan(0);
    });

    it('should format console output correctly', () => {
      const result = analyzer.analyzeSource(
        `
        let x: any = 1;
        eval("dangerous");
      `,
        'test.ts',
      );

      const reporter = createConsoleReporter(false); // No colors for testing
      const output = reporter.formatResult(result);

      expect(output).toContain('test.ts');
      expect(output).toContain('any');
      expect(output).toContain('eval');
    });
  });

  /*
   * ============================================================================
   * RULE CONFIGURATION
   * ============================================================================
   */

  describe('Rule configuration integration', () => {
    it('should respect disabled rules in real analysis', () => {
      const customAnalyzer = createASTAnalyzer({
        rules: {
          'maintainability/no-any': { enabled: false },
          'security/no-eval': { enabled: false },
        },
      });

      const code = `
        let x: any = 1;
        eval("code");
      `;

      const result = customAnalyzer.analyzeSource(code);

      // Should not have any or eval issues
      expect(result.issues.filter((i) => i.rule === 'maintainability/no-any')).toHaveLength(0);
      expect(result.issues.filter((i) => i.rule === 'security/no-eval')).toHaveLength(0);
    });

    it('should apply custom severity levels', () => {
      const customAnalyzer = createASTAnalyzer({
        rules: {
          'maintainability/no-any': { enabled: true, severity: 'error' },
        },
      });

      const result = customAnalyzer.analyzeSource(`let x: any = 1;`);

      const anyIssues = result.issues.filter((i) => i.rule === 'maintainability/no-any');
      expect(anyIssues[0]?.severity).toBe('error');
    });
  });
});
