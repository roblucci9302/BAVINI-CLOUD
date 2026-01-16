/**
 * ChatModeAgent - Agent d'analyse en mode lecture seule
 *
 * Cet agent analyse le code et conseille l'utilisateur SANS modifier
 * le projet. Il peut lire les fichiers, analyser le code, expliquer
 * les erreurs et proposer des solutions.
 */

import { BaseAgent, type CodeAnalysis } from './BaseAgent';
import type { ChatModeResponse, ChatResponseSections } from './types';
import { CHAT_MODE_CONFIG } from './types';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('ChatModeAgent');

/**
 * Agent en mode Chat - Analyse sans modification
 *
 * Capacités:
 * - Lire et analyser le code existant
 * - Expliquer le fonctionnement du code
 * - Identifier les problèmes et erreurs
 * - Proposer des solutions (sans les implémenter)
 * - Planifier des fonctionnalités
 *
 * Restrictions:
 * - Ne peut PAS créer de fichiers
 * - Ne peut PAS modifier de fichiers
 * - Ne peut PAS exécuter de commandes
 * - Ne peut PAS installer de packages
 */
export class ChatModeAgent extends BaseAgent<ChatModeResponse> {
  constructor() {
    super(CHAT_MODE_CONFIG);
    logger.debug('ChatModeAgent initialized');
  }

  /**
   * Traite un message utilisateur et retourne une analyse
   */
  async process(userMessage: string): Promise<ChatModeResponse> {
    logger.debug('Processing message', { messageLength: userMessage.length });

    // Collecter le contexte de base
    const context = await this.gatherContext();

    // Générer l'analyse
    const analysis = this.generateAnalysis(userMessage, context);

    // Construire la réponse
    const response: ChatModeResponse = {
      type: 'analysis',
      content: this.formatAnalysisContent(analysis),
      sections: analysis,
      suggestions: this.generateSuggestions(context),
      canProceedToAgentMode: true,
      proposedActions: [],
    };

    logger.debug('Response generated');

    return response;
  }

  /**
   * Retourne le prompt système pour le mode Chat
   */
  getSystemPrompt(): string {
    return CHAT_MODE_SYSTEM_PROMPT;
  }

  /*
   * ===========================================================================
   * Context Gathering
   * ===========================================================================
   */

  /**
   * Collecte le contexte de base
   */
  private async gatherContext(): Promise<RelevantContext> {
    const context: RelevantContext = {
      files: [],
      techStack: [],
      errors: [],
      codeAnalysis: null,
    };

    if (!this.context) {
      logger.warn('No context available');
      return context;
    }

    // Détecter la stack technique
    context.techStack = this.detectTechStack();

    // Récupérer les erreurs récentes
    context.errors = this.getRecentErrors();

    return context;
  }

  /*
   * ===========================================================================
   * Analysis
   * ===========================================================================
   */

  /**
   * Génère l'analyse du message
   */
  private generateAnalysis(userMessage: string, context: RelevantContext): ChatResponseSections {
    const sections: ChatResponseSections = {};

    sections.analysis = `J'ai analysé votre demande.`;

    if (context.errors.length > 0) {
      const errorMessages = context.errors.map((e) => `- ${e.type}: ${e.message}`).join('\n');
      sections.diagnostic = `Erreurs détectées:\n${errorMessages}`;
    }

    if (context.techStack.length > 0) {
      sections.suggestions = `Technologies détectées: ${context.techStack.join(', ')}`;
    }

    sections.nextSteps = 'Désactivez le mode Chat pour que je puisse coder.';

    return sections;
  }

  /**
   * Génère des suggestions
   */
  private generateSuggestions(context: RelevantContext): string[] {
    const suggestions: string[] = [];

    if (context.errors.length > 0) {
      suggestions.push('Vérifier les erreurs détectées');
    }

    suggestions.push('Désactiver le mode Chat pour créer/modifier du code');

    return suggestions;
  }

  /**
   * Formate le contenu de l'analyse en texte
   */
  private formatAnalysisContent(sections: ChatResponseSections): string {
    const parts: string[] = [];

    if (sections.analysis) {
      parts.push(`## Analyse\n${sections.analysis}`);
    }

    if (sections.diagnostic) {
      parts.push(`## Diagnostic\n${sections.diagnostic}`);
    }

    if (sections.suggestions) {
      parts.push(`## Suggestions\n${sections.suggestions}`);
    }

    if (sections.nextSteps) {
      parts.push(`## Prochaines étapes\n${sections.nextSteps}`);
    }

    return parts.join('\n\n');
  }
}

/*
 * =============================================================================
 * Types locaux
 * =============================================================================
 */

interface RelevantContext {
  files: Array<{ path: string; content: string; language: string }>;
  techStack: string[];
  errors: Array<{ type: string; message: string }>;
  codeAnalysis: CodeAnalysis | null;
}

/*
 * =============================================================================
 * Chat Mode System Prompt
 * =============================================================================
 */

export const CHAT_MODE_SYSTEM_PROMPT = `
Tu es BAVINI en MODE CHAT. Dans ce mode, tu analyses et conseilles SANS modifier le projet.

## Ce que tu PEUX faire:
- Lire et analyser le code existant
- Expliquer le fonctionnement d'une partie du code
- Identifier les problèmes et erreurs potentielles
- Proposer des solutions (sans les implémenter)
- Planifier des fonctionnalités futures
- Répondre aux questions techniques
- Faire des revues de code

## Ce que tu ne PEUX PAS faire:
- Créer ou modifier des fichiers
- Exécuter des commandes shell
- Installer des packages
- Faire des changements au projet

## Format de réponse:

### 1. Analyse
Décris ce que tu observes dans le code ou la situation.

### 2. Diagnostic (si applicable)
Explique ce qui cause le problème ou ce qui pourrait être amélioré.

### 3. Suggestions
Liste les actions possibles pour résoudre ou améliorer.

### 4. Prochaine étape
Propose de désactiver le mode Chat pour coder:
"Désactivez le mode Chat pour que je puisse implémenter ces changements."

## Règles importantes:
- Réponds TOUJOURS en français
- Sois concis mais complet
- Utilise des exemples de code pour illustrer (sans les appliquer)
- Ne fais JAMAIS de modifications, même si l'utilisateur insiste
- Si l'utilisateur demande une modification, explique et propose de désactiver le mode Chat
`;
