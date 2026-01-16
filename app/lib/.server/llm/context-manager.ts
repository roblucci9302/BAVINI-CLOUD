/**
 * Context Manager - Gestion automatique du contexte de conversation
 *
 * Fonctionnalités:
 * - Comptage de tokens précis avec tiktoken
 * - Détection de dépassement de contexte
 * - Summarization automatique des messages anciens
 * - Préservation du contexte critique
 *
 * @module llm/context-manager
 */

import type { Message } from '~/types/message';
import {
  countTokensSync,
  countMessageTokens as countMessageTokensWithTiktoken,
  countMessagesTokens as countMessagesTokensWithTiktoken,
} from './token-estimator';

/*
 * ============================================================================
 * CONSTANTS
 * ============================================================================
 */

/**
 * Limite de contexte approximative pour Claude (en tokens)
 * Claude 3.5 Sonnet a une limite de 200K tokens
 * On garde une marge de sécurité
 */
export const MAX_CONTEXT_TOKENS = 180000;

/**
 * Seuil à partir duquel on commence à résumer (80% de la limite)
 */
export const SUMMARIZATION_THRESHOLD = 0.8;

/**
 * Nombre minimum de messages récents à préserver
 */
export const MIN_RECENT_MESSAGES = 10;

/**
 * Nombre maximum de messages à résumer en une fois
 */
export const MAX_MESSAGES_TO_SUMMARIZE = 20;

/*
 * ============================================================================
 * TYPES
 * ============================================================================
 */

/**
 * Résultat de l'analyse du contexte
 */
export interface ContextAnalysis {
  /** Nombre total de tokens estimé */
  totalTokens: number;

  /** Nombre de messages */
  messageCount: number;

  /** Pourcentage du contexte utilisé */
  usagePercent: number;

  /** Résumé nécessaire ? */
  needsSummarization: boolean;

  /** Messages à résumer si nécessaire */
  messagesToSummarize: Message[];

  /** Messages à conserver */
  messagesToKeep: Message[];
}

/**
 * Message résumé
 */
export interface SummaryMessage extends Message {
  role: 'system';
  isSummary: true;
  originalMessageCount: number;
  summarizedAt: Date;
}

/**
 * Options de configuration
 */
export interface ContextManagerConfig {
  /** Limite de tokens */
  maxTokens?: number;

  /** Seuil de summarization (0-1) */
  threshold?: number;

  /** Messages récents à préserver */
  minRecentMessages?: number;
}

/*
 * ============================================================================
 * TOKEN COUNTING
 * ============================================================================
 */

/**
 * Estimer le nombre de tokens dans un texte
 * Utilise tiktoken (cl100k_base) pour une estimation précise
 */
export function estimateTokens(text: string): number {
  return countTokensSync(text);
}

/**
 * Estimer les tokens pour un message
 */
export function estimateMessageTokens(message: Message): number {
  let tokens = 0;

  // Contenu principal
  tokens += estimateTokens(message.content);

  // Overhead pour le rôle (~4 tokens)
  tokens += 4;

  // Tool invocations
  if (message.toolInvocations) {
    for (const invocation of message.toolInvocations) {
      tokens += estimateTokens(JSON.stringify(invocation.args || {}));
      tokens += estimateTokens(JSON.stringify(invocation.result || {}));
      tokens += 10; // Overhead pour la structure
    }
  }

  // Attachments (URLs, metadata)
  if (message.experimental_attachments) {
    tokens += message.experimental_attachments.length * 50;
  }

  return tokens;
}

/**
 * Estimer les tokens pour un tableau de messages
 */
export function estimateTotalTokens(messages: Message[]): number {
  return messages.reduce((total, msg) => total + estimateMessageTokens(msg), 0);
}

/*
 * ============================================================================
 * CONTEXT ANALYSIS
 * ============================================================================
 */

/**
 * Analyser le contexte et déterminer si une summarization est nécessaire
 */
export function analyzeContext(messages: Message[], config: ContextManagerConfig = {}): ContextAnalysis {
  const maxTokens = config.maxTokens || MAX_CONTEXT_TOKENS;
  const threshold = config.threshold || SUMMARIZATION_THRESHOLD;
  const minRecentMessages = config.minRecentMessages || MIN_RECENT_MESSAGES;

  const totalTokens = estimateTotalTokens(messages);
  const usagePercent = totalTokens / maxTokens;
  const needsSummarization = usagePercent >= threshold;

  let messagesToSummarize: Message[] = [];
  let messagesToKeep: Message[] = [...messages];

  if (needsSummarization && messages.length > minRecentMessages) {
    // Identifier les messages à résumer
    const summarizableCount = Math.min(messages.length - minRecentMessages, MAX_MESSAGES_TO_SUMMARIZE);

    // Ne pas résumer les messages système existants ou les résumés
    const summarizableMessages: Message[] = [];
    const keptMessages: Message[] = [];

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      const isRecent = i >= messages.length - minRecentMessages;
      const isSummary = (msg as SummaryMessage).isSummary;
      const isSystemPrompt = msg.role === 'system' && !isSummary;

      if (isRecent || isSummary || isSystemPrompt) {
        keptMessages.push(msg);
      } else if (summarizableMessages.length < summarizableCount) {
        summarizableMessages.push(msg);
      } else {
        keptMessages.push(msg);
      }
    }

    messagesToSummarize = summarizableMessages;
    messagesToKeep = keptMessages;
  }

  return {
    totalTokens,
    messageCount: messages.length,
    usagePercent,
    needsSummarization,
    messagesToSummarize,
    messagesToKeep,
  };
}

/*
 * ============================================================================
 * SUMMARIZATION
 * ============================================================================
 */

/**
 * Prompt pour la summarization
 */
export const SUMMARIZATION_PROMPT = `Tu dois résumer la conversation précédente de manière concise et informative.

RÈGLES:
1. Préserve les informations CRITIQUES:
   - Fichiers créés/modifiés (chemins exacts)
   - Décisions importantes prises
   - Erreurs rencontrées et solutions
   - Préférences utilisateur exprimées
   - État actuel du projet

2. Supprime:
   - Les échanges de courtoisie
   - Les répétitions
   - Les détails techniques déjà résolus
   - Les messages intermédiaires sans impact

3. Format:
   - Utilise des bullet points
   - Sois factuel et concis
   - Inclus les chemins de fichiers importants
   - Mentionne les erreurs non résolues

4. Longueur: Maximum 500 mots`;

/**
 * Créer un message de résumé
 */
export function createSummaryMessage(summary: string, originalMessageCount: number): SummaryMessage {
  return {
    role: 'system',
    content: `<conversation-summary>
Ce résumé couvre les ${originalMessageCount} messages précédents de la conversation:

${summary}
</conversation-summary>`,
    isSummary: true,
    originalMessageCount,
    summarizedAt: new Date(),
  };
}

/**
 * Formater les messages pour la summarization
 */
export function formatMessagesForSummary(messages: Message[]): string {
  return messages
    .map((msg, i) => {
      const role = msg.role.toUpperCase();
      const content = msg.content.slice(0, 2000);

      // Limiter la taille
      return `[${i + 1}] ${role}: ${content}${msg.content.length > 2000 ? '...' : ''}`;
    })
    .join('\n\n');
}

/*
 * ============================================================================
 * CONTEXT MANAGEMENT
 * ============================================================================
 */

/**
 * Préparer les messages pour envoi au LLM
 * Applique la summarization si nécessaire
 */
export async function prepareMessagesForLLM(
  messages: Message[],
  summarize: (prompt: string) => Promise<string>,
  config: ContextManagerConfig = {},
): Promise<{
  messages: Message[];
  wasSummarized: boolean;
  analysis: ContextAnalysis;
}> {
  const analysis = analyzeContext(messages, config);

  if (!analysis.needsSummarization || analysis.messagesToSummarize.length === 0) {
    return {
      messages,
      wasSummarized: false,
      analysis,
    };
  }

  // Générer le résumé
  const messagesToSummarizeText = formatMessagesForSummary(analysis.messagesToSummarize);
  const summaryPrompt = `${SUMMARIZATION_PROMPT}\n\n---\n\nMESSAGES À RÉSUMER:\n\n${messagesToSummarizeText}`;

  try {
    const summary = await summarize(summaryPrompt);
    const summaryMessage = createSummaryMessage(summary, analysis.messagesToSummarize.length);

    // Insérer le résumé au début des messages conservés
    const newMessages = [summaryMessage, ...analysis.messagesToKeep];

    return {
      messages: newMessages,
      wasSummarized: true,
      analysis: analyzeContext(newMessages, config),
    };
  } catch (error) {
    // En cas d'erreur, retourner les messages originaux
    console.error('Summarization failed:', error);
    return {
      messages,
      wasSummarized: false,
      analysis,
    };
  }
}

/**
 * Vérifier si un message est un résumé
 */
export function isSummaryMessage(message: Message): message is SummaryMessage {
  return (message as SummaryMessage).isSummary === true;
}

/**
 * Obtenir les statistiques de contexte
 */
export function getContextStats(messages: Message[]): {
  totalTokens: number;
  usagePercent: number;
  messageCount: number;
  summaryCount: number;
  isNearLimit: boolean;
} {
  const totalTokens = estimateTotalTokens(messages);
  const summaryCount = messages.filter(isSummaryMessage).length;

  return {
    totalTokens,
    usagePercent: (totalTokens / MAX_CONTEXT_TOKENS) * 100,
    messageCount: messages.length,
    summaryCount,
    isNearLimit: totalTokens / MAX_CONTEXT_TOKENS >= SUMMARIZATION_THRESHOLD,
  };
}
