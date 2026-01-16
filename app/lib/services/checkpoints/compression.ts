/**
 * Compression utilities for checkpoint snapshots.
 * Uses browser-native CompressionStream API when available,
 * with fallback to uncompressed storage.
 */

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('CheckpointCompression');

/**
 * Check if browser supports CompressionStream API.
 */
export function isCompressionSupported(): boolean {
  return typeof CompressionStream !== 'undefined' && typeof DecompressionStream !== 'undefined';
}

/**
 * Compress a string using gzip compression.
 * Returns base64-encoded compressed data.
 */
export async function compressString(data: string): Promise<string> {
  if (!isCompressionSupported()) {
    logger.debug('CompressionStream not supported, returning uncompressed');
    return data;
  }

  try {
    const encoder = new TextEncoder();
    const inputBytes = encoder.encode(data);

    const compressionStream = new CompressionStream('gzip');
    const writer = compressionStream.writable.getWriter();
    const reader = compressionStream.readable.getReader();

    // Start writing
    const writePromise = writer.write(inputBytes).then(() => writer.close());

    // Collect compressed chunks
    const chunks: Uint8Array[] = [];
    let totalLength = 0;

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      chunks.push(value);
      totalLength += value.length;
    }

    await writePromise;

    // Combine chunks
    const compressedBytes = new Uint8Array(totalLength);
    let offset = 0;

    for (const chunk of chunks) {
      compressedBytes.set(chunk, offset);
      offset += chunk.length;
    }

    // Convert to base64
    const base64 = btoa(String.fromCharCode(...compressedBytes));

    const ratio = ((1 - compressedBytes.length / inputBytes.length) * 100).toFixed(1);
    logger.debug(`Compressed ${inputBytes.length} -> ${compressedBytes.length} bytes (${ratio}% reduction)`);

    return base64;
  } catch (error) {
    logger.error('Compression failed, returning original:', error);
    return data;
  }
}

/**
 * Decompress a gzip-compressed base64 string.
 */
export async function decompressString(compressedData: string): Promise<string> {
  if (!isCompressionSupported()) {
    logger.debug('DecompressionStream not supported, assuming uncompressed');
    return compressedData;
  }

  /*
   * Check if this looks like base64-encoded gzip data
   * Gzip data starts with 0x1f 0x8b when decoded
   */
  try {
    const binaryString = atob(compressedData);

    // Check gzip magic bytes
    if (binaryString.charCodeAt(0) !== 0x1f || binaryString.charCodeAt(1) !== 0x8b) {
      // Not gzip compressed, return as-is
      return compressedData;
    }

    const compressedBytes = new Uint8Array(binaryString.length);

    for (let i = 0; i < binaryString.length; i++) {
      compressedBytes[i] = binaryString.charCodeAt(i);
    }

    const decompressionStream = new DecompressionStream('gzip');
    const writer = decompressionStream.writable.getWriter();
    const reader = decompressionStream.readable.getReader();

    // Start writing
    const writePromise = writer.write(compressedBytes).then(() => writer.close());

    // Collect decompressed chunks
    const chunks: Uint8Array[] = [];

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      chunks.push(value);
    }

    await writePromise;

    // Combine and decode
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const decompressedBytes = new Uint8Array(totalLength);
    let offset = 0;

    for (const chunk of chunks) {
      decompressedBytes.set(chunk, offset);
      offset += chunk.length;
    }

    const decoder = new TextDecoder();

    return decoder.decode(decompressedBytes);
  } catch (error) {
    // If decoding fails, assume it's not compressed
    logger.debug('Decompression failed, assuming uncompressed:', error);
    return compressedData;
  }
}

/**
 * Compress a JSON object.
 */
export async function compressJson<T>(data: T): Promise<string> {
  const jsonString = JSON.stringify(data);
  return compressString(jsonString);
}

/**
 * Decompress and parse a JSON object.
 */
export async function decompressJson<T>(compressedData: string): Promise<T> {
  const jsonString = await decompressString(compressedData);
  return JSON.parse(jsonString);
}

/**
 * Calculate the size of a string in bytes.
 */
export function calculateStringSize(data: string): number {
  return new TextEncoder().encode(data).length;
}

/**
 * Check if data should be compressed based on size threshold.
 */
export function shouldCompress(data: string, thresholdBytes: number): boolean {
  if (!isCompressionSupported()) {
    return false;
  }

  return calculateStringSize(data) >= thresholdBytes;
}

/**
 * Compress data if it exceeds the threshold.
 */
export async function maybeCompress(
  data: string,
  thresholdBytes: number,
): Promise<{ data: string; compressed: boolean }> {
  if (shouldCompress(data, thresholdBytes)) {
    const compressed = await compressString(data);
    return { data: compressed, compressed: true };
  }

  return { data, compressed: false };
}

/**
 * Decompress data if it was compressed.
 */
export async function maybeDecompress(data: string, wasCompressed: boolean): Promise<string> {
  if (wasCompressed) {
    return decompressString(data);
  }

  return data;
}
