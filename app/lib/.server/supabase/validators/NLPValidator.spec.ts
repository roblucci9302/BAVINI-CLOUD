/**
 * Tests pour NLPValidator
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { NLPValidator, createNLPValidator } from './NLPValidator';
import type { ExtractedEntity } from '../types';

describe('NLPValidator', () => {
  let validator: NLPValidator;

  beforeEach(() => {
    validator = createNLPValidator();
  });

  describe('validate', () => {
    it('should validate valid entities', async () => {
      const entities: ExtractedEntity[] = [
        {
          name: 'user',
          tableName: 'users',
          columns: [
            { name: 'id', inferredType: 'uuid', isRequired: true, isUnique: true, source: 'default', confidence: 100 },
            {
              name: 'email',
              inferredType: 'text',
              isRequired: true,
              isUnique: true,
              source: 'explicit',
              confidence: 90,
            },
          ],
          relations: [],
          source: 'explicit',
        },
      ];

      const result = await validator.validate(entities);
      expect(result.isValid).toBe(true);
      expect(result.entities.length).toBe(1);
      expect(result.overallConfidence).toBeGreaterThan(50);
    });

    it('should detect reserved SQL keywords as table names', async () => {
      const entities: ExtractedEntity[] = [
        {
          name: 'user',
          tableName: 'user',
          columns: [
            { name: 'id', inferredType: 'uuid', isRequired: true, isUnique: true, source: 'default', confidence: 100 },
          ],
          relations: [],
          source: 'explicit',
        },
      ];

      const result = await validator.validate(entities);
      expect(result.errors.some((e) => e.code === 'RESERVED_WORD')).toBe(true);
    });

    it('should detect reserved SQL keywords as column names', async () => {
      const entities: ExtractedEntity[] = [
        {
          name: 'product',
          tableName: 'products',
          columns: [
            { name: 'id', inferredType: 'uuid', isRequired: true, isUnique: true, source: 'default', confidence: 100 },
            {
              name: 'select',
              inferredType: 'text',
              isRequired: false,
              isUnique: false,
              source: 'explicit',
              confidence: 80,
            },
          ],
          relations: [],
          source: 'explicit',
        },
      ];

      const result = await validator.validate(entities);
      expect(result.errors.some((e) => e.code === 'RESERVED_COLUMN_NAME')).toBe(true);
    });

    it('should warn about entities without columns', async () => {
      const entities: ExtractedEntity[] = [
        { name: 'empty', tableName: 'empties', columns: [], relations: [], source: 'explicit' },
      ];

      const result = await validator.validate(entities);
      expect(result.errors.some((e) => e.code === 'NO_COLUMNS')).toBe(true);
    });

    it('should warn about missing primary key', async () => {
      const entities: ExtractedEntity[] = [
        {
          name: 'item',
          tableName: 'items',
          columns: [
            {
              name: 'name',
              inferredType: 'text',
              isRequired: true,
              isUnique: false,
              source: 'explicit',
              confidence: 80,
            },
          ],
          relations: [],
          source: 'explicit',
        },
      ];

      const result = await validator.validate(entities);
      expect(result.warnings.some((w) => w.code === 'NO_PRIMARY_KEY')).toBe(true);
    });

    it('should validate relation targets exist', async () => {
      const entities: ExtractedEntity[] = [
        {
          name: 'post',
          tableName: 'posts',
          columns: [
            { name: 'id', inferredType: 'uuid', isRequired: true, isUnique: true, source: 'default', confidence: 100 },
          ],
          relations: [{ type: '1-N', targetEntity: 'nonexistent', foreignKey: 'author_id', confidence: 80 }],
          source: 'explicit',
        },
      ];

      const result = await validator.validate(entities);
      expect(result.errors.some((e) => e.code === 'INVALID_RELATION_TARGET')).toBe(true);
    });

    it('should detect duplicate entity names', async () => {
      const entities: ExtractedEntity[] = [
        {
          name: 'user',
          tableName: 'users',
          columns: [
            { name: 'id', inferredType: 'uuid', isRequired: true, isUnique: true, source: 'default', confidence: 100 },
          ],
          relations: [],
          source: 'explicit',
        },
        {
          name: 'user2',
          tableName: 'users',
          columns: [
            { name: 'id', inferredType: 'uuid', isRequired: true, isUnique: true, source: 'default', confidence: 100 },
          ],
          relations: [],
          source: 'explicit',
        },
      ];

      const result = await validator.validate(entities);
      expect(result.errors.some((e) => e.code === 'DUPLICATE_ENTITY')).toBe(true);
    });

    it('should detect conflicts with existing tables', async () => {
      const entities: ExtractedEntity[] = [
        {
          name: 'profile',
          tableName: 'profiles',
          columns: [
            { name: 'id', inferredType: 'uuid', isRequired: true, isUnique: true, source: 'default', confidence: 100 },
          ],
          relations: [],
          source: 'explicit',
        },
      ];

      const result = await validator.validate(entities, ['profiles']);
      expect(result.errors.some((e) => e.code === 'TABLE_EXISTS')).toBe(true);
    });
  });

  describe('inferColumnType', () => {
    it('should infer UUID for id columns', () => {
      expect(validator.inferColumnType('id').type).toBe('uuid');
      expect(validator.inferColumnType('user_id').type).toBe('uuid');
    });

    it('should infer timestamptz for timestamp columns', () => {
      expect(validator.inferColumnType('created_at').type).toBe('timestamptz');
    });

    it('should infer bool for boolean-like columns', () => {
      expect(validator.inferColumnType('is_active').type).toBe('bool');
      expect(validator.inferColumnType('has_permission').type).toBe('bool');
    });

    it('should infer numeric for price columns', () => {
      expect(validator.inferColumnType('price').type).toBe('numeric');
    });

    it('should infer int for count columns', () => {
      expect(validator.inferColumnType('count').type).toBe('int4');
    });

    it('should infer jsonb for metadata columns', () => {
      expect(validator.inferColumnType('metadata').type).toBe('jsonb');
    });

    it('should default to text for unknown columns', () => {
      const result = validator.inferColumnType('something_random');
      expect(result.type).toBe('text');
      expect(result.confidence).toBeLessThan(60);
    });
  });

  describe('detectRelationType', () => {
    it('should detect 1-N relations', () => {
      expect(validator.detectRelationType('user appartient à company').type).toBe('1-N');
      expect(validator.detectRelationType('post belongs to author').type).toBe('1-N');
    });

    it('should detect N-N relations', () => {
      expect(validator.detectRelationType('plusieurs articles plusieurs categories').type).toBe('N-N');
    });

    it('should return null for no relation', () => {
      expect(validator.detectRelationType('this is just text').type).toBeNull();
    });
  });
});

describe('createNLPValidator', () => {
  it('should create validator with default options', () => {
    const validator = createNLPValidator();
    expect(validator).toBeInstanceOf(NLPValidator);
  });

  it('should create validator with custom options', () => {
    const validator = createNLPValidator({ strictMode: true });
    expect(validator).toBeInstanceOf(NLPValidator);
  });
});
