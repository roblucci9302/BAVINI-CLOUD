/**
 * Reviewer Agent - Agent spécialisé dans la review de code
 * Analyse la qualité, la sécurité, et suggère des améliorations
 */

import { BaseAgent } from '../core/base-agent';
import type { ToolHandler } from '../core/tool-registry';
import {
  REVIEW_TOOLS,
  createReviewToolHandlers,
  type CodeAnalyzer,
  type AnalysisResult,
  type CodeIssue,
} from '../tools/review-tools';
import { READ_TOOLS, type FileSystem } from '../tools/read-tools';
import { getSharedReadHandlers } from '../utils/shared-handler-pool';
import { LRUCache } from '../utils/lru-cache';
import { REVIEWER_SYSTEM_PROMPT } from '../prompts/reviewer-prompt';
import type { Task, TaskResult, ToolDefinition, Artifact, ToolExecutionResult } from '../types';
import { getModelForAgent, AGENT_HISTORY_LIMIT } from '../types';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('ReviewerAgent');

/*
 * ============================================================================
 * TYPES
 * ============================================================================
 */

/**
 * Configuration du cache d'analyse
 */
export interface AnalysisCacheConfig {
  /** Taille maximale du cache (nombre d'analyses) */
  maxSize: number;

  /** TTL en ms (0 = pas d'expiration) */
  ttl: number;

  /** Activer/désactiver le cache */
  enabled: boolean;
}

/**
 * Entrée de cache d'analyse avec métadonnées
 */
interface CachedAnalysis {
  result: AnalysisResult;
  contentHash: string;
  timestamp: number;
}

/**
 * Statistiques du cache d'analyse
 */
export interface AnalysisCacheStats {
  hits: number;
  misses: number;
  size: number;
  maxSize: number;
  hitRate: number;
}

/**
 * Rapport de review complet
 */
export interface ReviewReport {
  summary: string;
  score: {
    overall: number;
    quality: number;
    security: number;
    performance: number;
    maintainability: number;
  };
  issues: CodeIssue[];
  recommendations: string[];
  metrics: {
    filesReviewed: number;
    linesReviewed: number;
    issuesFound: number;
    criticalIssues: number;
  };
}

/*
 * ============================================================================
 * REVIEWER AGENT
 * ============================================================================
 */

/**
 * Configuration par défaut du cache d'analyse
 */
const DEFAULT_CACHE_CONFIG: AnalysisCacheConfig = {
  maxSize: 100,
  ttl: 5 * 60 * 1000, // 5 minutes
  enabled: true,
};

/**
 * Agent de review de code
 */
export class ReviewerAgent extends BaseAgent {
  private analyzer: CodeAnalyzer | null = null;
  private fileSystem: FileSystem | null = null;
  private reviewHistory: Array<{
    timestamp: Date;
    file: string;
    score: number;
    issuesFound: number;
  }> = [];

  /** Cache d'analyse pour éviter les analyses redondantes */
  private analysisCache: LRUCache<CachedAnalysis>;
  private cacheConfig: AnalysisCacheConfig;
  private cacheStats = { hits: 0, misses: 0 };

  constructor(cacheConfig: Partial<AnalysisCacheConfig> = {}) {
    super({
      name: 'reviewer',
      description:
        'Agent de review de code. Analyse la qualité, la sécurité, la performance. ' +
        'Détecte les code smells, calcule la complexité, suggère des améliorations.',
      model: getModelForAgent('reviewer'), // Opus 4.5 pour analyse approfondie
      tools: [...REVIEW_TOOLS, ...READ_TOOLS],
      systemPrompt: REVIEWER_SYSTEM_PROMPT,
      maxTokens: 16384, // Increased from 8K to 16K for complete reviews
      temperature: 0.2, // Légère variation pour suggestions créatives
      timeout: 180000, // 3 minutes - analyses peuvent être intensives
      maxRetries: 2, // Réessayer si l'analyse échoue
    });

    // Initialiser le cache d'analyse
    this.cacheConfig = { ...DEFAULT_CACHE_CONFIG, ...cacheConfig };
    this.analysisCache = new LRUCache<CachedAnalysis>({
      maxSize: this.cacheConfig.maxSize,
      ttl: this.cacheConfig.ttl,
    });
  }

  /**
   * Implémentation du system prompt
   */
  getSystemPrompt(): string {
    return REVIEWER_SYSTEM_PROMPT;
  }

  /**
   * Exécution principale de l'agent (appelée par run())
   */
  async execute(task: Task): Promise<TaskResult> {
    // Vérifier que l'analyseur est initialisé
    if (!this.analyzer) {
      return {
        success: false,
        output: 'CodeAnalyzer not initialized. Call setAnalyzer() first.',
        errors: [
          {
            code: 'ANALYZER_NOT_INITIALIZED',
            message: 'CodeAnalyzer not initialized',
            recoverable: false,
          },
        ],
      };
    }

    // Construire le prompt avec contexte
    let prompt = task.prompt;

    // Ajouter l'historique récent des reviews au contexte
    if (this.reviewHistory.length > 0) {
      const recent = this.reviewHistory.slice(-5);
      prompt += '\n\nHistorique récent des reviews:\n';

      for (const entry of recent) {
        prompt += `- ${entry.timestamp.toISOString()}: ${entry.file} - Score: ${entry.score}/100, ${entry.issuesFound} problèmes\n`;
      }
    }

    // Exécuter la boucle d'agent
    const result = await this.runAgentLoop(prompt);

    // Ajouter les artefacts du rapport de review
    if (result.success && result.data?.reviewReport) {
      result.artifacts = result.artifacts || [];

      const reviewArtifact: Artifact = {
        type: 'message',
        content: JSON.stringify(result.data.reviewReport, null, 2),
        title: 'Review Report',
      };
      result.artifacts.push(reviewArtifact);
    }

    return result;
  }

  /**
   * Initialiser l'analyseur de code
   * Enregistre les outils de review dans le ToolRegistry
   */
  setAnalyzer(analyzer: CodeAnalyzer): void {
    this.analyzer = analyzer;

    // Créer des handlers wrappés pour tracker les reviews
    const handlers = createReviewToolHandlers(analyzer);
    const wrappedHandlers = this.wrapReviewHandlersWithTracking(handlers);
    this.registerTools(REVIEW_TOOLS, wrappedHandlers, 'review');

    this.log('info', 'CodeAnalyzer initialized for ReviewerAgent with ToolRegistry');
  }

  /**
   * Initialiser le système de fichiers (pour la lecture)
   * Enregistre les outils de lecture dans le ToolRegistry
   */
  setFileSystem(fs: FileSystem): void {
    this.fileSystem = fs;

    // Utiliser les handlers partagés (cached via WeakMap)
    const handlers = getSharedReadHandlers(fs);
    this.registerTools(READ_TOOLS, handlers as unknown as Record<string, ToolHandler>, 'filesystem');

    this.log('info', 'FileSystem initialized for ReviewerAgent with ToolRegistry');
  }

  /**
   * Wrapper les handlers de review pour tracker les résultats et utiliser le cache
   */
  private wrapReviewHandlersWithTracking(
    handlers: ReturnType<typeof createReviewToolHandlers>,
  ): Record<string, ToolHandler> {
    const wrapped: Record<string, ToolHandler> = {};

    for (const [name, handler] of Object.entries(handlers)) {
      wrapped[name] = async (input: Record<string, unknown>): Promise<ToolExecutionResult> => {
        // Pour l'analyse de code, vérifier le cache
        if (name === 'analyze_code' && this.cacheConfig.enabled) {
          const filePath = input.file as string | undefined;
          const content = input.content as string | undefined;

          if (filePath && content) {
            const contentHash = this.generateContentHash(content);
            const cacheKey = `${filePath}:${contentHash}`;

            // Vérifier le cache
            const cached = this.analysisCache.get(cacheKey);
            if (cached && cached.contentHash === contentHash) {
              this.cacheStats.hits++;
              logger.debug('Analysis cache hit', { file: filePath, cacheKey });

              // Retourner le résultat caché
              return {
                success: true,
                output: cached.result,
              };
            }

            this.cacheStats.misses++;
          }
        }

        const result = await (handler as (input: unknown) => Promise<unknown>)(input);

        // Tracker et cacher les résultats d'analyse
        if (name === 'analyze_code' && result) {
          const analysisResult = result as AnalysisResult;
          this.trackReview(analysisResult);

          // Mettre en cache si activé
          if (this.cacheConfig.enabled) {
            const filePath = input.file as string | undefined;
            const content = input.content as string | undefined;

            if (filePath && content) {
              const contentHash = this.generateContentHash(content);
              const cacheKey = `${filePath}:${contentHash}`;

              this.analysisCache.set(cacheKey, {
                result: analysisResult,
                contentHash,
                timestamp: Date.now(),
              });

              logger.debug('Analysis cached', { file: filePath, cacheKey });
            }
          }
        }

        // Wrapper le résultat dans le format attendu
        return {
          success: true,
          output: result,
        };
      };
    }

    return wrapped;
  }

  /**
   * Générer un hash simple du contenu pour le cache
   */
  private generateContentHash(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(36);
  }

  /**
   * Obtenir les statistiques du cache d'analyse
   */
  getAnalysisCacheStats(): AnalysisCacheStats {
    const lruStats = this.analysisCache.getStats();
    const total = this.cacheStats.hits + this.cacheStats.misses;

    return {
      hits: this.cacheStats.hits,
      misses: this.cacheStats.misses,
      size: lruStats.size,
      maxSize: lruStats.maxSize,
      hitRate: total > 0 ? (this.cacheStats.hits / total) * 100 : 0,
    };
  }

  /**
   * Vider le cache d'analyse
   */
  clearAnalysisCache(): void {
    this.analysisCache.clear();
    this.cacheStats = { hits: 0, misses: 0 };
    logger.info('Analysis cache cleared');
  }

  /**
   * Invalider une entrée spécifique du cache (par chemin de fichier)
   */
  invalidateCacheForFile(filePath: string): void {
    const keys = this.analysisCache.keys();
    for (const key of keys) {
      if (key.startsWith(filePath + ':')) {
        this.analysisCache.delete(key);
        logger.debug('Cache invalidated for file', { file: filePath });
      }
    }
  }

  /**
   * Configurer le cache d'analyse
   */
  configureCache(config: Partial<AnalysisCacheConfig>): void {
    this.cacheConfig = { ...this.cacheConfig, ...config };

    // Recréer le cache si la taille ou TTL a changé
    if (config.maxSize !== undefined || config.ttl !== undefined) {
      const oldCache = this.analysisCache;
      this.analysisCache = new LRUCache<CachedAnalysis>({
        maxSize: this.cacheConfig.maxSize,
        ttl: this.cacheConfig.ttl,
      });

      // Optionnel: migrer les entrées existantes (si désactivation non demandée)
      if (this.cacheConfig.enabled) {
        for (const key of oldCache.keys()) {
          const value = oldCache.get(key);
          if (value) {
            this.analysisCache.set(key, value);
          }
        }
      }
    }

    logger.info('Analysis cache configured', { config: this.cacheConfig });
  }

  /**
   * Obtenir l'historique des reviews
   */
  getReviewHistory(): typeof this.reviewHistory {
    return [...this.reviewHistory];
  }

  /**
   * Vider l'historique des reviews
   */
  clearReviewHistory(): void {
    this.reviewHistory = [];
  }

  // executeToolHandler est hérité de BaseAgent et utilise le ToolRegistry

  /**
   * Tracker les résultats d'une review
   */
  private trackReview(result: AnalysisResult): void {
    this.reviewHistory.push({
      timestamp: new Date(),
      file: result.file,
      score: result.score.overall,
      issuesFound: result.issues.length,
    });

    // Garder seulement les N dernières reviews
    if (this.reviewHistory.length > AGENT_HISTORY_LIMIT) {
      this.reviewHistory = this.reviewHistory.slice(-AGENT_HISTORY_LIMIT);
    }
  }

  /**
   * Obtenir la liste des outils disponibles
   */
  getAvailableTools(): ToolDefinition[] {
    return this.config.tools;
  }

  /**
   * Générer un rapport de review agrégé
   */
  generateReport(analyses: AnalysisResult[]): ReviewReport {
    if (analyses.length === 0) {
      return {
        summary: 'No files analyzed',
        score: { overall: 0, quality: 0, security: 0, performance: 0, maintainability: 0 },
        issues: [],
        recommendations: [],
        metrics: { filesReviewed: 0, linesReviewed: 0, issuesFound: 0, criticalIssues: 0 },
      };
    }

    // Agréger les scores
    const avgScore = {
      overall: 0,
      quality: 0,
      security: 0,
      performance: 0,
      maintainability: 0,
    };

    for (const analysis of analyses) {
      avgScore.overall += analysis.score.overall;
      avgScore.quality += analysis.score.quality;
      avgScore.security += analysis.score.security;
      avgScore.performance += analysis.score.performance;
      avgScore.maintainability += analysis.score.maintainability;
    }

    const count = analyses.length;
    avgScore.overall = Math.round(avgScore.overall / count);
    avgScore.quality = Math.round(avgScore.quality / count);
    avgScore.security = Math.round(avgScore.security / count);
    avgScore.performance = Math.round(avgScore.performance / count);
    avgScore.maintainability = Math.round(avgScore.maintainability / count);

    // Agréger les issues
    const allIssues: CodeIssue[] = [];
    let totalLines = 0;

    for (const analysis of analyses) {
      allIssues.push(...analysis.issues);
      totalLines += analysis.linesAnalyzed;
    }

    // Compter les issues critiques
    const criticalIssues = allIssues.filter((i) => i.severity === 'high').length;

    // Générer les recommandations basées sur les issues
    const recommendations: string[] = [];

    if (criticalIssues > 0) {
      recommendations.push(`Address ${criticalIssues} high-severity issues immediately`);
    }

    if (avgScore.security < 80) {
      recommendations.push('Review security practices and fix vulnerabilities');
    }

    if (avgScore.performance < 80) {
      recommendations.push('Consider performance optimizations');
    }

    if (avgScore.maintainability < 80) {
      recommendations.push('Improve code maintainability through refactoring');
    }

    return {
      summary: `Reviewed ${count} files with an average score of ${avgScore.overall}/100`,
      score: avgScore,
      issues: allIssues,
      recommendations,
      metrics: {
        filesReviewed: count,
        linesReviewed: totalLines,
        issuesFound: allIssues.length,
        criticalIssues,
      },
    };
  }
}

/*
 * ============================================================================
 * FACTORY
 * ============================================================================
 */

/**
 * Options pour créer le ReviewerAgent
 */
export interface CreateReviewerAgentOptions {
  analyzer?: CodeAnalyzer;
  fileSystem?: FileSystem;
  cacheConfig?: Partial<AnalysisCacheConfig>;
}

/**
 * Créer une instance du Reviewer Agent
 */
export function createReviewerAgent(
  analyzerOrOptions?: CodeAnalyzer | CreateReviewerAgentOptions,
  fileSystem?: FileSystem,
): ReviewerAgent {
  // Support des deux signatures pour rétrocompatibilité
  let options: CreateReviewerAgentOptions;

  if (analyzerOrOptions && typeof analyzerOrOptions === 'object' && 'cacheConfig' in analyzerOrOptions) {
    options = analyzerOrOptions;
  } else {
    options = {
      analyzer: analyzerOrOptions as CodeAnalyzer | undefined,
      fileSystem,
    };
  }

  const agent = new ReviewerAgent(options.cacheConfig);

  if (options.analyzer) {
    agent.setAnalyzer(options.analyzer);
  }

  if (options.fileSystem) {
    agent.setFileSystem(options.fileSystem);
  }

  return agent;
}
