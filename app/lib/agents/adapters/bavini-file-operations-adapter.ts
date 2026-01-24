/**
 * =============================================================================
 * BAVINI Cloud - File Operations Adapter for Agents
 * =============================================================================
 * Adaptateur pour les opérations de fichiers avancées (glob, grep, etc.)
 * Utilise MountManager au lieu de WebContainer.
 *
 * Remplace FileOperationsAdapter pour le runtime browser.
 * =============================================================================
 */

import type { MountManager } from '~/lib/runtime/filesystem';
import { getSharedMountManager } from '~/lib/runtime/filesystem';
import { createScopedLogger } from '~/utils/logger';
import type { AgentType, ToolExecutionResult, CodeSnippet } from '../types';
import { addAgentLog } from '~/lib/stores/agents';
import { LRUCache } from '../utils/lru-cache';

const logger = createScopedLogger('BaviniFileOperationsAdapter');

/*
 * ============================================================================
 * TYPES
 * ============================================================================
 */

export interface GlobOptions {
  /** Glob pattern like src/components/*.tsx */
  pattern: string;

  /** Base directory */
  cwd?: string;

  /** Patterns to ignore */
  ignore?: string[];

  /** Include hidden files */
  dot?: boolean;
}

export interface GrepOptions {
  /** Search pattern (regex or string) */
  pattern: string;

  /** Files to search (glob pattern) */
  include?: string;

  /** Files to exclude */
  exclude?: string[];

  /** Case-insensitive search */
  ignoreCase?: boolean;

  /** Lines of context before match */
  contextBefore?: number;

  /** Lines of context after match */
  contextAfter?: number;

  /** Max results limit */
  maxResults?: number;
}

export interface GrepMatch {
  filePath: string;
  lineNumber: number;
  line: string;
  contextBefore?: string[];
  contextAfter?: string[];
}

export interface EditOperation {
  /** Operation type */
  type: 'replace' | 'insert' | 'delete';

  /** Start line (1-indexed) */
  startLine: number;

  /** End line (for replace/delete) */
  endLine?: number;

  /** New content */
  content?: string;
}

export interface FileInfo {
  path: string;
  name: string;
  extension: string;
  size: number;
  isDirectory: boolean;
}

/*
 * ============================================================================
 * FILE OPERATIONS CLASS
 * ============================================================================
 */

/** Default cache configuration */
const FILE_CACHE_MAX_SIZE = 100;
const FILE_CACHE_TTL_MS = 30000; // 30 seconds TTL

export class BaviniFileOperationsAdapter {
  private agentName: AgentType;
  private taskId?: string;
  private fs: MountManager;

  // LRU cache with size limit and TTL for frequent reads
  private readCache: LRUCache<string>;

  constructor(agentName: AgentType, taskId?: string, fs?: MountManager) {
    this.agentName = agentName;
    this.taskId = taskId;
    this.fs = fs ?? getSharedMountManager();

    // Initialize LRU cache with bounded size and TTL
    this.readCache = new LRUCache<string>({
      maxSize: FILE_CACHE_MAX_SIZE,
      ttl: FILE_CACHE_TTL_MS,
      onEvict: (key) => {
        logger.debug(`Cache evicted: ${key}`);
      },
    });
  }

  /*
   * --------------------------------------------------------------------------
   * READ OPERATIONS
   * --------------------------------------------------------------------------
   */

  /**
   * Read a file with LRU caching
   */
  async readFile(filePath: string, useCache = true): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    const absolutePath = this.toAbsolutePath(filePath);

    // Check LRU cache (TTL is handled automatically)
    if (useCache) {
      const cached = this.readCache.get(absolutePath);

      if (cached !== undefined) {
        return {
          success: true,
          output: cached,
          executionTime: Date.now() - startTime,
        };
      }
    }

    try {
      const exists = await this.fs.exists(absolutePath);

      if (!exists) {
        return {
          success: false,
          output: null,
          error: `File not found: ${filePath}`,
          executionTime: Date.now() - startTime,
        };
      }

      const content = await this.fs.readTextFile(absolutePath);

      // Cache the content (LRU eviction handled automatically)
      this.readCache.set(absolutePath, content);

      this.log('debug', `Read file: ${filePath} (${content.length} chars)`);

      return {
        success: true,
        output: content,
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.log('error', `Failed to read file ${filePath}: ${message}`);

      return {
        success: false,
        output: null,
        error: message,
        executionTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Read multiple files in parallel
   */
  async readFiles(filePaths: string[]): Promise<Map<string, ToolExecutionResult>> {
    const results = new Map<string, ToolExecutionResult>();
    const promises = filePaths.map(async (path) => {
      const result = await this.readFile(path);
      results.set(path, result);
    });

    await Promise.all(promises);

    return results;
  }

  /**
   * Extract a code snippet from a file
   */
  async getCodeSnippet(filePath: string, startLine: number, endLine: number): Promise<CodeSnippet | null> {
    const result = await this.readFile(filePath);

    if (!result.success || !result.output) {
      return null;
    }

    const lines = (result.output as string).split('\n');
    const content = lines.slice(startLine - 1, endLine).join('\n');

    // Detect language from extension
    const ext = filePath.split('.').pop() || '';
    const languageMap: Record<string, string> = {
      ts: 'typescript',
      tsx: 'typescript',
      js: 'javascript',
      jsx: 'javascript',
      py: 'python',
      rs: 'rust',
      go: 'go',
      java: 'java',
      css: 'css',
      scss: 'scss',
      html: 'html',
      json: 'json',
      md: 'markdown',
      yaml: 'yaml',
      yml: 'yaml',
    };

    return {
      filePath,
      startLine,
      endLine,
      content,
      language: languageMap[ext] || ext,
    };
  }

  /*
   * --------------------------------------------------------------------------
   * SEARCH OPERATIONS
   * --------------------------------------------------------------------------
   */

  /**
   * Search for files by glob pattern
   */
  async glob(options: GlobOptions): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    const { pattern, cwd = '.', ignore = ['node_modules', '.git'], dot = false } = options;

    try {
      const basePath = this.toAbsolutePath(cwd);
      const matches: string[] = [];

      // Recursive function to traverse directories
      const walk = async (dir: string): Promise<void> => {
        try {
          const entries = await this.fs.readdirWithTypes(dir);

          for (const entry of entries) {
            const fullPath = dir === '/' ? `/${entry.name}` : `${dir}/${entry.name}`;

            // Skip hidden files if dot=false
            if (!dot && entry.name.startsWith('.')) {
              continue;
            }

            // Skip excluded patterns
            if (ignore.some((ig) => fullPath.includes(ig))) {
              continue;
            }

            if (entry.isDirectory) {
              await walk(fullPath);
            } else {
              // Check if file matches pattern
              if (this.matchGlob(fullPath, pattern)) {
                matches.push(fullPath);
              }
            }
          }
        } catch {
          // Ignore read errors
        }
      };

      await walk(basePath);

      this.log('debug', `Glob "${pattern}": found ${matches.length} files`);

      return {
        success: true,
        output: matches,
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.log('error', `Glob failed: ${message}`);

      return {
        success: false,
        output: null,
        error: message,
        executionTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Simple glob pattern matching
   */
  private matchGlob(path: string, pattern: string): boolean {
    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '{{GLOBSTAR}}')
      .replace(/\*/g, '[^/]*')
      .replace(/{{GLOBSTAR}}/g, '.*');

    const regex = new RegExp(`${regexPattern}$`);

    return regex.test(path);
  }

  /**
   * Search in file contents
   */
  async grep(options: GrepOptions): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    const {
      pattern,
      include = '**/*',
      exclude = ['node_modules', '.git'],
      ignoreCase = false,
      contextBefore = 0,
      contextAfter = 0,
      maxResults = 100,
    } = options;

    try {
      // First find the files
      const filesResult = await this.glob({ pattern: include, ignore: exclude });

      if (!filesResult.success) {
        return filesResult;
      }

      const files = filesResult.output as string[];
      const matches: GrepMatch[] = [];
      const regex = new RegExp(pattern, ignoreCase ? 'gi' : 'g');

      for (const filePath of files) {
        if (matches.length >= maxResults) {
          break;
        }

        const fileResult = await this.readFile(filePath);

        if (!fileResult.success) {
          continue;
        }

        const content = fileResult.output as string;
        const lines = content.split('\n');

        for (let i = 0; i < lines.length && matches.length < maxResults; i++) {
          if (regex.test(lines[i])) {
            const match: GrepMatch = {
              filePath,
              lineNumber: i + 1,
              line: lines[i],
            };

            if (contextBefore > 0) {
              match.contextBefore = lines.slice(Math.max(0, i - contextBefore), i);
            }

            if (contextAfter > 0) {
              match.contextAfter = lines.slice(i + 1, i + 1 + contextAfter);
            }

            matches.push(match);
          }

          // Reset regex lastIndex for next iteration
          regex.lastIndex = 0;
        }
      }

      this.log('debug', `Grep "${pattern}": found ${matches.length} matches in ${files.length} files`);

      return {
        success: true,
        output: matches,
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.log('error', `Grep failed: ${message}`);

      return {
        success: false,
        output: null,
        error: message,
        executionTime: Date.now() - startTime,
      };
    }
  }

  /*
   * --------------------------------------------------------------------------
   * EDIT OPERATIONS
   * --------------------------------------------------------------------------
   */

  /**
   * Apply edit operations to a file
   * Note: These operations only prepare content,
   * actual writing must go through FSAdapter
   */
  async prepareEdit(filePath: string, operations: EditOperation[]): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      const result = await this.readFile(filePath, false);

      if (!result.success) {
        return result;
      }

      const lines = (result.output as string).split('\n');

      // Sort operations by line descending to avoid offset issues
      const sortedOps = [...operations].sort((a, b) => b.startLine - a.startLine);

      for (const op of sortedOps) {
        const startIdx = op.startLine - 1;
        const endIdx = op.endLine ? op.endLine - 1 : startIdx;

        switch (op.type) {
          case 'replace':
            if (op.content !== undefined) {
              const newLines = op.content.split('\n');
              lines.splice(startIdx, endIdx - startIdx + 1, ...newLines);
            }

            break;

          case 'insert':
            if (op.content !== undefined) {
              const newLines = op.content.split('\n');
              lines.splice(startIdx, 0, ...newLines);
            }

            break;

          case 'delete':
            lines.splice(startIdx, endIdx - startIdx + 1);
            break;
        }
      }

      const newContent = lines.join('\n');

      this.log('debug', `Prepared edit for ${filePath}: ${operations.length} operations`);

      return {
        success: true,
        output: {
          path: filePath,
          originalContent: result.output as string,
          newContent,
          operations: operations.length,
        },
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.log('error', `Edit preparation failed: ${message}`);

      return {
        success: false,
        output: null,
        error: message,
        executionTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Generate a diff between two contents
   */
  generateDiff(original: string, modified: string): string[] {
    const originalLines = original.split('\n');
    const modifiedLines = modified.split('\n');
    const diff: string[] = [];

    // Simplified diff algorithm (LCS-based)
    let i = 0;
    let j = 0;

    while (i < originalLines.length || j < modifiedLines.length) {
      if (i >= originalLines.length) {
        // Lines added at end
        diff.push(`+ ${modifiedLines[j]}`);
        j++;
      } else if (j >= modifiedLines.length) {
        // Lines deleted at end
        diff.push(`- ${originalLines[i]}`);
        i++;
      } else if (originalLines[i] === modifiedLines[j]) {
        // Identical line
        diff.push(`  ${originalLines[i]}`);
        i++;
        j++;
      } else {
        // Modified line
        diff.push(`- ${originalLines[i]}`);
        diff.push(`+ ${modifiedLines[j]}`);
        i++;
        j++;
      }
    }

    return diff;
  }

  /*
   * --------------------------------------------------------------------------
   * UTILITIES
   * --------------------------------------------------------------------------
   */

  /**
   * Convert relative path to absolute
   */
  private toAbsolutePath(path: string): string {
    if (path.startsWith('/')) {
      return path;
    }

    if (path === '.') {
      return '/';
    }

    return '/' + path;
  }

  /**
   * Get file information
   */
  async getFileInfo(filePath: string): Promise<FileInfo | null> {
    try {
      const absolutePath = this.toAbsolutePath(filePath);
      const exists = await this.fs.exists(absolutePath);

      if (!exists) {
        return null;
      }

      const stat = await this.fs.stat(absolutePath);
      const parts = filePath.split('/');
      const name = parts[parts.length - 1] || filePath;
      const extension = name.includes('.') ? name.split('.').pop() || '' : '';

      return {
        path: filePath,
        name,
        extension,
        size: stat.size ?? 0,
        isDirectory: stat.isDirectory,
      };
    } catch {
      return null;
    }
  }

  /**
   * Clear the entire read cache
   */
  clearCache(): void {
    this.readCache.clear();
  }

  /**
   * Invalidate cache for specific file(s)
   * Call this when a file is modified externally
   */
  invalidateCache(filePaths: string | string[]): void {
    const paths = Array.isArray(filePaths) ? filePaths : [filePaths];

    for (const path of paths) {
      const absolutePath = this.toAbsolutePath(path);
      this.readCache.delete(absolutePath);
    }
  }

  /**
   * Get cache statistics for monitoring
   */
  getCacheStats() {
    return this.readCache.getStats();
  }

  /**
   * Get cache hit rate (0-100)
   */
  getCacheHitRate(): number {
    return this.readCache.getHitRate();
  }

  /**
   * Log with agent context
   */
  private log(level: 'debug' | 'info' | 'warn' | 'error', message: string): void {
    logger[level](message);

    addAgentLog(this.agentName, {
      level,
      message,
      taskId: this.taskId,
    });
  }
}

/*
 * ============================================================================
 * FACTORY
 * ============================================================================
 */

/**
 * Create a BAVINI file operations adapter for an agent
 */
export function createBaviniFileOperationsAdapter(
  agentName: AgentType,
  taskId?: string,
  fs?: MountManager,
): BaviniFileOperationsAdapter {
  return new BaviniFileOperationsAdapter(agentName, taskId, fs);
}
