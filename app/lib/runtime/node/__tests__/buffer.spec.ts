/**
 * Unit tests for Node.js Buffer module
 */

import { describe, it, expect } from 'vitest';
import { Buffer } from '../globals/buffer';

describe('Buffer', () => {
  describe('Buffer.alloc', () => {
    it('should allocate buffer filled with zeros', () => {
      const buf = Buffer.alloc(10);
      expect(buf.length).toBe(10);
      for (let i = 0; i < buf.length; i++) {
        expect(buf[i]).toBe(0);
      }
    });

    it('should allocate buffer filled with specific value', () => {
      const buf = Buffer.alloc(5, 0x42);
      for (let i = 0; i < buf.length; i++) {
        expect(buf[i]).toBe(0x42);
      }
    });

    it('should allocate buffer filled with string', () => {
      const buf = Buffer.alloc(5, 'a');
      expect(buf.toString()).toBe('aaaaa');
    });
  });

  describe('Buffer.allocUnsafe', () => {
    it('should allocate buffer without zeroing', () => {
      const buf = Buffer.allocUnsafe(10);
      expect(buf.length).toBe(10);
    });
  });

  describe('Buffer.from', () => {
    it('should create buffer from string', () => {
      const buf = Buffer.from('hello');
      expect(buf.toString()).toBe('hello');
    });

    it('should create buffer from array', () => {
      const buf = Buffer.from([0x68, 0x65, 0x6c, 0x6c, 0x6f]);
      expect(buf.toString()).toBe('hello');
    });

    it('should create buffer from another buffer', () => {
      const original = Buffer.from('hello');
      const copy = Buffer.from(original);
      expect(copy.toString()).toBe('hello');
      // Should be a copy, not the same reference
      expect(copy).not.toBe(original);
    });

    it('should handle base64 encoding', () => {
      const buf = Buffer.from('aGVsbG8=', 'base64');
      expect(buf.toString()).toBe('hello');
    });

    it('should handle hex encoding', () => {
      const buf = Buffer.from('68656c6c6f', 'hex');
      expect(buf.toString()).toBe('hello');
    });
  });

  describe('Buffer.concat', () => {
    it('should concatenate buffers', () => {
      const buf1 = Buffer.from('hello');
      const buf2 = Buffer.from(' ');
      const buf3 = Buffer.from('world');
      const result = Buffer.concat([buf1, buf2, buf3]);
      expect(result.toString()).toBe('hello world');
    });

    it('should respect totalLength parameter', () => {
      const buf1 = Buffer.from('hello');
      const buf2 = Buffer.from('world');
      const result = Buffer.concat([buf1, buf2], 5);
      expect(result.toString()).toBe('hello');
    });
  });

  describe('Buffer.isBuffer', () => {
    it('should return true for buffers', () => {
      expect(Buffer.isBuffer(Buffer.alloc(0))).toBe(true);
    });

    it('should return false for non-buffers', () => {
      expect(Buffer.isBuffer(new Uint8Array(10))).toBe(false);
      expect(Buffer.isBuffer('string')).toBe(false);
      expect(Buffer.isBuffer(123)).toBe(false);
    });
  });

  describe('Buffer.isEncoding', () => {
    it('should return true for valid encodings', () => {
      expect(Buffer.isEncoding('utf8')).toBe(true);
      expect(Buffer.isEncoding('utf-8')).toBe(true);
      expect(Buffer.isEncoding('hex')).toBe(true);
      expect(Buffer.isEncoding('base64')).toBe(true);
      expect(Buffer.isEncoding('latin1')).toBe(true);
    });

    it('should return false for invalid encodings', () => {
      expect(Buffer.isEncoding('invalid')).toBe(false);
    });
  });

  describe('Buffer.byteLength', () => {
    it('should return byte length of string', () => {
      expect(Buffer.byteLength('hello')).toBe(5);
    });

    it('should handle UTF-8 characters', () => {
      expect(Buffer.byteLength('héllo')).toBeGreaterThan(5);
    });

    it('should return byte length of buffer', () => {
      const buf = Buffer.from('hello');
      expect(Buffer.byteLength(buf)).toBe(5);
    });
  });

  describe('Buffer.compare', () => {
    it('should compare buffers', () => {
      const buf1 = Buffer.from('ABC');
      const buf2 = Buffer.from('BCD');
      const buf3 = Buffer.from('ABC');

      expect(Buffer.compare(buf1, buf2)).toBeLessThan(0);
      expect(Buffer.compare(buf2, buf1)).toBeGreaterThan(0);
      expect(Buffer.compare(buf1, buf3)).toBe(0);
    });
  });

  describe('buffer.write', () => {
    it('should write string to buffer', () => {
      const buf = Buffer.alloc(10);
      buf.write('hello');
      expect(buf.toString('utf8', 0, 5)).toBe('hello');
    });

    it('should write at offset', () => {
      const buf = Buffer.alloc(10);
      buf.write('hello', 2);
      expect(buf.toString('utf8', 2, 7)).toBe('hello');
    });
  });

  describe('buffer.toString', () => {
    it('should convert to string', () => {
      const buf = Buffer.from('hello');
      expect(buf.toString()).toBe('hello');
    });

    it('should handle slices', () => {
      const buf = Buffer.from('hello world');
      expect(buf.toString('utf8', 0, 5)).toBe('hello');
    });

    it('should handle hex encoding', () => {
      const buf = Buffer.from('hello');
      expect(buf.toString('hex')).toBe('68656c6c6f');
    });

    it('should handle base64 encoding', () => {
      const buf = Buffer.from('hello');
      expect(buf.toString('base64')).toBe('aGVsbG8=');
    });
  });

  describe('buffer.toJSON', () => {
    it('should convert to JSON', () => {
      const buf = Buffer.from([1, 2, 3]);
      const json = buf.toJSON();
      expect(json.type).toBe('Buffer');
      expect(json.data).toEqual([1, 2, 3]);
    });
  });

  describe('buffer.equals', () => {
    it('should check equality', () => {
      const buf1 = Buffer.from('ABC');
      const buf2 = Buffer.from('ABC');
      const buf3 = Buffer.from('ABD');

      expect(buf1.equals(buf2)).toBe(true);
      expect(buf1.equals(buf3)).toBe(false);
    });
  });

  describe('buffer.compare', () => {
    it('should compare buffers', () => {
      const buf1 = Buffer.from('ABC');
      const buf2 = Buffer.from('BCD');

      expect(buf1.compare(buf2)).toBeLessThan(0);
      expect(buf2.compare(buf1)).toBeGreaterThan(0);
    });
  });

  describe('buffer.copy', () => {
    it('should copy buffer', () => {
      const src = Buffer.from('hello');
      const dest = Buffer.alloc(5);
      src.copy(dest);
      expect(dest.toString()).toBe('hello');
    });

    it('should copy with offsets', () => {
      const src = Buffer.from('hello');
      const dest = Buffer.alloc(10);
      src.copy(dest, 2);
      expect(dest.toString('utf8', 2, 7)).toBe('hello');
    });
  });

  describe('buffer.slice', () => {
    it('should create slice', () => {
      const buf = Buffer.from('hello world');
      const slice = buf.slice(0, 5);
      expect(slice.toString()).toBe('hello');
    });
  });

  describe('buffer.fill', () => {
    it('should fill buffer', () => {
      const buf = Buffer.alloc(5);
      buf.fill(0x42);
      for (let i = 0; i < buf.length; i++) {
        expect(buf[i]).toBe(0x42);
      }
    });

    it('should fill with string', () => {
      const buf = Buffer.alloc(5);
      buf.fill('a');
      expect(buf.toString()).toBe('aaaaa');
    });
  });

  describe('buffer.indexOf', () => {
    it('should find value in buffer', () => {
      const buf = Buffer.from('hello world');
      expect(buf.indexOf('world')).toBe(6);
      expect(buf.indexOf('foo')).toBe(-1);
    });
  });

  describe('buffer.includes', () => {
    it('should check if buffer includes value', () => {
      const buf = Buffer.from('hello world');
      expect(buf.includes('world')).toBe(true);
      expect(buf.includes('foo')).toBe(false);
    });
  });

  describe('integer read/write', () => {
    it('should read/write Int8', () => {
      const buf = Buffer.alloc(1);
      buf.writeInt8(-10, 0);
      expect(buf.readInt8(0)).toBe(-10);
    });

    it('should read/write UInt8', () => {
      const buf = Buffer.alloc(1);
      buf.writeUInt8(200, 0);
      expect(buf.readUInt8(0)).toBe(200);
    });

    it('should read/write Int16LE', () => {
      const buf = Buffer.alloc(2);
      buf.writeInt16LE(-1000, 0);
      expect(buf.readInt16LE(0)).toBe(-1000);
    });

    it('should read/write Int32LE', () => {
      const buf = Buffer.alloc(4);
      buf.writeInt32LE(-100000, 0);
      expect(buf.readInt32LE(0)).toBe(-100000);
    });

    it('should read/write FloatLE', () => {
      const buf = Buffer.alloc(4);
      buf.writeFloatLE(3.14, 0);
      expect(buf.readFloatLE(0)).toBeCloseTo(3.14, 2);
    });

    it('should read/write DoubleLE', () => {
      const buf = Buffer.alloc(8);
      buf.writeDoubleLE(3.14159265359, 0);
      expect(buf.readDoubleLE(0)).toBeCloseTo(3.14159265359, 10);
    });
  });
});
