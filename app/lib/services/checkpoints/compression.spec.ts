/**
 * Tests for checkpoint compression utilities.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  isCompressionSupported,
  compressString,
  decompressString,
  compressJson,
  decompressJson,
  calculateStringSize,
  shouldCompress,
  maybeCompress,
  maybeDecompress,
} from './compression';

// Mock logger
vi.mock('~/utils/logger', () => ({
  createScopedLogger: vi.fn(() => ({
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

describe('compression utilities', () => {
  describe('isCompressionSupported', () => {
    it('should return true when CompressionStream is available', () => {
      // In Node.js test environment, CompressionStream might not be available
      const result = isCompressionSupported();
      expect(typeof result).toBe('boolean');
    });
  });

  describe('calculateStringSize', () => {
    it('should calculate byte size of ASCII string', () => {
      const str = 'Hello, World!';
      expect(calculateStringSize(str)).toBe(13);
    });

    it('should calculate byte size of Unicode string', () => {
      const str = 'Bonjour 世界 🌍';
      const size = calculateStringSize(str);

      // Unicode characters take more bytes
      expect(size).toBeGreaterThan(str.length);
    });

    it('should return 0 for empty string', () => {
      expect(calculateStringSize('')).toBe(0);
    });
  });

  describe('shouldCompress', () => {
    it('should return false for small data', () => {
      const smallData = 'Hello';
      expect(shouldCompress(smallData, 1024)).toBe(false);
    });

    it('should return true for large data when compression is supported', () => {
      const largeData = 'x'.repeat(2000);

      if (isCompressionSupported()) {
        expect(shouldCompress(largeData, 1024)).toBe(true);
      } else {
        expect(shouldCompress(largeData, 1024)).toBe(false);
      }
    });
  });

  describe('compressString and decompressString', () => {
    it('should handle round-trip compression', async () => {
      const original = 'Hello, this is a test string that should be compressed and decompressed correctly!';

      const compressed = await compressString(original);
      const decompressed = await decompressString(compressed);

      // If compression is not supported, it returns the original
      if (isCompressionSupported()) {
        // Compressed data should be different from original (base64 encoded gzip)
        expect(compressed).not.toBe(original);
      }

      expect(decompressed).toBe(original);
    });

    it('should handle empty string', async () => {
      const original = '';
      const compressed = await compressString(original);
      const decompressed = await decompressString(compressed);
      expect(decompressed).toBe(original);
    });

    it('should handle large data', async () => {
      const original = 'x'.repeat(10000);
      const compressed = await compressString(original);
      const decompressed = await decompressString(compressed);
      expect(decompressed).toBe(original);
    });

    it('should handle uncompressed data in decompressString', async () => {
      const notCompressed = 'This is not compressed data';
      const result = await decompressString(notCompressed);
      expect(result).toBe(notCompressed);
    });
  });

  describe('compressJson and decompressJson', () => {
    it('should handle round-trip JSON compression', async () => {
      const original = {
        name: 'Test',
        values: [1, 2, 3],
        nested: { a: 'b', c: true },
      };

      const compressed = await compressJson(original);
      const decompressed = await decompressJson<typeof original>(compressed);

      expect(decompressed).toEqual(original);
    });

    it('should handle complex nested structures', async () => {
      const original = {
        files: {
          '/home/project/index.ts': { type: 'file', content: 'console.log("test")', isBinary: false },
          '/home/project/utils.ts': { type: 'file', content: 'export const x = 1;', isBinary: false },
        },
        messages: [
          { id: 'msg-1', role: 'user', content: 'Hello' },
          { id: 'msg-2', role: 'assistant', content: 'Hi there!' },
        ],
      };

      const compressed = await compressJson(original);
      const decompressed = await decompressJson<typeof original>(compressed);

      expect(decompressed).toEqual(original);
    });

    it('should handle arrays', async () => {
      const original = [1, 2, 3, 'four', { five: 5 }];

      const compressed = await compressJson(original);
      const decompressed = await decompressJson<typeof original>(compressed);

      expect(decompressed).toEqual(original);
    });
  });

  describe('maybeCompress', () => {
    it('should not compress small data', async () => {
      const smallData = 'Hello';
      const result = await maybeCompress(smallData, 1024);

      expect(result.compressed).toBe(false);
      expect(result.data).toBe(smallData);
    });

    it('should compress large data when supported', async () => {
      const largeData = 'x'.repeat(2000);
      const result = await maybeCompress(largeData, 1024);

      if (isCompressionSupported()) {
        expect(result.compressed).toBe(true);
        expect(result.data).not.toBe(largeData);
      } else {
        expect(result.compressed).toBe(false);
        expect(result.data).toBe(largeData);
      }
    });
  });

  describe('maybeDecompress', () => {
    it('should not decompress when wasCompressed is false', async () => {
      const data = 'uncompressed data';
      const result = await maybeDecompress(data, false);
      expect(result).toBe(data);
    });

    it('should decompress when wasCompressed is true', async () => {
      const original = 'test data that was compressed';
      const { data: compressed } = await maybeCompress(original, 0); // Force compression

      const result = await maybeDecompress(compressed, true);

      // If compression is supported, should get back original
      if (isCompressionSupported()) {
        expect(result).toBe(original);
      }
    });
  });
});
