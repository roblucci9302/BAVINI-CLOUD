/**
 * Codes d'erreur centralisés - BAVINI
 * Constantes avec codes et messages en français
 */

/*
 * ============================================================================
 * TYPES
 * ============================================================================
 */

export interface ErrorCodeDefinition {
  code: string;
  message: string;
  statusCode: number;
  recoverable: boolean;
}

/*
 * ============================================================================
 * ERREURS AUTHENTIFICATION (AUTH_XXX)
 * ============================================================================
 */

export const AUTH_ERRORS = {
  INVALID_TOKEN: {
    code: 'AUTH_001',
    message: 'Token invalide',
    statusCode: 401,
    recoverable: false,
  },
  EXPIRED: {
    code: 'AUTH_002',
    message: 'Session expirée',
    statusCode: 401,
    recoverable: true,
  },
  PROVIDER_ERROR: {
    code: 'AUTH_003',
    message: 'Erreur du fournisseur OAuth',
    statusCode: 502,
    recoverable: true,
  },
  INVALID_STATE: {
    code: 'AUTH_004',
    message: 'État de session invalide (CSRF)',
    statusCode: 400,
    recoverable: false,
  },
  STATE_EXPIRED: {
    code: 'AUTH_005',
    message: 'État de session expiré',
    statusCode: 400,
    recoverable: true,
  },
  MISSING_CODE: {
    code: 'AUTH_006',
    message: "Code d'autorisation manquant",
    statusCode: 400,
    recoverable: false,
  },
  TOKEN_EXCHANGE_FAILED: {
    code: 'AUTH_007',
    message: "Échec de l'échange de token",
    statusCode: 502,
    recoverable: true,
  },
  PROVIDER_NOT_CONFIGURED: {
    code: 'AUTH_008',
    message: 'Fournisseur OAuth non configuré',
    statusCode: 400,
    recoverable: false,
  },
  FORBIDDEN: {
    code: 'AUTH_009',
    message: 'Accès refusé',
    statusCode: 403,
    recoverable: false,
  },
} as const satisfies Record<string, ErrorCodeDefinition>;

/*
 * ============================================================================
 * ERREURS AGENT (AGENT_XXX)
 * ============================================================================
 */

export const AGENT_ERRORS = {
  EXECUTION_FAILED: {
    code: 'AGENT_001',
    message: "Échec d'exécution de l'agent",
    statusCode: 500,
    recoverable: true,
  },
  TIMEOUT: {
    code: 'AGENT_002',
    message: "Délai d'attente de l'agent dépassé",
    statusCode: 504,
    recoverable: true,
  },
  UNAVAILABLE: {
    code: 'AGENT_003',
    message: 'Agent non disponible',
    statusCode: 503,
    recoverable: true,
  },
  NOT_FOUND: {
    code: 'AGENT_004',
    message: 'Agent non trouvé',
    statusCode: 404,
    recoverable: false,
  },
  RESTRICTION: {
    code: 'AGENT_005',
    message: 'Action non autorisée pour cet agent',
    statusCode: 403,
    recoverable: false,
  },
  INVALID_TASK: {
    code: 'AGENT_006',
    message: 'Tâche invalide',
    statusCode: 400,
    recoverable: false,
  },
  CAPABILITY_ERROR: {
    code: 'AGENT_007',
    message: "Capacité d'agent non supportée",
    statusCode: 400,
    recoverable: false,
  },
  MAX_RETRIES: {
    code: 'AGENT_008',
    message: 'Nombre maximum de tentatives atteint',
    statusCode: 500,
    recoverable: false,
  },
} as const satisfies Record<string, ErrorCodeDefinition>;

/*
 * ============================================================================
 * ERREURS VALIDATION (VAL_XXX)
 * ============================================================================
 */

export const VALIDATION_ERRORS = {
  FAILED: {
    code: 'VAL_001',
    message: 'Données invalides',
    statusCode: 400,
    recoverable: false,
  },
  REQUIRED_FIELD: {
    code: 'VAL_002',
    message: 'Champ requis manquant',
    statusCode: 400,
    recoverable: false,
  },
  INVALID_FORMAT: {
    code: 'VAL_003',
    message: 'Format invalide',
    statusCode: 400,
    recoverable: false,
  },
  INVALID_JSON: {
    code: 'VAL_004',
    message: 'JSON invalide',
    statusCode: 400,
    recoverable: false,
  },
  OUT_OF_RANGE: {
    code: 'VAL_005',
    message: 'Valeur hors limites',
    statusCode: 400,
    recoverable: false,
  },
} as const satisfies Record<string, ErrorCodeDefinition>;

/*
 * ============================================================================
 * ERREURS API (API_XXX)
 * ============================================================================
 */

export const API_ERRORS = {
  ERROR: {
    code: 'API_001',
    message: 'Erreur serveur',
    statusCode: 500,
    recoverable: true,
  },
  NOT_FOUND: {
    code: 'API_002',
    message: 'Ressource non trouvée',
    statusCode: 404,
    recoverable: false,
  },
  METHOD_NOT_ALLOWED: {
    code: 'API_003',
    message: 'Méthode non autorisée',
    statusCode: 405,
    recoverable: false,
  },
  BAD_REQUEST: {
    code: 'API_004',
    message: 'Requête invalide',
    statusCode: 400,
    recoverable: false,
  },
  CONFLICT: {
    code: 'API_005',
    message: 'Conflit détecté',
    statusCode: 409,
    recoverable: false,
  },
  RATE_LIMIT: {
    code: 'API_006',
    message: 'Limite de requêtes atteinte',
    statusCode: 429,
    recoverable: true,
  },
} as const satisfies Record<string, ErrorCodeDefinition>;

/*
 * ============================================================================
 * ERREURS RÉSEAU (NET_XXX)
 * ============================================================================
 */

export const NETWORK_ERRORS = {
  CONNECTION_FAILED: {
    code: 'NET_001',
    message: 'Erreur de connexion réseau',
    statusCode: 503,
    recoverable: true,
  },
  TIMEOUT: {
    code: 'NET_002',
    message: "Délai d'attente dépassé",
    statusCode: 504,
    recoverable: true,
  },
  DNS_FAILED: {
    code: 'NET_003',
    message: 'Résolution DNS échouée',
    statusCode: 503,
    recoverable: true,
  },
} as const satisfies Record<string, ErrorCodeDefinition>;

/*
 * ============================================================================
 * ERREURS EXÉCUTION (EXEC_XXX)
 * ============================================================================
 */

export const EXECUTION_ERRORS = {
  FAILED: {
    code: 'EXEC_001',
    message: "Échec d'exécution du code",
    statusCode: 500,
    recoverable: false,
  },
  PYTHON_ERROR: {
    code: 'EXEC_002',
    message: "Erreur d'exécution Python",
    statusCode: 500,
    recoverable: false,
  },
  JAVASCRIPT_ERROR: {
    code: 'EXEC_003',
    message: "Erreur d'exécution JavaScript",
    statusCode: 500,
    recoverable: false,
  },
  SHELL_ERROR: {
    code: 'EXEC_004',
    message: "Erreur d'exécution shell",
    statusCode: 500,
    recoverable: false,
  },
  SANDBOX_ERROR: {
    code: 'EXEC_005',
    message: 'Erreur du bac à sable',
    statusCode: 500,
    recoverable: false,
  },
} as const satisfies Record<string, ErrorCodeDefinition>;

/*
 * ============================================================================
 * ERREURS GIT (GIT_XXX)
 * ============================================================================
 */

export const GIT_ERRORS = {
  CLONE_FAILED: {
    code: 'GIT_001',
    message: 'Échec du clonage du dépôt',
    statusCode: 500,
    recoverable: true,
  },
  PUSH_FAILED: {
    code: 'GIT_002',
    message: 'Échec du push',
    statusCode: 500,
    recoverable: true,
  },
  PULL_FAILED: {
    code: 'GIT_003',
    message: 'Échec du pull',
    statusCode: 500,
    recoverable: true,
  },
  COMMIT_FAILED: {
    code: 'GIT_004',
    message: 'Échec du commit',
    statusCode: 500,
    recoverable: false,
  },
  MERGE_CONFLICT: {
    code: 'GIT_005',
    message: 'Conflit de fusion détecté',
    statusCode: 409,
    recoverable: false,
  },
  BRANCH_NOT_FOUND: {
    code: 'GIT_006',
    message: 'Branche non trouvée',
    statusCode: 404,
    recoverable: false,
  },
  AUTH_FAILED: {
    code: 'GIT_007',
    message: 'Authentification Git échouée',
    statusCode: 401,
    recoverable: true,
  },
} as const satisfies Record<string, ErrorCodeDefinition>;

/*
 * ============================================================================
 * ERREURS FICHIERS (FILE_XXX)
 * ============================================================================
 */

export const FILE_ERRORS = {
  NOT_FOUND: {
    code: 'FILE_001',
    message: 'Fichier non trouvé',
    statusCode: 404,
    recoverable: false,
  },
  READ_FAILED: {
    code: 'FILE_002',
    message: 'Échec de lecture du fichier',
    statusCode: 500,
    recoverable: false,
  },
  WRITE_FAILED: {
    code: 'FILE_003',
    message: "Échec d'écriture du fichier",
    statusCode: 500,
    recoverable: false,
  },
  DELETE_FAILED: {
    code: 'FILE_004',
    message: 'Échec de suppression du fichier',
    statusCode: 500,
    recoverable: false,
  },
  PERMISSION_DENIED: {
    code: 'FILE_005',
    message: 'Permission refusée',
    statusCode: 403,
    recoverable: false,
  },
} as const satisfies Record<string, ErrorCodeDefinition>;

/*
 * ============================================================================
 * TOUS LES CODES
 * ============================================================================
 */

export const ErrorCodes = {
  AUTH: AUTH_ERRORS,
  AGENT: AGENT_ERRORS,
  VALIDATION: VALIDATION_ERRORS,
  API: API_ERRORS,
  NETWORK: NETWORK_ERRORS,
  EXECUTION: EXECUTION_ERRORS,
  GIT: GIT_ERRORS,
  FILE: FILE_ERRORS,
} as const;

/*
 * ============================================================================
 * UTILITAIRES
 * ============================================================================
 */

/**
 * Trouver un code d'erreur par son code string
 */
export function findErrorByCode(code: string): ErrorCodeDefinition | undefined {
  for (const category of Object.values(ErrorCodes)) {
    for (const errorDef of Object.values(category)) {
      if (errorDef.code === code) {
        return errorDef;
      }
    }
  }

  return undefined;
}

/**
 * Obtenir le message d'erreur pour un code donné
 */
export function getErrorMessage(code: string): string {
  const errorDef = findErrorByCode(code);
  return errorDef?.message ?? 'Erreur inconnue';
}

/**
 * Vérifier si un code d'erreur est récupérable
 */
export function isCodeRecoverable(code: string): boolean {
  const errorDef = findErrorByCode(code);
  return errorDef?.recoverable ?? false;
}

export default ErrorCodes;
