/**
 * RollbackManager - Gestion des checkpoints et rollbacks
 *
 * Ce module permet de créer des points de sauvegarde avant les opérations
 * critiques et de restaurer l'état en cas d'erreur.
 */

import type { Checkpoint, RollbackResult, Schema, Table, Migration, SchemaDiff } from './types';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('RollbackManager');

/*
 * =============================================================================
 * Types
 * =============================================================================
 */

export interface RollbackManagerOptions {
  maxCheckpoints?: number;
  checkpointTTL?: number; // En millisecondes
  autoCleanup?: boolean;
}

export interface SchemaSnapshot {
  tables: Table[];
  timestamp: Date;
}

// Mock du client Supabase pour les types
export interface SupabaseClient {
  from: (table: string) => {
    select: (columns?: string) => Promise<{ data: unknown[]; error: Error | null }>;
  };
  rpc: (fn: string, params?: Record<string, unknown>) => Promise<{ data: unknown; error: Error | null }>;
}

/*
 * =============================================================================
 * Constantes
 * =============================================================================
 */

const DEFAULT_OPTIONS: Required<RollbackManagerOptions> = {
  maxCheckpoints: 10,
  checkpointTTL: 24 * 60 * 60 * 1000, // 24 heures
  autoCleanup: true,
};

/*
 * =============================================================================
 * RollbackManager Class
 * =============================================================================
 */

export class RollbackManager {
  private checkpoints: Map<string, Checkpoint> = new Map();
  private options: Required<RollbackManagerOptions>;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: RollbackManagerOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };

    if (this.options.autoCleanup) {
      this.startAutoCleanup();
    }

    logger.debug('RollbackManager initialized', { options: this.options });
  }

  /**
   * Crée un checkpoint avant une opération critique
   */
  async createCheckpoint(
    type: Checkpoint['type'],
    tables: string[],
    supabaseClient: SupabaseClient,
  ): Promise<Checkpoint> {
    const checkpointId = this.generateCheckpointId();

    logger.info('Creating checkpoint', { id: checkpointId, type, tables });

    try {
      // Capturer le schéma actuel
      const schema = await this.captureSchema(supabaseClient, tables);

      // Capturer les données si nécessaire
      let data: Record<string, unknown[]> | undefined;

      if (type === 'data' || type === 'full') {
        data = await this.captureData(supabaseClient, tables);
      }

      const checkpoint: Checkpoint = {
        id: checkpointId,
        timestamp: new Date(),
        type,
        tables,
        schema,
        data,
        metadata: {
          createdBy: 'RollbackManager',
          version: '1.0',
        },
      };

      this.checkpoints.set(checkpointId, checkpoint);
      this.pruneOldCheckpoints();

      logger.info('Checkpoint created successfully', {
        id: checkpointId,
        tablesCount: tables.length,
        hasData: !!data,
      });

      return checkpoint;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to create checkpoint', { error: errorMessage });
      throw new Error(`Impossible de créer le checkpoint: ${errorMessage}`);
    }
  }

  /**
   * Restaure à un checkpoint donné
   */
  async rollback(checkpointId: string, supabaseClient: SupabaseClient): Promise<RollbackResult> {
    const checkpoint = this.checkpoints.get(checkpointId);
    const startTime = Date.now();

    if (!checkpoint) {
      throw new Error(`Checkpoint ${checkpointId} non trouvé`);
    }

    logger.warn('Starting rollback', {
      checkpointId,
      timestamp: checkpoint.timestamp,
      type: checkpoint.type,
    });

    try {
      // 1. Capturer l'état actuel pour comparaison
      const currentSchema = await this.captureSchema(supabaseClient, checkpoint.tables);

      // 2. Générer la migration de rollback
      const rollbackMigration = this.generateRollbackMigration(currentSchema, checkpoint.schema);

      // 3. Valider la migration
      const validation = this.validateRollbackMigration(rollbackMigration);

      if (!validation.isValid) {
        throw new Error(`Migration de rollback invalide: ${validation.errors.join(', ')}`);
      }

      // 4. Exécuter le rollback
      await this.executeRollback(supabaseClient, rollbackMigration, checkpoint);

      const duration = Date.now() - startTime;

      logger.info('Rollback completed successfully', {
        checkpointId,
        duration,
        affectedTables: checkpoint.tables,
      });

      return {
        success: true,
        checkpoint,
        duration,
        affectedTables: checkpoint.tables,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logger.error('Rollback failed', {
        checkpointId,
        duration,
        error: errorMessage,
      });

      return {
        success: false,
        checkpoint,
        duration,
        affectedTables: checkpoint.tables,
        error: errorMessage,
      };
    }
  }

  /**
   * Wrapper pour exécuter une opération avec rollback automatique
   */
  async withRollback<T>(
    supabaseClient: SupabaseClient,
    tables: string[],
    operation: () => Promise<T>,
    options: { type?: Checkpoint['type'] } = {},
  ): Promise<T> {
    const checkpoint = await this.createCheckpoint(options.type || 'schema', tables, supabaseClient);

    try {
      const result = await operation();

      logger.debug('Operation completed successfully', { checkpointId: checkpoint.id });

      return result;
    } catch (error) {
      logger.warn('Operation failed, initiating automatic rollback', {
        checkpointId: checkpoint.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      const rollbackResult = await this.rollback(checkpoint.id, supabaseClient);

      if (!rollbackResult.success) {
        logger.error('Automatic rollback also failed', {
          checkpointId: checkpoint.id,
          rollbackError: rollbackResult.error,
        });
        throw new Error(
          `Opération échouée et rollback échoué: ${rollbackResult.error}. ` +
            `Erreur originale: ${error instanceof Error ? error.message : 'Unknown'}`,
        );
      }

      throw error;
    }
  }

  /**
   * Récupère un checkpoint par son ID
   */
  getCheckpoint(checkpointId: string): Checkpoint | undefined {
    return this.checkpoints.get(checkpointId);
  }

  /**
   * Liste tous les checkpoints
   */
  listCheckpoints(): Checkpoint[] {
    return Array.from(this.checkpoints.values()).sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Supprime un checkpoint
   */
  deleteCheckpoint(checkpointId: string): boolean {
    const deleted = this.checkpoints.delete(checkpointId);

    if (deleted) {
      logger.debug('Checkpoint deleted', { checkpointId });
    }

    return deleted;
  }

  /**
   * Nettoie les checkpoints expirés
   */
  cleanupExpired(): number {
    const now = Date.now();
    let deletedCount = 0;

    for (const [id, checkpoint] of this.checkpoints) {
      if (now - checkpoint.timestamp.getTime() > this.options.checkpointTTL) {
        this.checkpoints.delete(id);
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      logger.debug('Expired checkpoints cleaned up', { count: deletedCount });
    }

    return deletedCount;
  }

  /**
   * Arrête le nettoyage automatique
   */
  stopAutoCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /*
   * ===========================================================================
   * Private Methods - Schema Capture
   * ===========================================================================
   */

  /**
   * Capture le schéma actuel des tables
   */
  private async captureSchema(supabaseClient: SupabaseClient, tables: string[]): Promise<Schema> {
    const capturedTables: Table[] = [];

    for (const tableName of tables) {
      try {
        // Récupérer la structure de la table via information_schema
        const { data: columns, error } = await supabaseClient.rpc('get_table_structure', { table_name: tableName });

        if (error) {
          logger.warn('Failed to capture table structure', { table: tableName, error: error.message });
          continue;
        }

        capturedTables.push({
          name: tableName,
          schema: 'public',
          columns: this.parseColumns(columns as Record<string, unknown>[]),
          indexes: [],
          constraints: [],
        });
      } catch (error) {
        logger.warn('Error capturing table', {
          table: tableName,
          error: error instanceof Error ? error.message : 'Unknown',
        });
      }
    }

    return {
      tables: capturedTables,
      rls: [],
      functions: [],
      triggers: [],
      indexes: [],
      enums: [],
    };
  }

  /**
   * Parse les colonnes depuis les données brutes
   */
  private parseColumns(columnsData: Record<string, unknown>[]): Table['columns'] {
    return columnsData.map((col) => ({
      name: String(col.column_name || ''),
      type: this.mapPostgresType(String(col.data_type || 'text')),
      nullable: col.is_nullable === 'YES',
      defaultValue: col.column_default ? String(col.column_default) : undefined,
      isPrimaryKey: col.is_primary_key === true,
      isForeignKey: col.is_foreign_key === true,
      isUnique: col.is_unique === true,
    }));
  }

  /**
   * Mappe un type PostgreSQL au type défini
   */
  private mapPostgresType(pgType: string): Table['columns'][0]['type'] {
    const typeMap: Record<string, Table['columns'][0]['type']> = {
      uuid: 'uuid',
      text: 'text',
      'character varying': 'varchar',
      integer: 'int4',
      bigint: 'int8',
      smallint: 'int2',
      real: 'float4',
      'double precision': 'float8',
      numeric: 'numeric',
      boolean: 'bool',
      date: 'date',
      'time without time zone': 'time',
      'timestamp without time zone': 'timestamp',
      'timestamp with time zone': 'timestamptz',
      json: 'json',
      jsonb: 'jsonb',
    };

    return typeMap[pgType.toLowerCase()] || 'text';
  }

  /**
   * Capture les données des tables
   */
  private async captureData(supabaseClient: SupabaseClient, tables: string[]): Promise<Record<string, unknown[]>> {
    const data: Record<string, unknown[]> = {};

    for (const tableName of tables) {
      try {
        const { data: tableData, error } = await supabaseClient.from(tableName).select('*');

        if (error) {
          logger.warn('Failed to capture table data', { table: tableName, error: error.message });
          continue;
        }

        data[tableName] = tableData || [];
      } catch (error) {
        logger.warn('Error capturing table data', {
          table: tableName,
          error: error instanceof Error ? error.message : 'Unknown',
        });
      }
    }

    return data;
  }

  /*
   * ===========================================================================
   * Private Methods - Rollback Generation
   * ===========================================================================
   */

  /**
   * Génère une migration de rollback
   */
  private generateRollbackMigration(current: Schema, target: Schema): Migration {
    const diff = this.diffSchemas(current, target);
    const upSQL = this.generateRollbackSQL(diff);
    const downSQL = this.generateForwardSQL(diff);

    return {
      id: this.generateCheckpointId(),
      name: `rollback_${Date.now()}`,
      timestamp: Date.now(),
      up: upSQL,
      down: downSQL,
      checksum: this.generateChecksum(upSQL + downSQL),
    };
  }

  /**
   * Compare deux schémas et retourne les différences
   */
  private diffSchemas(current: Schema, target: Schema): SchemaDiff {
    const currentTableNames = new Set(current.tables.map((t) => t.name));
    const targetTableNames = new Set(target.tables.map((t) => t.name));

    // Tables ajoutées (dans current mais pas dans target = à supprimer pour rollback)
    const addedTables = current.tables.filter((t) => !targetTableNames.has(t.name));

    // Tables supprimées (dans target mais pas dans current = à recréer pour rollback)
    const removedTables = target.tables.filter((t) => !currentTableNames.has(t.name));

    // Tables modifiées
    const modifiedTables = [];

    for (const currentTable of current.tables) {
      const targetTable = target.tables.find((t) => t.name === currentTable.name);

      if (targetTable) {
        const tableDiff = this.diffTables(currentTable, targetTable);

        if (tableDiff.hasChanges) {
          modifiedTables.push(tableDiff.diff);
        }
      }
    }

    return {
      addedTables,
      removedTables,
      modifiedTables,
      addedPolicies: [],
      removedPolicies: [],
      modifiedPolicies: [],
      addedFunctions: [],
      removedFunctions: [],
    };
  }

  /**
   * Compare deux tables
   */
  private diffTables(
    current: Table,
    target: Table,
  ): {
    hasChanges: boolean;
    diff: SchemaDiff['modifiedTables'][0];
  } {
    const currentColNames = new Set(current.columns.map((c) => c.name));
    const targetColNames = new Set(target.columns.map((c) => c.name));

    const addedColumns = current.columns.filter((c) => !targetColNames.has(c.name));
    const removedColumns = target.columns.filter((c) => !currentColNames.has(c.name));

    // Colonnes modifiées
    const modifiedColumns = [];

    for (const currentCol of current.columns) {
      const targetCol = target.columns.find((c) => c.name === currentCol.name);

      if (targetCol && this.isColumnModified(currentCol, targetCol)) {
        modifiedColumns.push({
          name: currentCol.name,
          before: currentCol,
          after: targetCol,
        });
      }
    }

    const hasChanges = addedColumns.length > 0 || removedColumns.length > 0 || modifiedColumns.length > 0;

    return {
      hasChanges,
      diff: {
        table: current.name,
        addedColumns,
        removedColumns,
        modifiedColumns,
        addedIndexes: [],
        removedIndexes: [],
      },
    };
  }

  /**
   * Vérifie si une colonne a été modifiée
   */
  private isColumnModified(current: Table['columns'][0], target: Table['columns'][0]): boolean {
    return (
      current.type !== target.type ||
      current.nullable !== target.nullable ||
      current.defaultValue !== target.defaultValue
    );
  }

  /**
   * Génère le SQL pour le rollback
   */
  private generateRollbackSQL(diff: SchemaDiff): string {
    const statements: string[] = [];

    // Supprimer les tables ajoutées
    for (const table of diff.addedTables) {
      statements.push(`DROP TABLE IF EXISTS ${table.name} CASCADE;`);
    }

    // Recréer les tables supprimées
    for (const table of diff.removedTables) {
      statements.push(this.generateCreateTableSQL(table));
    }

    // Modifier les tables
    for (const tableDiff of diff.modifiedTables) {
      // Supprimer les colonnes ajoutées
      for (const col of tableDiff.addedColumns) {
        statements.push(`ALTER TABLE ${tableDiff.table} DROP COLUMN IF EXISTS ${col.name};`);
      }

      // Recréer les colonnes supprimées
      for (const col of tableDiff.removedColumns) {
        statements.push(`ALTER TABLE ${tableDiff.table} ADD COLUMN ${this.generateColumnSQL(col)};`);
      }

      // Restaurer les colonnes modifiées
      for (const colDiff of tableDiff.modifiedColumns) {
        if (colDiff.after.type !== colDiff.before.type) {
          statements.push(
            `ALTER TABLE ${tableDiff.table} ALTER COLUMN ${colDiff.name} ` +
              `TYPE ${colDiff.after.type} USING ${colDiff.name}::${colDiff.after.type};`,
          );
        }
      }
    }

    return statements.join('\n');
  }

  /**
   * Génère le SQL forward (inverse du rollback)
   */
  private generateForwardSQL(diff: SchemaDiff): string {
    const statements: string[] = [];

    // Recréer les tables ajoutées
    for (const table of diff.addedTables) {
      statements.push(this.generateCreateTableSQL(table));
    }

    // Supprimer les tables supprimées
    for (const table of diff.removedTables) {
      statements.push(`DROP TABLE IF EXISTS ${table.name} CASCADE;`);
    }

    return statements.join('\n');
  }

  /**
   * Génère le SQL CREATE TABLE
   */
  private generateCreateTableSQL(table: Table): string {
    const columns = table.columns.map((col) => this.generateColumnSQL(col)).join(',\n  ');
    return `CREATE TABLE IF NOT EXISTS ${table.name} (\n  ${columns}\n);`;
  }

  /**
   * Génère le SQL pour une colonne
   */
  private generateColumnSQL(column: Table['columns'][0]): string {
    let sql = `${column.name} ${column.type}`;

    if (!column.nullable) {
      sql += ' NOT NULL';
    }

    if (column.defaultValue) {
      sql += ` DEFAULT ${column.defaultValue}`;
    }

    if (column.isPrimaryKey) {
      sql += ' PRIMARY KEY';
    }

    return sql;
  }

  /**
   * Valide une migration de rollback
   */
  private validateRollbackMigration(migration: Migration): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!migration.up || migration.up.trim().length === 0) {
      errors.push('La migration UP est vide');
    }

    // Vérification basique de la syntaxe
    const dangerousPatterns = [/DROP\s+DATABASE/i, /DROP\s+SCHEMA\s+public/i];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(migration.up)) {
        errors.push(`Pattern dangereux détecté: ${pattern.source}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Exécute le rollback
   */
  private async executeRollback(
    supabaseClient: SupabaseClient,
    migration: Migration,
    checkpoint: Checkpoint,
  ): Promise<void> {
    logger.info('Executing rollback migration', { migrationId: migration.id });

    // Exécuter le SQL de rollback
    const { error } = await supabaseClient.rpc('execute_sql', { sql: migration.up });

    if (error) {
      throw new Error(`Échec de l'exécution du rollback: ${error.message}`);
    }

    // Si le checkpoint inclut des données, les restaurer
    if (checkpoint.data && checkpoint.type !== 'schema') {
      await this.restoreData(supabaseClient, checkpoint.data);
    }
  }

  /**
   * Restaure les données depuis un checkpoint
   */
  private async restoreData(supabaseClient: SupabaseClient, data: Record<string, unknown[]>): Promise<void> {
    for (const [tableName, rows] of Object.entries(data)) {
      if (rows.length === 0) {
        continue;
      }

      logger.debug('Restoring data', { table: tableName, rowCount: rows.length });

      // Vider la table avant de restaurer
      await supabaseClient.rpc('execute_sql', {
        sql: `DELETE FROM ${tableName};`,
      });

      /*
       * Insérer les données
       * Note: Dans une vraie implémentation, utiliser des batches
       */
      for (const row of rows) {
        const columns = Object.keys(row as Record<string, unknown>).join(', ');
        const values = Object.values(row as Record<string, unknown>)
          .map((v) => (typeof v === 'string' ? `'${v}'` : String(v)))
          .join(', ');

        await supabaseClient.rpc('execute_sql', {
          sql: `INSERT INTO ${tableName} (${columns}) VALUES (${values});`,
        });
      }
    }
  }

  /*
   * ===========================================================================
   * Private Methods - Helpers
   * ===========================================================================
   */

  /**
   * Génère un ID unique pour un checkpoint
   */
  private generateCheckpointId(): string {
    return `cp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  /**
   * Génère un checksum pour une chaîne
   */
  private generateChecksum(content: string): string {
    let hash = 0;

    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }

    return Math.abs(hash).toString(16);
  }

  /**
   * Supprime les anciens checkpoints si le maximum est atteint
   */
  private pruneOldCheckpoints(): void {
    if (this.checkpoints.size <= this.options.maxCheckpoints) {
      return;
    }

    const sortedCheckpoints = this.listCheckpoints();
    const toDelete = sortedCheckpoints.slice(this.options.maxCheckpoints);

    for (const checkpoint of toDelete) {
      this.checkpoints.delete(checkpoint.id);
    }

    logger.debug('Old checkpoints pruned', { deletedCount: toDelete.length });
  }

  /**
   * Démarre le nettoyage automatique
   */
  private startAutoCleanup(): void {
    // Nettoyer toutes les heures
    this.cleanupTimer = setInterval(
      () => {
        this.cleanupExpired();
      },
      60 * 60 * 1000,
    );
  }
}

/*
 * =============================================================================
 * Factory Function
 * =============================================================================
 */

export function createRollbackManager(options?: RollbackManagerOptions): RollbackManager {
  return new RollbackManager(options);
}
