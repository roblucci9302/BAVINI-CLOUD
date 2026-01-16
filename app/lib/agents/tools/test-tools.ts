/**
 * Outils de test pour les agents BAVINI
 * Ces outils permettent de lancer des tests, analyser les résultats et générer des rapports
 */

import type { ToolDefinition, ToolExecutionResult } from '../types';

/*
 * ============================================================================
 * DÉFINITIONS DES OUTILS
 * ============================================================================
 */

/**
 * Outil pour lancer des tests
 */
export const RunTestsTool: ToolDefinition = {
  name: 'run_tests',
  description:
    'Lancer les tests du projet. Supporte vitest, jest, et mocha. ' +
    'Peut cibler des fichiers spécifiques ou lancer tous les tests.',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Pattern de fichiers de test à exécuter (ex: "*.spec.ts", "tests/unit/**")',
      },
      testName: {
        type: 'string',
        description: 'Nom du test spécifique à exécuter (optionnel)',
      },
      watch: {
        type: 'boolean',
        description: 'Mode watch (défaut: false)',
      },
      coverage: {
        type: 'boolean',
        description: 'Générer un rapport de couverture (défaut: false)',
      },
      timeout: {
        type: 'number',
        description: 'Timeout en millisecondes (défaut: 60000)',
      },
    },
    required: [],
  },
};

/**
 * Outil pour analyser les résultats de tests
 */
export const AnalyzeTestResultsTool: ToolDefinition = {
  name: 'analyze_test_results',
  description:
    "Analyser les résultats d'un test. " +
    'Identifie les tests échoués, les patterns de problèmes, et suggère des corrections.',
  inputSchema: {
    type: 'object',
    properties: {
      testOutput: {
        type: 'string',
        description: 'Sortie brute des tests à analyser',
      },
      format: {
        type: 'string',
        enum: ['vitest', 'jest', 'mocha', 'auto'],
        description: 'Format de la sortie (défaut: auto-detect)',
      },
    },
    required: ['testOutput'],
  },
};

/**
 * Outil pour obtenir le rapport de couverture
 */
export const CoverageReportTool: ToolDefinition = {
  name: 'coverage_report',
  description:
    'Obtenir le rapport de couverture de code. ' + 'Affiche les fichiers non couverts et les zones à améliorer.',
  inputSchema: {
    type: 'object',
    properties: {
      format: {
        type: 'string',
        enum: ['summary', 'detailed', 'json'],
        description: 'Format du rapport (défaut: summary)',
      },
      threshold: {
        type: 'number',
        description: 'Seuil de couverture minimum (défaut: 80)',
      },
    },
    required: [],
  },
};

/**
 * Outil pour lancer un test unitaire spécifique
 */
export const RunSingleTestTool: ToolDefinition = {
  name: 'run_single_test',
  description: 'Lancer un seul fichier de test ou un test spécifique par son nom.',
  inputSchema: {
    type: 'object',
    properties: {
      file: {
        type: 'string',
        description: 'Chemin du fichier de test',
      },
      testName: {
        type: 'string',
        description: 'Nom du test spécifique (optionnel, sinon tous les tests du fichier)',
      },
      verbose: {
        type: 'boolean',
        description: 'Mode verbose avec plus de détails (défaut: true)',
      },
    },
    required: ['file'],
  },
};

/**
 * Outil pour lister les tests disponibles
 */
export const ListTestsTool: ToolDefinition = {
  name: 'list_tests',
  description: 'Lister tous les fichiers de tests et les suites de tests disponibles.',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: {
        type: 'string',
        description: 'Pattern de recherche (défaut: **/*.{spec,test}.{ts,tsx,js,jsx})',
      },
      showTestNames: {
        type: 'boolean',
        description: 'Afficher les noms des tests dans chaque fichier (défaut: false)',
      },
    },
    required: [],
  },
};

/*
 * ============================================================================
 * LISTE DES OUTILS DE TEST
 * ============================================================================
 */

export const TEST_TOOLS: ToolDefinition[] = [
  RunTestsTool,
  AnalyzeTestResultsTool,
  CoverageReportTool,
  RunSingleTestTool,
  ListTestsTool,
];

/*
 * ============================================================================
 * INTERFACE TEST RUNNER
 * ============================================================================
 */

/**
 * Résultat d'un test individuel
 */
export interface TestResult {
  name: string;
  status: 'passed' | 'failed' | 'skipped' | 'pending';
  duration: number;
  error?: {
    message: string;
    stack?: string;
    expected?: unknown;
    actual?: unknown;
  };
}

/**
 * Résultat d'une suite de tests
 */
export interface TestSuiteResult {
  name: string;
  file: string;
  tests: TestResult[];
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
}

/**
 * Rapport de couverture
 */
export interface CoverageReport {
  summary: {
    lines: { covered: number; total: number; percentage: number };
    functions: { covered: number; total: number; percentage: number };
    branches: { covered: number; total: number; percentage: number };
    statements: { covered: number; total: number; percentage: number };
  };
  files: Array<{
    path: string;
    lines: number;
    covered: number;
    percentage: number;
    uncoveredLines: number[];
  }>;
}

/**
 * Interface pour le runner de tests
 */
export interface TestRunner {
  /** Lancer des tests */
  runTests(options?: { pattern?: string; testName?: string; coverage?: boolean; timeout?: number }): Promise<{
    success: boolean;
    output: string;
    suites: TestSuiteResult[];
    totalPassed: number;
    totalFailed: number;
    totalSkipped: number;
    duration: number;
  }>;

  /** Lancer un seul fichier de test */
  runSingleTest(
    file: string,
    testName?: string,
  ): Promise<{
    success: boolean;
    output: string;
    results: TestResult[];
  }>;

  /** Obtenir le rapport de couverture */
  getCoverageReport(): Promise<CoverageReport | null>;

  /** Lister les tests disponibles */
  listTests(pattern?: string): Promise<
    Array<{
      file: string;
      tests: string[];
    }>
  >;

  /** Détecter le framework de test utilisé */
  detectFramework(): Promise<'vitest' | 'jest' | 'mocha' | 'unknown'>;
}

/*
 * ============================================================================
 * HANDLERS D'EXÉCUTION
 * ============================================================================
 */

/**
 * Créer les handlers pour les outils de test
 */
export function createTestToolHandlers(
  runner: TestRunner,
): Record<string, (input: Record<string, unknown>) => Promise<ToolExecutionResult>> {
  return {
    /**
     * Lancer des tests
     */
    run_tests: async (input: Record<string, unknown>): Promise<ToolExecutionResult> => {
      const pattern = input.pattern as string | undefined;
      const testName = input.testName as string | undefined;
      const coverage = input.coverage === true;
      const timeout = (input.timeout as number) || 60000;

      try {
        const result = await runner.runTests({
          pattern,
          testName,
          coverage,
          timeout,
        });

        const summary = [
          `Tests: ${result.totalPassed} passed, ${result.totalFailed} failed, ${result.totalSkipped} skipped`,
          `Duration: ${result.duration}ms`,
          `Status: ${result.success ? 'SUCCESS' : 'FAILURE'}`,
        ].join('\n');

        return {
          success: result.success,
          output: `${summary}\n\n${result.output}`,
        };
      } catch (error) {
        return {
          success: false,
          output: null,
          error: `Failed to run tests: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },

    /**
     * Analyser les résultats de tests
     */
    analyze_test_results: async (input: Record<string, unknown>): Promise<ToolExecutionResult> => {
      const testOutput = input.testOutput as string;
      const format = (input.format as string) || 'auto';

      try {
        // Parse the test output
        const analysis = parseTestOutput(testOutput, format);

        return {
          success: true,
          output: JSON.stringify(analysis, null, 2),
        };
      } catch (error) {
        return {
          success: false,
          output: null,
          error: `Failed to analyze test results: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },

    /**
     * Obtenir le rapport de couverture
     */
    coverage_report: async (input: Record<string, unknown>): Promise<ToolExecutionResult> => {
      const format = (input.format as string) || 'summary';
      const threshold = (input.threshold as number) || 80;

      try {
        const report = await runner.getCoverageReport();

        if (!report) {
          return {
            success: false,
            output: null,
            error: 'No coverage report available. Run tests with --coverage first.',
          };
        }

        let output: string;

        if (format === 'json') {
          output = JSON.stringify(report, null, 2);
        } else if (format === 'detailed') {
          output = formatDetailedCoverage(report, threshold);
        } else {
          output = formatSummaryCoverage(report, threshold);
        }

        const meetsThreshold = report.summary.lines.percentage >= threshold;

        return {
          success: meetsThreshold,
          output,
        };
      } catch (error) {
        return {
          success: false,
          output: null,
          error: `Failed to get coverage report: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },

    /**
     * Lancer un seul test
     */
    run_single_test: async (input: Record<string, unknown>): Promise<ToolExecutionResult> => {
      const file = input.file as string;
      const testName = input.testName as string | undefined;

      try {
        const result = await runner.runSingleTest(file, testName);

        const passed = result.results.filter((r) => r.status === 'passed').length;
        const failed = result.results.filter((r) => r.status === 'failed').length;

        return {
          success: result.success,
          output: `${file}: ${passed} passed, ${failed} failed\n\n${result.output}`,
        };
      } catch (error) {
        return {
          success: false,
          output: null,
          error: `Failed to run test: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },

    /**
     * Lister les tests
     */
    list_tests: async (input: Record<string, unknown>): Promise<ToolExecutionResult> => {
      const pattern = input.pattern as string | undefined;
      const showTestNames = input.showTestNames === true;

      try {
        const tests = await runner.listTests(pattern);

        let output: string;

        if (showTestNames) {
          output = tests
            .map((t) => {
              const testList = t.tests.map((name) => `  - ${name}`).join('\n');
              return `${t.file}:\n${testList}`;
            })
            .join('\n\n');
        } else {
          output = tests.map((t) => `${t.file} (${t.tests.length} tests)`).join('\n');
        }

        return {
          success: true,
          output: `Found ${tests.length} test files:\n\n${output}`,
        };
      } catch (error) {
        return {
          success: false,
          output: null,
          error: `Failed to list tests: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  };
}

/*
 * ============================================================================
 * HELPERS
 * ============================================================================
 */

/**
 * Parser la sortie de tests pour extraire les informations
 */
function parseTestOutput(
  output: string,
  _format: string,
): {
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  failedTests: Array<{
    name: string;
    error: string;
    suggestion?: string;
  }>;
  patterns: string[];
} {
  // Regex patterns pour différents formats
  const vitestPattern = /(\d+) passed.*?(\d+) failed.*?(\d+) skipped/i;
  const jestPattern = /Tests:\s+(\d+) passed,\s+(\d+) failed/i;

  let passed = 0;
  let failed = 0;
  let skipped = 0;

  // Try vitest pattern
  const vitestMatch = output.match(vitestPattern);

  if (vitestMatch) {
    passed = parseInt(vitestMatch[1], 10);
    failed = parseInt(vitestMatch[2], 10);
    skipped = parseInt(vitestMatch[3], 10);
  }

  // Try jest pattern
  const jestMatch = output.match(jestPattern);

  if (jestMatch) {
    passed = parseInt(jestMatch[1], 10);
    failed = parseInt(jestMatch[2], 10);
  }

  // Extract failed tests
  const failedTests: Array<{ name: string; error: string; suggestion?: string }> = [];
  const failedTestPattern = /FAIL\s+(.+?)(?:\n|$)/g;
  const errorPattern = /Error:\s*(.+?)(?:\n|$)/g;

  let match: RegExpExecArray | null;

  while ((match = failedTestPattern.exec(output)) !== null) {
    failedTests.push({
      name: match[1].trim(),
      error: 'Test failed',
    });
  }

  while ((match = errorPattern.exec(output)) !== null) {
    if (failedTests.length > 0 && !failedTests[failedTests.length - 1].error) {
      failedTests[failedTests.length - 1].error = match[1].trim();
    }
  }

  // Detect patterns in failures
  const patterns: string[] = [];

  if (output.includes('TypeError')) {
    patterns.push('Type errors detected - check type definitions');
  }

  if (output.includes('ReferenceError')) {
    patterns.push('Reference errors - check imports and variable declarations');
  }

  if (output.includes('timeout') || output.includes('Timeout')) {
    patterns.push('Timeout issues - consider increasing timeout or optimizing async code');
  }

  if (output.includes('mock') || output.includes('Mock')) {
    patterns.push('Mock-related issues - verify mock setup');
  }

  return {
    totalTests: passed + failed + skipped,
    passed,
    failed,
    skipped,
    failedTests,
    patterns,
  };
}

/**
 * Formater un rapport de couverture en résumé
 */
function formatSummaryCoverage(report: CoverageReport, threshold: number): string {
  const { summary } = report;
  const status = summary.lines.percentage >= threshold ? '✅' : '❌';

  return [
    `Coverage Summary ${status}`,
    `─────────────────────`,
    `Lines:      ${summary.lines.percentage.toFixed(1)}% (${summary.lines.covered}/${summary.lines.total})`,
    `Functions:  ${summary.functions.percentage.toFixed(1)}% (${summary.functions.covered}/${summary.functions.total})`,
    `Branches:   ${summary.branches.percentage.toFixed(1)}% (${summary.branches.covered}/${summary.branches.total})`,
    `Statements: ${summary.statements.percentage.toFixed(1)}% (${summary.statements.covered}/${summary.statements.total})`,
    ``,
    `Threshold: ${threshold}%`,
    `Status: ${summary.lines.percentage >= threshold ? 'PASS' : 'FAIL'}`,
  ].join('\n');
}

/**
 * Formater un rapport de couverture détaillé
 */
function formatDetailedCoverage(report: CoverageReport, threshold: number): string {
  const summary = formatSummaryCoverage(report, threshold);

  const lowCoverageFiles = report.files
    .filter((f) => f.percentage < threshold)
    .sort((a, b) => a.percentage - b.percentage);

  if (lowCoverageFiles.length === 0) {
    return `${summary}\n\nAll files meet the coverage threshold!`;
  }

  const fileDetails = lowCoverageFiles
    .map((f) => {
      const uncovered =
        f.uncoveredLines.length > 5 ? f.uncoveredLines.slice(0, 5).join(', ') + '...' : f.uncoveredLines.join(', ');
      return `${f.path}: ${f.percentage.toFixed(1)}% (uncovered: ${uncovered})`;
    })
    .join('\n');

  return [summary, '', 'Files below threshold:', '─────────────────────', fileDetails].join('\n');
}

/*
 * ============================================================================
 * MOCK TEST RUNNER (POUR LES TESTS)
 * ============================================================================
 */

/**
 * Créer un mock TestRunner pour les tests
 */
export function createMockTestRunner(
  options: {
    testFiles?: Array<{ file: string; tests: string[] }>;
    testResults?: {
      success: boolean;
      output: string;
      passed: number;
      failed: number;
    };
    coverageReport?: CoverageReport | null;
    framework?: 'vitest' | 'jest' | 'mocha';
  } = {},
): TestRunner {
  const defaultTestFiles = [{ file: 'tests/example.spec.ts', tests: ['should work', 'should handle errors'] }];

  const defaultResults = {
    success: true,
    output: 'All tests passed',
    passed: 2,
    failed: 0,
  };

  return {
    async runTests(runOptions) {
      const results = options.testResults || defaultResults;

      return {
        success: results.success,
        output: results.output,
        suites: [
          {
            name: 'Test Suite',
            file: runOptions?.pattern || 'tests/*.spec.ts',
            tests: [],
            passed: results.passed,
            failed: results.failed,
            skipped: 0,
            duration: 1000,
          },
        ],
        totalPassed: results.passed,
        totalFailed: results.failed,
        totalSkipped: 0,
        duration: 1000,
      };
    },

    async runSingleTest(file, _testName) {
      const results = options.testResults || defaultResults;

      return {
        success: results.success,
        output: `Running ${file}: ${results.output}`,
        results: [
          {
            name: 'test',
            status: results.success ? 'passed' : 'failed',
            duration: 100,
          },
        ],
      };
    },

    async getCoverageReport() {
      if (options.coverageReport !== undefined) {
        return options.coverageReport;
      }

      return {
        summary: {
          lines: { covered: 80, total: 100, percentage: 80 },
          functions: { covered: 40, total: 50, percentage: 80 },
          branches: { covered: 30, total: 40, percentage: 75 },
          statements: { covered: 85, total: 100, percentage: 85 },
        },
        files: [
          {
            path: 'src/index.ts',
            lines: 50,
            covered: 40,
            percentage: 80,
            uncoveredLines: [10, 20, 30],
          },
        ],
      };
    },

    async listTests(pattern) {
      const files = options.testFiles || defaultTestFiles;

      if (pattern) {
        return files.filter((f) => f.file.includes(pattern));
      }

      return files;
    },

    async detectFramework() {
      return options.framework || 'vitest';
    },
  };
}
