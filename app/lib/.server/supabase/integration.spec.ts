/**
 * Tests d'intégration - Sprint 3.3, 3.4 & 3.5
 *
 * Ce fichier teste l'intégration complète entre:
 * - RLSGenerator + RLSValidator (Sprint 3.3)
 * - MigrationGenerator + SandboxExecutor (Sprint 3.4)
 * - ReviewManager + AuditLogger + MetricsCollector (Sprint 3.5)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRLSGenerator } from './generators/RLSGenerator';
import { createRLSValidator } from './validators/RLSValidator';
import { createMigrationGenerator } from './generators/MigrationGenerator';
import { createSandboxExecutor } from './SandboxExecutor';
import { createReviewManager } from './ReviewManager';
import { createAuditLogger } from './AuditLogger';
import { createMetricsCollector } from './MetricsCollector';
import type { Schema, Table, Column, Migration, OperationDetails } from './types';

describe('RLS Integration', () => {
  const createTestTable = (overrides?: Partial<Table>): Table => ({
    name: 'posts',
    schema: 'public',
    columns: [
      {
        name: 'id',
        type: 'uuid',
        nullable: false,
        isPrimaryKey: true,
        isForeignKey: false,
        isUnique: true,
        defaultValue: 'gen_random_uuid()',
      },
      {
        name: 'user_id',
        type: 'uuid',
        nullable: false,
        isPrimaryKey: false,
        isForeignKey: true,
        isUnique: false,
        references: { table: 'users', column: 'id', onDelete: 'CASCADE' },
      },
      { name: 'title', type: 'text', nullable: false, isPrimaryKey: false, isForeignKey: false, isUnique: false },
      {
        name: 'created_at',
        type: 'timestamptz',
        nullable: false,
        isPrimaryKey: false,
        isForeignKey: false,
        isUnique: false,
        defaultValue: 'now()',
      },
    ],
    indexes: [],
    constraints: [],
    ...overrides,
  });

  const createTestSchema = (tables: Table[] = [createTestTable()]): Schema => ({
    tables,
    rls: [],
    functions: [],
    triggers: [],
    indexes: [],
    enums: [],
  });

  describe('RLSGenerator -> RLSValidator', () => {
    it('should generate valid ownerOnly policies', () => {
      const generator = createRLSGenerator();
      const validator = createRLSValidator();
      const schema = createTestSchema();

      // Générer les politiques
      const generationResult = generator.generate(schema);
      expect(generationResult.policies.length).toBe(4); // SELECT, INSERT, UPDATE, DELETE

      // Valider les politiques générées
      const validationResult = validator.validate(generationResult.policies);
      expect(validationResult.isValid).toBe(true);
      expect(validationResult.securityScore).toBeGreaterThanOrEqual(80);
    });

    it('should generate valid publicReadOwnerWrite policies', () => {
      const generator = createRLSGenerator();
      const validator = createRLSValidator();

      const tableWithPublished = createTestTable({
        name: 'articles',
        columns: [
          ...createTestTable().columns,
          {
            name: 'published',
            type: 'bool',
            nullable: false,
            isPrimaryKey: false,
            isForeignKey: false,
            isUnique: false,
          },
        ],
      });

      const schema = createTestSchema([tableWithPublished]);
      const generationResult = generator.generate(schema);

      // Valider les politiques
      const validationResult = validator.validate(generationResult.policies);
      expect(validationResult.isValid).toBe(true);

      // Vérifier que SELECT est public
      const selectPolicy = generationResult.policies.find((p) => p.action === 'SELECT');
      expect(selectPolicy?.roles).toContain('anon');
    });

    it('should generate valid teamBased policies', () => {
      const generator = createRLSGenerator();
      const validator = createRLSValidator();

      const teamTable = createTestTable({
        name: 'team_documents',
        columns: [
          ...createTestTable().columns,
          {
            name: 'team_id',
            type: 'uuid',
            nullable: false,
            isPrimaryKey: false,
            isForeignKey: true,
            isUnique: false,
            references: { table: 'teams', column: 'id' },
          },
        ],
      });

      const schema = createTestSchema([teamTable]);
      const generationResult = generator.generate(schema);

      // Vérifier que les politiques utilisent team_id
      const policies = generationResult.policies;
      expect(policies.some((p) => p.using?.includes('team_id'))).toBe(true);

      // Valider les politiques
      const validationResult = validator.validate(policies);
      expect(validationResult.isValid).toBe(true);
    });

    it('should generate valid SQL that can be validated', () => {
      const generator = createRLSGenerator();
      const schema = createTestSchema();

      const result = generator.generate(schema);

      // Vérifier le SQL généré
      expect(result.sql).toContain('ENABLE ROW LEVEL SECURITY');
      expect(result.sql).toContain('FORCE ROW LEVEL SECURITY');
      expect(result.sql).toContain('CREATE POLICY');
      expect(result.sql).toContain('auth.uid()');
    });

    it('should detect and warn about public pattern', () => {
      const generator = createRLSGenerator();
      const validator = createRLSValidator();

      const schema = createTestSchema();
      const result = generator.generate(schema, [{ table: 'posts', pattern: 'public' }]);

      // Le générateur doit avertir
      expect(result.warnings.some((w) => w.includes('public'))).toBe(true);

      // Le validateur doit détecter les politiques trop permissives
      const validation = validator.validate(result.policies);
      expect(validation.policyAnalysis.some((a) => a.securityLevel !== 'high')).toBe(true);
    });

    it('should generate adminOnly policies with proper JWT check', () => {
      const generator = createRLSGenerator();
      const validator = createRLSValidator();

      const schema = createTestSchema();
      const result = generator.generate(schema, [{ table: 'posts', pattern: 'adminOnly' }]);

      // Vérifier que les politiques utilisent auth.jwt()
      expect(result.policies.some((p) => p.using?.includes('auth.jwt()'))).toBe(true);

      // Valider les politiques
      const validation = validator.validate(result.policies);
      expect(validation.isValid).toBe(true);
    });
  });

  describe('Multi-table schema', () => {
    it('should handle multiple tables with different patterns', () => {
      const generator = createRLSGenerator();
      const validator = createRLSValidator();

      const usersTable: Table = {
        name: 'users',
        schema: 'public',
        columns: [
          { name: 'id', type: 'uuid', nullable: false, isPrimaryKey: true, isForeignKey: false, isUnique: true },
          { name: 'email', type: 'text', nullable: false, isPrimaryKey: false, isForeignKey: false, isUnique: true },
        ],
        indexes: [],
        constraints: [],
      };

      const postsTable = createTestTable();

      const categoriesTable: Table = {
        name: 'categories',
        schema: 'public',
        columns: [
          { name: 'id', type: 'uuid', nullable: false, isPrimaryKey: true, isForeignKey: false, isUnique: true },
          { name: 'name', type: 'text', nullable: false, isPrimaryKey: false, isForeignKey: false, isUnique: true },
        ],
        indexes: [],
        constraints: [],
      };

      const schema = createTestSchema([usersTable, postsTable, categoriesTable]);
      const result = generator.generate(schema);

      // Toutes les tables doivent avoir des politiques
      const tableNames = new Set(result.policies.map((p) => p.table));
      expect(tableNames.size).toBe(3);

      // Valider toutes les politiques
      const validation = validator.validate(result.policies);
      expect(validation.isValid).toBe(true);
    });
  });

  describe('Security validation', () => {
    it('should reject policies with SQL injection patterns', () => {
      const validator = createRLSValidator();

      const maliciousPolicies = [
        {
          name: 'malicious_policy',
          table: 'test',
          action: 'SELECT' as const,
          roles: ['authenticated'],
          using: 'id = 1; DROP TABLE users;',
          permissive: true,
        },
      ];

      const validation = validator.validate(maliciousPolicies);
      expect(validation.isValid).toBe(false);
      expect(validation.policyAnalysis[0].securityLevel).toBe('critical');
    });

    it('should calculate accurate security scores', () => {
      const generator = createRLSGenerator();
      const validator = createRLSValidator();

      // Générer des politiques sécurisées
      const schema = createTestSchema();
      const result = generator.generate(schema);
      const validation = validator.validate(result.policies);

      // Score élevé pour des politiques ownerOnly avec auth.uid()
      expect(validation.securityScore).toBeGreaterThanOrEqual(80);
    });
  });
});

/*
 * =============================================================================
 * Sprint 3.4 Integration Tests: MigrationGenerator + SandboxExecutor
 * =============================================================================
 */

describe('Migration Integration', () => {
  let sandboxExecutor: ReturnType<typeof createSandboxExecutor>;

  beforeEach(() => {
    sandboxExecutor = createSandboxExecutor({ cleanupDelay: 100 });
  });

  afterEach(async () => {
    await sandboxExecutor.cleanupAll();
  });

  const createColumn = (overrides?: Partial<Column>): Column => ({
    name: 'id',
    type: 'uuid',
    nullable: false,
    isPrimaryKey: true,
    isForeignKey: false,
    isUnique: true,
    defaultValue: 'gen_random_uuid()',
    ...overrides,
  });

  const createTable = (name: string, columns: Partial<Column>[] = []): Table => ({
    name,
    schema: 'public',
    columns: [
      createColumn(),
      createColumn({
        name: 'created_at',
        type: 'timestamptz',
        isPrimaryKey: false,
        isUnique: false,
        defaultValue: 'now()',
      }),
      ...columns.map((c) => createColumn(c)),
    ],
    indexes: [],
    constraints: [],
  });

  const createSchema = (tables: Table[] = []): Schema => ({
    tables,
    rls: [],
    functions: [],
    triggers: [],
    indexes: [],
    enums: [],
  });

  describe('MigrationGenerator -> SandboxExecutor', () => {
    it('should generate and test valid CREATE TABLE migration', async () => {
      const generator = createMigrationGenerator();

      const currentSchema = createSchema([]);
      const targetSchema = createSchema([
        createTable('users', [
          { name: 'email', type: 'text', isPrimaryKey: false, isForeignKey: false, isUnique: true, nullable: false },
          { name: 'name', type: 'text', isPrimaryKey: false, isForeignKey: false, isUnique: false, nullable: true },
        ]),
      ]);

      // Generate migration
      const result = generator.generate(currentSchema, targetSchema);
      expect(result.migration.up).toContain('CREATE TABLE');
      expect(result.migration.up).toContain('users');
      expect(result.isDestructive).toBe(false);

      // Test migration in sandbox
      const testResult = await sandboxExecutor.testMigration(result.migration);
      expect(testResult.success).toBe(true);
    });

    it('should generate and test valid ADD COLUMN migration', async () => {
      const generator = createMigrationGenerator();

      const currentSchema = createSchema([createTable('posts')]);
      const targetSchema = createSchema([
        createTable('posts', [
          { name: 'title', type: 'text', isPrimaryKey: false, isForeignKey: false, isUnique: false, nullable: false },
          { name: 'content', type: 'text', isPrimaryKey: false, isForeignKey: false, isUnique: false, nullable: true },
        ]),
      ]);

      const result = generator.generate(currentSchema, targetSchema);
      expect(result.migration.up).toContain('ADD COLUMN');
      expect(result.migration.up).toContain('title');

      const testResult = await sandboxExecutor.testMigration(result.migration);
      expect(testResult.success).toBe(true);
    });

    it('should detect destructive migrations', async () => {
      const generator = createMigrationGenerator();

      const currentSchema = createSchema([createTable('old_table')]);
      const targetSchema = createSchema([]);

      const result = generator.generate(currentSchema, targetSchema);
      expect(result.isDestructive).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.migration.up).toContain('DROP TABLE');
    });

    it('should generate valid rollback SQL', async () => {
      const generator = createMigrationGenerator();

      const currentSchema = createSchema([]);
      const targetSchema = createSchema([createTable('new_table')]);

      const result = generator.generate(currentSchema, targetSchema);

      // DOWN should drop the table
      expect(result.migration.down).toContain('DROP TABLE');
      expect(result.migration.down).toContain('new_table');

      // Validate rollback
      const rollbackValidation = generator.validateRollback(result.migration);
      expect(rollbackValidation.isValid).toBe(true);
    });

    it('should test migration with regression queries', async () => {
      const generator = createMigrationGenerator();

      const currentSchema = createSchema([]);
      const targetSchema = createSchema([createTable('products')]);

      const result = generator.generate(currentSchema, targetSchema);

      const regressionResult = await sandboxExecutor.testRegression(result.migration, [
        { name: 'Select products', sql: 'SELECT 1;', critical: true },
        { name: 'Check schema', sql: 'SELECT current_schema();', critical: false },
      ]);

      expect(regressionResult.migrationFailed).toBe(false);
    });

    it('should fail sandbox test for dangerous SQL', async () => {
      const dangerousMigration: Migration = {
        id: 'test_dangerous',
        name: 'dangerous_migration',
        timestamp: Date.now(),
        up: 'DROP DATABASE production;',
        down: '',
        checksum: 'abc123',
      };

      const testResult = await sandboxExecutor.testMigration(dangerousMigration);
      expect(testResult.success).toBe(false);
      expect(testResult.phase).toBe('up');
    });
  });

  describe('End-to-end migration workflow', () => {
    it('should handle complete schema evolution', async () => {
      const generator = createMigrationGenerator();

      // Step 1: Empty -> Users table
      const schema1 = createSchema([]);
      const schema2 = createSchema([
        createTable('users', [
          { name: 'email', type: 'text', isPrimaryKey: false, isForeignKey: false, isUnique: true, nullable: false },
        ]),
      ]);

      const migration1 = generator.generate(schema1, schema2, 'create_users');
      expect(migration1.affectedTables).toContain('users');

      const test1 = await sandboxExecutor.testMigration(migration1.migration);
      expect(test1.success).toBe(true);

      // Step 2: Add posts table with foreign key
      const schema3 = createSchema([
        ...schema2.tables,
        {
          name: 'posts',
          schema: 'public',
          columns: [
            createColumn(),
            createColumn({
              name: 'user_id',
              type: 'uuid',
              isPrimaryKey: false,
              isForeignKey: true,
              isUnique: false,
              references: { table: 'users', column: 'id', onDelete: 'CASCADE' },
            }),
            createColumn({
              name: 'title',
              type: 'text',
              isPrimaryKey: false,
              isForeignKey: false,
              isUnique: false,
              nullable: false,
            }),
          ],
          indexes: [],
          constraints: [],
        },
      ]);

      const migration2 = generator.generate(schema2, schema3, 'create_posts');
      expect(migration2.affectedTables).toContain('posts');
      expect(migration2.migration.up).toContain('user_id');

      const test2 = await sandboxExecutor.testMigration(migration2.migration);
      expect(test2.success).toBe(true);
    });

    it('should generate checksum for migration integrity', () => {
      const generator = createMigrationGenerator();

      const schema1 = createSchema([]);
      const schema2 = createSchema([createTable('test')]);

      const result = generator.generate(schema1, schema2);

      // Checksum should be non-empty
      expect(result.migration.checksum).toBeTruthy();
      expect(result.migration.checksum.length).toBeGreaterThan(8);
    });
  });

  describe('RLS + Migration integration', () => {
    it('should generate migration with RLS policies', async () => {
      const migrationGenerator = createMigrationGenerator();
      const rlsGenerator = createRLSGenerator();

      // Create schema with RLS
      const tableWithUserColumn = createTable('documents', [
        {
          name: 'user_id',
          type: 'uuid',
          isPrimaryKey: false,
          isForeignKey: true,
          isUnique: false,
          nullable: false,
          references: { table: 'users', column: 'id' },
        },
      ]);

      const currentSchema = createSchema([]);
      const targetSchema = createSchema([tableWithUserColumn]);

      // Generate migration
      const migrationResult = migrationGenerator.generate(currentSchema, targetSchema);
      expect(migrationResult.migration.up).toContain('ENABLE ROW LEVEL SECURITY');

      // Generate RLS policies
      const rlsResult = rlsGenerator.generate(targetSchema);
      expect(rlsResult.policies.length).toBeGreaterThan(0);
      expect(rlsResult.policies[0].using).toContain('auth.uid()');

      // Test migration
      const testResult = await sandboxExecutor.testMigration(migrationResult.migration);
      expect(testResult.success).toBe(true);
    });
  });
});

/*
 * =============================================================================
 * Sprint 3.5 Integration Tests: ReviewManager + AuditLogger + MetricsCollector
 * =============================================================================
 */

describe('Review and Audit Integration', () => {
  const createOperation = (overrides?: Partial<OperationDetails>): OperationDetails => ({
    type: 'create',
    target: 'table',
    name: 'users',
    isDestructive: false,
    isAdditive: true,
    modifiesStructure: true,
    affectedElements: ['users'],
    ...overrides,
  });

  describe('ReviewManager -> AuditLogger', () => {
    it('should log review requests in audit', async () => {
      const reviewManager = createReviewManager();
      const auditLogger = createAuditLogger();

      // Create a review request
      const operation = createOperation();
      const reviewRequest = await reviewManager.requestReview(operation);

      // Log the review request in audit
      const entry = await auditLogger.log({
        operation: {
          type: 'create',
          target: 'table',
          name: operation.name,
        },
        input: {
          description: `Review request: ${reviewRequest.id}`,
        },
        result: {
          success: true,
          duration: 50,
        },
        security: {
          riskLevel: reviewRequest.riskLevel,
          validationsPassed: ['review_created'],
          warnings: reviewRequest.warnings,
        },
      });

      expect(entry.security.riskLevel).toBe(reviewRequest.riskLevel);
      expect(entry.input.description).toContain(reviewRequest.id);
    });

    it('should log review decisions in audit', async () => {
      const reviewManager = createReviewManager();
      const auditLogger = createAuditLogger();

      // Create and submit review
      const operation = createOperation({ isDestructive: true });
      const request = await reviewManager.requestReview(operation);
      const decision = await reviewManager.submitDecision(request.id, 'approve', {
        reason: 'Approved by admin',
      });

      // Log the decision
      const entry = await auditLogger.log({
        operation: {
          type: 'modify',
          target: 'table',
          name: operation.name,
        },
        input: {
          description: `Review ${decision.decision}: ${decision.reason}`,
        },
        result: {
          success: decision.approved,
          duration: 100,
        },
        security: {
          riskLevel: 'critical',
          validationsPassed: ['review_approved'],
          warnings: [],
        },
      });

      expect(entry.result.success).toBe(true);
    });
  });

  describe('AuditLogger -> MetricsCollector', () => {
    it('should collect metrics from audit entries', async () => {
      const auditLogger = createAuditLogger();
      const metricsCollector = createMetricsCollector({ auditLogger });

      // Add some audit entries
      for (let i = 0; i < 5; i++) {
        await auditLogger.log({
          operation: {
            type: 'create',
            target: 'table',
            name: `table_${i}`,
          },
          input: {},
          result: {
            success: i < 4, // 4 success, 1 failure
            duration: 100 + i * 10,
          },
          security: {
            riskLevel: i === 4 ? 'high' : 'low',
            validationsPassed: ['test'],
            warnings: [],
          },
        });
      }

      // Collect metrics
      const now = new Date();
      const metrics = await metricsCollector.collect({
        start: new Date(now.getTime() - 60000),
        end: now,
      });

      expect(metrics.totalOperations).toBe(5);
      expect(metrics.successfulOperations).toBe(4);
      expect(metrics.failedValidations).toBe(1);
      expect(metrics.lowRiskOperations).toBe(4);
      expect(metrics.highRiskOperations).toBe(1);
    });

    it('should calculate performance metrics', async () => {
      const auditLogger = createAuditLogger();
      const metricsCollector = createMetricsCollector({ auditLogger });

      // Add entries with varying durations
      for (let i = 0; i < 10; i++) {
        await auditLogger.log({
          operation: { type: 'create', target: 'table', name: `t${i}` },
          input: {},
          result: { success: true, duration: (i + 1) * 10 }, // 10, 20, ..., 100
          security: { riskLevel: 'low', validationsPassed: [], warnings: [] },
        });
      }

      const now = new Date();
      const perfMetrics = metricsCollector.collectPerformanceMetrics({
        start: new Date(now.getTime() - 60000),
        end: now,
      });

      expect(perfMetrics.minExecutionTime).toBe(10);
      expect(perfMetrics.maxExecutionTime).toBe(100);
      expect(perfMetrics.avgExecutionTime).toBe(55); // Average of 10-100
    });
  });

  describe('Full workflow: Review -> Audit -> Metrics', () => {
    it('should track complete operation lifecycle', async () => {
      const reviewManager = createReviewManager();
      const auditLogger = createAuditLogger();
      const metricsCollector = createMetricsCollector({ auditLogger });

      // Step 1: Create review request
      const operation = createOperation({ isDestructive: true });
      const request = await reviewManager.requestReview(operation);
      expect(request.riskLevel).toBe('critical');
      expect(request.autoApproved).toBe(false);

      // Step 2: Log the review request
      await auditLogger.log({
        operation: { type: 'create', target: 'table', name: operation.name },
        input: { description: 'Review requested' },
        result: { success: true, duration: 50 },
        security: {
          riskLevel: request.riskLevel,
          validationsPassed: ['review_created'],
          warnings: request.warnings,
        },
      });

      // Step 3: Submit decision
      const decision = await reviewManager.submitDecision(request.id, 'approve');

      // Step 4: Log the decision
      await auditLogger.log({
        operation: { type: 'modify', target: 'table', name: operation.name },
        input: { description: 'Review approved' },
        result: { success: decision.approved, duration: 100 },
        security: {
          riskLevel: 'critical',
          validationsPassed: ['review_approved'],
          warnings: [],
        },
      });

      // Step 5: Collect metrics
      const now = new Date();
      const metrics = await metricsCollector.collect({
        start: new Date(now.getTime() - 60000),
        end: now,
      });

      expect(metrics.totalOperations).toBe(2);
      expect(metrics.criticalRiskOperations).toBe(2);
      expect(metrics.successfulOperations).toBe(2);
    });

    it('should check system health', async () => {
      const auditLogger = createAuditLogger();
      const metricsCollector = createMetricsCollector({ auditLogger });

      // Add successful operations
      for (let i = 0; i < 10; i++) {
        await auditLogger.log({
          operation: { type: 'create', target: 'table', name: `t${i}` },
          input: {},
          result: { success: true, duration: 100 },
          security: { riskLevel: 'low', validationsPassed: [], warnings: [] },
        });
      }

      // Collect and check health
      const now = new Date();
      await metricsCollector.collect({
        start: new Date(now.getTime() - 60000),
        end: now,
      });

      const health = metricsCollector.checkHealth();
      expect(health.status).toBe('healthy');
      expect(health.score).toBeGreaterThanOrEqual(80);
    });

    it('should generate metrics report', async () => {
      const auditLogger = createAuditLogger();
      const metricsCollector = createMetricsCollector({ auditLogger });

      // Add some entries
      await auditLogger.log({
        operation: { type: 'create', target: 'table', name: 'test' },
        input: {},
        result: { success: true, duration: 100 },
        security: { riskLevel: 'low', validationsPassed: [], warnings: [] },
      });

      const now = new Date();
      const report = metricsCollector.generateReport({
        start: new Date(now.getTime() - 60000),
        end: now,
      });

      expect(report).toContain('# Rapport de Métriques');
      expect(report).toContain('Santé du Système');
      expect(report).toContain('Performance');
    });
  });

  describe('Review statistics', () => {
    it('should track review statistics', async () => {
      const reviewManager = createReviewManager();

      // Create multiple reviews with different outcomes
      const op1 = createOperation({ isDestructive: true, name: 'op1' });
      const op2 = createOperation({ isDestructive: true, name: 'op2' });
      const op3 = createOperation({ isDestructive: true, name: 'op3' });

      const req1 = await reviewManager.requestReview(op1);
      const req2 = await reviewManager.requestReview(op2);
      const req3 = await reviewManager.requestReview(op3);

      await reviewManager.submitDecision(req1.id, 'approve');
      await reviewManager.submitDecision(req2.id, 'reject');
      await reviewManager.submitDecision(req3.id, 'modify');

      const stats = reviewManager.getStatistics();
      expect(stats.approved).toBe(1);
      expect(stats.rejected).toBe(1);
      expect(stats.modified).toBe(1);
    });
  });
});
