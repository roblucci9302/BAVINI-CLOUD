/**
 * NLPValidator - Validation de l'extraction NLP d'entités
 *
 * Ce module valide les entités extraites depuis une description en langage naturel,
 * calcule des scores de confiance, et génère des questions de clarification.
 */

import type {
  ExtractedEntity,
  ExtractedColumn,
  ExtractedRelation,
  EntityConfidence,
  NLPValidationResult,
  ValidationError,
  ValidationWarning,
  PostgresType,
} from '../types';
import { CONFIDENCE_THRESHOLDS } from '../types';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('NLPValidator');

/*
 * =============================================================================
 * Types
 * =============================================================================
 */

export interface NLPValidatorOptions {
  strictMode?: boolean;
  minConfidence?: number;
  maxEntities?: number;
  maxColumnsPerEntity?: number;
}

export interface TypeInference {
  type: PostgresType;
  confidence: number;
  reason: string;
}

/*
 * =============================================================================
 * Constantes
 * =============================================================================
 */

const DEFAULT_OPTIONS: Required<NLPValidatorOptions> = {
  strictMode: false,
  minConfidence: CONFIDENCE_THRESHOLDS.REJECT,
  maxEntities: 20,
  maxColumnsPerEntity: 50,
};

// Mots réservés SQL qui ne peuvent pas être utilisés comme noms
const SQL_RESERVED_WORDS = new Set([
  'all',
  'and',
  'any',
  'array',
  'as',
  'asc',
  'between',
  'by',
  'case',
  'check',
  'column',
  'constraint',
  'create',
  'cross',
  'current',
  'default',
  'delete',
  'desc',
  'distinct',
  'drop',
  'else',
  'end',
  'exists',
  'false',
  'for',
  'foreign',
  'from',
  'full',
  'group',
  'having',
  'in',
  'index',
  'inner',
  'insert',
  'into',
  'is',
  'join',
  'key',
  'left',
  'like',
  'limit',
  'not',
  'null',
  'on',
  'or',
  'order',
  'outer',
  'primary',
  'references',
  'right',
  'select',
  'set',
  'table',
  'then',
  'to',
  'true',
  'union',
  'unique',
  'update',
  'using',
  'values',
  'when',
  'where',
  'with',
  'user',
  'role',
  'grant',
  'revoke',
]);

// Patterns pour inférer les types de colonnes
const TYPE_INFERENCE_PATTERNS: Array<{
  pattern: RegExp;
  type: PostgresType;
  confidence: number;
  reason: string;
}> = [
  { pattern: /^id$|_id$/i, type: 'uuid', confidence: 95, reason: 'Identifiant détecté' },
  { pattern: /^uuid$/i, type: 'uuid', confidence: 100, reason: 'Type UUID explicite' },
  {
    pattern: /created_at|updated_at|deleted_at|_at$/i,
    type: 'timestamptz',
    confidence: 95,
    reason: 'Timestamp détecté',
  },
  { pattern: /date|_date$/i, type: 'date', confidence: 90, reason: 'Date détectée' },
  { pattern: /time|_time$/i, type: 'time', confidence: 85, reason: 'Heure détectée' },
  {
    pattern: /^is_|^has_|^can_|^should_|^enabled$|^active$|^visible$/i,
    type: 'bool',
    confidence: 95,
    reason: 'Booléen détecté',
  },
  { pattern: /email|e-mail|courriel/i, type: 'text', confidence: 90, reason: 'Email détecté' },
  { pattern: /url|link|href|website|site/i, type: 'text', confidence: 85, reason: 'URL détectée' },
  {
    pattern: /price|cost|amount|total|balance|salary/i,
    type: 'numeric',
    confidence: 90,
    reason: 'Montant monétaire détecté',
  },
  { pattern: /count|quantity|qty|number|num|nb/i, type: 'int4', confidence: 85, reason: 'Nombre entier détecté' },
  { pattern: /percent|percentage|ratio|rate/i, type: 'float4', confidence: 85, reason: 'Pourcentage/ratio détecté' },
  { pattern: /age|year|month|day|hour|minute/i, type: 'int4', confidence: 80, reason: 'Durée/âge détecté' },
  {
    pattern: /metadata|settings|config|options|data|json|payload/i,
    type: 'jsonb',
    confidence: 85,
    reason: 'Données JSON détectées',
  },
  {
    pattern: /name|title|label|description|bio|content|text|message|comment/i,
    type: 'text',
    confidence: 80,
    reason: 'Texte détecté',
  },
  { pattern: /phone|tel|mobile|fax/i, type: 'varchar', confidence: 85, reason: 'Téléphone détecté' },
  { pattern: /code|slug|sku|ref|reference/i, type: 'varchar', confidence: 85, reason: 'Code/référence détecté' },
  { pattern: /ip|ip_address|ipv4|ipv6/i, type: 'inet', confidence: 90, reason: 'Adresse IP détectée' },
  {
    pattern: /avatar|image|photo|picture|file|attachment/i,
    type: 'text',
    confidence: 80,
    reason: 'URL de fichier détectée',
  },
];

// Patterns pour détecter les relations
const RELATION_PATTERNS: Array<{
  pattern: RegExp;
  type: ExtractedRelation['type'];
  confidence: number;
}> = [
  { pattern: /appartient à|belongs to|owned by|parent/i, type: '1-N', confidence: 90 },
  { pattern: /a plusieurs|has many|contient|contains/i, type: '1-N', confidence: 90 },
  { pattern: /plusieurs.*plusieurs|many.*many/i, type: 'N-N', confidence: 90 },
  { pattern: /tags|catégories|categories|labels/i, type: 'N-N', confidence: 80 },
];

// Templates de questions de clarification
const CLARIFICATION_TEMPLATES = {
  ambiguousType: (field: string, options: string[]) =>
    `Pour le champ "${field}", quel type souhaitez-vous ? Options: ${options.join(', ')}`,
  missingRelation: (entity1: string, entity2: string) =>
    `Quelle est la relation entre "${entity1}" et "${entity2}" ? (1-N, N-N, ou aucune)`,
  conflictingName: (name: string, existing: string) =>
    `Le nom "${name}" est similaire à "${existing}" existant. Voulez-vous les fusionner ou renommer ?`,
  missingPrimaryKey: (entity: string) =>
    `L'entité "${entity}" n'a pas de clé primaire explicite. Utiliser "id" (UUID) par défaut ?`,
};

/*
 * =============================================================================
 * NLPValidator Class
 * =============================================================================
 */

export class NLPValidator {
  private options: Required<NLPValidatorOptions>;

  constructor(options: NLPValidatorOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Valide les entités extraites et calcule les scores de confiance
   */
  async validate(entities: ExtractedEntity[], existingTables?: string[]): Promise<NLPValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const entityConfidences: EntityConfidence[] = [];
    const suggestedQuestions: string[] = [];

    logger.debug('Validating extracted entities', { count: entities.length });

    if (entities.length > this.options.maxEntities) {
      errors.push({
        code: 'TOO_MANY_ENTITIES',
        message: `Trop d'entités extraites (${entities.length} > ${this.options.maxEntities})`,
        severity: 'error',
      });
    }

    for (const entity of entities) {
      const entityValidation = this.validateEntity(entity, existingTables);
      errors.push(...entityValidation.errors);
      warnings.push(...entityValidation.warnings);
      suggestedQuestions.push(...entityValidation.questions);
      entityConfidences.push({
        entity,
        confidence: entityValidation.confidence,
        source: entity.source,
        warnings: entityValidation.warnings.map((w) => w.message),
      });
    }

    const relationValidation = this.validateRelations(entities);
    errors.push(...relationValidation.errors);
    warnings.push(...relationValidation.warnings);
    suggestedQuestions.push(...relationValidation.questions);

    const conflictValidation = this.checkNameConflicts(entities, existingTables);
    errors.push(...conflictValidation.errors);
    warnings.push(...conflictValidation.warnings);
    suggestedQuestions.push(...conflictValidation.questions);

    const overallConfidence = this.calculateOverallConfidence(entityConfidences);
    const requiresConfirmation =
      overallConfidence < CONFIDENCE_THRESHOLDS.AUTO_ACCEPT || errors.length > 0 || suggestedQuestions.length > 0;

    const isValid =
      errors.filter((e) => e.severity === 'critical').length === 0 && overallConfidence >= this.options.minConfidence;

    logger.info('NLP validation complete', {
      isValid,
      overallConfidence,
      entityCount: entities.length,
      errorCount: errors.length,
    });

    return {
      isValid,
      errors,
      warnings,
      suggestions: this.generateSuggestions(errors, warnings),
      entities: entityConfidences,
      overallConfidence,
      requiresConfirmation,
      suggestedQuestions: [...new Set(suggestedQuestions)],
    };
  }

  private validateEntity(
    entity: ExtractedEntity,
    existingTables?: string[],
  ): {
    errors: ValidationError[];
    warnings: ValidationWarning[];
    questions: string[];
    confidence: number;
  } {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const questions: string[] = [];
    let confidenceScore = 100;

    const nameValidation = this.validateEntityName(entity.name, entity.tableName);
    errors.push(...nameValidation.errors);
    warnings.push(...nameValidation.warnings);
    confidenceScore -= nameValidation.penalty;

    if (entity.columns.length === 0) {
      errors.push({
        code: 'NO_COLUMNS',
        message: `L'entité "${entity.name}" n'a pas de colonnes`,
        severity: 'error',
      });
      confidenceScore -= 30;
    } else if (entity.columns.length > this.options.maxColumnsPerEntity) {
      warnings.push({
        code: 'TOO_MANY_COLUMNS',
        message: `L'entité "${entity.name}" a beaucoup de colonnes (${entity.columns.length})`,
        suggestion: 'Considérer diviser en plusieurs entités',
      });
      confidenceScore -= 10;
    }

    for (const column of entity.columns) {
      const columnValidation = this.validateColumn(column, entity.name);
      errors.push(...columnValidation.errors);
      warnings.push(...columnValidation.warnings);
      questions.push(...columnValidation.questions);
      confidenceScore -= columnValidation.penalty;
    }

    const hasPrimaryKey = entity.columns.some((c) => c.name === 'id' || c.name.endsWith('_id'));

    if (!hasPrimaryKey) {
      warnings.push({
        code: 'NO_PRIMARY_KEY',
        message: `L'entité "${entity.name}" n'a pas de clé primaire explicite`,
        suggestion: 'Une colonne "id" sera ajoutée automatiquement',
      });
      questions.push(CLARIFICATION_TEMPLATES.missingPrimaryKey(entity.name));
    }

    const hasCreatedAt = entity.columns.some((c) => c.name === 'created_at');
    const hasUpdatedAt = entity.columns.some((c) => c.name === 'updated_at');

    if (!hasCreatedAt || !hasUpdatedAt) {
      warnings.push({
        code: 'MISSING_TIMESTAMPS',
        message: `L'entité "${entity.name}" manque de colonnes de timestamps`,
        suggestion: 'Les colonnes created_at et updated_at seront ajoutées',
      });
    }

    if (existingTables?.includes(entity.tableName)) {
      errors.push({
        code: 'TABLE_EXISTS',
        message: `La table "${entity.tableName}" existe déjà`,
        severity: 'error',
      });
      confidenceScore -= 20;
    }

    if (entity.source === 'inferred') {
      confidenceScore -= 10;
    } else if (entity.source === 'default') {
      confidenceScore -= 20;
    }

    return {
      errors,
      warnings,
      questions,
      confidence: Math.max(0, Math.min(100, confidenceScore)),
    };
  }

  private validateEntityName(
    name: string,
    tableName: string,
  ): {
    errors: ValidationError[];
    warnings: ValidationWarning[];
    penalty: number;
  } {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    let penalty = 0;

    if (tableName.length > 63) {
      errors.push({
        code: 'NAME_TOO_LONG',
        message: `Le nom de table "${tableName}" dépasse 63 caractères`,
        severity: 'error',
      });
      penalty += 20;
    }

    if (!/^[a-z][a-z0-9_]*$/.test(tableName)) {
      warnings.push({
        code: 'INVALID_NAME_FORMAT',
        message: `Le nom "${tableName}" ne suit pas le format snake_case`,
        suggestion: `Utiliser "${this.toSnakeCase(tableName)}"`,
      });
      penalty += 5;
    }

    if (SQL_RESERVED_WORDS.has(tableName.toLowerCase())) {
      errors.push({
        code: 'RESERVED_WORD',
        message: `"${tableName}" est un mot réservé SQL`,
        severity: 'error',
      });
      penalty += 30;
    }

    const genericNames = ['data', 'item', 'record', 'entry', 'object', 'entity'];

    if (genericNames.includes(tableName.toLowerCase())) {
      warnings.push({
        code: 'GENERIC_NAME',
        message: `Le nom "${tableName}" est trop générique`,
        suggestion: 'Utiliser un nom plus descriptif',
      });
      penalty += 10;
    }

    return { errors, warnings, penalty };
  }

  private validateColumn(
    column: ExtractedColumn,
    entityName: string,
  ): {
    errors: ValidationError[];
    warnings: ValidationWarning[];
    questions: string[];
    penalty: number;
  } {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const questions: string[] = [];
    let penalty = 0;

    if (!/^[a-z][a-z0-9_]*$/.test(column.name)) {
      warnings.push({
        code: 'INVALID_COLUMN_NAME',
        message: `Le nom de colonne "${column.name}" dans "${entityName}" n'est pas valide`,
        suggestion: `Utiliser "${this.toSnakeCase(column.name)}"`,
      });
      penalty += 5;
    }

    if (SQL_RESERVED_WORDS.has(column.name.toLowerCase())) {
      errors.push({
        code: 'RESERVED_COLUMN_NAME',
        message: `"${column.name}" est un mot réservé SQL`,
        severity: 'error',
      });
      penalty += 20;
    }

    if (column.confidence < CONFIDENCE_THRESHOLDS.SUGGEST_REVIEW) {
      warnings.push({
        code: 'LOW_TYPE_CONFIDENCE',
        message: `Le type de "${column.name}" a une faible confiance (${column.confidence}%)`,
      });
      penalty += 10;

      const alternatives = this.suggestAlternativeTypes(column.name);

      if (alternatives.length > 1) {
        questions.push(CLARIFICATION_TEMPLATES.ambiguousType(column.name, alternatives));
      }
    }

    if (column.source === 'inferred') {
      penalty += 5;
    }

    return { errors, warnings, questions, penalty };
  }

  private validateRelations(entities: ExtractedEntity[]): {
    errors: ValidationError[];
    warnings: ValidationWarning[];
    questions: string[];
  } {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const questions: string[] = [];
    const entityNames = new Set(entities.map((e) => e.tableName));

    for (const entity of entities) {
      for (const relation of entity.relations) {
        if (!entityNames.has(relation.targetEntity)) {
          errors.push({
            code: 'INVALID_RELATION_TARGET',
            message: `L'entité cible "${relation.targetEntity}" de la relation n'existe pas`,
            severity: 'error',
          });
        }

        if (relation.confidence < CONFIDENCE_THRESHOLDS.SUGGEST_REVIEW) {
          warnings.push({
            code: 'LOW_RELATION_CONFIDENCE',
            message: `La relation ${entity.name} -> ${relation.targetEntity} a une faible confiance`,
          });
          questions.push(CLARIFICATION_TEMPLATES.missingRelation(entity.name, relation.targetEntity));
        }

        if (relation.type === 'N-N' && !relation.throughTable) {
          warnings.push({
            code: 'MISSING_JUNCTION_TABLE',
            message: `La relation N-N ${entity.name} <-> ${relation.targetEntity} nécessite une table de jointure`,
            suggestion: `Une table "${entity.tableName}_${relation.targetEntity}" sera créée`,
          });
        }
      }
    }

    return { errors, warnings, questions };
  }

  private checkNameConflicts(
    entities: ExtractedEntity[],
    existingTables?: string[],
  ): {
    errors: ValidationError[];
    warnings: ValidationWarning[];
    questions: string[];
  } {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const questions: string[] = [];
    const tableNames = entities.map((e) => e.tableName);
    const seen = new Set<string>();

    for (const name of tableNames) {
      if (seen.has(name)) {
        errors.push({
          code: 'DUPLICATE_ENTITY',
          message: `L'entité "${name}" est définie plusieurs fois`,
          severity: 'error',
        });
      }

      seen.add(name);
    }

    for (let i = 0; i < tableNames.length; i++) {
      for (let j = i + 1; j < tableNames.length; j++) {
        const similarity = this.calculateSimilarity(tableNames[i], tableNames[j]);

        if (similarity > 0.8 && similarity < 1) {
          warnings.push({
            code: 'SIMILAR_NAMES',
            message: `"${tableNames[i]}" et "${tableNames[j]}" ont des noms similaires`,
            suggestion: "Vérifier qu'il s'agit bien de deux entités distinctes",
          });
          questions.push(CLARIFICATION_TEMPLATES.conflictingName(tableNames[i], tableNames[j]));
        }
      }
    }

    if (existingTables) {
      for (const name of tableNames) {
        for (const existing of existingTables) {
          const similarity = this.calculateSimilarity(name, existing);

          if (similarity > 0.8 && name !== existing) {
            warnings.push({
              code: 'SIMILAR_TO_EXISTING',
              message: `"${name}" est similaire à la table existante "${existing}"`,
            });
            questions.push(CLARIFICATION_TEMPLATES.conflictingName(name, existing));
          }
        }
      }
    }

    return { errors, warnings, questions };
  }

  private calculateOverallConfidence(entityConfidences: EntityConfidence[]): number {
    if (entityConfidences.length === 0) {
      return 0;
    }

    const sum = entityConfidences.reduce((acc, ec) => acc + ec.confidence, 0);

    return Math.round(sum / entityConfidences.length);
  }

  inferColumnType(columnName: string): TypeInference {
    for (const { pattern, type, confidence, reason } of TYPE_INFERENCE_PATTERNS) {
      if (pattern.test(columnName)) {
        return { type, confidence, reason };
      }
    }
    return { type: 'text', confidence: 50, reason: 'Type par défaut (texte)' };
  }

  private suggestAlternativeTypes(columnName: string): string[] {
    const matches: Array<{ type: PostgresType; confidence: number }> = [];

    for (const { pattern, type, confidence } of TYPE_INFERENCE_PATTERNS) {
      if (pattern.test(columnName)) {
        matches.push({ type, confidence });
      }
    }

    if (!matches.find((m) => m.type === 'text')) {
      matches.push({ type: 'text', confidence: 50 });
    }

    return matches
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 3)
      .map((m) => m.type);
  }

  detectRelationType(description: string): { type: ExtractedRelation['type'] | null; confidence: number } {
    for (const { pattern, type, confidence } of RELATION_PATTERNS) {
      if (pattern.test(description)) {
        return { type, confidence };
      }
    }
    return { type: null, confidence: 0 };
  }

  private generateSuggestions(errors: ValidationError[], warnings: ValidationWarning[]): string[] {
    const suggestions: string[] = [];

    for (const error of errors) {
      if (error.code === 'RESERVED_WORD' || error.code === 'RESERVED_COLUMN_NAME') {
        suggestions.push('Renommer les identifiants qui utilisent des mots réservés SQL');
      }

      if (error.code === 'TABLE_EXISTS') {
        suggestions.push('Choisir un nom différent ou mettre à jour la table existante');
      }

      if (error.code === 'INVALID_RELATION_TARGET') {
        suggestions.push('Vérifier que toutes les entités référencées sont définies');
      }
    }

    for (const warning of warnings) {
      if (warning.suggestion) {
        suggestions.push(warning.suggestion);
      }
    }

    return [...new Set(suggestions)];
  }

  private toSnakeCase(str: string): string {
    return str
      .replace(/([A-Z])/g, '_$1')
      .replace(/[-\s]+/g, '_')
      .replace(/^_/, '')
      .toLowerCase()
      .replace(/_+/g, '_');
  }

  private calculateSimilarity(str1: string, str2: string): number {
    if (str1 === str2) {
      return 1;
    }

    if (str1.length === 0 || str2.length === 0) {
      return 0;
    }

    const len1 = str1.length;
    const len2 = str2.length;
    const matchWindow = Math.floor(Math.max(len1, len2) / 2) - 1;
    const matches1 = new Array(len1).fill(false);
    const matches2 = new Array(len2).fill(false);
    let matches = 0;
    let transpositions = 0;

    for (let i = 0; i < len1; i++) {
      const start = Math.max(0, i - matchWindow);
      const end = Math.min(i + matchWindow + 1, len2);

      for (let j = start; j < end; j++) {
        if (matches2[j] || str1[i] !== str2[j]) {
          continue;
        }

        matches1[i] = true;
        matches2[j] = true;
        matches++;
        break;
      }
    }

    if (matches === 0) {
      return 0;
    }

    let k = 0;

    for (let i = 0; i < len1; i++) {
      if (!matches1[i]) {
        continue;
      }

      while (!matches2[k]) {
        k++;
      }

      if (str1[i] !== str2[k]) {
        transpositions++;
      }

      k++;
    }

    const jaro = (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3;
    let prefix = 0;

    for (let i = 0; i < Math.min(4, Math.min(len1, len2)); i++) {
      if (str1[i] === str2[i]) {
        prefix++;
      } else {
        break;
      }
    }

    return jaro + prefix * 0.1 * (1 - jaro);
  }
}

/*
 * =============================================================================
 * Factory Function
 * =============================================================================
 */

export function createNLPValidator(options?: NLPValidatorOptions): NLPValidator {
  return new NLPValidator(options);
}
