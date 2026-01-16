/**
 * Module Supabase - Génération Backend Automatique
 *
 * Ce module fournit les outils pour générer automatiquement
 * des backends Supabase avec schémas, RLS, et migrations.
 */

// Types
export * from './types';

// Validators
export { SQLValidator, createSQLValidator } from './validators/SQLValidator';
export { NLPValidator, createNLPValidator } from './validators/NLPValidator';
export type { NLPValidatorOptions, TypeInference } from './validators/NLPValidator';
export { RLSValidator, createRLSValidator } from './validators/RLSValidator';
export type { RLSValidatorOptions, RLSValidationResult, PolicyAnalysis } from './validators/RLSValidator';

// Generators
export { SchemaGenerator, createSchemaGenerator } from './generators/SchemaGenerator';
export type { SchemaGeneratorOptions, GenerationResult, EntityExtractionResult } from './generators/SchemaGenerator';

export { TypeGenerator, createTypeGenerator } from './generators/TypeGenerator';
export type { TypeGeneratorOptions, GeneratedTypes } from './generators/TypeGenerator';

export { RLSGenerator, createRLSGenerator } from './generators/RLSGenerator';
export type { RLSGeneratorOptions, RLSGenerationResult, TableRLSConfig } from './generators/RLSGenerator';

export { MigrationGenerator, createMigrationGenerator } from './generators/MigrationGenerator';
export type { MigrationGeneratorOptions, MigrationResult, DiffOptions } from './generators/MigrationGenerator';

// Executors
export { SandboxExecutor, createSandboxExecutor } from './SandboxExecutor';
export type { SandboxExecutorOptions, SandboxContext, ExecutionResult } from './SandboxExecutor';

// Managers
export { RollbackManager, createRollbackManager } from './RollbackManager';
export { ReviewManager, createReviewManager, REVIEW_MESSAGE_TEMPLATES } from './ReviewManager';
export type { ReviewManagerOptions, ReviewDecision, PendingReview } from './ReviewManager';

// Logging and Metrics
export { AuditLogger, createAuditLogger } from './AuditLogger';
export type {
  AuditLoggerOptions,
  AuditOperation,
  AuditInput,
  AuditResult,
  AuditSecurity,
  AuditExportOptions,
} from './AuditLogger';

export { MetricsCollector, createMetricsCollector } from './MetricsCollector';
export type {
  MetricsCollectorOptions,
  MetricsPeriod,
  PerformanceMetrics,
  OperationMetrics,
  TrendData,
  HealthStatus,
} from './MetricsCollector';
