/**
 * Tests pour RLSValidator
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RLSValidator, createRLSValidator } from './RLSValidator';
import type { RLSPolicy } from '../types';

describe('RLSValidator', () => {
  let validator: RLSValidator;

  beforeEach(() => {
    validator = createRLSValidator();
  });

  const createTestPolicy = (overrides?: Partial<RLSPolicy>): RLSPolicy => ({
    name: 'test_policy',
    table: 'test_table',
    action: 'SELECT',
    roles: ['authenticated'],
    using: 'user_id = auth.uid()',
    permissive: true,
    ...overrides,
  });

  describe('validate', () => {
    it('should validate valid policies', () => {
      const policies: RLSPolicy[] = [
        createTestPolicy(),
        createTestPolicy({ name: 'test_insert', action: 'INSERT', check: 'user_id = auth.uid()' }),
      ];

      const result = validator.validate(policies);

      expect(result.isValid).toBe(true);
      expect(result.securityScore).toBeGreaterThan(50);
    });

    it('should detect overly permissive policies', () => {
      const policies: RLSPolicy[] = [createTestPolicy({ using: 'true' })];

      const result = validator.validate(policies);

      expect(result.policyAnalysis[0].securityLevel).not.toBe('high');
      expect(result.policyAnalysis[0].issues.some((i) => i.includes('permissive'))).toBe(true);
    });

    it('should detect policies without auth check', () => {
      const policies: RLSPolicy[] = [createTestPolicy({ using: "status = 'published'" })];

      const result = validator.validate(policies);

      expect(result.policyAnalysis[0].issues.some((i) => i.includes('authentification'))).toBe(true);
    });

    it('should allow anon policies without auth check', () => {
      const policies: RLSPolicy[] = [createTestPolicy({ roles: ['anon'], using: "status = 'published'" })];

      const result = validator.validate(policies);

      // Les politiques anon n'ont pas besoin de auth check
      expect(result.policyAnalysis[0].issues.some((i) => i.includes('authentification'))).toBe(false);
    });

    it('should warn about too many policies per table', () => {
      const policies: RLSPolicy[] = Array.from({ length: 15 }, (_, i) => createTestPolicy({ name: `policy_${i}` }));

      const result = validator.validate(policies);

      expect(result.warnings.some((w) => w.code === 'TOO_MANY_POLICIES')).toBe(true);
    });

    it('should warn about missing actions', () => {
      const policies: RLSPolicy[] = [
        createTestPolicy({ action: 'SELECT' }),

        // Missing INSERT, UPDATE, DELETE
      ];

      const result = validator.validate(policies);

      expect(result.warnings.some((w) => w.code === 'MISSING_ACTIONS')).toBe(true);
    });

    it('should not warn about missing actions if ALL is present', () => {
      const policies: RLSPolicy[] = [createTestPolicy({ action: 'ALL' })];

      const result = validator.validate(policies);

      expect(result.warnings.some((w) => w.code === 'MISSING_ACTIONS')).toBe(false);
    });
  });

  describe('security detection', () => {
    it('should detect SQL injection patterns', () => {
      const policies: RLSPolicy[] = [createTestPolicy({ using: 'id = 1; DROP TABLE users;' })];

      const result = validator.validate(policies);

      expect(result.policyAnalysis[0].securityLevel).toBe('critical');
      expect(result.policyAnalysis[0].issues.some((i) => i.includes('DROP'))).toBe(true);
    });

    it('should detect dangerous functions', () => {
      const policies: RLSPolicy[] = [createTestPolicy({ using: 'pg_sleep(5) > 0' })];

      const result = validator.validate(policies);

      expect(result.policyAnalysis[0].securityLevel).toBe('critical');
      expect(result.policyAnalysis[0].issues.some((i) => i.includes('pg_sleep'))).toBe(true);
    });

    it('should detect pg_catalog access', () => {
      const policies: RLSPolicy[] = [createTestPolicy({ using: 'EXISTS (SELECT 1 FROM pg_catalog.pg_tables)' })];

      const result = validator.validate(policies);

      expect(result.policyAnalysis[0].issues.some((i) => i.includes('catalogue'))).toBe(true);
    });

    it('should detect public write policies', () => {
      const policies: RLSPolicy[] = [
        createTestPolicy({
          action: 'INSERT',
          roles: ['anon', 'authenticated'],
          check: 'true',
        }),
      ];

      const result = validator.validate(policies);

      expect(result.policyAnalysis[0].issues.some((i) => i.includes('écriture publique'))).toBe(true);
    });

    it('should allow public write when configured', () => {
      const validator = createRLSValidator({ allowPublicWrite: true });
      const policies: RLSPolicy[] = [
        createTestPolicy({
          action: 'INSERT',
          roles: ['anon'],
          check: 'true',
        }),
      ];

      const result = validator.validate(policies);

      expect(result.policyAnalysis[0].issues.some((i) => i.includes('écriture publique'))).toBe(false);
    });
  });

  describe('syntax validation', () => {
    it('should detect unbalanced parentheses', () => {
      const policies: RLSPolicy[] = [createTestPolicy({ using: '((user_id = auth.uid())' })];

      const result = validator.validate(policies);

      expect(result.policyAnalysis[0].issues.some((i) => i.includes('Parenthèses'))).toBe(true);
    });

    it('should detect unbalanced quotes', () => {
      const policies: RLSPolicy[] = [createTestPolicy({ using: "status = 'published" })];

      const result = validator.validate(policies);

      expect(result.policyAnalysis[0].issues.some((i) => i.includes('Guillemets'))).toBe(true);
    });

    it('should detect very long expressions', () => {
      const longExpr = 'x'.repeat(1500);
      const policies: RLSPolicy[] = [createTestPolicy({ using: longExpr })];

      const result = validator.validate(policies);

      expect(result.policyAnalysis[0].issues.some((i) => i.includes('trop longue'))).toBe(true);
    });
  });

  describe('security score', () => {
    it('should return high score for secure policies', () => {
      const policies: RLSPolicy[] = [
        createTestPolicy({ using: 'user_id = auth.uid()' }),
        createTestPolicy({ name: 'insert', action: 'INSERT', check: 'user_id = auth.uid()' }),
        createTestPolicy({
          name: 'update',
          action: 'UPDATE',
          using: 'user_id = auth.uid()',
          check: 'user_id = auth.uid()',
        }),
        createTestPolicy({ name: 'delete', action: 'DELETE', using: 'user_id = auth.uid()' }),
      ];

      const result = validator.validate(policies);

      expect(result.securityScore).toBeGreaterThanOrEqual(80);
    });

    it('should return low score for insecure policies', () => {
      const policies: RLSPolicy[] = [
        createTestPolicy({ using: 'true' }),
        createTestPolicy({ name: 'insert', action: 'INSERT', check: 'true', roles: ['anon'] }),
      ];

      const result = validator.validate(policies);

      expect(result.securityScore).toBeLessThan(80);
    });

    it('should return 0 score for critical security issues', () => {
      const policies: RLSPolicy[] = [createTestPolicy({ using: 'id = 1; DROP TABLE users;' })];

      const result = validator.validate(policies);

      expect(result.securityScore).toBe(0);
    });
  });

  describe('strict mode', () => {
    it('should mark permissive write policies as critical in strict mode', () => {
      const validator = createRLSValidator({ strictMode: true });
      const policies: RLSPolicy[] = [createTestPolicy({ action: 'INSERT', check: 'true' })];

      const result = validator.validate(policies);

      expect(result.policyAnalysis[0].securityLevel).toBe('critical');
    });

    it('should not mark permissive SELECT as critical even in strict mode', () => {
      const validator = createRLSValidator({ strictMode: true });
      const policies: RLSPolicy[] = [createTestPolicy({ action: 'SELECT', using: 'true' })];

      const result = validator.validate(policies);

      expect(result.policyAnalysis[0].securityLevel).not.toBe('critical');
    });
  });

  describe('validatePolicy', () => {
    it('should validate a single policy', () => {
      const policy = createTestPolicy();
      const analysis = validator.validatePolicy(policy);

      expect(analysis.policy).toBe(policy);
      expect(analysis.securityLevel).toBe('high');
      expect(analysis.issues.length).toBe(0);
    });

    it('should return issues for problematic policy', () => {
      const policy = createTestPolicy({ using: 'true' });
      const analysis = validator.validatePolicy(policy);

      expect(analysis.issues.length).toBeGreaterThan(0);
    });
  });

  describe('hasValidAuthPattern', () => {
    it('should detect auth.uid()', () => {
      expect(validator.hasValidAuthPattern('user_id = auth.uid()')).toBe(true);
    });

    it('should detect auth.jwt()', () => {
      expect(validator.hasValidAuthPattern("auth.jwt() ->> 'role' = 'admin'")).toBe(true);
    });

    it('should detect auth.role()', () => {
      expect(validator.hasValidAuthPattern("auth.role() = 'authenticated'")).toBe(true);
    });

    it('should detect current_user', () => {
      expect(validator.hasValidAuthPattern('owner = current_user')).toBe(true);
    });

    it('should return false for no auth pattern', () => {
      expect(validator.hasValidAuthPattern("status = 'published'")).toBe(false);
    });
  });

  describe('suggestions', () => {
    it('should generate suggestions for permissive policies', () => {
      const policies: RLSPolicy[] = [createTestPolicy({ using: 'true' })];

      const result = validator.validate(policies);

      expect(result.suggestions.some((s) => s.includes('true'))).toBe(true);
    });

    it('should generate suggestions for missing auth', () => {
      const policies: RLSPolicy[] = [createTestPolicy({ using: "status = 'active'" })];

      const result = validator.validate(policies);

      expect(result.suggestions.some((s) => s.includes('auth.uid()'))).toBe(true);
    });

    it('should generate positive feedback for secure policies', () => {
      const policies: RLSPolicy[] = [createTestPolicy({ using: 'user_id = auth.uid()' })];

      const result = validator.validate(policies);

      expect(result.policyAnalysis[0].recommendations.some((r) => r.includes('bonnes pratiques'))).toBe(true);
    });
  });
});

describe('createRLSValidator', () => {
  it('should create validator with default options', () => {
    const validator = createRLSValidator();
    expect(validator).toBeInstanceOf(RLSValidator);
  });

  it('should create validator with custom options', () => {
    const validator = createRLSValidator({
      strictMode: true,
      requireAuthCheck: false,
      allowPublicWrite: true,
      maxPoliciesPerTable: 5,
    });
    expect(validator).toBeInstanceOf(RLSValidator);
  });
});
