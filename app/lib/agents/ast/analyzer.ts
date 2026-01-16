/**
 * AST Analyzer - Analyseur principal utilisant TypeScript Compiler API
 */

import ts from 'typescript';
import { glob } from 'glob';
import { TypeScriptParser } from './parser';
import { RuleRegistry, type RuleContext } from './rules';
import type {
  AnalysisResult,
  AnalysisSummary,
  ASTIssue,
  CodeMetrics,
  ParseError,
  AnalyzerConfig,
  DEFAULT_ANALYZER_CONFIG,
  Severity,
  RuleCategory,
  DuplicateBlock,
} from './types';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('ASTAnalyzer');

/*
 * ============================================================================
 * AST ANALYZER
 * ============================================================================
 */

/**
 * Analyseur AST principal
 */
export class ASTAnalyzer {
  private parser: TypeScriptParser;
  private registry: RuleRegistry;
  private config: AnalyzerConfig;

  constructor(config?: Partial<AnalyzerConfig>) {
    this.parser = new TypeScriptParser();
    this.registry = RuleRegistry.getInstance();
    this.config = {
      rules: {},
      include: ['**/*.ts', '**/*.tsx'],
      exclude: ['**/node_modules/**', '**/*.spec.ts', '**/*.test.ts', '**/dist/**', '**/build/**'],
      maxFileSize: 500000,
      parallel: true,
      maxWorkers: 4,
      ...config,
    };

    // Configurer les règles
    if (config?.rules) {
      this.registry.configureAll(config.rules);
    }

    logger.info(`ASTAnalyzer initialized with ${this.registry.getEnabled().length} enabled rules`);
  }

  /*
   * ============================================================================
   * MAIN ANALYSIS METHODS
   * ============================================================================
   */

  /**
   * Analyser un fichier
   */
  async analyzeFile(filePath: string, content?: string): Promise<AnalysisResult> {
    logger.debug(`Analyzing file: ${filePath}`);

    const issues: ASTIssue[] = [];
    const parseErrors: ParseError[] = [];

    try {
      // Lire le fichier si le contenu n'est pas fourni
      if (!content) {
        const fs = await import('fs/promises');
        content = await fs.readFile(filePath, 'utf-8');
      }

      // Vérifier la taille du fichier
      if (content.length > this.config.maxFileSize) {
        logger.warn(`File too large, skipping: ${filePath}`);
        return {
          file: filePath,
          issues: [],
          metrics: this.getEmptyMetrics(),
          parseErrors: [{ message: "Fichier trop volumineux pour l'analyse" }],
        };
      }

      // Parser le source
      const sourceFile = this.parser.parseSource(content, filePath);

      // Collecter les erreurs de parsing
      const diagnostics = this.getParserDiagnostics(sourceFile);

      for (const diag of diagnostics) {
        parseErrors.push({
          message: ts.flattenDiagnosticMessageText(diag.messageText, '\n'),
          location:
            diag.start !== undefined
              ? this.parser.getLocation(
                  { getStart: () => diag.start!, getEnd: () => diag.start! + (diag.length || 0) } as ts.Node,
                  sourceFile,
                )
              : undefined,
        });
      }

      // Exécuter les règles activées
      const enabledRules = this.registry.getEnabled();

      for (const rule of enabledRules) {
        const context: RuleContext = {
          sourceFile,
          parser: this.parser,
          options: rule.options,
          report: (issue) => {
            issues.push({
              ...issue,
              rule: rule.id,
            });
          },
        };

        try {
          // Traverser l'AST avec la règle
          this.parser.traverse(sourceFile, (node) => {
            rule.analyze(node, context);
          });
        } catch (error) {
          logger.error(`Rule ${rule.id} error:`, error);
        }
      }

      // Calculer les métriques
      const metrics = this.calculateMetrics(sourceFile, content);

      return {
        file: filePath,
        issues: this.sortIssues(issues),
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
   * Analyser plusieurs fichiers
   */
  async analyzeFiles(patterns: string[], cwd?: string): Promise<AnalysisResult[]> {
    const files = await glob(patterns, {
      cwd: cwd || process.cwd(),
      ignore: this.config.exclude,
      absolute: true,
    });

    logger.info(`Analyzing ${files.length} files`);

    if (this.config.parallel && files.length > 1) {
      // Analyse parallèle avec limite de concurrence
      const results: AnalysisResult[] = [];
      const batchSize = this.config.maxWorkers || 4;

      for (let i = 0; i < files.length; i += batchSize) {
        const batch = files.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch.map((file) => this.analyzeFile(file)));
        results.push(...batchResults);
      }

      return results;
    }

    // Analyse séquentielle
    const results: AnalysisResult[] = [];

    for (const file of files) {
      results.push(await this.analyzeFile(file));
    }

    return results;
  }

  /**
   * Analyser du code source directement
   */
  analyzeSource(code: string, fileName = 'source.ts'): AnalysisResult {
    const sourceFile = this.parser.parseSource(code, fileName);
    const issues: ASTIssue[] = [];

    const enabledRules = this.registry.getEnabled();

    for (const rule of enabledRules) {
      const context: RuleContext = {
        sourceFile,
        parser: this.parser,
        options: rule.options,
        report: (issue) => {
          issues.push({
            ...issue,
            rule: rule.id,
          });
        },
      };

      this.parser.traverse(sourceFile, (node) => {
        rule.analyze(node, context);
      });
    }

    return {
      file: fileName,
      issues: this.sortIssues(issues),
      metrics: this.calculateMetrics(sourceFile, code),
      parseErrors: [],
    };
  }

  /**
   * Analyser un répertoire
   */
  async analyzeDirectory(dir: string): Promise<AnalysisResult[]> {
    return this.analyzeFiles(this.config.include, dir);
  }

  /*
   * ============================================================================
   * SUMMARY & REPORTING
   * ============================================================================
   */

  /**
   * Créer un résumé d'analyse
   */
  createSummary(results: AnalysisResult[], analysisTime: number): AnalysisSummary {
    const issuesBySeverity: Record<Severity, number> = {
      error: 0,
      warning: 0,
      info: 0,
      hint: 0,
    };

    const issuesByCategory: Record<RuleCategory, number> = {
      security: 0,
      performance: 0,
      maintainability: 0,
      style: 0,
      error: 0,
    };

    let totalLinesOfCode = 0;
    let totalComplexity = 0;
    let totalMaintainability = 0;
    let totalAnyCount = 0;
    let filesWithErrors = 0;
    let filesWithWarnings = 0;

    for (const result of results) {
      // Count issues by severity and category
      for (const issue of result.issues) {
        issuesBySeverity[issue.severity]++;
        issuesByCategory[issue.category]++;
      }

      // Check for errors/warnings
      if (result.issues.some((i) => i.severity === 'error') || result.parseErrors.length > 0) {
        filesWithErrors++;
      }

      if (result.issues.some((i) => i.severity === 'warning')) {
        filesWithWarnings++;
      }

      // Aggregate metrics
      totalLinesOfCode += result.metrics.linesOfCode;
      totalComplexity += result.metrics.cyclomaticComplexity;
      totalMaintainability += result.metrics.maintainabilityIndex;
      totalAnyCount += result.metrics.anyCount;
    }

    const fileCount = results.length || 1; // Avoid division by zero

    return {
      totalFiles: results.length,
      filesWithErrors,
      filesWithWarnings,
      issuesBySeverity,
      issuesByCategory,
      aggregatedMetrics: {
        totalLinesOfCode,
        averageComplexity: Math.round((totalComplexity / fileCount) * 10) / 10,
        averageMaintainability: Math.round(totalMaintainability / fileCount),
        totalAnyCount,
      },
      analysisTime,
    };
  }

  /*
   * ============================================================================
   * METRICS CALCULATION
   * ============================================================================
   */

  /**
   * Calculer les métriques du code
   */
  private calculateMetrics(sourceFile: ts.SourceFile, content: string): CodeMetrics {
    let anyCount = 0;
    let cyclomaticComplexity = 1;
    const unusedImports: string[] = [];

    // Parcourir l'AST pour compter les métriques
    this.parser.traverse(sourceFile, (node) => {
      // Compter les types 'any'
      if (node.kind === ts.SyntaxKind.AnyKeyword) {
        anyCount++;
      }

      // Compter les branches de complexité
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

        case ts.SyntaxKind.BinaryExpression:
          const binary = node as ts.BinaryExpression;

          if (
            binary.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
            binary.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
            binary.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken
          ) {
            cyclomaticComplexity++;
          }

          break;
      }
    });

    // Compter les lignes de code
    const lines = content.split('\n');
    const linesOfCode = lines.filter((line) => {
      const trimmed = line.trim();
      return trimmed && !trimmed.startsWith('//') && !trimmed.startsWith('/*') && !trimmed.startsWith('*');
    }).length;

    /*
     * Calculer l'index de maintenabilité (formule simplifiée)
     * MI = 171 - 5.2 * ln(HV) - 0.23 * CC - 16.2 * ln(LOC)
     */
    const halsteadVolume = Math.log2(Math.max(linesOfCode, 1)) * linesOfCode;
    const maintainabilityIndex = Math.max(
      0,
      Math.min(
        100,
        Math.round(
          171 -
            5.2 * Math.log(Math.max(halsteadVolume, 1)) -
            0.23 * cyclomaticComplexity -
            16.2 * Math.log(Math.max(linesOfCode, 1)),
        ),
      ),
    );

    // Complexité cognitive (approximation)
    const cognitiveComplexity = Math.round(cyclomaticComplexity * 1.2);

    return {
      linesOfCode,
      cyclomaticComplexity,
      cognitiveComplexity,
      maintainabilityIndex,
      anyCount,
      unusedImports,
      duplicateCode: [],
    };
  }

  /**
   * Métriques vides
   */
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

  /*
   * ============================================================================
   * UTILITIES
   * ============================================================================
   */

  /**
   * Trier les issues par sévérité puis position
   */
  private sortIssues(issues: ASTIssue[]): ASTIssue[] {
    const severityOrder: Record<Severity, number> = {
      error: 0,
      warning: 1,
      info: 2,
      hint: 3,
    };

    return issues.sort((a, b) => {
      // Par sévérité d'abord
      const severityDiff = severityOrder[a.severity] - severityOrder[b.severity];

      if (severityDiff !== 0) {
        return severityDiff;
      }

      // Puis par position
      return a.location.start.offset - b.location.start.offset;
    });
  }

  /**
   * Obtenir les diagnostics du parser
   */
  private getParserDiagnostics(sourceFile: ts.SourceFile): readonly ts.Diagnostic[] {
    /*
     * Les erreurs syntaxiques sont stockées dans le sourceFile
     * Note: parseDiagnostics is an internal property, use type assertion
     */
    return (sourceFile as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] }).parseDiagnostics || [];
  }

  /*
   * ============================================================================
   * CONFIGURATION
   * ============================================================================
   */

  /**
   * Obtenir la configuration actuelle
   */
  getConfig(): AnalyzerConfig {
    return { ...this.config };
  }

  /**
   * Mettre à jour la configuration
   */
  updateConfig(config: Partial<AnalyzerConfig>): void {
    this.config = { ...this.config, ...config };

    if (config.rules) {
      this.registry.configureAll(config.rules);
    }
  }

  /**
   * Obtenir le registre de règles
   */
  getRuleRegistry(): RuleRegistry {
    return this.registry;
  }

  /**
   * Obtenir les statistiques des règles
   */
  getRuleStats() {
    return this.registry.getStats();
  }
}

/*
 * ============================================================================
 * FACTORY FUNCTIONS
 * ============================================================================
 */

/**
 * Créer un analyseur AST
 */
export function createASTAnalyzer(config?: Partial<AnalyzerConfig>): ASTAnalyzer {
  return new ASTAnalyzer(config);
}

/**
 * Analyser rapidement du code source
 */
export function quickAnalyze(code: string, fileName = 'source.ts'): AnalysisResult {
  const analyzer = new ASTAnalyzer();
  return analyzer.analyzeSource(code, fileName);
}

/**
 * Analyser rapidement un fichier
 */
export async function quickAnalyzeFile(filePath: string): Promise<AnalysisResult> {
  const analyzer = new ASTAnalyzer();
  return analyzer.analyzeFile(filePath);
}
