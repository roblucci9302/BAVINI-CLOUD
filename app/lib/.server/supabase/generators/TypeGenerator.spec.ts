/**
 * Tests pour TypeGenerator
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TypeGenerator, createTypeGenerator } from './TypeGenerator';
import type { Schema } from '../types';

describe('TypeGenerator', () => {
  let generator: TypeGenerator;

  beforeEach(() => {
    generator = createTypeGenerator();
  });

  const createTestSchema = (): Schema => ({
    tables: [
      {
        name: 'users',
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
          { name: 'email', type: 'text', nullable: false, isPrimaryKey: false, isForeignKey: false, isUnique: true },
          { name: 'name', type: 'text', nullable: true, isPrimaryKey: false, isForeignKey: false, isUnique: false },
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
      },
      {
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
          { name: 'title', type: 'text', nullable: false, isPrimaryKey: false, isForeignKey: false, isUnique: false },
          {
            name: 'user_id',
            type: 'uuid',
            nullable: false,
            isPrimaryKey: false,
            isForeignKey: true,
            isUnique: false,
            references: { table: 'users', column: 'id', onDelete: 'CASCADE' },
          },
          {
            name: 'metadata',
            type: 'jsonb',
            nullable: true,
            isPrimaryKey: false,
            isForeignKey: false,
            isUnique: false,
          },
        ],
        indexes: [],
        constraints: [],
      },
    ],
    rls: [],
    functions: [],
    triggers: [],
    indexes: [],
    enums: [{ name: 'post_status', values: ['draft', 'published', 'archived'] }],
  });

  describe('generate', () => {
    it('should generate types for all tables', () => {
      const schema = createTestSchema();
      const result = generator.generate(schema);

      expect(result.content).toContain('UsersRow');
      expect(result.content).toContain('PostsRow');
      expect(result.tables).toContain('users');
      expect(result.tables).toContain('posts');
    });

    it('should generate Json type helper', () => {
      const schema = createTestSchema();
      const result = generator.generate(schema);

      expect(result.content).toContain('export type Json =');
    });

    it('should generate Row interfaces', () => {
      const schema = createTestSchema();
      const result = generator.generate(schema);

      expect(result.content).toContain('export interface UsersRow');
      expect(result.content).toContain('id: string');
    });

    it('should generate Insert interfaces by default', () => {
      const schema = createTestSchema();
      const result = generator.generate(schema);

      expect(result.content).toContain('export interface UsersInsert');
      expect(result.content).toContain('export interface PostsInsert');
    });

    it('should generate Update interfaces by default', () => {
      const schema = createTestSchema();
      const result = generator.generate(schema);

      expect(result.content).toContain('export interface UsersUpdate');
      expect(result.content).toContain('export interface PostsUpdate');
    });

    it('should generate Database interface', () => {
      const schema = createTestSchema();
      const result = generator.generate(schema);

      expect(result.content).toContain('export interface Database');
      expect(result.content).toContain('public: {');
      expect(result.content).toContain('Tables: {');
    });

    it('should include relationships in Database interface', () => {
      const schema = createTestSchema();
      const result = generator.generate(schema);

      expect(result.content).toContain('Relationships:');
      expect(result.content).toContain('foreignKeyName');
      expect(result.content).toContain('posts_user_id_fkey');
    });

    it('should generate enum types', () => {
      const schema = createTestSchema();
      const result = generator.generate(schema);

      expect(result.content).toContain('PostStatus');
      expect(result.content).toContain('"draft"');
      expect(result.content).toContain('"published"');
    });

    it('should generate helper types', () => {
      const schema = createTestSchema();
      const result = generator.generate(schema);

      expect(result.content).toContain('export type TableName =');
      expect(result.content).toContain('export type Tables<T extends TableName>');
    });
  });

  describe('options', () => {
    it('should not generate Insert types when disabled', () => {
      const generator = createTypeGenerator({ generateInsertTypes: false });
      const schema = createTestSchema();
      const result = generator.generate(schema);

      expect(result.content).not.toContain('UsersInsert');
    });

    it('should not generate Update types when disabled', () => {
      const generator = createTypeGenerator({ generateUpdateTypes: false });
      const schema = createTestSchema();
      const result = generator.generate(schema);

      expect(result.content).not.toContain('UsersUpdate');
    });
  });

  describe('type mapping', () => {
    it('should map uuid to string', () => {
      const schema: Schema = {
        tables: [
          {
            name: 'test',
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
      expect(result.content).toContain('id: string');
    });

    it('should map bool to boolean', () => {
      const schema: Schema = {
        tables: [
          {
            name: 'test',
            schema: 'public',
            columns: [
              {
                name: 'is_active',
                type: 'bool',
                nullable: false,
                isPrimaryKey: false,
                isForeignKey: false,
                isUnique: false,
              },
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
      expect(result.content).toContain('is_active: boolean');
    });

    it('should map jsonb to Json', () => {
      const schema: Schema = {
        tables: [
          {
            name: 'test',
            schema: 'public',
            columns: [
              {
                name: 'data',
                type: 'jsonb',
                nullable: false,
                isPrimaryKey: false,
                isForeignKey: false,
                isUnique: false,
              },
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
      expect(result.content).toContain('data: Json');
    });
  });

  describe('generateZodSchemas', () => {
    it('should generate Zod import', () => {
      const schema = createTestSchema();
      const result = generator.generateZodSchemas(schema);

      expect(result).toContain('import { z } from "zod"');
    });

    it('should generate Insert schemas', () => {
      const schema = createTestSchema();
      const result = generator.generateZodSchemas(schema);

      expect(result).toContain('UsersInsertSchema = z.object');
    });

    it('should use z.string().uuid() for uuid columns', () => {
      const schema = createTestSchema();
      const result = generator.generateZodSchemas(schema);

      expect(result).toContain('z.string().uuid()');
    });

    it('should use z.string().email() for email columns', () => {
      const schema = createTestSchema();
      const result = generator.generateZodSchemas(schema);

      expect(result).toContain('z.string().email()');
    });
  });
});

describe('createTypeGenerator', () => {
  it('should create generator with default options', () => {
    const generator = createTypeGenerator();
    expect(generator).toBeInstanceOf(TypeGenerator);
  });

  it('should create generator with custom options', () => {
    const generator = createTypeGenerator({
      generateInsertTypes: false,
      generateUpdateTypes: false,
    });
    expect(generator).toBeInstanceOf(TypeGenerator);
  });
});
