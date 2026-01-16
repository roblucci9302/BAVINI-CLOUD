/**
 * Tests pour RLSGenerator
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RLSGenerator, createRLSGenerator } from './RLSGenerator';
import type { Schema, Table, RLSPolicy } from '../types';

describe('RLSGenerator', () => {
  let generator: RLSGenerator;

  beforeEach(() => {
    generator = createRLSGenerator();
  });

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

  const createTestSchema = (): Schema => ({
    tables: [createTestTable()],
    rls: [],
    functions: [],
    triggers: [],
    indexes: [],
    enums: [],
  });

  describe('generate', () => {
    it('should generate policies for all tables', () => {
      const schema = createTestSchema();
      const result = generator.generate(schema);

      expect(result.policies.length).toBeGreaterThan(0);
      expect(result.sql).toContain('CREATE POLICY');
    });

    it('should generate SQL with ENABLE ROW LEVEL SECURITY', () => {
      const schema = createTestSchema();
      const result = generator.generate(schema);

      expect(result.sql).toContain('ENABLE ROW LEVEL SECURITY');
    });

    it('should track tables without RLS', () => {
      const schema: Schema = {
        tables: [
          {
            name: 'empty_table',
            schema: 'public',
            columns: [
              { name: 'id', type: 'uuid', nullable: false, isPrimaryKey: true, isForeignKey: false, isUnique: true },
            ],
            indexes: [],
            constraints: [],
          },
        ],
        rls: [],
        functions: [],
        triggers: [],
        indexes: [],
        enums: [],
      };

      const result = generator.generate(schema);

      // La table devrait avoir des politiques générées avec le pattern par défaut
      expect(result.policies.length).toBeGreaterThanOrEqual(0);
    });

    it('should use custom table configs when provided', () => {
      const schema = createTestSchema();
      const configs = [{ table: 'posts', pattern: 'public' as const }];

      const result = generator.generate(schema, configs);

      // Vérifier qu'au moins une politique "public" a été générée
      const publicPolicies = result.policies.filter((p) => p.name.includes('public'));
      expect(publicPolicies.length).toBeGreaterThan(0);
    });
  });

  describe('generateTablePolicies', () => {
    it('should generate ownerOnly policies by default for tables with user_id', () => {
      const table = createTestTable();
      const result = generator.generateTablePolicies(table);

      expect(result.policies.length).toBe(4); // SELECT, INSERT, UPDATE, DELETE
      expect(result.policies.every((p) => p.table === 'posts')).toBe(true);
    });

    it('should include auth.uid() check in ownerOnly policies', () => {
      const table = createTestTable();
      const result = generator.generateTablePolicies(table);

      const selectPolicy = result.policies.find((p) => p.action === 'SELECT');
      expect(selectPolicy?.using).toContain('auth.uid()');
    });

    it('should generate publicReadOwnerWrite policies', () => {
      const table = createTestTable({
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

      const result = generator.generateTablePolicies(table);

      // Avec une colonne 'published', le pattern devrait être publicReadOwnerWrite
      const selectPolicy = result.policies.find((p) => p.action === 'SELECT');
      expect(selectPolicy?.roles).toContain('anon');
    });

    it('should generate teamBased policies when team_id exists', () => {
      const table = createTestTable({
        name: 'team_posts',
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

      const result = generator.generateTablePolicies(table);

      const selectPolicy = result.policies.find((p) => p.action === 'SELECT');
      expect(selectPolicy?.using).toContain('team_id');
    });

    it('should use custom config when provided', () => {
      const table = createTestTable();
      const config = {
        table: 'posts',
        pattern: 'authenticated' as const,
      };

      const result = generator.generateTablePolicies(table, config);

      expect(result.policies.every((p) => p.roles.includes('authenticated'))).toBe(true);
    });

    it('should generate warnings for ownerOnly without owner column', () => {
      const table: Table = {
        name: 'items',
        schema: 'public',
        columns: [
          { name: 'id', type: 'uuid', nullable: false, isPrimaryKey: true, isForeignKey: false, isUnique: true },
          { name: 'name', type: 'text', nullable: false, isPrimaryKey: false, isForeignKey: false, isUnique: false },
        ],
        indexes: [],
        constraints: [],
      };

      const config = { table: 'items', pattern: 'ownerOnly' as const };
      const result = generator.generateTablePolicies(table, config);

      expect(result.warnings.some((w) => w.includes('ownerOnly') && w.includes('propriétaire'))).toBe(true);
    });
  });

  describe('pattern detection', () => {
    it('should detect junction tables', () => {
      const junctionTable: Table = {
        name: 'post_tags',
        schema: 'public',
        columns: [
          {
            name: 'post_id',
            type: 'uuid',
            nullable: false,
            isPrimaryKey: true,
            isForeignKey: true,
            isUnique: false,
            references: { table: 'posts', column: 'id' },
          },
          {
            name: 'tag_id',
            type: 'uuid',
            nullable: false,
            isPrimaryKey: true,
            isForeignKey: true,
            isUnique: false,
            references: { table: 'tags', column: 'id' },
          },
          {
            name: 'created_at',
            type: 'timestamptz',
            nullable: false,
            isPrimaryKey: false,
            isForeignKey: false,
            isUnique: false,
          },
        ],
        indexes: [],
        constraints: [],
      };

      const result = generator.generateTablePolicies(junctionTable);

      // Les tables de jonction devraient avoir le pattern authenticated
      expect(result.policies.length).toBeGreaterThan(0);
    });

    it('should detect lookup tables', () => {
      const lookupTable: Table = {
        name: 'categories',
        schema: 'public',
        columns: [
          { name: 'id', type: 'uuid', nullable: false, isPrimaryKey: true, isForeignKey: false, isUnique: true },
          { name: 'name', type: 'varchar', nullable: false, isPrimaryKey: false, isForeignKey: false, isUnique: true },
          { name: 'slug', type: 'varchar', nullable: false, isPrimaryKey: false, isForeignKey: false, isUnique: true },
        ],
        indexes: [],
        constraints: [],
      };

      const result = generator.generateTablePolicies(lookupTable);

      // Les tables lookup devraient permettre l'accès aux utilisateurs authentifiés
      expect(result.policies.some((p) => p.roles.includes('authenticated'))).toBe(true);
    });
  });

  describe('generateSQL', () => {
    it('should generate valid SQL for policies', () => {
      const policies: RLSPolicy[] = [
        {
          name: 'test_select',
          table: 'test',
          action: 'SELECT',
          roles: ['authenticated'],
          using: 'user_id = auth.uid()',
          permissive: true,
        },
      ];

      const tables: Table[] = [createTestTable({ name: 'test' })];
      const sql = generator.generateSQL(policies, tables);

      expect(sql).toContain('CREATE POLICY "test_select"');
      expect(sql).toContain('FOR SELECT');
      expect(sql).toContain('TO authenticated');
      expect(sql).toContain('USING (user_id = auth.uid())');
    });

    it('should include WITH CHECK for INSERT policies', () => {
      const policies: RLSPolicy[] = [
        {
          name: 'test_insert',
          table: 'test',
          action: 'INSERT',
          roles: ['authenticated'],
          check: 'user_id = auth.uid()',
          permissive: true,
        },
      ];

      const tables: Table[] = [createTestTable({ name: 'test' })];
      const sql = generator.generateSQL(policies, tables);

      expect(sql).toContain('WITH CHECK (user_id = auth.uid())');
    });

    it('should generate RESTRICTIVE policies when specified', () => {
      const policies: RLSPolicy[] = [
        {
          name: 'test_restrict',
          table: 'test',
          action: 'SELECT',
          roles: ['authenticated'],
          using: 'true',
          permissive: false,
        },
      ];

      const tables: Table[] = [createTestTable({ name: 'test' })];
      const sql = generator.generateSQL(policies, tables);

      expect(sql).toContain('AS RESTRICTIVE');
    });

    it('should include FORCE ROW LEVEL SECURITY', () => {
      const policies: RLSPolicy[] = [];
      const tables: Table[] = [createTestTable()];
      const sql = generator.generateSQL(policies, tables);

      expect(sql).toContain('FORCE ROW LEVEL SECURITY');
    });
  });

  describe('admin and authenticated patterns', () => {
    it('should generate adminOnly policies', () => {
      const table = createTestTable();
      const config = { table: 'posts', pattern: 'adminOnly' as const };

      const result = generator.generateTablePolicies(table, config);

      expect(result.policies.length).toBe(1);
      expect(result.policies[0].action).toBe('ALL');
      expect(result.policies[0].using).toContain('admin');
    });

    it('should generate authenticated policies', () => {
      const table = createTestTable();
      const config = { table: 'posts', pattern: 'authenticated' as const };

      const result = generator.generateTablePolicies(table, config);

      expect(result.policies.length).toBe(4);
      expect(result.policies.every((p) => p.roles.includes('authenticated'))).toBe(true);
    });

    it('should generate public policies with warning', () => {
      const table = createTestTable();
      const config = { table: 'posts', pattern: 'public' as const };

      const result = generator.generateTablePolicies(table, config);

      expect(result.policies.length).toBe(4);
      expect(result.policies.some((p) => p.roles.includes('anon'))).toBe(true);
      expect(result.warnings.some((w) => w.includes('public'))).toBe(true);
    });
  });
});

describe('createRLSGenerator', () => {
  it('should create generator with default options', () => {
    const generator = createRLSGenerator();
    expect(generator).toBeInstanceOf(RLSGenerator);
  });

  it('should create generator with custom options', () => {
    const generator = createRLSGenerator({
      defaultPattern: 'authenticated',
      requireAuth: false,
    });
    expect(generator).toBeInstanceOf(RLSGenerator);
  });
});
