/**
 * MigrationGenerator - Génération de migrations de base de données
 *
 * Ce module génère des migrations SQL pour PostgreSQL/Supabase
 * basées sur les différences entre deux versions de schéma.
 */

import type {
  Schema,
  Table,
  Column,
  Index,
  RLSPolicy,
  Migration,
  SchemaDiff,
  TableDiff,
  ColumnDiff,
  PolicyDiff,
  EdgeFunction,
  Trigger,
  EnumType,
} from '../types';
import { createScopedLogger } from '~/utils/logger';
import { createHash } from 'crypto';

const logger = createScopedLogger('MigrationGenerator');

/*
 * =============================================================================
 * Types
 * =============================================================================
 */

export interface MigrationGeneratorOptions {
  schemaName?: string;
  addTimestamps?: boolean;
  generateRollback?: boolean;
  includeDataMigration?: boolean;
}

export interface MigrationResult {
  migration: Migration;
  diff: SchemaDiff;
  warnings: string[];
  isDestructive: boolean;
  affectedTables: string[];
}

export interface DiffOptions {
  ignoreComments?: boolean;
  ignoreDefaults?: boolean;
  caseSensitive?: boolean;
}

/*
 * =============================================================================
 * Constantes
 * =============================================================================
 */

const DEFAULT_OPTIONS: Required<MigrationGeneratorOptions> = {
  schemaName: 'public',
  addTimestamps: true,
  generateRollback: true,
  includeDataMigration: false,
};

/*
 * =============================================================================
 * MigrationGenerator Class
 * =============================================================================
 */

export class MigrationGenerator {
  private options: Required<MigrationGeneratorOptions>;

  constructor(options: MigrationGeneratorOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Génère une migration à partir des différences entre deux schémas
   */
  generate(currentSchema: Schema, targetSchema: Schema, migrationName?: string): MigrationResult {
    logger.info('Generating migration', {
      currentTables: currentSchema.tables.length,
      targetTables: targetSchema.tables.length,
    });

    // 1. Calculer le diff
    const diff = this.computeDiff(currentSchema, targetSchema);

    // 2. Générer le SQL UP
    const upStatements = this.generateUpSQL(diff);

    // 3. Générer le SQL DOWN (rollback)
    const downStatements = this.options.generateRollback ? this.generateDownSQL(diff, currentSchema) : [];

    // 4. Créer la migration
    const timestamp = Date.now();
    const name = migrationName || this.generateMigrationName(diff);
    const upSQL = upStatements.join('\n\n');
    const downSQL = downStatements.join('\n\n');

    const migration: Migration = {
      id: `${timestamp}_${this.slugify(name)}`,
      name,
      timestamp,
      up: upSQL,
      down: downSQL,
      checksum: this.generateChecksum(upSQL),
    };

    // 5. Analyser les impacts
    const warnings = this.analyzeWarnings(diff);
    const isDestructive = this.isDestructiveMigration(diff);
    const affectedTables = this.getAffectedTables(diff);

    logger.info('Migration generated', {
      id: migration.id,
      isDestructive,
      affectedTables: affectedTables.length,
    });

    return { migration, diff, warnings, isDestructive, affectedTables };
  }

  /**
   * Calcule les différences entre deux schémas
   */
  computeDiff(current: Schema, target: Schema, options?: DiffOptions): SchemaDiff {
    const diff: SchemaDiff = {
      addedTables: [],
      removedTables: [],
      modifiedTables: [],
      addedPolicies: [],
      removedPolicies: [],
      modifiedPolicies: [],
      addedFunctions: [],
      removedFunctions: [],
    };

    const currentTableMap = new Map(current.tables.map((t) => [t.name, t]));
    const targetTableMap = new Map(target.tables.map((t) => [t.name, t]));

    // Tables ajoutées
    for (const table of target.tables) {
      if (!currentTableMap.has(table.name)) {
        diff.addedTables.push(table);
      }
    }

    // Tables supprimées
    for (const table of current.tables) {
      if (!targetTableMap.has(table.name)) {
        diff.removedTables.push(table);
      }
    }

    // Tables modifiées
    for (const [name, currentTable] of currentTableMap) {
      const targetTable = targetTableMap.get(name);

      if (targetTable) {
        const tableDiff = this.computeTableDiff(currentTable, targetTable, options);

        if (this.hasTableChanges(tableDiff)) {
          diff.modifiedTables.push(tableDiff);
        }
      }
    }

    // Politiques RLS
    const currentPolicyMap = new Map(current.rls.map((p) => [p.name, p]));
    const targetPolicyMap = new Map(target.rls.map((p) => [p.name, p]));

    for (const policy of target.rls) {
      if (!currentPolicyMap.has(policy.name)) {
        diff.addedPolicies.push(policy);
      }
    }

    for (const policy of current.rls) {
      if (!targetPolicyMap.has(policy.name)) {
        diff.removedPolicies.push(policy);
      }
    }

    for (const [name, currentPolicy] of currentPolicyMap) {
      const targetPolicy = targetPolicyMap.get(name);

      if (targetPolicy && !this.policiesEqual(currentPolicy, targetPolicy)) {
        diff.modifiedPolicies.push({
          name,
          before: currentPolicy,
          after: targetPolicy,
        });
      }
    }

    // Fonctions
    const currentFuncMap = new Map(current.functions.map((f) => [f.name, f]));
    const targetFuncMap = new Map(target.functions.map((f) => [f.name, f]));

    for (const func of target.functions) {
      if (!currentFuncMap.has(func.name)) {
        diff.addedFunctions.push(func);
      }
    }

    for (const func of current.functions) {
      if (!targetFuncMap.has(func.name)) {
        diff.removedFunctions.push(func);
      }
    }

    return diff;
  }

  /**
   * Calcule les différences entre deux tables
   */
  private computeTableDiff(current: Table, target: Table, options?: DiffOptions): TableDiff {
    const diff: TableDiff = {
      table: current.name,
      addedColumns: [],
      removedColumns: [],
      modifiedColumns: [],
      addedIndexes: [],
      removedIndexes: [],
    };

    const currentColMap = new Map(current.columns.map((c) => [c.name, c]));
    const targetColMap = new Map(target.columns.map((c) => [c.name, c]));

    // Colonnes ajoutées
    for (const col of target.columns) {
      if (!currentColMap.has(col.name)) {
        diff.addedColumns.push(col);
      }
    }

    // Colonnes supprimées
    for (const col of current.columns) {
      if (!targetColMap.has(col.name)) {
        diff.removedColumns.push(col);
      }
    }

    // Colonnes modifiées
    for (const [name, currentCol] of currentColMap) {
      const targetCol = targetColMap.get(name);

      if (targetCol && !this.columnsEqual(currentCol, targetCol, options)) {
        diff.modifiedColumns.push({
          name,
          before: currentCol,
          after: targetCol,
        });
      }
    }

    // Indexes
    const currentIdxMap = new Map(current.indexes.map((i) => [i.name, i]));
    const targetIdxMap = new Map(target.indexes.map((i) => [i.name, i]));

    for (const idx of target.indexes) {
      if (!currentIdxMap.has(idx.name)) {
        diff.addedIndexes.push(idx);
      }
    }

    for (const idx of current.indexes) {
      if (!targetIdxMap.has(idx.name)) {
        diff.removedIndexes.push(idx);
      }
    }

    return diff;
  }

  /**
   * Génère le SQL UP (application des changements)
   */
  private generateUpSQL(diff: SchemaDiff): string[] {
    const statements: string[] = [];

    // 1. Créer les nouvelles tables
    for (const table of diff.addedTables) {
      statements.push(this.generateCreateTableSQL(table));
    }

    // 2. Modifier les tables existantes
    for (const tableDiff of diff.modifiedTables) {
      // Ajouter les nouvelles colonnes
      for (const col of tableDiff.addedColumns) {
        statements.push(this.generateAddColumnSQL(tableDiff.table, col));
      }

      // Modifier les colonnes existantes
      for (const colDiff of tableDiff.modifiedColumns) {
        statements.push(this.generateAlterColumnSQL(tableDiff.table, colDiff));
      }

      // Supprimer les colonnes
      for (const col of tableDiff.removedColumns) {
        statements.push(this.generateDropColumnSQL(tableDiff.table, col.name));
      }

      // Ajouter les indexes
      for (const idx of tableDiff.addedIndexes) {
        statements.push(this.generateCreateIndexSQL(idx));
      }

      // Supprimer les indexes
      for (const idx of tableDiff.removedIndexes) {
        statements.push(`DROP INDEX IF EXISTS ${idx.name};`);
      }
    }

    // 3. Supprimer les tables (en dernier)
    for (const table of diff.removedTables) {
      statements.push(`DROP TABLE IF EXISTS ${table.name} CASCADE;`);
    }

    // 4. Gérer les politiques RLS
    for (const policy of diff.removedPolicies) {
      statements.push(`DROP POLICY IF EXISTS "${policy.name}" ON ${policy.table};`);
    }

    for (const policy of diff.addedPolicies) {
      statements.push(this.generateCreatePolicySQL(policy));
    }

    for (const policyDiff of diff.modifiedPolicies) {
      statements.push(`DROP POLICY IF EXISTS "${policyDiff.name}" ON ${policyDiff.after.table};`);
      statements.push(this.generateCreatePolicySQL(policyDiff.after as RLSPolicy));
    }

    // 5. Gérer les fonctions
    for (const func of diff.removedFunctions) {
      statements.push(`DROP FUNCTION IF EXISTS ${func.name} CASCADE;`);
    }

    for (const func of diff.addedFunctions) {
      statements.push(this.generateCreateFunctionSQL(func));
    }

    return statements;
  }

  /**
   * Génère le SQL DOWN (rollback)
   */
  private generateDownSQL(diff: SchemaDiff, originalSchema: Schema): string[] {
    const statements: string[] = [];

    // Inverser les opérations

    // 1. Recréer les tables supprimées
    for (const table of diff.removedTables) {
      statements.push(this.generateCreateTableSQL(table));
    }

    // 2. Inverser les modifications de tables
    for (const tableDiff of diff.modifiedTables) {
      // Supprimer les colonnes ajoutées
      for (const col of tableDiff.addedColumns) {
        statements.push(this.generateDropColumnSQL(tableDiff.table, col.name));
      }

      // Restaurer les colonnes supprimées
      for (const col of tableDiff.removedColumns) {
        statements.push(this.generateAddColumnSQL(tableDiff.table, col));
      }

      // Restaurer les colonnes modifiées
      for (const colDiff of tableDiff.modifiedColumns) {
        const reverseDiff: ColumnDiff = {
          name: colDiff.name,
          before: colDiff.after,
          after: colDiff.before,
        };
        statements.push(this.generateAlterColumnSQL(tableDiff.table, reverseDiff));
      }

      // Inverser les indexes
      for (const idx of tableDiff.addedIndexes) {
        statements.push(`DROP INDEX IF EXISTS ${idx.name};`);
      }

      for (const idx of tableDiff.removedIndexes) {
        statements.push(this.generateCreateIndexSQL(idx));
      }
    }

    // 3. Supprimer les tables ajoutées
    for (const table of diff.addedTables) {
      statements.push(`DROP TABLE IF EXISTS ${table.name} CASCADE;`);
    }

    // 4. Restaurer les politiques
    for (const policy of diff.addedPolicies) {
      statements.push(`DROP POLICY IF EXISTS "${policy.name}" ON ${policy.table};`);
    }

    for (const policy of diff.removedPolicies) {
      statements.push(this.generateCreatePolicySQL(policy));
    }

    for (const policyDiff of diff.modifiedPolicies) {
      statements.push(`DROP POLICY IF EXISTS "${policyDiff.name}" ON ${policyDiff.before.table};`);
      statements.push(this.generateCreatePolicySQL(policyDiff.before as RLSPolicy));
    }

    // 5. Restaurer les fonctions
    for (const func of diff.addedFunctions) {
      statements.push(`DROP FUNCTION IF EXISTS ${func.name} CASCADE;`);
    }

    for (const func of diff.removedFunctions) {
      statements.push(this.generateCreateFunctionSQL(func));
    }

    return statements;
  }

  /**
   * Génère le SQL CREATE TABLE
   */
  private generateCreateTableSQL(table: Table): string {
    const columns: string[] = [];
    const constraints: string[] = [];

    for (const col of table.columns) {
      let colDef = `  ${col.name} ${col.type}`;

      if (!col.nullable) {
        colDef += ' NOT NULL';
      }

      if (col.defaultValue) {
        colDef += ` DEFAULT ${col.defaultValue}`;
      }

      if (col.isPrimaryKey) {
        colDef += ' PRIMARY KEY';
      }

      if (col.isUnique && !col.isPrimaryKey) {
        colDef += ' UNIQUE';
      }

      if (col.check) {
        colDef += ` CHECK (${col.check})`;
      }

      columns.push(colDef);

      // Foreign key constraints
      if (col.isForeignKey && col.references) {
        const fkName = `${table.name}_${col.name}_fkey`;
        let fkDef = `  CONSTRAINT ${fkName} FOREIGN KEY (${col.name}) `;
        fkDef += `REFERENCES ${col.references.table}(${col.references.column})`;

        if (col.references.onDelete) {
          fkDef += ` ON DELETE ${col.references.onDelete}`;
        }

        if (col.references.onUpdate) {
          fkDef += ` ON UPDATE ${col.references.onUpdate}`;
        }

        constraints.push(fkDef);
      }
    }

    let sql = `CREATE TABLE IF NOT EXISTS ${table.name} (\n`;
    sql += [...columns, ...constraints].join(',\n');
    sql += '\n);';

    // Commentaire
    if (table.comment) {
      sql += `\nCOMMENT ON TABLE ${table.name} IS '${this.escapeString(table.comment)}';`;
    }

    // Enable RLS
    sql += `\n\nALTER TABLE ${table.name} ENABLE ROW LEVEL SECURITY;`;

    return sql;
  }

  /**
   * Génère le SQL ADD COLUMN
   */
  private generateAddColumnSQL(tableName: string, col: Column): string {
    let sql = `ALTER TABLE ${tableName} ADD COLUMN ${col.name} ${col.type}`;

    if (!col.nullable) {
      sql += ' NOT NULL';
    }

    if (col.defaultValue) {
      sql += ` DEFAULT ${col.defaultValue}`;
    }

    if (col.isUnique) {
      sql += ' UNIQUE';
    }

    sql += ';';

    // Foreign key
    if (col.isForeignKey && col.references) {
      const fkName = `${tableName}_${col.name}_fkey`;
      sql += `\nALTER TABLE ${tableName} ADD CONSTRAINT ${fkName} `;
      sql += `FOREIGN KEY (${col.name}) REFERENCES ${col.references.table}(${col.references.column})`;

      if (col.references.onDelete) {
        sql += ` ON DELETE ${col.references.onDelete}`;
      }

      sql += ';';
    }

    return sql;
  }

  /**
   * Génère le SQL ALTER COLUMN
   */
  private generateAlterColumnSQL(tableName: string, diff: ColumnDiff): string {
    const statements: string[] = [];
    const before = diff.before as Column;
    const after = diff.after as Column;

    // Changement de type
    if (before.type !== after.type) {
      statements.push(
        `ALTER TABLE ${tableName} ALTER COLUMN ${diff.name} TYPE ${after.type} USING ${diff.name}::${after.type};`,
      );
    }

    // Changement de nullable
    if (before.nullable !== after.nullable) {
      if (after.nullable) {
        statements.push(`ALTER TABLE ${tableName} ALTER COLUMN ${diff.name} DROP NOT NULL;`);
      } else {
        statements.push(`ALTER TABLE ${tableName} ALTER COLUMN ${diff.name} SET NOT NULL;`);
      }
    }

    // Changement de default
    if (before.defaultValue !== after.defaultValue) {
      if (after.defaultValue) {
        statements.push(`ALTER TABLE ${tableName} ALTER COLUMN ${diff.name} SET DEFAULT ${after.defaultValue};`);
      } else {
        statements.push(`ALTER TABLE ${tableName} ALTER COLUMN ${diff.name} DROP DEFAULT;`);
      }
    }

    return statements.join('\n');
  }

  /**
   * Génère le SQL DROP COLUMN
   */
  private generateDropColumnSQL(tableName: string, columnName: string): string {
    return `ALTER TABLE ${tableName} DROP COLUMN IF EXISTS ${columnName};`;
  }

  /**
   * Génère le SQL CREATE INDEX
   */
  private generateCreateIndexSQL(idx: Index): string {
    const unique = idx.isUnique ? 'UNIQUE ' : '';
    const method = idx.method ? ` USING ${idx.method}` : '';
    const where = idx.where ? ` WHERE ${idx.where}` : '';

    return `CREATE ${unique}INDEX IF NOT EXISTS ${idx.name} ON ${idx.table}${method} (${idx.columns.join(', ')})${where};`;
  }

  /**
   * Génère le SQL CREATE POLICY
   */
  private generateCreatePolicySQL(policy: RLSPolicy): string {
    const permissive = policy.permissive ? 'PERMISSIVE' : 'RESTRICTIVE';
    const roles = policy.roles.join(', ');

    let sql = `CREATE POLICY "${policy.name}" ON ${policy.table}\n`;
    sql += `  AS ${permissive}\n`;
    sql += `  FOR ${policy.action}\n`;
    sql += `  TO ${roles}`;

    if (policy.using) {
      sql += `\n  USING (${policy.using})`;
    }

    if (policy.check) {
      sql += `\n  WITH CHECK (${policy.check})`;
    }

    sql += ';';

    return sql;
  }

  /**
   * Génère le SQL CREATE FUNCTION
   */
  private generateCreateFunctionSQL(func: EdgeFunction): string {
    const params = func.parameters
      .map((p) => {
        let param = `${p.name} ${p.type}`;

        if (p.defaultValue) {
          param += ` DEFAULT ${p.defaultValue}`;
        }

        return param;
      })
      .join(', ');

    let sql = `CREATE OR REPLACE FUNCTION ${func.name}(${params})\n`;
    sql += `RETURNS ${func.returnType}\n`;
    sql += `LANGUAGE ${func.language}\n`;
    sql += `SECURITY ${func.security.toUpperCase()}\n`;
    sql += `${func.volatility.toUpperCase()}\n`;
    sql += `AS $$\n${func.body}\n$$;`;

    return sql;
  }

  /*
   * =============================================================================
   * Helpers
   * =============================================================================
   */

  private columnsEqual(a: Column, b: Column, options?: DiffOptions): boolean {
    if (a.type !== b.type) {
      return false;
    }

    if (a.nullable !== b.nullable) {
      return false;
    }

    if (a.isPrimaryKey !== b.isPrimaryKey) {
      return false;
    }

    if (a.isForeignKey !== b.isForeignKey) {
      return false;
    }

    if (a.isUnique !== b.isUnique) {
      return false;
    }

    if (!options?.ignoreDefaults && a.defaultValue !== b.defaultValue) {
      return false;
    }

    if (!options?.ignoreComments && a.comment !== b.comment) {
      return false;
    }

    if (a.references?.table !== b.references?.table) {
      return false;
    }

    if (a.references?.column !== b.references?.column) {
      return false;
    }

    return true;
  }

  private policiesEqual(a: RLSPolicy, b: RLSPolicy): boolean {
    if (a.action !== b.action) {
      return false;
    }

    if (a.using !== b.using) {
      return false;
    }

    if (a.check !== b.check) {
      return false;
    }

    if (a.permissive !== b.permissive) {
      return false;
    }

    if (JSON.stringify(a.roles) !== JSON.stringify(b.roles)) {
      return false;
    }

    return true;
  }

  private hasTableChanges(diff: TableDiff): boolean {
    return (
      diff.addedColumns.length > 0 ||
      diff.removedColumns.length > 0 ||
      diff.modifiedColumns.length > 0 ||
      diff.addedIndexes.length > 0 ||
      diff.removedIndexes.length > 0
    );
  }

  private generateMigrationName(diff: SchemaDiff): string {
    const parts: string[] = [];

    if (diff.addedTables.length > 0) {
      parts.push(`create_${diff.addedTables.map((t) => t.name).join('_')}`);
    }

    if (diff.removedTables.length > 0) {
      parts.push(`drop_${diff.removedTables.map((t) => t.name).join('_')}`);
    }

    if (diff.modifiedTables.length > 0) {
      parts.push(`alter_${diff.modifiedTables.map((t) => t.table).join('_')}`);
    }

    if (diff.addedPolicies.length > 0) {
      parts.push(`add_policies`);
    }

    return parts.length > 0 ? parts.join('_and_') : 'schema_update';
  }

  private generateChecksum(sql: string): string {
    return createHash('sha256').update(sql).digest('hex').slice(0, 16);
  }

  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
  }

  private escapeString(str: string): string {
    return str.replace(/'/g, "''");
  }

  private analyzeWarnings(diff: SchemaDiff): string[] {
    const warnings: string[] = [];

    // Tables supprimées
    if (diff.removedTables.length > 0) {
      warnings.push(
        `⚠️ ${diff.removedTables.length} table(s) seront supprimées: ${diff.removedTables.map((t) => t.name).join(', ')}`,
      );
    }

    // Colonnes supprimées
    for (const tableDiff of diff.modifiedTables) {
      if (tableDiff.removedColumns.length > 0) {
        warnings.push(
          `⚠️ Colonnes supprimées de ${tableDiff.table}: ${tableDiff.removedColumns.map((c) => c.name).join(', ')}`,
        );
      }
    }

    // Changements de type potentiellement dangereux
    for (const tableDiff of diff.modifiedTables) {
      for (const colDiff of tableDiff.modifiedColumns) {
        const before = colDiff.before as Column;
        const after = colDiff.after as Column;

        if (before.type !== after.type) {
          warnings.push(`⚠️ Changement de type ${tableDiff.table}.${colDiff.name}: ${before.type} → ${after.type}`);
        }
      }
    }

    return warnings;
  }

  private isDestructiveMigration(diff: SchemaDiff): boolean {
    if (diff.removedTables.length > 0) {
      return true;
    }

    for (const tableDiff of diff.modifiedTables) {
      if (tableDiff.removedColumns.length > 0) {
        return true;
      }
    }

    return false;
  }

  private getAffectedTables(diff: SchemaDiff): string[] {
    const tables = new Set<string>();

    diff.addedTables.forEach((t) => tables.add(t.name));
    diff.removedTables.forEach((t) => tables.add(t.name));
    diff.modifiedTables.forEach((t) => tables.add(t.table));
    diff.addedPolicies.forEach((p) => tables.add(p.table));
    diff.removedPolicies.forEach((p) => tables.add(p.table));
    diff.modifiedPolicies.forEach((p) => tables.add(p.after.table as string));

    return Array.from(tables);
  }

  /**
   * Génère une migration vide (pour les migrations manuelles)
   */
  createEmptyMigration(name: string): Migration {
    const timestamp = Date.now();

    return {
      id: `${timestamp}_${this.slugify(name)}`,
      name,
      timestamp,
      up: '-- Add your migration SQL here',
      down: '-- Add rollback SQL here',
      checksum: '',
    };
  }

  /**
   * Valide qu'une migration peut être annulée
   */
  validateRollback(migration: Migration): { isValid: boolean; issues: string[] } {
    const issues: string[] = [];

    if (!migration.down || migration.down.trim() === '') {
      issues.push("Migration n'a pas de SQL DOWN défini");
    }

    if (migration.down === '-- Add rollback SQL here') {
      issues.push('Migration DOWN est vide (placeholder)');
    }

    // Vérifier les opérations non-réversibles
    const nonReversible = ['TRUNCATE', 'DROP DATABASE', 'DROP SCHEMA'];

    for (const keyword of nonReversible) {
      if (migration.up.toUpperCase().includes(keyword)) {
        issues.push(`Opération non-réversible détectée: ${keyword}`);
      }
    }

    return {
      isValid: issues.length === 0,
      issues,
    };
  }
}

/*
 * =============================================================================
 * Factory Function
 * =============================================================================
 */

export function createMigrationGenerator(options?: MigrationGeneratorOptions): MigrationGenerator {
  return new MigrationGenerator(options);
}
