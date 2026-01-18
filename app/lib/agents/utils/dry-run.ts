/**
 * Dry-Run Mode for Destructive Operations
 *
 * Provides a safety layer that simulates destructive operations without
 * actually executing them. Useful for testing, previewing changes, and
 * validating workflows before execution.
 *
 * @module agents/utils/dry-run
 */

import { createScopedLogger } from '~/utils/logger';
import type { ToolExecutionResult, Artifact } from '../types';

const logger = createScopedLogger('DryRun');

/*
 * ============================================================================
 * TYPES
 * ============================================================================
 */

/**
 * Categories of operations for dry-run tracking
 */
export type OperationCategory =
  | 'file_write'
  | 'file_delete'
  | 'file_move'
  | 'directory_create'
  | 'directory_delete'
  | 'shell_command'
  | 'git_operation'
  | 'package_install'
  | 'server_start'
  | 'server_stop';

/**
 * A simulated operation in dry-run mode
 */
export interface DryRunOperation {
  /** Unique ID for this operation */
  id: string;

  /** Category of operation */
  category: OperationCategory;

  /** Human-readable description */
  description: string;

  /** Tool that would execute this operation */
  tool: string;

  /** Input parameters */
  input: Record<string, unknown>;

  /** Simulated result */
  simulatedResult: ToolExecutionResult;

  /** Potential risks or warnings */
  warnings: string[];

  /** Is this operation reversible? */
  reversible: boolean;

  /** Timestamp */
  timestamp: Date;
}

/**
 * Summary of dry-run execution
 */
export interface DryRunSummary {
  /** Total operations simulated */
  totalOperations: number;

  /** Operations by category */
  byCategory: Record<OperationCategory, number>;

  /** Number of warnings */
  totalWarnings: number;

  /** Number of irreversible operations */
  irreversibleCount: number;

  /** List of all operations */
  operations: DryRunOperation[];

  /** Files that would be created */
  filesToCreate: string[];

  /** Files that would be modified */
  filesToModify: string[];

  /** Files that would be deleted */
  filesToDelete: string[];

  /** Commands that would be executed */
  commandsToExecute: string[];
}

/**
 * Configuration for dry-run mode
 */
export interface DryRunConfig {
  /** Enable dry-run mode */
  enabled: boolean;

  /** Log each simulated operation */
  verbose: boolean;

  /** Throw error if irreversible operation detected */
  blockIrreversible: boolean;

  /** Categories to simulate (empty = all) */
  categories?: OperationCategory[];

  /** Callback when operation is simulated */
  onOperation?: (operation: DryRunOperation) => void;
}

/*
 * ============================================================================
 * DRY-RUN MANAGER
 * ============================================================================
 */

/**
 * Détection de l'environnement pour activer dry-run par défaut en dev/staging
 */
const isDevelopment = typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production';

/**
 * Manages dry-run state and operations
 */
export class DryRunManager {
  // Activé par défaut en développement pour la sécurité
  private enabled: boolean = isDevelopment;
  private verbose: boolean = false;
  // Bloque les opérations irréversibles par défaut
  private blockIrreversible: boolean = true;
  private categories: Set<OperationCategory> | null = null;
  private operations: DryRunOperation[] = [];
  private onOperation?: (operation: DryRunOperation) => void;
  private operationCounter: number = 0;

  constructor(config: Partial<DryRunConfig> = {}) {
    // Si on est en production et que dry-run n'est pas explicitement activé, le désactiver
    if (!isDevelopment && config.enabled === undefined) {
      this.enabled = false;
    }
    this.configure(config);
  }

  /**
   * Configure dry-run mode
   */
  configure(config: Partial<DryRunConfig>): void {
    if (config.enabled !== undefined) {
      this.enabled = config.enabled;
    }
    if (config.verbose !== undefined) {
      this.verbose = config.verbose;
    }
    if (config.blockIrreversible !== undefined) {
      this.blockIrreversible = config.blockIrreversible;
    }
    if (config.categories) {
      this.categories = new Set(config.categories);
    }
    if (config.onOperation) {
      this.onOperation = config.onOperation;
    }

    logger.info('Dry-run configured', {
      enabled: this.enabled,
      verbose: this.verbose,
      blockIrreversible: this.blockIrreversible,
    });
  }

  /**
   * Enable dry-run mode
   */
  enable(): void {
    this.enabled = true;
    this.operations = [];
    logger.info('Dry-run mode ENABLED');
  }

  /**
   * Disable dry-run mode
   */
  disable(): void {
    this.enabled = false;
    logger.info('Dry-run mode DISABLED');
  }

  /**
   * Check if dry-run is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Check if a category should be simulated
   */
  shouldSimulate(category: OperationCategory): boolean {
    if (!this.enabled) {
      return false;
    }

    if (this.categories === null) {
      return true; // All categories
    }

    return this.categories.has(category);
  }

  /**
   * Simulate an operation
   * Returns the simulated result if in dry-run mode, null otherwise
   */
  simulate(
    category: OperationCategory,
    tool: string,
    input: Record<string, unknown>,
    options: {
      description?: string;
      reversible?: boolean;
      warnings?: string[];
      simulatedOutput?: string;
    } = {},
  ): ToolExecutionResult | null {
    if (!this.shouldSimulate(category)) {
      return null;
    }

    const { description = `${tool} operation`, reversible = true, warnings = [], simulatedOutput } = options;

    // Check for irreversible operations
    if (!reversible && this.blockIrreversible) {
      throw new DryRunBlockedError(`Irreversible operation blocked in dry-run mode: ${description}`, category, tool);
    }

    // Generate operation ID
    this.operationCounter++;
    const operationId = `dryrun-${Date.now()}-${this.operationCounter}`;

    // Build simulated result - store dry-run info in output since ToolExecutionResult doesn't have metadata
    const outputText = simulatedOutput || this.generateSimulatedOutput(category, tool, input);
    const simulatedResult: ToolExecutionResult = {
      success: true,
      output: outputText,
    };

    // Create operation record
    const operation: DryRunOperation = {
      id: operationId,
      category,
      description,
      tool,
      input,
      simulatedResult,
      warnings,
      reversible,
      timestamp: new Date(),
    };

    // Store operation
    this.operations.push(operation);

    // Log if verbose
    if (this.verbose) {
      logger.info(`[DRY-RUN] ${description}`, {
        tool,
        category,
        input: this.sanitizeInput(input),
        warnings,
      });
    }

    // Callback
    if (this.onOperation) {
      this.onOperation(operation);
    }

    return simulatedResult;
  }

  /**
   * Generate simulated output based on operation type
   */
  private generateSimulatedOutput(category: OperationCategory, tool: string, input: Record<string, unknown>): string {
    switch (category) {
      case 'file_write':
        return `[DRY-RUN] Would write ${(input.content as string)?.length || 0} bytes to ${input.path}`;

      case 'file_delete':
        return `[DRY-RUN] Would delete file: ${input.path}`;

      case 'file_move':
        return `[DRY-RUN] Would move ${input.oldPath || input.source} to ${input.newPath || input.destination}`;

      case 'directory_create':
        return `[DRY-RUN] Would create directory: ${input.path}`;

      case 'directory_delete':
        return `[DRY-RUN] Would delete directory: ${input.path}`;

      case 'shell_command':
        return `[DRY-RUN] Would execute: ${input.command}`;

      case 'git_operation':
        return `[DRY-RUN] Would run git ${tool.replace('git_', '')}: ${JSON.stringify(input)}`;

      case 'package_install':
        const packages = (input.packages as string[])?.join(', ') || 'dependencies';
        return `[DRY-RUN] Would install packages: ${packages}`;

      case 'server_start':
        return `[DRY-RUN] Would start server on port ${input.port || 'default'}`;

      case 'server_stop':
        return `[DRY-RUN] Would stop server ${input.processId || 'all'}`;

      default:
        return `[DRY-RUN] Would execute ${tool}`;
    }
  }

  /**
   * Sanitize input for logging (remove large content)
   */
  private sanitizeInput(input: Record<string, unknown>): Record<string, unknown> {
    const sanitized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(input)) {
      if (key === 'content' && typeof value === 'string' && value.length > 100) {
        sanitized[key] = `[${value.length} chars]`;
      } else if (typeof value === 'string' && value.length > 500) {
        sanitized[key] = value.substring(0, 500) + '...';
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Get summary of all simulated operations
   */
  getSummary(): DryRunSummary {
    const byCategory: Record<OperationCategory, number> = {
      file_write: 0,
      file_delete: 0,
      file_move: 0,
      directory_create: 0,
      directory_delete: 0,
      shell_command: 0,
      git_operation: 0,
      package_install: 0,
      server_start: 0,
      server_stop: 0,
    };

    const filesToCreate: string[] = [];
    const filesToModify: string[] = [];
    const filesToDelete: string[] = [];
    const commandsToExecute: string[] = [];
    let totalWarnings = 0;
    let irreversibleCount = 0;

    for (const op of this.operations) {
      byCategory[op.category]++;
      totalWarnings += op.warnings.length;

      if (!op.reversible) {
        irreversibleCount++;
      }

      // Track files
      switch (op.category) {
        case 'file_write':
          if (op.input.path) {
            // Determine if create or modify based on context
            filesToCreate.push(op.input.path as string);
          }
          break;

        case 'file_delete':
          if (op.input.path) {
            filesToDelete.push(op.input.path as string);
          }
          break;

        case 'file_move':
          if (op.input.oldPath) {
            filesToDelete.push(op.input.oldPath as string);
          }
          if (op.input.newPath) {
            filesToCreate.push(op.input.newPath as string);
          }
          break;

        case 'shell_command':
          if (op.input.command) {
            commandsToExecute.push(op.input.command as string);
          }
          break;
      }
    }

    return {
      totalOperations: this.operations.length,
      byCategory,
      totalWarnings,
      irreversibleCount,
      operations: [...this.operations],
      filesToCreate,
      filesToModify,
      filesToDelete,
      commandsToExecute,
    };
  }

  /**
   * Get all recorded operations
   */
  getOperations(): DryRunOperation[] {
    return [...this.operations];
  }

  /**
   * Clear recorded operations
   */
  clear(): void {
    this.operations = [];
    this.operationCounter = 0;
    logger.debug('Dry-run operations cleared');
  }

  /**
   * Format summary as human-readable string
   */
  formatSummary(): string {
    const summary = this.getSummary();
    const lines: string[] = [
      '═══════════════════════════════════════════════════════════════',
      '                     DRY-RUN SUMMARY                           ',
      '═══════════════════════════════════════════════════════════════',
      '',
      `Total Operations: ${summary.totalOperations}`,
      `Total Warnings: ${summary.totalWarnings}`,
      `Irreversible Operations: ${summary.irreversibleCount}`,
      '',
    ];

    // Operations by category
    lines.push('Operations by Category:');
    for (const [category, count] of Object.entries(summary.byCategory)) {
      if (count > 0) {
        lines.push(`  ${category}: ${count}`);
      }
    }
    lines.push('');

    // Files to create
    if (summary.filesToCreate.length > 0) {
      lines.push('Files to CREATE:');
      for (const file of summary.filesToCreate) {
        lines.push(`  + ${file}`);
      }
      lines.push('');
    }

    // Files to delete
    if (summary.filesToDelete.length > 0) {
      lines.push('Files to DELETE:');
      for (const file of summary.filesToDelete) {
        lines.push(`  - ${file}`);
      }
      lines.push('');
    }

    // Commands to execute
    if (summary.commandsToExecute.length > 0) {
      lines.push('Commands to EXECUTE:');
      for (const cmd of summary.commandsToExecute) {
        lines.push(`  $ ${cmd}`);
      }
      lines.push('');
    }

    lines.push('═══════════════════════════════════════════════════════════════');

    return lines.join('\n');
  }
}

/*
 * ============================================================================
 * ERROR CLASS
 * ============================================================================
 */

/**
 * Error thrown when dry-run blocks an operation
 */
export class DryRunBlockedError extends Error {
  constructor(
    message: string,
    readonly category: OperationCategory,
    readonly tool: string,
  ) {
    super(message);
    this.name = 'DryRunBlockedError';
  }
}

/*
 * ============================================================================
 * GLOBAL INSTANCE AND HELPERS
 * ============================================================================
 */

/**
 * Global dry-run manager instance
 */
export const dryRunManager = new DryRunManager();

/**
 * Enable dry-run mode globally
 */
export function enableDryRun(config?: Partial<DryRunConfig>): void {
  if (config) {
    dryRunManager.configure(config);
  }
  dryRunManager.enable();
}

/**
 * Disable dry-run mode globally
 */
export function disableDryRun(): void {
  dryRunManager.disable();
}

/**
 * Check if dry-run is enabled globally
 */
export function isDryRunEnabled(): boolean {
  return dryRunManager.isEnabled();
}

/**
 * Simulate an operation if dry-run is enabled
 * Returns null if dry-run is disabled (caller should execute real operation)
 */
export function simulateIfDryRun(
  category: OperationCategory,
  tool: string,
  input: Record<string, unknown>,
  options?: {
    description?: string;
    reversible?: boolean;
    warnings?: string[];
    simulatedOutput?: string;
  },
): ToolExecutionResult | null {
  return dryRunManager.simulate(category, tool, input, options);
}

/**
 * Get dry-run summary
 */
export function getDryRunSummary(): DryRunSummary {
  return dryRunManager.getSummary();
}

/**
 * Get formatted dry-run summary
 */
export function formatDryRunSummary(): string {
  return dryRunManager.formatSummary();
}

/**
 * Clear dry-run operations
 */
export function clearDryRunOperations(): void {
  dryRunManager.clear();
}

/*
 * ============================================================================
 * DECORATOR / WRAPPER HELPER
 * ============================================================================
 */

/**
 * Wrap a tool handler to support dry-run mode
 * @param category The operation category
 * @param handler The original handler
 * @param options Options for dry-run simulation
 */
export function withDryRun<T extends Record<string, unknown>>(
  category: OperationCategory,
  handler: (input: T) => Promise<ToolExecutionResult>,
  options?: {
    getDescription?: (input: T) => string;
    reversible?: boolean | ((input: T) => boolean);
    getWarnings?: (input: T) => string[];
  },
): (input: T) => Promise<ToolExecutionResult> {
  return async (input: T): Promise<ToolExecutionResult> => {
    // Check if dry-run should handle this
    const description = options?.getDescription?.(input) || `${category} operation`;
    const reversible =
      typeof options?.reversible === 'function' ? options.reversible(input) : (options?.reversible ?? true);
    const warnings = options?.getWarnings?.(input) || [];

    const dryRunResult = simulateIfDryRun(category, category, input as Record<string, unknown>, {
      description,
      reversible,
      warnings,
    });

    if (dryRunResult) {
      return dryRunResult;
    }

    // Execute real handler
    return handler(input);
  };
}
