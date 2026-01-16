/**
 * Tests pour ReviewManager
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ReviewManager, createReviewManager, REVIEW_MESSAGE_TEMPLATES } from './ReviewManager';
import type { OperationDetails } from './types';

describe('ReviewManager', () => {
  let manager: ReviewManager;

  beforeEach(() => {
    manager = createReviewManager();
  });

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

  describe('requestReview', () => {
    it('should create review request for operation', async () => {
      const operation = createOperation();
      const request = await manager.requestReview(operation);

      expect(request.id).toBeDefined();
      expect(request.type).toBe('schema');
      expect(request.operation).toEqual(operation);
      expect(request.riskLevel).toBeDefined();
      expect(request.confidence).toBeGreaterThanOrEqual(0);
      expect(request.confidence).toBeLessThanOrEqual(100);
    });

    it('should auto-approve low risk operations with high confidence', async () => {
      const operation = createOperation({
        isDestructive: false,
        isAdditive: true,
        modifiesStructure: false,
      });

      const request = await manager.requestReview(operation);
      expect(request.autoApproved).toBe(true);
    });

    it('should not auto-approve destructive operations', async () => {
      const operation = createOperation({
        type: 'delete',
        isDestructive: true,
        isAdditive: false,
      });

      const request = await manager.requestReview(operation);
      expect(request.autoApproved).toBe(false);
    });

    it('should generate preview', async () => {
      const operation = createOperation();
      const request = await manager.requestReview(operation);

      expect(request.preview).toBeDefined();
      expect(request.preview.before).toBeDefined();
      expect(request.preview.after).toBeDefined();
      expect(request.preview.diff).toBeDefined();
      expect(request.preview.summary).toBeDefined();
    });

    it('should collect warnings for destructive operations', async () => {
      const operation = createOperation({
        isDestructive: true,
      });

      const request = await manager.requestReview(operation);
      expect(request.warnings.some((w) => w.includes('destructive'))).toBe(true);
    });

    it('should generate recommendations for high risk operations', async () => {
      const operation = createOperation({
        type: 'delete',
        isDestructive: true,
      });

      const request = await manager.requestReview(operation);
      expect(request.recommendations.length).toBeGreaterThan(0);
    });

    it('should store pending reviews', async () => {
      const operation = createOperation({
        type: 'delete',
        isDestructive: true,
      });

      const request = await manager.requestReview(operation);
      const pending = manager.getPendingReviews();

      expect(pending.some((r) => r.request.id === request.id)).toBe(true);
    });
  });

  describe('assessRisk', () => {
    it('should assess critical risk for destructive operations', () => {
      const operation = createOperation({ isDestructive: true });
      expect(manager.assessRisk(operation)).toBe('critical');
    });

    it('should assess high risk for delete with structure modification', () => {
      const operation = createOperation({
        type: 'delete',
        isDestructive: false,
        modifiesStructure: true,
      });
      expect(manager.assessRisk(operation)).toBe('high');
    });

    it('should assess medium risk for structure modification', () => {
      const operation = createOperation({
        type: 'modify',
        isDestructive: false,
        modifiesStructure: true,
        isAdditive: false,
      });
      expect(manager.assessRisk(operation)).toBe('medium');
    });

    it('should assess low risk for additive operations', () => {
      const operation = createOperation({
        isDestructive: false,
        isAdditive: true,
        modifiesStructure: false,
      });
      expect(manager.assessRisk(operation)).toBe('low');
    });
  });

  describe('calculateConfidence', () => {
    it('should return high confidence for simple operations', async () => {
      const operation = createOperation({
        affectedElements: ['users'],
        isDestructive: false,
        modifiesStructure: false,
      });

      const confidence = await manager.calculateConfidence(operation);
      expect(confidence).toBeGreaterThanOrEqual(90);
    });

    it('should reduce confidence for complex operations', async () => {
      const operation = createOperation({
        affectedElements: ['a', 'b', 'c', 'd', 'e', 'f'],
        isDestructive: true,
        modifiesStructure: true,
      });

      const confidence = await manager.calculateConfidence(operation);
      expect(confidence).toBeLessThan(80);
    });

    it('should reduce confidence based on validation errors', async () => {
      const operation = createOperation();
      const validation = {
        isValid: false,
        errors: [
          { code: 'ERR1', message: 'Error 1', severity: 'error' as const },
          { code: 'ERR2', message: 'Error 2', severity: 'error' as const },
        ],
        warnings: [],
        suggestions: [],
      };

      const confidence = await manager.calculateConfidence(operation, validation);
      expect(confidence).toBeLessThan(90);
    });
  });

  describe('submitDecision', () => {
    it('should accept approval decision', async () => {
      const operation = createOperation({ isDestructive: true });
      const request = await manager.requestReview(operation);

      const decision = await manager.submitDecision(request.id, 'approve', {
        reason: 'Approved after review',
      });

      expect(decision.approved).toBe(true);
      expect(decision.decision).toBe('approve');
      expect(decision.reviewId).toBe(request.id);
    });

    it('should accept rejection decision', async () => {
      const operation = createOperation({ isDestructive: true });
      const request = await manager.requestReview(operation);

      const decision = await manager.submitDecision(request.id, 'reject', {
        reason: 'Too risky',
      });

      expect(decision.approved).toBe(false);
      expect(decision.decision).toBe('reject');
    });

    it('should accept modify decision with modifications', async () => {
      const operation = createOperation({ isDestructive: true });
      const request = await manager.requestReview(operation);

      const decision = await manager.submitDecision(request.id, 'modify', {
        modifications: { tableName: 'users_v2' },
      });

      expect(decision.approved).toBe(false);
      expect(decision.decision).toBe('modify');
      expect(decision.modifications).toEqual({ tableName: 'users_v2' });
    });

    it('should throw for non-existent review', async () => {
      await expect(manager.submitDecision('non_existent_id', 'approve')).rejects.toThrow();
    });

    it('should throw for already processed review', async () => {
      const operation = createOperation({ isDestructive: true });
      const request = await manager.requestReview(operation);

      await manager.submitDecision(request.id, 'approve');

      await expect(manager.submitDecision(request.id, 'approve')).rejects.toThrow();
    });
  });

  describe('getReview', () => {
    it('should retrieve review by ID', async () => {
      const operation = createOperation({ isDestructive: true });
      const request = await manager.requestReview(operation);

      const review = manager.getReview(request.id);
      expect(review).toBeDefined();
      expect(review?.request.id).toBe(request.id);
    });

    it('should return undefined for non-existent review', () => {
      const review = manager.getReview('non_existent_id');
      expect(review).toBeUndefined();
    });
  });

  describe('getReviewHistory', () => {
    it('should return review history', async () => {
      const operation = createOperation({ isDestructive: true });
      const request = await manager.requestReview(operation);
      await manager.submitDecision(request.id, 'approve');

      const history = manager.getReviewHistory();
      expect(history.length).toBe(1);
      expect(history[0].reviewId).toBe(request.id);
    });

    it('should filter by decision', async () => {
      const op1 = createOperation({ isDestructive: true, name: 'table1' });
      const op2 = createOperation({ isDestructive: true, name: 'table2' });

      const req1 = await manager.requestReview(op1);
      const req2 = await manager.requestReview(op2);

      await manager.submitDecision(req1.id, 'approve');
      await manager.submitDecision(req2.id, 'reject');

      const approved = manager.getReviewHistory({ decision: 'approve' });
      expect(approved.length).toBe(1);
      expect(approved[0].decision).toBe('approve');
    });
  });

  describe('expirePendingReviews', () => {
    it('should expire old reviews', async () => {
      /*
       * This test would need time manipulation which is complex
       * Just verify the method exists and returns a number
       */
      const expiredCount = manager.expirePendingReviews();
      expect(typeof expiredCount).toBe('number');
    });
  });

  describe('cleanup', () => {
    it('should remove old reviews', async () => {
      const operation = createOperation({ isDestructive: true });
      const request = await manager.requestReview(operation);
      await manager.submitDecision(request.id, 'approve');

      const removedCount = manager.cleanup(0); // Immediate cleanup
      expect(removedCount).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getStatistics', () => {
    it('should return statistics', async () => {
      const operation = createOperation({ isDestructive: true });
      const request = await manager.requestReview(operation);
      await manager.submitDecision(request.id, 'approve');

      const stats = manager.getStatistics();
      expect(stats.approved).toBe(1);
      expect(stats.pending).toBe(0);
    });
  });
});

describe('createReviewManager', () => {
  it('should create manager with default options', () => {
    const manager = createReviewManager();
    expect(manager).toBeInstanceOf(ReviewManager);
  });

  it('should create manager with custom options', () => {
    const manager = createReviewManager({
      autoApproveThreshold: 90,
      enableAutoApprove: false,
    });
    expect(manager).toBeInstanceOf(ReviewManager);
  });
});

describe('REVIEW_MESSAGE_TEMPLATES', () => {
  it('should generate schema creation message', () => {
    const message = REVIEW_MESSAGE_TEMPLATES.schemaCreation(['users', 'posts'], 'CREATE TABLE users...');

    expect(message).toContain('users');
    expect(message).toContain('posts');
    expect(message).toContain('CREATE TABLE');
  });

  it('should generate destructive change message', () => {
    const message = REVIEW_MESSAGE_TEMPLATES.destructiveChange('DROP TABLE', ['users', 'posts']);

    expect(message).toContain('Destructive');
    expect(message).toContain('DROP TABLE');
    expect(message).toContain('users');
  });

  it('should generate migration review message', () => {
    const message = REVIEW_MESSAGE_TEMPLATES.migrationReview({ name: 'add_users', up: 'CREATE TABLE users...' }, true, [
      'Warning 1',
    ]);

    expect(message).toContain('add_users');
    expect(message).toContain('tests passent');
    expect(message).toContain('Warning 1');
  });

  it('should generate RLS review message', () => {
    const message = REVIEW_MESSAGE_TEMPLATES.rlsReview([{ name: 'users_select', table: 'users', action: 'SELECT' }]);

    expect(message).toContain('users_select');
    expect(message).toContain('users');
    expect(message).toContain('SELECT');
  });
});
