/**
 * Output Parser - Utilitaires robustes pour parser les sorties des agents
 *
 * Améliorations par rapport aux regex fragiles:
 * - Support de toutes les extensions de fichiers courantes
 * - Gestion des chemins Windows et Unix
 * - Extraction JSON flexible (avec/sans markdown)
 * - Validation des chemins de fichiers
 * - Détection des URLs pour éviter les faux positifs
 */

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('OutputParser');

/*
 * ============================================================================
 * FILE PATH EXTRACTION
 * ============================================================================
 */

/**
 * Extensions de fichiers supportées (communes en développement)
 */
const KNOWN_EXTENSIONS = new Set([
  // JavaScript/TypeScript
  'js',
  'jsx',
  'ts',
  'tsx',
  'mjs',
  'cjs',
  'mts',
  'cts',

  // Web
  'html',
  'htm',
  'css',
  'scss',
  'sass',
  'less',
  'vue',
  'svelte',

  // Data
  'json',
  'yaml',
  'yml',
  'xml',
  'toml',
  'ini',
  'env',

  // Config
  'config',
  'rc',
  'lock',
  'gitignore',
  'npmrc',
  'nvmrc',

  // Documentation
  'md',
  'mdx',
  'txt',
  'rst',
  'adoc',

  // Images
  'png',
  'jpg',
  'jpeg',
  'gif',
  'svg',
  'webp',
  'ico',
  'avif',

  // Other languages
  'py',
  'rb',
  'go',
  'rs',
  'java',
  'kt',
  'swift',
  'c',
  'cpp',
  'h',
  'hpp',
  'php',
  'sh',
  'bash',
  'zsh',
  'ps1',
  'bat',
  'cmd',

  // Build/Package
  'gradle',
  'maven',
  'dockerfile',
  'makefile',

  // Testing
  'spec',
  'test',
  'snap',
]);

/**
 * Patterns pour identifier les URLs (à exclure)
 */
const URL_PATTERNS = [/^https?:\/\//i, /^ftp:\/\//i, /^mailto:/i, /^tel:/i, /^data:/i, /^file:\/\//i, /^www\./i];

/**
 * Pattern robuste pour extraire les chemins de fichiers
 * Supporte:
 * - Chemins Unix: /path/to/file.ext, ./relative/path.ext, ../parent/file.ext
 * - Chemins Windows: C:\path\to\file.ext, .\relative\path.ext
 * - Extensions longues: .config.js, .spec.ts, .d.ts
 * - Noms avec tirets et underscores: my-component_v2.tsx
 */
const FILE_PATH_PATTERN =
  /(?:^|[\s"'`\[(])([a-zA-Z]:\\(?:[\w\-._]+\\)*[\w\-._]+\.[\w.]+|(?:\.{0,2}\/)?(?:[\w\-._@]+\/)*[\w\-._@]+\.[\w.]+)(?:[\s"'`\]),:]|$)/g;

/**
 * Extrait les chemins de fichiers d'un texte
 */
export function extractFilePaths(text: string): string[] {
  const matches: string[] = [];
  const seen = new Set<string>();

  // Reset regex
  FILE_PATH_PATTERN.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = FILE_PATH_PATTERN.exec(text)) !== null) {
    let path = match[1].trim();

    // Normaliser le chemin (Windows -> Unix)
    path = path.replace(/\\/g, '/');

    // Nettoyer les caractères de ponctuation trailing
    path = path.replace(/[,;:]+$/, '');

    // Vérifier que ce n'est pas une URL
    if (URL_PATTERNS.some((pattern) => pattern.test(path))) {
      continue;
    }

    // Extraire l'extension
    const extMatch = path.match(/\.([a-z0-9]+)$/i);
    if (!extMatch) {
      continue;
    }

    const ext = extMatch[1].toLowerCase();

    // Vérifier si l'extension est connue ou si le fichier a une structure valide
    const isValidExtension =
      KNOWN_EXTENSIONS.has(ext) ||
      // Extensions composées comme .config.js, .spec.ts
      /\.(config|spec|test|d)\.[a-z]+$/i.test(path);

    if (!isValidExtension) {
      // Vérifier si ça ressemble à un fichier quand même (a une structure de chemin)
      if (!/^[./]/.test(path) && !path.includes('/')) {
        continue;
      }
    }

    // Éviter les doublons
    if (!seen.has(path)) {
      seen.add(path);
      matches.push(path);
    }
  }

  return matches;
}

/**
 * Valide si un chemin ressemble à un vrai fichier
 */
export function isValidFilePath(path: string): boolean {
  // Doit avoir une extension
  if (!path.includes('.')) {
    return false;
  }

  // Ne doit pas être une URL
  if (URL_PATTERNS.some((pattern) => pattern.test(path))) {
    return false;
  }

  // Ne doit pas contenir de caractères invalides
  if (/[<>"|?*]/.test(path)) {
    return false;
  }

  // Ne doit pas être trop long
  if (path.length > 260) {
    return false;
  }

  // Doit avoir une structure de chemin valide
  const parts = path.split('/').filter(Boolean);
  if (parts.length === 0) {
    return false;
  }

  // Le dernier segment doit avoir une extension valide
  const fileName = parts[parts.length - 1];
  const extMatch = fileName.match(/\.([a-z0-9]+)$/i);

  return extMatch !== null;
}

/*
 * ============================================================================
 * JSON EXTRACTION
 * ============================================================================
 */

/**
 * Patterns pour extraire du JSON (du plus strict au plus permissif)
 */
const JSON_PATTERNS = [
  // Markdown code block avec json
  /```json\s*\n([\s\S]*?)\n\s*```/gi,

  // Markdown code block sans langage
  /```\s*\n(\{[\s\S]*?\})\n\s*```/gi,

  // JSON brut (objet)
  /(\{[\s\S]*\})/g,

  // JSON brut (tableau)
  /(\[[\s\S]*\])/g,
];

/**
 * Résultat d'un parsing JSON avec contexte d'erreur
 */
export interface JSONParseResult<T> {
  success: boolean;
  data: T | null;
  error?: JSONParseError;
}

/**
 * Erreur de parsing JSON avec contexte enrichi
 */
export interface JSONParseError {
  message: string;
  position?: number;
  line?: number;
  column?: number;
  context?: string;
  rawInput?: string;
}

/**
 * Parse du JSON de manière sécurisée avec contexte d'erreur enrichi
 * Améliore le debugging en fournissant:
 * - Position exacte de l'erreur
 * - Ligne et colonne de l'erreur
 * - Contexte autour de l'erreur
 * - Le contenu brut problématique
 *
 * @param jsonStr - Chaîne JSON à parser
 * @param options - Options de parsing
 * @returns Résultat avec données ou erreur détaillée
 */
export function safeJSONParse<T = unknown>(
  jsonStr: string,
  options: { logErrors?: boolean; maxContextLength?: number } = {},
): JSONParseResult<T> {
  const { logErrors = true, maxContextLength = 50 } = options;

  try {
    const parsed = JSON.parse(jsonStr) as T;
    return { success: true, data: parsed };
  } catch (err) {
    const error = err as SyntaxError;

    // Extraire la position de l'erreur du message
    // Format typique: "Unexpected token X in JSON at position Y"
    const positionMatch = error.message.match(/at position (\d+)/);
    const position = positionMatch ? parseInt(positionMatch[1], 10) : undefined;

    // Calculer ligne et colonne si on a la position
    let line: number | undefined;
    let column: number | undefined;
    let context: string | undefined;

    if (position !== undefined && position >= 0 && position < jsonStr.length) {
      const beforeError = jsonStr.substring(0, position);
      const lines = beforeError.split('\n');
      line = lines.length;
      column = (lines[lines.length - 1]?.length || 0) + 1;

      // Extraire le contexte autour de l'erreur
      const startContext = Math.max(0, position - maxContextLength);
      const endContext = Math.min(jsonStr.length, position + maxContextLength);
      const before = jsonStr.substring(startContext, position);
      const after = jsonStr.substring(position, endContext);
      context = `${startContext > 0 ? '...' : ''}${before}>>>HERE<<<${after}${endContext < jsonStr.length ? '...' : ''}`;
    }

    // Tronquer le rawInput si trop long pour les logs
    const maxRawLength = 200;
    const rawInput = jsonStr.length > maxRawLength ? jsonStr.substring(0, maxRawLength) + '...' : jsonStr;

    const parseError: JSONParseError = {
      message: error.message,
      position,
      line,
      column,
      context,
      rawInput,
    };

    // Log l'erreur avec contexte
    if (logErrors) {
      logger.warn('JSON parse error with context', {
        message: parseError.message,
        position: parseError.position,
        line: parseError.line,
        column: parseError.column,
        context: parseError.context,
        inputLength: jsonStr.length,
      });
    }

    return { success: false, data: null, error: parseError };
  }
}

/**
 * Formater une erreur de parsing JSON pour l'affichage
 */
export function formatJSONParseError(error: JSONParseError): string {
  const lines: string[] = [`JSON Parse Error: ${error.message}`];

  if (error.line !== undefined && error.column !== undefined) {
    lines.push(`  Location: line ${error.line}, column ${error.column}`);
  }
  if (error.position !== undefined) {
    lines.push(`  Position: ${error.position}`);
  }
  if (error.context) {
    lines.push(`  Context: ${error.context}`);
  }
  if (error.rawInput) {
    lines.push(`  Input preview: ${error.rawInput}`);
  }

  return lines.join('\n');
}

/**
 * Extrait du JSON d'un texte de manière flexible
 * Utilise safeJSONParse pour un meilleur logging des erreurs
 */
export function extractJSON<T = unknown>(text: string, options?: { logErrors?: boolean }): T | null {
  const logErrors = options?.logErrors ?? false; // Silencieux par défaut pour ne pas spammer

  for (const pattern of JSON_PATTERNS) {
    // Reset regex
    pattern.lastIndex = 0;

    const match = pattern.exec(text);
    if (match) {
      const jsonStr = match[1].trim();
      const result = safeJSONParse<T>(jsonStr, { logErrors });

      if (result.success && result.data !== null) {
        return result.data;
      }
      // Essayer le pattern suivant si échec
    }
  }

  return null;
}

/**
 * Extrait du JSON avec rapport d'erreur détaillé
 * Utile quand on veut comprendre pourquoi le parsing a échoué
 */
export function extractJSONWithErrors<T = unknown>(text: string): {
  data: T | null;
  errors: JSONParseError[];
  attemptedPatterns: string[];
} {
  const errors: JSONParseError[] = [];
  const attemptedPatterns: string[] = [];

  for (const pattern of JSON_PATTERNS) {
    pattern.lastIndex = 0;

    const match = pattern.exec(text);
    if (match) {
      const jsonStr = match[1].trim();
      attemptedPatterns.push(pattern.source.substring(0, 30) + '...');

      const result = safeJSONParse<T>(jsonStr, { logErrors: false });

      if (result.success && result.data !== null) {
        return { data: result.data, errors, attemptedPatterns };
      }

      if (result.error) {
        errors.push(result.error);
      }
    }
  }

  return { data: null, errors, attemptedPatterns };
}

/**
 * Extrait tous les objets JSON d'un texte
 * Avec logging amélioré des erreurs
 */
export function extractAllJSON(text: string, options?: { logErrors?: boolean }): unknown[] {
  const results: unknown[] = [];
  const seen = new Set<string>();
  const logErrors = options?.logErrors ?? false;

  for (const pattern of JSON_PATTERNS) {
    pattern.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const jsonStr = match[1].trim();

      // Éviter les doublons
      if (seen.has(jsonStr)) {
        continue;
      }
      seen.add(jsonStr);

      const result = safeJSONParse(jsonStr, { logErrors });
      if (result.success && result.data !== null) {
        results.push(result.data);
      }
    }
  }

  return results;
}

/*
 * ============================================================================
 * CODE BLOCK EXTRACTION
 * ============================================================================
 */

/**
 * Interface pour un bloc de code extrait
 */
export interface CodeBlock {
  language: string | null;
  content: string;
  startIndex: number;
  endIndex: number;
}

/**
 * Pattern pour les blocs de code markdown
 */
const CODE_BLOCK_PATTERN = /```(\w*)\s*\n([\s\S]*?)\n\s*```/g;

/**
 * Extrait tous les blocs de code d'un texte
 */
export function extractCodeBlocks(text: string): CodeBlock[] {
  const blocks: CodeBlock[] = [];

  CODE_BLOCK_PATTERN.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = CODE_BLOCK_PATTERN.exec(text)) !== null) {
    blocks.push({
      language: match[1] || null,
      content: match[2],
      startIndex: match.index,
      endIndex: match.index + match[0].length,
    });
  }

  return blocks;
}

/**
 * Extrait les blocs de code d'un langage spécifique
 */
export function extractCodeBlocksByLanguage(text: string, language: string): string[] {
  const blocks = extractCodeBlocks(text);
  const normalizedLang = language.toLowerCase();

  return blocks.filter((block) => block.language?.toLowerCase() === normalizedLang).map((block) => block.content);
}

/*
 * ============================================================================
 * LINE NUMBER EXTRACTION
 * ============================================================================
 */

/**
 * Interface pour une référence de ligne
 */
export interface LineReference {
  file: string;
  line: number;
  column?: number;
}

/**
 * Patterns pour les références de lignes dans différents formats
 */
const LINE_REF_PATTERNS = [
  // file.ts:123
  /([^\s:]+\.[a-z]+):(\d+)(?::(\d+))?/gi,

  // file.ts, line 123
  /([^\s,]+\.[a-z]+),?\s+(?:line|ligne|l\.)\s*(\d+)/gi,

  // at file.ts (123:45)
  /at\s+([^\s(]+\.[a-z]+)\s*\((\d+)(?::(\d+))?\)/gi,

  // file.ts(123)
  /([^\s(]+\.[a-z]+)\((\d+)(?::(\d+))?\)/gi,
];

/**
 * Extrait les références de lignes d'un texte
 */
export function extractLineReferences(text: string): LineReference[] {
  const refs: LineReference[] = [];
  const seen = new Set<string>();

  for (const pattern of LINE_REF_PATTERNS) {
    pattern.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = pattern.exec(text)) !== null) {
      const file = match[1];
      const line = parseInt(match[2], 10);
      const column = match[3] ? parseInt(match[3], 10) : undefined;

      const key = `${file}:${line}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      if (isValidFilePath(file) && line > 0) {
        refs.push({ file, line, column });
      }
    }
  }

  return refs;
}

/*
 * ============================================================================
 * TEST RESULTS PARSING
 * ============================================================================
 */

/**
 * Interface pour les résultats de tests
 */
export interface TestResults {
  passed: number;
  failed: number;
  skipped: number;
  total: number;
  duration?: number;
  framework?: string;
  suites?: number;
}

/**
 * Patterns pour différents frameworks de test
 */
const TEST_PATTERNS = {
  // Jest/Vitest: Tests: 5 passed, 2 failed, 7 total
  jestVitest: [
    /Tests?:\s*(\d+)\s*passed(?:,\s*(\d+)\s*failed)?(?:,\s*(\d+)\s*skipped)?(?:,\s*(\d+)\s*total)?/i,
    /(\d+)\s*passed,\s*(\d+)\s*failed/i,
    /✓\s*(\d+)\s*(?:tests?\s*)?passed/i,
    /✕\s*(\d+)\s*(?:tests?\s*)?failed/i,
  ],

  // Mocha: passing (5), failing (2)
  mocha: [/(\d+)\s*passing/i, /(\d+)\s*failing/i, /(\d+)\s*pending/i],

  // pytest: 5 passed, 2 failed in 1.23s
  pytest: [
    /(\d+)\s*passed(?:,\s*(\d+)\s*failed)?(?:,\s*(\d+)\s*skipped)?(?:\s+in\s+([\d.]+)s)?/i,
    /=+\s*(\d+)\s*passed/i,
  ],

  // Go: ok/FAIL, --- PASS/FAIL
  goTest: [/---\s*PASS:\s*(\d+)/i, /---\s*FAIL:\s*(\d+)/i, /ok\s+[\w./]+\s+([\d.]+)s/i],

  // Duration patterns
  duration: [
    /Time:\s*([\d.]+)\s*(?:ms|s|sec|seconds?)/i,
    /Duration:\s*([\d.]+)\s*(?:ms|s)/i,
    /Ran.*in\s*([\d.]+)\s*(?:ms|s)/i,
    /finished\s+in\s*([\d.]+)\s*(?:ms|s)/i,
    /\(([\d.]+)\s*(?:ms|s)\)/i,
  ],
};

/**
 * Parse les résultats de tests de manière robuste
 */
export function parseTestResults(output: string): TestResults {
  const results: TestResults = {
    passed: 0,
    failed: 0,
    skipped: 0,
    total: 0,
  };

  // Essayer Jest/Vitest format
  for (const pattern of TEST_PATTERNS.jestVitest) {
    const match = output.match(pattern);
    if (match) {
      results.framework = 'jest/vitest';
      if (match[1]) {
        results.passed = parseInt(match[1], 10);
      }
      if (match[2]) {
        results.failed = parseInt(match[2], 10);
      }
      if (match[3]) {
        results.skipped = parseInt(match[3], 10);
      }
      if (match[4]) {
        results.total = parseInt(match[4], 10);
      }
      break;
    }
  }

  // Essayer Mocha format si pas trouvé
  if (results.passed === 0 && results.failed === 0) {
    const passingMatch = output.match(TEST_PATTERNS.mocha[0]);
    const failingMatch = output.match(TEST_PATTERNS.mocha[1]);
    const pendingMatch = output.match(TEST_PATTERNS.mocha[2]);

    if (passingMatch || failingMatch) {
      results.framework = 'mocha';
      if (passingMatch) {
        results.passed = parseInt(passingMatch[1], 10);
      }
      if (failingMatch) {
        results.failed = parseInt(failingMatch[1], 10);
      }
      if (pendingMatch) {
        results.skipped = parseInt(pendingMatch[1], 10);
      }
    }
  }

  // Essayer pytest format
  if (results.passed === 0 && results.failed === 0) {
    for (const pattern of TEST_PATTERNS.pytest) {
      const match = output.match(pattern);
      if (match) {
        results.framework = 'pytest';
        results.passed = parseInt(match[1], 10);
        if (match[2]) {
          results.failed = parseInt(match[2], 10);
        }
        if (match[3]) {
          results.skipped = parseInt(match[3], 10);
        }
        if (match[4]) {
          results.duration = parseFloat(match[4]) * 1000; // Convert to ms
        }
        break;
      }
    }
  }

  // Compter les symboles ✓ et ✕ comme fallback
  if (results.passed === 0 && results.failed === 0) {
    const passSymbols = (output.match(/[✓✔]/g) || []).length;
    const failSymbols = (output.match(/[✕✗✘×]/g) || []).length;

    if (passSymbols > 0 || failSymbols > 0) {
      results.passed = passSymbols;
      results.failed = failSymbols;
    }
  }

  // Extraire la durée si pas encore trouvée
  if (!results.duration) {
    for (const pattern of TEST_PATTERNS.duration) {
      const match = output.match(pattern);
      if (match) {
        let duration = parseFloat(match[1]);

        // Convertir en ms si en secondes
        if (output.match(new RegExp(match[1] + '\\s*s(?:ec|econds?)?', 'i'))) {
          duration *= 1000;
        }
        results.duration = duration;
        break;
      }
    }
  }

  // Calculer le total
  results.total = results.passed + results.failed + results.skipped;

  return results;
}

/*
 * ============================================================================
 * EXPORTS
 * ============================================================================
 */

export default {
  extractFilePaths,
  isValidFilePath,
  extractJSON,
  extractJSONWithErrors,
  extractAllJSON,
  safeJSONParse,
  formatJSONParseError,
  extractCodeBlocks,
  extractCodeBlocksByLanguage,
  extractLineReferences,
  parseTestResults,
};
