/**
 * Fixer Agent - Agent spécialisé dans la correction automatique d'erreurs
 * Corrige les erreurs de test, compilation, et problèmes de qualité
 */

import { BaseAgent } from '../core/base-agent';
import type { ToolHandler } from '../core/tool-registry';
import { READ_TOOLS } from '../tools/read-tools';
import { WRITE_TOOLS, createWriteToolHandlers, type WritableFileSystem } from '../tools/write-tools';
import { getSharedReadHandlers } from '../utils/shared-handler-pool';
import { wrapHandlersOnSuccess } from '../utils/handler-wrapper';
import { FIXER_SYSTEM_PROMPT } from '../prompts/fixer-prompt';
import type { Task, TaskResult, ToolDefinition, Artifact } from '../types';
import { getModelForAgent, AGENT_HISTORY_LIMIT } from '../types';
import type { CodeIssue } from '../tools/review-tools';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('FixerAgent');

/*
 * ============================================================================
 * TYPES
 * ============================================================================
 */

/**
 * Type d'erreur à corriger
 */
export type FixableErrorType = 'test_failure' | 'compilation' | 'security' | 'quality' | 'lint';

/**
 * Erreur à corriger
 */
export interface FixableError {
  type: FixableErrorType;
  message: string;
  file?: string;
  line?: number;
  column?: number;
  stack?: string;
  code?: string;
  severity?: 'high' | 'medium' | 'low';
}

/**
 * Correction appliquée
 */
export interface AppliedFix {
  file: string;
  action: 'edit' | 'create' | 'delete';
  description: string;
  before?: string;
  after?: string;
  linesAffected?: number[];
}

/**
 * Résultat de correction
 */
export interface FixResult {
  success: boolean;
  error: FixableError;
  corrections: AppliedFix[];
  explanation: string;
  verification?: string;
  potentialImpacts?: string[];
}

/**
 * Configuration de la vérification post-fix
 */
export interface PostFixVerificationConfig {
  /** Activer la vérification automatique après correction */
  enabled: boolean;

  /** Timeout en ms pour chaque vérification (défaut: 60000) */
  timeout: number;

  /** Types de vérifications à exécuter */
  verifyTypes: Array<'typecheck' | 'test' | 'lint' | 'build'>;

  /** Rollback automatique si vérification échoue */
  rollbackOnFailure: boolean;

  /** Nombre max de tentatives de fix si vérification échoue */
  maxRetries: number;
}

/**
 * Résultat d'une vérification
 */
export interface VerificationResult {
  type: 'typecheck' | 'test' | 'lint' | 'build';
  success: boolean;
  output: string;
  duration: number;
  error?: string;
}

/**
 * Interface pour les vérificateurs externes (tests, compilation, etc.)
 */
export interface PostFixVerifier {
  /** Vérifier la compilation TypeScript */
  typecheck?(): Promise<{ success: boolean; output: string }>;

  /** Exécuter les tests */
  runTests?(pattern?: string): Promise<{ success: boolean; output: string }>;

  /** Exécuter le linting */
  lint?(files?: string[]): Promise<{ success: boolean; output: string }>;

  /** Exécuter le build */
  build?(): Promise<{ success: boolean; output: string }>;
}

/**
 * Résumé complet de vérification post-fix
 */
export interface PostFixVerificationSummary {
  /** Corrections appliquées */
  fixes: AppliedFix[];

  /** Résultats des vérifications */
  verifications: VerificationResult[];

  /** Toutes les vérifications ont réussi */
  allPassed: boolean;

  /** Rollback effectué */
  rolledBack: boolean;

  /** Nombre de tentatives */
  attempts: number;

  /** Durée totale */
  totalDuration: number;
}

/*
 * ============================================================================
 * FIXER AGENT
 * ============================================================================
 */

/**
 * Configuration par défaut de la vérification post-fix
 */
const DEFAULT_VERIFICATION_CONFIG: PostFixVerificationConfig = {
  enabled: true,
  timeout: 60000,
  verifyTypes: ['typecheck'],
  rollbackOnFailure: true,   // FIX Phase 0: Enabled by default for safer fixes
  maxRetries: 3,             // FIX Phase 0: More retry attempts before giving up
};

/**
 * Agent de correction automatique
 */
export class FixerAgent extends BaseAgent {
  private fileSystem: WritableFileSystem | null = null;
  private fixHistory: Array<{
    timestamp: Date;
    file: string;
    errorType: FixableErrorType;
    success: boolean;
  }> = [];
  private appliedFixes: AppliedFix[] = [];

  /** Configuration de la vérification post-fix */
  private verificationConfig: PostFixVerificationConfig;

  /** Vérificateur externe pour tests/compilation */
  private verifier: PostFixVerifier | null = null;

  /** Historique des vérifications */
  private verificationHistory: VerificationResult[] = [];

  /** Snapshots pour rollback */
  private fileSnapshots: Map<string, string> = new Map();

  constructor(verificationConfig: Partial<PostFixVerificationConfig> = {}) {
    super({
      name: 'fixer',
      description:
        'Agent de correction automatique. Corrige les erreurs de test, de compilation, ' +
        'et les problèmes de sécurité ou qualité identifiés par les autres agents.',
      model: getModelForAgent('fixer'), // Opus 4.5 pour correction intelligente
      tools: [...READ_TOOLS, ...WRITE_TOOLS],
      systemPrompt: FIXER_SYSTEM_PROMPT,
      maxTokens: 32768, // Increased from 8K to 32K for complete fixes
      temperature: 0.1, // Très déterministe pour les corrections
      timeout: 240000, // 4 minutes - fixes complexes avec vérification
      maxRetries: 3, // Plus de retries car les fixes peuvent être complexes
    });

    // Initialiser la configuration de vérification
    this.verificationConfig = { ...DEFAULT_VERIFICATION_CONFIG, ...verificationConfig };
  }

  /**
   * Implémentation du system prompt
   */
  getSystemPrompt(): string {
    return FIXER_SYSTEM_PROMPT;
  }

  /**
   * Exécution principale de l'agent (appelée par run())
   */
  async execute(task: Task): Promise<TaskResult> {
    // Vérifier que le FileSystem est initialisé
    if (!this.fileSystem) {
      return {
        success: false,
        output: 'FileSystem not initialized. Call setFileSystem() first.',
        errors: [
          {
            code: 'FS_NOT_INITIALIZED',
            message: 'FileSystem not initialized',
            recoverable: false,
          },
        ],
      };
    }

    // Réinitialiser les corrections appliquées
    this.appliedFixes = [];

    // Construire le prompt avec le contexte d'erreur
    let prompt = task.prompt;

    // Ajouter les erreurs spécifiques si fournies dans le contexte
    if (task.context?.errors && Array.isArray(task.context.errors)) {
      prompt += '\n\nErreurs à corriger:\n';

      for (const error of task.context.errors as FixableError[]) {
        prompt += `\n### Erreur (${error.type})`;

        if (error.file) {
          prompt += ` dans ${error.file}`;
        }

        if (error.line) {
          prompt += `:${error.line}`;
        }

        prompt += `\nMessage: ${error.message}`;

        if (error.stack) {
          prompt += `\nStack trace:\n\`\`\`\n${error.stack}\n\`\`\``;
        }

        if (error.code) {
          prompt += `\nCode problématique:\n\`\`\`\n${error.code}\n\`\`\``;
        }
      }
    }

    // Ajouter les issues de review si fournies
    if (task.context?.reviewIssues && Array.isArray(task.context.reviewIssues)) {
      prompt += '\n\nProblèmes identifiés par la review:\n';

      for (const issue of task.context.reviewIssues as CodeIssue[]) {
        prompt += `\n- [${issue.severity}] ${issue.type} dans ${issue.file}`;

        if (issue.line) {
          prompt += `:${issue.line}`;
        }

        prompt += `: ${issue.message}`;

        if (issue.suggestion) {
          prompt += `\n  Suggestion: ${issue.suggestion}`;
        }
      }
    }

    // Ajouter l'historique des corrections récentes
    if (this.fixHistory.length > 0) {
      const recent = this.fixHistory.slice(-5);
      prompt += '\n\nHistorique récent des corrections:\n';

      for (const entry of recent) {
        const status = entry.success ? '✓' : '✗';
        prompt += `- ${entry.timestamp.toISOString()}: ${status} ${entry.errorType} dans ${entry.file}\n`;
      }
    }

    // Exécuter la boucle d'agent
    const result = await this.runAgentLoop(prompt);

    // Ajouter les artefacts des corrections
    if (this.appliedFixes.length > 0) {
      result.artifacts = result.artifacts || [];

      for (const fix of this.appliedFixes) {
        const artifact: Artifact = {
          type: 'file',
          path: fix.file,
          action: fix.action === 'create' ? 'created' : fix.action === 'delete' ? 'deleted' : 'modified',
          content: fix.after || '',
          title: `${fix.action}: ${fix.file} - ${fix.description}`,
        };
        result.artifacts.push(artifact);
      }

      // Ajouter un résumé des corrections
      const summaryArtifact: Artifact = {
        type: 'message',
        content: JSON.stringify(
          {
            totalFixes: this.appliedFixes.length,
            fixes: this.appliedFixes,
          },
          null,
          2,
        ),
        title: 'Fix Summary',
      };
      result.artifacts.push(summaryArtifact);
    }

    return result;
  }

  /**
   * Initialiser le système de fichiers
   * Enregistre les outils de lecture et d'écriture dans le ToolRegistry
   */
  setFileSystem(fs: WritableFileSystem): void {
    this.fileSystem = fs;

    // Utiliser les handlers partagés pour la lecture (cached via WeakMap)
    const readHandlers = getSharedReadHandlers(fs);
    this.registerTools(READ_TOOLS, readHandlers as unknown as Record<string, ToolHandler>, 'filesystem');

    // Créer des handlers d'écriture wrappés pour tracker les corrections
    const writeHandlers = createWriteToolHandlers(fs);
    const wrappedWriteHandlers = wrapHandlersOnSuccess(writeHandlers, (toolName, input) =>
      this.trackFix(toolName, input),
    );
    this.registerTools(WRITE_TOOLS, wrappedWriteHandlers, 'filesystem');

    this.log('info', 'FileSystem initialized for FixerAgent with ToolRegistry');
  }

  /**
   * Obtenir les corrections appliquées lors de la dernière exécution
   */
  getAppliedFixes(): AppliedFix[] {
    return [...this.appliedFixes];
  }

  /**
   * Obtenir l'historique des corrections
   */
  getFixHistory(): typeof this.fixHistory {
    return [...this.fixHistory];
  }

  /**
   * Vider l'historique des corrections
   */
  clearFixHistory(): void {
    this.fixHistory = [];
  }

  // executeToolHandler est hérité de BaseAgent et utilise le ToolRegistry

  /**
   * Tracker une correction appliquée
   */
  private trackFix(toolName: string, input: Record<string, unknown>): void {
    const path = (input.path || input.oldPath) as string;

    let action: 'edit' | 'create' | 'delete';
    let description = '';

    switch (toolName) {
      case 'write_file':
        action = 'create';
        description = 'File created/replaced';
        break;
      case 'edit_file':
        action = 'edit';
        description = `Edited: replaced "${(input.search as string)?.substring(0, 50)}..."`;
        break;
      case 'delete_file':
        action = 'delete';
        description = 'File deleted';
        break;
      default:
        action = 'edit';
        description = `Applied ${toolName}`;
    }

    this.appliedFixes.push({
      file: path,
      action,
      description,
      after: input.content as string | undefined,
    });
  }

  /**
   * Enregistrer un résultat de correction dans l'historique
   */
  recordFixResult(file: string, errorType: FixableErrorType, success: boolean): void {
    this.fixHistory.push({
      timestamp: new Date(),
      file,
      errorType,
      success,
    });

    // Garder seulement les N dernières corrections
    if (this.fixHistory.length > AGENT_HISTORY_LIMIT) {
      this.fixHistory = this.fixHistory.slice(-AGENT_HISTORY_LIMIT);
    }
  }

  /**
   * Obtenir la liste des outils disponibles
   */
  getAvailableTools(): ToolDefinition[] {
    return this.config.tools;
  }

  /**
   * Créer une erreur fixable à partir d'un message d'erreur
   */
  static parseError(errorMessage: string, type: FixableErrorType = 'compilation'): FixableError {
    // Tenter d'extraire le fichier et la ligne
    const fileLineMatch = errorMessage.match(/(?:at\s+)?([^:\s]+(?:\.ts|\.tsx|\.js|\.jsx)):(\d+)(?::(\d+))?/);

    return {
      type,
      message: errorMessage,
      file: fileLineMatch?.[1],
      line: fileLineMatch?.[2] ? parseInt(fileLineMatch[2], 10) : undefined,
      column: fileLineMatch?.[3] ? parseInt(fileLineMatch[3], 10) : undefined,
    };
  }

  /**
   * Créer une erreur fixable à partir d'une issue de review
   */
  static fromReviewIssue(issue: CodeIssue): FixableError {
    let type: FixableErrorType = 'quality';

    if (issue.type === 'security') {
      type = 'security';
    } else if (issue.type === 'style') {
      type = 'lint';
    }

    return {
      type,
      message: issue.message,
      file: issue.file,
      line: issue.line,
      column: issue.column,
      severity: issue.severity === 'info' ? 'low' : issue.severity,
    };
  }

  /*
   * ============================================================================
   * POST-FIX VERIFICATION
   * ============================================================================
   */

  /**
   * Définir le vérificateur externe
   */
  setVerifier(verifier: PostFixVerifier): void {
    this.verifier = verifier;
    this.log('info', 'PostFixVerifier initialized');
  }

  /**
   * Configurer la vérification post-fix
   */
  configureVerification(config: Partial<PostFixVerificationConfig>): void {
    this.verificationConfig = { ...this.verificationConfig, ...config };
    logger.info('Verification configured', { config: this.verificationConfig });
  }

  /**
   * Exécuter les vérifications post-fix
   */
  async runPostFixVerification(affectedFiles?: string[]): Promise<PostFixVerificationSummary> {
    const startTime = Date.now();
    const results: VerificationResult[] = [];
    let allPassed = true;

    if (!this.verifier) {
      logger.warn('No verifier configured, skipping post-fix verification');
      return {
        fixes: this.appliedFixes,
        verifications: [],
        allPassed: true,
        rolledBack: false,
        attempts: 1,
        totalDuration: 0,
      };
    }

    logger.info('Starting post-fix verification', {
      types: this.verificationConfig.verifyTypes,
      files: affectedFiles,
    });

    for (const verifyType of this.verificationConfig.verifyTypes) {
      const verifyStart = Date.now();
      let result: VerificationResult;

      try {
        switch (verifyType) {
          case 'typecheck':
            if (this.verifier.typecheck) {
              const res = await this.withTimeout(this.verifier.typecheck(), this.verificationConfig.timeout);
              result = {
                type: 'typecheck',
                success: res.success,
                output: res.output,
                duration: Date.now() - verifyStart,
              };
            } else {
              continue;
            }
            break;

          case 'test':
            if (this.verifier.runTests) {
              // Filtrer les tests aux fichiers affectés si possible
              const testPattern = affectedFiles?.length
                ? affectedFiles.map((f) => f.replace(/\.ts$/, '.spec.ts')).join('|')
                : undefined;
              const res = await this.withTimeout(this.verifier.runTests(testPattern), this.verificationConfig.timeout);
              result = {
                type: 'test',
                success: res.success,
                output: res.output,
                duration: Date.now() - verifyStart,
              };
            } else {
              continue;
            }
            break;

          case 'lint':
            if (this.verifier.lint) {
              const res = await this.withTimeout(this.verifier.lint(affectedFiles), this.verificationConfig.timeout);
              result = {
                type: 'lint',
                success: res.success,
                output: res.output,
                duration: Date.now() - verifyStart,
              };
            } else {
              continue;
            }
            break;

          case 'build':
            if (this.verifier.build) {
              const res = await this.withTimeout(this.verifier.build(), this.verificationConfig.timeout);
              result = {
                type: 'build',
                success: res.success,
                output: res.output,
                duration: Date.now() - verifyStart,
              };
            } else {
              continue;
            }
            break;

          default:
            continue;
        }

        results.push(result);
        this.verificationHistory.push(result);

        if (!result.success) {
          allPassed = false;
          logger.warn(`Verification failed: ${verifyType}`, { output: result.output });
        } else {
          logger.info(`Verification passed: ${verifyType}`, { duration: result.duration });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        result = {
          type: verifyType,
          success: false,
          output: '',
          duration: Date.now() - verifyStart,
          error: errorMessage,
        };
        results.push(result);
        this.verificationHistory.push(result);
        allPassed = false;
        logger.error(`Verification error: ${verifyType}`, { error: errorMessage });
      }
    }

    const totalDuration = Date.now() - startTime;
    let rolledBack = false;

    // Rollback si configuré et vérification échouée
    if (!allPassed && this.verificationConfig.rollbackOnFailure && this.fileSnapshots.size > 0) {
      logger.info('Rolling back changes due to failed verification');
      await this.rollbackChanges();
      rolledBack = true;
    }

    const summary: PostFixVerificationSummary = {
      fixes: this.appliedFixes,
      verifications: results,
      allPassed,
      rolledBack,
      attempts: 1,
      totalDuration,
    };

    logger.info('Post-fix verification completed', {
      allPassed,
      rolledBack,
      duration: totalDuration,
    });

    return summary;
  }

  /**
   * Créer des snapshots des fichiers avant modification (pour rollback)
   */
  async createFileSnapshots(files: string[]): Promise<void> {
    if (!this.fileSystem || !this.verificationConfig.rollbackOnFailure) {
      return;
    }

    this.fileSnapshots.clear();

    for (const file of files) {
      try {
        const content = await this.fileSystem.readFile(file);
        this.fileSnapshots.set(file, content);
        logger.debug('Created snapshot', { file });
      } catch {
        // Le fichier n'existe pas encore, pas de snapshot nécessaire
      }
    }
  }

  /**
   * Restaurer les fichiers depuis les snapshots
   */
  private async rollbackChanges(): Promise<void> {
    if (!this.fileSystem) {
      return;
    }

    for (const [file, content] of this.fileSnapshots) {
      try {
        await this.fileSystem.writeFile(file, content);
        logger.info('Rolled back file', { file });
      } catch (error) {
        logger.error('Failed to rollback file', { file, error });
      }
    }

    this.fileSnapshots.clear();
    this.appliedFixes = [];
  }

  /**
   * Helper pour ajouter un timeout aux promesses
   */
  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Verification timeout after ${timeoutMs}ms`)), timeoutMs),
      ),
    ]);
  }

  /**
   * Obtenir l'historique des vérifications
   */
  getVerificationHistory(): VerificationResult[] {
    return [...this.verificationHistory];
  }

  /**
   * Vider l'historique des vérifications
   */
  clearVerificationHistory(): void {
    this.verificationHistory = [];
  }

  /**
   * Exécuter une correction avec vérification automatique
   */
  async executeWithVerification(task: Task): Promise<TaskResult & { verification?: PostFixVerificationSummary }> {
    // Collecter les fichiers qui seront affectés
    const affectedFiles: string[] = [];
    if (task.context?.errors) {
      for (const error of task.context.errors as FixableError[]) {
        if (error.file) {
          affectedFiles.push(error.file);
        }
      }
    }

    // Créer des snapshots si rollback activé
    if (this.verificationConfig.rollbackOnFailure && affectedFiles.length > 0) {
      await this.createFileSnapshots(affectedFiles);
    }

    // Exécuter la correction
    const result = await this.execute(task);

    // Collecter les fichiers réellement modifiés
    const modifiedFiles = this.appliedFixes.map((fix) => fix.file);

    // Vérification post-fix si activée
    let verificationSummary: PostFixVerificationSummary | undefined;

    if (this.verificationConfig.enabled && this.verifier && modifiedFiles.length > 0) {
      verificationSummary = await this.runPostFixVerification(modifiedFiles);

      // Mettre à jour le résultat avec les informations de vérification
      if (!verificationSummary.allPassed) {
        result.output += '\n\n⚠️ Post-fix verification failed:';
        for (const v of verificationSummary.verifications) {
          if (!v.success) {
            result.output += `\n- ${v.type}: ${v.error || 'Failed'}`;
          }
        }

        if (verificationSummary.rolledBack) {
          result.output += '\n\n🔄 Changes have been rolled back.';
          result.success = false;
        }
      } else {
        result.output += '\n\n✅ Post-fix verification passed.';
      }
    }

    return { ...result, verification: verificationSummary };
  }
}

/*
 * ============================================================================
 * FACTORY
 * ============================================================================
 */

/**
 * Options pour créer le FixerAgent
 */
export interface CreateFixerAgentOptions {
  fileSystem?: WritableFileSystem;
  verifier?: PostFixVerifier;
  verificationConfig?: Partial<PostFixVerificationConfig>;
}

/**
 * Créer une instance du Fixer Agent
 */
export function createFixerAgent(fsOrOptions?: WritableFileSystem | CreateFixerAgentOptions): FixerAgent {
  // Support des deux signatures pour rétrocompatibilité
  let options: CreateFixerAgentOptions;

  if (
    fsOrOptions &&
    typeof fsOrOptions === 'object' &&
    ('fileSystem' in fsOrOptions || 'verifier' in fsOrOptions || 'verificationConfig' in fsOrOptions)
  ) {
    options = fsOrOptions;
  } else {
    options = {
      fileSystem: fsOrOptions as WritableFileSystem | undefined,
    };
  }

  const agent = new FixerAgent(options.verificationConfig);

  if (options.fileSystem) {
    agent.setFileSystem(options.fileSystem);
  }

  if (options.verifier) {
    agent.setVerifier(options.verifier);
  }

  return agent;
}
