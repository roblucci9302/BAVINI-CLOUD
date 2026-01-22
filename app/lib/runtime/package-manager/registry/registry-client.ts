/**
 * =============================================================================
 * BAVINI Container - Registry Client
 * =============================================================================
 * Client for fetching package metadata and tarballs from npm registry.
 * =============================================================================
 */

import type { PackageMetadata, PackageVersionInfo, RegistryConfig } from '../types';
import { PMError, DEFAULT_REGISTRY } from '../types';
import { createScopedLogger } from '~/utils/logger';
import { fetchWithTimeout, TIMEOUTS, TimeoutError } from '../../utils/timeout';

const logger = createScopedLogger('RegistryClient');

/**
 * npm registry client
 */
export class RegistryClient {
  private _baseUrl: string;
  private _timeout: number;
  private _maxRetries: number;
  private _metadataCache: Map<string, { data: PackageMetadata; cachedAt: number }> = new Map();
  private _cacheTTL = 5 * 60 * 1000; // 5 minutes

  constructor(config?: RegistryConfig) {
    this._baseUrl = config?.url ?? DEFAULT_REGISTRY;
    this._timeout = config?.timeout ?? 30000;
    this._maxRetries = config?.maxRetries ?? 3;
  }

  /**
   * Get package metadata from registry
   */
  async getPackageMetadata(name: string): Promise<PackageMetadata> {
    // Check cache first
    const cached = this._metadataCache.get(name);
    if (cached && Date.now() - cached.cachedAt < this._cacheTTL) {
      logger.debug(`Using cached metadata for ${name}`);
      return cached.data;
    }

    // Encode scoped package names
    const encodedName = name.startsWith('@') ? `@${encodeURIComponent(name.slice(1))}` : encodeURIComponent(name);

    const url = `${this._baseUrl}/${encodedName}`;
    logger.debug(`Fetching metadata for ${name} from ${url}`);

    const response = await this._fetchWithRetry(url);

    if (!response.ok) {
      if (response.status === 404) {
        throw new PMError('PACKAGE_NOT_FOUND', `Package '${name}' not found in registry`, name);
      }
      throw new PMError('NETWORK_ERROR', `Failed to fetch metadata for '${name}': ${response.status}`, name);
    }

    const data = (await response.json()) as PackageMetadata;

    // Cache the result
    this._metadataCache.set(name, { data, cachedAt: Date.now() });

    return data;
  }

  /**
   * Get specific version info
   */
  async getVersionInfo(name: string, version: string): Promise<PackageVersionInfo> {
    const metadata = await this.getPackageMetadata(name);

    // Handle dist-tags like "latest", "next"
    const resolvedVersion = metadata['dist-tags'][version] ?? version;

    const versionInfo = metadata.versions[resolvedVersion];
    if (!versionInfo) {
      throw new PMError('VERSION_NOT_FOUND', `Version '${version}' not found for package '${name}'`, name, version);
    }

    return versionInfo;
  }

  /**
   * Get available versions for a package
   */
  async getAvailableVersions(name: string): Promise<string[]> {
    const metadata = await this.getPackageMetadata(name);
    return Object.keys(metadata.versions);
  }

  /**
   * Get dist-tags for a package
   */
  async getDistTags(name: string): Promise<Record<string, string>> {
    const metadata = await this.getPackageMetadata(name);
    return metadata['dist-tags'];
  }

  /**
   * Download package tarball
   */
  async downloadTarball(tarballUrl: string): Promise<ArrayBuffer> {
    logger.debug(`Downloading tarball from ${tarballUrl}`);

    const response = await this._fetchWithRetry(tarballUrl);

    if (!response.ok) {
      throw new PMError('TARBALL_ERROR', `Failed to download tarball: ${response.status}`);
    }

    return response.arrayBuffer();
  }

  /**
   * Verify tarball integrity using SubResource Integrity (SRI) format
   * FIX 2.4: Improved error handling and stricter validation
   *
   * @param data - The tarball data to verify
   * @param expectedIntegrity - SRI hash (e.g., "sha512-abc123...")
   * @param strict - If true, throws on mismatch instead of returning false
   * @returns true if valid, false if invalid (when not strict)
   * @throws PMError if strict mode and integrity fails
   */
  async verifyIntegrity(
    data: ArrayBuffer,
    expectedIntegrity: string,
    strict: boolean = false
  ): Promise<boolean> {
    // Parse integrity string (e.g., "sha512-...")
    const dashIndex = expectedIntegrity.indexOf('-');
    if (dashIndex === -1) {
      logger.warn('Invalid integrity format (no dash):', expectedIntegrity);
      // FIX 2.4: In strict mode, invalid format is an error
      if (strict) {
        throw new PMError('INTEGRITY_ERROR', `Invalid integrity format: ${expectedIntegrity}`);
      }
      return true; // Skip verification for invalid format in non-strict mode
    }

    const algorithm = expectedIntegrity.substring(0, dashIndex);
    const expectedHash = expectedIntegrity.substring(dashIndex + 1);

    if (!algorithm || !expectedHash) {
      logger.warn('Invalid integrity format (empty parts):', expectedIntegrity);
      if (strict) {
        throw new PMError('INTEGRITY_ERROR', `Invalid integrity format: ${expectedIntegrity}`);
      }
      return true;
    }

    // Map algorithm names to Web Crypto API format
    const algorithmMap: Record<string, string> = {
      sha256: 'SHA-256',
      sha384: 'SHA-384',
      sha512: 'SHA-512',
    };

    const hashAlgorithm = algorithmMap[algorithm.toLowerCase()];
    if (!hashAlgorithm) {
      logger.warn('Unsupported hash algorithm:', algorithm);
      if (strict) {
        throw new PMError('INTEGRITY_ERROR', `Unsupported hash algorithm: ${algorithm}`);
      }
      return true;
    }

    try {
      const hashBuffer = await crypto.subtle.digest(hashAlgorithm, data);
      const hashArray = new Uint8Array(hashBuffer);

      // Convert to base64 properly
      let binary = '';
      for (let i = 0; i < hashArray.byteLength; i++) {
        binary += String.fromCharCode(hashArray[i]);
      }
      const hashBase64 = btoa(binary);

      const valid = hashBase64 === expectedHash;

      if (!valid) {
        const message = `Integrity mismatch for ${hashAlgorithm}: expected ${expectedHash.substring(0, 20)}..., got ${hashBase64.substring(0, 20)}...`;
        logger.error(message);

        // FIX 2.4: Throw in strict mode
        if (strict) {
          throw new PMError('INTEGRITY_ERROR', message);
        }
      } else {
        logger.debug(`Integrity verified (${algorithm})`);
      }

      return valid;
    } catch (error) {
      // Re-throw PMError
      if (error instanceof PMError) {
        throw error;
      }

      const message = `Integrity verification failed: ${error instanceof Error ? error.message : String(error)}`;
      logger.warn(message);

      // FIX 2.4: In strict mode, crypto errors are failures
      if (strict) {
        throw new PMError('INTEGRITY_ERROR', message);
      }

      return true; // Skip on error in non-strict mode
    }
  }

  /**
   * Fetch with retry logic
   * FIX 2.1: Updated to use centralized timeout utilities
   */
  private async _fetchWithRetry(url: string, options?: RequestInit): Promise<Response> {
    let lastError: Error | null = null;

    // Determine appropriate timeout based on URL type
    const isTarball = url.includes('.tgz') || url.includes('.tar.gz');
    const timeout = isTarball ? TIMEOUTS.TARBALL_DOWNLOAD : TIMEOUTS.REGISTRY_METADATA;

    for (let attempt = 0; attempt < this._maxRetries; attempt++) {
      try {
        const response = await fetchWithTimeout(
          url,
          {
            ...options,
            headers: {
              Accept: isTarball ? 'application/octet-stream' : 'application/json',
              ...options?.headers,
            },
          },
          timeout
        );

        return response;
      } catch (error) {
        // Convert TimeoutError to PMError for consistency
        if (error instanceof TimeoutError) {
          lastError = new Error(`Request timed out after ${timeout}ms`);
        } else {
          lastError = error instanceof Error ? error : new Error(String(error));
        }
        logger.warn(`Fetch attempt ${attempt + 1} failed:`, lastError.message);

        // Wait before retry (exponential backoff)
        if (attempt < this._maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }

    throw new PMError('NETWORK_ERROR', `Failed to fetch ${url} after ${this._maxRetries} attempts: ${lastError?.message}`);
  }

  /**
   * Clear metadata cache
   */
  clearCache(): void {
    this._metadataCache.clear();
  }

  /**
   * Set cache TTL
   */
  setCacheTTL(ttlMs: number): void {
    this._cacheTTL = ttlMs;
  }
}

/**
 * Singleton registry client
 */
let _defaultClient: RegistryClient | null = null;

export function getRegistryClient(): RegistryClient {
  if (!_defaultClient) {
    _defaultClient = new RegistryClient();
  }
  return _defaultClient;
}
