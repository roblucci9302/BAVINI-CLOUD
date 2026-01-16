/**
 * Tests pour MigrationGenerator
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MigrationGenerator, createMigrationGenerator } from './MigrationGenerator';
import type { Schema, Table, Column, RLSPolicy } from '../types';

describe('MigrationGenerator', () => {
  let generator: MigrationGenerator;

  beforeEach(() => {
    generator = createMigrationGenerator();
  });

  const createTestColumn = (overrides?: Partial<Column>): Column => ({
    name: 'id',
    type: 'uuid',
    nullable: false,
    isPrimaryKey: true,
    isForeignKey: false,
    isUnique: true,
    defaultValue: 'gen_random_uuid()',
    ...overrides,
  });

  const createTestTable = (overrides?: Partial<Table>): Table => ({
    name: 'users',
    schema: 'public',
    columns: [
      createTestColumn(),
      createTestColumn({ name: 'email', type: 'text', isPrimaryKey: false, isUnique: true, defaultValue: undefined }),
      createTestColumn({
        name: 'created_at',
        type: 'timestamptz',
        isPrimaryKey: false,
        isUnique: false,
        defaultValue: 'now()',
      }),
    ],
    indexes: [],
    constraints: [],
    ...overrides,
  });

  const createEmptySchema = (): Schema => ({
    tables: [],
    rls: [],
    functions: [],
    triggers: [],
    indexes: [],
    enums: [],
  });

  const createTestSchema = (tables: Table[] = [createTestTable()]): Schema => ({
    tables,
    rls: [],
    functions: [],
    triggers: [],
    indexes: [],
    enums: [],
  });

  describe('generate', () => {
    it('should generate migration for new table', () => {
      const current = createEmptySchema();
      const target = createTestSchema();

      const result = generator.generate(current, target, 'add_users_table');

      expect(result.migration.up).toContain('CREATE TABLE');
      expect(result.migration.up).toContain('users');
      expect(result.diff.addedTables.length).toBe(1);
      expect(result.affectedTables).toContain('users');
    });

    it('should generate migration for dropped table', () => {
      const current = createTestSchema();
      const target = createEmptySchema();

      const result = generator.generate(current, target, 'drop_users_table');

      expect(result.migration.up).toContain('DROP TABLE');
      expect(result.diff.removedTables.length).toBe(1);
      expect(result.isDestructive).toBe(true);
    });

    it('should generate migration for added column', () => {
      const current = createTestSchema();
      const target = createTestSchema([
        createTestTable({
          columns: [
            ...createTestTable().columns,
            createTestColumn({
              name: 'bio',
              type: 'text',
              isPrimaryKey: false,
              isUnique: false,
              nullable: true,
              defaultValue: undefined,
            }),
          ],
        }),
      ]);

      const result = generator.generate(current, target, 'add_bio_column');

      expect(result.migration.up).toContain('ADD COLUMN');
      expect(result.migration.up).toContain('bio');
      expect(result.diff.modifiedTables.length).toBe(1);
      expect(result.diff.modifiedTables[0].addedColumns.length).toBe(1);
    });

    it('should generate migration for dropped column', () => {
      const current = createTestSchema([
        createTestTable({
          columns: [
            ...createTestTable().columns,
            createTestColumn({
              name: 'temp_column',
              type: 'text',
              isPrimaryKey: false,
              isUnique: false,
              nullable: true,
              defaultValue: undefined,
            }),
          ],
        }),
      ]);
      const target = createTestSchema();

      const result = generator.generate(current, target, 'drop_temp_column');

      expect(result.migration.up).toContain('DROP COLUMN');
      expect(result.isDestructive).toBe(true);
    });

    it('should generate rollback SQL', () => {
      const current = createEmptySchema();
      const target = createTestSchema();

      const result = generator.generate(current, target);

      expect(result.migration.down).toContain('DROP TABLE');
      expect(result.migration.down.length).toBeGreaterThan(0);
    });

    it('should generate unique migration ID', () => {
      const current = createEmptySchema();
      const target = createTestSchema();

      const result1 = generator.generate(current, target, 'test1');
      const result2 = generator.generate(current, target, 'test2');

      expect(result1.migration.id).not.toBe(result2.migration.id);
    });

    it('should generate checksum for migration', () => {
      const current = createEmptySchema();
      const target = createTestSchema();

      const result = generator.generate(current, target);

      expect(result.migration.checksum).toBeDefined();
      expect(result.migration.checksum.length).toBe(16);
    });
  });

  describe('computeDiff', () => {
    it('should detect added tables', () => {
      const current = createEmptySchema();
      const target = createTestSchema();

      const diff = generator.computeDiff(current, target);

      expect(diff.addedTables.length).toBe(1);
      expect(diff.addedTables[0].name).toBe('users');
    });

    it('should detect removed tables', () => {
      const current = createTestSchema();
      const target = createEmptySchema();

      const diff = generator.computeDiff(current, target);

      expect(diff.removedTables.length).toBe(1);
    });

    it('should detect modified columns', () => {
      const current = createTestSchema();
      const target = createTestSchema([
        createTestTable({
          columns: [
            createTestColumn(),
            createTestColumn({ name: 'email', type: 'varchar', isPrimaryKey: false, isUnique: true }), // Changed type
            createTestColumn({
              name: 'created_at',
              type: 'timestamptz',
              isPrimaryKey: false,
              isUnique: false,
              defaultValue: 'now()',
            }),
          ],
        }),
      ]);

      const diff = generator.computeDiff(current, target);

      expect(diff.modifiedTables.length).toBe(1);
      expect(diff.modifiedTables[0].modifiedColumns.length).toBe(1);
      expect(diff.modifiedTables[0].modifiedColumns[0].name).toBe('email');
    });

    it('should detect added policies', () => {
      const current = createTestSchema();
      const target: Schema = {
        ...createTestSchema(),
        rls: [
          {
            name: 'users_select_own',
            table: 'users',
            action: 'SELECT',
            roles: ['authenticated'],
            using: 'id = auth.uid()',
            permissive: true,
          },
        ],
      };

      const diff = generator.computeDiff(current, target);

      expect(diff.addedPolicies.length).toBe(1);
    });

    it('should detect removed policies', () => {
      const current: Schema = {
        ...createTestSchema(),
        rls: [
          {
            name: 'users_select_own',
            table: 'users',
            action: 'SELECT',
            roles: ['authenticated'],
            using: 'id = auth.uid()',
            permissive: true,
          },
        ],
      };
      const target = createTestSchema();

      const diff = generator.computeDiff(current, target);

      expect(diff.removedPolicies.length).toBe(1);
    });
  });

  describe('SQL generation', () => {
    it('should generate valid CREATE TABLE SQL', () => {
      const current = createEmptySchema();
      const target = createTestSchema();

      const result = generator.generate(current, target);

      expect(result.migration.up).toContain('CREATE TABLE IF NOT EXISTS users');
      expect(result.migration.up).toContain('id uuid');
      expect(result.migration.up).toContain('NOT NULL');
      expect(result.migration.up).toContain('PRIMARY KEY');
      expect(result.migration.up).toContain('ENABLE ROW LEVEL SECURITY');
    });

    it('should generate foreign key constraints', () => {
      const current = createEmptySchema();
      const target = createTestSchema([
        createTestTable(),
        createTestTable({
          name: 'posts',
          columns: [
            createTestColumn(),
            createTestColumn({
              name: 'user_id',
              type: 'uuid',
              isPrimaryKey: false,
              isUnique: false,
              isForeignKey: true,
              references: { table: 'users', column: 'id', onDelete: 'CASCADE' },
              defaultValue: undefined,
            }),
          ],
        }),
      ]);

      const result = generator.generate(current, target);

      expect(result.migration.up).toContain('FOREIGN KEY');
      expect(result.migration.up).toContain('REFERENCES users(id)');
      expect(result.migration.up).toContain('ON DELETE CASCADE');
    });

    it('should generate CREATE INDEX SQL', () => {
      const current = createTestSchema();
      const target = createTestSchema([
        createTestTable({
          indexes: [
            {
              name: 'users_email_idx',
              table: 'users',
              columns: ['email'],
              isUnique: true,
            },
          ],
        }),
      ]);

      const result = generator.generate(current, target);

      expect(result.migration.up).toContain('CREATE UNIQUE INDEX');
      expect(result.migration.up).toContain('users_email_idx');
    });

    it('should generate CREATE POLICY SQL', () => {
      const current = createTestSchema();
      const target: Schema = {
        ...createTestSchema(),
        rls: [
          {
            name: 'users_policy',
            table: 'users',
            action: 'SELECT',
            roles: ['authenticated'],
            using: 'id = auth.uid()',
            permissive: true,
          },
        ],
      };

      const result = generator.generate(current, target);

      expect(result.migration.up).toContain('CREATE POLICY');
      expect(result.migration.up).toContain('users_policy');
      expect(result.migration.up).toContain('USING');
    });
  });

  describe('warnings', () => {
    it('should warn about dropped tables', () => {
      const current = createTestSchema();
      const target = createEmptySchema();

      const result = generator.generate(current, target);

      expect(result.warnings.some((w) => w.includes('supprimées'))).toBe(true);
    });

    it('should warn about dropped columns', () => {
      const current = createTestSchema([
        createTestTable({
          columns: [
            ...createTestTable().columns,
            createTestColumn({ name: 'temp', type: 'text', isPrimaryKey: false, isUnique: false, nullable: true }),
          ],
        }),
      ]);
      const target = createTestSchema();

      const result = generator.generate(current, target);

      expect(result.warnings.some((w) => w.includes('Colonnes supprimées'))).toBe(true);
    });

    it('should warn about type changes', () => {
      const current = createTestSchema();
      const target = createTestSchema([
        createTestTable({
          columns: [
            createTestColumn(),
            createTestColumn({ name: 'email', type: 'varchar', isPrimaryKey: false, isUnique: true }), // Changed from text to varchar
            createTestColumn({
              name: 'created_at',
              type: 'timestamptz',
              isPrimaryKey: false,
              isUnique: false,
              defaultValue: 'now()',
            }),
          ],
        }),
      ]);

      const result = generator.generate(current, target);

      expect(result.warnings.some((w) => w.includes('Changement de type'))).toBe(true);
    });
  });

  describe('validateRollback', () => {
    it('should validate migration with proper rollback', () => {
      const current = createEmptySchema();
      const target = createTestSchema();

      const result = generator.generate(current, target);
      const validation = generator.validateRollback(result.migration);

      expect(validation.isValid).toBe(true);
      expect(validation.issues.length).toBe(0);
    });

    it('should detect empty rollback', () => {
      const migration = generator.createEmptyMigration('test');
      const validation = generator.validateRollback(migration);

      expect(validation.isValid).toBe(false);
      expect(validation.issues.some((i) => i.includes('vide'))).toBe(true);
    });

    it('should detect non-reversible operations', () => {
      const migration = {
        id: 'test',
        name: 'test',
        timestamp: Date.now(),
        up: 'TRUNCATE TABLE users;',
        down: 'SELECT 1;',
        checksum: '',
      };

      const validation = generator.validateRollback(migration);

      expect(validation.isValid).toBe(false);
      expect(validation.issues.some((i) => i.includes('non-réversible'))).toBe(true);
    });
  });

  describe('createEmptyMigration', () => {
    it('should create empty migration with placeholder', () => {
      const migration = generator.createEmptyMigration('custom_migration');

      expect(migration.name).toBe('custom_migration');
      expect(migration.up).toContain('Add your migration SQL here');
      expect(migration.down).toContain('Add rollback SQL here');
    });
  });
});

describe('createMigrationGenerator', () => {
  it('should create generator with default options', () => {
    const generator = createMigrationGenerator();
    expect(generator).toBeInstanceOf(MigrationGenerator);
  });

  it('should create generator with custom options', () => {
    const generator = createMigrationGenerator({
      schemaName: 'custom',
      generateRollback: false,
    });
    expect(generator).toBeInstanceOf(MigrationGenerator);
  });
});
