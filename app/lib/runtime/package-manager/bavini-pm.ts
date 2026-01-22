/**
 * =============================================================================
 * BAVINI Container - Package Manager
 * =============================================================================
 * Main package manager class that orchestrates installation, resolution,
 * caching, and virtual filesystem integration.
 * =============================================================================
 */

import type { MountManager } from '../filesystem';
import type {
  PackageJson,
  InstallOptions,
  InstallResult,
  InstallProgress,
  FlatDependency,
  ScriptResult,
} from './types';
import { PMError } from './types';
import { RegistryClient } from './registry/registry-client';
import { extractTarball, shouldIncludeFile } from './registry/tarball-extractor';
import { DependencyTree } from './resolver/dependency-tree';
import { PackageCache, getPackageCache } from './cache/package-cache';
import { parseLockfile, generateLockfile, stringifyLockfile, extractFlatDeps } from './lockfile/lockfile-parser';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('BaviniPM');

/**
 * BaviniPM configuration
 */
export interface BaviniPMConfig {
  /** Filesystem mount manager */
  filesystem: MountManager;
  /** Project root directory */
  projectRoot?: string;
  /** Custom registry URL */
  registryUrl?: string;
  /** Enable package caching */
  cacheEnabled?: boolean;
}

/**
 * BAVINI Package Manager
 * Provides npm-compatible package management in the browser
 */
export class BaviniPM {
  private _fs: MountManager;
  private _projectRoot: string;
  private _registry: RegistryClient;
  private _dependencyTree: DependencyTree;
  private _cache: PackageCache;
  private _cacheEnabled: boolean;
  private _initialized = false;

  constructor(config: BaviniPMConfig) {
    this._fs = config.filesystem;
    this._projectRoot = config.projectRoot ?? '/home/project';
    this._registry = new RegistryClient(config.registryUrl ? { url: config.registryUrl } : undefined);
    this._dependencyTree = new DependencyTree(this._registry);
    this._cache = getPackageCache();
    this._cacheEnabled = config.cacheEnabled ?? true;
  }

  /**
   * Initialize the package manager
   */
  async init(): Promise<void> {
    if (this._initialized) return;

    if (this._cacheEnabled) {
      await this._cache.init();
    }

    this._initialized = true;
    logger.debug('BaviniPM initialized');
  }

  /**
   * Install packages
   */
  async install(packages?: string[], options: InstallOptions = {}): Promise<InstallResult> {
    const startTime = Date.now();
    const result: InstallResult = {
      success: true,
      installed: [],
      warnings: [],
      errors: [],
      duration: 0,
    };

    try {
      await this.init();

      // Read project package.json
      const packageJson = await this._readPackageJson();

      // Determine what to install
      let dependencies: Record<string, string>;

      if (packages && packages.length > 0) {
        // Install specific packages
        dependencies = {};

        for (const pkg of packages) {
          const { name, version } = this._parsePackageSpec(pkg);
          dependencies[name] = version;

          // Update package.json
          if (options.saveDev) {
            packageJson.devDependencies = packageJson.devDependencies ?? {};
            packageJson.devDependencies[name] = version;
          } else if (!options.noSave) {
            packageJson.dependencies = packageJson.dependencies ?? {};
            packageJson.dependencies[name] = version;
          }
        }
      } else {
        // Install all dependencies from package.json
        dependencies = { ...packageJson.dependencies };

        if (!options.production) {
          dependencies = { ...dependencies, ...packageJson.devDependencies };
        }
      }

      if (Object.keys(dependencies).length === 0) {
        logger.debug('No dependencies to install');
        result.duration = Date.now() - startTime;
        return result;
      }

      // Check for existing lockfile
      let existingLock: Map<string, FlatDependency> | null = null;

      if (!options.force) {
        try {
          const lockContent = await this._readFile('package-lock.json');
          const { lockfile } = parseLockfile(lockContent);
          existingLock = extractFlatDeps(lockfile);
          logger.debug(`Found existing lockfile with ${existingLock.size} entries`);
        } catch {
          // No lockfile
        }
      }

      // Resolve dependencies
      this._emitProgress(options, 'resolving', 0, 1, undefined, 'Resolving dependencies...');

      const { flat, warnings } = await this._dependencyTree.resolve(dependencies, {
        onProgress: (pkg, depth) => {
          this._emitProgress(options, 'resolving', depth, 10, pkg);
        },
      });

      result.warnings.push(...warnings);

      // Download and extract packages
      const total = flat.size;
      let current = 0;

      for (const [path, dep] of flat) {
        current++;
        this._emitProgress(options, 'downloading', current, total, dep.name);

        try {
          await this._installPackage(dep);
          result.installed.push({ name: dep.name, version: dep.version });
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          result.errors.push(`${dep.name}@${dep.version}: ${msg}`);
        }
      }

      // Generate lockfile
      const newLockfile = generateLockfile(packageJson.name, packageJson.version, flat);
      await this._writeFile('package-lock.json', stringifyLockfile(newLockfile));

      // Update package.json if needed
      if (packages && packages.length > 0 && !options.noSave) {
        await this._writePackageJson(packageJson);
      }

      result.success = result.errors.length === 0;
    } catch (error) {
      result.success = false;
      result.errors.push(error instanceof Error ? error.message : String(error));
    }

    result.duration = Date.now() - startTime;
    logger.info(`Install completed in ${result.duration}ms`);

    return result;
  }

  /**
   * Uninstall packages
   */
  async uninstall(packages: string[]): Promise<InstallResult> {
    const startTime = Date.now();
    const result: InstallResult = {
      success: true,
      installed: [],
      warnings: [],
      errors: [],
      duration: 0,
    };

    try {
      await this.init();

      const packageJson = await this._readPackageJson();

      for (const pkg of packages) {
        // Remove from dependencies
        if (packageJson.dependencies) {
          delete packageJson.dependencies[pkg];
        }

        if (packageJson.devDependencies) {
          delete packageJson.devDependencies[pkg];
        }

        // Remove from node_modules
        try {
          await this._fs.rmdir(`${this._projectRoot}/node_modules/${pkg}`, { recursive: true });
        } catch {
          // May not exist
        }

        result.installed.push({ name: pkg, version: 'removed' });
      }

      // Update package.json
      await this._writePackageJson(packageJson);

      // Reinstall to update lockfile
      await this.install(undefined, { noSave: true });
    } catch (error) {
      result.success = false;
      result.errors.push(error instanceof Error ? error.message : String(error));
    }

    result.duration = Date.now() - startTime;
    return result;
  }

  /**
   * Run a package script
   */
  async run(scriptName: string, args: string[] = []): Promise<ScriptResult> {
    await this.init();

    const packageJson = await this._readPackageJson();
    const scripts = packageJson.scripts ?? {};
    const script = scripts[scriptName];

    if (!script) {
      throw new PMError('SCRIPT_ERROR', `Script '${scriptName}' not found in package.json`);
    }

    // In browser environment, we can't run actual shell scripts
    // This would need to be handled by the terminal/shell implementation
    logger.info(`Would run script: ${script} ${args.join(' ')}`);

    return {
      exitCode: 0,
      stdout: `Script '${scriptName}' scheduled for execution`,
      stderr: '',
      duration: 0,
    };
  }

  /**
   * List installed packages
   */
  async list(): Promise<Array<{ name: string; version: string; path: string }>> {
    await this.init();

    const packages: Array<{ name: string; version: string; path: string }> = [];

    try {
      const nodeModules = `${this._projectRoot}/node_modules`;
      const entries = await this._fs.readdir(nodeModules);

      for (const entry of entries) {
        if (entry.startsWith('.')) continue;

        const pkgPath = `${nodeModules}/${entry}`;

        if (entry.startsWith('@')) {
          // Scoped package
          const scopedEntries = await this._fs.readdir(pkgPath);

          for (const scoped of scopedEntries) {
            const fullPath = `${pkgPath}/${scoped}`;

            try {
              const pkgJson = await this._readJsonFile(`${fullPath}/package.json`);
              packages.push({
                name: `${entry}/${scoped}`,
                version: pkgJson.version ?? 'unknown',
                path: fullPath,
              });
            } catch {
              // Skip invalid packages
            }
          }
        } else {
          try {
            const pkgJson = await this._readJsonFile(`${pkgPath}/package.json`);
            packages.push({
              name: entry,
              version: pkgJson.version ?? 'unknown',
              path: pkgPath,
            });
          } catch {
            // Skip invalid packages
          }
        }
      }
    } catch {
      // node_modules doesn't exist
    }

    return packages;
  }

  /**
   * Install a single package to filesystem
   */
  private async _installPackage(dep: FlatDependency): Promise<void> {
    const cacheKey = `${dep.name}@${dep.version}`;

    // Check cache
    if (this._cacheEnabled) {
      const cached = await this._cache.get(dep.name, dep.version);

      if (cached) {
        logger.debug(`Using cached ${cacheKey}`);
        await this._writePackageFiles(dep.path, cached.files, cached.packageJson);
        return;
      }
    }

    // Download tarball
    logger.debug(`Downloading ${cacheKey}`);
    const tarball = await this._registry.downloadTarball(dep.resolved);

    // Verify integrity
    if (dep.integrity) {
      const valid = await this._registry.verifyIntegrity(tarball, dep.integrity);

      if (!valid) {
        throw new PMError('INTEGRITY_ERROR', `Integrity check failed for ${dep.name}@${dep.version}`);
      }
    }

    // Extract tarball
    const { files, packageJson, totalSize } = await extractTarball(tarball);

    // Cache the result
    if (this._cacheEnabled) {
      await this._cache.set(dep.name, dep.version, {
        name: dep.name,
        version: dep.version,
        tarballUrl: dep.resolved,
        integrity: dep.integrity,
        files,
        packageJson,
        cachedAt: Date.now(),
        lastUsed: Date.now(),
        size: totalSize,
      });
    }

    // Write to filesystem
    await this._writePackageFiles(dep.path, files, packageJson);
  }

  /**
   * Write package files to filesystem
   */
  private async _writePackageFiles(
    basePath: string,
    files: Map<string, Uint8Array>,
    packageJson: PackageJson,
  ): Promise<void> {
    const fullPath = `${this._projectRoot}/${basePath}`;

    // Create package directory
    await this._fs.mkdir(fullPath, { recursive: true });

    // Write files
    for (const [filePath, data] of files) {
      // Skip unnecessary files
      if (!shouldIncludeFile(filePath)) continue;

      const targetPath = `${fullPath}/${filePath}`;
      const dirPath = targetPath.substring(0, targetPath.lastIndexOf('/'));

      // Ensure directory exists
      if (dirPath !== fullPath) {
        await this._fs.mkdir(dirPath, { recursive: true });
      }

      await this._fs.writeFile(targetPath, data);
    }

    logger.debug(`Wrote ${files.size} files to ${basePath}`);
  }

  /**
   * Parse package spec (name@version)
   */
  private _parsePackageSpec(spec: string): { name: string; version: string } {
    // Handle scoped packages: @scope/name@version
    const atIndex = spec.lastIndexOf('@');

    if (atIndex > 0) {
      return {
        name: spec.substring(0, atIndex),
        version: spec.substring(atIndex + 1),
      };
    }

    return { name: spec, version: 'latest' };
  }

  /**
   * Read package.json
   */
  private async _readPackageJson(): Promise<PackageJson> {
    try {
      return await this._readJsonFile(`${this._projectRoot}/package.json`);
    } catch {
      // Return default package.json
      return {
        name: 'project',
        version: '1.0.0',
        dependencies: {},
      };
    }
  }

  /**
   * Write package.json
   */
  private async _writePackageJson(packageJson: PackageJson): Promise<void> {
    const content = JSON.stringify(packageJson, null, 2);
    await this._writeFile('package.json', content);
  }

  /**
   * Read JSON file
   */
  private async _readJsonFile(path: string): Promise<PackageJson> {
    const content = await this._readFile(path);
    return JSON.parse(content);
  }

  /**
   * Read file as string
   */
  private async _readFile(relativePath: string): Promise<string> {
    const fullPath = relativePath.startsWith('/') ? relativePath : `${this._projectRoot}/${relativePath}`;
    const data = await this._fs.readFile(fullPath);
    return new TextDecoder().decode(data);
  }

  /**
   * Write file
   */
  private async _writeFile(relativePath: string, content: string): Promise<void> {
    const fullPath = relativePath.startsWith('/') ? relativePath : `${this._projectRoot}/${relativePath}`;
    const data = new TextEncoder().encode(content);
    await this._fs.writeFile(fullPath, data);
  }

  /**
   * Emit progress event
   */
  private _emitProgress(
    options: InstallOptions,
    phase: InstallProgress['phase'],
    current: number,
    total: number,
    pkg?: string,
    message?: string,
  ): void {
    options.onProgress?.({
      phase,
      current,
      total,
      package: pkg,
      message,
    });
  }

  /**
   * Clear caches
   */
  async clearCache(): Promise<void> {
    await this._cache.clear();
    this._dependencyTree.clearCache();
    this._registry.clearCache();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { packages: number; memorySize: number } {
    const stats = this._cache.getStats();
    return {
      packages: stats.memoryPackages,
      memorySize: stats.memorySize,
    };
  }
}
