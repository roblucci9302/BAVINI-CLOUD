/**
 * SQLValidator - Validation et sécurisation du SQL généré
 *
 * Ce validateur vérifie la syntaxe, détecte les injections SQL,
 * et sanitize le SQL avant exécution.
 */

import type { SQLValidationResult, ValidationError, ValidationWarning, SecurityIssue } from '../types';
import { FORBIDDEN_SQL_KEYWORDS, INJECTION_PATTERNS } from '../types';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('SQLValidator');

/*
 * =============================================================================
 * Types
 * =============================================================================
 */

export interface SQLValidatorOptions {
  strictMode?: boolean;
  allowDDL?: boolean;
  allowDML?: boolean;
  allowTruncate?: boolean;
  maxQueryLength?: number;
}

/*
 * =============================================================================
 * Constantes
 * =============================================================================
 */

const DEFAULT_OPTIONS: Required<SQLValidatorOptions> = {
  strictMode: true,
  allowDDL: true,
  allowDML: true,
  allowTruncate: false,
  maxQueryLength: 100000,
};

// Mots-clés réservés PostgreSQL qu'on ne peut pas utiliser comme identifiants
const RESERVED_KEYWORDS = new Set([
  'all',
  'analyse',
  'analyze',
  'and',
  'any',
  'array',
  'as',
  'asc',
  'asymmetric',
  'both',
  'case',
  'cast',
  'check',
  'collate',
  'column',
  'constraint',
  'create',
  'current_catalog',
  'current_date',
  'current_role',
  'current_time',
  'current_timestamp',
  'current_user',
  'default',
  'deferrable',
  'desc',
  'distinct',
  'do',
  'else',
  'end',
  'except',
  'false',
  'fetch',
  'for',
  'foreign',
  'from',
  'grant',
  'group',
  'having',
  'in',
  'initially',
  'intersect',
  'into',
  'lateral',
  'leading',
  'limit',
  'localtime',
  'localtimestamp',
  'not',
  'null',
  'offset',
  'on',
  'only',
  'or',
  'order',
  'placing',
  'primary',
  'references',
  'returning',
  'select',
  'session_user',
  'some',
  'symmetric',
  'table',
  'then',
  'to',
  'trailing',
  'true',
  'union',
  'unique',
  'user',
  'using',
  'variadic',
  'when',
  'where',
  'window',
  'with',
]);

/*
 * =============================================================================
 * SQLValidator Class
 * =============================================================================
 */

export class SQLValidator {
  private options: Required<SQLValidatorOptions>;

  constructor(options: SQLValidatorOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Valide une requête SQL complète
   */
  async validate(sql: string): Promise<SQLValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const securityIssues: SecurityIssue[] = [];

    logger.debug('Validating SQL', { length: sql.length });

    // 1. Vérification de la longueur
    if (sql.length > this.options.maxQueryLength) {
      errors.push({
        code: 'SQL_TOO_LONG',
        message: `La requête dépasse la limite de ${this.options.maxQueryLength} caractères`,
        severity: 'error',
      });
    }

    // 2. Vérification des mots-clés interdits
    const forbiddenCheck = this.checkForbiddenKeywords(sql);
    errors.push(...forbiddenCheck.errors);
    securityIssues.push(...forbiddenCheck.securityIssues);

    // 3. Détection des patterns d'injection
    const injectionCheck = this.checkInjectionPatterns(sql);
    securityIssues.push(...injectionCheck.securityIssues);
    warnings.push(...injectionCheck.warnings);

    // 4. Validation syntaxique basique
    const syntaxCheck = this.validateSyntax(sql);
    errors.push(...syntaxCheck.errors);
    warnings.push(...syntaxCheck.warnings);

    // 5. Vérification des bonnes pratiques
    const bestPracticesCheck = this.checkBestPractices(sql);
    warnings.push(...bestPracticesCheck.warnings);

    // 6. Vérification des identifiants
    const identifierCheck = this.checkIdentifiers(sql);
    errors.push(...identifierCheck.errors);
    warnings.push(...identifierCheck.warnings);

    // 7. Sanitization
    const sanitizedSQL = this.sanitize(sql);

    const isValid =
      errors.length === 0 &&
      securityIssues.filter((i) => i.severity === 'critical' || i.severity === 'high').length === 0;

    logger.info('SQL validation complete', {
      isValid,
      errorCount: errors.length,
      warningCount: warnings.length,
      securityIssueCount: securityIssues.length,
    });

    return {
      isValid,
      errors,
      warnings,
      suggestions: this.generateSuggestions(errors, warnings, securityIssues),
      sanitizedSQL,
      securityIssues,
    };
  }

  /**
   * Vérifie les mots-clés interdits
   */
  private checkForbiddenKeywords(sql: string): {
    errors: ValidationError[];
    securityIssues: SecurityIssue[];
  } {
    const errors: ValidationError[] = [];
    const securityIssues: SecurityIssue[] = [];
    const upperSQL = sql.toUpperCase();

    for (const keyword of FORBIDDEN_SQL_KEYWORDS) {
      if (upperSQL.includes(keyword)) {
        errors.push({
          code: 'FORBIDDEN_KEYWORD',
          message: `Mot-clé interdit détecté: ${keyword}`,
          severity: 'critical',
        });

        securityIssues.push({
          type: 'forbidden_keyword',
          pattern: keyword,
          severity: 'critical',
          recommendation: `Retirer ou remplacer "${keyword}" de la requête`,
        });
      }
    }

    // Vérification spécifique pour TRUNCATE si non autorisé
    if (!this.options.allowTruncate && upperSQL.includes('TRUNCATE')) {
      errors.push({
        code: 'TRUNCATE_NOT_ALLOWED',
        message: "TRUNCATE n'est pas autorisé dans ce contexte",
        severity: 'error',
      });
    }

    return { errors, securityIssues };
  }

  /**
   * Détecte les patterns d'injection SQL
   */
  private checkInjectionPatterns(sql: string): {
    securityIssues: SecurityIssue[];
    warnings: ValidationWarning[];
  } {
    const securityIssues: SecurityIssue[] = [];
    const warnings: ValidationWarning[] = [];

    for (const pattern of INJECTION_PATTERNS) {
      if (pattern.test(sql)) {
        securityIssues.push({
          type: 'injection',
          pattern: pattern.source,
          severity: 'high',
          recommendation: "Vérifier que ce pattern n'est pas une injection SQL",
        });
      }
    }

    // Vérification des commentaires suspects
    if (/--[^\n]*\b(or|and|union|select|drop|delete)\b/i.test(sql)) {
      securityIssues.push({
        type: 'injection',
        pattern: 'suspicious_comment',
        severity: 'medium',
        recommendation: 'Les commentaires contenant des mots-clés SQL sont suspects',
      });
    }

    // Vérification des guillemets non échappés
    const singleQuoteCount = (sql.match(/'/g) || []).length;

    if (singleQuoteCount % 2 !== 0) {
      warnings.push({
        code: 'UNMATCHED_QUOTES',
        message: 'Nombre impair de guillemets simples détecté',
        suggestion: 'Vérifier que tous les guillemets sont correctement échappés',
      });
    }

    return { securityIssues, warnings };
  }

  /**
   * Validation syntaxique basique
   */
  private validateSyntax(sql: string): {
    errors: ValidationError[];
    warnings: ValidationWarning[];
  } {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Vérification des parenthèses
    const parenthesesBalance = this.checkParenthesesBalance(sql);

    if (parenthesesBalance !== 0) {
      errors.push({
        code: 'UNBALANCED_PARENTHESES',
        message: `Parenthèses non équilibrées (${parenthesesBalance > 0 ? 'trop de (' : 'trop de )'})`,
        severity: 'error',
      });
    }

    // Vérification des points-virgules multiples
    if (/;.*;/s.test(sql) && !this.options.strictMode) {
      warnings.push({
        code: 'MULTIPLE_STATEMENTS',
        message: 'Plusieurs instructions SQL détectées',
        suggestion: 'Considérer séparer les instructions pour meilleure lisibilité',
      });
    }

    // Vérification des CREATE TABLE sans colonnes
    if (/CREATE\s+TABLE\s+\w+\s*\(\s*\)/i.test(sql)) {
      errors.push({
        code: 'EMPTY_TABLE',
        message: 'CREATE TABLE sans colonnes',
        severity: 'error',
      });
    }

    // Vérification des ALTER TABLE sans action
    if (/ALTER\s+TABLE\s+\w+\s*;/i.test(sql)) {
      errors.push({
        code: 'EMPTY_ALTER',
        message: 'ALTER TABLE sans action',
        severity: 'error',
      });
    }

    return { errors, warnings };
  }

  /**
   * Vérifie les bonnes pratiques SQL
   */
  private checkBestPractices(sql: string): {
    warnings: ValidationWarning[];
  } {
    const warnings: ValidationWarning[] = [];

    // Utilisation de SELECT *
    if (/SELECT\s+\*/i.test(sql) && this.options.strictMode) {
      warnings.push({
        code: 'SELECT_STAR',
        message: 'SELECT * détecté',
        suggestion: 'Spécifier les colonnes explicitement pour de meilleures performances',
      });
    }

    // DELETE sans WHERE
    if (/DELETE\s+FROM\s+\w+\s*;/i.test(sql)) {
      warnings.push({
        code: 'DELETE_WITHOUT_WHERE',
        message: 'DELETE sans clause WHERE',
        suggestion: 'Ajouter une clause WHERE pour éviter de supprimer toutes les lignes',
      });
    }

    // UPDATE sans WHERE
    if (/UPDATE\s+\w+\s+SET\s+[^;]+;/i.test(sql) && !/WHERE/i.test(sql)) {
      warnings.push({
        code: 'UPDATE_WITHOUT_WHERE',
        message: 'UPDATE sans clause WHERE',
        suggestion: 'Ajouter une clause WHERE pour éviter de modifier toutes les lignes',
      });
    }

    // Utilisation de NOW() vs CURRENT_TIMESTAMP
    if (/now\(\)/i.test(sql)) {
      warnings.push({
        code: 'USE_CURRENT_TIMESTAMP',
        message: 'Utilisation de NOW()',
        suggestion: 'Préférer CURRENT_TIMESTAMP pour la compatibilité',
      });
    }

    // Index manquant sur clé étrangère
    if (/REFERENCES\s+\w+\s*\(/i.test(sql) && !/CREATE\s+INDEX/i.test(sql)) {
      warnings.push({
        code: 'FK_WITHOUT_INDEX',
        message: 'Clé étrangère sans index explicite',
        suggestion: 'Considérer ajouter un index sur la colonne de clé étrangère',
      });
    }

    return { warnings };
  }

  /**
   * Vérifie les identifiants (noms de tables, colonnes)
   */
  private checkIdentifiers(sql: string): {
    errors: ValidationError[];
    warnings: ValidationWarning[];
  } {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    // Extraire les identifiants (capture aussi les noms avec majuscules)
    const identifierRegex =
      /(?:CREATE\s+TABLE|ALTER\s+TABLE|INSERT\s+INTO|UPDATE|DELETE\s+FROM|FROM)\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi;
    let match;

    while ((match = identifierRegex.exec(sql)) !== null) {
      const originalIdentifier = match[1];
      const identifier = originalIdentifier.toLowerCase();

      // Vérifier les mots réservés
      if (RESERVED_KEYWORDS.has(identifier)) {
        errors.push({
          code: 'RESERVED_KEYWORD_AS_IDENTIFIER',
          message: `"${identifier}" est un mot-clé réservé PostgreSQL`,
          location: `Position ${match.index}`,
          severity: 'error',
        });
      }

      /*
       * Vérifier la convention de nommage (snake_case)
       * L'identifiant original doit être tout en minuscules avec underscores
       */
      if (!/^[a-z][a-z0-9_]*$/.test(originalIdentifier)) {
        warnings.push({
          code: 'NAMING_CONVENTION',
          message: `L'identifiant "${originalIdentifier}" ne suit pas la convention snake_case`,
          suggestion: 'Utiliser snake_case pour les noms de tables et colonnes',
        });
      }

      // Vérifier la longueur
      if (identifier.length > 63) {
        errors.push({
          code: 'IDENTIFIER_TOO_LONG',
          message: `L'identifiant "${identifier}" dépasse 63 caractères`,
          severity: 'error',
        });
      }
    }

    return { errors, warnings };
  }

  /**
   * Vérifie l'équilibre des parenthèses
   */
  private checkParenthesesBalance(sql: string): number {
    let balance = 0;
    let inString = false;
    let stringChar = '';

    for (let i = 0; i < sql.length; i++) {
      const char = sql[i];
      const prevChar = i > 0 ? sql[i - 1] : '';

      // Gestion des chaînes de caractères
      if ((char === "'" || char === '"') && prevChar !== '\\') {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
        }

        continue;
      }

      if (!inString) {
        if (char === '(') {
          balance++;
        } else if (char === ')') {
          balance--;
        }
      }
    }

    return balance;
  }

  /**
   * Sanitize le SQL
   */
  private sanitize(sql: string): string {
    return (
      sql
        // Retirer les commentaires sur une ligne
        .replace(/--[^\n]*$/gm, '')
        // Retirer les commentaires multi-lignes
        .replace(/\/\*[\s\S]*?\*\//g, '')
        // Normaliser les espaces
        .replace(/\s+/g, ' ')
        // Retirer les espaces en début et fin
        .trim()
    );
  }

  /**
   * Génère des suggestions basées sur les erreurs et warnings
   */
  private generateSuggestions(
    errors: ValidationError[],
    warnings: ValidationWarning[],
    securityIssues: SecurityIssue[],
  ): string[] {
    const suggestions: string[] = [];

    // Suggestions basées sur les erreurs
    for (const error of errors) {
      if (error.code === 'FORBIDDEN_KEYWORD') {
        suggestions.push('Revoir la logique pour éviter les opérations dangereuses');
      }

      if (error.code === 'RESERVED_KEYWORD_AS_IDENTIFIER') {
        suggestions.push('Renommer les identifiants qui utilisent des mots réservés');
      }
    }

    // Suggestions basées sur les issues de sécurité
    if (securityIssues.length > 0) {
      suggestions.push('Revoir le SQL pour potentielles vulnérabilités de sécurité');
    }

    // Suggestions basées sur les warnings
    for (const warning of warnings) {
      if (warning.suggestion) {
        suggestions.push(warning.suggestion);
      }
    }

    return [...new Set(suggestions)]; // Dédupliquer
  }

  /**
   * Vérifie si le SQL est une migration valide
   */
  async validateMigration(
    up: string,
    down: string,
  ): Promise<{
    isValid: boolean;
    upValidation: SQLValidationResult;
    downValidation: SQLValidationResult;
    isReversible: boolean;
  }> {
    const upValidation = await this.validate(up);
    const downValidation = await this.validate(down);

    // Vérifier la réversibilité basique
    const isReversible = this.checkReversibility(up, down);

    return {
      isValid: upValidation.isValid && downValidation.isValid,
      upValidation,
      downValidation,
      isReversible,
    };
  }

  /**
   * Vérifie si une migration est réversible
   */
  private checkReversibility(up: string, down: string): boolean {
    // Vérification basique: le down doit défaire les opérations du up
    const upOperations = this.extractOperations(up);
    const downOperations = this.extractOperations(down);

    // CREATE TABLE -> DROP TABLE
    for (const table of upOperations.createdTables) {
      if (!downOperations.droppedTables.includes(table)) {
        return false;
      }
    }

    // ADD COLUMN -> DROP COLUMN
    for (const column of upOperations.addedColumns) {
      if (!downOperations.droppedColumns.some((c) => c.table === column.table && c.column === column.column)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Extrait les opérations d'un SQL
   */
  private extractOperations(sql: string): {
    createdTables: string[];
    droppedTables: string[];
    addedColumns: Array<{ table: string; column: string }>;
    droppedColumns: Array<{ table: string; column: string }>;
  } {
    const createdTables: string[] = [];
    const droppedTables: string[] = [];
    const addedColumns: Array<{ table: string; column: string }> = [];
    const droppedColumns: Array<{ table: string; column: string }> = [];

    // CREATE TABLE
    const createTableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-z_][a-z0-9_]*)/gi;
    let match;

    while ((match = createTableRegex.exec(sql)) !== null) {
      createdTables.push(match[1].toLowerCase());
    }

    // DROP TABLE
    const dropTableRegex = /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?([a-z_][a-z0-9_]*)/gi;

    while ((match = dropTableRegex.exec(sql)) !== null) {
      droppedTables.push(match[1].toLowerCase());
    }

    // ADD COLUMN
    const addColumnRegex = /ALTER\s+TABLE\s+([a-z_][a-z0-9_]*)\s+ADD\s+(?:COLUMN\s+)?([a-z_][a-z0-9_]*)/gi;

    while ((match = addColumnRegex.exec(sql)) !== null) {
      addedColumns.push({ table: match[1].toLowerCase(), column: match[2].toLowerCase() });
    }

    // DROP COLUMN
    const dropColumnRegex = /ALTER\s+TABLE\s+([a-z_][a-z0-9_]*)\s+DROP\s+(?:COLUMN\s+)?([a-z_][a-z0-9_]*)/gi;

    while ((match = dropColumnRegex.exec(sql)) !== null) {
      droppedColumns.push({ table: match[1].toLowerCase(), column: match[2].toLowerCase() });
    }

    return { createdTables, droppedTables, addedColumns, droppedColumns };
  }
}

/*
 * =============================================================================
 * Factory Function
 * =============================================================================
 */

export function createSQLValidator(options?: SQLValidatorOptions): SQLValidator {
  return new SQLValidator(options);
}
