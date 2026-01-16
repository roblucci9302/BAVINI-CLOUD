/**
 * TypeGenerator - Génération de types TypeScript depuis un schéma PostgreSQL
 *
 * Ce module génère des interfaces et types TypeScript compatibles avec Supabase
 * à partir d'un schéma de base de données.
 */

import type { Schema, Table, Column, PostgresType } from '../types';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('TypeGenerator');

/*
 * =============================================================================
 * Types
 * =============================================================================
 */

export interface TypeGeneratorOptions {
  generateInsertTypes?: boolean;
  generateUpdateTypes?: boolean;
  generateEnums?: boolean;
  exportFormat?: 'named' | 'default';
  nullableOptional?: boolean;
  dateAsString?: boolean;
  jsonAsUnknown?: boolean;
}

export interface GeneratedTypes {
  content: string;
  tables: string[];
  typeCount: number;
}

/*
 * =============================================================================
 * Constantes
 * =============================================================================
 */

const DEFAULT_OPTIONS: Required<TypeGeneratorOptions> = {
  generateInsertTypes: true,
  generateUpdateTypes: true,
  generateEnums: true,
  exportFormat: 'named',
  nullableOptional: true,
  dateAsString: false,
  jsonAsUnknown: false,
};

const PG_TO_TS_MAP: Record<PostgresType, string> = {
  uuid: 'string',
  text: 'string',
  varchar: 'string',
  int2: 'number',
  int4: 'number',
  int8: 'number',
  float4: 'number',
  float8: 'number',
  numeric: 'number',
  bool: 'boolean',
  date: 'string',
  time: 'string',
  timestamp: 'string',
  timestamptz: 'string',
  interval: 'string',
  json: 'Json',
  jsonb: 'Json',
  bytea: 'string',
  inet: 'string',
  cidr: 'string',
  macaddr: 'string',
  tsvector: 'string',
  tsquery: 'string',
  point: 'string',
  line: 'string',
  lseg: 'string',
  box: 'string',
  path: 'string',
  polygon: 'string',
  circle: 'string',
};

/*
 * =============================================================================
 * TypeGenerator Class
 * =============================================================================
 */

export class TypeGenerator {
  private options: Required<TypeGeneratorOptions>;

  constructor(options: TypeGeneratorOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  generate(schema: Schema): GeneratedTypes {
    logger.info('Generating TypeScript types', { tableCount: schema.tables.length });

    const lines: string[] = [];
    let typeCount = 0;

    lines.push('/**');
    lines.push(' * Types générés automatiquement depuis le schéma de base de données');
    lines.push(' * NE PAS MODIFIER MANUELLEMENT');
    lines.push(' * ');
    lines.push(` * Généré le: ${new Date().toISOString()}`);
    lines.push(' */');
    lines.push('');

    lines.push('export type Json =');
    lines.push('  | string');
    lines.push('  | number');
    lines.push('  | boolean');
    lines.push('  | null');
    lines.push('  | { [key: string]: Json | undefined }');
    lines.push('  | Json[]');
    lines.push('');
    typeCount++;

    if (this.options.generateEnums && schema.enums.length > 0) {
      lines.push('// Enums');

      for (const enumType of schema.enums) {
        lines.push(this.generateEnum(enumType));
        typeCount++;
      }
      lines.push('');
    }

    lines.push('// Tables');

    for (const table of schema.tables) {
      lines.push(this.generateTableTypes(table));
      typeCount += this.options.generateInsertTypes ? 2 : 1;
      typeCount += this.options.generateUpdateTypes ? 1 : 0;
    }

    lines.push(this.generateDatabaseInterface(schema));
    typeCount++;

    lines.push(this.generateHelperTypes(schema));
    typeCount += 3;

    logger.info('TypeScript types generated', { tableCount: schema.tables.length, typeCount });

    return {
      content: lines.join('\n'),
      tables: schema.tables.map((t) => t.name),
      typeCount,
    };
  }

  private generateTableTypes(table: Table): string {
    const lines: string[] = [];
    const pascalName = this.toPascalCase(table.name);

    lines.push(`export interface ${pascalName}Row {`);

    for (const column of table.columns) {
      const tsType = this.getTypeScriptType(column);
      const optional = this.options.nullableOptional && column.nullable ? '?' : '';
      const nullSuffix = column.nullable && !this.options.nullableOptional ? ' | null' : '';
      lines.push(`  ${column.name}${optional}: ${tsType}${nullSuffix};`);
    }
    lines.push('}');
    lines.push('');

    if (this.options.generateInsertTypes) {
      lines.push(`export interface ${pascalName}Insert {`);

      for (const column of table.columns) {
        const tsType = this.getTypeScriptType(column);
        const optional = this.isOptionalForInsert(column) ? '?' : '';
        const nullSuffix = column.nullable ? ' | null' : '';
        lines.push(`  ${column.name}${optional}: ${tsType}${nullSuffix};`);
      }
      lines.push('}');
      lines.push('');
    }

    if (this.options.generateUpdateTypes) {
      lines.push(`export interface ${pascalName}Update {`);

      for (const column of table.columns) {
        const tsType = this.getTypeScriptType(column);
        const nullSuffix = column.nullable ? ' | null' : '';
        lines.push(`  ${column.name}?: ${tsType}${nullSuffix};`);
      }
      lines.push('}');
      lines.push('');
    }

    return lines.join('\n');
  }

  private generateDatabaseInterface(schema: Schema): string {
    const lines: string[] = [];

    lines.push('export interface Database {');
    lines.push('  public: {');
    lines.push('    Tables: {');

    for (const table of schema.tables) {
      const pascalName = this.toPascalCase(table.name);
      lines.push(`      ${table.name}: {`);
      lines.push(`        Row: ${pascalName}Row;`);

      if (this.options.generateInsertTypes) {
        lines.push(`        Insert: ${pascalName}Insert;`);
      }

      if (this.options.generateUpdateTypes) {
        lines.push(`        Update: ${pascalName}Update;`);
      }

      const relationships = this.getTableRelationships(table);

      if (relationships.length > 0) {
        lines.push('        Relationships: [');

        for (const rel of relationships) {
          lines.push(`          {`);
          lines.push(`            foreignKeyName: "${rel.constraintName}";`);
          lines.push(`            columns: ["${rel.column}"];`);
          lines.push(`            referencedRelation: "${rel.referencedTable}";`);
          lines.push(`            referencedColumns: ["${rel.referencedColumn}"];`);
          lines.push(`          },`);
        }
        lines.push('        ];');
      } else {
        lines.push('        Relationships: [];');
      }

      lines.push('      };');
    }

    lines.push('    };');
    lines.push('    Views: { [_ in never]: never; };');
    lines.push('    Functions: { [_ in never]: never; };');
    lines.push('    Enums: {');

    for (const enumType of schema.enums) {
      const values = enumType.values.map((v) => `"${v}"`).join(' | ');
      lines.push(`      ${enumType.name}: ${values};`);
    }
    lines.push('    };');
    lines.push('    CompositeTypes: { [_ in never]: never; };');
    lines.push('  };');
    lines.push('}');
    lines.push('');

    return lines.join('\n');
  }

  private generateHelperTypes(schema: Schema): string {
    const lines: string[] = [];
    const tableNames = schema.tables.map((t) => `"${t.name}"`).join(' | ');

    lines.push(`export type TableName = ${tableNames || 'never'};`);
    lines.push('');
    lines.push('export type Tables<T extends TableName> = Database["public"]["Tables"][T];');
    lines.push('');
    lines.push('export type TablesRow<T extends TableName> = Tables<T>["Row"];');
    lines.push('');

    if (this.options.generateInsertTypes) {
      lines.push('export type TablesInsert<T extends TableName> = Tables<T>["Insert"];');
      lines.push('');
    }

    if (this.options.generateUpdateTypes) {
      lines.push('export type TablesUpdate<T extends TableName> = Tables<T>["Update"];');
      lines.push('');
    }

    if (schema.enums.length > 0) {
      lines.push('export type Enums<T extends keyof Database["public"]["Enums"]> = Database["public"]["Enums"][T];');
      lines.push('');
    }

    return lines.join('\n');
  }

  private generateEnum(enumType: Schema['enums'][0]): string {
    const lines: string[] = [];
    const pascalName = this.toPascalCase(enumType.name);

    lines.push(`export type ${pascalName} =`);

    for (let i = 0; i < enumType.values.length; i++) {
      const separator = i === enumType.values.length - 1 ? ';' : ' |';
      lines.push(`  | "${enumType.values[i]}"${separator}`);
    }
    lines.push('');

    return lines.join('\n');
  }

  private getTableRelationships(table: Table): Array<{
    constraintName: string;
    column: string;
    referencedTable: string;
    referencedColumn: string;
  }> {
    return table.columns
      .filter((c) => c.references)
      .map((column) => ({
        constraintName: `${table.name}_${column.name}_fkey`,
        column: column.name,
        referencedTable: column.references!.table,
        referencedColumn: column.references!.column,
      }));
  }

  private getTypeScriptType(column: Column): string {
    let tsType = PG_TO_TS_MAP[column.type] || 'unknown';

    if (!this.options.dateAsString && ['date', 'timestamp', 'timestamptz'].includes(column.type)) {
      tsType = 'string';
    }

    if (this.options.jsonAsUnknown && ['json', 'jsonb'].includes(column.type)) {
      tsType = 'unknown';
    }

    return tsType;
  }

  private isOptionalForInsert(column: Column): boolean {
    if (column.defaultValue) {
      return true;
    }

    if (column.nullable) {
      return true;
    }

    if (['id', 'created_at', 'updated_at'].includes(column.name)) {
      return true;
    }

    return false;
  }

  private toPascalCase(str: string): string {
    return str
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('');
  }

  generateFile(schema: Schema): string {
    const generated = this.generate(schema);
    return `// This file is auto-generated. Do not edit manually.\n// Last generated: ${new Date().toISOString()}\n\n${generated.content}`;
  }

  generateZodSchemas(schema: Schema): string {
    const lines: string[] = [];
    lines.push('import { z } from "zod";');
    lines.push('');

    for (const table of schema.tables) {
      const pascalName = this.toPascalCase(table.name);

      lines.push(`export const ${pascalName}InsertSchema = z.object({`);

      for (const column of table.columns) {
        const zodType = this.getZodType(column);
        const optional = this.isOptionalForInsert(column) ? '.optional()' : '';
        const nullable = column.nullable ? '.nullable()' : '';
        lines.push(`  ${column.name}: ${zodType}${optional}${nullable},`);
      }
      lines.push('});');
      lines.push('');

      lines.push(`export const ${pascalName}UpdateSchema = z.object({`);

      for (const column of table.columns) {
        const zodType = this.getZodType(column);
        const nullable = column.nullable ? '.nullable()' : '';
        lines.push(`  ${column.name}: ${zodType}${nullable}.optional(),`);
      }
      lines.push('});');
      lines.push('');

      lines.push(`export type ${pascalName}Insert = z.infer<typeof ${pascalName}InsertSchema>;`);
      lines.push(`export type ${pascalName}Update = z.infer<typeof ${pascalName}UpdateSchema>;`);
      lines.push('');
    }

    return lines.join('\n');
  }

  private getZodType(column: Column): string {
    const typeMap: Record<PostgresType, string> = {
      uuid: 'z.string().uuid()',
      text: 'z.string()',
      varchar: 'z.string()',
      int2: 'z.number().int()',
      int4: 'z.number().int()',
      int8: 'z.number().int()',
      float4: 'z.number()',
      float8: 'z.number()',
      numeric: 'z.number()',
      bool: 'z.boolean()',
      date: 'z.string()',
      time: 'z.string()',
      timestamp: 'z.string()',
      timestamptz: 'z.string()',
      interval: 'z.string()',
      json: 'z.unknown()',
      jsonb: 'z.unknown()',
      bytea: 'z.string()',
      inet: 'z.string()',
      cidr: 'z.string()',
      macaddr: 'z.string()',
      tsvector: 'z.string()',
      tsquery: 'z.string()',
      point: 'z.string()',
      line: 'z.string()',
      lseg: 'z.string()',
      box: 'z.string()',
      path: 'z.string()',
      polygon: 'z.string()',
      circle: 'z.string()',
    };

    if (column.name === 'email') {
      return 'z.string().email()';
    }

    if (column.name.includes('url') || column.name.includes('website')) {
      return 'z.string().url()';
    }

    return typeMap[column.type] || 'z.unknown()';
  }
}

/*
 * =============================================================================
 * Factory Function
 * =============================================================================
 */

export function createTypeGenerator(options?: TypeGeneratorOptions): TypeGenerator {
  return new TypeGenerator(options);
}
