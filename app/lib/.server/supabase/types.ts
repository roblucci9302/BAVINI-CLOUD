/**
 * Types pour la génération backend Supabase
 *
 * Ce module définit tous les types utilisés par les générateurs
 * de schéma, RLS, API et migrations.
 */

/*
 * =============================================================================
 * Entités et Schéma
 * =============================================================================
 */

export type PostgresType =
  | 'uuid'
  | 'text'
  | 'varchar'
  | 'int2'
  | 'int4'
  | 'int8'
  | 'float4'
  | 'float8'
  | 'numeric'
  | 'bool'
  | 'date'
  | 'time'
  | 'timestamp'
  | 'timestamptz'
  | 'json'
  | 'jsonb'
  | 'bytea'
  | 'inet'
  | 'cidr'
  | 'macaddr'
  | 'tsvector'
  | 'tsquery'
  | 'interval'
  | 'point'
  | 'line'
  | 'lseg'
  | 'box'
  | 'path'
  | 'polygon'
  | 'circle';

export interface Column {
  name: string;
  type: PostgresType;
  nullable: boolean;
  defaultValue?: string;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  isUnique: boolean;
  references?: {
    table: string;
    column: string;
    onDelete?: 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION';
    onUpdate?: 'CASCADE' | 'SET NULL' | 'RESTRICT' | 'NO ACTION';
  };
  check?: string;
  comment?: string;
}

export interface Table {
  name: string;
  schema: string;
  columns: Column[];
  indexes: Index[];
  constraints: Constraint[];
  comment?: string;
}

export interface Index {
  name: string;
  table: string;
  columns: string[];
  isUnique: boolean;
  method?: 'btree' | 'hash' | 'gist' | 'gin' | 'spgist' | 'brin';
  where?: string;
}

export interface Constraint {
  name: string;
  type: 'primary' | 'foreign' | 'unique' | 'check' | 'exclude';
  columns: string[];
  definition?: string;
}

export interface Schema {
  tables: Table[];
  rls: RLSPolicy[];
  functions: EdgeFunction[];
  triggers: Trigger[];
  indexes: Index[];
  enums: EnumType[];
}

export interface EnumType {
  name: string;
  values: string[];
}

/*
 * =============================================================================
 * Extraction NLP
 * =============================================================================
 */

export interface ExtractedEntity {
  name: string;
  tableName: string;
  description?: string;
  columns: ExtractedColumn[];
  relations: ExtractedRelation[];
  source: 'explicit' | 'inferred' | 'default';
}

export interface ExtractedColumn {
  name: string;
  inferredType: PostgresType;
  description?: string;
  isRequired: boolean;
  isUnique: boolean;
  source: 'explicit' | 'inferred' | 'default';
  confidence: number;
}

export interface ExtractedRelation {
  type: '1-1' | '1-N' | 'N-N';
  targetEntity: string;
  throughTable?: string;
  foreignKey: string;
  description?: string;
  confidence: number;
}

/*
 * =============================================================================
 * RLS (Row Level Security)
 * =============================================================================
 */

export type RLSAction = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE' | 'ALL';

export interface RLSPolicy {
  name: string;
  table: string;
  action: RLSAction;
  roles: string[];
  using?: string;
  check?: string;
  permissive: boolean;
}

export type RLSPattern = 'ownerOnly' | 'publicReadOwnerWrite' | 'teamBased' | 'adminOnly' | 'authenticated' | 'public';

export interface RLSPatternConfig {
  pattern: RLSPattern;
  ownerColumn?: string;
  teamColumn?: string;
  roleCheck?: string;
}

/*
 * =============================================================================
 * Fonctions et Triggers
 * =============================================================================
 */

export interface EdgeFunction {
  name: string;
  schema: string;
  language: 'plpgsql' | 'sql';
  returnType: string;
  parameters: FunctionParameter[];
  body: string;
  security: 'definer' | 'invoker';
  volatility: 'volatile' | 'stable' | 'immutable';
}

export interface FunctionParameter {
  name: string;
  type: string;
  defaultValue?: string;
  mode?: 'in' | 'out' | 'inout';
}

export interface Trigger {
  name: string;
  table: string;
  timing: 'before' | 'after' | 'instead of';
  events: ('insert' | 'update' | 'delete')[];
  forEach: 'row' | 'statement';
  function: string;
  condition?: string;
}

/*
 * =============================================================================
 * Migrations
 * =============================================================================
 */

export interface Migration {
  id: string;
  name: string;
  timestamp: number;
  up: string;
  down: string;
  checksum: string;
}

export interface SchemaDiff {
  addedTables: Table[];
  removedTables: Table[];
  modifiedTables: TableDiff[];
  addedPolicies: RLSPolicy[];
  removedPolicies: RLSPolicy[];
  modifiedPolicies: PolicyDiff[];
  addedFunctions: EdgeFunction[];
  removedFunctions: EdgeFunction[];
}

export interface TableDiff {
  table: string;
  addedColumns: Column[];
  removedColumns: Column[];
  modifiedColumns: ColumnDiff[];
  addedIndexes: Index[];
  removedIndexes: Index[];
}

export interface ColumnDiff {
  name: string;
  before: Partial<Column>;
  after: Partial<Column>;
}

export interface PolicyDiff {
  name: string;
  before: Partial<RLSPolicy>;
  after: Partial<RLSPolicy>;
}

/*
 * =============================================================================
 * Validation
 * =============================================================================
 */

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  suggestions: string[];
}

export interface ValidationError {
  code: string;
  message: string;
  location?: string;
  severity: 'error' | 'critical';
}

export interface ValidationWarning {
  code: string;
  message: string;
  location?: string;
  suggestion?: string;
}

export interface EntityConfidence {
  entity: ExtractedEntity;
  confidence: number;
  source: 'explicit' | 'inferred' | 'default';
  warnings: string[];
}

export interface NLPValidationResult extends ValidationResult {
  entities: EntityConfidence[];
  overallConfidence: number;
  requiresConfirmation: boolean;
  suggestedQuestions: string[];
}

export interface SQLValidationResult extends ValidationResult {
  sanitizedSQL: string;
  securityIssues: SecurityIssue[];
}

export interface SecurityIssue {
  type: 'injection' | 'forbidden_keyword' | 'privilege_escalation' | 'data_exposure';
  pattern?: string;
  location?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  recommendation: string;
}

/*
 * =============================================================================
 * Rollback et Checkpoint
 * =============================================================================
 */

export interface Checkpoint {
  id: string;
  timestamp: Date;
  type: 'schema' | 'data' | 'full';
  tables: string[];
  schema: Schema;
  data?: Record<string, unknown[]>;
  migration?: Migration;
  metadata?: Record<string, unknown>;
}

export interface RollbackResult {
  success: boolean;
  checkpoint: Checkpoint;
  duration: number;
  affectedTables: string[];
  error?: string;
}

/*
 * =============================================================================
 * Sandbox et Tests
 * =============================================================================
 */

export interface SandboxResult {
  success: boolean;
  executionTime: number;
  affectedRows: number;
  errors: ExecutionError[];
  warnings: string[];
  schema?: Schema;
}

export interface ExecutionError {
  code: string;
  message: string;
  position?: number;
  detail?: string;
  hint?: string;
}

export interface MigrationTestResult {
  success: boolean;
  phase?: 'up' | 'down';
  error?: ExecutionError;
  warning?: string;
  executionTime?: number;
  schemaAfterUp?: Schema;
}

export interface RegressionResult {
  success: boolean;
  migrationFailed: boolean;
  failures: QueryFailure[];
}

export interface QueryFailure {
  query: string;
  error: string;
  severity: 'warning' | 'critical';
}

export interface TestQuery {
  name: string;
  sql: string;
  critical: boolean;
}

/*
 * =============================================================================
 * Revue et Approbation
 * =============================================================================
 */

export interface ReviewRequest {
  id: string;
  type: 'schema' | 'migration' | 'rls' | 'api';
  operation: OperationDetails;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  confidence: number;
  autoApproved: boolean;
  preview: {
    before: string;
    after: string;
    diff: string;
    summary: string;
  };
  suggestedAction: 'approve' | 'modify' | 'reject';
  warnings: string[];
  recommendations: string[];
}

export interface OperationDetails {
  type: 'create' | 'modify' | 'delete' | 'migrate';
  target: 'table' | 'column' | 'policy' | 'function' | 'index';
  name: string;
  isDestructive: boolean;
  isAdditive: boolean;
  modifiesStructure: boolean;
  affectedElements: string[];
}

/*
 * =============================================================================
 * Audit
 * =============================================================================
 */

export interface AuditEntry {
  id: string;
  timestamp: Date;
  sessionId: string;
  userId?: string;
  operation: {
    type: 'create' | 'modify' | 'delete' | 'migrate' | 'rollback';
    target: 'table' | 'column' | 'policy' | 'function' | 'index';
    name: string;
  };
  input: {
    description?: string;
    sql?: string;
    validation?: ValidationResult;
  };
  result: {
    success: boolean;
    error?: string;
    duration: number;
    affectedRows?: number;
  };
  security: {
    riskLevel: string;
    validationsPassed: string[];
    warnings: string[];
    checkpointId?: string;
  };
}

export interface AuditFilters {
  startDate?: Date;
  endDate?: Date;
  operationType?: AuditEntry['operation']['type'];
  targetType?: AuditEntry['operation']['target'];
  success?: boolean;
  riskLevel?: string;
}

export interface SecurityMetrics {
  totalValidations: number;
  passedValidations: number;
  failedValidations: number;
  totalOperations: number;
  successfulOperations: number;
  rolledBackOperations: number;
  lowRiskOperations: number;
  mediumRiskOperations: number;
  highRiskOperations: number;
  criticalRiskOperations: number;
  avgConfidenceScore: number;
  avgValidationTime: number;
  rollbackRate: number;
}

/*
 * =============================================================================
 * Constantes
 * =============================================================================
 */

export const CONFIDENCE_THRESHOLDS = {
  AUTO_ACCEPT: 85,
  SUGGEST_REVIEW: 70,
  REQUIRE_CONFIRMATION: 50,
  REJECT: 30,
} as const;

export const REQUIRED_COLUMNS = {
  id: { type: 'uuid' as PostgresType, default: 'gen_random_uuid()' },
  created_at: { type: 'timestamptz' as PostgresType, default: 'now()' },
  updated_at: { type: 'timestamptz' as PostgresType, default: 'now()' },
} as const;

export const FORBIDDEN_SQL_KEYWORDS = [
  'DROP DATABASE',
  'DROP SCHEMA',
  'TRUNCATE',
  'DELETE FROM pg_',
  'ALTER SYSTEM',
  'COPY FROM PROGRAM',
] as const;

export const INJECTION_PATTERNS = [
  /;\s*DROP/i,
  /;\s*DELETE\s+FROM/i,
  /;\s*UPDATE\s+.*\s+SET/i,
  /UNION\s+SELECT/i,
  /--.*$/gm,
  /\/\*[\s\S]*?\*\//g,
] as const;
