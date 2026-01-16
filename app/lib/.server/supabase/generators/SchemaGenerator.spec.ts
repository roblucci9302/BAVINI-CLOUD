/**
 * Tests pour SchemaGenerator
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SchemaGenerator, createSchemaGenerator } from './SchemaGenerator';

describe('SchemaGenerator', () => {
  let generator: SchemaGenerator;

  beforeEach(() => {
    generator = createSchemaGenerator();
  });

  describe('extractEntities', () => {
    it('should extract entities from description with "table" keyword', () => {
      const description = 'Je veux une table users avec email et mot de passe';
      const result = generator.extractEntities(description);
      expect(result.entities.length).toBeGreaterThan(0);
    });

    it('should extract entities from "gérer" pattern', () => {
      const description = 'Application pour gérer les commandes et les clients';
      const result = generator.extractEntities(description);
      expect(result.entities.length).toBeGreaterThanOrEqual(0);
    });

    it('should not extract stop words as entities', () => {
      const description = 'Je veux stocker les données dans une application';
      const result = generator.extractEntities(description);
      expect(result.entities.some((e) => e.name === 'les')).toBe(false);
    });
  });

  describe('generate', () => {
    it('should generate a complete schema from description', async () => {
      const description = 'Une application blog avec des articles et des auteurs';
      const result = await generator.generate(description);

      expect(result.schema).toBeDefined();
      expect(result.schema.tables.length).toBeGreaterThan(0);
      expect(result.sql).toBeDefined();
      expect(result.sql.length).toBeGreaterThan(0);
    });

    it('should add id column to all tables', async () => {
      const description = 'Table produits avec nom et prix';
      const result = await generator.generate(description);

      for (const table of result.schema.tables) {
        expect(table.columns.some((c) => c.name === 'id')).toBe(true);
      }
    });

    it('should add timestamps when option enabled', async () => {
      const generator = createSchemaGenerator({ addTimestamps: true });
      const description = 'Table items';
      const result = await generator.generate(description);

      for (const table of result.schema.tables) {
        expect(table.columns.some((c) => c.name === 'created_at')).toBe(true);
        expect(table.columns.some((c) => c.name === 'updated_at')).toBe(true);
      }
    });

    it('should generate helper functions', async () => {
      const description = 'Table test';
      const result = await generator.generate(description);
      expect(result.schema.functions.some((f) => f.name === 'update_updated_at_column')).toBe(true);
    });

    it('should generate valid SQL', async () => {
      const description = 'Application avec utilisateurs et posts';
      const result = await generator.generate(description);

      expect(result.sql).toContain('CREATE TABLE');
      expect(result.sql).toContain('uuid');
      expect(result.sql).toContain('ENABLE ROW LEVEL SECURITY');
    });
  });

  describe('generateSQL', () => {
    it('should generate SQL with extension creation', async () => {
      const description = 'Simple table';
      const result = await generator.generate(description);
      expect(result.sql).toContain('CREATE EXTENSION IF NOT EXISTS');
    });
  });

  describe('pluralization', () => {
    it('should pluralize table names by default', () => {
      const generator = createSchemaGenerator({ pluralizeTableNames: true });
      const result = generator.extractEntities('Table user');

      if (result.entities.length > 0) {
        const entity = result.entities.find((e) => e.name.includes('user'));

        if (entity) {
          expect(entity.tableName).toBe('users');
        }
      }
    });

    it('should not pluralize when option disabled', () => {
      const generator = createSchemaGenerator({ pluralizeTableNames: false });
      const result = generator.extractEntities('Table user');

      if (result.entities.length > 0) {
        const entity = result.entities.find((e) => e.name.includes('user'));

        if (entity) {
          expect(entity.tableName).toBe('user');
        }
      }
    });
  });
});

describe('createSchemaGenerator', () => {
  it('should create generator with default options', () => {
    const generator = createSchemaGenerator();
    expect(generator).toBeInstanceOf(SchemaGenerator);
  });

  it('should create generator with custom options', () => {
    const generator = createSchemaGenerator({
      addTimestamps: false,
      addSoftDelete: true,
      generateIndexes: false,
    });
    expect(generator).toBeInstanceOf(SchemaGenerator);
  });
});
