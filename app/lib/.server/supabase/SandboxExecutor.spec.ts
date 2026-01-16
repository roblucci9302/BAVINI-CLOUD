/**
 * Tests pour SandboxExecutor
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SandboxExecutor, createSandboxExecutor } from './SandboxExecutor';
import type { Migration, TestQuery } from './types';

describe('SandboxExecutor', () => {
  let executor: SandboxExecutor;

  beforeEach(() => {
    executor = createSandboxExecutor({
      cleanupDelay: 100, // Fast cleanup for tests
    });
  });

  afterEach(async () => {
    await executor.cleanupAll();
  });

  const createTestMigration = (overrides?: Partial<Migration>): Migration => ({
    id: 'test_migration_001',
    name: 'test_migration',
    timestamp: Date.now(),
    up: 'CREATE TABLE IF NOT EXISTS test_table (id uuid PRIMARY KEY);',
    down: 'DROP TABLE IF EXISTS test_table;',
    checksum: 'abc123',
    ...overrides,
  });

  describe('validateSQL', () => {
    it('should validate correct SQL', () => {
      const result = executor.validateSQL('SELECT * FROM users;');
      expect(result.isValid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('should reject CREATE DATABASE', () => {
      const result = executor.validateSQL('CREATE DATABASE malicious_db;');
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.code === 'DANGEROUS_OPERATION')).toBe(true);
    });

    it('should reject DROP DATABASE', () => {
      const result = executor.validateSQL('DROP DATABASE production_db;');
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.code === 'DANGEROUS_OPERATION')).toBe(true);
    });

    it('should reject ALTER SYSTEM', () => {
      const result = executor.validateSQL('ALTER SYSTEM SET some_setting = true;');
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.code === 'DANGEROUS_OPERATION')).toBe(true);
    });

    it('should reject COPY FROM PROGRAM', () => {
      const result = executor.validateSQL("COPY users FROM PROGRAM 'cat /etc/passwd';");
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.code === 'DANGEROUS_OPERATION')).toBe(true);
    });

    it('should reject pg_terminate_backend', () => {
      const result = executor.validateSQL('SELECT pg_terminate_backend(1234);');
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.code === 'DANGEROUS_OPERATION')).toBe(true);
    });

    it('should reject pg_cancel_backend', () => {
      const result = executor.validateSQL('SELECT pg_cancel_backend(1234);');
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.code === 'DANGEROUS_OPERATION')).toBe(true);
    });

    it('should detect unbalanced parentheses - missing close', () => {
      const result = executor.validateSQL('SELECT * FROM users WHERE (id = 1;');
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.code === 'SYNTAX_ERROR')).toBe(true);
    });

    it('should detect unbalanced parentheses - extra close', () => {
      const result = executor.validateSQL('SELECT * FROM users WHERE id = 1);');
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.code === 'SYNTAX_ERROR')).toBe(true);
    });

    it('should accept balanced parentheses', () => {
      const result = executor.validateSQL("SELECT * FROM users WHERE (id = 1) AND (name = 'test');");
      expect(result.isValid).toBe(true);
    });

    it('should reject SQL exceeding max length', () => {
      const largeSQL = 'SELECT ' + 'a'.repeat(1000001);
      const result = executor.validateSQL(largeSQL);
      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.code === 'SQL_TOO_LARGE')).toBe(true);
    });

    it('should allow normal CREATE TABLE', () => {
      const result = executor.validateSQL('CREATE TABLE users (id uuid PRIMARY KEY);');
      expect(result.isValid).toBe(true);
    });

    it('should allow DROP TABLE', () => {
      const result = executor.validateSQL('DROP TABLE IF EXISTS test_table;');
      expect(result.isValid).toBe(true);
    });
  });

  describe('execute', () => {
    it('should execute valid SQL successfully', async () => {
      const result = await executor.execute('CREATE TABLE test (id uuid PRIMARY KEY);');

      expect(result.success).toBe(true);
      expect(result.executionTime).toBeGreaterThanOrEqual(0);
      expect(result.errors.length).toBe(0);
    });

    it('should return error for dangerous SQL', async () => {
      const result = await executor.execute('DROP DATABASE production;');

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].code).toBe('DANGEROUS_OPERATION');
    });

    it('should capture schema when enabled', async () => {
      const executor = createSandboxExecutor({ captureSchema: true });
      const result = await executor.execute('CREATE TABLE test (id uuid PRIMARY KEY);');

      expect(result.success).toBe(true);
      expect(result.schema).toBeDefined();
      await executor.cleanupAll();
    });

    it('should track execution time', async () => {
      const result = await executor.execute('SELECT 1;');

      expect(result.executionTime).toBeGreaterThanOrEqual(0);
    });

    it('should handle INSERT statements', async () => {
      const result = await executor.execute("INSERT INTO users (id, name) VALUES ('1', 'test');");

      expect(result.success).toBe(true);
      expect(result.affectedRows).toBeGreaterThanOrEqual(1);
    });

    it('should handle multiple VALUES in INSERT', async () => {
      const result = await executor.execute(`
        INSERT INTO users (id, name) VALUES
          ('1', 'test1'),
          ('2', 'test2'),
          ('3', 'test3');
      `);

      expect(result.success).toBe(true);
      expect(result.affectedRows).toBe(3);
    });

    it('should detect DROP operations and add warnings', async () => {
      const result = await executor.execute('DROP TABLE IF EXISTS old_table;');

      expect(result.success).toBe(true);
      expect(result.warnings.some((w) => w.includes('DROP'))).toBe(true);
    });

    it('should handle multiple statements', async () => {
      const result = await executor.execute(`
        CREATE TABLE a (id uuid PRIMARY KEY);
        CREATE TABLE b (id uuid PRIMARY KEY);
        CREATE TABLE c (id uuid PRIMARY KEY);
      `);

      expect(result.success).toBe(true);
    });
  });

  describe('testMigration', () => {
    it('should test valid migration successfully', async () => {
      const migration = createTestMigration();
      const result = await executor.testMigration(migration);

      expect(result.success).toBe(true);
      expect(result.executionTime).toBeGreaterThanOrEqual(0);
    });

    it('should fail on invalid UP migration', async () => {
      const migration = createTestMigration({
        up: 'DROP DATABASE production;',
      });

      const result = await executor.testMigration(migration);

      expect(result.success).toBe(false);
      expect(result.phase).toBe('up');
      expect(result.error).toBeDefined();
    });

    it('should fail on invalid DOWN migration', async () => {
      const migration = createTestMigration({
        up: 'CREATE TABLE test (id uuid PRIMARY KEY);',
        down: 'DROP DATABASE production;',
      });

      const result = await executor.testMigration(migration);

      expect(result.success).toBe(false);
      expect(result.phase).toBe('down');
      expect(result.warning).toContain('non réversible');
    });

    it('should succeed with empty DOWN migration', async () => {
      const migration = createTestMigration({
        up: 'CREATE TABLE test (id uuid PRIMARY KEY);',
        down: '',
      });

      const result = await executor.testMigration(migration);

      expect(result.success).toBe(true);
    });

    it('should return schema after successful UP', async () => {
      const migration = createTestMigration();
      const result = await executor.testMigration(migration);

      expect(result.success).toBe(true);
      expect(result.schemaAfterUp).toBeDefined();
    });
  });

  describe('testRegression', () => {
    const testQueries: TestQuery[] = [
      {
        name: 'Query users',
        sql: 'SELECT * FROM users;',
        critical: true,
      },
      {
        name: 'Query posts',
        sql: 'SELECT * FROM posts;',
        critical: false,
      },
    ];

    it('should run regression tests after migration', async () => {
      const migration = createTestMigration();
      const result = await executor.testRegression(migration, testQueries);

      expect(result.migrationFailed).toBe(false);

      // Tests may fail because tables don't exist, but migration should succeed
    });

    it('should fail if migration fails', async () => {
      const migration = createTestMigration({
        up: 'DROP DATABASE production;',
      });

      const result = await executor.testRegression(migration, testQueries);

      expect(result.success).toBe(false);
      expect(result.migrationFailed).toBe(true);
      expect(result.failures.length).toBe(0);
    });

    it('should track query failures', async () => {
      const migration = createTestMigration();
      const queriesWithFailure: TestQuery[] = [
        {
          name: 'Invalid query',
          sql: 'DROP DATABASE production;', // Will fail validation
          critical: true,
        },
      ];

      const result = await executor.testRegression(migration, queriesWithFailure);

      expect(result.failures.length).toBeGreaterThan(0);
    });

    it('should distinguish critical and non-critical failures', async () => {
      const migration = createTestMigration();
      const mixedQueries: TestQuery[] = [
        {
          name: 'Critical failure',
          sql: 'DROP DATABASE x;',
          critical: true,
        },
        {
          name: 'Non-critical failure',
          sql: 'DROP DATABASE y;',
          critical: false,
        },
      ];

      const result = await executor.testRegression(migration, mixedQueries);

      expect(result.failures.some((f) => f.severity === 'critical')).toBe(true);
      expect(result.failures.some((f) => f.severity === 'warning')).toBe(true);
    });

    it('should succeed if no critical failures', async () => {
      const migration = createTestMigration();
      const nonCriticalQueries: TestQuery[] = [
        {
          name: 'Select query',
          sql: 'SELECT 1;',
          critical: false,
        },
      ];

      const result = await executor.testRegression(migration, nonCriticalQueries);

      expect(result.success).toBe(true);
    });
  });

  describe('rewriteForSandbox', () => {
    it('should replace public schema with sandbox schema', () => {
      const sql = 'SELECT * FROM public.users;';
      const rewritten = executor.rewriteForSandbox(sql, '_sandbox_test');

      expect(rewritten).toContain('_sandbox_test.users');
      expect(rewritten).not.toContain('public.users');
    });

    it('should add search_path at the beginning', () => {
      const sql = 'SELECT 1;';
      const rewritten = executor.rewriteForSandbox(sql, '_sandbox_test');

      expect(rewritten).toMatch(/^SET search_path TO _sandbox_test/);
    });

    it('should handle multiple public references', () => {
      const sql = 'SELECT * FROM public.users JOIN public.posts ON public.users.id = public.posts.user_id;';
      const rewritten = executor.rewriteForSandbox(sql, '_sandbox_abc');

      expect(rewritten).not.toContain('public.');
      expect(rewritten.match(/_sandbox_abc\./g)?.length).toBeGreaterThanOrEqual(4);
    });

    it('should be case insensitive', () => {
      const sql = 'SELECT * FROM PUBLIC.users;';
      const rewritten = executor.rewriteForSandbox(sql, '_sandbox_test');

      expect(rewritten).toContain('_sandbox_test.users');
    });
  });

  describe('sandbox management', () => {
    it('should track active sandboxes', async () => {
      await executor.execute('SELECT 1;');

      const active = executor.getActiveSandboxes();
      expect(active.length).toBeGreaterThanOrEqual(1);
    });

    it('should cleanup sandbox after delay', async () => {
      await executor.execute('SELECT 1;');

      const beforeCleanup = executor.getActiveSandboxes();
      expect(beforeCleanup.length).toBeGreaterThan(0);

      // Wait for cleanup
      await new Promise((resolve) => setTimeout(resolve, 200));

      const afterCleanup = executor.getActiveSandboxes();
      expect(afterCleanup.length).toBe(0);
    });

    it('should cleanup all sandboxes', async () => {
      await executor.execute('SELECT 1;');
      await executor.execute('SELECT 2;');
      await executor.execute('SELECT 3;');

      const before = executor.getActiveSandboxes();
      expect(before.length).toBeGreaterThan(0);

      await executor.cleanupAll();

      const after = executor.getActiveSandboxes();
      expect(after.length).toBe(0);
    });

    it('should check if sandbox is active', async () => {
      await executor.execute('SELECT 1;');

      const sandboxes = executor.getActiveSandboxes();

      if (sandboxes.length > 0) {
        const isActive = executor.isSandboxActive(sandboxes[0].sandboxId);
        expect(isActive).toBe(true);
      }
    });

    it('should return false for non-existent sandbox', () => {
      const isActive = executor.isSandboxActive('non_existent_id');
      expect(isActive).toBe(false);
    });
  });

  describe('SQL parsing', () => {
    it('should handle statements with semicolons in strings', async () => {
      const sql = "INSERT INTO messages (content) VALUES ('Hello; World');";
      const result = await executor.execute(sql);

      expect(result.success).toBe(true);
    });

    it('should handle statements with quotes', async () => {
      const sql = `INSERT INTO users (name) VALUES ('O''Brien');`;
      const result = await executor.execute(sql);

      expect(result.success).toBe(true);
    });

    it('should handle empty statements', async () => {
      const sql = ';;;';
      const result = await executor.execute(sql);

      expect(result.success).toBe(true);
    });
  });

  describe('execution warnings', () => {
    it('should warn about ADD COLUMN NOT NULL without DEFAULT', async () => {
      const sql = 'ALTER TABLE users ADD COLUMN status text NOT NULL;';
      const result = await executor.execute(sql);

      expect(result.warnings.some((w) => w.includes('NOT NULL') || w.includes('DEFAULT'))).toBe(true);
    });

    it('should not warn about ADD COLUMN NOT NULL with DEFAULT', async () => {
      const sql = "ALTER TABLE users ADD COLUMN status text NOT NULL DEFAULT 'active';";
      const result = await executor.execute(sql);

      // Should not have the specific warning about NOT NULL without DEFAULT
      const hasWarning = result.warnings.some((w) => w.includes('NOT NULL sans DEFAULT'));
      expect(hasWarning).toBe(false);
    });
  });
});

describe('createSandboxExecutor', () => {
  it('should create executor with default options', () => {
    const executor = createSandboxExecutor();
    expect(executor).toBeInstanceOf(SandboxExecutor);
  });

  it('should create executor with custom options', () => {
    const executor = createSandboxExecutor({
      sandboxPrefix: '_custom_',
      cleanupDelay: 10000,
      maxExecutionTime: 60000,
      captureSchema: false,
    });

    expect(executor).toBeInstanceOf(SandboxExecutor);
  });

  it('should use custom sandbox prefix', () => {
    const executor = createSandboxExecutor({
      sandboxPrefix: '_myprefix_',
    });

    const rewritten = executor.rewriteForSandbox('SELECT 1;', '_myprefix_test');
    expect(rewritten).toContain('_myprefix_test');
  });
});
