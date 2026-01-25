/**
 * Tests for Context Store
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  contextStore,
  contextStats,
  isSummarizing,
  contextLevel,
  contextLevelColor,
  updateContextStats,
  startSummarization,
  endSummarization,
  resetContextStore,
  getTotalSummarizedMessages,
  getTotalTokensSaved,
  type ContextStats,
} from './context';

describe('Context Store', () => {
  beforeEach(() => {
    resetContextStore();
  });

  describe('Initial state', () => {
    it('should have default stats', () => {
      const stats = contextStats.get();

      expect(stats.totalTokens).toBe(0);
      expect(stats.usagePercent).toBe(0);
      expect(stats.messageCount).toBe(0);
      expect(stats.summaryCount).toBe(0);
      expect(stats.isNearLimit).toBe(false);
    });

    it('should not be summarizing initially', () => {
      expect(isSummarizing.get()).toBe(false);
    });

    it('should have empty summarization history', () => {
      const state = contextStore.get();
      expect(state.summarizationHistory).toHaveLength(0);
    });
  });

  describe('updateContextStats', () => {
    it('should update partial stats', () => {
      updateContextStats({
        totalTokens: 5000,
        usagePercent: 25,
      });

      const stats = contextStats.get();
      expect(stats.totalTokens).toBe(5000);
      expect(stats.usagePercent).toBe(25);
      // Other fields should remain default
      expect(stats.messageCount).toBe(0);
    });

    it('should update lastUpdated timestamp', () => {
      const before = new Date();
      updateContextStats({ totalTokens: 100 });
      const stats = contextStats.get();

      expect(stats.lastUpdated.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it('should preserve existing stats when updating', () => {
      updateContextStats({ totalTokens: 1000, messageCount: 5 });
      updateContextStats({ usagePercent: 50 });

      const stats = contextStats.get();
      expect(stats.totalTokens).toBe(1000);
      expect(stats.messageCount).toBe(5);
      expect(stats.usagePercent).toBe(50);
    });
  });

  describe('contextLevel computed', () => {
    it('should return "low" for usage < 50%', () => {
      updateContextStats({ usagePercent: 30 });
      expect(contextLevel.get()).toBe('low');
    });

    it('should return "medium" for usage 50-70%', () => {
      updateContextStats({ usagePercent: 60 });
      expect(contextLevel.get()).toBe('medium');
    });

    it('should return "high" for usage 70-85%', () => {
      updateContextStats({ usagePercent: 80 });
      expect(contextLevel.get()).toBe('high');
    });

    it('should return "critical" for usage >= 85%', () => {
      updateContextStats({ usagePercent: 90 });
      expect(contextLevel.get()).toBe('critical');
    });

    it('should handle boundary values correctly', () => {
      updateContextStats({ usagePercent: 50 });
      expect(contextLevel.get()).toBe('medium');

      updateContextStats({ usagePercent: 70 });
      expect(contextLevel.get()).toBe('high');

      updateContextStats({ usagePercent: 85 });
      expect(contextLevel.get()).toBe('critical');
    });
  });

  describe('contextLevelColor computed', () => {
    it('should return green for low usage', () => {
      updateContextStats({ usagePercent: 30 });
      expect(contextLevelColor.get()).toBe('text-green-500');
    });

    it('should return yellow for medium usage', () => {
      updateContextStats({ usagePercent: 60 });
      expect(contextLevelColor.get()).toBe('text-yellow-500');
    });

    it('should return orange for high usage', () => {
      updateContextStats({ usagePercent: 80 });
      expect(contextLevelColor.get()).toBe('text-orange-500');
    });

    it('should return red for critical usage', () => {
      updateContextStats({ usagePercent: 95 });
      expect(contextLevelColor.get()).toBe('text-red-500');
    });
  });

  describe('summarization actions', () => {
    it('should start summarization', () => {
      expect(isSummarizing.get()).toBe(false);

      startSummarization();

      expect(isSummarizing.get()).toBe(true);
    });

    it('should end summarization and record history', () => {
      startSummarization();
      endSummarization(15, 5000);

      expect(isSummarizing.get()).toBe(false);

      const state = contextStore.get();
      expect(state.summarizationHistory).toHaveLength(1);
      expect(state.summarizationHistory[0].messagesCount).toBe(15);
      expect(state.summarizationHistory[0].tokensSaved).toBe(5000);
    });

    it('should accumulate summarization history', () => {
      endSummarization(10, 3000);
      endSummarization(8, 2500);
      endSummarization(12, 4000);

      const state = contextStore.get();
      expect(state.summarizationHistory).toHaveLength(3);
    });
  });

  describe('getTotalSummarizedMessages', () => {
    it('should return 0 when no summarizations', () => {
      expect(getTotalSummarizedMessages()).toBe(0);
    });

    it('should sum all summarized messages', () => {
      endSummarization(10, 3000);
      endSummarization(8, 2500);
      endSummarization(12, 4000);

      expect(getTotalSummarizedMessages()).toBe(30);
    });
  });

  describe('getTotalTokensSaved', () => {
    it('should return 0 when no summarizations', () => {
      expect(getTotalTokensSaved()).toBe(0);
    });

    it('should sum all tokens saved', () => {
      endSummarization(10, 3000);
      endSummarization(8, 2500);
      endSummarization(12, 4000);

      expect(getTotalTokensSaved()).toBe(9500);
    });
  });

  describe('resetContextStore', () => {
    it('should reset all state to defaults', () => {
      // Setup some state
      updateContextStats({
        totalTokens: 50000,
        usagePercent: 75,
        messageCount: 100,
        summaryCount: 3,
        isNearLimit: true,
      });
      startSummarization();
      endSummarization(15, 5000);
      endSummarization(10, 3000);

      // Reset
      resetContextStore();

      // Verify reset
      const stats = contextStats.get();
      expect(stats.totalTokens).toBe(0);
      expect(stats.usagePercent).toBe(0);
      expect(stats.messageCount).toBe(0);
      expect(isSummarizing.get()).toBe(false);
      expect(contextStore.get().summarizationHistory).toHaveLength(0);
    });
  });

  describe('store reactivity', () => {
    it('should update computed values when stats change', () => {
      // Start at low
      updateContextStats({ usagePercent: 20 });
      expect(contextLevel.get()).toBe('low');

      // Move to medium
      updateContextStats({ usagePercent: 55 });
      expect(contextLevel.get()).toBe('medium');

      // Move to critical
      updateContextStats({ usagePercent: 90 });
      expect(contextLevel.get()).toBe('critical');
    });
  });
});
