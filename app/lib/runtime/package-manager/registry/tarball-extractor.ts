/**
 * =============================================================================
 * BAVINI Container - Tarball Extractor
 * =============================================================================
 * Extracts npm package tarballs (.tgz files).
 * Uses DecompressionStream for gzip and a custom tar parser.
 * =============================================================================
 */

import type { PackageJson } from '../types';
import { PMError } from '../types';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('TarballExtractor');

/**
 * Extracted file from tarball
 */
export interface ExtractedFile {
  path: string;
  data: Uint8Array;
  mode: number;
  isDirectory: boolean;
}

/**
 * Extraction result
 */
export interface ExtractionResult {
  files: Map<string, Uint8Array>;
  packageJson: PackageJson;
  totalSize: number;
  fileCount: number;
}

/**
 * TAR header structure
 */
interface TarHeader {
  name: string;
  mode: number;
  size: number;
  type: string;
  linkname: string;
  prefix: string;
}

/**
 * TAR file type indicators
 */
const TAR_TYPE = {
  FILE: '0',
  LINK: '1',
  SYMLINK: '2',
  CHARDEV: '3',
  BLOCKDEV: '4',
  DIRECTORY: '5',
  FIFO: '6',
  CONTIGUOUS: '7',
  EXTENDED_HEADER: 'x',
  GLOBAL_EXTENDED_HEADER: 'g',
  PAX_HEADER: 'x',
  GNU_LONGNAME: 'L',
  GNU_LONGLINK: 'K',
} as const;

/**
 * TAR block size
 */
const TAR_BLOCK_SIZE = 512;

/**
 * Extract a .tgz tarball
 */
export async function extractTarball(data: ArrayBuffer): Promise<ExtractionResult> {
  logger.debug(`Extracting tarball of ${data.byteLength} bytes`);

  // Decompress gzip
  const decompressed = await decompressGzip(data);

  // Parse tar
  const files = parseTar(decompressed);

  // Find package.json
  let packageJson: PackageJson | null = null;
  const extractedFiles = new Map<string, Uint8Array>();
  let totalSize = 0;

  for (const file of files) {
    if (file.isDirectory) {
      continue;
    }

    // npm tarballs have a "package/" prefix
    let path = file.path;
    if (path.startsWith('package/')) {
      path = path.slice(8);
    }

    if (path === 'package.json') {
      const text = new TextDecoder().decode(file.data);
      try {
        packageJson = JSON.parse(text) as PackageJson;
      } catch {
        throw new PMError('INVALID_PACKAGE_JSON', 'Invalid package.json in tarball');
      }
    }

    extractedFiles.set(path, file.data);
    totalSize += file.data.length;
  }

  if (!packageJson) {
    throw new PMError('INVALID_PACKAGE_JSON', 'No package.json found in tarball');
  }

  logger.debug(`Extracted ${extractedFiles.size} files, total size ${totalSize} bytes`);

  return {
    files: extractedFiles,
    packageJson,
    totalSize,
    fileCount: extractedFiles.size,
  };
}

/**
 * Decompress gzip data using DecompressionStream
 */
async function decompressGzip(data: ArrayBuffer): Promise<Uint8Array> {
  // Check if DecompressionStream is available
  if (typeof DecompressionStream === 'undefined') {
    // Fallback: use pako or similar library
    throw new PMError('TARBALL_ERROR', 'DecompressionStream not available in this browser');
  }

  const stream = new DecompressionStream('gzip');
  const writer = stream.writable.getWriter();
  const reader = stream.readable.getReader();

  // Write input
  writer.write(new Uint8Array(data));
  writer.close();

  // Read output
  const chunks: Uint8Array[] = [];
  let totalLength = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    totalLength += value.length;
  }

  // Combine chunks
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

/**
 * Parse tar archive
 */
function parseTar(data: Uint8Array): ExtractedFile[] {
  const files: ExtractedFile[] = [];
  let offset = 0;
  let longName = '';

  while (offset < data.length - TAR_BLOCK_SIZE) {
    // Read header
    const headerBytes = data.slice(offset, offset + TAR_BLOCK_SIZE);

    // Check for end of archive (two zero blocks)
    if (isZeroBlock(headerBytes)) {
      break;
    }

    const header = parseHeader(headerBytes);
    offset += TAR_BLOCK_SIZE;

    // Handle GNU long name
    if (header.type === TAR_TYPE.GNU_LONGNAME) {
      const nameData = data.slice(offset, offset + header.size);
      longName = new TextDecoder().decode(nameData).replace(/\0+$/, '');
      offset += Math.ceil(header.size / TAR_BLOCK_SIZE) * TAR_BLOCK_SIZE;
      continue;
    }

    // Handle extended headers (PAX)
    if (header.type === TAR_TYPE.PAX_HEADER || header.type === TAR_TYPE.GLOBAL_EXTENDED_HEADER) {
      // Skip extended header data for now
      offset += Math.ceil(header.size / TAR_BLOCK_SIZE) * TAR_BLOCK_SIZE;
      continue;
    }

    // Get full name
    let fullPath = longName || (header.prefix ? `${header.prefix}/${header.name}` : header.name);
    longName = '';

    // Clean path
    fullPath = fullPath.replace(/\0/g, '');

    if (!fullPath) {
      continue;
    }

    // Read file data
    const isDirectory = header.type === TAR_TYPE.DIRECTORY || fullPath.endsWith('/');
    const fileData = header.size > 0 ? data.slice(offset, offset + header.size) : new Uint8Array(0);

    files.push({
      path: fullPath,
      data: fileData,
      mode: header.mode,
      isDirectory,
    });

    // Move to next block (padded to 512 bytes)
    offset += Math.ceil(header.size / TAR_BLOCK_SIZE) * TAR_BLOCK_SIZE;
  }

  return files;
}

/**
 * Parse tar header
 */
function parseHeader(bytes: Uint8Array): TarHeader {
  return {
    name: readString(bytes, 0, 100),
    mode: readOctal(bytes, 100, 8),
    size: readOctal(bytes, 124, 12),
    type: String.fromCharCode(bytes[156]) || TAR_TYPE.FILE,
    linkname: readString(bytes, 157, 100),
    prefix: readString(bytes, 345, 155),
  };
}

/**
 * Read null-terminated string from buffer
 */
function readString(bytes: Uint8Array, offset: number, length: number): string {
  const slice = bytes.slice(offset, offset + length);
  const nullIndex = slice.indexOf(0);
  const end = nullIndex === -1 ? length : nullIndex;
  return new TextDecoder().decode(slice.slice(0, end));
}

/**
 * Read octal number from buffer
 */
function readOctal(bytes: Uint8Array, offset: number, length: number): number {
  const str = readString(bytes, offset, length).trim();
  if (!str) return 0;
  return parseInt(str, 8) || 0;
}

/**
 * Check if block is all zeros
 */
function isZeroBlock(bytes: Uint8Array): boolean {
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] !== 0) return false;
  }
  return true;
}

/**
 * Get file extension from path
 */
export function getFileExtension(path: string): string {
  const lastDot = path.lastIndexOf('.');
  if (lastDot === -1 || lastDot === 0) return '';
  return path.slice(lastDot);
}

/**
 * Check if file should be included (skip unnecessary files)
 */
export function shouldIncludeFile(path: string): boolean {
  // Skip common unnecessary files
  const skipPatterns = [
    /^\.git\//,
    /^\.github\//,
    /^test\//,
    /^tests\//,
    /^__tests__\//,
    /^\.eslintrc/,
    /^\.prettierrc/,
    /^tsconfig\.json$/,
    /^jest\.config/,
    /^\.travis\.yml$/,
    /^\.npmignore$/,
    /\.map$/,
    /\.md$/i,
    /CHANGELOG/i,
    /LICENSE/i,
    /README/i,
  ];

  for (const pattern of skipPatterns) {
    if (pattern.test(path)) {
      return false;
    }
  }

  return true;
}
