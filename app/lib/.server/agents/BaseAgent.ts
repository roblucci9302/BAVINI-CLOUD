/**
 * Classe de base abstraite pour les agents BAVINI
 *
 * Fournit l'infrastructure commune pour le Chat Mode Agent et l'Agent Mode Agent,
 * incluant la gestion du contexte, la validation des capacités et le logging.
 */

import { createScopedLogger } from '~/utils/logger';
import type {
  AgentCapability,
  AgentConfig,
  AgentContext,
  AgentMessage,
  AgentMode,
  ProjectFile,
  ProjectError,
  ProjectState,
} from './types';

const logger = createScopedLogger('BaseAgent');

/**
 * Classe abstraite de base pour tous les agents BAVINI
 */
export abstract class BaseAgent<TResponse> {
  /** Configuration de l'agent */
  protected readonly config: AgentConfig;

  /** Contexte actuel de l'agent */
  protected context: AgentContext | null = null;

  /** Historique des messages de cette session */
  protected messageHistory: AgentMessage[] = [];

  constructor(config: AgentConfig) {
    this.config = config;
    logger.debug('Agent initialized', { mode: config.mode });
  }

  /*
   * ===========================================================================
   * Abstract Methods - À implémenter par les sous-classes
   * ===========================================================================
   */

  /**
   * Traite un message utilisateur et retourne une réponse
   */
  abstract process(userMessage: string): Promise<TResponse>;

  /**
   * Retourne le prompt système spécifique à l'agent
   */
  abstract getSystemPrompt(): string;

  /*
   * ===========================================================================
   * Capability Management
   * ===========================================================================
   */

  /**
   * Vérifie si l'agent a une capacité spécifique
   */
  hasCapability(capability: AgentCapability): boolean {
    return this.config.capabilities.includes(capability);
  }

  /**
   * Vérifie si une capacité est restreinte
   */
  isRestricted(capability: AgentCapability): boolean {
    return this.config.restrictions.includes(capability);
  }

  /**
   * Valide qu'une action est permise avant exécution
   */
  protected validateAction(requiredCapability: AgentCapability): void {
    if (this.isRestricted(requiredCapability)) {
      throw new AgentRestrictionError(`Action "${requiredCapability}" is restricted in ${this.config.mode} mode`);
    }

    if (!this.hasCapability(requiredCapability)) {
      throw new AgentCapabilityError(`Agent does not have capability "${requiredCapability}"`);
    }
  }

  /**
   * Retourne la liste des capacités de l'agent
   */
  getCapabilities(): AgentCapability[] {
    return [...this.config.capabilities];
  }

  /**
   * Retourne la liste des restrictions de l'agent
   */
  getRestrictions(): AgentCapability[] {
    return [...this.config.restrictions];
  }

  /*
   * ===========================================================================
   * Context Management
   * ===========================================================================
   */

  /**
   * Définit le contexte de l'agent
   */
  setContext(context: AgentContext): void {
    this.context = context;
    this.messageHistory = context.messageHistory;
    logger.debug('Context set', {
      fileCount: context.files.length,
      messageCount: context.messageHistory.length,
    });
  }

  /**
   * Retourne le contexte actuel
   */
  getContext(): AgentContext | null {
    return this.context;
  }

  /**
   * Ajoute un message à l'historique
   */
  protected addToHistory(message: AgentMessage): void {
    this.messageHistory.push(message);
  }

  /**
   * Retourne l'historique des messages
   */
  getMessageHistory(): AgentMessage[] {
    return [...this.messageHistory];
  }

  /*
   * ===========================================================================
   * File Operations (Read-only by default)
   * ===========================================================================
   */

  /**
   * Lit un fichier du contexte (toujours disponible)
   */
  protected readFile(path: string): ProjectFile | undefined {
    this.validateAction('read_files');

    if (!this.context) {
      logger.warn('Attempted to read file without context');
      return undefined;
    }

    return this.context.files.find((f) => f.path === path);
  }

  /**
   * Recherche des fichiers par pattern
   */
  protected findFiles(pattern: RegExp): ProjectFile[] {
    this.validateAction('read_files');

    if (!this.context) {
      return [];
    }

    return this.context.files.filter((f) => pattern.test(f.path));
  }

  /**
   * Retourne tous les fichiers du contexte
   */
  protected getAllFiles(): ProjectFile[] {
    this.validateAction('read_files');
    return this.context?.files ?? [];
  }

  /*
   * ===========================================================================
   * Analysis Operations
   * ===========================================================================
   */

  /**
   * Analyse le code source (lecture seule)
   */
  protected async analyzeCode(content: string): Promise<CodeAnalysis> {
    this.validateAction('analyze_code');

    // Analyse statique basique
    const lines = content.split('\n');
    const hasTypeScript = /\.tsx?$/.test(content) || content.includes(': ') || content.includes('interface ');
    const hasTests =
      /\.(test|spec)\.(ts|tsx|js|jsx)$/.test(content) || content.includes('describe(') || content.includes('it(');
    const hasErrors = content.includes('// TODO:') || content.includes('// FIXME:');

    return {
      lineCount: lines.length,
      hasTypeScript,
      hasTests,
      hasErrors,
      complexity: this.estimateComplexity(content),
    };
  }

  /**
   * Estime la complexité du code
   */
  private estimateComplexity(content: string): 'low' | 'medium' | 'high' {
    const lines = content.split('\n').length;
    const conditionals = (content.match(/if\s*\(|switch\s*\(|\?\s*:/g) || []).length;
    const loops = (content.match(/for\s*\(|while\s*\(|\.map\(|\.forEach\(/g) || []).length;

    const score = conditionals + loops + (lines > 100 ? 2 : 0);

    if (score < 5) {
      return 'low';
    }

    if (score < 15) {
      return 'medium';
    }

    return 'high';
  }

  /**
   * Inspecte les erreurs récentes
   */
  protected getRecentErrors(): ProjectError[] {
    this.validateAction('inspect_logs');
    return this.context?.recentErrors ?? [];
  }

  /**
   * Inspecte les logs récents
   */
  protected getRecentLogs(): string[] {
    this.validateAction('inspect_logs');
    return this.context?.recentLogs ?? [];
  }

  /*
   * ===========================================================================
   * Project State
   * ===========================================================================
   */

  /**
   * Retourne l'état du projet
   */
  protected getProjectState(): ProjectState | undefined {
    return this.context?.projectState;
  }

  /**
   * Détecte la stack technique du projet
   */
  protected detectTechStack(): string[] {
    if (!this.context) {
      return [];
    }

    const stack: Set<string> = new Set();
    const files = this.context.files;

    // Détection basée sur les fichiers
    for (const file of files) {
      if (file.path.includes('package.json')) {
        try {
          const pkg = JSON.parse(file.content);
          const deps = { ...pkg.dependencies, ...pkg.devDependencies };

          if (deps.react) {
            stack.add('React');
          }

          if (deps.vue) {
            stack.add('Vue');
          }

          if (deps['@angular/core']) {
            stack.add('Angular');
          }

          if (deps.next) {
            stack.add('Next.js');
          }

          if (deps.remix || deps['@remix-run/react']) {
            stack.add('Remix');
          }

          if (deps.express) {
            stack.add('Express');
          }

          if (deps.tailwindcss) {
            stack.add('Tailwind CSS');
          }

          if (deps['@supabase/supabase-js']) {
            stack.add('Supabase');
          }

          if (deps.prisma || deps['@prisma/client']) {
            stack.add('Prisma');
          }
        } catch {
          // ignore json parse errors
        }
      }

      if (file.path.endsWith('.ts') || file.path.endsWith('.tsx')) {
        stack.add('TypeScript');
      }
    }

    return Array.from(stack);
  }

  /*
   * ===========================================================================
   * Mode & Configuration
   * ===========================================================================
   */

  /**
   * Retourne le mode actuel de l'agent
   */
  getMode(): AgentMode {
    return this.config.mode;
  }

  /**
   * Retourne la configuration de l'agent
   */
  getConfig(): AgentConfig {
    return { ...this.config };
  }

  /**
   * Retourne la langue configurée
   */
  getLanguage(): 'fr' | 'en' {
    return this.config.language;
  }
}

/*
 * =============================================================================
 * Analysis Types
 * =============================================================================
 */

/**
 * Résultat de l'analyse de code
 */
export interface CodeAnalysis {
  lineCount: number;
  hasTypeScript: boolean;
  hasTests: boolean;
  hasErrors: boolean;
  complexity: 'low' | 'medium' | 'high';
}

/*
 * =============================================================================
 * Custom Errors
 * =============================================================================
 */

/**
 * Erreur levée quand une action restreinte est tentée
 */
export class AgentRestrictionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentRestrictionError';
  }
}

/**
 * Erreur levée quand l'agent n'a pas la capacité requise
 */
export class AgentCapabilityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentCapabilityError';
  }
}
