/**
 * =============================================================================
 * BAVINI Container - Crypto Module
 * =============================================================================
 * Node.js crypto module implementation using Web Crypto API.
 * =============================================================================
 */

import { Buffer } from '../globals/buffer';
import { Transform } from './stream';
import type { BufferEncoding } from '../types';

/**
 * Supported hash algorithms
 */
export type HashAlgorithm = 'md5' | 'sha1' | 'sha256' | 'sha384' | 'sha512' | 'sha-1' | 'sha-256' | 'sha-384' | 'sha-512';

/**
 * Supported cipher algorithms
 */
export type CipherAlgorithm = 'aes-128-cbc' | 'aes-192-cbc' | 'aes-256-cbc' | 'aes-128-gcm' | 'aes-256-gcm' | 'aes-128-ctr' | 'aes-256-ctr';

/**
 * Encoding types
 */
export type BinaryToTextEncoding = 'base64' | 'base64url' | 'hex' | 'binary';
export type CharacterEncoding = 'utf8' | 'utf-8' | 'utf16le' | 'latin1';
export type Encoding = BinaryToTextEncoding | CharacterEncoding;

/**
 * Normalize encoding to valid BufferEncoding
 */
function normalizeEncoding(encoding: Encoding | undefined): BufferEncoding | undefined {
  if (!encoding) return undefined;
  // utf-8 -> utf8, utf-16le -> utf16le
  const normalized = encoding.replace('-', '') as BufferEncoding;
  return normalized;
}

/**
 * Map Node.js algorithm names to Web Crypto names
 */
const HASH_ALGORITHM_MAP: Record<string, string> = {
  md5: 'MD5', // Not supported in Web Crypto, will use custom
  sha1: 'SHA-1',
  'sha-1': 'SHA-1',
  sha256: 'SHA-256',
  'sha-256': 'SHA-256',
  sha384: 'SHA-384',
  'sha-384': 'SHA-384',
  sha512: 'SHA-512',
  'sha-512': 'SHA-512',
};

/**
 * Get Web Crypto API
 */
function getWebCrypto(): Crypto {
  if (typeof globalThis.crypto !== 'undefined') {
    return globalThis.crypto;
  }

  throw new Error('Web Crypto API not available');
}

/**
 * Hash class - compatible with Node.js crypto.Hash
 */
export class Hash extends Transform {
  private _algorithm: string;
  private _data: Buffer[] = [];

  constructor(algorithm: string) {
    super();
    this._algorithm = algorithm.toLowerCase();

    if (!HASH_ALGORITHM_MAP[this._algorithm]) {
      throw new Error(`Unsupported hash algorithm: ${algorithm}`);
    }
  }

  /**
   * Update the hash with data
   */
  update(data: string | Buffer, encoding?: Encoding): this {
    const buf = typeof data === 'string' ? Buffer.from(data, normalizeEncoding(encoding) || 'utf8') : data;

    this._data.push(buf);
    return this;
  }

  /**
   * Get the digest
   */
  digest(encoding?: BinaryToTextEncoding): Buffer | string {
    const combined = Buffer.concat(this._data);

    // Use synchronous fallback for MD5 (not in Web Crypto)
    if (this._algorithm === 'md5') {
      const result = md5(combined);
      return encoding ? result.toString(normalizeEncoding(encoding)) : result;
    }

    // For Web Crypto, we need to handle this synchronously
    // This is a limitation - in real usage, use async methods
    throw new Error('Synchronous digest not supported. Use crypto.subtle.digest() for async hashing.');
  }

  /**
   * Async digest using Web Crypto
   */
  async digestAsync(encoding?: BinaryToTextEncoding): Promise<Buffer | string> {
    const combined = Buffer.concat(this._data);
    const webAlgorithm = HASH_ALGORITHM_MAP[this._algorithm];

    if (this._algorithm === 'md5') {
      const result = md5(combined);
      return encoding ? result.toString(normalizeEncoding(encoding)) : result;
    }

    const crypto = getWebCrypto();
    const hashBuffer = await crypto.subtle.digest(webAlgorithm, combined);
    const result = Buffer.from(hashBuffer);

    return encoding ? result.toString(normalizeEncoding(encoding)) : result;
  }

  /**
   * Copy the hash state
   */
  copy(): Hash {
    const copy = new Hash(this._algorithm);
    copy._data = [...this._data];
    return copy;
  }

  _transform(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.update(chunk);
    callback();
  }

  _flush(callback: (error?: Error | null, data?: unknown) => void): void {
    try {
      // In streaming mode, we can't easily get a sync digest
      // Push the combined data for external processing
      callback(null, Buffer.concat(this._data));
    } catch (err) {
      callback(err as Error);
    }
  }
}

/**
 * Hmac class - compatible with Node.js crypto.Hmac
 */
export class Hmac extends Transform {
  private _algorithm: string;
  private _key: Buffer;
  private _data: Buffer[] = [];

  constructor(algorithm: string, key: string | Buffer) {
    super();
    this._algorithm = algorithm.toLowerCase();
    this._key = typeof key === 'string' ? Buffer.from(key) : key;

    if (!HASH_ALGORITHM_MAP[this._algorithm]) {
      throw new Error(`Unsupported hash algorithm: ${algorithm}`);
    }
  }

  /**
   * Update the HMAC with data
   */
  update(data: string | Buffer, encoding?: Encoding): this {
    const buf = typeof data === 'string' ? Buffer.from(data, normalizeEncoding(encoding) || 'utf8') : data;

    this._data.push(buf);
    return this;
  }

  /**
   * Get the digest
   */
  digest(encoding?: BinaryToTextEncoding): Buffer | string {
    throw new Error('Synchronous digest not supported. Use hmac.digestAsync() for async HMAC.');
  }

  /**
   * Async digest using Web Crypto
   */
  async digestAsync(encoding?: BinaryToTextEncoding): Promise<Buffer | string> {
    const combined = Buffer.concat(this._data);
    const webAlgorithm = HASH_ALGORITHM_MAP[this._algorithm];

    const crypto = getWebCrypto();

    // Import key
    const cryptoKey = await crypto.subtle.importKey('raw', this._key, { name: 'HMAC', hash: webAlgorithm }, false, ['sign']);

    // Sign
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, combined);
    const result = Buffer.from(signature);

    return encoding ? result.toString(normalizeEncoding(encoding)) : result;
  }

  _transform(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.update(chunk);
    callback();
  }
}

/**
 * Cipher class - for encryption
 */
export class Cipher extends Transform {
  private _algorithm: string;
  private _key: Buffer;
  private _iv: Buffer | null;
  private _data: Buffer[] = [];
  private _autoPadding: boolean = true;

  constructor(algorithm: string, key: Buffer, iv?: Buffer | null) {
    super();
    this._algorithm = algorithm.toLowerCase();
    this._key = key;
    this._iv = iv ?? null;
  }

  /**
   * Update with data
   */
  update(data: string | Buffer, inputEncoding?: Encoding, outputEncoding?: Encoding): Buffer | string {
    const buf = typeof data === 'string' ? Buffer.from(data, normalizeEncoding(inputEncoding) || 'utf8') : data;

    this._data.push(buf);

    // Return empty buffer until final
    return outputEncoding ? '' : Buffer.alloc(0);
  }

  /**
   * Finalize encryption
   */
  final(outputEncoding?: BinaryToTextEncoding): Buffer | string {
    throw new Error('Synchronous final not supported. Use cipher.finalAsync() for async encryption.');
  }

  /**
   * Async final using Web Crypto
   */
  async finalAsync(outputEncoding?: BinaryToTextEncoding): Promise<Buffer | string> {
    const combined = Buffer.concat(this._data);
    const crypto = getWebCrypto();

    // Parse algorithm
    const [algo, , mode] = this._algorithm.split('-');

    if (algo !== 'aes') {
      throw new Error(`Unsupported algorithm: ${this._algorithm}`);
    }

    // Define algorithm parameters
    type CryptoAlgorithmParams = { name: string; iv?: Uint8Array; counter?: Uint8Array; length?: number };
    let webAlgorithm: CryptoAlgorithmParams;

    switch (mode) {
      case 'cbc':
        webAlgorithm = { name: 'AES-CBC', iv: this._iv! };
        break;
      case 'gcm':
        webAlgorithm = { name: 'AES-GCM', iv: this._iv! };
        break;
      case 'ctr':
        webAlgorithm = { name: 'AES-CTR', counter: this._iv!, length: 64 };
        break;
      default:
        throw new Error(`Unsupported mode: ${mode}`);
    }

    // Import key
    const cryptoKey = await crypto.subtle.importKey('raw', this._key, webAlgorithm.name, false, ['encrypt']);

    // Encrypt
    const encrypted = await crypto.subtle.encrypt(webAlgorithm, cryptoKey, combined);
    const result = Buffer.from(encrypted);

    return outputEncoding ? result.toString(normalizeEncoding(outputEncoding)) : result;
  }

  /**
   * Set auto padding
   */
  setAutoPadding(autoPadding?: boolean): this {
    this._autoPadding = autoPadding !== false;
    return this;
  }

  /**
   * Get auth tag (for GCM mode)
   */
  getAuthTag(): Buffer {
    // This would need to be extracted from GCM encryption
    throw new Error('getAuthTag requires async encryption to complete first');
  }

  _transform(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.update(chunk);
    callback();
  }
}

/**
 * Decipher class - for decryption
 */
export class Decipher extends Transform {
  private _algorithm: string;
  private _key: Buffer;
  private _iv: Buffer | null;
  private _data: Buffer[] = [];
  private _autoPadding: boolean = true;
  private _authTag: Buffer | null = null;

  constructor(algorithm: string, key: Buffer, iv?: Buffer | null) {
    super();
    this._algorithm = algorithm.toLowerCase();
    this._key = key;
    this._iv = iv ?? null;
  }

  /**
   * Update with data
   */
  update(data: string | Buffer, inputEncoding?: Encoding, outputEncoding?: Encoding): Buffer | string {
    const buf = typeof data === 'string' ? Buffer.from(data, normalizeEncoding(inputEncoding) || 'utf8') : data;

    this._data.push(buf);

    return outputEncoding ? '' : Buffer.alloc(0);
  }

  /**
   * Finalize decryption
   */
  final(outputEncoding?: BinaryToTextEncoding): Buffer | string {
    throw new Error('Synchronous final not supported. Use decipher.finalAsync() for async decryption.');
  }

  /**
   * Async final using Web Crypto
   */
  async finalAsync(outputEncoding?: BinaryToTextEncoding): Promise<Buffer | string> {
    const combined = Buffer.concat(this._data);
    const crypto = getWebCrypto();

    // Parse algorithm
    const [algo, , mode] = this._algorithm.split('-');

    if (algo !== 'aes') {
      throw new Error(`Unsupported algorithm: ${this._algorithm}`);
    }

    // Define algorithm parameters
    type CryptoAlgorithmParams = { name: string; iv?: Uint8Array; counter?: Uint8Array; length?: number };
    let webAlgorithm: CryptoAlgorithmParams;

    switch (mode) {
      case 'cbc':
        webAlgorithm = { name: 'AES-CBC', iv: this._iv! };
        break;
      case 'gcm':
        webAlgorithm = { name: 'AES-GCM', iv: this._iv! };

        if (this._authTag) {
          // Append auth tag to ciphertext for Web Crypto
          // Web Crypto expects tag at end of ciphertext
        }

        break;
      case 'ctr':
        webAlgorithm = { name: 'AES-CTR', counter: this._iv!, length: 64 };
        break;
      default:
        throw new Error(`Unsupported mode: ${mode}`);
    }

    // Import key
    const cryptoKey = await crypto.subtle.importKey('raw', this._key, webAlgorithm.name, false, ['decrypt']);

    // Decrypt
    const decrypted = await crypto.subtle.decrypt(webAlgorithm, cryptoKey, combined);
    const result = Buffer.from(decrypted);

    return outputEncoding ? result.toString(normalizeEncoding(outputEncoding)) : result;
  }

  /**
   * Set auto padding
   */
  setAutoPadding(autoPadding?: boolean): this {
    this._autoPadding = autoPadding !== false;
    return this;
  }

  /**
   * Set auth tag (for GCM mode)
   */
  setAuthTag(tag: Buffer): this {
    this._authTag = tag;
    return this;
  }

  _transform(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    this.update(chunk);
    callback();
  }
}

/**
 * Simple MD5 implementation (Web Crypto doesn't support MD5)
 */
function md5(data: Buffer): Buffer {
  // Simple MD5 implementation for compatibility
  // In production, consider using a proper library
  const K = [
    0xd76aa478, 0xe8c7b756, 0x242070db, 0xc1bdceee, 0xf57c0faf, 0x4787c62a, 0xa8304613, 0xfd469501,
    0x698098d8, 0x8b44f7af, 0xffff5bb1, 0x895cd7be, 0x6b901122, 0xfd987193, 0xa679438e, 0x49b40821,
    0xf61e2562, 0xc040b340, 0x265e5a51, 0xe9b6c7aa, 0xd62f105d, 0x02441453, 0xd8a1e681, 0xe7d3fbc8,
    0x21e1cde6, 0xc33707d6, 0xf4d50d87, 0x455a14ed, 0xa9e3e905, 0xfcefa3f8, 0x676f02d9, 0x8d2a4c8a,
    0xfffa3942, 0x8771f681, 0x6d9d6122, 0xfde5380c, 0xa4beea44, 0x4bdecfa9, 0xf6bb4b60, 0xbebfbc70,
    0x289b7ec6, 0xeaa127fa, 0xd4ef3085, 0x04881d05, 0xd9d4d039, 0xe6db99e5, 0x1fa27cf8, 0xc4ac5665,
    0xf4292244, 0x432aff97, 0xab9423a7, 0xfc93a039, 0x655b59c3, 0x8f0ccc92, 0xffeff47d, 0x85845dd1,
    0x6fa87e4f, 0xfe2ce6e0, 0xa3014314, 0x4e0811a1, 0xf7537e82, 0xbd3af235, 0x2ad7d2bb, 0xeb86d391,
  ];

  const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];

  function leftRotate(x: number, c: number): number {
    return ((x << c) | (x >>> (32 - c))) >>> 0;
  }

  // Pre-processing
  const originalLength = data.length;
  const bitLength = BigInt(originalLength * 8);

  // Pad message
  const paddedLength = Math.ceil((originalLength + 9) / 64) * 64;
  const padded = Buffer.alloc(paddedLength);
  data.copy(padded);
  padded[originalLength] = 0x80;

  // Append length
  const view = new DataView(padded.buffer, padded.byteOffset, padded.length);
  view.setUint32(paddedLength - 8, Number(bitLength & 0xffffffffn), true);
  view.setUint32(paddedLength - 4, Number(bitLength >> 32n), true);

  // Initialize
  let a0 = 0x67452301 >>> 0;
  let b0 = 0xefcdab89 >>> 0;
  let c0 = 0x98badcfe >>> 0;
  let d0 = 0x10325476 >>> 0;

  // Process each 512-bit block
  for (let i = 0; i < paddedLength; i += 64) {
    const M = new Uint32Array(16);

    for (let j = 0; j < 16; j++) {
      M[j] = view.getUint32(i + j * 4, true);
    }

    let A = a0;
    let B = b0;
    let C = c0;
    let D = d0;

    for (let j = 0; j < 64; j++) {
      let F: number;
      let g: number;

      if (j < 16) {
        F = (B & C) | (~B & D);
        g = j;
      } else if (j < 32) {
        F = (D & B) | (~D & C);
        g = (5 * j + 1) % 16;
      } else if (j < 48) {
        F = B ^ C ^ D;
        g = (3 * j + 5) % 16;
      } else {
        F = C ^ (B | ~D);
        g = (7 * j) % 16;
      }

      F = (F + A + K[j] + M[g]) >>> 0;
      A = D;
      D = C;
      C = B;
      B = (B + leftRotate(F, S[(Math.floor(j / 16) * 4) + (j % 4)])) >>> 0;
    }

    a0 = (a0 + A) >>> 0;
    b0 = (b0 + B) >>> 0;
    c0 = (c0 + C) >>> 0;
    d0 = (d0 + D) >>> 0;
  }

  const result = Buffer.alloc(16);
  const resultView = new DataView(result.buffer);
  resultView.setUint32(0, a0, true);
  resultView.setUint32(4, b0, true);
  resultView.setUint32(8, c0, true);
  resultView.setUint32(12, d0, true);

  return result;
}

/**
 * Create a hash object
 */
export function createHash(algorithm: string): Hash {
  return new Hash(algorithm);
}

/**
 * Create an HMAC object
 */
export function createHmac(algorithm: string, key: string | Buffer): Hmac {
  return new Hmac(algorithm, key);
}

/**
 * Create a cipher
 */
export function createCipher(algorithm: string, password: string | Buffer): Cipher {
  // Derive key from password (simplified - real implementation would use PBKDF2)
  const hash = createHash('sha256');
  hash.update(typeof password === 'string' ? Buffer.from(password) : password);
  const key = md5(Buffer.concat([typeof password === 'string' ? Buffer.from(password) : password]));

  return new Cipher(algorithm, key);
}

/**
 * Create a cipher with IV
 */
export function createCipheriv(algorithm: string, key: Buffer | string, iv: Buffer | string | null): Cipher {
  const keyBuf = typeof key === 'string' ? Buffer.from(key) : key;
  const ivBuf = typeof iv === 'string' ? Buffer.from(iv) : iv;

  return new Cipher(algorithm, keyBuf, ivBuf);
}

/**
 * Create a decipher
 */
export function createDecipher(algorithm: string, password: string | Buffer): Decipher {
  const key = md5(Buffer.concat([typeof password === 'string' ? Buffer.from(password) : password]));
  return new Decipher(algorithm, key);
}

/**
 * Create a decipher with IV
 */
export function createDecipheriv(algorithm: string, key: Buffer | string, iv: Buffer | string | null): Decipher {
  const keyBuf = typeof key === 'string' ? Buffer.from(key) : key;
  const ivBuf = typeof iv === 'string' ? Buffer.from(iv) : iv;

  return new Decipher(algorithm, keyBuf, ivBuf);
}

/**
 * Generate random bytes synchronously
 */
export function randomBytes(size: number): Buffer {
  const buffer = Buffer.alloc(size);
  const crypto = getWebCrypto();
  crypto.getRandomValues(buffer);
  return buffer;
}

/**
 * Generate random bytes asynchronously
 */
export function randomBytesAsync(size: number): Promise<Buffer> {
  return Promise.resolve(randomBytes(size));
}

/**
 * Generate a random UUID
 */
export function randomUUID(): string {
  const crypto = getWebCrypto();
  return crypto.randomUUID();
}

/**
 * Generate random integer in range
 */
export function randomInt(min: number, max?: number): number {
  if (max === undefined) {
    max = min;
    min = 0;
  }

  const range = max - min;
  const bytes = randomBytes(4);
  const value = bytes.readUInt32BE(0);

  return min + (value % range);
}

/**
 * Fill buffer with random values
 */
export function randomFill(buffer: Buffer, offset?: number, size?: number, callback?: (error: Error | null, buffer: Buffer) => void): void {
  if (typeof offset === 'function') {
    callback = offset;
    offset = 0;
    size = buffer.length;
  } else if (typeof size === 'function') {
    callback = size;
    size = buffer.length - (offset ?? 0);
  }

  const start = offset ?? 0;
  const len = size ?? buffer.length - start;

  const crypto = getWebCrypto();
  const view = new Uint8Array(buffer.buffer, buffer.byteOffset + start, len);
  crypto.getRandomValues(view);

  if (callback) {
    callback(null, buffer);
  }
}

/**
 * Fill buffer with random values synchronously
 */
export function randomFillSync(buffer: Buffer, offset?: number, size?: number): Buffer {
  const start = offset ?? 0;
  const len = size ?? buffer.length - start;

  const crypto = getWebCrypto();
  const view = new Uint8Array(buffer.buffer, buffer.byteOffset + start, len);
  crypto.getRandomValues(view);

  return buffer;
}

/**
 * Get supported hash algorithms
 */
export function getHashes(): string[] {
  return ['md5', 'sha1', 'sha256', 'sha384', 'sha512'];
}

/**
 * Get supported cipher algorithms
 */
export function getCiphers(): string[] {
  return ['aes-128-cbc', 'aes-192-cbc', 'aes-256-cbc', 'aes-128-gcm', 'aes-256-gcm', 'aes-128-ctr', 'aes-256-ctr'];
}

/**
 * Time-safe comparison
 */
export function timingSafeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) {
    throw new Error('Input buffers must have the same length');
  }

  let result = 0;

  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }

  return result === 0;
}

/**
 * PBKDF2 async
 */
export async function pbkdf2(password: string | Buffer, salt: string | Buffer, iterations: number, keylen: number, digest: string): Promise<Buffer> {
  const crypto = getWebCrypto();
  const passwordBuf = typeof password === 'string' ? Buffer.from(password) : password;
  const saltBuf = typeof salt === 'string' ? Buffer.from(salt) : salt;
  const hashName = HASH_ALGORITHM_MAP[digest.toLowerCase()];

  if (!hashName) {
    throw new Error(`Unsupported digest: ${digest}`);
  }

  // Import password as key
  const baseKey = await crypto.subtle.importKey('raw', passwordBuf, 'PBKDF2', false, ['deriveBits']);

  // Derive bits
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBuf,
      iterations,
      hash: hashName,
    },
    baseKey,
    keylen * 8,
  );

  return Buffer.from(derivedBits);
}

/**
 * PBKDF2 sync (throws - use async version)
 */
export function pbkdf2Sync(_password: string | Buffer, _salt: string | Buffer, _iterations: number, _keylen: number, _digest: string): Buffer {
  throw new Error('Synchronous pbkdf2 not supported. Use the async version.');
}

/**
 * Scrypt async
 */
export async function scrypt(_password: string | Buffer, _salt: string | Buffer, _keylen: number): Promise<Buffer> {
  // Scrypt is not available in Web Crypto
  throw new Error('Scrypt is not supported in browser environment');
}

/**
 * Scrypt sync
 */
export function scryptSync(_password: string | Buffer, _salt: string | Buffer, _keylen: number): Buffer {
  throw new Error('Scrypt is not supported in browser environment');
}

/**
 * Create ECDH key pair
 */
export function createECDH(curve: string): ECDH {
  return new ECDH(curve);
}

/**
 * ECDH class
 */
export class ECDH {
  private _curve: string;
  private _privateKey?: CryptoKey;
  private _publicKey?: CryptoKey;

  constructor(curve: string) {
    this._curve = curve;
  }

  async generateKeys(encoding?: BinaryToTextEncoding): Promise<Buffer | string> {
    const crypto = getWebCrypto();

    // Map curve names
    const namedCurve = this._curve === 'prime256v1' ? 'P-256' : this._curve === 'secp384r1' ? 'P-384' : this._curve === 'secp521r1' ? 'P-521' : this._curve;

    const keyPair = await crypto.subtle.generateKey(
      {
        name: 'ECDH',
        namedCurve,
      },
      true,
      ['deriveBits'],
    );

    this._privateKey = keyPair.privateKey;
    this._publicKey = keyPair.publicKey;

    // Export public key
    const exported = await crypto.subtle.exportKey('raw', keyPair.publicKey);
    const buf = Buffer.from(exported);

    return encoding ? buf.toString(normalizeEncoding(encoding)) : buf;
  }

  async computeSecret(otherPublicKey: Buffer, _inputEncoding?: Encoding, outputEncoding?: BinaryToTextEncoding): Promise<Buffer | string> {
    if (!this._privateKey) {
      throw new Error('Keys not generated');
    }

    const crypto = getWebCrypto();
    const namedCurve = this._curve === 'prime256v1' ? 'P-256' : this._curve === 'secp384r1' ? 'P-384' : this._curve === 'secp521r1' ? 'P-521' : this._curve;

    // Import other public key
    const publicKey = await crypto.subtle.importKey(
      'raw',
      otherPublicKey,
      {
        name: 'ECDH',
        namedCurve,
      },
      false,
      [],
    );

    // Derive shared secret
    const keyLength = namedCurve === 'P-256' ? 256 : namedCurve === 'P-384' ? 384 : 528;
    const sharedSecret = await crypto.subtle.deriveBits(
      {
        name: 'ECDH',
        public: publicKey,
      },
      this._privateKey,
      keyLength,
    );

    const buf = Buffer.from(sharedSecret);
    return outputEncoding ? buf.toString(normalizeEncoding(outputEncoding)) : buf;
  }

  getPrivateKey(encoding?: BinaryToTextEncoding): Buffer | string {
    throw new Error('Synchronous getPrivateKey not supported');
  }

  getPublicKey(encoding?: BinaryToTextEncoding): Buffer | string {
    throw new Error('Synchronous getPublicKey not supported');
  }

  setPrivateKey(privateKey: Buffer): void {
    throw new Error('setPrivateKey not supported - use generateKeys()');
  }
}

/**
 * Web Crypto subtle
 */
export const subtle = typeof globalThis.crypto !== 'undefined' ? globalThis.crypto.subtle : null;

/**
 * Constants
 */
export const constants = {
  OPENSSL_VERSION_NUMBER: 0,
  SSL_OP_ALL: 0,
  SSL_OP_NO_TICKET: 0,
  RSA_PKCS1_PADDING: 1,
  RSA_SSLV23_PADDING: 2,
  RSA_NO_PADDING: 3,
  RSA_PKCS1_OAEP_PADDING: 4,
  RSA_X931_PADDING: 5,
  RSA_PKCS1_PSS_PADDING: 6,
};

/**
 * Default export
 */
export default {
  Hash,
  Hmac,
  Cipher,
  Decipher,
  ECDH,
  createHash,
  createHmac,
  createCipher,
  createCipheriv,
  createDecipher,
  createDecipheriv,
  createECDH,
  randomBytes,
  randomUUID,
  randomInt,
  randomFill,
  randomFillSync,
  getHashes,
  getCiphers,
  timingSafeEqual,
  pbkdf2,
  pbkdf2Sync,
  scrypt,
  scryptSync,
  subtle,
  constants,
};
