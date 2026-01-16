# Phase 2 - Implementation Plan (Sprint 2)

## Overview

Phase 2 builds on Phase 1's infrastructure (Tool Registry + Parallel Execution) to add:
- **2.1 Real Integration Tests** - Replace mocks with actual system tests + E2E with Playwright
- **2.2 AST Quality Analysis** - TypeScript Compiler API for precise code analysis

---

## 2.1 Real Integration Tests

### 2.1.1 Current State Analysis

**Existing Test Infrastructure:**
- 82 test files with Vitest
- 7 integration tests (marked with `.integration.spec.ts`)
- Mock utilities: `createMockFileSystem()`, `createMockShell()`, `createMockTestRunner()`
- No Playwright/E2E setup

**Files to Create/Modify:**

| File | Purpose |
|------|---------|
| `playwright.config.ts` | Playwright configuration |
| `app/e2e/*.spec.ts` | E2E test suites |
| `app/lib/agents/tests/integration/` | Real integration tests directory |
| `app/test/fixtures/` | Test fixtures (real project samples) |

### 2.1.2 Real Integration Tests Architecture

```
app/lib/agents/tests/integration/
├── agent-execution.integration.ts      # Real agent execution tests
├── parallel-executor.integration.ts    # Real parallel execution tests
├── tool-registry.real.integration.ts   # Real tool execution tests
├── orchestrator.integration.ts         # Real orchestration flow tests
└── fixtures/
    ├── sample-project/                 # Minimal TypeScript project
    │   ├── package.json
    │   ├── tsconfig.json
    │   └── src/
    │       ├── index.ts
    │       ├── utils.ts
    │       └── components/
    └── expected-outputs/               # Expected test results
```

### 2.1.3 Implementation Tasks

#### Task 2.1.1: Test Fixtures Creation
- Create minimal TypeScript project for testing
- Include various code patterns (functions, classes, React components)
- Add intentional issues for detection testing

#### Task 2.1.2: Real FileSystem Tests
```typescript
// Replace createMockFileSystem with real filesystem operations
describe('Real FileSystem Integration', () => {
  const testDir = path.join(__dirname, 'fixtures/sample-project');

  it('should read real TypeScript files', async () => {
    const content = await fs.readFile(path.join(testDir, 'src/index.ts'), 'utf-8');
    expect(content).toContain('export');
  });

  it('should analyze real project structure', async () => {
    const files = await glob('**/*.ts', { cwd: testDir });
    expect(files.length).toBeGreaterThan(0);
  });
});
```

#### Task 2.1.3: Real Agent Execution Tests
```typescript
describe('Real Agent Execution', () => {
  it('should execute ExploreAgent on real codebase', async () => {
    const agent = createExploreAgent(realFileSystem);
    const result = await agent.run({
      id: 'test-1',
      type: 'explore',
      prompt: 'List all TypeScript files in src/',
      status: 'pending',
      createdAt: new Date(),
    }, process.env.ANTHROPIC_API_KEY);

    expect(result.success).toBe(true);
    expect(result.output).toContain('.ts');
  });
});
```

### 2.1.4 Playwright E2E Tests

#### Task 2.1.4: Playwright Setup
```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './app/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'pnpm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
});
```

#### Task 2.1.5: E2E Test Suites

```
app/e2e/
├── chat.spec.ts           # Chat interface tests
├── agent-mode.spec.ts     # Agent mode toggle tests
├── settings.spec.ts       # Settings panel tests
├── code-generation.spec.ts # Code generation flow
└── checkpoints.spec.ts    # Checkpoint system tests
```

**Example E2E Test:**
```typescript
// app/e2e/agent-mode.spec.ts
import { test, expect } from '@playwright/test';

test.describe('Agent Mode', () => {
  test('should toggle agent mode', async ({ page }) => {
    await page.goto('/');

    // Find and click agent mode toggle
    const toggle = page.getByRole('switch', { name: /agent mode/i });
    await expect(toggle).toBeVisible();

    await toggle.click();
    await expect(toggle).toBeChecked();

    // Verify UI changes
    await expect(page.getByText(/Mode Agent actif/i)).toBeVisible();
  });

  test('should generate code in agent mode', async ({ page }) => {
    await page.goto('/');

    // Enable agent mode
    await page.getByRole('switch', { name: /agent mode/i }).click();

    // Type prompt
    const input = page.getByPlaceholder(/message/i);
    await input.fill('Create a simple React button component');
    await input.press('Enter');

    // Wait for response
    await expect(page.getByText(/function|const.*Button/i)).toBeVisible({ timeout: 30000 });
  });
});
```

---

## 2.2 AST Quality Analysis

### 2.2.1 TypeScript Compiler API Integration

**New Module Structure:**
```
app/lib/agents/ast/
├── index.ts                    # Module exports
├── types.ts                    # AST analysis types
├── parser.ts                   # TypeScript AST parser
├── analyzer.ts                 # Main AST analyzer
├── rules/
│   ├── index.ts               # Rule registry
│   ├── base-rule.ts           # Base rule class
│   ├── security/
│   │   ├── no-eval.ts
│   │   ├── no-innerhtml.ts
│   │   ├── sql-injection.ts
│   │   └── xss-prevention.ts
│   ├── performance/
│   │   ├── no-sync-operations.ts
│   │   ├── memo-dependencies.ts
│   │   └── bundle-size.ts
│   └── maintainability/
│       ├── no-any.ts
│       ├── max-complexity.ts
│       ├── import-order.ts
│       └── naming-conventions.ts
└── reporters/
    ├── console-reporter.ts
    ├── json-reporter.ts
    └── sarif-reporter.ts
```

### 2.2.2 Core Types

```typescript
// app/lib/agents/ast/types.ts

export type RuleCategory = 'security' | 'performance' | 'maintainability' | 'style' | 'error';
export type Severity = 'error' | 'warning' | 'info' | 'hint';

export interface ASTPosition {
  line: number;
  column: number;
  offset: number;
}

export interface ASTLocation {
  file: string;
  start: ASTPosition;
  end: ASTPosition;
}

export interface ASTIssue {
  id: string;
  rule: string;
  message: string;
  severity: Severity;
  category: RuleCategory;
  location: ASTLocation;
  code?: string;          // Source code snippet
  suggestion?: string;    // Fix suggestion
  fixable: boolean;
  fix?: ASTFix;
}

export interface ASTFix {
  range: [number, number];
  replacement: string;
}

export interface AnalysisResult {
  file: string;
  issues: ASTIssue[];
  metrics: CodeMetrics;
  parseErrors: ParseError[];
}

export interface CodeMetrics {
  linesOfCode: number;
  cyclomaticComplexity: number;
  cognitiveComplexity: number;
  maintainabilityIndex: number;
  anyCount: number;
  unusedImports: string[];
  duplicateCode: DuplicateBlock[];
}

export interface RuleConfig {
  enabled: boolean;
  severity?: Severity;
  options?: Record<string, unknown>;
}

export interface AnalyzerConfig {
  rules: Record<string, RuleConfig>;
  include: string[];
  exclude: string[];
  maxFileSize: number;
  parallel: boolean;
}
```

### 2.2.3 AST Parser Implementation

```typescript
// app/lib/agents/ast/parser.ts

import ts from 'typescript';

export class TypeScriptParser {
  private program: ts.Program | null = null;
  private checker: ts.TypeChecker | null = null;

  /**
   * Parse TypeScript files and create AST
   */
  parse(files: string[], compilerOptions?: ts.CompilerOptions): ts.Program {
    const options: ts.CompilerOptions = {
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      esModuleInterop: true,
      strict: true,
      skipLibCheck: true,
      ...compilerOptions,
    };

    this.program = ts.createProgram(files, options);
    this.checker = this.program.getTypeChecker();

    return this.program;
  }

  /**
   * Parse source code string
   */
  parseSource(code: string, fileName = 'source.ts'): ts.SourceFile {
    return ts.createSourceFile(
      fileName,
      code,
      ts.ScriptTarget.ESNext,
      true,
      fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    );
  }

  /**
   * Get type information for a node
   */
  getTypeAtLocation(node: ts.Node): ts.Type | undefined {
    return this.checker?.getTypeAtLocation(node);
  }

  /**
   * Traverse AST with visitor pattern
   */
  traverse(
    node: ts.Node,
    visitor: (node: ts.Node, context: TraversalContext) => void,
    context: TraversalContext = { depth: 0, parent: null }
  ): void {
    visitor(node, context);

    ts.forEachChild(node, (child) => {
      this.traverse(child, visitor, {
        depth: context.depth + 1,
        parent: node,
      });
    });
  }

  /**
   * Get position info from node
   */
  getLocation(node: ts.Node, sourceFile: ts.SourceFile): ASTLocation {
    const start = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    const end = sourceFile.getLineAndCharacterOfPosition(node.getEnd());

    return {
      file: sourceFile.fileName,
      start: {
        line: start.line + 1,
        column: start.character + 1,
        offset: node.getStart(sourceFile),
      },
      end: {
        line: end.line + 1,
        column: end.character + 1,
        offset: node.getEnd(),
      },
    };
  }
}
```

### 2.2.4 Rule System

```typescript
// app/lib/agents/ast/rules/base-rule.ts

import ts from 'typescript';
import type { ASTIssue, RuleCategory, Severity, RuleConfig } from '../types';

export interface RuleContext {
  sourceFile: ts.SourceFile;
  program?: ts.Program;
  checker?: ts.TypeChecker;
  report: (issue: Omit<ASTIssue, 'rule'>) => void;
}

export abstract class BaseRule {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly category: RuleCategory;
  abstract readonly defaultSeverity: Severity;

  protected config: RuleConfig = { enabled: true };

  configure(config: Partial<RuleConfig>): void {
    this.config = { ...this.config, ...config };
  }

  get severity(): Severity {
    return this.config.severity ?? this.defaultSeverity;
  }

  get enabled(): boolean {
    return this.config.enabled;
  }

  abstract analyze(node: ts.Node, context: RuleContext): void;

  protected isEnabled(): boolean {
    return this.config.enabled;
  }
}
```

### 2.2.5 Security Rules

```typescript
// app/lib/agents/ast/rules/security/no-eval.ts

import ts from 'typescript';
import { BaseRule, RuleContext } from '../base-rule';

export class NoEvalRule extends BaseRule {
  readonly id = 'security/no-eval';
  readonly name = 'No eval()';
  readonly description = 'Disallow use of eval() which can execute arbitrary code';
  readonly category = 'security' as const;
  readonly defaultSeverity = 'error' as const;

  analyze(node: ts.Node, context: RuleContext): void {
    if (!this.isEnabled()) return;

    // Check for eval() calls
    if (ts.isCallExpression(node)) {
      const expression = node.expression;

      if (ts.isIdentifier(expression) && expression.text === 'eval') {
        context.report({
          id: `${this.id}-${node.getStart()}`,
          message: 'eval() is dangerous and should not be used. Consider safer alternatives.',
          severity: this.severity,
          category: this.category,
          location: this.getLocation(node, context.sourceFile),
          fixable: false,
          suggestion: 'Use JSON.parse() for JSON data, or Function constructor with caution.',
        });
      }
    }

    // Check for new Function()
    if (ts.isNewExpression(node)) {
      const expression = node.expression;

      if (ts.isIdentifier(expression) && expression.text === 'Function') {
        context.report({
          id: `${this.id}-function-${node.getStart()}`,
          message: 'new Function() is similar to eval() and should be avoided.',
          severity: 'warning',
          category: this.category,
          location: this.getLocation(node, context.sourceFile),
          fixable: false,
        });
      }
    }
  }
}


// app/lib/agents/ast/rules/security/no-innerhtml.ts

export class NoInnerHTMLRule extends BaseRule {
  readonly id = 'security/no-innerhtml';
  readonly name = 'No innerHTML';
  readonly description = 'Disallow direct innerHTML assignment to prevent XSS';
  readonly category = 'security' as const;
  readonly defaultSeverity = 'error' as const;

  analyze(node: ts.Node, context: RuleContext): void {
    if (!this.isEnabled()) return;

    // Check for .innerHTML assignment
    if (ts.isBinaryExpression(node) &&
        node.operatorToken.kind === ts.SyntaxKind.EqualsToken) {
      const left = node.left;

      if (ts.isPropertyAccessExpression(left) &&
          left.name.text === 'innerHTML') {
        context.report({
          id: `${this.id}-${node.getStart()}`,
          message: 'Direct innerHTML assignment can lead to XSS vulnerabilities.',
          severity: this.severity,
          category: this.category,
          location: this.getLocation(node, context.sourceFile),
          fixable: false,
          suggestion: 'Use textContent for plain text, or sanitize HTML with DOMPurify.',
        });
      }
    }

    // Check for dangerouslySetInnerHTML in JSX
    if (ts.isJsxAttribute(node) &&
        ts.isIdentifier(node.name) &&
        node.name.text === 'dangerouslySetInnerHTML') {
      context.report({
        id: `${this.id}-jsx-${node.getStart()}`,
        message: 'dangerouslySetInnerHTML can lead to XSS. Ensure content is sanitized.',
        severity: 'warning',
        category: this.category,
        location: this.getLocation(node, context.sourceFile),
        fixable: false,
        suggestion: 'Sanitize HTML content with DOMPurify before rendering.',
      });
    }
  }
}
```

### 2.2.6 Performance Rules

```typescript
// app/lib/agents/ast/rules/performance/no-sync-operations.ts

export class NoSyncOperationsRule extends BaseRule {
  readonly id = 'performance/no-sync-operations';
  readonly name = 'No Synchronous Operations';
  readonly description = 'Avoid synchronous file system and network operations';
  readonly category = 'performance' as const;
  readonly defaultSeverity = 'warning' as const;

  private syncMethods = new Set([
    'readFileSync',
    'writeFileSync',
    'appendFileSync',
    'existsSync',
    'statSync',
    'mkdirSync',
    'rmdirSync',
    'readdirSync',
    'unlinkSync',
    'copyFileSync',
    'execSync',
    'spawnSync',
  ]);

  analyze(node: ts.Node, context: RuleContext): void {
    if (!this.isEnabled()) return;

    if (ts.isCallExpression(node)) {
      const expression = node.expression;
      let methodName: string | undefined;

      if (ts.isPropertyAccessExpression(expression)) {
        methodName = expression.name.text;
      } else if (ts.isIdentifier(expression)) {
        methodName = expression.text;
      }

      if (methodName && this.syncMethods.has(methodName)) {
        context.report({
          id: `${this.id}-${node.getStart()}`,
          message: `Synchronous operation '${methodName}' blocks the event loop.`,
          severity: this.severity,
          category: this.category,
          location: this.getLocation(node, context.sourceFile),
          fixable: false,
          suggestion: `Use async version: ${methodName.replace('Sync', '')} with await`,
        });
      }
    }
  }
}
```

### 2.2.7 Maintainability Rules

```typescript
// app/lib/agents/ast/rules/maintainability/no-any.ts

export class NoAnyRule extends BaseRule {
  readonly id = 'maintainability/no-any';
  readonly name = 'No any Type';
  readonly description = 'Disallow usage of any type';
  readonly category = 'maintainability' as const;
  readonly defaultSeverity = 'warning' as const;

  analyze(node: ts.Node, context: RuleContext): void {
    if (!this.isEnabled()) return;

    // Check for explicit 'any' type annotations
    if (ts.isTypeReferenceNode(node) &&
        ts.isIdentifier(node.typeName) &&
        node.typeName.text === 'any') {
      context.report({
        id: `${this.id}-explicit-${node.getStart()}`,
        message: 'Avoid using "any" type. Use specific types or "unknown" instead.',
        severity: this.severity,
        category: this.category,
        location: this.getLocation(node, context.sourceFile),
        fixable: true,
        fix: {
          range: [node.getStart(), node.getEnd()],
          replacement: 'unknown',
        },
        suggestion: 'Replace with a specific type or use "unknown" for type-safe handling.',
      });
    }

    // Check for any keyword
    if (node.kind === ts.SyntaxKind.AnyKeyword) {
      context.report({
        id: `${this.id}-keyword-${node.getStart()}`,
        message: 'Avoid using "any" type.',
        severity: this.severity,
        category: this.category,
        location: this.getLocation(node, context.sourceFile),
        fixable: true,
        fix: {
          range: [node.getStart(), node.getEnd()],
          replacement: 'unknown',
        },
      });
    }
  }
}


// app/lib/agents/ast/rules/maintainability/max-complexity.ts

export class MaxComplexityRule extends BaseRule {
  readonly id = 'maintainability/max-complexity';
  readonly name = 'Max Cyclomatic Complexity';
  readonly description = 'Limit cyclomatic complexity of functions';
  readonly category = 'maintainability' as const;
  readonly defaultSeverity = 'warning' as const;

  private maxComplexity = 10;

  configure(config: Partial<RuleConfig>): void {
    super.configure(config);
    if (config.options?.maxComplexity) {
      this.maxComplexity = config.options.maxComplexity as number;
    }
  }

  analyze(node: ts.Node, context: RuleContext): void {
    if (!this.isEnabled()) return;

    // Analyze function complexity
    if (ts.isFunctionDeclaration(node) ||
        ts.isFunctionExpression(node) ||
        ts.isArrowFunction(node) ||
        ts.isMethodDeclaration(node)) {

      const complexity = this.calculateComplexity(node);

      if (complexity > this.maxComplexity) {
        const name = this.getFunctionName(node);

        context.report({
          id: `${this.id}-${node.getStart()}`,
          message: `Function '${name}' has complexity of ${complexity} (max: ${this.maxComplexity}).`,
          severity: complexity > this.maxComplexity * 2 ? 'error' : this.severity,
          category: this.category,
          location: this.getLocation(node, context.sourceFile),
          fixable: false,
          suggestion: 'Consider breaking this function into smaller, focused functions.',
        });
      }
    }
  }

  private calculateComplexity(node: ts.Node): number {
    let complexity = 1; // Base complexity

    const countBranches = (n: ts.Node): void => {
      switch (n.kind) {
        case ts.SyntaxKind.IfStatement:
        case ts.SyntaxKind.ConditionalExpression: // ternary
        case ts.SyntaxKind.CaseClause:
        case ts.SyntaxKind.CatchClause:
        case ts.SyntaxKind.ForStatement:
        case ts.SyntaxKind.ForInStatement:
        case ts.SyntaxKind.ForOfStatement:
        case ts.SyntaxKind.WhileStatement:
        case ts.SyntaxKind.DoStatement:
          complexity++;
          break;
        case ts.SyntaxKind.BinaryExpression:
          const binary = n as ts.BinaryExpression;
          if (binary.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
              binary.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
              binary.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken) {
            complexity++;
          }
          break;
      }
      ts.forEachChild(n, countBranches);
    };

    countBranches(node);
    return complexity;
  }

  private getFunctionName(node: ts.Node): string {
    if (ts.isFunctionDeclaration(node) && node.name) {
      return node.name.text;
    }
    if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name)) {
      return node.name.text;
    }
    return '<anonymous>';
  }
}
```

### 2.2.8 Main Analyzer

```typescript
// app/lib/agents/ast/analyzer.ts

import ts from 'typescript';
import { glob } from 'glob';
import { TypeScriptParser } from './parser';
import { BaseRule, RuleContext } from './rules/base-rule';
import { RuleRegistry } from './rules';
import type { AnalysisResult, ASTIssue, CodeMetrics, AnalyzerConfig } from './types';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('ASTAnalyzer');

export class ASTAnalyzer {
  private parser: TypeScriptParser;
  private rules: BaseRule[];
  private config: AnalyzerConfig;

  constructor(config?: Partial<AnalyzerConfig>) {
    this.parser = new TypeScriptParser();
    this.config = {
      rules: {},
      include: ['**/*.ts', '**/*.tsx'],
      exclude: ['**/node_modules/**', '**/*.spec.ts', '**/*.test.ts'],
      maxFileSize: 500000, // 500KB
      parallel: true,
      ...config,
    };

    // Load rules from registry
    this.rules = RuleRegistry.getAllRules();

    // Configure rules
    for (const rule of this.rules) {
      const ruleConfig = this.config.rules[rule.id];
      if (ruleConfig) {
        rule.configure(ruleConfig);
      }
    }
  }

  /**
   * Analyze a single file
   */
  async analyzeFile(filePath: string, content?: string): Promise<AnalysisResult> {
    logger.debug(`Analyzing file: ${filePath}`);

    const issues: ASTIssue[] = [];
    const parseErrors: ParseError[] = [];

    try {
      // Read file if content not provided
      if (!content) {
        const fs = await import('fs/promises');
        content = await fs.readFile(filePath, 'utf-8');
      }

      // Check file size
      if (content.length > this.config.maxFileSize) {
        logger.warn(`File too large, skipping: ${filePath}`);
        return {
          file: filePath,
          issues: [],
          metrics: this.getEmptyMetrics(),
          parseErrors: [{ message: 'File too large' }],
        };
      }

      // Parse source
      const sourceFile = this.parser.parseSource(content, filePath);

      // Create rule context
      const context: RuleContext = {
        sourceFile,
        report: (issue) => {
          issues.push({
            ...issue,
            rule: '', // Will be set by rule
          });
        },
      };

      // Run enabled rules
      for (const rule of this.rules) {
        if (!rule.enabled) continue;

        this.parser.traverse(sourceFile, (node) => {
          try {
            rule.analyze(node, {
              ...context,
              report: (issue) => {
                issues.push({
                  ...issue,
                  rule: rule.id,
                });
              },
            });
          } catch (error) {
            logger.error(`Rule ${rule.id} error:`, error);
          }
        });
      }

      // Calculate metrics
      const metrics = this.calculateMetrics(sourceFile, content);

      return {
        file: filePath,
        issues,
        metrics,
        parseErrors,
      };
    } catch (error) {
      logger.error(`Failed to analyze ${filePath}:`, error);
      return {
        file: filePath,
        issues: [],
        metrics: this.getEmptyMetrics(),
        parseErrors: [{ message: error instanceof Error ? error.message : String(error) }],
      };
    }
  }

  /**
   * Analyze multiple files
   */
  async analyzeFiles(patterns: string[], cwd?: string): Promise<AnalysisResult[]> {
    const files = await glob(patterns, {
      cwd: cwd || process.cwd(),
      ignore: this.config.exclude,
      absolute: true,
    });

    logger.info(`Analyzing ${files.length} files`);

    if (this.config.parallel) {
      return Promise.all(files.map((file) => this.analyzeFile(file)));
    }

    const results: AnalysisResult[] = [];
    for (const file of files) {
      results.push(await this.analyzeFile(file));
    }
    return results;
  }

  /**
   * Analyze source code string
   */
  analyzeSource(code: string, fileName = 'source.ts'): AnalysisResult {
    const sourceFile = this.parser.parseSource(code, fileName);
    const issues: ASTIssue[] = [];

    for (const rule of this.rules) {
      if (!rule.enabled) continue;

      this.parser.traverse(sourceFile, (node) => {
        rule.analyze(node, {
          sourceFile,
          report: (issue) => {
            issues.push({
              ...issue,
              rule: rule.id,
            });
          },
        });
      });
    }

    return {
      file: fileName,
      issues,
      metrics: this.calculateMetrics(sourceFile, code),
      parseErrors: [],
    };
  }

  /**
   * Calculate code metrics
   */
  private calculateMetrics(sourceFile: ts.SourceFile, content: string): CodeMetrics {
    let anyCount = 0;
    let cyclomaticComplexity = 1;
    const unusedImports: string[] = [];

    this.parser.traverse(sourceFile, (node) => {
      // Count 'any' types
      if (node.kind === ts.SyntaxKind.AnyKeyword) {
        anyCount++;
      }

      // Count complexity branches
      switch (node.kind) {
        case ts.SyntaxKind.IfStatement:
        case ts.SyntaxKind.ConditionalExpression:
        case ts.SyntaxKind.CaseClause:
        case ts.SyntaxKind.CatchClause:
        case ts.SyntaxKind.ForStatement:
        case ts.SyntaxKind.ForInStatement:
        case ts.SyntaxKind.ForOfStatement:
        case ts.SyntaxKind.WhileStatement:
        case ts.SyntaxKind.DoStatement:
          cyclomaticComplexity++;
          break;
      }
    });

    const lines = content.split('\n');
    const linesOfCode = lines.filter((line) => line.trim() && !line.trim().startsWith('//')).length;

    // Maintainability Index (simplified formula)
    const halsteadVolume = Math.log2(linesOfCode + 1) * linesOfCode;
    const maintainabilityIndex = Math.max(
      0,
      Math.min(100, 171 - 5.2 * Math.log(halsteadVolume) - 0.23 * cyclomaticComplexity)
    );

    return {
      linesOfCode,
      cyclomaticComplexity,
      cognitiveComplexity: cyclomaticComplexity, // Simplified
      maintainabilityIndex: Math.round(maintainabilityIndex),
      anyCount,
      unusedImports,
      duplicateCode: [],
    };
  }

  private getEmptyMetrics(): CodeMetrics {
    return {
      linesOfCode: 0,
      cyclomaticComplexity: 0,
      cognitiveComplexity: 0,
      maintainabilityIndex: 100,
      anyCount: 0,
      unusedImports: [],
      duplicateCode: [],
    };
  }
}

/**
 * Factory function
 */
export function createASTAnalyzer(config?: Partial<AnalyzerConfig>): ASTAnalyzer {
  return new ASTAnalyzer(config);
}
```

### 2.2.9 Rule Registry

```typescript
// app/lib/agents/ast/rules/index.ts

import { BaseRule } from './base-rule';

// Security rules
import { NoEvalRule } from './security/no-eval';
import { NoInnerHTMLRule } from './security/no-innerhtml';
import { SQLInjectionRule } from './security/sql-injection';
import { XSSPreventionRule } from './security/xss-prevention';

// Performance rules
import { NoSyncOperationsRule } from './performance/no-sync-operations';
import { MemoDependenciesRule } from './performance/memo-dependencies';
import { BundleSizeRule } from './performance/bundle-size';

// Maintainability rules
import { NoAnyRule } from './maintainability/no-any';
import { MaxComplexityRule } from './maintainability/max-complexity';
import { ImportOrderRule } from './maintainability/import-order';
import { NamingConventionsRule } from './maintainability/naming-conventions';

export class RuleRegistry {
  private static rules: Map<string, BaseRule> = new Map();

  static {
    // Register all rules
    this.register(new NoEvalRule());
    this.register(new NoInnerHTMLRule());
    this.register(new SQLInjectionRule());
    this.register(new XSSPreventionRule());
    this.register(new NoSyncOperationsRule());
    this.register(new MemoDependenciesRule());
    this.register(new BundleSizeRule());
    this.register(new NoAnyRule());
    this.register(new MaxComplexityRule());
    this.register(new ImportOrderRule());
    this.register(new NamingConventionsRule());
  }

  static register(rule: BaseRule): void {
    this.rules.set(rule.id, rule);
  }

  static get(id: string): BaseRule | undefined {
    return this.rules.get(id);
  }

  static getAllRules(): BaseRule[] {
    return Array.from(this.rules.values());
  }

  static getByCategory(category: string): BaseRule[] {
    return this.getAllRules().filter((rule) => rule.category === category);
  }
}

export { BaseRule, type RuleContext } from './base-rule';
```

---

## Implementation Timeline

### Phase 2.1: Real Integration Tests (3-4 days)

| Day | Tasks |
|-----|-------|
| 1 | Setup Playwright, create test fixtures |
| 2 | Implement real filesystem integration tests |
| 3 | Implement real agent execution tests |
| 4 | Implement E2E tests for main flows |

### Phase 2.2: AST Quality Analysis (4-5 days)

| Day | Tasks |
|-----|-------|
| 1 | Create AST module structure, types, parser |
| 2 | Implement base rule system and rule registry |
| 3 | Implement security rules (4 rules) |
| 4 | Implement performance rules (3 rules) |
| 5 | Implement maintainability rules (4 rules) |

---

## Success Criteria

### 2.1 Integration Tests
- [ ] All mocked tests have real equivalents
- [ ] Playwright setup complete
- [ ] 3+ E2E test scenarios passing
- [ ] CI integration for E2E tests

### 2.2 AST Analysis
- [ ] TypeScript Compiler API integrated
- [ ] 11+ rules implemented (4 security, 3 performance, 4 maintainability)
- [ ] Metrics calculation (complexity, any count, LOC)
- [ ] 50+ unit tests for AST module
- [ ] Integration with existing quality evaluator

---

## Dependencies

```json
{
  "devDependencies": {
    "@playwright/test": "^1.40.0",
    "typescript": "^5.5.2"
  }
}
```

Note: TypeScript is already a dependency, and its Compiler API is included.
