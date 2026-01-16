import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { usePromptEnhancer } from './usePromptEnhancer';

describe('usePromptEnhancer', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('initial state', () => {
    it('should have enhancingPrompt as false', () => {
      const { result } = renderHook(() => usePromptEnhancer());

      expect(result.current.enhancingPrompt).toBe(false);
    });

    it('should have promptEnhanced as false', () => {
      const { result } = renderHook(() => usePromptEnhancer());

      expect(result.current.promptEnhanced).toBe(false);
    });

    it('should return enhancePrompt function', () => {
      const { result } = renderHook(() => usePromptEnhancer());

      expect(typeof result.current.enhancePrompt).toBe('function');
    });

    it('should return resetEnhancer function', () => {
      const { result } = renderHook(() => usePromptEnhancer());

      expect(typeof result.current.resetEnhancer).toBe('function');
    });
  });

  describe('resetEnhancer', () => {
    it('should reset both flags to false', async () => {
      const mockReader = {
        read: vi
          .fn()
          .mockResolvedValueOnce({ value: new TextEncoder().encode('enhanced'), done: false })
          .mockResolvedValueOnce({ done: true }),
      };

      vi.mocked(fetch).mockResolvedValue({
        body: { getReader: () => mockReader },
      } as unknown as Response);

      const { result } = renderHook(() => usePromptEnhancer());
      const setInput = vi.fn();

      await act(async () => {
        await result.current.enhancePrompt('test', setInput);
      });

      expect(result.current.promptEnhanced).toBe(true);

      act(() => {
        result.current.resetEnhancer();
      });

      expect(result.current.enhancingPrompt).toBe(false);
      expect(result.current.promptEnhanced).toBe(false);
    });
  });

  describe('enhancePrompt', () => {
    it('should set enhancingPrompt to true when starting', async () => {
      const mockReader = {
        read: vi.fn().mockImplementation(
          () =>
            new Promise((resolve) => {
              setTimeout(() => resolve({ done: true }), 100);
            }),
        ),
      };

      vi.mocked(fetch).mockResolvedValue({
        body: { getReader: () => mockReader },
      } as unknown as Response);

      const { result } = renderHook(() => usePromptEnhancer());
      const setInput = vi.fn();

      act(() => {
        result.current.enhancePrompt('test', setInput);
      });

      expect(result.current.enhancingPrompt).toBe(true);
    });

    it('should call fetch with correct parameters', async () => {
      const mockReader = {
        read: vi.fn().mockResolvedValue({ done: true }),
      };

      vi.mocked(fetch).mockResolvedValue({
        body: { getReader: () => mockReader },
      } as unknown as Response);

      const { result } = renderHook(() => usePromptEnhancer());
      const setInput = vi.fn();

      await act(async () => {
        await result.current.enhancePrompt('test message', setInput);
      });

      expect(fetch).toHaveBeenCalledWith('/api/enhancer', {
        method: 'POST',
        body: JSON.stringify({ message: 'test message' }),
      });
    });

    it('should stream response and update input', async () => {
      const mockReader = {
        read: vi
          .fn()
          .mockResolvedValueOnce({ value: new TextEncoder().encode('Hello'), done: false })
          .mockResolvedValueOnce({ value: new TextEncoder().encode(' World'), done: false })
          .mockResolvedValueOnce({ done: true }),
      };

      vi.mocked(fetch).mockResolvedValue({
        body: { getReader: () => mockReader },
      } as unknown as Response);

      const { result } = renderHook(() => usePromptEnhancer());
      const setInput = vi.fn();

      await act(async () => {
        await result.current.enhancePrompt('test', setInput);
      });

      // should clear input first
      expect(setInput).toHaveBeenNthCalledWith(1, '');

      // should update with streamed content
      expect(setInput).toHaveBeenNthCalledWith(2, 'Hello');
      expect(setInput).toHaveBeenNthCalledWith(3, 'Hello World');
    });

    it('should set promptEnhanced to true when done', async () => {
      const mockReader = {
        read: vi.fn().mockResolvedValue({ done: true }),
      };

      vi.mocked(fetch).mockResolvedValue({
        body: { getReader: () => mockReader },
      } as unknown as Response);

      const { result } = renderHook(() => usePromptEnhancer());
      const setInput = vi.fn();

      await act(async () => {
        await result.current.enhancePrompt('test', setInput);
      });

      await waitFor(() => {
        expect(result.current.promptEnhanced).toBe(true);
        expect(result.current.enhancingPrompt).toBe(false);
      });
    });

    it('should restore original input on error', async () => {
      const mockReader = {
        read: vi.fn().mockRejectedValue(new Error('Stream error')),
      };

      vi.mocked(fetch).mockResolvedValue({
        body: { getReader: () => mockReader },
      } as unknown as Response);

      const { result } = renderHook(() => usePromptEnhancer());
      const setInput = vi.fn();

      await act(async () => {
        await result.current.enhancePrompt('original input', setInput);
      });

      expect(setInput).toHaveBeenCalledWith('original input');
    });
  });
});
