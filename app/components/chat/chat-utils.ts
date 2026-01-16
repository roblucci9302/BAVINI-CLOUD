/**
 * Utility functions for Chat component
 * Extracted for easier testing and reuse
 */

import type { Message } from '~/types/message';

// Mots-clés indiquant une demande de continuation
const CONTINUE_KEYWORDS = [
  'continue',
  'continuer',
  'continues',
  'poursuit',
  'poursuis',
  'reprend',
  'reprends',
  'finis',
  'termine',
  'complete',
  'go on',
  'keep going',
] as const;

// Pré-compiler les regex pour chaque mot-clé (évite recompilation à chaque appel)
const CONTINUE_KEYWORD_PATTERNS = CONTINUE_KEYWORDS.map((keyword) => ({
  keyword,
  regex: new RegExp(`(^|\\s)${keyword}($|\\s|\\.|!|\\?)`, 'i'),
}));

/**
 * Vérifie si le message est une demande de continuation
 */
export function isContinuationRequest(message: string): boolean {
  const lowerMessage = message.toLowerCase().trim();
  return CONTINUE_KEYWORD_PATTERNS.some(({ keyword, regex }) => regex.test(lowerMessage) || lowerMessage === keyword);
}

/**
 * Vérifie si le dernier message assistant semble incomplet (artifact non fermé)
 */
export function isLastResponseIncomplete(messages: Message[]): { incomplete: boolean; lastContent: string } {
  // Trouver le dernier message assistant
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];

    if (msg.role === 'assistant' && msg.content) {
      const content = msg.content;

      // Vérifier si l'artifact est ouvert mais pas fermé
      const hasOpenArtifact = content.includes('<boltArtifact');
      const hasCloseArtifact = content.includes('</boltArtifact>');

      // Vérifier si une action est ouverte mais pas fermée
      const hasOpenAction = content.includes('<boltAction');
      const lastOpenAction = content.lastIndexOf('<boltAction');
      const lastCloseAction = content.lastIndexOf('</boltAction>');

      const incomplete = (hasOpenArtifact && !hasCloseArtifact) || (hasOpenAction && lastOpenAction > lastCloseAction);

      return { incomplete, lastContent: content };
    }
  }
  return { incomplete: false, lastContent: '' };
}

/**
 * Extrait le contexte de continuation (ID artifact, etc.)
 */
export function getContinuationContext(lastContent: string): { artifactId: string | null } {
  const artifactIdMatch = lastContent.match(/<boltArtifact[^>]*id="([^"]+)"/);
  return { artifactId: artifactIdMatch ? artifactIdMatch[1] : null };
}
