/**
 * =============================================================================
 * BAVINI Container - Buffer Implementation
 * =============================================================================
 * Node.js Buffer class implementation using Uint8Array.
 * =============================================================================
 */

import type { BufferEncoding } from '../types';

/**
 * Encoding lookup tables
 */
const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const BASE64URL_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/**
 * Supported encodings
 */
const SUPPORTED_ENCODINGS = new Set([
  'ascii',
  'utf8',
  'utf-8',
  'utf16le',
  'ucs2',
  'ucs-2',
  'base64',
  'base64url',
  'latin1',
  'binary',
  'hex',
]);

/**
 * Buffer class extending Uint8Array
 */
// @ts-expect-error Static methods differ from Uint8Array but runtime behavior is correct
export class Buffer extends Uint8Array {
  /**
   * Pool size for small allocations
   */
  static poolSize = 8192;

  /**
   * Allocate a new buffer
   */
  static alloc(size: number, fill?: number | string | Buffer, encoding?: BufferEncoding): Buffer {
    const buf = new Buffer(size);

    if (fill !== undefined) {
      buf.fill(fill, 0, size, encoding);
    }

    return buf;
  }

  /**
   * Allocate unsafe (uninitialized) buffer
   */
  static allocUnsafe(size: number): Buffer {
    return new Buffer(size);
  }

  /**
   * Create buffer from data
   */
  static from(
    data: ArrayLike<number> | ArrayBufferLike | string | Buffer,
    encodingOrOffset?: BufferEncoding | number,
    length?: number,
  ): Buffer {
    if (typeof data === 'string') {
      return Buffer.fromString(data, encodingOrOffset as BufferEncoding);
    }

    if (data instanceof ArrayBuffer || data instanceof SharedArrayBuffer) {
      const offset = typeof encodingOrOffset === 'number' ? encodingOrOffset : 0;
      const len = length ?? data.byteLength - offset;
      return new Buffer(new Uint8Array(data, offset, len));
    }

    if (data instanceof Buffer) {
      return new Buffer(data);
    }

    if (ArrayBuffer.isView(data)) {
      return new Buffer(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
    }

    // ArrayLike<number>
    return new Buffer(data as ArrayLike<number>);
  }

  /**
   * Create buffer from string
   */
  private static fromString(str: string, encoding: BufferEncoding = 'utf8'): Buffer {
    const normalizedEncoding = normalizeEncoding(encoding);

    switch (normalizedEncoding) {
      case 'hex':
        return Buffer.fromHex(str);
      case 'base64':
        return Buffer.fromBase64(str);
      case 'base64url':
        return Buffer.fromBase64Url(str);
      case 'ascii':
      case 'latin1':
      case 'binary':
        return Buffer.fromLatin1(str);
      case 'utf16le':
      case 'ucs2':
        return Buffer.fromUtf16le(str);
      case 'utf8':
      default:
        return Buffer.fromUtf8(str);
    }
  }

  private static fromUtf8(str: string): Buffer {
    const encoder = new TextEncoder();
    return new Buffer(encoder.encode(str));
  }

  private static fromLatin1(str: string): Buffer {
    const buf = new Buffer(str.length);

    for (let i = 0; i < str.length; i++) {
      buf[i] = str.charCodeAt(i) & 0xff;
    }

    return buf;
  }

  private static fromUtf16le(str: string): Buffer {
    const buf = new Buffer(str.length * 2);

    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      buf[i * 2] = code & 0xff;
      buf[i * 2 + 1] = code >> 8;
    }

    return buf;
  }

  private static fromHex(str: string): Buffer {
    const len = str.length / 2;
    const buf = new Buffer(len);

    for (let i = 0; i < len; i++) {
      buf[i] = parseInt(str.slice(i * 2, i * 2 + 2), 16);
    }

    return buf;
  }

  private static fromBase64(str: string): Buffer {
    const binary = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
    return Buffer.fromLatin1(binary);
  }

  private static fromBase64Url(str: string): Buffer {
    // Pad the string if needed
    let padded = str;

    while (padded.length % 4) {
      padded += '=';
    }

    return Buffer.fromBase64(padded);
  }

  /**
   * Concatenate buffers
   */
  static concat(list: Buffer[], totalLength?: number): Buffer {
    if (list.length === 0) {
      return new Buffer(0);
    }

    const length = totalLength ?? list.reduce((acc, buf) => acc + buf.length, 0);
    const result = new Buffer(length);
    let offset = 0;

    for (const buf of list) {
      result.set(buf, offset);
      offset += buf.length;

      if (offset >= length) break;
    }

    return result;
  }

  /**
   * Check if value is a Buffer
   */
  static isBuffer(obj: unknown): obj is Buffer {
    return obj instanceof Buffer;
  }

  /**
   * Check if encoding is supported
   */
  static isEncoding(encoding: string): boolean {
    return SUPPORTED_ENCODINGS.has(normalizeEncoding(encoding));
  }

  /**
   * Get byte length of string
   */
  static byteLength(string: string | Buffer, encoding: BufferEncoding = 'utf8'): number {
    if (Buffer.isBuffer(string)) {
      return string.length;
    }

    const normalizedEncoding = normalizeEncoding(encoding);

    switch (normalizedEncoding) {
      case 'hex':
        return string.length / 2;
      case 'base64':
      case 'base64url': {
        const len = string.length;
        const padding = string.endsWith('==') ? 2 : string.endsWith('=') ? 1 : 0;
        return Math.floor((len * 3) / 4) - padding;
      }
      case 'ascii':
      case 'latin1':
      case 'binary':
        return string.length;
      case 'utf16le':
      case 'ucs2':
        return string.length * 2;
      case 'utf8':
      default:
        return new TextEncoder().encode(string).length;
    }
  }

  /**
   * Compare two buffers
   */
  static compare(buf1: Buffer, buf2: Buffer): number {
    const len = Math.min(buf1.length, buf2.length);

    for (let i = 0; i < len; i++) {
      if (buf1[i] < buf2[i]) return -1;
      if (buf1[i] > buf2[i]) return 1;
    }

    if (buf1.length < buf2.length) return -1;
    if (buf1.length > buf2.length) return 1;

    return 0;
  }

  /**
   * Write string to buffer
   */
  write(string: string, offset = 0, length?: number, encoding: BufferEncoding = 'utf8'): number {
    const buf = Buffer.from(string, encoding);
    const writeLength = Math.min(length ?? buf.length, buf.length, this.length - offset);
    this.set(buf.subarray(0, writeLength), offset);
    return writeLength;
  }

  /**
   * Convert to string
   */
  toString(encoding: BufferEncoding = 'utf8', start = 0, end?: number): string {
    const slice = this.subarray(start, end);
    const normalizedEncoding = normalizeEncoding(encoding);

    switch (normalizedEncoding) {
      case 'hex':
        return this.toHex(slice);
      case 'base64':
        return this.toBase64(slice);
      case 'base64url':
        return this.toBase64Url(slice);
      case 'ascii':
      case 'latin1':
      case 'binary':
        return this.toLatin1(slice);
      case 'utf16le':
      case 'ucs2':
        return this.toUtf16le(slice);
      case 'utf8':
      default:
        return new TextDecoder().decode(slice);
    }
  }

  private toHex(buf: Uint8Array): string {
    return Array.from(buf)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  private toBase64(buf: Uint8Array): string {
    return btoa(String.fromCharCode(...buf));
  }

  private toBase64Url(buf: Uint8Array): string {
    return this.toBase64(buf).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  private toLatin1(buf: Uint8Array): string {
    return String.fromCharCode(...buf);
  }

  private toUtf16le(buf: Uint8Array): string {
    let result = '';

    for (let i = 0; i < buf.length - 1; i += 2) {
      result += String.fromCharCode(buf[i] | (buf[i + 1] << 8));
    }

    return result;
  }

  /**
   * Convert to JSON
   */
  toJSON(): { type: 'Buffer'; data: number[] } {
    return {
      type: 'Buffer',
      data: Array.from(this),
    };
  }

  /**
   * Check equality
   */
  equals(otherBuffer: Buffer): boolean {
    if (this.length !== otherBuffer.length) return false;

    for (let i = 0; i < this.length; i++) {
      if (this[i] !== otherBuffer[i]) return false;
    }

    return true;
  }

  /**
   * Compare
   */
  compare(
    target: Buffer,
    targetStart = 0,
    targetEnd = target.length,
    sourceStart = 0,
    sourceEnd = this.length,
  ): number {
    const source = this.subarray(sourceStart, sourceEnd);
    const dest = target.subarray(targetStart, targetEnd);
    return Buffer.compare(new Buffer(source), new Buffer(dest));
  }

  /**
   * Copy to target
   */
  copy(target: Buffer, targetStart = 0, sourceStart = 0, sourceEnd = this.length): number {
    const copyLength = Math.min(sourceEnd - sourceStart, target.length - targetStart);
    target.set(this.subarray(sourceStart, sourceStart + copyLength), targetStart);
    return copyLength;
  }

  /**
   * Slice (returns new Buffer)
   */
  slice(start?: number, end?: number): Buffer {
    return new Buffer(super.slice(start, end));
  }

  /**
   * Subarray (returns new Buffer)
   */
  subarray(start?: number, end?: number): Buffer {
    return new Buffer(super.subarray(start, end));
  }

  // Read methods
  readInt8(offset: number): number {
    const val = this[offset];
    return val > 127 ? val - 256 : val;
  }

  readInt16LE(offset: number): number {
    const val = this[offset] | (this[offset + 1] << 8);
    return val > 32767 ? val - 65536 : val;
  }

  readInt16BE(offset: number): number {
    const val = (this[offset] << 8) | this[offset + 1];
    return val > 32767 ? val - 65536 : val;
  }

  readInt32LE(offset: number): number {
    return this[offset] | (this[offset + 1] << 8) | (this[offset + 2] << 16) | (this[offset + 3] << 24);
  }

  readInt32BE(offset: number): number {
    return (this[offset] << 24) | (this[offset + 1] << 16) | (this[offset + 2] << 8) | this[offset + 3];
  }

  readUInt8(offset: number): number {
    return this[offset];
  }

  readUInt16LE(offset: number): number {
    return this[offset] | (this[offset + 1] << 8);
  }

  readUInt16BE(offset: number): number {
    return (this[offset] << 8) | this[offset + 1];
  }

  readUInt32LE(offset: number): number {
    return (this[offset] | (this[offset + 1] << 8) | (this[offset + 2] << 16) | (this[offset + 3] << 24)) >>> 0;
  }

  readUInt32BE(offset: number): number {
    return ((this[offset] << 24) | (this[offset + 1] << 16) | (this[offset + 2] << 8) | this[offset + 3]) >>> 0;
  }

  readFloatLE(offset: number): number {
    const view = new DataView(this.buffer, this.byteOffset + offset, 4);
    return view.getFloat32(0, true);
  }

  readFloatBE(offset: number): number {
    const view = new DataView(this.buffer, this.byteOffset + offset, 4);
    return view.getFloat32(0, false);
  }

  readDoubleLE(offset: number): number {
    const view = new DataView(this.buffer, this.byteOffset + offset, 8);
    return view.getFloat64(0, true);
  }

  readDoubleBE(offset: number): number {
    const view = new DataView(this.buffer, this.byteOffset + offset, 8);
    return view.getFloat64(0, false);
  }

  // Write methods
  writeInt8(value: number, offset: number): number {
    this[offset] = value < 0 ? value + 256 : value;
    return offset + 1;
  }

  writeInt16LE(value: number, offset: number): number {
    const v = value < 0 ? value + 65536 : value;
    this[offset] = v & 0xff;
    this[offset + 1] = (v >> 8) & 0xff;
    return offset + 2;
  }

  writeInt16BE(value: number, offset: number): number {
    const v = value < 0 ? value + 65536 : value;
    this[offset] = (v >> 8) & 0xff;
    this[offset + 1] = v & 0xff;
    return offset + 2;
  }

  writeInt32LE(value: number, offset: number): number {
    this[offset] = value & 0xff;
    this[offset + 1] = (value >> 8) & 0xff;
    this[offset + 2] = (value >> 16) & 0xff;
    this[offset + 3] = (value >> 24) & 0xff;
    return offset + 4;
  }

  writeInt32BE(value: number, offset: number): number {
    this[offset] = (value >> 24) & 0xff;
    this[offset + 1] = (value >> 16) & 0xff;
    this[offset + 2] = (value >> 8) & 0xff;
    this[offset + 3] = value & 0xff;
    return offset + 4;
  }

  writeUInt8(value: number, offset: number): number {
    this[offset] = value;
    return offset + 1;
  }

  writeUInt16LE(value: number, offset: number): number {
    this[offset] = value & 0xff;
    this[offset + 1] = (value >> 8) & 0xff;
    return offset + 2;
  }

  writeUInt16BE(value: number, offset: number): number {
    this[offset] = (value >> 8) & 0xff;
    this[offset + 1] = value & 0xff;
    return offset + 2;
  }

  writeUInt32LE(value: number, offset: number): number {
    this[offset] = value & 0xff;
    this[offset + 1] = (value >> 8) & 0xff;
    this[offset + 2] = (value >> 16) & 0xff;
    this[offset + 3] = (value >> 24) & 0xff;
    return offset + 4;
  }

  writeUInt32BE(value: number, offset: number): number {
    this[offset] = (value >> 24) & 0xff;
    this[offset + 1] = (value >> 16) & 0xff;
    this[offset + 2] = (value >> 8) & 0xff;
    this[offset + 3] = value & 0xff;
    return offset + 4;
  }

  writeFloatLE(value: number, offset: number): number {
    const view = new DataView(this.buffer, this.byteOffset + offset, 4);
    view.setFloat32(0, value, true);
    return offset + 4;
  }

  writeFloatBE(value: number, offset: number): number {
    const view = new DataView(this.buffer, this.byteOffset + offset, 4);
    view.setFloat32(0, value, false);
    return offset + 4;
  }

  writeDoubleLE(value: number, offset: number): number {
    const view = new DataView(this.buffer, this.byteOffset + offset, 8);
    view.setFloat64(0, value, true);
    return offset + 8;
  }

  writeDoubleBE(value: number, offset: number): number {
    const view = new DataView(this.buffer, this.byteOffset + offset, 8);
    view.setFloat64(0, value, false);
    return offset + 8;
  }

  /**
   * Fill buffer
   */
  fill(
    value: number | string | Buffer,
    offset = 0,
    end = this.length,
    encoding: BufferEncoding = 'utf8',
  ): this {
    let fillBuf: Uint8Array;

    if (typeof value === 'number') {
      fillBuf = new Uint8Array([value & 0xff]);
    } else if (typeof value === 'string') {
      fillBuf = Buffer.from(value, encoding);
    } else {
      fillBuf = value;
    }

    if (fillBuf.length === 0) return this;

    for (let i = offset; i < end; i++) {
      this[i] = fillBuf[(i - offset) % fillBuf.length];
    }

    return this;
  }

  /**
   * Index of value
   */
  indexOf(value: string | number | Buffer, byteOffset = 0, encoding: BufferEncoding = 'utf8'): number {
    const searchBuf = typeof value === 'number' ? new Uint8Array([value]) : Buffer.from(value as string, encoding);

    if (searchBuf.length === 0) return byteOffset;

    for (let i = byteOffset; i <= this.length - searchBuf.length; i++) {
      let found = true;

      for (let j = 0; j < searchBuf.length; j++) {
        if (this[i + j] !== searchBuf[j]) {
          found = false;
          break;
        }
      }

      if (found) return i;
    }

    return -1;
  }

  /**
   * Last index of value
   */
  lastIndexOf(value: string | number | Buffer, byteOffset?: number, encoding: BufferEncoding = 'utf8'): number {
    const searchBuf = typeof value === 'number' ? new Uint8Array([value]) : Buffer.from(value as string, encoding);

    if (searchBuf.length === 0) return byteOffset ?? this.length;

    const start = byteOffset !== undefined ? Math.min(byteOffset, this.length - searchBuf.length) : this.length - searchBuf.length;

    for (let i = start; i >= 0; i--) {
      let found = true;

      for (let j = 0; j < searchBuf.length; j++) {
        if (this[i + j] !== searchBuf[j]) {
          found = false;
          break;
        }
      }

      if (found) return i;
    }

    return -1;
  }

  /**
   * Check if buffer includes value
   */
  includes(value: string | number | Buffer, byteOffset = 0, encoding: BufferEncoding = 'utf8'): boolean {
    return this.indexOf(value, byteOffset, encoding) !== -1;
  }
}

/**
 * Normalize encoding name
 */
function normalizeEncoding(encoding: string): BufferEncoding {
  const lower = encoding.toLowerCase();

  switch (lower) {
    case 'utf8':
    case 'utf-8':
      return 'utf8';
    case 'ucs2':
    case 'ucs-2':
    case 'utf16le':
    case 'utf-16le':
      return 'utf16le';
    case 'latin1':
    case 'binary':
      return 'latin1';
    case 'base64url':
      return 'base64url';
    default:
      return lower as BufferEncoding;
  }
}
