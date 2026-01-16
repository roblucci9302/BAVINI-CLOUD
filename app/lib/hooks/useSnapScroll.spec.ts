import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSnapScroll } from './useSnapScroll';

describe('useSnapScroll', () => {
  let mockResizeObserver: {
    observe: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    unobserve: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockResizeObserver = {
      observe: vi.fn(),
      disconnect: vi.fn(),
      unobserve: vi.fn(),
    };

    vi.stubGlobal(
      'ResizeObserver',
      vi.fn().mockImplementation(() => mockResizeObserver),
    );

    // Mock requestAnimationFrame pour les tests
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 0;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should return messageRef and scrollRef callbacks', () => {
    const { result } = renderHook(() => useSnapScroll());

    expect(result.current).toHaveLength(2);
    expect(typeof result.current[0]).toBe('function');
    expect(typeof result.current[1]).toBe('function');
  });

  describe('messageRef', () => {
    it('should create ResizeObserver when node is provided', () => {
      const { result } = renderHook(() => useSnapScroll());
      const [messageRef] = result.current;

      const mockNode = document.createElement('div');

      act(() => {
        messageRef(mockNode);
      });

      expect(ResizeObserver).toHaveBeenCalled();
      expect(mockResizeObserver.observe).toHaveBeenCalledWith(mockNode);
    });

    it('should handle null node gracefully', () => {
      const { result } = renderHook(() => useSnapScroll());
      const [messageRef] = result.current;

      // should not throw when called with null
      act(() => {
        messageRef(null);
      });

      // no observer was created so disconnect shouldn't be called
      expect(mockResizeObserver.disconnect).not.toHaveBeenCalled();
    });
  });

  describe('scrollRef', () => {
    it('should add scroll event listener when node is provided', () => {
      const { result } = renderHook(() => useSnapScroll());
      const [, scrollRef] = result.current;

      const mockNode = document.createElement('div');
      const addEventListenerSpy = vi.spyOn(mockNode, 'addEventListener');

      act(() => {
        scrollRef(mockNode);
      });

      expect(addEventListenerSpy).toHaveBeenCalledWith('scroll', expect.any(Function));
    });

    it('should remove scroll event listener when node is null', () => {
      const { result } = renderHook(() => useSnapScroll());
      const [, scrollRef] = result.current;

      const mockNode = document.createElement('div');
      const removeEventListenerSpy = vi.spyOn(mockNode, 'removeEventListener');

      act(() => {
        scrollRef(mockNode);
      });

      act(() => {
        scrollRef(null);
      });

      expect(removeEventListenerSpy).toHaveBeenCalledWith('scroll', expect.any(Function));
    });
  });

  describe('auto-scroll behavior', () => {
    it('should auto-scroll when near bottom', () => {
      const { result } = renderHook(() => useSnapScroll());
      const [messageRef, scrollRef] = result.current;

      const scrollNode = document.createElement('div');
      Object.defineProperties(scrollNode, {
        scrollHeight: { value: 1000 },
        clientHeight: { value: 500 },
        scrollTop: { value: 495, writable: true },
      });

      const scrollToSpy = vi.fn();
      scrollNode.scrollTo = scrollToSpy;

      const messageNode = document.createElement('div');

      // capture the ResizeObserver callback
      let resizeCallback: () => void = () => {};
      vi.mocked(ResizeObserver).mockImplementation((cb) => {
        resizeCallback = () => cb([], {} as ResizeObserver);
        return mockResizeObserver as unknown as ResizeObserver;
      });

      act(() => {
        scrollRef(scrollNode);
        messageRef(messageNode);
      });

      // trigger resize
      act(() => {
        resizeCallback();
      });

      expect(scrollToSpy).toHaveBeenCalledWith({ top: 500 });
    });
  });
});
