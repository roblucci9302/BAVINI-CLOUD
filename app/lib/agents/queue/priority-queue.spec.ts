/**
 * Tests pour PriorityQueue
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PriorityQueue, TaskPriority, createPriorityQueue, getPriorityName, parsePriority } from './priority-queue';

describe('PriorityQueue', () => {
  let queue: PriorityQueue<string>;

  beforeEach(() => {
    queue = createPriorityQueue<string>();
  });

  afterEach(() => {
    queue.destroy();
  });

  describe('basic operations', () => {
    it('should create an empty queue', () => {
      expect(queue.isEmpty()).toBe(true);
      expect(queue.size()).toBe(0);
    });

    it('should enqueue and dequeue items', () => {
      queue.enqueue('item1', 'value1', TaskPriority.NORMAL);
      queue.enqueue('item2', 'value2', TaskPriority.NORMAL);

      expect(queue.size()).toBe(2);
      expect(queue.isEmpty()).toBe(false);

      const item1 = queue.dequeue();
      expect(item1?.value).toBe('value1');
      expect(queue.size()).toBe(1);

      const item2 = queue.dequeue();
      expect(item2?.value).toBe('value2');
      expect(queue.isEmpty()).toBe(true);
    });

    it('should return undefined when dequeuing from empty queue', () => {
      expect(queue.dequeue()).toBeUndefined();
    });

    it('should peek without removing', () => {
      queue.enqueue('item1', 'value1', TaskPriority.NORMAL);

      const peeked = queue.peek();
      expect(peeked?.value).toBe('value1');
      expect(queue.size()).toBe(1);
    });

    it('should check if item exists', () => {
      queue.enqueue('item1', 'value1', TaskPriority.NORMAL);

      expect(queue.has('item1')).toBe(true);
      expect(queue.has('nonexistent')).toBe(false);
    });

    it('should get item by id', () => {
      queue.enqueue('item1', 'value1', TaskPriority.HIGH);

      const item = queue.get('item1');
      expect(item?.value).toBe('value1');
      expect(item?.priority).toBe(TaskPriority.HIGH);

      expect(queue.get('nonexistent')).toBeUndefined();
    });
  });

  describe('priority ordering', () => {
    it('should dequeue items in priority order (lower value first)', () => {
      queue.enqueue('low', 'low-value', TaskPriority.LOW);
      queue.enqueue('critical', 'critical-value', TaskPriority.CRITICAL);
      queue.enqueue('normal', 'normal-value', TaskPriority.NORMAL);
      queue.enqueue('high', 'high-value', TaskPriority.HIGH);

      expect(queue.dequeue()?.id).toBe('critical');
      expect(queue.dequeue()?.id).toBe('high');
      expect(queue.dequeue()?.id).toBe('normal');
      expect(queue.dequeue()?.id).toBe('low');
    });

    it('should maintain FIFO order for same priority', () => {
      queue.enqueue('first', 'first-value', TaskPriority.NORMAL);
      queue.enqueue('second', 'second-value', TaskPriority.NORMAL);
      queue.enqueue('third', 'third-value', TaskPriority.NORMAL);

      expect(queue.dequeue()?.id).toBe('first');
      expect(queue.dequeue()?.id).toBe('second');
      expect(queue.dequeue()?.id).toBe('third');
    });

    it('should prioritize critical over background', () => {
      queue.enqueue('bg1', 'bg1', TaskPriority.BACKGROUND);
      queue.enqueue('bg2', 'bg2', TaskPriority.BACKGROUND);
      queue.enqueue('critical', 'critical', TaskPriority.CRITICAL);

      expect(queue.dequeue()?.id).toBe('critical');
    });
  });

  describe('remove operation', () => {
    it('should remove item by id', () => {
      queue.enqueue('item1', 'value1', TaskPriority.NORMAL);
      queue.enqueue('item2', 'value2', TaskPriority.NORMAL);
      queue.enqueue('item3', 'value3', TaskPriority.NORMAL);

      const removed = queue.remove('item2');
      expect(removed?.value).toBe('value2');
      expect(queue.size()).toBe(2);
      expect(queue.has('item2')).toBe(false);
    });

    it('should return undefined when removing non-existent item', () => {
      expect(queue.remove('nonexistent')).toBeUndefined();
    });

    it('should maintain heap property after removal', () => {
      queue.enqueue('low', 'low', TaskPriority.LOW);
      queue.enqueue('critical', 'critical', TaskPriority.CRITICAL);
      queue.enqueue('normal', 'normal', TaskPriority.NORMAL);
      queue.enqueue('high', 'high', TaskPriority.HIGH);

      queue.remove('high');

      expect(queue.dequeue()?.id).toBe('critical');
      expect(queue.dequeue()?.id).toBe('normal');
      expect(queue.dequeue()?.id).toBe('low');
    });
  });

  describe('priority updates', () => {
    it('should update priority of an item', () => {
      queue.enqueue('item1', 'value1', TaskPriority.LOW);
      queue.enqueue('item2', 'value2', TaskPriority.NORMAL);

      const updated = queue.updatePriority('item1', TaskPriority.CRITICAL);
      expect(updated).toBe(true);

      // item1 should now be first
      expect(queue.dequeue()?.id).toBe('item1');
    });

    it('should return false when updating non-existent item', () => {
      expect(queue.updatePriority('nonexistent', TaskPriority.HIGH)).toBe(false);
    });

    it('should promote item by one level', () => {
      queue.enqueue('item1', 'value1', TaskPriority.LOW);

      const promoted = queue.promote('item1');
      expect(promoted).toBe(true);
      expect(queue.get('item1')?.priority).toBe(TaskPriority.NORMAL);
    });

    it('should not promote critical items', () => {
      queue.enqueue('item1', 'value1', TaskPriority.CRITICAL);

      const promoted = queue.promote('item1');
      expect(promoted).toBe(false);
      expect(queue.get('item1')?.priority).toBe(TaskPriority.CRITICAL);
    });
  });

  describe('clear and getAll', () => {
    it('should clear all items', () => {
      queue.enqueue('item1', 'value1', TaskPriority.NORMAL);
      queue.enqueue('item2', 'value2', TaskPriority.HIGH);

      queue.clear();

      expect(queue.isEmpty()).toBe(true);
      expect(queue.size()).toBe(0);
    });

    it('should get all items', () => {
      queue.enqueue('item1', 'value1', TaskPriority.LOW);
      queue.enqueue('item2', 'value2', TaskPriority.HIGH);

      const all = queue.getAll();
      expect(all.length).toBe(2);
    });

    it('should get items by priority', () => {
      queue.enqueue('high1', 'value1', TaskPriority.HIGH);
      queue.enqueue('high2', 'value2', TaskPriority.HIGH);
      queue.enqueue('low1', 'value3', TaskPriority.LOW);

      const highItems = queue.getByPriority(TaskPriority.HIGH);
      expect(highItems.length).toBe(2);

      const lowItems = queue.getByPriority(TaskPriority.LOW);
      expect(lowItems.length).toBe(1);

      const normalItems = queue.getByPriority(TaskPriority.NORMAL);
      expect(normalItems.length).toBe(0);
    });
  });

  describe('statistics', () => {
    it('should return correct stats', () => {
      queue.enqueue('critical', 'value', TaskPriority.CRITICAL);
      queue.enqueue('high1', 'value', TaskPriority.HIGH);
      queue.enqueue('high2', 'value', TaskPriority.HIGH);
      queue.enqueue('normal', 'value', TaskPriority.NORMAL);
      queue.enqueue('low', 'value', TaskPriority.LOW);
      queue.enqueue('bg', 'value', TaskPriority.BACKGROUND);

      const stats = queue.getStats();

      expect(stats.total).toBe(6);
      expect(stats.byPriority[TaskPriority.CRITICAL]).toBe(1);
      expect(stats.byPriority[TaskPriority.HIGH]).toBe(2);
      expect(stats.byPriority[TaskPriority.NORMAL]).toBe(1);
      expect(stats.byPriority[TaskPriority.LOW]).toBe(1);
      expect(stats.byPriority[TaskPriority.BACKGROUND]).toBe(1);
      expect(stats.agingPromotions).toBe(0);
    });
  });

  describe('aging', () => {
    it('should promote items after threshold', async () => {
      vi.useFakeTimers();

      const agingQueue = createPriorityQueue<string>({
        enableAging: true,
        agingThresholdMs: 1000,
        agingCheckIntervalMs: 500,
      });

      agingQueue.enqueue('item1', 'value1', TaskPriority.LOW);

      // Initial priority should be LOW
      expect(agingQueue.get('item1')?.priority).toBe(TaskPriority.LOW);

      // Advance time past threshold
      vi.advanceTimersByTime(1500);

      // Should be promoted
      expect(agingQueue.get('item1')?.priority).toBe(TaskPriority.NORMAL);

      const stats = agingQueue.getStats();
      expect(stats.agingPromotions).toBeGreaterThan(0);

      agingQueue.destroy();
      vi.useRealTimers();
    });
  });
});

describe('utility functions', () => {
  describe('getPriorityName', () => {
    it('should return correct names', () => {
      expect(getPriorityName(TaskPriority.CRITICAL)).toBe('CRITICAL');
      expect(getPriorityName(TaskPriority.HIGH)).toBe('HIGH');
      expect(getPriorityName(TaskPriority.NORMAL)).toBe('NORMAL');
      expect(getPriorityName(TaskPriority.LOW)).toBe('LOW');
      expect(getPriorityName(TaskPriority.BACKGROUND)).toBe('BACKGROUND');
    });
  });

  describe('parsePriority', () => {
    it('should parse string values', () => {
      expect(parsePriority('CRITICAL')).toBe(TaskPriority.CRITICAL);
      expect(parsePriority('critical')).toBe(TaskPriority.CRITICAL);
      expect(parsePriority('HIGH')).toBe(TaskPriority.HIGH);
      expect(parsePriority('NORMAL')).toBe(TaskPriority.NORMAL);
      expect(parsePriority('LOW')).toBe(TaskPriority.LOW);
      expect(parsePriority('BACKGROUND')).toBe(TaskPriority.BACKGROUND);
    });

    it('should parse number values', () => {
      expect(parsePriority(0)).toBe(TaskPriority.CRITICAL);
      expect(parsePriority(1)).toBe(TaskPriority.HIGH);
      expect(parsePriority(2)).toBe(TaskPriority.NORMAL);
    });

    it('should default to NORMAL for unknown values', () => {
      expect(parsePriority('unknown')).toBe(TaskPriority.NORMAL);
    });
  });
});
