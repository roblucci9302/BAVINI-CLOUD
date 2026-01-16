/**
 * Import Validator - Valide les imports dans les fichiers TypeScript/JavaScript
 *
 * Vérifie que:
 * - Les imports relatifs pointent vers des fichiers existants
 * - Les identifiants importés sont utilisés dans le fichier
 * - Pas d'imports circulaires évidents
 */

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('ImportValidator');

/*
 * ============================================================================
 * TYPES
 * ============================================================================
 */

export interface ImportInfo {
  /** Type d'import: 'relative' | 'package' | 'alias' */
  type: 'relative' | 'package' | 'alias';

  /** Source de l'import (chemin ou nom du package) */
  source: string;

  /** Chemin résolu (pour les imports relatifs) */
  resolvedPath?: string;

  /** Identifiants importés */
  identifiers: string[];

  /** Numéro de ligne */
  line: number;

  /** Est-ce un import de type uniquement */
  isTypeOnly: boolean;
}

export interface ImportValidationResult {
  /** Validation réussie */
  valid: boolean;

  /** Warnings (non bloquants) */
  warnings: ImportWarning[];

  /** Erreurs (bloquantes) */
  errors: ImportError[];

  /** Imports analysés */
  imports: ImportInfo[];
}

export interface ImportWarning {
  message: string;
  line?: number;
  source?: string;
  suggestion?: string;
}

export interface ImportError {
  message: string;
  line?: number;
  source?: string;
  code: 'MISSING_FILE' | 'UNUSED_IMPORT' | 'CIRCULAR_IMPORT' | 'INVALID_SYNTAX';
}

export interface FileExistsChecker {
  exists(path: string): Promise<boolean>;
}

/*
 * ============================================================================
 * REGEX PATTERNS
 * ============================================================================
 */

// Pattern pour les imports ES6
const ES6_IMPORT_REGEX =
  /^import\s+(?:type\s+)?(?:(\{[^}]+\})|(\*\s+as\s+\w+)|(\w+))?(?:\s*,\s*(?:(\{[^}]+\})|(\*\s+as\s+\w+)|(\w+)))?\s*from\s*['"]([^'"]+)['"]/gm;

// Pattern pour les imports dynamiques
const DYNAMIC_IMPORT_REGEX = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

// Pattern pour les require CommonJS
const REQUIRE_REGEX = /(?:const|let|var)\s+(?:(\{[^}]+\})|(\w+))\s*=\s*require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

// Pattern pour les re-exports
const REEXPORT_REGEX = /^export\s+(?:\*|\{[^}]+\})\s+from\s*['"]([^'"]+)['"]/gm;

// Extensions de fichiers TypeScript/JavaScript
const JS_TS_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];

/*
 * ============================================================================
 * PARSING
 * ============================================================================
 */

/**
 * Parse les imports d'un fichier TypeScript/JavaScript
 */
export function parseImports(content: string, filePath: string): ImportInfo[] {
  const imports: ImportInfo[] = [];
  const lines = content.split('\n');

  // Reset regex lastIndex
  ES6_IMPORT_REGEX.lastIndex = 0;
  DYNAMIC_IMPORT_REGEX.lastIndex = 0;
  REQUIRE_REGEX.lastIndex = 0;
  REEXPORT_REGEX.lastIndex = 0;

  // Parse ES6 imports
  let match: RegExpExecArray | null;
  while ((match = ES6_IMPORT_REGEX.exec(content)) !== null) {
    const [
      fullMatch,
      namedImports1,
      namespaceImport1,
      defaultImport1,
      namedImports2,
      namespaceImport2,
      defaultImport2,
      source,
    ] = match;
    const isTypeOnly = fullMatch.includes('import type');

    // Trouver le numéro de ligne
    const lineIndex = content.substring(0, match.index).split('\n').length;

    // Extraire les identifiants
    const identifiers: string[] = [];

    // Default import
    if (defaultImport1) {
      identifiers.push(defaultImport1);
    }
    if (defaultImport2) {
      identifiers.push(defaultImport2);
    }

    // Namespace import
    if (namespaceImport1) {
      const nsMatch = namespaceImport1.match(/\*\s+as\s+(\w+)/);
      if (nsMatch) {
        identifiers.push(nsMatch[1]);
      }
    }
    if (namespaceImport2) {
      const nsMatch = namespaceImport2.match(/\*\s+as\s+(\w+)/);
      if (nsMatch) {
        identifiers.push(nsMatch[1]);
      }
    }

    // Named imports
    const namedImports = namedImports1 || namedImports2;
    if (namedImports) {
      const names = namedImports
        .replace(/[{}]/g, '')
        .split(',')
        .map((n) => {
          const parts = n.trim().split(/\s+as\s+/);
          return parts[parts.length - 1].trim();
        })
        .filter((n) => n && n !== 'type');
      identifiers.push(...names);
    }

    imports.push({
      type: getImportType(source),
      source,
      resolvedPath: resolveImportPath(source, filePath),
      identifiers,
      line: lineIndex,
      isTypeOnly,
    });
  }

  // Parse dynamic imports
  while ((match = DYNAMIC_IMPORT_REGEX.exec(content)) !== null) {
    const [, source] = match;
    const lineIndex = content.substring(0, match.index).split('\n').length;

    imports.push({
      type: getImportType(source),
      source,
      resolvedPath: resolveImportPath(source, filePath),
      identifiers: [],
      line: lineIndex,
      isTypeOnly: false,
    });
  }

  // Parse re-exports
  while ((match = REEXPORT_REGEX.exec(content)) !== null) {
    const [, source] = match;
    const lineIndex = content.substring(0, match.index).split('\n').length;

    imports.push({
      type: getImportType(source),
      source,
      resolvedPath: resolveImportPath(source, filePath),
      identifiers: [],
      line: lineIndex,
      isTypeOnly: false,
    });
  }

  return imports;
}

/**
 * Détermine le type d'import
 */
function getImportType(source: string): 'relative' | 'package' | 'alias' {
  if (source.startsWith('./') || source.startsWith('../')) {
    return 'relative';
  }
  if (source.startsWith('~/') || source.startsWith('@/')) {
    return 'alias';
  }
  return 'package';
}

/**
 * Résout le chemin d'un import relatif
 */
function resolveImportPath(source: string, filePath: string): string | undefined {
  if (!source.startsWith('./') && !source.startsWith('../')) {
    return undefined;
  }

  // Obtenir le dossier du fichier actuel
  const currentDir = filePath.split('/').slice(0, -1).join('/');

  // Résoudre le chemin relatif
  const parts = [...currentDir.split('/'), ...source.split('/')];
  const resolved: string[] = [];

  for (const part of parts) {
    if (part === '..') {
      resolved.pop();
    } else if (part !== '.' && part !== '') {
      resolved.push(part);
    }
  }

  return resolved.join('/');
}

/*
 * ============================================================================
 * VALIDATION
 * ============================================================================
 */

/**
 * Valide les imports d'un fichier
 */
export async function validateImports(
  content: string,
  filePath: string,
  fileChecker?: FileExistsChecker,
): Promise<ImportValidationResult> {
  const result: ImportValidationResult = {
    valid: true,
    warnings: [],
    errors: [],
    imports: [],
  };

  // Ne valider que les fichiers TS/JS
  const ext = filePath.split('.').pop()?.toLowerCase();
  if (!ext || !['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'].includes(ext)) {
    return result;
  }

  try {
    result.imports = parseImports(content, filePath);
  } catch (error) {
    result.errors.push({
      message: `Failed to parse imports: ${error instanceof Error ? error.message : String(error)}`,
      code: 'INVALID_SYNTAX',
    });
    result.valid = false;
    return result;
  }

  // Vérifier les imports relatifs
  if (fileChecker) {
    for (const imp of result.imports) {
      if (imp.type === 'relative' && imp.resolvedPath) {
        const exists = await checkFileExists(imp.resolvedPath, fileChecker);
        if (!exists) {
          result.errors.push({
            message: `Import file not found: ${imp.source}`,
            line: imp.line,
            source: imp.source,
            code: 'MISSING_FILE',
          });
          result.valid = false;
        }
      }
    }
  }

  // Vérifier les imports non utilisés (sauf type-only)
  for (const imp of result.imports) {
    if (imp.isTypeOnly) {
      continue;
    }

    for (const identifier of imp.identifiers) {
      if (!isIdentifierUsed(content, identifier, imp.line)) {
        result.warnings.push({
          message: `Import '${identifier}' appears unused`,
          line: imp.line,
          source: imp.source,
          suggestion: `Consider removing unused import or use 'import type' if only used for types`,
        });
      }
    }
  }

  // Vérifier les imports de fichiers qui seront supprimés (auto-référence)
  const fileName = filePath.split('/').pop();
  for (const imp of result.imports) {
    if (imp.resolvedPath?.endsWith(fileName || '')) {
      result.warnings.push({
        message: `Possible self-import detected`,
        line: imp.line,
        source: imp.source,
      });
    }
  }

  return result;
}

/**
 * Vérifie si un fichier existe (avec extensions possibles)
 */
async function checkFileExists(basePath: string, checker: FileExistsChecker): Promise<boolean> {
  // Si le chemin a déjà une extension
  if (JS_TS_EXTENSIONS.some((ext) => basePath.endsWith(ext))) {
    return checker.exists(basePath);
  }

  // Essayer avec différentes extensions
  for (const ext of JS_TS_EXTENSIONS) {
    if (await checker.exists(basePath + ext)) {
      return true;
    }
  }

  // Essayer comme dossier avec index
  for (const ext of JS_TS_EXTENSIONS) {
    if (await checker.exists(`${basePath}/index${ext}`)) {
      return true;
    }
  }

  return false;
}

/**
 * Vérifie si un identifiant est utilisé dans le code (hors de son import)
 */
function isIdentifierUsed(content: string, identifier: string, importLine: number): boolean {
  const lines = content.split('\n');

  // Créer un regex pour trouver l'utilisation de l'identifiant
  // Doit être précédé par un non-mot et suivi par un non-mot
  const regex = new RegExp(`(?<![\\w$])${escapeRegex(identifier)}(?![\\w$])`, 'g');

  let matchCount = 0;
  for (let i = 0; i < lines.length; i++) {
    // Ignorer la ligne d'import
    if (i + 1 === importLine) {
      continue;
    }

    // Ignorer les commentaires
    const line = lines[i];
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) {
      continue;
    }

    const matches = line.match(regex);
    if (matches) {
      matchCount += matches.length;
    }
  }

  return matchCount > 0;
}

/**
 * Échappe les caractères spéciaux regex
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/*
 * ============================================================================
 * VALIDATION PRE-WRITE
 * ============================================================================
 */

/**
 * Valide le contenu avant écriture et retourne des avertissements
 */
export async function validateBeforeWrite(
  path: string,
  content: string,
  fileChecker?: FileExistsChecker,
): Promise<{ canWrite: boolean; warnings: string[]; errors: string[] }> {
  const warnings: string[] = [];
  const errors: string[] = [];

  // Ne valider que les fichiers TS/JS
  const ext = path.split('.').pop()?.toLowerCase();
  if (!ext || !['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs'].includes(ext)) {
    return { canWrite: true, warnings, errors };
  }

  const validation = await validateImports(content, path, fileChecker);

  // Convertir les erreurs
  for (const error of validation.errors) {
    if (error.code === 'MISSING_FILE') {
      // Pour les fichiers manquants, c'est un warning car le fichier pourrait être créé après
      warnings.push(`[Import Warning] Line ${error.line}: ${error.message}`);
    } else {
      errors.push(`[Import Error] Line ${error.line}: ${error.message}`);
    }
  }

  // Convertir les warnings
  for (const warning of validation.warnings) {
    warnings.push(`[Import Warning] Line ${warning.line}: ${warning.message}`);
  }

  // Les imports manquants ne bloquent pas l'écriture (le fichier pourrait être créé plus tard)
  // Seules les erreurs de syntaxe bloquent
  const canWrite = !validation.errors.some((e) => e.code === 'INVALID_SYNTAX');

  return { canWrite, warnings, errors };
}

/*
 * ============================================================================
 * EXPORTS
 * ============================================================================
 */

export default {
  parseImports,
  validateImports,
  validateBeforeWrite,
};
