/**
 * @fileoverview Gestionnaire d'historique des messages pour les agents BAVINI
 *
 * Ce module encapsule la gestion de l'historique des conversations, incluant:
 * - Ajout de messages avec comptage incrémental des tokens
 * - Trim automatique pour éviter les débordements de contexte
 * - Compression de l'historique si nécessaire
 *
 * @module agents/core/message-history
 * @see {@link BaseAgent} pour l'utilisation dans les agents
 */

import { estimateTokens } from '../utils/context-compressor';
import type { AgentMessage, ToolResult } from '../types';

/*
 * ============================================================================
 * CONSTANTS
 * ============================================================================
 */

/** Maximum number of messages to keep in history to prevent memory issues */
const DEFAULT_MAX_MESSAGES = 50;

/** Threshold (percentage) at which to start trimming */
const TRIM_THRESHOLD = 0.8;

/*
 * ============================================================================
 * TYPES
 * ============================================================================
 */

/**
 * Configuration de l'historique des messages
 */
export interface MessageHistoryConfig {
  /** Nombre maximum de messages à conserver */
  maxMessages?: number;
  /** Seuil (pourcentage) déclenchant le trim */
  trimThreshold?: number;
}

/**
 * Statistiques de l'historique
 */
export interface MessageHistoryStats {
  /** Nombre de messages dans l'historique */
  messageCount: number;
  /** Estimation du nombre de tokens */
  estimatedTokens: number;
  /** Capacité maximale */
  maxMessages: number;
  /** Pourcentage de remplissage */
  fillPercentage: number;
}

/**
 * Callback pour les événements de logging
 */
export type MessageHistoryLogCallback = (
  level: 'debug' | 'info' | 'warn',
  message: string,
  data?: Record<string, unknown>,
) => void;

/*
 * ============================================================================
 * MESSAGE HISTORY CLASS
 * ============================================================================
 */

/**
 * Gestionnaire d'historique des messages de conversation
 *
 * Responsabilités:
 * - Stockage de l'historique des messages
 * - Comptage incrémental des tokens (O(1))
 * - Trim automatique pour éviter les débordements
 *
 * @class MessageHistory
 *
 * @example
 * ```typescript
 * const history = new MessageHistory({ maxMessages: 50 });
 *
 * history.add({ role: 'user', content: 'Hello!' });
 * history.add({ role: 'assistant', content: 'Hi there!' });
 *
 * console.log(history.getStats());
 * // { messageCount: 2, estimatedTokens: 10, ... }
 * ```
 */
export class MessageHistory {
  private messages: AgentMessage[] = [];
  private cumulativeTokens: number = 0;
  private config: Required<MessageHistoryConfig>;
  private logCallback: MessageHistoryLogCallback | null = null;

  constructor(config?: MessageHistoryConfig) {
    this.config = {
      maxMessages: DEFAULT_MAX_MESSAGES,
      trimThreshold: TRIM_THRESHOLD,
      ...config,
    };
  }

  /**
   * Définir un callback de logging personnalisé
   */
  setLogCallback(callback: MessageHistoryLogCallback): void {
    this.logCallback = callback;
  }

  /**
   * Ajoute un message à l'historique
   *
   * Performance: O(1) pour l'ajout et la mise à jour des tokens
   *
   * @param message - Message à ajouter
   */
  add(message: AgentMessage): void {
    // Estimer les tokens du message
    const messageTokens = this.estimateMessageTokens(message);

    this.cumulativeTokens += messageTokens;
    this.messages.push(message);
  }

  /**
   * Ajoute un message utilisateur simple
   */
  addUserMessage(content: string): void {
    this.add({ role: 'user', content });
  }

  /**
   * Ajoute un message assistant simple
   */
  addAssistantMessage(content: string): void {
    this.add({ role: 'assistant', content });
  }

  /**
   * Ajoute un message avec des résultats d'outils
   */
  addToolResultsMessage(toolResults: ToolResult[]): void {
    this.add({
      role: 'user',
      content: '',
      toolResults,
    });
  }

  /**
   * Retourne tous les messages de l'historique
   */
  getMessages(): AgentMessage[] {
    return [...this.messages];
  }

  /**
   * Retourne le nombre de messages
   */
  count(): number {
    return this.messages.length;
  }

  /**
   * Retourne l'estimation du nombre de tokens
   */
  getTokenCount(): number {
    return this.cumulativeTokens;
  }

  /**
   * Vérifie si un trim est nécessaire
   */
  needsTrim(): boolean {
    return this.messages.length >= this.config.maxMessages * this.config.trimThreshold;
  }

  /**
   * Effectue un trim si nécessaire
   *
   * @returns true si un trim a été effectué
   */
  trimIfNeeded(): boolean {
    if (!this.needsTrim()) {
      return false;
    }

    this.trim();
    return true;
  }

  /**
   * Trim l'historique pour conserver les messages les plus récents
   *
   * Conserve le premier message (prompt initial) et les messages les plus récents.
   */
  trim(): void {
    if (this.messages.length <= this.config.maxMessages) {
      return;
    }

    // Conserver le premier message (prompt initial) et les messages récents
    const firstMessage = this.messages[0];
    const recentMessages = this.messages.slice(-(this.config.maxMessages - 1));

    this.messages = [firstMessage, ...recentMessages];

    // Recalculer les tokens après le trim
    this.recalculateTokens();

    this.log('debug', `Trimmed message history to ${this.messages.length} messages`, {
      maxHistory: this.config.maxMessages,
      estimatedTokens: this.cumulativeTokens,
    });
  }

  /**
   * Vide complètement l'historique
   */
  clear(): void {
    this.messages = [];
    this.cumulativeTokens = 0;
  }

  /**
   * Retourne les statistiques de l'historique
   */
  getStats(): MessageHistoryStats {
    return {
      messageCount: this.messages.length,
      estimatedTokens: this.cumulativeTokens,
      maxMessages: this.config.maxMessages,
      fillPercentage: (this.messages.length / this.config.maxMessages) * 100,
    };
  }

  /**
   * Retourne le dernier message
   */
  getLastMessage(): AgentMessage | undefined {
    return this.messages[this.messages.length - 1];
  }

  /**
   * Retourne les N derniers messages
   */
  getLastMessages(n: number): AgentMessage[] {
    return this.messages.slice(-n);
  }

  /**
   * Retourne le premier message (généralement le prompt initial)
   */
  getFirstMessage(): AgentMessage | undefined {
    return this.messages[0];
  }

  /**
   * Supprime le dernier message
   *
   * @returns Le message supprimé ou undefined
   */
  popLastMessage(): AgentMessage | undefined {
    const message = this.messages.pop();

    if (message) {
      // Recalculer les tokens (on pourrait soustraire mais recalcul est plus sûr)
      this.recalculateTokens();
    }

    return message;
  }

  /**
   * Clone l'historique actuel
   */
  clone(): MessageHistory {
    const newHistory = new MessageHistory(this.config);
    newHistory.messages = [...this.messages];
    newHistory.cumulativeTokens = this.cumulativeTokens;
    return newHistory;
  }

  /**
   * Estime les tokens d'un message individuel
   */
  private estimateMessageTokens(message: AgentMessage): number {
    let tokens = 0;

    if (message.content) {
      tokens += estimateTokens(message.content);
    }

    if (message.toolCalls) {
      for (const call of message.toolCalls) {
        tokens += estimateTokens(JSON.stringify(call.input));
      }
    }

    if (message.toolResults) {
      for (const result of message.toolResults) {
        tokens += estimateTokens(String(result.output ?? ''));
        tokens += estimateTokens(String(result.error ?? ''));
      }
    }

    return tokens;
  }

  /**
   * Recalcule le compteur de tokens (après trim ou modification)
   */
  private recalculateTokens(): void {
    this.cumulativeTokens = 0;

    for (const msg of this.messages) {
      this.cumulativeTokens += this.estimateMessageTokens(msg);
    }
  }

  /**
   * Logging interne
   */
  private log(level: 'debug' | 'info' | 'warn', message: string, data?: Record<string, unknown>): void {
    if (this.logCallback) {
      this.logCallback(level, message, data);
    }
  }
}
