import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { bufferWatchEvents } from './buffer';

describe('bufferWatchEvents', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should buffer events and call callback after timeout', async () => {
    const callback = vi.fn();
    const buffer = bufferWatchEvents<[string]>(100, callback);

    buffer('event1');
    buffer('event2');

    expect(callback).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(100);

    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback).toHaveBeenCalledWith([['event1'], ['event2']]);
  });

  it('should clear events after callback', async () => {
    const callback = vi.fn();
    const buffer = bufferWatchEvents<[string]>(100, callback);

    buffer('event1');
    await vi.advanceTimersByTimeAsync(100);

    buffer('event2');
    await vi.advanceTimersByTimeAsync(100);

    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback).toHaveBeenNthCalledWith(1, [['event1']]);
    expect(callback).toHaveBeenNthCalledWith(2, [['event2']]);
  });

  it('should handle multiple arguments per event', async () => {
    const callback = vi.fn();
    const buffer = bufferWatchEvents<[string, number]>(100, callback);

    buffer('event1', 1);
    buffer('event2', 2);

    await vi.advanceTimersByTimeAsync(100);

    expect(callback).toHaveBeenCalledWith([
      ['event1', 1],
      ['event2', 2],
    ]);
  });

  it('should not call callback when no events are buffered', async () => {
    const callback = vi.fn();
    bufferWatchEvents<[string]>(100, callback);

    await vi.advanceTimersByTimeAsync(100);

    expect(callback).not.toHaveBeenCalled();
  });

  it('should start new buffer period after previous batch', async () => {
    const callback = vi.fn();
    const buffer = bufferWatchEvents<[string]>(100, callback);

    buffer('batch1-event1');
    await vi.advanceTimersByTimeAsync(100);

    buffer('batch2-event1');
    buffer('batch2-event2');
    await vi.advanceTimersByTimeAsync(100);

    expect(callback).toHaveBeenCalledTimes(2);
  });

  it('should handle async callback', async () => {
    const results: string[] = [];
    const callback = vi.fn(async (events: [string][]) => {
      await Promise.resolve();
      results.push(...events.map((e) => e[0]));
    });
    const buffer = bufferWatchEvents<[string]>(100, callback);

    buffer('event1');
    await vi.advanceTimersByTimeAsync(100);

    expect(callback).toHaveBeenCalled();
  });
});
