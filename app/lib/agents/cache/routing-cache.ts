/**
 * Routing Decision Cache
 *
 * Caches orchestration routing decisions to avoid repeated LLM calls
 * for similar prompts. Uses prompt similarity matching.
 *
 * @module agents/cache/routing-cache
 */

import { createScopedLogger } from '~/utils/logger';
import type { AgentType, OrchestrationDecision } from '../types';

const logger = createScopedLogger('RoutingCache');

/**
 * Contexte enrichi pour le cache
 */
export interface RoutingCacheContext {
  /** Fichiers mentionnés dans le prompt ou la tâche */
  files?: string[];

  /** Dossier de travail */
  workingDirectory?: string;

  /** Type de tâche détecté */
  taskType?: string;

  /** Présence de code dans le prompt */
  hasCode?: boolean;

  /** Présence de chemins de fichiers dans le prompt */
  hasFilePaths?: boolean;

  /** Présence d'erreurs ou messages d'erreur */
  hasErrors?: boolean;

  /** Hash des fichiers contextuels (pour invalidation) */
  contextHash?: string;
}

/**
 * Cache entry structure
 */
interface RoutingCacheEntry {
  decision: OrchestrationDecision;
  promptHash: string;
  normalizedPrompt: string;
  timestamp: number;
  hits: number;

  /** Contexte utilisé lors de la mise en cache */
  context?: RoutingCacheContext;

  /** Indicateurs de patterns détectés */
  patterns: PromptPatterns;
}

/**
 * Cache statistics
 */
export interface RoutingCacheStats {
  hits: number;
  misses: number;
  size: number;
  maxSize: number;
  hitRate: number;

  /** Nombre de lookups ignorés à cause des patterns détectés */
  skippedDueToPatterns: number;

  /** Nombre de lookups ignorés à cause d'un contexte incompatible */
  skippedDueToContext: number;
}

/**
 * Patterns détectés dans un prompt (pour décider si on peut cacher)
 */
interface PromptPatterns {
  /** Contient des chemins de fichiers absolus */
  hasAbsolutePaths: boolean;

  /** Contient des chemins de fichiers relatifs */
  hasRelativePaths: boolean;

  /** Contient du code inline */
  hasCodeBlocks: boolean;

  /** Contient des messages d'erreur */
  hasErrorMessages: boolean;

  /** Contient des références à des lignes spécifiques */
  hasLineReferences: boolean;

  /** Contient des noms de variables/fonctions spécifiques */
  hasSpecificIdentifiers: boolean;

  /** Est une requête générique (safe to cache) */
  isGenericRequest: boolean;
}

/**
 * Cache configuration
 */
export interface RoutingCacheConfig {
  /** Maximum cached entries (default: 50) */
  maxSize?: number;

  /** TTL in milliseconds (default: 5 minutes) */
  ttl?: number;

  /** Enable/disable cache (default: true) */
  enabled?: boolean;

  /** Similarity threshold for fuzzy matching (0-1, default: 0.85) */
  similarityThreshold?: number;

  /** Exclure les prompts avec des chemins de fichiers spécifiques (default: true) */
  excludeSpecificPaths?: boolean;

  /** Exclure les prompts avec du code inline (default: true) */
  excludeCodeBlocks?: boolean;

  /** Exclure les prompts avec des messages d'erreur (default: true) */
  excludeErrorMessages?: boolean;

  /** Activer la validation du contexte (default: true) */
  validateContext?: boolean;
}

/*
 * ============================================================================
 * DÉTECTION DE PATTERNS DANS LES PROMPTS
 * ============================================================================
 */

/**
 * Patterns regex pour détecter différents types de contenu
 */
const DETECTION_PATTERNS = {
  // Chemins de fichiers absolus (Unix et Windows)
  absolutePath: /(?:\/[\w.-]+){2,}|[A-Z]:\\[\w\\.-]+/gi,

  // Chemins relatifs (./path, ../path)
  relativePath: /(?:\.\.?\/[\w.-]+)+/gi,

  // Blocs de code (markdown)
  codeBlock: /```[\s\S]*?```/g,

  // Code inline
  inlineCode: /`[^`]+`/g,

  // Messages d'erreur typiques
  errorMessage:
    /(?:error|exception|failed|cannot|unable|undefined|null|NaN|TypeError|ReferenceError|SyntaxError)[\s:].*$/gim,

  // Références à des lignes (line 42, ligne 15, :123)
  lineReference: /(?:line\s*\d+|ligne\s*\d+|:\d+(?::\d+)?)/gi,

  // Stack traces
  stackTrace: /at\s+[\w.<>]+\s+\(.*:\d+:\d+\)/g,

  // Noms de fichiers spécifiques avec extensions
  specificFile: /[\w-]+\.(ts|tsx|js|jsx|json|css|scss|html|md|yaml|yml|toml|env)/gi,

  // Identifiants spécifiques (camelCase, PascalCase avec 3+ parties)
  specificIdentifier: /\b[a-z]+(?:[A-Z][a-z]+){2,}\b|\b[A-Z][a-z]+(?:[A-Z][a-z]+){2,}\b/g,
};

/**
 * Requêtes génériques qui sont sûres à cacher
 */
const GENERIC_REQUEST_PATTERNS = [
  /^(?:crée?|create|ajoute?|add)\s+(?:un|une|a|an)\s+(?:nouveau?|new)\s+/i,
  /^(?:génère?|generate)\s+(?:un|une|a|an)\s+/i,
  /^(?:lance|run|exécute?|execute)\s+(?:les?\s+)?(?:tests?|build|lint)/i,
  /^(?:installe?|install)\s+(?:les?\s+)?(?:dépendances?|dependencies)/i,
  /^(?:démarre?|start)\s+(?:le\s+)?(?:serveur|server)/i,
  /^(?:arrête?|stop)\s+(?:le\s+)?(?:serveur|server)/i,
  /^(?:vérifie?|check)\s+(?:le\s+)?(?:code|syntax)/i,
  /^(?:formate?|format)\s+(?:le\s+)?code/i,
];

/**
 * Analyser un prompt pour détecter les patterns
 */
function detectPromptPatterns(prompt: string): PromptPatterns {
  const absolutePaths = prompt.match(DETECTION_PATTERNS.absolutePath) || [];
  const relativePaths = prompt.match(DETECTION_PATTERNS.relativePath) || [];
  const codeBlocks = prompt.match(DETECTION_PATTERNS.codeBlock) || [];
  const errorMessages = prompt.match(DETECTION_PATTERNS.errorMessage) || [];
  const lineReferences = prompt.match(DETECTION_PATTERNS.lineReference) || [];
  const specificIdentifiers = prompt.match(DETECTION_PATTERNS.specificIdentifier) || [];

  const hasAbsolutePaths = absolutePaths.length > 0;
  const hasRelativePaths = relativePaths.length > 0;
  const hasCodeBlocks = codeBlocks.length > 0;
  const hasErrorMessages = errorMessages.length > 0;
  const hasLineReferences = lineReferences.length > 0;
  const hasSpecificIdentifiers = specificIdentifiers.length > 3; // Seuil de 3+

  // Vérifier si c'est une requête générique
  const isGenericRequest = GENERIC_REQUEST_PATTERNS.some((pattern) => pattern.test(prompt));

  return {
    hasAbsolutePaths,
    hasRelativePaths,
    hasCodeBlocks,
    hasErrorMessages,
    hasLineReferences,
    hasSpecificIdentifiers,
    isGenericRequest,
  };
}

/**
 * Déterminer si un prompt est éligible au cache basé sur ses patterns
 */
function isPromptCacheable(
  patterns: PromptPatterns,
  config: RoutingCacheConfig,
): { cacheable: boolean; reason?: string } {
  // Les requêtes génériques sont toujours cacheables
  if (patterns.isGenericRequest) {
    return { cacheable: true };
  }

  // Vérifier les exclusions configurées
  if (config.excludeSpecificPaths !== false) {
    if (patterns.hasAbsolutePaths) {
      return { cacheable: false, reason: 'Contains absolute file paths' };
    }
  }

  if (config.excludeCodeBlocks !== false) {
    if (patterns.hasCodeBlocks) {
      return { cacheable: false, reason: 'Contains code blocks' };
    }
  }

  if (config.excludeErrorMessages !== false) {
    if (patterns.hasErrorMessages) {
      return { cacheable: false, reason: 'Contains error messages' };
    }
  }

  // Les références à des lignes spécifiques ne doivent pas être cachées
  if (patterns.hasLineReferences) {
    return { cacheable: false, reason: 'Contains line references' };
  }

  return { cacheable: true };
}

/**
 * Générer un hash de contexte pour la validation
 */
function generateContextHash(context?: RoutingCacheContext): string {
  if (!context) {
    return '';
  }

  const parts: string[] = [];

  if (context.files?.length) {
    parts.push(`files:${context.files.sort().join(',')}`);
  }
  if (context.workingDirectory) {
    parts.push(`cwd:${context.workingDirectory}`);
  }
  if (context.taskType) {
    parts.push(`type:${context.taskType}`);
  }

  return parts.join('|');
}

/**
 * Vérifier si deux contextes sont compatibles
 */
function areContextsCompatible(cachedContext?: RoutingCacheContext, currentContext?: RoutingCacheContext): boolean {
  // Si pas de contexte caché, compatible par défaut
  if (!cachedContext) {
    return true;
  }

  // Si pas de contexte actuel mais contexte caché avec fichiers, pas compatible
  if (!currentContext && cachedContext.files?.length) {
    return false;
  }

  if (!currentContext) {
    return true;
  }

  // Vérifier la compatibilité des types de tâche
  if (cachedContext.taskType && currentContext.taskType) {
    if (cachedContext.taskType !== currentContext.taskType) {
      return false;
    }
  }

  // Vérifier si les fichiers sont similaires
  if (cachedContext.hasFilePaths !== currentContext.hasFilePaths) {
    return false;
  }

  // Vérifier si les erreurs sont similaires
  if (cachedContext.hasErrors !== currentContext.hasErrors) {
    return false;
  }

  return true;
}

/*
 * ============================================================================
 * ROUTING DECISION CACHE
 * ============================================================================
 */

/**
 * Routing Decision Cache implementation
 */
class RoutingDecisionCache {
  private cache: Map<string, RoutingCacheEntry> = new Map();
  private maxSize: number;
  private ttl: number;
  private enabled: boolean;
  private similarityThreshold: number;
  private excludeSpecificPaths: boolean;
  private excludeCodeBlocks: boolean;
  private excludeErrorMessages: boolean;
  private validateContext: boolean;

  private stats = {
    hits: 0,
    misses: 0,
    skippedDueToPatterns: 0,
    skippedDueToContext: 0,
  };

  constructor(config: RoutingCacheConfig = {}) {
    this.maxSize = config.maxSize ?? 50;
    this.ttl = config.ttl ?? 5 * 60 * 1000; // 5 minutes
    this.enabled = config.enabled ?? true;
    this.similarityThreshold = config.similarityThreshold ?? 0.85;
    this.excludeSpecificPaths = config.excludeSpecificPaths ?? true;
    this.excludeCodeBlocks = config.excludeCodeBlocks ?? true;
    this.excludeErrorMessages = config.excludeErrorMessages ?? true;
    this.validateContext = config.validateContext ?? true;
  }

  /**
   * Normalize a prompt for comparison
   * Removes extra whitespace, lowercases, removes common filler words
   */
  private normalizePrompt(prompt: string): string {
    return prompt
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[.,!?;:'"()[\]{}]/g, '')
      .trim();
  }

  /**
   * Generate a hash for exact matching
   */
  private generateHash(normalizedPrompt: string): string {
    let hash = 0;

    for (let i = 0; i < normalizedPrompt.length; i++) {
      const char = normalizedPrompt.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }

    return hash.toString(36);
  }

  /**
   * Calculate Jaccard similarity between two normalized prompts
   */
  private calculateSimilarity(prompt1: string, prompt2: string): number {
    const words1 = new Set(prompt1.split(' ').filter((w) => w.length > 2));
    const words2 = new Set(prompt2.split(' ').filter((w) => w.length > 2));

    if (words1.size === 0 || words2.size === 0) {
      return 0;
    }

    const intersection = new Set([...words1].filter((w) => words2.has(w)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  /**
   * Get cached decision for a prompt
   * @param prompt Le prompt utilisateur
   * @param context Contexte optionnel pour validation supplémentaire
   */
  get(prompt: string, context?: RoutingCacheContext): OrchestrationDecision | null {
    if (!this.enabled) {
      return null;
    }

    // Détecter les patterns du prompt actuel
    const patterns = detectPromptPatterns(prompt);

    // Vérifier si ce type de prompt est éligible au cache
    const cacheability = isPromptCacheable(patterns, {
      excludeSpecificPaths: this.excludeSpecificPaths,
      excludeCodeBlocks: this.excludeCodeBlocks,
      excludeErrorMessages: this.excludeErrorMessages,
    });

    if (!cacheability.cacheable) {
      this.stats.skippedDueToPatterns++;
      logger.debug('Cache lookup skipped due to patterns', { reason: cacheability.reason });
      return null;
    }

    const normalizedPrompt = this.normalizePrompt(prompt);
    const hash = this.generateHash(normalizedPrompt);
    const now = Date.now();

    // First try exact match
    const exactEntry = this.cache.get(hash);

    if (exactEntry && now - exactEntry.timestamp < this.ttl) {
      // Validation du contexte si activée
      if (this.validateContext && !areContextsCompatible(exactEntry.context, context)) {
        this.stats.skippedDueToContext++;
        logger.debug('Cache hit rejected due to context mismatch', { hash });

        // Ne pas retourner l'entrée, mais ne pas la supprimer non plus
        this.stats.misses++;
        return null;
      }

      exactEntry.hits++;
      this.stats.hits++;
      logger.debug('Routing cache hit (exact)', { hash, action: exactEntry.decision.action });
      return exactEntry.decision;
    }

    // Try fuzzy match if exact match fails
    for (const entry of this.cache.values()) {
      if (now - entry.timestamp >= this.ttl) {
        continue;
      }

      const similarity = this.calculateSimilarity(normalizedPrompt, entry.normalizedPrompt);

      if (similarity >= this.similarityThreshold) {
        // Validation du contexte si activée
        if (this.validateContext && !areContextsCompatible(entry.context, context)) {
          this.stats.skippedDueToContext++;
          logger.debug('Fuzzy cache hit rejected due to context mismatch', { similarity: similarity.toFixed(2) });
          continue; // Essayer d'autres entrées
        }

        entry.hits++;
        this.stats.hits++;
        logger.debug('Routing cache hit (fuzzy)', { similarity: similarity.toFixed(2), action: entry.decision.action });
        return entry.decision;
      }
    }

    this.stats.misses++;
    return null;
  }

  /**
   * Cache a routing decision
   * @param prompt Le prompt utilisateur
   * @param decision La décision d'orchestration
   * @param context Contexte optionnel pour validation future
   */
  set(prompt: string, decision: OrchestrationDecision, context?: RoutingCacheContext): void {
    if (!this.enabled) {
      return;
    }

    // Only cache 'delegate' and 'decompose' decisions (not ask_user, execute_directly)
    if (decision.action !== 'delegate' && decision.action !== 'decompose') {
      return;
    }

    // Détecter les patterns du prompt
    const patterns = detectPromptPatterns(prompt);

    // Vérifier si ce prompt est éligible au cache
    const cacheability = isPromptCacheable(patterns, {
      excludeSpecificPaths: this.excludeSpecificPaths,
      excludeCodeBlocks: this.excludeCodeBlocks,
      excludeErrorMessages: this.excludeErrorMessages,
    });

    if (!cacheability.cacheable) {
      logger.debug('Routing decision NOT cached due to patterns', {
        reason: cacheability.reason,
        action: decision.action,
      });
      return;
    }

    const normalizedPrompt = this.normalizePrompt(prompt);
    const hash = this.generateHash(normalizedPrompt);

    // Evict oldest entries if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(hash)) {
      this.evictOldest();
    }

    // Enrichir le contexte avec les informations détectées
    const enrichedContext: RoutingCacheContext = {
      ...context,
      hasCode: patterns.hasCodeBlocks,
      hasFilePaths: patterns.hasAbsolutePaths || patterns.hasRelativePaths,
      hasErrors: patterns.hasErrorMessages,
      contextHash: generateContextHash(context),
    };

    const entry: RoutingCacheEntry = {
      decision,
      promptHash: hash,
      normalizedPrompt,
      timestamp: Date.now(),
      hits: 0,
      context: enrichedContext,
      patterns,
    };

    this.cache.set(hash, entry);
    logger.debug('Routing decision cached', {
      action: decision.action,
      targetAgent: decision.targetAgent,
      isGeneric: patterns.isGenericRequest,
    });
  }

  /**
   * Evict the oldest entry
   */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): RoutingCacheStats {
    const totalRequests = this.stats.hits + this.stats.misses;

    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: totalRequests > 0 ? (this.stats.hits / totalRequests) * 100 : 0,
      skippedDueToPatterns: this.stats.skippedDueToPatterns,
      skippedDueToContext: this.stats.skippedDueToContext,
    };
  }

  /**
   * Clear the cache
   */
  clear(): void {
    this.cache.clear();
    this.stats = { hits: 0, misses: 0, skippedDueToPatterns: 0, skippedDueToContext: 0 };
    logger.debug('Routing cache cleared');
  }

  /**
   * Cleanup expired entries
   */
  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp >= this.ttl) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug(`Cleaned ${cleaned} expired routing cache entries`);
    }

    return cleaned;
  }

  /**
   * Enable/disable the cache
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    logger.debug(`Routing cache ${enabled ? 'enabled' : 'disabled'}`);
  }
}

/**
 * Global routing cache instance
 */
export const routingCache = new RoutingDecisionCache();

/**
 * Get cached routing decision for a prompt
 * @param prompt Le prompt utilisateur
 * @param context Contexte optionnel pour validation supplémentaire
 */
export function getCachedRouting(prompt: string, context?: RoutingCacheContext): OrchestrationDecision | null {
  return routingCache.get(prompt, context);
}

/**
 * Cache a routing decision
 * @param prompt Le prompt utilisateur
 * @param decision La décision d'orchestration
 * @param context Contexte optionnel pour validation future
 */
export function cacheRouting(prompt: string, decision: OrchestrationDecision, context?: RoutingCacheContext): void {
  routingCache.set(prompt, decision, context);
}

/**
 * Analyser un prompt pour détecter ses patterns (utilitaire exporté)
 */
export function analyzePromptPatterns(prompt: string): {
  patterns: PromptPatterns;
  cacheable: boolean;
  reason?: string;
} {
  const patterns = detectPromptPatterns(prompt);
  const cacheability = isPromptCacheable(patterns, {});
  return {
    patterns,
    cacheable: cacheability.cacheable,
    reason: cacheability.reason,
  };
}

/**
 * Get routing cache statistics
 */
export function getRoutingCacheStats(): RoutingCacheStats {
  return routingCache.getStats();
}

/**
 * Clear routing cache
 */
export function clearRoutingCache(): void {
  routingCache.clear();
}

/**
 * Cleanup expired routing cache entries
 */
export function cleanupRoutingCache(): number {
  return routingCache.cleanup();
}
