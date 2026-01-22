/**
 * Unit tests for Node.js events module
 */

import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from '../core-modules/events';

describe('EventEmitter', () => {
  describe('on/emit', () => {
    it('should register and emit events', () => {
      const emitter = new EventEmitter();
      const handler = vi.fn();

      emitter.on('test', handler);
      emitter.emit('test', 'arg1', 'arg2');

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith('arg1', 'arg2');
    });

    it('should support multiple listeners', () => {
      const emitter = new EventEmitter();
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      emitter.on('test', handler1);
      emitter.on('test', handler2);
      emitter.emit('test');

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('should return false when no listeners', () => {
      const emitter = new EventEmitter();
      expect(emitter.emit('test')).toBe(false);
    });

    it('should return true when listeners exist', () => {
      const emitter = new EventEmitter();
      emitter.on('test', () => {});
      expect(emitter.emit('test')).toBe(true);
    });
  });

  describe('once', () => {
    it('should call listener only once', () => {
      const emitter = new EventEmitter();
      const handler = vi.fn();

      emitter.once('test', handler);
      emitter.emit('test');
      emitter.emit('test');

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('off/removeListener', () => {
    it('should remove listener', () => {
      const emitter = new EventEmitter();
      const handler = vi.fn();

      emitter.on('test', handler);
      emitter.off('test', handler);
      emitter.emit('test');

      expect(handler).not.toHaveBeenCalled();
    });

    it('should only remove the specific listener', () => {
      const emitter = new EventEmitter();
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      emitter.on('test', handler1);
      emitter.on('test', handler2);
      emitter.off('test', handler1);
      emitter.emit('test');

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledTimes(1);
    });
  });

  describe('removeAllListeners', () => {
    it('should remove all listeners for an event', () => {
      const emitter = new EventEmitter();
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      emitter.on('test', handler1);
      emitter.on('test', handler2);
      emitter.removeAllListeners('test');
      emitter.emit('test');

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });

    it('should remove all listeners when no event specified', () => {
      const emitter = new EventEmitter();
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      emitter.on('test1', handler1);
      emitter.on('test2', handler2);
      emitter.removeAllListeners();
      emitter.emit('test1');
      emitter.emit('test2');

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });
  });

  describe('listenerCount', () => {
    it('should return correct count', () => {
      const emitter = new EventEmitter();

      expect(emitter.listenerCount('test')).toBe(0);

      emitter.on('test', () => {});
      expect(emitter.listenerCount('test')).toBe(1);

      emitter.on('test', () => {});
      expect(emitter.listenerCount('test')).toBe(2);
    });
  });

  describe('listeners', () => {
    it('should return array of listeners', () => {
      const emitter = new EventEmitter();
      const handler1 = () => {};
      const handler2 = () => {};

      emitter.on('test', handler1);
      emitter.on('test', handler2);

      const listeners = emitter.listeners('test');
      expect(listeners).toHaveLength(2);
      expect(listeners).toContain(handler1);
      expect(listeners).toContain(handler2);
    });
  });

  describe('eventNames', () => {
    it('should return array of event names', () => {
      const emitter = new EventEmitter();

      emitter.on('test1', () => {});
      emitter.on('test2', () => {});

      const names = emitter.eventNames();
      expect(names).toContain('test1');
      expect(names).toContain('test2');
    });
  });

  describe('setMaxListeners/getMaxListeners', () => {
    it('should set and get max listeners', () => {
      const emitter = new EventEmitter();

      expect(emitter.getMaxListeners()).toBe(10);

      emitter.setMaxListeners(20);
      expect(emitter.getMaxListeners()).toBe(20);
    });
  });

  describe('prependListener', () => {
    it('should prepend listener', () => {
      const emitter = new EventEmitter();
      const order: number[] = [];

      emitter.on('test', () => order.push(1));
      emitter.prependListener('test', () => order.push(0));
      emitter.emit('test');

      expect(order).toEqual([0, 1]);
    });
  });

  describe('prependOnceListener', () => {
    it('should prepend once listener', () => {
      const emitter = new EventEmitter();
      const order: number[] = [];

      emitter.on('test', () => order.push(1));
      emitter.prependOnceListener('test', () => order.push(0));
      emitter.emit('test');
      emitter.emit('test');

      expect(order).toEqual([0, 1, 1]);
    });
  });

  describe('error event', () => {
    it('should throw when emitting error without listener', () => {
      const emitter = new EventEmitter();
      const error = new Error('test error');

      expect(() => emitter.emit('error', error)).toThrow('test error');
    });

    it('should not throw when error listener exists', () => {
      const emitter = new EventEmitter();
      const handler = vi.fn();
      const error = new Error('test error');

      emitter.on('error', handler);
      emitter.emit('error', error);

      expect(handler).toHaveBeenCalledWith(error);
    });
  });

  describe('static methods', () => {
    it('should have static listenerCount', () => {
      const emitter = new EventEmitter();
      emitter.on('test', () => {});
      emitter.on('test', () => {});

      expect(EventEmitter.listenerCount(emitter, 'test')).toBe(2);
    });
  });
});
