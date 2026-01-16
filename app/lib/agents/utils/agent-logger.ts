/**
 * Logger centralisé pour le système d'agents
 * Fournit un logging structuré avec support pour différents niveaux
 */

import { createScopedLogger } from '~/utils/logger';
import type { LogLevel, LogEntry, AgentType } from '../types';
import { addAgentLog } from '../../stores/agents';

/**
 * Options du logger
 */
interface AgentLoggerOptions {
  /** Niveau minimum de log */
  minLevel?: LogLevel;

  /** Activer la sortie console */
  console?: boolean;

  /** Activer la persistance dans le store */
  persist?: boolean;

  /** Callback personnalisé pour les logs */
  onLog?: (entry: LogEntry) => void;
}

/**
 * Niveaux de log ordonnés
 */
const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Logger pour les agents
 */
export class AgentLogger {
  private agentName: AgentType;
  private options: Required<AgentLoggerOptions>;
  private scopedLogger: ReturnType<typeof createScopedLogger>;

  constructor(agentName: AgentType, options: AgentLoggerOptions = {}) {
    this.agentName = agentName;
    this.options = {
      minLevel: options.minLevel ?? 'info',
      console: options.console ?? true,
      persist: options.persist ?? true,
      onLog: options.onLog ?? (() => {}),
    };
    this.scopedLogger = createScopedLogger(`Agent:${agentName}`);
  }

  /**
   * Vérifier si un niveau doit être loggé
   */
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVELS[level] >= LOG_LEVELS[this.options.minLevel];
  }

  /**
   * Logger un message
   */
  private log(level: LogLevel, message: string, data?: Record<string, unknown>, taskId?: string): void {
    if (!this.shouldLog(level)) {
      return;
    }

    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date(),
      agentName: this.agentName,
      taskId,
      data,
    };

    // Console
    if (this.options.console) {
      switch (level) {
        case 'debug':
          this.scopedLogger.debug(message, data);
          break;
        case 'info':
          this.scopedLogger.info(message, data);
          break;
        case 'warn':
          this.scopedLogger.warn(message, data);
          break;
        case 'error':
          this.scopedLogger.error(message, data);
          break;
      }
    }

    // Persistance
    if (this.options.persist) {
      addAgentLog(this.agentName, {
        level,
        message,
        data,
        taskId,
      });
    }

    // Callback
    this.options.onLog(entry);
  }

  /**
   * Log niveau debug
   */
  debug(message: string, data?: Record<string, unknown>, taskId?: string): void {
    this.log('debug', message, data, taskId);
  }

  /**
   * Log niveau info
   */
  info(message: string, data?: Record<string, unknown>, taskId?: string): void {
    this.log('info', message, data, taskId);
  }

  /**
   * Log niveau warn
   */
  warn(message: string, data?: Record<string, unknown>, taskId?: string): void {
    this.log('warn', message, data, taskId);
  }

  /**
   * Log niveau error
   */
  error(message: string, data?: Record<string, unknown>, taskId?: string): void {
    this.log('error', message, data, taskId);
  }

  /**
   * Logger le début d'une tâche
   */
  taskStart(taskId: string, prompt: string): void {
    this.info(
      `Starting task: ${taskId}`,
      { prompt: prompt.substring(0, 100) + (prompt.length > 100 ? '...' : '') },
      taskId,
    );
  }

  /**
   * Logger la fin d'une tâche
   */
  taskEnd(taskId: string, success: boolean, durationMs: number): void {
    const level = success ? 'info' : 'error';
    this.log(level, `Task ${success ? 'completed' : 'failed'}: ${taskId}`, { success, durationMs }, taskId);
  }

  /**
   * Logger un appel d'outil
   */
  toolCall(toolName: string, input: Record<string, unknown>, taskId?: string): void {
    this.debug(`Calling tool: ${toolName}`, { tool: toolName, input }, taskId);
  }

  /**
   * Logger le résultat d'un outil
   */
  toolResult(toolName: string, success: boolean, durationMs: number, taskId?: string): void {
    const level = success ? 'debug' : 'warn';
    this.log(
      level,
      `Tool ${toolName} ${success ? 'succeeded' : 'failed'}`,
      { tool: toolName, success, durationMs },
      taskId,
    );
  }

  /**
   * Logger un appel LLM
   */
  llmCall(inputTokens: number, outputTokens: number, taskId?: string): void {
    this.debug('LLM call completed', { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens }, taskId);
  }

  /**
   * Logger une délégation
   */
  delegation(targetAgent: AgentType, task: string, taskId?: string): void {
    this.info(`Delegating to ${targetAgent}`, { targetAgent, task: task.substring(0, 100) }, taskId);
  }
}

/**
 * Créer un logger pour un agent
 */
export function createAgentLogger(agentName: AgentType, options?: AgentLoggerOptions): AgentLogger {
  return new AgentLogger(agentName, options);
}

/**
 * Logger global pour le système d'agents
 */
export const systemLogger = createAgentLogger('orchestrator', {
  minLevel: 'info',
  console: true,
  persist: true,
});
