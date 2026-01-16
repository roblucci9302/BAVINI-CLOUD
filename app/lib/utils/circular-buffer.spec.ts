import { describe, expect, it } from 'vitest';
import { CircularBuffer, createCircularBufferStore } from './circular-buffer';

describe('CircularBuffer', () => {
  describe('constructor', () => {
    it('should create buffer with given capacity', () => {
      const buffer = new CircularBuffer<number>(5);
      expect(buffer.maxSize).toBe(5);
      expect(buffer.size).toBe(0);
      expect(buffer.isEmpty).toBe(true);
    });

    it('should throw for invalid capacity', () => {
      expect(() => new CircularBuffer(0)).toThrow();
      expect(() => new CircularBuffer(-1)).toThrow();
    });
  });

  describe('push', () => {
    it('should add elements', () => {
      const buffer = new CircularBuffer<number>(3);
      buffer.push(1);
      buffer.push(2);

      expect(buffer.size).toBe(2);
      expect(buffer.toArray()).toEqual([1, 2]);
    });

    it('should overwrite oldest when full', () => {
      const buffer = new CircularBuffer<number>(3);
      buffer.push(1);
      buffer.push(2);
      buffer.push(3);
      buffer.push(4); // overwrites 1

      expect(buffer.size).toBe(3);
      expect(buffer.toArray()).toEqual([2, 3, 4]);
    });

    it('should handle many overwrites', () => {
      const buffer = new CircularBuffer<number>(2);

      for (let i = 1; i <= 10; i++) {
        buffer.push(i);
      }

      expect(buffer.toArray()).toEqual([9, 10]);
    });
  });

  describe('pushMany', () => {
    it('should add multiple elements', () => {
      const buffer = new CircularBuffer<number>(5);
      buffer.pushMany([1, 2, 3]);

      expect(buffer.toArray()).toEqual([1, 2, 3]);
    });
  });

  describe('toArray', () => {
    it('should return empty array for empty buffer', () => {
      const buffer = new CircularBuffer<number>(3);
      expect(buffer.toArray()).toEqual([]);
    });

    it('should return elements in order', () => {
      const buffer = new CircularBuffer<number>(5);
      buffer.pushMany([1, 2, 3, 4, 5]);

      expect(buffer.toArray()).toEqual([1, 2, 3, 4, 5]);
    });

    it('should return correct order after wraparound', () => {
      const buffer = new CircularBuffer<number>(3);
      buffer.pushMany([1, 2, 3, 4, 5]);

      expect(buffer.toArray()).toEqual([3, 4, 5]);
    });
  });

  describe('first and last', () => {
    it('should return undefined for empty buffer', () => {
      const buffer = new CircularBuffer<number>(3);

      expect(buffer.first()).toBeUndefined();
      expect(buffer.last()).toBeUndefined();
    });

    it('should return correct first and last', () => {
      const buffer = new CircularBuffer<number>(3);
      buffer.pushMany([1, 2, 3]);

      expect(buffer.first()).toBe(1);
      expect(buffer.last()).toBe(3);
    });

    it('should return correct values after wraparound', () => {
      const buffer = new CircularBuffer<number>(3);
      buffer.pushMany([1, 2, 3, 4, 5]);

      expect(buffer.first()).toBe(3);
      expect(buffer.last()).toBe(5);
    });
  });

  describe('get', () => {
    it('should return element by index', () => {
      const buffer = new CircularBuffer<number>(5);
      buffer.pushMany([10, 20, 30]);

      expect(buffer.get(0)).toBe(10);
      expect(buffer.get(1)).toBe(20);
      expect(buffer.get(2)).toBe(30);
    });

    it('should return undefined for out of bounds', () => {
      const buffer = new CircularBuffer<number>(3);
      buffer.push(1);

      expect(buffer.get(-1)).toBeUndefined();
      expect(buffer.get(5)).toBeUndefined();
    });
  });

  describe('clear', () => {
    it('should empty the buffer', () => {
      const buffer = new CircularBuffer<number>(3);
      buffer.pushMany([1, 2, 3]);
      buffer.clear();

      expect(buffer.isEmpty).toBe(true);
      expect(buffer.size).toBe(0);
      expect(buffer.toArray()).toEqual([]);
    });
  });

  describe('iterator', () => {
    it('should iterate in order', () => {
      const buffer = new CircularBuffer<number>(3);
      buffer.pushMany([1, 2, 3]);

      const result: number[] = [];

      for (const item of buffer) {
        result.push(item);
      }

      expect(result).toEqual([1, 2, 3]);
    });
  });

  describe('filter and find', () => {
    it('should filter elements', () => {
      const buffer = new CircularBuffer<number>(5);
      buffer.pushMany([1, 2, 3, 4, 5]);

      const evens = buffer.filter((n) => n % 2 === 0);

      expect(evens).toEqual([2, 4]);
    });

    it('should find element', () => {
      const buffer = new CircularBuffer<{ id: number }>(3);
      buffer.pushMany([{ id: 1 }, { id: 2 }, { id: 3 }]);

      const found = buffer.find((item) => item.id === 2);

      expect(found).toEqual({ id: 2 });
    });
  });

  describe('from', () => {
    it('should create buffer from array', () => {
      const buffer = CircularBuffer.from([1, 2, 3]);

      expect(buffer.maxSize).toBe(3);
      expect(buffer.toArray()).toEqual([1, 2, 3]);
    });

    it('should create buffer with custom capacity', () => {
      const buffer = CircularBuffer.from([1, 2, 3], 5);

      expect(buffer.maxSize).toBe(5);
      expect(buffer.size).toBe(3);
    });
  });
});

describe('createCircularBufferStore', () => {
  it('should create store with buffer', () => {
    const store = createCircularBufferStore<number>(3);

    expect(store.size).toBe(0);
    expect(store.get()).toEqual([]);
  });

  it('should push and return array', () => {
    const store = createCircularBufferStore<number>(3);

    const result = store.push(1);

    expect(result).toEqual([1]);
    expect(store.get()).toEqual([1]);
  });

  it('should handle overflow', () => {
    const store = createCircularBufferStore<number>(2);

    store.push(1);
    store.push(2);

    const result = store.push(3);

    expect(result).toEqual([2, 3]);
  });

  it('should clear', () => {
    const store = createCircularBufferStore<number>(3);
    store.pushMany([1, 2, 3]);

    const result = store.clear();

    expect(result).toEqual([]);
    expect(store.size).toBe(0);
  });
});
