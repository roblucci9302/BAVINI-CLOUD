/**
 * SandboxExecutor - Exécution SQL en environnement sandbox
 *
 * Ce module permet de tester des migrations et du SQL
 * dans un environnement isolé avant de les appliquer en production.
 */

import type {
  Schema,
  Migration,
  SandboxResult,
  MigrationTestResult,
  RegressionResult,
  TestQuery,
  ExecutionError,
  QueryFailure,
  Table,
} from './types';
import { createScopedLogger } from '~/utils/logger';
import { TTLMap } from '~/lib/utils/ttl-map';

const logger = createScopedLogger('SandboxExecutor');

/*
 * =============================================================================
 * Types
 * =============================================================================
 */

export interface SandboxExecutorOptions {
  sandboxPrefix?: string;
  cleanupDelay?: number;
  maxExecutionTime?: number;
  captureSchema?: boolean;
  /** TTL for sandbox contexts in milliseconds (default: 30 minutes) */
  sandboxTTLMs?: number;
  /** Cleanup interval for expired sandboxes (default: 1 minute) */
  cleanupIntervalMs?: number;
}

export interface SandboxContext {
  sandboxId: string;
  schemaName: string;
  createdAt: Date;
  isActive: boolean;
}

export interface ExecutionResult {
  success: boolean;
  rowCount: number;
  duration: number;
  warnings: string[];
  error?: ExecutionError;
}

/*
 * =============================================================================
 * Constantes
 * =============================================================================
 */

const DEFAULT_OPTIONS: Required<SandboxExecutorOptions> = {
  sandboxPrefix: '_sandbox_',
  cleanupDelay: 5000,
  maxExecutionTime: 30000,
  captureSchema: true,
  sandboxTTLMs: 30 * 60 * 1000, // 30 minutes
  cleanupIntervalMs: 60 * 1000, // 1 minute
};

// Patterns SQL dangereux pour sandbox
const DANGEROUS_SANDBOX_PATTERNS = [
  /CREATE\s+DATABASE/i,
  /DROP\s+DATABASE/i,
  /ALTER\s+SYSTEM/i,
  /COPY\s+.*\s+FROM\s+PROGRAM/i,
  /pg_terminate_backend/i,
  /pg_cancel_backend/i,
];

/*
 * =============================================================================
 * SandboxExecutor Class
 * =============================================================================
 */

export class SandboxExecutor {
  private options: Required<SandboxExecutorOptions>;
  private activeSandboxes: TTLMap<string, SandboxContext>;

  constructor(options: SandboxExecutorOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };

    // Initialize TTLMap with automatic cleanup
    this.activeSandboxes = new TTLMap<string, SandboxContext>({
      ttlMs: this.options.sandboxTTLMs,
      cleanupIntervalMs: this.options.cleanupIntervalMs,
      maxSize: 1000, // Prevent unbounded growth
      touchOnGet: true, // Extend TTL when sandbox is accessed
      name: 'SandboxExecutor.activeSandboxes',
      onExpire: (sandboxId, context) => {
        logger.info('Sandbox expired and cleaned up automatically', { sandboxId });
      },
    });
  }

  /**
   * Exécute du SQL dans un environnement sandbox
   */
  async execute(sql: string): Promise<SandboxResult> {
    const sandboxId = this.generateSandboxId();
    const startTime = Date.now();

    logger.info('Executing SQL in sandbox', { sandboxId });

    try {
      // 1. Valider le SQL
      const validationResult = this.validateSQL(sql);

      if (!validationResult.isValid) {
        return {
          success: false,
          executionTime: Date.now() - startTime,
          affectedRows: 0,
          errors: validationResult.errors,
          warnings: [],
        };
      }

      // 2. Créer le contexte sandbox
      const context = await this.createSandboxContext(sandboxId);

      // 3. Réécrire le SQL pour le sandbox
      const sandboxedSQL = this.rewriteForSandbox(sql, context.schemaName);

      // 4. Exécuter le SQL
      const result = await this.executeSQL(sandboxedSQL, context);

      // 5. Capturer le schéma résultant si activé
      let schema: Schema | undefined;

      if (this.options.captureSchema && result.success) {
        schema = await this.captureSchema(context);
      }

      // 6. Planifier le nettoyage
      this.scheduleCleanup(sandboxId);

      return {
        success: result.success,
        executionTime: Date.now() - startTime,
        affectedRows: result.rowCount,
        errors: result.error ? [result.error] : [],
        warnings: result.warnings,
        schema,
      };
    } catch (error) {
      logger.error('Sandbox execution failed', { sandboxId, error });

      return {
        success: false,
        executionTime: Date.now() - startTime,
        affectedRows: 0,
        errors: [this.parseError(error)],
        warnings: [],
      };
    }
  }

  /**
   * Teste une migration sans l'appliquer
   */
  async testMigration(migration: Migration): Promise<MigrationTestResult> {
    logger.info('Testing migration', { id: migration.id });

    const startTime = Date.now();

    // 1. Tester UP
    const upResult = await this.execute(migration.up);

    if (!upResult.success) {
      return {
        success: false,
        phase: 'up',
        error: upResult.errors[0],
      };
    }

    // 2. Tester DOWN pour vérifier la réversibilité
    if (migration.down && migration.down.trim() !== '') {
      const downResult = await this.execute(migration.down);

      if (!downResult.success) {
        return {
          success: false,
          phase: 'down',
          error: downResult.errors[0],
          warning: 'La migration UP fonctionne mais DOWN échoue - migration non réversible',
        };
      }
    }

    return {
      success: true,
      executionTime: Date.now() - startTime,
      schemaAfterUp: upResult.schema,
    };
  }

  /**
   * Teste des requêtes de régression après une migration
   */
  async testRegression(migration: Migration, testQueries: TestQuery[]): Promise<RegressionResult> {
    logger.info('Running regression tests', {
      migrationId: migration.id,
      queryCount: testQueries.length,
    });

    const failures: QueryFailure[] = [];

    // 1. Appliquer la migration en sandbox
    const migrationResult = await this.execute(migration.up);

    if (!migrationResult.success) {
      return {
        success: false,
        migrationFailed: true,
        failures: [],
      };
    }

    // 2. Tester chaque requête
    for (const query of testQueries) {
      const result = await this.execute(query.sql);

      if (!result.success) {
        failures.push({
          query: query.name,
          error: result.errors[0]?.message || 'Unknown error',
          severity: query.critical ? 'critical' : 'warning',
        });
      }
    }

    const hasCriticalFailures = failures.some((f) => f.severity === 'critical');

    return {
      success: !hasCriticalFailures,
      migrationFailed: false,
      failures,
    };
  }

  /**
   * Valide du SQL avant exécution
   */
  validateSQL(sql: string): { isValid: boolean; errors: ExecutionError[] } {
    const errors: ExecutionError[] = [];

    // Vérifier les patterns dangereux
    for (const pattern of DANGEROUS_SANDBOX_PATTERNS) {
      if (pattern.test(sql)) {
        errors.push({
          code: 'DANGEROUS_OPERATION',
          message: `Opération dangereuse détectée: ${pattern.source}`,
          detail: "Cette opération n'est pas autorisée en sandbox",
        });
      }
    }

    // Vérifier les parenthèses équilibrées
    let depth = 0;

    for (const char of sql) {
      if (char === '(') {
        depth++;
      }

      if (char === ')') {
        depth--;
      }

      if (depth < 0) {
        errors.push({
          code: 'SYNTAX_ERROR',
          message: 'Parenthèses non équilibrées',
        });
        break;
      }
    }

    if (depth !== 0 && errors.every((e) => e.code !== 'SYNTAX_ERROR')) {
      errors.push({
        code: 'SYNTAX_ERROR',
        message: 'Parenthèses non équilibrées',
      });
    }

    // Vérifier la longueur maximale
    if (sql.length > 1000000) {
      errors.push({
        code: 'SQL_TOO_LARGE',
        message: `SQL trop volumineux: ${sql.length} caractères (max: 1000000)`,
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Réécrit le SQL pour utiliser le schéma sandbox
   */
  rewriteForSandbox(sql: string, sandboxSchema: string): string {
    // Remplacer les références au schéma public
    let rewritten = sql.replace(/\bpublic\./gi, `${sandboxSchema}.`);

    // Ajouter SET search_path au début
    rewritten = `SET search_path TO ${sandboxSchema}, public;\n\n${rewritten}`;

    return rewritten;
  }

  /**
   * Crée un contexte sandbox
   */
  private async createSandboxContext(sandboxId: string): Promise<SandboxContext> {
    const schemaName = `${this.options.sandboxPrefix}${sandboxId}`;

    const context: SandboxContext = {
      sandboxId,
      schemaName,
      createdAt: new Date(),
      isActive: true,
    };

    this.activeSandboxes.set(sandboxId, context);

    logger.debug('Sandbox context created', { sandboxId, schemaName });

    return context;
  }

  /**
   * Exécute le SQL dans le contexte sandbox
   */
  private async executeSQL(sql: string, context: SandboxContext): Promise<ExecutionResult> {
    const startTime = Date.now();

    /*
     * Simulation d'exécution pour l'environnement de test
     * En production, ceci utiliserait le client Supabase réel
     */

    try {
      // Parser et valider le SQL
      const statements = this.parseStatements(sql);
      let totalRows = 0;
      const warnings: string[] = [];

      for (const statement of statements) {
        if (statement.trim() === '') {
          continue;
        }

        // Simuler l'exécution
        const result = this.simulateExecution(statement);
        totalRows += result.rowCount;
        warnings.push(...result.warnings);
      }

      return {
        success: true,
        rowCount: totalRows,
        duration: Date.now() - startTime,
        warnings,
      };
    } catch (error) {
      return {
        success: false,
        rowCount: 0,
        duration: Date.now() - startTime,
        warnings: [],
        error: this.parseError(error),
      };
    }
  }

  /**
   * Simule l'exécution d'un statement SQL
   */
  private simulateExecution(statement: string): { rowCount: number; warnings: string[] } {
    const warnings: string[] = [];
    let rowCount = 0;

    const upperStatement = statement.toUpperCase();

    // Estimer le nombre de lignes affectées selon le type d'opération
    if (upperStatement.includes('CREATE TABLE')) {
      rowCount = 0;
    } else if (upperStatement.includes('ALTER TABLE')) {
      rowCount = 0;
    } else if (upperStatement.includes('INSERT')) {
      /*
       * Compter les tuples de VALUES
       * D'abord trouver la clause VALUES, puis compter les tuples (séparés par des virgules)
       */
      const valuesIndex = upperStatement.indexOf('VALUES');

      if (valuesIndex !== -1) {
        const valuesClause = statement.slice(valuesIndex);

        // Compter les parenthèses ouvrantes de tuples (après VALUES ou après une virgule)
        const tupleMatches = valuesClause.match(/\(\s*'/g) || valuesClause.match(/\(/g);
        rowCount = tupleMatches ? tupleMatches.length : 1;
      } else {
        rowCount = 1;
      }
    } else if (upperStatement.includes('UPDATE')) {
      rowCount = 1; // Estimation
    } else if (upperStatement.includes('DELETE')) {
      rowCount = 1; // Estimation
    } else if (upperStatement.includes('DROP')) {
      rowCount = 0;
      warnings.push('Opération DROP détectée');
    }

    // Détecter les opérations potentiellement lentes
    if (upperStatement.includes('ALTER TABLE') && upperStatement.includes('ADD COLUMN')) {
      if (upperStatement.includes('NOT NULL') && !upperStatement.includes('DEFAULT')) {
        warnings.push('ADD COLUMN NOT NULL sans DEFAULT peut échouer sur une table non vide');
      }
    }

    return { rowCount, warnings };
  }

  /**
   * Parse les statements SQL
   */
  private parseStatements(sql: string): string[] {
    // Split par point-virgule en tenant compte des quotes
    const statements: string[] = [];
    let current = '';
    let inQuote = false;
    let quoteChar = '';

    for (let i = 0; i < sql.length; i++) {
      const char = sql[i];

      if ((char === "'" || char === '"') && sql[i - 1] !== '\\') {
        if (!inQuote) {
          inQuote = true;
          quoteChar = char;
        } else if (char === quoteChar) {
          inQuote = false;
          quoteChar = '';
        }
      }

      if (char === ';' && !inQuote) {
        statements.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    if (current.trim()) {
      statements.push(current.trim());
    }

    return statements.filter((s) => s.length > 0);
  }

  /**
   * Capture le schéma résultant du sandbox
   */
  private async captureSchema(context: SandboxContext): Promise<Schema> {
    /*
     * En production, ceci interrogerait le schéma réel
     * Pour l'instant, retourner un schéma vide
     */

    return {
      tables: [],
      rls: [],
      functions: [],
      triggers: [],
      indexes: [],
      enums: [],
    };
  }

  /**
   * Planifie le nettoyage du sandbox
   */
  private scheduleCleanup(sandboxId: string): void {
    setTimeout(() => {
      this.cleanup(sandboxId);
    }, this.options.cleanupDelay);
  }

  /**
   * Nettoie un sandbox
   */
  async cleanup(sandboxId: string): Promise<void> {
    const context = this.activeSandboxes.get(sandboxId);

    if (!context) {
      return;
    }

    logger.debug('Cleaning up sandbox', { sandboxId });

    try {
      /*
       * En production, supprimer le schéma sandbox
       * await this.executeSQL(`DROP SCHEMA IF EXISTS ${context.schemaName} CASCADE`);
       */

      context.isActive = false;
      this.activeSandboxes.delete(sandboxId);

      logger.debug('Sandbox cleaned up', { sandboxId });
    } catch (error) {
      logger.error('Failed to cleanup sandbox', { sandboxId, error });
    }
  }

  /**
   * Nettoie tous les sandboxes actifs
   */
  async cleanupAll(): Promise<void> {
    logger.info('Cleaning up all sandboxes', { count: this.activeSandboxes.size });

    const promises = Array.from(this.activeSandboxes.keys()).map((id) => this.cleanup(id));
    await Promise.all(promises);
  }

  /**
   * Dispose resources and stop cleanup timers
   */
  dispose(): void {
    logger.info('Disposing SandboxExecutor');
    this.activeSandboxes.dispose();
  }

  /**
   * Get statistics about sandbox usage
   */
  getStats() {
    return this.activeSandboxes.getStats();
  }

  /**
   * Génère un ID de sandbox unique
   */
  private generateSandboxId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 10);

    return `${timestamp}_${random}`;
  }

  /**
   * Parse une erreur en ExecutionError
   */
  private parseError(error: unknown): ExecutionError {
    if (error instanceof Error) {
      return {
        code: 'EXECUTION_ERROR',
        message: error.message,
        detail: error.stack,
      };
    }

    return {
      code: 'UNKNOWN_ERROR',
      message: String(error),
    };
  }

  /**
   * Retourne les sandboxes actifs (non expirés)
   */
  getActiveSandboxes(): SandboxContext[] {
    return Array.from(this.activeSandboxes.values()).filter((ctx) => ctx.isActive);
  }

  /**
   * Vérifie si un sandbox est actif
   */
  isSandboxActive(sandboxId: string): boolean {
    const context = this.activeSandboxes.get(sandboxId);
    return context?.isActive ?? false;
  }
}

/*
 * =============================================================================
 * Factory Function
 * =============================================================================
 */

export function createSandboxExecutor(options?: SandboxExecutorOptions): SandboxExecutor {
  return new SandboxExecutor(options);
}
