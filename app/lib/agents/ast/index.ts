/**
 * AST Analysis Module - Analyse de code avec TypeScript Compiler API
 *
 * Ce module fournit une analyse statique complète du code TypeScript/JavaScript
 * avec détection de problèmes de sécurité, performance et maintenabilité.
 */

/*
 * ============================================================================
 * CORE
 * ============================================================================
 */

export { ASTAnalyzer, createASTAnalyzer, quickAnalyze, quickAnalyzeFile } from './analyzer';

export {
  TypeScriptParser,
  createTypeScriptParser,
  parseSourceFile,
  findNodesOfKind,
  type ImportInfo,
  type NamedImportInfo,
} from './parser';

/*
 * ============================================================================
 * TYPES
 * ============================================================================
 */

export type {
  RuleCategory,
  Severity,
  ASTPosition,
  ASTLocation,
  ASTFix,
  ASTIssue,
  DuplicateBlock,
  CodeMetrics,
  ParseError,
  AnalysisResult,
  AnalysisSummary,
  RuleConfig,
  AnalyzerConfig,
  TraversalContext,
  ReporterOptions,
  Reporter,
} from './types';

export { DEFAULT_ANALYZER_CONFIG } from './types';

/*
 * ============================================================================
 * RULES
 * ============================================================================
 */

export {
  RuleRegistry,
  getAllRules,
  getEnabledRules,
  getRule,
  configureRules,
  BaseRule,
  type RuleContext,
  type RuleRegistryStats,
} from './rules';

// Rule classes for extension
export { SECURITY_RULES, NoEvalRule, NoInnerHTMLRule, SQLInjectionRule, XSSPreventionRule } from './rules/security';

export {
  PERFORMANCE_RULES,
  NoSyncOperationsRule,
  MemoDependenciesRule,
  BundleSizeRule,
  AvoidReRendersRule,
} from './rules/performance';

export {
  MAINTAINABILITY_RULES,
  NoAnyRule,
  MaxComplexityRule,
  ImportOrderRule,
  NamingConventionsRule,
  MaxFileLengthRule,
} from './rules/maintainability';

/*
 * ============================================================================
 * REPORTERS
 * ============================================================================
 */

export { ConsoleReporter, createConsoleReporter } from './reporters/console-reporter';
