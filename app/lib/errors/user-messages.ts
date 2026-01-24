/**
 * Messages d'erreur user-friendly pour BAVINI
 *
 * Ce module fournit des messages clairs et actionnables pour les utilisateurs,
 * avec des suggestions de résolution quand c'est possible.
 */

export interface UserFriendlyError {
  /** Titre court de l'erreur */
  title: string;
  /** Description détaillée */
  description: string;
  /** Suggestion d'action pour l'utilisateur */
  suggestion?: string;
  /** L'erreur est-elle récupérable automatiquement ? */
  recoverable: boolean;
  /** Temps d'attente suggéré en secondes (pour rate limit) */
  retryAfter?: number;
}

/**
 * Codes d'erreur connus et leurs messages user-friendly
 */
const ERROR_MESSAGES: Record<string, UserFriendlyError> = {
  // ============================================================================
  // Erreurs d'authentification
  // ============================================================================
  AUTH_001: {
    title: 'Clé API invalide',
    description: 'La clé API Anthropic n\'est pas valide ou a expiré.',
    suggestion: 'Vérifiez votre clé API dans les paramètres ou contactez l\'administrateur.',
    recoverable: false,
  },
  AUTH_002: {
    title: 'Session expirée',
    description: 'Votre session a expiré.',
    suggestion: 'Rechargez la page pour vous reconnecter.',
    recoverable: true,
  },
  AUTH_003: {
    title: 'Accès refusé',
    description: 'Vous n\'avez pas les permissions nécessaires.',
    suggestion: 'Contactez l\'administrateur si vous pensez que c\'est une erreur.',
    recoverable: false,
  },

  // ============================================================================
  // Erreurs de rate limiting
  // ============================================================================
  RATE_LIMIT: {
    title: 'Trop de requêtes',
    description: 'Vous avez atteint la limite de requêtes.',
    suggestion: 'Attendez quelques secondes avant de réessayer.',
    recoverable: true,
    retryAfter: 30,
  },
  API_006: {
    title: 'Limite atteinte',
    description: 'Trop de requêtes en peu de temps.',
    suggestion: 'Patientez 30 secondes puis réessayez.',
    recoverable: true,
    retryAfter: 30,
  },

  // ============================================================================
  // Erreurs réseau
  // ============================================================================
  NET_001: {
    title: 'Problème de connexion',
    description: 'Impossible de se connecter au serveur.',
    suggestion: 'Vérifiez votre connexion internet et réessayez.',
    recoverable: true,
  },
  NET_002: {
    title: 'Délai dépassé',
    description: 'Le serveur met trop de temps à répondre.',
    suggestion: 'Réessayez dans quelques instants. Si le problème persiste, simplifiez votre demande.',
    recoverable: true,
  },
  NETWORK_ERROR: {
    title: 'Erreur réseau',
    description: 'La connexion au serveur a échoué.',
    suggestion: 'Vérifiez votre connexion internet et réessayez.',
    recoverable: true,
  },

  // ============================================================================
  // Erreurs de l'agent IA
  // ============================================================================
  AGENT_001: {
    title: 'Erreur de génération',
    description: 'L\'IA n\'a pas pu générer le code demandé.',
    suggestion: 'Reformulez votre demande ou simplifiez-la.',
    recoverable: true,
  },
  AGENT_002: {
    title: 'Génération trop longue',
    description: 'La génération a pris trop de temps.',
    suggestion: 'Essayez avec une demande plus simple ou divisez-la en étapes.',
    recoverable: true,
  },
  AGENT_003: {
    title: 'Service temporairement indisponible',
    description: 'Le service de génération est momentanément surchargé.',
    suggestion: 'Réessayez dans quelques secondes.',
    recoverable: true,
  },

  // ============================================================================
  // Erreurs de validation
  // ============================================================================
  VAL_001: {
    title: 'Données invalides',
    description: 'Les données envoyées ne sont pas valides.',
    suggestion: 'Vérifiez votre message et réessayez.',
    recoverable: false,
  },
  VAL_002: {
    title: 'Champ manquant',
    description: 'Un champ requis est manquant.',
    suggestion: 'Complétez tous les champs obligatoires.',
    recoverable: false,
  },
  PAYLOAD_TOO_LARGE: {
    title: 'Message trop long',
    description: 'Votre message dépasse la taille maximale autorisée.',
    suggestion: 'Raccourcissez votre message ou envoyez-le en plusieurs parties.',
    recoverable: false,
  },

  // ============================================================================
  // Erreurs de build/preview
  // ============================================================================
  BUILD_ERROR: {
    title: 'Erreur de compilation',
    description: 'Le code généré contient des erreurs.',
    suggestion: 'Demandez à BAVINI de corriger les erreurs : "Corrige les erreurs de compilation"',
    recoverable: true,
  },
  PREVIEW_ERROR: {
    title: 'Erreur de preview',
    description: 'Impossible d\'afficher l\'aperçu.',
    suggestion: 'Rechargez la page ou demandez une correction.',
    recoverable: true,
  },

  // ============================================================================
  // Erreurs génériques
  // ============================================================================
  INTERNAL_ERROR: {
    title: 'Erreur interne',
    description: 'Une erreur inattendue s\'est produite.',
    suggestion: 'Rechargez la page. Si le problème persiste, contactez le support.',
    recoverable: false,
  },
  UNKNOWN: {
    title: 'Erreur',
    description: 'Une erreur s\'est produite.',
    suggestion: 'Réessayez. Si le problème persiste, rechargez la page.',
    recoverable: true,
  },
};

/**
 * Obtenir un message user-friendly à partir d'un code d'erreur
 */
export function getUserFriendlyError(
  code: string,
  fallbackMessage?: string,
  retryAfter?: number
): UserFriendlyError {
  const error = ERROR_MESSAGES[code] || ERROR_MESSAGES.UNKNOWN;

  return {
    ...error,
    // Utiliser le message de fallback si fourni et pas de description spécifique
    description: fallbackMessage && code === 'UNKNOWN' ? fallbackMessage : error.description,
    // Utiliser le retryAfter fourni si disponible
    retryAfter: retryAfter ?? error.retryAfter,
  };
}

/**
 * Obtenir un message user-friendly à partir d'une réponse HTTP
 */
export function getUserFriendlyErrorFromStatus(
  status: number,
  message?: string,
  retryAfter?: number
): UserFriendlyError {
  switch (status) {
    case 400:
      return getUserFriendlyError('VAL_001', message);
    case 401:
      return getUserFriendlyError('AUTH_001', message);
    case 403:
      return getUserFriendlyError('AUTH_003', message);
    case 408:
    case 504:
      return getUserFriendlyError('NET_002', message);
    case 413:
      return getUserFriendlyError('PAYLOAD_TOO_LARGE', message);
    case 429:
      return getUserFriendlyError('RATE_LIMIT', message, retryAfter);
    case 500:
      return getUserFriendlyError('INTERNAL_ERROR', message);
    case 502:
    case 503:
      return getUserFriendlyError('AGENT_003', message);
    default:
      return getUserFriendlyError('UNKNOWN', message);
  }
}

/**
 * Formater un message d'erreur pour affichage dans un toast
 */
export function formatErrorForToast(error: UserFriendlyError): string {
  if (error.suggestion) {
    return `${error.description} ${error.suggestion}`;
  }
  return error.description;
}

/**
 * Formater un message d'erreur complet avec titre
 */
export function formatErrorFull(error: UserFriendlyError): string {
  let message = `${error.title}: ${error.description}`;
  if (error.suggestion) {
    message += `\n\n💡 ${error.suggestion}`;
  }
  if (error.retryAfter) {
    message += `\n⏱️ Réessayez dans ${error.retryAfter} secondes.`;
  }
  return message;
}

/**
 * Détecter le type d'erreur à partir d'un message d'erreur
 */
export function detectErrorType(error: unknown): string {
  if (!error) return 'UNKNOWN';

  const message = error instanceof Error ? error.message : String(error);
  const lowerMessage = message.toLowerCase();

  // Détection par mots-clés
  if (lowerMessage.includes('api key') || lowerMessage.includes('unauthorized') || lowerMessage.includes('401')) {
    return 'AUTH_001';
  }
  if (lowerMessage.includes('rate limit') || lowerMessage.includes('too many requests') || lowerMessage.includes('429')) {
    return 'RATE_LIMIT';
  }
  if (lowerMessage.includes('timeout') || lowerMessage.includes('timed out')) {
    return 'NET_002';
  }
  if (lowerMessage.includes('network') || lowerMessage.includes('fetch') || lowerMessage.includes('connection')) {
    return 'NET_001';
  }
  if (lowerMessage.includes('payload') || lowerMessage.includes('too large') || lowerMessage.includes('413')) {
    return 'PAYLOAD_TOO_LARGE';
  }
  if (lowerMessage.includes('build') || lowerMessage.includes('compile') || lowerMessage.includes('syntax')) {
    return 'BUILD_ERROR';
  }

  return 'UNKNOWN';
}

/**
 * Créer un message d'erreur user-friendly à partir de n'importe quelle erreur
 */
export function createUserFriendlyError(error: unknown): UserFriendlyError {
  // Si c'est déjà un objet avec un code
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code: string }).code;
    const message = 'message' in error ? String((error as { message: string }).message) : undefined;
    const retryAfter = 'retryAfter' in error ? Number((error as { retryAfter: number }).retryAfter) : undefined;
    return getUserFriendlyError(code, message, retryAfter);
  }

  // Sinon, détecter le type d'erreur
  const errorType = detectErrorType(error);
  const message = error instanceof Error ? error.message : String(error);
  return getUserFriendlyError(errorType, message);
}
