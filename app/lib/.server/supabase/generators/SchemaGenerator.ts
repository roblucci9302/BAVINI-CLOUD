/**
 * SchemaGenerator - Génération de schémas PostgreSQL depuis une description NLP
 *
 * Ce module extrait les entités depuis une description en langage naturel
 * et génère un schéma PostgreSQL complet avec relations et contraintes.
 */

import type {
  Schema,
  Table,
  Column,
  Index,
  Constraint,
  ExtractedEntity,
  ExtractedColumn,
  ExtractedRelation,
  PostgresType,
} from '../types';
import { REQUIRED_COLUMNS } from '../types';
import { NLPValidator, createNLPValidator } from '../validators/NLPValidator';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('SchemaGenerator');

/*
 * =============================================================================
 * Types
 * =============================================================================
 */

export interface SchemaGeneratorOptions {
  addTimestamps?: boolean;
  addSoftDelete?: boolean;
  generateIndexes?: boolean;
  defaultSchema?: string;
  pluralizeTableNames?: boolean;
}

export interface GenerationResult {
  schema: Schema;
  sql: string;
  entities: ExtractedEntity[];
  warnings: string[];
}

export interface EntityExtractionResult {
  entities: ExtractedEntity[];
  confidence: number;
  warnings: string[];
}

/*
 * =============================================================================
 * Constantes
 * =============================================================================
 */

const DEFAULT_OPTIONS: Required<SchemaGeneratorOptions> = {
  addTimestamps: true,
  addSoftDelete: false,
  generateIndexes: true,
  defaultSchema: 'public',
  pluralizeTableNames: true,
};

const ENTITY_KEYWORDS = [
  /(?:une?\s+)?table\s+(?:de\s+|des\s+)?(\w+)/gi,
  /(?:une?\s+)?entité\s+(?:de\s+|des\s+)?(\w+)/gi,
  /(?:les?\s+)?(\w+)\s+(?:ont?|a|possède|contient)/gi,
  /gérer\s+(?:les?\s+)?(\w+)/gi,
  /stocker\s+(?:les?\s+)?(\w+)/gi,
  /(?:créer|ajouter)\s+(?:une?\s+)?(\w+)/gi,
];

const STOP_WORDS = new Set([
  'le',
  'la',
  'les',
  'un',
  'une',
  'des',
  'du',
  'de',
  'et',
  'ou',
  'avec',
  'pour',
  'dans',
  'sur',
  'par',
  'qui',
  'que',
  'quoi',
  'dont',
  'où',
  'ce',
  'cette',
  'ces',
  'son',
  'sa',
  'ses',
  'leur',
  'leurs',
  'je',
  'tu',
  'il',
  'elle',
  'nous',
  'vous',
  'ils',
  'elles',
  'être',
  'avoir',
  'faire',
  'pouvoir',
  'vouloir',
  'devoir',
  'the',
  'a',
  'an',
  'and',
  'or',
  'with',
  'for',
  'in',
  'on',
  'by',
  'this',
  'that',
  'these',
  'those',
  'is',
  'are',
  'was',
  'were',
  'application',
  'système',
  'system',
  'données',
  'data',
  'base',
]);

const COLUMN_PATTERNS = [
  /(?:avec|contenant|incluant)\s+(?:un\s+)?(\w+)/gi,
  /champ(?:s)?\s+(\w+)/gi,
  /colonne(?:s)?\s+(\w+)/gi,
  /attribut(?:s)?\s+(\w+)/gi,
];

const RELATION_INDICATORS = {
  oneToMany: [
    /(\w+)\s+(?:a|ont|possède|contient)\s+(?:plusieurs|many|multiple)\s+(\w+)/gi,
    /(\w+)\s+appartient\s+à\s+(?:un\s+)?(\w+)/gi,
    /(\w+)\s+belongs?\s+to\s+(\w+)/gi,
  ],
  manyToMany: [
    /(\w+)\s+et\s+(\w+)\s+(?:sont\s+)?liés/gi,
    /relation\s+(?:plusieurs\s+à\s+plusieurs|many\s+to\s+many)\s+entre\s+(\w+)\s+et\s+(\w+)/gi,
  ],
};

/*
 * =============================================================================
 * SchemaGenerator Class
 * =============================================================================
 */

export class SchemaGenerator {
  private options: Required<SchemaGeneratorOptions>;
  private nlpValidator: NLPValidator;

  constructor(options: SchemaGeneratorOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.nlpValidator = createNLPValidator();
  }

  async generate(description: string, existingTables?: string[]): Promise<GenerationResult> {
    logger.info('Generating schema from description', { length: description.length });

    const extraction = this.extractEntities(description);
    const validation = await this.nlpValidator.validate(extraction.entities, existingTables);
    const enrichedEntities = this.enrichEntities(extraction.entities);
    const entitiesWithRelations = this.detectRelations(enrichedEntities, description);
    const tables = this.generateTables(entitiesWithRelations);
    const junctionTables = this.generateJunctionTables(entitiesWithRelations);
    tables.push(...junctionTables);

    const indexes = this.options.generateIndexes ? this.generateIndexes(tables) : [];

    const schema: Schema = {
      tables,
      rls: [],
      functions: this.generateHelperFunctions(),
      triggers: this.generateTriggers(tables),
      indexes,
      enums: [],
    };

    const sql = this.generateSQL(schema);
    const warnings = [...extraction.warnings, ...validation.warnings.map((w) => w.message)];

    logger.info('Schema generation complete', { tableCount: tables.length, indexCount: indexes.length });

    return { schema, sql, entities: entitiesWithRelations, warnings };
  }

  extractEntities(description: string): EntityExtractionResult {
    const entities: ExtractedEntity[] = [];
    const warnings: string[] = [];
    const seenNames = new Set<string>();
    const normalizedDesc = description.toLowerCase();

    for (const pattern of ENTITY_KEYWORDS) {
      let match;
      pattern.lastIndex = 0;

      while ((match = pattern.exec(normalizedDesc)) !== null) {
        const rawName = match[1];
        const cleanName = this.cleanEntityName(rawName);

        if (cleanName && !seenNames.has(cleanName) && !STOP_WORDS.has(cleanName)) {
          seenNames.add(cleanName);

          const tableName = this.options.pluralizeTableNames ? this.pluralize(cleanName) : cleanName;
          const columns = this.extractColumnsForEntity(description, rawName);

          entities.push({
            name: cleanName,
            tableName: this.toSnakeCase(tableName),
            description: this.extractEntityDescription(description, rawName),
            columns,
            relations: [],
            source: 'explicit',
          });
        }
      }
    }

    if (entities.length === 0) {
      const inferredEntities = this.inferEntitiesFromNouns(description);
      entities.push(...inferredEntities);

      if (inferredEntities.length > 0) {
        warnings.push('Entités inférées depuis les noms communs (confiance réduite)');
      }
    }

    const confidence =
      entities.length > 0 ? Math.min(100, 70 + entities.filter((e) => e.source === 'explicit').length * 5) : 0;

    logger.debug('Entities extracted', { count: entities.length, confidence });

    return { entities, confidence, warnings };
  }

  private extractColumnsForEntity(description: string, entityName: string): ExtractedColumn[] {
    const columns: ExtractedColumn[] = [];
    const seenColumns = new Set<string>();
    const entityContext = this.getEntityContext(description, entityName);

    for (const pattern of COLUMN_PATTERNS) {
      let match;
      pattern.lastIndex = 0;

      while ((match = pattern.exec(entityContext)) !== null) {
        const columnName = this.toSnakeCase(match[1]);

        if (!seenColumns.has(columnName) && !STOP_WORDS.has(columnName.toLowerCase())) {
          seenColumns.add(columnName);

          const typeInference = this.nlpValidator.inferColumnType(columnName);
          columns.push({
            name: columnName,
            inferredType: typeInference.type,
            isRequired: this.isColumnRequired(columnName),
            isUnique: this.isColumnUnique(columnName),
            source: 'explicit',
            confidence: typeInference.confidence,
          });
        }
      }
    }

    const commonColumns = this.inferCommonColumns(entityName);

    for (const col of commonColumns) {
      if (!seenColumns.has(col.name)) {
        columns.push(col);
      }
    }

    return columns;
  }

  private getEntityContext(description: string, entityName: string): string {
    const lowerDesc = description.toLowerCase();
    const lowerName = entityName.toLowerCase();
    const index = lowerDesc.indexOf(lowerName);

    if (index === -1) {
      return description;
    }

    const start = Math.max(0, index - 100);
    const end = Math.min(description.length, index + entityName.length + 200);

    return description.slice(start, end);
  }

  private inferCommonColumns(entityName: string): ExtractedColumn[] {
    const columns: ExtractedColumn[] = [];
    const name = entityName.toLowerCase();

    if (name.includes('user') || name.includes('utilisateur') || name.includes('membre')) {
      columns.push(
        { name: 'email', inferredType: 'text', isRequired: true, isUnique: true, source: 'inferred', confidence: 90 },
        {
          name: 'full_name',
          inferredType: 'text',
          isRequired: false,
          isUnique: false,
          source: 'inferred',
          confidence: 85,
        },
      );
    }

    if (name.includes('product') || name.includes('produit') || name.includes('article')) {
      columns.push(
        { name: 'name', inferredType: 'text', isRequired: true, isUnique: false, source: 'inferred', confidence: 90 },
        {
          name: 'price',
          inferredType: 'numeric',
          isRequired: true,
          isUnique: false,
          source: 'inferred',
          confidence: 85,
        },
        {
          name: 'description',
          inferredType: 'text',
          isRequired: false,
          isUnique: false,
          source: 'inferred',
          confidence: 80,
        },
      );
    }

    if (name.includes('order') || name.includes('commande')) {
      columns.push(
        {
          name: 'status',
          inferredType: 'varchar',
          isRequired: true,
          isUnique: false,
          source: 'inferred',
          confidence: 90,
        },
        {
          name: 'total',
          inferredType: 'numeric',
          isRequired: true,
          isUnique: false,
          source: 'inferred',
          confidence: 85,
        },
      );
    }

    if (name.includes('post') || name.includes('blog')) {
      columns.push(
        { name: 'title', inferredType: 'text', isRequired: true, isUnique: false, source: 'inferred', confidence: 90 },
        {
          name: 'content',
          inferredType: 'text',
          isRequired: true,
          isUnique: false,
          source: 'inferred',
          confidence: 85,
        },
        {
          name: 'published',
          inferredType: 'bool',
          isRequired: false,
          isUnique: false,
          source: 'inferred',
          confidence: 80,
        },
      );
    }

    if (name.includes('comment') || name.includes('commentaire')) {
      columns.push({
        name: 'content',
        inferredType: 'text',
        isRequired: true,
        isUnique: false,
        source: 'inferred',
        confidence: 90,
      });
    }

    if (name.includes('categor') || name.includes('tag')) {
      columns.push(
        { name: 'name', inferredType: 'varchar', isRequired: true, isUnique: true, source: 'inferred', confidence: 90 },
        { name: 'slug', inferredType: 'varchar', isRequired: true, isUnique: true, source: 'inferred', confidence: 85 },
      );
    }

    return columns;
  }

  private inferEntitiesFromNouns(description: string): ExtractedEntity[] {
    const entities: ExtractedEntity[] = [];
    const words = description.split(/\s+/);
    const potentialEntities = new Set<string>();

    for (const word of words) {
      const clean = word.replace(/[^a-zA-ZàâäéèêëïîôùûüÿçÀÂÄÉÈÊËÏÎÔÙÛÜŸÇ]/g, '').toLowerCase();

      if (clean.length > 3 && !STOP_WORDS.has(clean)) {
        if (clean.endsWith('s') || clean.endsWith('x')) {
          potentialEntities.add(this.singularize(clean));
        }
      }
    }

    for (const name of potentialEntities) {
      const tableName = this.options.pluralizeTableNames ? this.pluralize(name) : name;
      entities.push({
        name,
        tableName: this.toSnakeCase(tableName),
        columns: this.inferCommonColumns(name),
        relations: [],
        source: 'inferred',
      });
    }

    return entities;
  }

  private enrichEntities(entities: ExtractedEntity[]): ExtractedEntity[] {
    return entities.map((entity) => {
      const enrichedColumns = [...entity.columns];
      const existingNames = new Set(entity.columns.map((c) => c.name));

      if (!existingNames.has('id')) {
        enrichedColumns.unshift({
          name: 'id',
          inferredType: REQUIRED_COLUMNS.id.type,
          isRequired: true,
          isUnique: true,
          source: 'default',
          confidence: 100,
        });
      }

      if (this.options.addTimestamps) {
        if (!existingNames.has('created_at')) {
          enrichedColumns.push({
            name: 'created_at',
            inferredType: REQUIRED_COLUMNS.created_at.type,
            isRequired: true,
            isUnique: false,
            source: 'default',
            confidence: 100,
          });
        }

        if (!existingNames.has('updated_at')) {
          enrichedColumns.push({
            name: 'updated_at',
            inferredType: REQUIRED_COLUMNS.updated_at.type,
            isRequired: true,
            isUnique: false,
            source: 'default',
            confidence: 100,
          });
        }
      }

      if (this.options.addSoftDelete && !existingNames.has('deleted_at')) {
        enrichedColumns.push({
          name: 'deleted_at',
          inferredType: 'timestamptz',
          isRequired: false,
          isUnique: false,
          source: 'default',
          confidence: 100,
        });
      }

      return { ...entity, columns: enrichedColumns };
    });
  }

  private detectRelations(entities: ExtractedEntity[], description: string): ExtractedEntity[] {
    const entityNames = new Map(entities.map((e) => [e.name.toLowerCase(), e]));
    const entityTableNames = new Map(entities.map((e) => [e.tableName, e]));

    for (const entity of entities) {
      for (const pattern of RELATION_INDICATORS.oneToMany) {
        let match;
        pattern.lastIndex = 0;

        while ((match = pattern.exec(description)) !== null) {
          const [, source, target] = match;
          const sourceClean = this.cleanEntityName(source);
          const targetClean = this.cleanEntityName(target);

          if (entity.name.toLowerCase() === sourceClean && entityNames.has(targetClean)) {
            const targetEntity = entityNames.get(targetClean)!;
            entity.relations.push({
              type: '1-N',
              targetEntity: targetEntity.tableName,
              foreignKey: `${this.singularize(entity.tableName)}_id`,
              confidence: 85,
            });
          }
        }
      }

      for (const pattern of RELATION_INDICATORS.manyToMany) {
        let match;
        pattern.lastIndex = 0;

        while ((match = pattern.exec(description)) !== null) {
          const [, first, second] = match;
          const firstClean = this.cleanEntityName(first);
          const secondClean = this.cleanEntityName(second);

          if (entity.name.toLowerCase() === firstClean && entityNames.has(secondClean)) {
            const targetEntity = entityNames.get(secondClean)!;
            entity.relations.push({
              type: 'N-N',
              targetEntity: targetEntity.tableName,
              throughTable: `${this.singularize(entity.tableName)}_${this.singularize(targetEntity.tableName)}`,
              foreignKey: `${this.singularize(entity.tableName)}_id`,
              confidence: 80,
            });
          }
        }
      }

      for (const column of entity.columns) {
        if (column.name.endsWith('_id') && column.name !== 'id') {
          const refTableName = column.name.replace(/_id$/, '');
          const pluralRef = this.pluralize(refTableName);

          if (entityTableNames.has(pluralRef)) {
            const exists = entity.relations.some((r) => r.targetEntity === pluralRef && r.foreignKey === column.name);

            if (!exists) {
              entity.relations.push({
                type: '1-N',
                targetEntity: pluralRef,
                foreignKey: column.name,
                confidence: 90,
                description: 'Relation détectée depuis le nom de colonne',
              });
            }
          }
        }
      }
    }

    return entities;
  }

  private generateTables(entities: ExtractedEntity[]): Table[] {
    return entities.map((entity) => {
      const columns: Column[] = entity.columns.map((col) => ({
        name: col.name,
        type: col.inferredType,
        nullable: !col.isRequired,
        defaultValue: this.getDefaultValue(col),
        isPrimaryKey: col.name === 'id',
        isForeignKey: col.name.endsWith('_id') && col.name !== 'id',
        isUnique: col.isUnique,
        references: this.getColumnReference(col, entities),
      }));

      const constraints = this.generateConstraints(entity, columns);

      return {
        name: entity.tableName,
        schema: this.options.defaultSchema,
        columns,
        indexes: [],
        constraints,
        comment: entity.description,
      };
    });
  }

  private generateJunctionTables(entities: ExtractedEntity[]): Table[] {
    const junctionTables: Table[] = [];
    const createdJunctions = new Set<string>();

    for (const entity of entities) {
      for (const relation of entity.relations) {
        if (relation.type === 'N-N' && relation.throughTable) {
          const normalizedName = [entity.tableName, relation.targetEntity].sort().join('_');

          if (createdJunctions.has(normalizedName)) {
            continue;
          }

          createdJunctions.add(normalizedName);

          const fk1 = `${this.singularize(entity.tableName)}_id`;
          const fk2 = `${this.singularize(relation.targetEntity)}_id`;

          junctionTables.push({
            name: relation.throughTable,
            schema: this.options.defaultSchema,
            columns: [
              {
                name: fk1,
                type: 'uuid',
                nullable: false,
                isPrimaryKey: true,
                isForeignKey: true,
                isUnique: false,
                references: { table: entity.tableName, column: 'id', onDelete: 'CASCADE' },
              },
              {
                name: fk2,
                type: 'uuid',
                nullable: false,
                isPrimaryKey: true,
                isForeignKey: true,
                isUnique: false,
                references: { table: relation.targetEntity, column: 'id', onDelete: 'CASCADE' },
              },
              {
                name: 'created_at',
                type: 'timestamptz',
                nullable: false,
                defaultValue: 'now()',
                isPrimaryKey: false,
                isForeignKey: false,
                isUnique: false,
              },
            ],
            indexes: [],
            constraints: [{ name: `${relation.throughTable}_pkey`, type: 'primary', columns: [fk1, fk2] }],
            comment: `Table de jonction ${entity.tableName} <-> ${relation.targetEntity}`,
          });
        }
      }
    }

    return junctionTables;
  }

  private generateIndexes(tables: Table[]): Index[] {
    const indexes: Index[] = [];

    for (const table of tables) {
      for (const column of table.columns) {
        if (column.isForeignKey) {
          indexes.push({
            name: `idx_${table.name}_${column.name}`,
            table: table.name,
            columns: [column.name],
            isUnique: false,
            method: 'btree',
          });
        }
      }

      if (table.columns.some((c) => c.name === 'created_at')) {
        indexes.push({
          name: `idx_${table.name}_created_at`,
          table: table.name,
          columns: ['created_at'],
          isUnique: false,
          method: 'btree',
        });
      }

      for (const column of table.columns) {
        if (column.isUnique && !column.isPrimaryKey) {
          indexes.push({
            name: `idx_${table.name}_${column.name}_unique`,
            table: table.name,
            columns: [column.name],
            isUnique: true,
            method: 'btree',
          });
        }
      }
    }

    return indexes;
  }

  private generateConstraints(entity: ExtractedEntity, columns: Column[]): Constraint[] {
    const constraints: Constraint[] = [];
    const pkColumns = columns.filter((c) => c.isPrimaryKey);

    if (pkColumns.length > 0) {
      constraints.push({ name: `${entity.tableName}_pkey`, type: 'primary', columns: pkColumns.map((c) => c.name) });
    }

    for (const column of columns) {
      if (column.isUnique && !column.isPrimaryKey) {
        constraints.push({ name: `${entity.tableName}_${column.name}_key`, type: 'unique', columns: [column.name] });
      }
    }

    return constraints;
  }

  private generateHelperFunctions(): Schema['functions'] {
    return [
      {
        name: 'update_updated_at_column',
        schema: this.options.defaultSchema,
        language: 'plpgsql',
        returnType: 'trigger',
        parameters: [],
        body: `\nBEGIN\n  NEW.updated_at = CURRENT_TIMESTAMP;\n  RETURN NEW;\nEND;`,
        security: 'definer',
        volatility: 'volatile',
      },
    ];
  }

  private generateTriggers(tables: Table[]): Schema['triggers'] {
    return tables
      .filter((t) => t.columns.some((c) => c.name === 'updated_at'))
      .map((table) => ({
        name: `trigger_${table.name}_updated_at`,
        table: table.name,
        timing: 'before' as const,
        events: ['update'] as 'update'[],
        forEach: 'row' as const,
        function: 'update_updated_at_column',
      }));
  }

  generateSQL(schema: Schema): string {
    const statements: string[] = [];

    statements.push('-- Enable required extensions');
    statements.push('CREATE EXTENSION IF NOT EXISTS "uuid-ossp";');
    statements.push('');

    if (schema.functions.length > 0) {
      statements.push('-- Functions');

      for (const fn of schema.functions) {
        statements.push(this.generateFunctionSQL(fn));
      }
      statements.push('');
    }

    statements.push('-- Tables');

    for (const table of schema.tables) {
      statements.push(this.generateTableSQL(table));
      statements.push('');
    }

    if (schema.indexes.length > 0) {
      statements.push('-- Indexes');

      for (const index of schema.indexes) {
        statements.push(this.generateIndexSQL(index));
      }
      statements.push('');
    }

    if (schema.triggers.length > 0) {
      statements.push('-- Triggers');

      for (const trigger of schema.triggers) {
        statements.push(this.generateTriggerSQL(trigger));
      }
      statements.push('');
    }

    statements.push('-- Enable Row Level Security');

    for (const table of schema.tables) {
      statements.push(`ALTER TABLE ${table.name} ENABLE ROW LEVEL SECURITY;`);
    }

    return statements.join('\n');
  }

  private generateTableSQL(table: Table): string {
    const columnDefs = table.columns.map((col) => {
      let def = `  ${col.name} ${col.type}`;

      if (!col.nullable) {
        def += ' NOT NULL';
      }

      if (col.defaultValue) {
        def += ` DEFAULT ${col.defaultValue}`;
      }

      if (col.references) {
        def += ` REFERENCES ${col.references.table}(${col.references.column})`;

        if (col.references.onDelete) {
          def += ` ON DELETE ${col.references.onDelete}`;
        }
      }

      return def;
    });

    const pkColumns = table.columns.filter((c) => c.isPrimaryKey);

    if (pkColumns.length === 1) {
      const pkIndex = columnDefs.findIndex((d) => d.includes(pkColumns[0].name));

      if (pkIndex !== -1) {
        columnDefs[pkIndex] += ' PRIMARY KEY';
      }
    } else if (pkColumns.length > 1) {
      columnDefs.push(`  PRIMARY KEY (${pkColumns.map((c) => c.name).join(', ')})`);
    }

    let sql = `CREATE TABLE IF NOT EXISTS ${table.name} (\n${columnDefs.join(',\n')}\n);`;

    if (table.comment) {
      sql += `\nCOMMENT ON TABLE ${table.name} IS '${table.comment.replace(/'/g, "''")}';`;
    }

    return sql;
  }

  private generateIndexSQL(index: Index): string {
    const unique = index.isUnique ? 'UNIQUE ' : '';
    const method = index.method ? ` USING ${index.method}` : '';
    const where = index.where ? ` WHERE ${index.where}` : '';

    return `CREATE ${unique}INDEX IF NOT EXISTS ${index.name} ON ${index.table}${method} (${index.columns.join(', ')})${where};`;
  }

  private generateFunctionSQL(fn: Schema['functions'][0]): string {
    const params = fn.parameters.map((p) => `${p.name} ${p.type}`).join(', ');
    return `CREATE OR REPLACE FUNCTION ${fn.name}(${params})\nRETURNS ${fn.returnType}\nLANGUAGE ${fn.language}\nSECURITY ${fn.security.toUpperCase()}\nAS $$${fn.body}\n$$;`;
  }

  private generateTriggerSQL(trigger: Schema['triggers'][0]): string {
    const events = trigger.events.map((e) => e.toUpperCase()).join(' OR ');
    return `CREATE TRIGGER ${trigger.name}\n  ${trigger.timing.toUpperCase()} ${events} ON ${trigger.table}\n  FOR EACH ${trigger.forEach.toUpperCase()}\n  EXECUTE FUNCTION ${trigger.function}();`;
  }

  private getDefaultValue(column: ExtractedColumn): string | undefined {
    if (column.name === 'id') {
      return 'gen_random_uuid()';
    }

    if (column.name === 'created_at' || column.name === 'updated_at') {
      return 'now()';
    }

    if (column.inferredType === 'bool' && !column.isRequired) {
      return 'false';
    }

    return undefined;
  }

  private getColumnReference(column: ExtractedColumn, entities: ExtractedEntity[]): Column['references'] | undefined {
    if (!column.name.endsWith('_id') || column.name === 'id') {
      return undefined;
    }

    const refTableName = this.pluralize(column.name.replace(/_id$/, ''));
    const refEntity = entities.find((e) => e.tableName === refTableName);

    if (refEntity) {
      return { table: refTableName, column: 'id', onDelete: 'CASCADE' };
    }

    return undefined;
  }

  private cleanEntityName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .trim();
  }

  private extractEntityDescription(description: string, entityName: string): string | undefined {
    const pattern = new RegExp(`${entityName}[^.]*\\.`, 'i');
    const match = description.match(pattern);

    return match ? match[0].trim() : undefined;
  }

  private toSnakeCase(str: string): string {
    return str
      .replace(/([A-Z])/g, '_$1')
      .replace(/[-\s]+/g, '_')
      .replace(/^_/, '')
      .toLowerCase()
      .replace(/_+/g, '_');
  }

  private pluralize(word: string): string {
    if (word.endsWith('s') || word.endsWith('x') || word.endsWith('z')) {
      return word;
    }

    if (word.endsWith('y') && !/[aeiou]y$/.test(word)) {
      return word.slice(0, -1) + 'ies';
    }

    if (word.endsWith('ch') || word.endsWith('sh')) {
      return word + 'es';
    }

    return word + 's';
  }

  private singularize(word: string): string {
    if (word.endsWith('ies')) {
      return word.slice(0, -3) + 'y';
    }

    if (word.endsWith('es') && (word.endsWith('ches') || word.endsWith('shes'))) {
      return word.slice(0, -2);
    }

    if (word.endsWith('s') && !word.endsWith('ss')) {
      return word.slice(0, -1);
    }

    return word;
  }

  private isColumnRequired(columnName: string): boolean {
    const requiredPatterns = [/^id$/, /^name$/, /^title$/, /^email$/, /^status$/, /_id$/, /created_at/, /updated_at/];
    return requiredPatterns.some((p) => p.test(columnName));
  }

  private isColumnUnique(columnName: string): boolean {
    const uniquePatterns = [/^id$/, /^email$/, /^slug$/, /^username$/, /^code$/, /^sku$/];
    return uniquePatterns.some((p) => p.test(columnName));
  }
}

/*
 * =============================================================================
 * Factory Function
 * =============================================================================
 */

export function createSchemaGenerator(options?: SchemaGeneratorOptions): SchemaGenerator {
  return new SchemaGenerator(options);
}
